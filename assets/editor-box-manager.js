/* ===========================================
   EDITOR-BOX-MANAGER.JS
   HTML-Slides 编辑器 — 统一文本框/图片框管理
   依赖：editor-utils.js (window._editorUtils)
   运行时依赖：window.PersistenceLayer, window.editorCore, window.historyMgr
   暴露：window.BoxManager
   =========================================== */

(function () {
    'use strict';

    var utils = window._editorUtils;
    var storageKey = utils.storageKey;

    var BoxManager = {

        /**
         * 初始化：为所有已有的原生 [data-edit-id] 元素绑定拖拽/删除控件
         * 统一方案：所有文本框都使用内嵌 .box-controls 控件条
         */
        init: function () {
            var self = this;
            document.querySelectorAll('[data-edit-id]').forEach(function (el) {
                self._injectControls(el);
            });
        },

        /**
         * 为目标元素注入 📍✖ 控件条（如果尚未注入）
         */
        _injectControls: function (el) {
            var self = this;
            var wrap = el.closest('.editable-wrap');
            
            // 为原生的文本编辑块安全隔离一层 wrapper，使悬浮控制条不被内部 contenteditable 吃掉和误删
            if (!wrap && el.tagName !== 'IMG' && el.tagName !== 'TD' && el.tagName !== 'TH' && !el.closest('.native-edit-wrap')) {
                // 先读取被包裹元素的计算 display，让壳子镜像原有排版类型
                var elDisplay = window.getComputedStyle(el).display;
                wrap = document.createElement('div');
                wrap.className = 'editable-wrap native-edit-wrap';
                // 块级元素用 block，行内/行内块用 inline-block（否则 border 不会显示）
                wrap.style.display = (elDisplay === 'inline' || elDisplay === 'inline-flex' || elDisplay === 'inline-grid')
                    ? 'inline-block' : 'block';
                el.parentNode.insertBefore(wrap, el);
                wrap.appendChild(el);
            }
            
            var target = wrap || el;

            // 修复原生图片标签：IMG 不能拥有子节点
            if (el.tagName === 'IMG' && !wrap) {
                target = el.closest('.image-frame') || el.closest('.image-fullbleed') || el.parentNode;
            }

            // 暴力清理从 innerHTML (撤销操作/重水化) 恢复回来的死节点
            if (target && target.querySelectorAll) {
                var zombies = target.querySelectorAll('.box-controls, .rs-handle');
                zombies.forEach(function (node) { node.remove(); });
            }

            // td 元素不注入（表格单元格拖不动）
            if (el.tagName === 'TD' || el.tagName === 'TH') return;

            // 让原生元素也具备 position: relative 以便控件绝对定位
            if (!wrap && target) {
                var cs = window.getComputedStyle(target);
                if (cs.position === 'static') target.style.position = 'relative';
            }

            var controls = document.createElement('div');
            controls.className = 'box-controls';
            controls.setAttribute('contenteditable', 'false');
            controls.innerHTML = '<span class="drag-handle" title="按住拖动📍">📍</span><span class="del-btn" title="删除/隐藏">✖</span>';

            if (target) target.appendChild(controls);

            // 注入八爪鱼缩放点
            var isResizable = (wrap && wrap.classList.contains('image-box')) || (el.tagName === 'IMG');
            if (isResizable && target && !target.querySelector('.rs-se')) {
                var corners = ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'];
                corners.forEach(function (dir) {
                    var r = document.createElement('div');
                    r.className = 'rs-handle rs-' + dir;
                    r.setAttribute('data-dir', dir);
                    r.setAttribute('contenteditable', 'false');
                    target.appendChild(r);
                    self._bindResize(r, target);
                });
                target.style.resize = 'none';
            }

            this._bindDrag(controls.querySelector('.drag-handle'), el, wrap);
            this._bindDelete(controls.querySelector('.del-btn'), el, wrap);
        },

        /** 绑定拖拽逻辑（统一使用 PointerEvent） */
        _bindDrag: function (handle, el, wrap) {
            var dragState = null;
            var isCustom = wrap && wrap.classList.contains('custom-box');

            handle.addEventListener('pointerdown', function (e) {
                if (!window.editorCore || !window.editorCore.isActive) return;
                e.preventDefault();
                e.stopPropagation();
                handle.setPointerCapture(e.pointerId);

                if (isCustom) {
                    if (!wrap.classList.contains('text-box')) {
                        if (!wrap.style.width || wrap.style.width === 'auto') wrap.style.width = wrap.offsetWidth + 'px';
                        if (!wrap.style.height || wrap.style.height === 'auto') wrap.style.height = wrap.offsetHeight + 'px';
                    }
                    dragState = {
                        target: wrap,
                        startX: e.clientX, startY: e.clientY,
                        initLeft: wrap.offsetLeft,
                        initTop: wrap.offsetTop,
                        type: 'abs'
                    };
                } else {
                    var dragTarget = el;
                    if (el.tagName === 'IMG') dragTarget = el.closest('.image-frame') || el.closest('.image-fullbleed') || el.parentNode;
                    var tx = BoxManager._parseTranslate(dragTarget);
                    dragState = {
                        target: dragTarget,
                        startX: e.clientX, startY: e.clientY,
                        initTx: tx.x, initTy: tx.y,
                        type: 'transform'
                    };
                }
            });

            handle.addEventListener('pointermove', function (e) {
                if (!dragState) return;
                var dx = e.clientX - dragState.startX;
                var dy = e.clientY - dragState.startY;
                if (dragState.type === 'abs') {
                    dragState.target.style.left = (dragState.initLeft + dx) + 'px';
                    dragState.target.style.top = (dragState.initTop + dy) + 'px';
                } else {
                    dragState.target.style.transform = 'translate(' + (dragState.initTx + dx) + 'px,' + (dragState.initTy + dy) + 'px)';
                }
            });

            handle.addEventListener('pointerup', function () {
                if (!dragState) return;
                if (dragState.type === 'abs') window.PersistenceLayer.saveCustomBoxes();
                else window.PersistenceLayer.saveNativeMods();
                dragState = null;
                window.historyMgr.recordState(true);
            });
        },

        /** 专门绑定 8 点缩放逻辑 */
        _bindResize: function (handle, target) {
            var rsState = null;
            handle.addEventListener('pointerdown', function (e) {
                if (!window.editorCore || !window.editorCore.isActive) return;
                e.preventDefault(); e.stopPropagation();
                handle.setPointerCapture(e.pointerId);

                var cs = window.getComputedStyle(target);
                if (cs.position === 'static') target.style.position = 'relative';
                target.style.maxWidth = 'none';
                target.style.maxHeight = 'none';
                target.style.flexShrink = '0';

                var innerImg = target.querySelector('img.slide-image');
                if (innerImg) {
                    innerImg.style.width = '100%';
                    innerImg.style.height = '100%';
                    innerImg.style.maxHeight = 'none';
                }

                var currLeft = parseFloat(target.style.left) || 0;
                var currTop = parseFloat(target.style.top) || 0;

                rsState = {
                    target: target,
                    dir: handle.getAttribute('data-dir'),
                    startX: e.clientX, startY: e.clientY,
                    w: target.offsetWidth, h: target.offsetHeight,
                    cLeft: currLeft, cTop: currTop
                };
            });

            handle.addEventListener('pointermove', function (e) {
                if (!rsState) return;
                var dx = e.clientX - rsState.startX;
                var dy = e.clientY - rsState.startY;
                var t = rsState.target;

                if (rsState.dir.indexOf('e') > -1) t.style.width = Math.max(20, rsState.w + dx) + 'px';
                if (rsState.dir.indexOf('s') > -1) t.style.height = Math.max(20, rsState.h + dy) + 'px';
                if (rsState.dir.indexOf('w') > -1) {
                    var pw = Math.max(20, rsState.w - dx);
                    if (pw > 20) { t.style.width = pw + 'px'; t.style.left = (rsState.cLeft + (rsState.w - pw)) + 'px'; }
                }
                if (rsState.dir.indexOf('n') > -1) {
                    var ph = Math.max(20, rsState.h - dy);
                    if (ph > 20) { t.style.height = ph + 'px'; t.style.top = (rsState.cTop + (rsState.h - ph)) + 'px'; }
                }
            });

            handle.addEventListener('pointerup', function () {
                if (!rsState) return;
                rsState = null;
                window.PersistenceLayer.saveCustomBoxes();
                window.PersistenceLayer.saveNativeMods();
                window.historyMgr.recordState(true);
            });
        },

        /** 绑定删除/隐藏逻辑 */
        _bindDelete: function (btn, el, wrap) {
            btn.addEventListener('click', function () {
                if (!window.editorCore || !window.editorCore.isActive) return;
                var isCustom = wrap && wrap.classList.contains('custom-box');
                var isImage = wrap ? wrap.classList.contains('image-box') : el.tagName === 'IMG';
                var msg = isCustom ? (isImage ? '确定要删除这张图片吗？' : '确定要删除这个文本框吗？') : (isImage ? '确定要隐藏这张原版图片吗？' : '确定要隐藏此元素吗？');
                if (!confirm(msg)) return;

                if (isCustom) {
                    var id = el.getAttribute('data-edit-id');
                    wrap.remove();
                    try { localStorage.removeItem(storageKey('e:' + id)); } catch (e) { }
                    window.PersistenceLayer.saveCustomBoxes();
                } else {
                    var delTarget = el;
                    if (el.tagName === 'IMG') delTarget = el.closest('.image-frame') || el.closest('.image-fullbleed') || el.parentNode;
                    delTarget.style.display = 'none';
                    window.PersistenceLayer.saveNativeMods();
                }
                window.historyMgr.recordState(true);
            });
        },

        /** 解析 translate */
        _parseTranslate: function (el) {
            if (!el.style.transform) return { x: 0, y: 0 };
            var m = el.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
            return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 };
        },

        /** 创建自定义文本框 */
        createTextBox: function (id, left, top, content, targetSlide) {
            var container = targetSlide.querySelector('.slide-content') || targetSlide;
            var wrap = document.createElement('div');
            wrap.className = 'editable-wrap custom-box text-box';
            wrap.style.left = left;
            wrap.style.top = top;

            var editArea = document.createElement('div');
            editArea.setAttribute('data-edit-id', id);
            var isEditing = window.editorCore && window.editorCore.isActive;
            editArea.setAttribute('contenteditable', isEditing ? 'true' : 'false');
            editArea.style.cssText = 'padding:8px; min-width:20px; min-height:24px; font-size:var(--body-size,1rem); line-height:1.45;';
            editArea.innerHTML = content || '请输入';

            wrap.appendChild(editArea);
            container.appendChild(wrap);
            this._injectControls(editArea);

            editArea.addEventListener('input', function () {
                if (window.editorCore && window.editorCore.isActive) {
                    window.PersistenceLayer.saveElement(editArea);
                    window.PersistenceLayer.saveCustomBoxes();
                }
            });

            if (window.editorCore) window.editorCore.refreshEditables();
        },

        /** 创建自定义图片图元 */
        createImageBox: function (id, left, top, width, height, src, targetSlide) {
            var container = targetSlide.querySelector('.slide-content') || targetSlide;
            var wrap = document.createElement('div');
            wrap.className = 'editable-wrap custom-box image-box image-frame';
            if (left === 'center') { left = '50%'; top = '30%'; wrap.style.transform = 'translateX(-50%)'; }
            wrap.style.left = left;
            wrap.style.top = top;
            if (width) wrap.style.width = width;
            if (height) wrap.style.height = height;

            var img = document.createElement('img');
            img.setAttribute('data-edit-id', id);
            img.setAttribute('src', src);
            img.className = 'slide-image';

            wrap.appendChild(img);
            container.appendChild(wrap);
            this._injectControls(img);

            if (typeof ResizeObserver !== 'undefined') {
                var ro = new ResizeObserver(function () {
                    if (window.editorCore && window.editorCore.isActive) {
                        window.PersistenceLayer.saveCustomBoxes();
                    }
                });
                ro.observe(wrap);
            }
        },

        /** DOM 恢复后重新绑定事件 */
        rehydrateSlide: function (slideEl) {
            if (!slideEl) return;
            var self = this;
            slideEl.querySelectorAll('[data-edit-id]').forEach(function (el) {
                self._injectControls(el);
            });
            slideEl.querySelectorAll('.editable-wrap.custom-box').forEach(function (wrap) {
                var editArea = wrap.querySelector('[data-edit-id]');
                if (!editArea) return;
                if (editArea.tagName === 'IMG' && typeof ResizeObserver !== 'undefined') {
                    var ro = new ResizeObserver(function () {
                        if (window.editorCore && window.editorCore.isActive) {
                            window.PersistenceLayer.saveCustomBoxes();
                        }
                    });
                    ro.observe(wrap);
                } else if (editArea.tagName !== 'IMG') {
                    editArea.addEventListener('input', function () {
                        if (window.editorCore && window.editorCore.isActive) {
                            window.PersistenceLayer.saveElement(editArea);
                            window.PersistenceLayer.saveCustomBoxes();
                        }
                    });
                }
            });
        }
    };

    window.BoxManager = BoxManager;

})();
