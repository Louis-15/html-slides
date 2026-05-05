/* ===========================================
   EDITOR-PERSISTENCE.JS
   HTML-Slides 编辑器 — 持久化层
   依赖：editor-utils.js (window._editorUtils, window.EditorHooks)
   运行时依赖：window.BoxManager (loadCustomBoxes 中调用)
   暴露：window.PersistenceLayer
   =========================================== */

(function () {
    'use strict';

    var utils = window._editorUtils;
    var storageKey = utils.storageKey;
    var getAllSlides = utils.getAllSlides;
    var EditorHooks = window.EditorHooks;

    // === 保存到 HTML 文件：File System Access 句柄 ===
    var _htmlFileHandle = null;

    // 通过 IndexedDB 持久化文件句柄，刷新后自动恢复，无需重新选文件
    // ★ 按文件路径隔离键名，避免不同课件文件共用同一个句柄导致相互覆盖
    var _handleDBKey = 'h:' + utils.storageKey('');

    (function _restoreHandleFromDB() {
        if (!window.indexedDB) return;
        try {
            var req = indexedDB.open('hslides-fs-handle', 1);
            req.onupgradeneeded = function () { req.result.createObjectStore('handles'); };
            req.onsuccess = function () {
                var tx = req.result.transaction('handles', 'readonly');
                var getReq = tx.objectStore('handles').get(_handleDBKey);
                getReq.onsuccess = function () {
                    if (getReq.result) _htmlFileHandle = getReq.result;
                };
            };
        } catch (e) {}
    })();

    function _persistHandleInDB(handle) {
        if (!window.indexedDB) return;
        try {
            var req = indexedDB.open('hslides-fs-handle', 1);
            req.onsuccess = function () {
                var tx = req.result.transaction('handles', 'readwrite');
                tx.objectStore('handles').put(handle, _handleDBKey);
            };
        } catch (e) {}
    }

    /**
     * 清洗要存入 localStorage 的 HTML 字符串，剥离嵌入在 [data-edit-id]
     * 文本片段内的运行时瞬态标记（fragment 显隐状态 + 答题交互DOM重构）。
     * 组件的交互状态（selected/flipped/step-active 等）不在 [data-edit-id]
     * 内部，因此无需在此处理——基线快照方案从架构上保证了它们不会被写入 HTML。
     */
    function stripTransientEditableHTML(html) {
        if (!html) return html;
        if (html.indexOf('qa-fragment-visible') === -1 &&
            html.indexOf('data-fragment-manual-reveal') === -1 &&
            html.indexOf('qa-matching-passage-slot') === -1 &&
            html.indexOf('show-correct-answer') === -1 &&
            html.indexOf('data-qa-matching-click-bound') === -1 &&
            html.indexOf('qa-blank-value') === -1 &&
            html.indexOf('qa-blank-answer') === -1) {
            return html;
        }

        var temp = document.createElement('div');
        temp.innerHTML = html;
        temp.querySelectorAll('.qa-fragment-visible').forEach(function (el) {
            el.classList.remove('qa-fragment-visible');
        });
        temp.querySelectorAll('[data-fragment-manual-reveal]').forEach(function (el) {
            el.removeAttribute('data-fragment-manual-reveal');
        });
        // 答题交互瞬态：七选五拖拽匹配状态
        temp.querySelectorAll('.qa-blank-slot').forEach(function (el) {
            el.classList.remove('qa-matching-passage-slot', 'show-correct-answer');
            el.removeAttribute('data-qa-matching-click-bound');
        });
        // 答题交互瞬态：runtime 注入的 qa-blank-value 元素在源文件中不存在，物理删除
        temp.querySelectorAll('.qa-blank-value').forEach(function (el) {
            el.remove();
        });
        // 答题交互瞬态：runtime 在 renderMatchingPassageSlot 中清空了 qa-blank-user 的 ___ 文本
        // （line 2701: userSpan.textContent = ''），需恢复源码中的 "___<sup>36</sup>" 结构
        temp.querySelectorAll('.qa-blank-user').forEach(function (el) {
            var sup = el.querySelector('sup');
            if (sup) {
                // 用 outerHTML 保留 sup 的完整属性，前面补回 ___
                var supHTML = sup.outerHTML;
                el.innerHTML = '___' + supHTML;
            }
        });
        // 答题交互瞬态：重置 qa-blank-answer 到源码原始状态
        temp.querySelectorAll('.qa-blank-answer').forEach(function (el) {
            if (el.style.display === 'none') el.style.display = '';
            // 清除残留的 style 属性（如果只剩空串）
            if (el.getAttribute('style') === '') el.removeAttribute('style');
        });
        // 答题交互瞬态：正确/错误标记
        temp.querySelectorAll('.qa-option').forEach(function (el) {
            el.classList.remove('selected', 'result-correct', 'result-incorrect');
            el.removeAttribute('data-question-submitted');
        });
        temp.querySelectorAll('.qa-option .qa-status-dot').forEach(function (el) {
            el.className = 'qa-status-dot';
        });
        return temp.innerHTML;
    }

    /**
     * 读取缓存时优先命中新 key；如果只存在旧版“按标题隔离”的 key，
     * 则自动迁移到新的“按路径隔离”命名空间，避免同标题课件互串。
     */
    function readStoredValue(suffix) {
        try {
            return localStorage.getItem(storageKey(suffix));
        } catch (e) {
            return null;
        }
    }

    // ========================================
    // 保存到 HTML 文件（存档/读档）
    // ========================================

    function _getHTMLFilename() {
        var path = decodeURIComponent(location.pathname);
        var name = path.substring(path.lastIndexOf('/') + 1);
        return name || 'courseware.html';
    }

    function _loadCleanHTMLFromDisk() {
        // 用 XHR 重新从磁盘读取 HTML 源文件（干净的原始版本）
        return new Promise(function (resolve) {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', location.href, true);
            xhr.onload = function () {
                if (xhr.status === 200 || xhr.status === 0) {
                    resolve(xhr.responseText);
                } else {
                    resolve(null);
                }
            };
            xhr.onerror = function () { resolve(null); };
            try { xhr.send(); } catch (e) { resolve(null); }
        });
    }

    /**
     * 清洗整个 DOM 克隆中的全部交互组件瞬态标记。
     * 这些 class/attribute/element 都是运行时注入的，不应固化到 HTML 源码里。
     * 与 stripTransientEditableHTML 不同：后者清洗 HTML 字符串片段，
     * 此函数直接操作 DOM 节点，覆盖非 [data-edit-id] 区域。
     */
    function _stripAllTransientStates(clone) {
        // 批注 fragment 瞬态
        clone.querySelectorAll('.qa-fragment-visible').forEach(function (el) {
            el.classList.remove('qa-fragment-visible');
        });
        clone.querySelectorAll('[data-fragment-manual-reveal]').forEach(function (el) {
            el.removeAttribute('data-fragment-manual-reveal');
        });
        // 例题组件交互瞬态
        clone.querySelectorAll('.selected').forEach(function (el) {
            el.classList.remove('selected');
        });
        clone.querySelectorAll('.result-correct,.result-incorrect').forEach(function (el) {
            el.classList.remove('result-correct', 'result-incorrect');
        });
        clone.querySelectorAll('.is-submitted,.is-analysis-open').forEach(function (el) {
            el.classList.remove('is-submitted', 'is-analysis-open');
        });
        clone.querySelectorAll('.qa-result-mark').forEach(function (el) {
            el.remove();
        });
        clone.querySelectorAll('[data-question-active]').forEach(function (el) {
            el.removeAttribute('data-question-active');
        });
        clone.querySelectorAll('[data-question-submitted]').forEach(function (el) {
            el.removeAttribute('data-question-submitted');
        });
        // 例题组件导航瞬态
        clone.querySelectorAll('[aria-hidden]').forEach(function (el) {
            el.removeAttribute('aria-hidden');
        });
        clone.querySelectorAll('.is-active').forEach(function (el) {
            el.classList.remove('is-active');
        });
    }

    /**
     * 生成待保存的 HTML 内容。
     * ★ 架构：白名单模式 —— 只保存 [data-edit-id] 元素的内容+格式。
     *
     * 优先使用页面加载时捕获的干净 DOM 基线快照（__BASELINE__），
     * 它是在所有运行时 JS 执行前克隆的原始 HTML 结构，不含任何
     * 组件交互状态。在此基线上只覆盖 localStorage 中的编辑内容，
     * 天然保证不会把任何组件状态写入 HTML 文件。
     *
     * 如果没有基线快照（旧课件），则回退到克隆当前 DOM + 清洗的方案。
     */
    /**
     * outerHTML 序列化产物清理。
     * clone.outerHTML 在不同浏览器中有不同的序列化行为——
     * 布尔属性变成空串、URL 中的 & 被 HTML 编码、标签间换行被吞等。
     * 这些差异对功能无影响，但会让 git diff 显示大量无关改动。
     */
    function _normalizeSerializedHTML(html) {
        return html
            // 布尔属性：data-scrollable="" → data-scrollable
            .replace(/\bdata-scrollable=""/g, 'data-scrollable')
            // URL 中 &amp; → &
            .replace(/((?:href|src)="[^"]*?)&amp;/g, '$1&')
            // 连续 script 标签间恢复换行
            .replace(/<\/script><script/g, '</script>\n<script')
            // head 到 body 恢复换行
            .replace(/<\/head><body/g, '</head>\n<body')
            // 确保文件末尾有换行
            .replace(/<\/html>$/, '</html>\n');
    }

    function _prepareCleanHTMLFallback() {
        // === 路径 A：有基线快照（新课件）—— 白名单模式 ===
        if (window.__BASELINE__) {
            var clone = window.__BASELINE__.cloneNode(true);

            // 只把用户编辑过的 [data-edit-id] 内容从 localStorage 盖到基线上
            clone.querySelectorAll('[data-edit-id]').forEach(function (target) {
                var id = target.getAttribute('data-edit-id');
                var saved = readStoredValue('e:' + id);
                if (saved !== null) target.innerHTML = stripTransientEditableHTML(saved);
            });

            // 基线捕获时外部 <script> 标签尚未解析入 DOM，需从实时 DOM 补回
            // ★ 用 getAttribute('src') 保留原始相对路径，避免 outerHTML 序列化成绝对 URL
            var cloneBody = clone.querySelector('body');
            document.querySelectorAll('body script[src]').forEach(function (liveScript) {
                var ns = document.createElement('script');
                ns.src = liveScript.getAttribute('src') || liveScript.src;
                if (cloneBody) cloneBody.appendChild(ns);
            });

            clone.querySelectorAll('.slide').forEach(function (s, i) { s.classList.toggle('active', i === 0); });
            if (EditorHooks) EditorHooks.fire('onExportClean', clone);
            return _normalizeSerializedHTML('<!DOCTYPE html>\n' + clone.outerHTML);
        }

        // === 路径 B：无基线快照（旧课件）—— 回退：克隆当前 DOM 并清洗 ===
        var clone2 = document.documentElement.cloneNode(true);

        // 删除编辑器注入的全部 UI 节点
        clone2.querySelectorAll('.edit-hotzone, .edit-toggle, .rich-toolbar, #slidePager').forEach(function (el) {
            el.remove();
        });

        // 清除 chrome 运行时状态
        var htmlEl2 = clone2.querySelector('html');
        if (htmlEl2 && htmlEl2.getAttribute('class') === '') htmlEl2.removeAttribute('class');
        var bodyEl2 = clone2.querySelector('body');
        if (bodyEl2) {
            if (bodyEl2.getAttribute('class') === '') bodyEl2.removeAttribute('class');
            bodyEl2.classList.remove('editor-mode', 'doodle-mode');
        }
        var progressEl2 = clone2.querySelector('#progress');
        if (progressEl2) progressEl2.removeAttribute('style');
        var particlesEl2 = clone2.querySelector('#particles');
        if (particlesEl2) particlesEl2.innerHTML = '';
        var counterEl2 = clone2.querySelector('#counter');
        if (counterEl2) counterEl2.textContent = '';
        var nd2 = clone2.querySelector('.nav-dots'); if (nd2) nd2.innerHTML = '';
        var sn2 = clone2.querySelector('#slideNav'); if (sn2) sn2.innerHTML = '';
        var doodleStyle2 = clone2.querySelector('#doodle-runtime-styles');
        if (doodleStyle2) doodleStyle2.remove();

        // 清除涂鸦 UI
        var dt2 = clone2.querySelector('#doodleToolbar'); if (dt2) dt2.remove();
        var db2 = clone2.querySelector('#doodleToggleBtn'); if (db2) db2.remove();
        var dp2 = clone2.querySelector('#doodleLaserPointer'); if (dp2) dp2.remove();

        // 移除浮动控件及注解工具栏
        clone2.querySelectorAll('.floating-controls, .overlay-ctrl, .box-controls, .rs-handle').forEach(function (el) { el.remove(); });
        clone2.querySelectorAll('.qa-annotation-toolbar, .qa-note-fragment-toolbar, .page-richtext-fragment-toolbar').forEach(function (el) { el.remove(); });

        // 剥离 native-edit-wrap 壳
        clone2.querySelectorAll('.native-edit-wrap').forEach(function (wrap) {
            while (wrap.firstChild) wrap.parentNode.insertBefore(wrap.firstChild, wrap);
            wrap.remove();
        });

        // 清除交互组件瞬态（旧课件没有基线，必须用黑名单清洗）
        _stripAllTransientStates(clone2);

        // 用 localStorage 值覆盖 [data-edit-id]
        clone2.querySelectorAll('[data-edit-id]').forEach(function (target) {
            var id = target.getAttribute('data-edit-id');
            var saved = readStoredValue('e:' + id);
            if (saved !== null) target.innerHTML = stripTransientEditableHTML(saved);
        });

        clone2.querySelectorAll('.slide').forEach(function (s, i) { s.classList.toggle('active', i === 0); });
        if (EditorHooks) EditorHooks.fire('onExportClean', clone2);
        return _normalizeSerializedHTML('<!DOCTYPE html>\n' + clone2.outerHTML);
    }

    function _prepareCleanHTMLFromSource(cleanHTML) {
        // 从干净的磁盘 HTML 为底本，只把 localStorage 里 [data-edit-id] 的内容盖上去。
        // 不再从实时 DOM 复制 el.innerHTML —— 实时 DOM 可能包含组件运行时注入的瞬态标记。
        var div = document.createElement('div');
        div.innerHTML = cleanHTML.replace(/^<!DOCTYPE[^>]*>\s*/i, '');

        div.querySelectorAll('[data-edit-id]').forEach(function (target) {
            var id = target.getAttribute('data-edit-id');
            var saved = readStoredValue('e:' + id);
            if (saved !== null) target.innerHTML = stripTransientEditableHTML(saved);
        });

        div.querySelectorAll('.slide').forEach(function (s, i) { s.classList.toggle('active', i === 0); });
        if (EditorHooks) EditorHooks.fire('onExportClean', div);
        return _normalizeSerializedHTML('<!DOCTYPE html>\n' + div.innerHTML);
    }

    function _requestHTMLFileAccess() {
        if (!window.showSaveFilePicker) {
            console.warn('[PersistenceLayer] 浏览器不支持 File System Access API');
            return Promise.resolve(false);
        }
        return window.showSaveFilePicker({
            suggestedName: _getHTMLFilename(),
            types: [{
                description: 'HTML 课件',
                accept: { 'text/html': ['.html'] }
            }]
        }).then(function (handle) {
            _htmlFileHandle = handle;
            _persistHandleInDB(handle);
            return true;
        }).catch(function (e) {
            if (e.name !== 'AbortError') console.warn('[PersistenceLayer] 选择文件失败:', e);
            return false;
        });
    }

    function _writeHTMLToFile(html) {
        if (!_htmlFileHandle) return Promise.resolve(false);

        return _htmlFileHandle.createWritable().then(function (writable) {
            var blob = new Blob([html], { type: 'text/html' });
            return writable.write(blob).then(function () {
                writable.close();
                return true;
            });
        }).catch(function (err) {
            console.warn('[PersistenceLayer] 写入文件失败:', err);
            return false;
        });
    }

    function _doWrite(result) {
        if (_htmlFileHandle) {
            return _writeHTMLToFile(result).then(function (writeOk) {
                if (writeOk) return true;
                _htmlFileHandle = null;
                return _requestHTMLFileAccess().then(function (ok) {
                    return ok ? _writeHTMLToFile(result) : false;
                });
            });
        }
        return _requestHTMLFileAccess().then(function (ok) {
            return ok ? _writeHTMLToFile(result) : false;
        });
    }

    var PersistenceLayer = {
        /** 供外部模块调用的 HTML 清洗函数（对应内部 stripTransientEditableHTML） */
        _stripHTML: function (html) { return stripTransientEditableHTML(html); },

        /** 保存单个可编辑元素的内容 */
        saveElement: function (el) {
            var id = el.getAttribute('data-edit-id');
            if (!id) return;
            try { localStorage.setItem(storageKey('e:' + id), stripTransientEditableHTML(el.innerHTML)); } catch (e) { }
        },

        /** 从 localStorage 恢复所有可编辑元素的内容 */
        restoreAllElements: function () {
            document.querySelectorAll('[data-edit-id]').forEach(function (el) {
                var id = el.getAttribute('data-edit-id');
                try {
                    var saved = readStoredValue('e:' + id);
                    if (saved !== null) el.innerHTML = stripTransientEditableHTML(saved);
                } catch (e) { }
            });
        },

        /** 保存所有自定义图元的位置和内容/属性 */
        saveCustomBoxes: function () {
            var slides = getAllSlides();
            var boxes = [];
            document.querySelectorAll('.editable-wrap.custom-box').forEach(function (wrap) {
                var slide = wrap.closest('.slide');
                var slideIndex = Array.from(slides).indexOf(slide);
                var img = wrap.querySelector('img.slide-image');
                if (img) {
                    var id = img.getAttribute('data-edit-id');
                    if (!id) return;
                    boxes.push({
                        si: slideIndex, id: id, type: 'image',
                        l: wrap.style.left, t: wrap.style.top,
                        w: wrap.style.width, h: wrap.style.height,
                        c: img.getAttribute('src')
                    });
                } else {
                    var editArea = wrap.querySelector('[data-edit-id]');
                    if (!editArea) return;
                    boxes.push({
                        si: slideIndex, id: editArea.getAttribute('data-edit-id'), type: 'text',
                        l: wrap.style.left, t: wrap.style.top,
                        w: wrap.style.width, h: wrap.style.height,
                        c: editArea.innerHTML
                    });
                }
            });
            try { localStorage.setItem(storageKey('boxes'), JSON.stringify(boxes)); } catch (e) { }
        },

        /** 从 localStorage 加载自定义图元 */
        loadCustomBoxes: function () {
            try {
                var saved = readStoredValue('boxes');
                if (!saved) return;
                var boxes = JSON.parse(saved);
                var slides = getAllSlides();
                boxes.forEach(function (db) {
                    if (document.querySelector('[data-edit-id="' + db.id + '"]')) return;
                    var ts = slides[db.si];
                    if (ts) {
                        if (db.type === 'image') {
                            window.BoxManager.createImageBox(db.id, db.l, db.t, db.w, db.h, db.c, ts);
                        } else {
                            window.BoxManager.createTextBox(db.id, db.l, db.t, db.c, ts);
                        }
                    }
                });
            } catch (e) { }
        },

        /** 保存原生元素的位移和隐藏状态 */
        saveNativeMods: function () {
            var mods = {};
            document.querySelectorAll('[data-edit-id]').forEach(function (el) {
                if (el.closest('.editable-wrap.custom-box')) return;
                var id = el.getAttribute('data-edit-id');
                var tx = el.style.transform;
                var disp = el.style.display;
                if (tx || disp === 'none') {
                    mods[id] = { t: tx || '', d: disp === 'none' };
                }
            });
            try { localStorage.setItem(storageKey('nmods'), JSON.stringify(mods)); } catch (e) { }
        },

        /** 恢复原生元素的位移和隐藏状态 */
        restoreNativeMods: function () {
            try {
                var saved = readStoredValue('nmods');
                if (!saved) return;
                var mods = JSON.parse(saved);
                Object.keys(mods).forEach(function (id) {
                    var el = document.querySelector('[data-edit-id="' + id + '"]');
                    if (el && !el.closest('.editable-wrap.custom-box')) {
                        if (mods[id].d) el.style.display = 'none';
                        if (mods[id].t) el.style.transform = mods[id].t;
                    }
                });
            } catch (e) { }
        },

        /** 从 DOM 状态同步所有缓存 */
        syncFromDOM: function (slideEl) {
            if (!slideEl) return;
            slideEl.querySelectorAll('[data-edit-id]').forEach(function (el) {
                PersistenceLayer.saveElement(el);
            });
            PersistenceLayer.saveCustomBoxes();
            PersistenceLayer.saveNativeMods();
        },

        /** Ctrl+S 纯净导出 */
        exportCleanHTML: function () {
            var clone = document.documentElement.cloneNode(true);

            // 【架构级升维：便携式捆绑包模式 (Portable Bundle)】
            // 强制将 HTML 里所有的 CSS、JS 和图片链接重写为相对当前目录的 './assets/' 引用
            clone.querySelectorAll('link[rel="stylesheet"], script[src], img[src]').forEach(function(el) {
                if (el.hasAttribute('href') && el.getAttribute('href').indexOf('assets/') !== -1) {
                    var h = el.getAttribute('href');
                    el.setAttribute('href', './assets/' + h.split('assets/')[1]);
                }
                if (el.hasAttribute('src') && el.getAttribute('src').indexOf('assets/') !== -1) {
                    var s = el.getAttribute('src');
                    el.setAttribute('src', './assets/' + s.split('assets/')[1]);
                }
            });

            // 【终极降级安全网 (Graceful Degradation)】
            // 当没有附带 assets 文件夹时，强制注入底层样式将所有编辑控件静默
            var safetyStyle = clone.ownerDocument ? clone.ownerDocument.createElement('style') : document.createElement('style');
            safetyStyle.textContent =
                '/* Portable Safety Net */\n' +
                '.rich-toolbar, .page-richtext-fragment-toolbar, .box-controls, .rt-dropdown-menu,\n' +
                '#editToggle, .edit-toggle, #doodleToolbar, .doodle-layer,\n' +
                '.floating-controls, .rs-handle {\n' +
                '    display: none !important;\n' +
                '    visibility: hidden !important;\n' +
                '    pointer-events: none !important;\n' +
                '}\n';
            var head = clone.querySelector('head');
            if (head) head.appendChild(safetyStyle);

            // 清空导航圆点
            var nd = clone.querySelector('.nav-dots'); if (nd) nd.innerHTML = '';
            var sn = clone.querySelector('#slideNav'); if (sn) sn.innerHTML = '';

            // 保留 contenteditable，导出的文件依然可以进入编辑模式继续编辑
            var tg = clone.querySelector('#editToggle');
            if (tg) { tg.classList.remove('active', 'show'); tg.style.cssText = ''; }
            var tb = clone.querySelector('#richToolbar');
            if (tb) tb.classList.remove('visible');
            var bd = clone.querySelector('body');
            if (bd) bd.classList.remove('editor-mode');

            // 移除浮动控件及编辑器专有图元挂载节点
            clone.querySelectorAll('.floating-controls, .overlay-ctrl, .box-controls, .rs-handle').forEach(function (el) { el.remove(); });
            clone.querySelectorAll('.qa-annotation-toolbar, .qa-note-fragment-toolbar, .page-richtext-fragment-toolbar').forEach(function (el) { el.remove(); });
            // 清除所有交互组件瞬态（替代原来仅清除 qa-fragment-visible/data-fragment-manual-reveal）
            _stripAllTransientStates(clone);

            // 剥离原生的安全隔离壳 (.native-edit-wrap)
            clone.querySelectorAll('.native-edit-wrap').forEach(function (wrap) {
                while (wrap.firstChild) wrap.parentNode.insertBefore(wrap.firstChild, wrap);
                wrap.remove();
            });

            // 清理涂鸦引擎产生的 UI
            var dt = clone.querySelector('#doodleToolbar'); if (dt) dt.remove();
            var db = clone.querySelector('#doodleToggleBtn'); if (db) db.remove();
            var dp = clone.querySelector('#doodleLaserPointer'); if (dp) dp.remove();
            if (bd) bd.classList.remove('doodle-mode');

            // 触发导出清洗钩子
            EditorHooks.fire('onExportClean', clone);

            // 下载
            var html = '<!DOCTYPE html>\n' + clone.outerHTML;
            var blob = new Blob([html], { type: 'text/html' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = (document.title || 'presentation').replace(/[<>:"/\\|?*]/g, '_') + '.html';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
        },

        /** 💾 保存到 HTML 文件（存档） */
        saveToHTMLFile: function () {
            // ★ 保存前先同步当前幻灯片到 localStorage，确保最新编辑内容不会丢失
            var currentSlide = document.querySelector('.slide.active');
            if (currentSlide) PersistenceLayer.syncFromDOM(currentSlide);

            // 有基线快照时直接走白名单路径，跳过 XHR（file:// 下 XHR 必然超时）
            if (window.__BASELINE__) {
                return _doWrite(_prepareCleanHTMLFallback());
            }

            // 没有基线时尝试 XHR（旧课件兼容）
            return _loadCleanHTMLFromDisk().then(function (cleanHTML) {
                return _doWrite(cleanHTML ? _prepareCleanHTMLFromSource(cleanHTML) : _prepareCleanHTMLFallback());
            });
        },

        /** 📂 从 HTML 文件读取存档（清除草稿并刷新） */
        loadFromHTMLFile: function () {
            var prefix = storageKey('');
            var keysToRemove = [];
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                if (key && key.indexOf(prefix) === 0) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(function (key) { localStorage.removeItem(key); });
            location.reload();
        }
    };

    window.PersistenceLayer = PersistenceLayer;

})();
