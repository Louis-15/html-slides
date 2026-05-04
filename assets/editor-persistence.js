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
        if (html.indexOf('qa-fragment-visible') === -1 && html.indexOf('data-fragment-manual-reveal') === -1) {
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

    function _prepareCleanHTML() {
        var clone = document.documentElement.cloneNode(true);

        // 移除编辑器 UI
        clone.querySelectorAll([
            '.rich-toolbar', '.edit-toggle', '.edit-hotzone',
            '.box-controls', '.rs-handle', '.floating-controls', '.overlay-ctrl',
            '.qa-annotation-toolbar', '.qa-note-fragment-toolbar', '.page-richtext-fragment-toolbar',
            '#doodleToolbar', '#doodleToggleBtn', '#doodleLaserPointer'
        ].join(',')).forEach(function (el) { el.remove(); });

        // 剥离 native-edit-wrap 壳
        clone.querySelectorAll('.native-edit-wrap').forEach(function (wrap) {
            while (wrap.firstChild) wrap.parentNode.insertBefore(wrap.firstChild, wrap);
            wrap.remove();
        });

        // 清除 transient class 和属性
        clone.querySelectorAll('.qa-fragment-visible').forEach(function (el) {
            el.classList.remove('qa-fragment-visible');
        });
        clone.querySelectorAll('[data-fragment-manual-reveal]').forEach(function (el) {
            el.removeAttribute('data-fragment-manual-reveal');
        });

        // 移除编辑/doodle 模式 class
        var body = clone.querySelector('body');
        if (body) {
            body.classList.remove('editor-mode');
            body.classList.remove('doodle-mode');
        }
        var htmlEl = clone.querySelector('html');
        if (htmlEl) {
            htmlEl.classList.remove('editor-mode');
        }

        // 物理删除已删除批注的锚点节点
        _removeDeletedAnnotationNodes(clone);

        // 触发导出清洗钩子
        if (EditorHooks) {
            EditorHooks.fire('onExportClean', clone);
        }

        return '<!DOCTYPE html>\n' + clone.outerHTML;
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
            clone.querySelectorAll('.qa-fragment-visible').forEach(function (el) { el.classList.remove('qa-fragment-visible'); });
            clone.querySelectorAll('[data-fragment-manual-reveal]').forEach(function (el) { el.removeAttribute('data-fragment-manual-reveal'); });

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
            var cleanHTML = _prepareCleanHTML();

            if (_htmlFileHandle) {
                return _htmlFileHandle.queryPermission({ mode: 'readwrite' }).then(function (perm) {
                    if (perm === 'granted') {
                        return _writeHTMLToFile(cleanHTML);
                    }
                    return _requestHTMLFileAccess().then(function (ok) {
                        return ok ? _writeHTMLToFile(cleanHTML) : false;
                    });
                });
            }

            return _requestHTMLFileAccess().then(function (ok) {
                return ok ? _writeHTMLToFile(cleanHTML) : false;
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
