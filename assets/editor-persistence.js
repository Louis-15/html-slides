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

    var PersistenceLayer = {
        /** 保存单个可编辑元素的内容 */
        saveElement: function (el) {
            var id = el.getAttribute('data-edit-id');
            if (!id) return;
            try { localStorage.setItem(storageKey('e:' + id), el.innerHTML); } catch (e) { }
        },

        /** 从 localStorage 恢复所有可编辑元素的内容 */
        restoreAllElements: function () {
            document.querySelectorAll('[data-edit-id]').forEach(function (el) {
                var id = el.getAttribute('data-edit-id');
                try {
                    var saved = localStorage.getItem(storageKey('e:' + id));
                    if (saved !== null) el.innerHTML = saved;
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
                var saved = localStorage.getItem(storageKey('boxes'));
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
                var saved = localStorage.getItem(storageKey('nmods'));
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
                '.rich-toolbar, .box-controls, .rt-dropdown-menu,\n' +
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
        }
    };

    window.PersistenceLayer = PersistenceLayer;

})();
