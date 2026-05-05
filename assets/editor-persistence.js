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
    var legacyStorageKey = utils.legacyStorageKey;
    var getAllSlides = utils.getAllSlides;
    var EditorHooks = window.EditorHooks;

    // === 保存到 HTML 文件：File System Access 句柄 ===
    var _htmlFileHandle = null;
    var _htmlWriteChain = Promise.resolve();

    function stripTransientEditableHTML(html) {
        if (!html) return html;
        if (html.indexOf('qa-fragment-visible') === -1 && html.indexOf('data-fragment-manual-reveal') === -1
            && html.indexOf('selected') === -1 && html.indexOf('result-correct') === -1
            && html.indexOf('result-incorrect') === -1 && html.indexOf('is-submitted') === -1
            && html.indexOf('is-active') === -1 && html.indexOf('qa-result-mark') === -1
            && html.indexOf('data-question-active') === -1 && html.indexOf('data-question-submitted') === -1) {
            return html;
        }

        var temp = document.createElement('div');
        temp.innerHTML = html;
        // 批注 fragment 瞬态
        temp.querySelectorAll('.qa-fragment-visible').forEach(function (el) {
            el.classList.remove('qa-fragment-visible');
        });
        temp.querySelectorAll('[data-fragment-manual-reveal]').forEach(function (el) {
            el.removeAttribute('data-fragment-manual-reveal');
        });
        // 例题组件交互瞬态
        temp.querySelectorAll('.selected').forEach(function (el) {
            el.classList.remove('selected');
        });
        temp.querySelectorAll('.result-correct,.result-incorrect').forEach(function (el) {
            el.classList.remove('result-correct', 'result-incorrect');
        });
        temp.querySelectorAll('.is-submitted,.is-analysis-open').forEach(function (el) {
            el.classList.remove('is-submitted', 'is-analysis-open');
        });
        temp.querySelectorAll('.qa-result-mark').forEach(function (el) {
            el.remove();
        });
        temp.querySelectorAll('[data-question-active]').forEach(function (el) {
            el.removeAttribute('data-question-active');
        });
        temp.querySelectorAll('[data-question-submitted]').forEach(function (el) {
            el.removeAttribute('data-question-submitted');
        });
        return temp.innerHTML;
    }

    /**
     * 读取缓存时优先命中新 key；如果只存在旧版“按标题隔离”的 key，
     * 则自动迁移到新的“按路径隔离”命名空间，避免同标题课件互串。
     */
    function readStoredValue(suffix) {
        var primaryKey = storageKey(suffix);
        try {
            var saved = localStorage.getItem(primaryKey);
            if (saved !== null) return saved;

            if (typeof legacyStorageKey !== 'function') return null;
            var fallbackKey = legacyStorageKey(suffix);
            if (!fallbackKey || fallbackKey === primaryKey) return null;

            var legacySaved = localStorage.getItem(fallbackKey);
            if (legacySaved === null) return null;

            try {
                localStorage.setItem(primaryKey, legacySaved);
                localStorage.removeItem(fallbackKey);
            } catch (e) { }

            return legacySaved;
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

    function _removeDeletedAnnotationNodes(clone) {
        var allDeleted = [];
        document.querySelectorAll('.quiz-annotation').forEach(function (qa) {
            var raw = qa.dataset.deletedNotes;
            if (raw) {
                try {
                    JSON.parse(raw).forEach(function (id) {
                        if (allDeleted.indexOf(id) === -1) allDeleted.push(id);
                    });
                } catch (e) { }
            }
        });

        if (allDeleted.length === 0) return;

        allDeleted.forEach(function (linkId) {
            clone.querySelectorAll('.text-anchor[data-link="' + linkId + '"]').forEach(function (anchor) {
                var parent = anchor.parentNode;
                while (anchor.firstChild) parent.insertBefore(anchor.firstChild, anchor);
                parent.removeChild(anchor);
            });
            clone.querySelectorAll('.answer-anchor[data-link-answer="' + linkId + '"], .answer-anchor[data-link="' + linkId + '"]').forEach(function (anchor) {
                var parent = anchor.parentNode;
                while (anchor.firstChild) parent.insertBefore(anchor.firstChild, anchor);
                parent.removeChild(anchor);
            });
        });
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
     * XHR 失败时的回退：克隆当前 DOM 并全面清洗。
     * 必须删除所有编辑器注入的 UI 元素（hotzone、按钮、toolbar、pager）、
     * 清除运行时 chrome 状态、去除交互瞬态。与 exportCleanHTML 不同，
     * 保存流程不注入 safety style，因此不能保留编辑按钮——必须物理删除。
     */
    function _prepareCleanHTMLFallback() {
        var clone = document.documentElement.cloneNode(true);

        // 1. 删除编辑器注入的全部 UI 节点
        clone.querySelectorAll('.edit-hotzone, .edit-toggle, .rich-toolbar, #slidePager').forEach(function (el) {
            el.remove();
        });

        // 2. 清除 <html> 和 <body> 上运行时添加的空 class
        var htmlEl = clone.querySelector('html');
        if (htmlEl && htmlEl.getAttribute('class') === '') htmlEl.removeAttribute('class');
        var bodyEl = clone.querySelector('body');
        if (bodyEl) {
            if (bodyEl.getAttribute('class') === '') bodyEl.removeAttribute('class');
            bodyEl.classList.remove('editor-mode', 'doodle-mode');
        }

        // 3. 清除 chrome 元素上的运行时状态
        var progressEl = clone.querySelector('#progress');
        if (progressEl) progressEl.removeAttribute('style');
        var particlesEl = clone.querySelector('#particles');
        if (particlesEl) particlesEl.innerHTML = '';
        var counterEl = clone.querySelector('#counter');
        if (counterEl) counterEl.textContent = '';

        // 4. 清空导航圆点
        var nd = clone.querySelector('.nav-dots'); if (nd) nd.innerHTML = '';
        var sn = clone.querySelector('#slideNav'); if (sn) sn.innerHTML = '';

        // 5. 删除运行时注入的样式块
        var doodleStyle = clone.querySelector('#doodle-runtime-styles');
        if (doodleStyle) doodleStyle.remove();

        // 6. 清除涂鸦引擎 UI
        var dt = clone.querySelector('#doodleToolbar'); if (dt) dt.remove();
        var db = clone.querySelector('#doodleToggleBtn'); if (db) db.remove();
        var dp = clone.querySelector('#doodleLaserPointer'); if (dp) dp.remove();

        // 7. 移除浮动控件及注解工具栏
        clone.querySelectorAll('.floating-controls, .overlay-ctrl, .box-controls, .rs-handle').forEach(function (el) { el.remove(); });
        clone.querySelectorAll('.qa-annotation-toolbar, .qa-note-fragment-toolbar, .page-richtext-fragment-toolbar').forEach(function (el) { el.remove(); });

        // 8. 剥离 native-edit-wrap 壳
        clone.querySelectorAll('.native-edit-wrap').forEach(function (wrap) {
            while (wrap.firstChild) wrap.parentNode.insertBefore(wrap.firstChild, wrap);
            wrap.remove();
        });

        // 9. 清除交互组件瞬态
        _stripAllTransientStates(clone);

        _removeDeletedAnnotationNodes(clone);
        clone.querySelectorAll('.slide').forEach(function (s, i) { s.classList.toggle('active', i === 0); });
        if (EditorHooks) EditorHooks.fire('onExportClean', clone);
        return '<!DOCTYPE html>\n' + clone.outerHTML;
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

        _removeDeletedAnnotationNodes(div);
        div.querySelectorAll('.slide').forEach(function (s, i) { s.classList.toggle('active', i === 0); });
        if (EditorHooks) EditorHooks.fire('onExportClean', div);
        return '<!DOCTYPE html>\n' + div.innerHTML;
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
            return true;
        }).catch(function (e) {
            if (e.name !== 'AbortError') console.warn('[PersistenceLayer] 选择文件失败:', e);
            return false;
        });
    }

    function _writeHTMLToFile(html) {
        if (!_htmlFileHandle) return Promise.resolve(false);
        // 串行化写入，防止并发截断
        var task = _htmlWriteChain.catch(function () { return false; }).then(function () {
            return _htmlFileHandle.createWritable().then(function (writable) {
                return writable.write(html).then(function () { return writable.close(); });
            });
        }).then(function () {
            // 标记：标注数据已内联到 HTML，下次加载时不再读取旧 .annotations.js
            try { localStorage.setItem('hslides-ann-inline:' + decodeURIComponent(location.pathname), '1'); } catch (e) { }
            return true;
        });
        _htmlWriteChain = task.catch(function () { return false; });
        return task;
    }

    var PersistenceLayer = {
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

            return _loadCleanHTMLFromDisk().then(function (cleanHTML) {
                var result;
                if (cleanHTML) {
                    // XHR 成功：以磁盘 HTML 为底本，只从 localStorage 盖 [data-edit-id]
                    result = _prepareCleanHTMLFromSource(cleanHTML);
                } else {
                    // XHR 失败（file:// 协议必然失败）：克隆当前 DOM 并全面清洗
                    result = _prepareCleanHTMLFallback();
                }

                if (_htmlFileHandle) {
                    return _htmlFileHandle.queryPermission({ mode: 'readwrite' }).then(function (perm) {
                        if (perm === 'granted') return _writeHTMLToFile(result);
                        return _requestHTMLFileAccess().then(function (ok) {
                            return ok ? _writeHTMLToFile(result) : false;
                        });
                    });
                }
                return _requestHTMLFileAccess().then(function (ok) {
                    return ok ? _writeHTMLToFile(result) : false;
                });
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
