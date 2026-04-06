/* ===========================================
   EDITOR-RUNTIME.JS v2
   HTML-Slides 网页内编辑功能运行时
   5 个解耦模块 + 插件钩子系统：
     1. PersistenceLayer  — 持久化（localStorage + Ctrl+S 导出）
     2. HistoryManager    — 按页撤销/重做
     3. BoxManager        — 统一文本框管理（拖拽/删除/新建）
     4. RichTextToolbar   — 富文本工具栏
     5. EditorCore        — 编辑模式总控
     + EditorHooks        — 涂鸦等未来插件的预留接口
   =========================================== */

(function () {
    'use strict';

    // ========================================
    // 工具函数
    // ========================================

    /** 简易字符串哈希，用于 localStorage 键名隔离不同课件 */
    function hashTitle(title) {
        var h = 0;
        for (var i = 0; i < title.length; i++) {
            h = ((h << 5) - h + title.charCodeAt(i)) | 0;
        }
        return Math.abs(h).toString(36);
    }

    var FILE_HASH = hashTitle(document.title || 'untitled');
    function storageKey(suffix) { return 'hslides:' + FILE_HASH + ':' + suffix; }

    /** 从光标位置向上查找最近的 [data-edit-id] 容器
     *  修复：工具栏按钮点击后焦点转移导致 selection 丢失，
     *  增加 savedRange 兜底查找 */
    function getActiveEditContainer() {
        var sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            var node = sel.anchorNode;
            if (node) {
                var el = node.nodeType === 3 ? node.parentNode : node;
                var result = el ? el.closest('[data-edit-id]') : null;
                if (result) return result;
            }
        }
        // 兜底：用 savedRange 查找
        if (RichTextToolbar && RichTextToolbar.savedRange) {
            var sr = RichTextToolbar.savedRange;
            var anchor = sr.commonAncestorContainer;
            var anEl = anchor && anchor.nodeType === 3 ? anchor.parentNode : anchor;
            return anEl ? anEl.closest('[data-edit-id]') : null;
        }
        return null;
    }

    /** 几何推算当前最居中的幻灯片索引，彻底摆脱对外部框架变量的依赖 */
    function getCurrentSlideIndex() {
        var slides = getAllSlides();
        if (!slides || slides.length === 0) return 0;

        var bestIndex = 0;
        var minDistance = Infinity;
        var centerY = window.innerHeight / 2;

        for (var i = 0; i < slides.length; i++) {
            var rect = slides[i].getBoundingClientRect();
            var slideCenter = rect.top + rect.height / 2;
            var dist = Math.abs(slideCenter - centerY);
            if (dist < minDistance) {
                minDistance = dist;
                bestIndex = i;
            }
        }
        return bestIndex;
    }

    function getAllSlides() { return document.querySelectorAll('.slide'); }

    // ========================================
    // 预留插件钩子（供未来涂鸦、录音等模块使用）
    // ========================================
    var EditorHooks = {
        /** 进入编辑模式时触发的回调列表 */
        onEditModeEnter: [],
        /** 退出编辑模式时触发的回调列表 */
        onEditModeExit: [],
        /** 幻灯片切换时触发的回调列表 */
        onSlideChange: [],
        /** Ctrl+S 导出清洗 DOM 前触发的回调列表（参数: clonedDocument） */
        onExportClean: [],
        /** 注册钩子 */
        register: function (hookName, fn) {
            if (this[hookName] && Array.isArray(this[hookName])) {
                this[hookName].push(fn);
            }
        },
        /** 触发钩子 */
        fire: function (hookName, arg) {
            if (this[hookName] && Array.isArray(this[hookName])) {
                this[hookName].forEach(function (fn) {
                    try { fn(arg); } catch (e) { console.warn('[EditorHooks]', hookName, e); }
                });
            }
        }
    };

    // ========================================
    // 模块 1：PersistenceLayer（持久化层）
    // ========================================
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
                            BoxManager.createImageBox(db.id, db.l, db.t, db.w, db.h, db.c, ts);
                        } else {
                            BoxManager.createTextBox(db.id, db.l, db.t, db.c, ts);
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
            // 为了让文件在任意电脑上打开都丝滑完美，不再使用绝对的 file:/// 路径。
            // 我们强制将 HTML 里所有的 CSS、JS 和图片链接重写为相对当前目录的 './assets/' 引用。
            // 这样只要把这批资产打包成文件夹，别人解压后就能 100% 同步渲染。
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
            // 当发给外部电脑（如女友电脑）且没有附带 assets 文件夹时，全站 CSS 会丢失（变成阅读模式文档）。
            // 为了防止富文本工具栏、下拉菜单失去 CSS 约束后变成乱码残骸糊在屏幕上，强制注入底层样式将所有编辑控件静默！
            var safetyStyle = clone.ownerDocument ? clone.ownerDocument.createElement('style') : document.createElement('style');
            safetyStyle.textContent = `
                /* Portable Safety Net */
                .rich-toolbar, .box-controls, .rt-dropdown-menu, 
                #editToggle, .edit-toggle, #doodleToolbar, .doodle-layer, 
                .floating-controls, .rs-handle {
                    display: none !important;
                    visibility: hidden !important;
                    pointer-events: none !important;
                }
            `;
            var head = clone.querySelector('head');
            if (head) head.appendChild(safetyStyle);

            // 清空导航圆点
            var nd = clone.querySelector('.nav-dots'); if (nd) nd.innerHTML = '';
            var sn = clone.querySelector('#slideNav'); if (sn) sn.innerHTML = '';

            // 清除编辑态
            clone.querySelectorAll('[contenteditable]').forEach(function (el) { el.removeAttribute('contenteditable'); });
            var tg = clone.querySelector('#editToggle');
            if (tg) { tg.classList.remove('active', 'show'); tg.style.cssText = ''; }
            var tb = clone.querySelector('#richToolbar');
            if (tb) tb.classList.remove('visible');
            var bd = clone.querySelector('body');
            if (bd) bd.classList.remove('editor-mode');

            // 移除浮动控件及编辑器专有图元挂载节点（核心：确保原版输出的纯净性，绝对不污染最终 HTML 产物）
            clone.querySelectorAll('.floating-controls, .overlay-ctrl, .box-controls, .rs-handle').forEach(function (el) { el.remove(); });
            
            // 清理涂鸦引擎产生的 UI，它们将在终端放映文档被打开时由 doodle-runtime.js 原地重新干净注入
            var dt = clone.querySelector('#doodleToolbar'); if (dt) dt.remove();
            var db = clone.querySelector('#doodleToggleBtn'); if (db) db.remove();
            var dp = clone.querySelector('#doodleLaserPointer'); if (dp) dp.remove();
            if (bd) bd.classList.remove('doodle-mode');

            // 触发导出清洗钩子（供涂鸦模块等清理自己的临时 DOM）
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

    // ========================================
    // 模块 2：HistoryManager（按页撤销/重做）
    // ========================================
    function HistoryManager() {
        this.stacks = new Map();
        this.isRestoring = false;
        this.debounceTimer = null;
        this.MAX_STEPS = 50;
    }

    HistoryManager.prototype = {
        getStack: function (i) {
            if (!this.stacks.has(i)) this.stacks.set(i, { undo: [], redo: [] });
            return this.stacks.get(i);
        },
        snapshot: function () {
            var slides = getAllSlides();
            var idx = getCurrentSlideIndex();
            return slides[idx] ? slides[idx].innerHTML : null;
        },
        recordState: function (forced) {
            if (this.isRestoring) return;
            var self = this;
            if (forced) { clearTimeout(this.debounceTimer); this._pushState(); }
            else { clearTimeout(this.debounceTimer); this.debounceTimer = setTimeout(function () { self._pushState(); }, 300); }
        },
        _pushState: function () {
            var idx = getCurrentSlideIndex();
            var stack = this.getStack(idx);
            var snap = this.snapshot();
            if (!snap) return;
            if (stack.undo.length > 0 && stack.undo[stack.undo.length - 1] === snap) return;
            stack.undo.push(snap);
            stack.redo = [];
            if (stack.undo.length > this.MAX_STEPS) stack.undo.shift();
            this.updateUI();
        },
        undo: function () {
            var stack = this.getStack(getCurrentSlideIndex());
            if (stack.undo.length <= 1) return;
            stack.redo.push(stack.undo.pop());
            this._restoreState(stack.undo[stack.undo.length - 1]);
        },
        redo: function () {
            var stack = this.getStack(getCurrentSlideIndex());
            if (stack.redo.length === 0) return;
            var n = stack.redo.pop();
            stack.undo.push(n);
            this._restoreState(n);
        },
        _restoreState: function (html) {
            this.isRestoring = true;
            var slides = getAllSlides();
            var slide = slides[getCurrentSlideIndex()];
            if (slide) {
                slide.innerHTML = html;
                if (window.editorCore) window.editorCore.refreshEditables();
                BoxManager.rehydrateSlide(slide);
                PersistenceLayer.syncFromDOM(slide);
            }
            this.isRestoring = false;
            this.updateUI();
        },
        /** 进入编辑模式时拍摄基准快照 */
        captureBaseline: function () {
            var stack = this.getStack(getCurrentSlideIndex());
            if (stack.undo.length === 0) {
                var snap = this.snapshot();
                if (snap) stack.undo.push(snap);
            }
        },
        updateUI: function () {
            var stack = this.getStack(getCurrentSlideIndex());
            var u = document.getElementById('undobtn');
            var r = document.getElementById('redobtn');
            if (u) u.style.opacity = stack.undo.length > 1 ? '1' : '0.4';
            if (r) r.style.opacity = stack.redo.length > 0 ? '1' : '0.4';
        }
    };

    // ========================================
    // 模块 3：BoxManager（统一文本框管理）
    // ========================================
    var BoxManager = {

        /**
         * 初始化：为所有已有的原生 [data-edit-id] 元素绑定拖拽/删除控件
         * 统一方案：所有文本框都使用内嵌 .box-controls 控件条
         */
        init: function () {
            var self = this;

            // 为页面上已存在的原生可编辑元素注入内嵌控件
            document.querySelectorAll('[data-edit-id]').forEach(function (el) {
                self._injectControls(el);
            });
        },

        /**
         * 为目标元素注入 📍✖ 控件条（如果尚未注入）
         * 原生元素：控件作为 el 的父级子元素
         * 自定义文本框：控件作为 .editable-wrap 的子元素
         */
        _injectControls: function (el) {
            var self = this;
            var wrap = el.closest('.editable-wrap');
            var target = wrap || el;

            // 修复原生图片标签：IMG 不能拥有子节点，将控件挂载至其外包壳 `.image-frame` 或是直接父元素上
            if (el.tagName === 'IMG' && !wrap) {
                target = el.closest('.image-frame') || el.closest('.image-fullbleed') || el.parentNode;
            }

            // ====== 生死劫修复：暴力清理从 innerHTML (撤销操作/重水化) 恢复回来的死节点 ======
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
            controls.innerHTML = '<span class="drag-handle" title="按住拖动📍">📍</span><span class="del-btn" title="删除/隐藏">✖</span>';

            if (target) target.appendChild(controls);

            // 注入八爪鱼缩放点（类似 PowerPoint 的图片四周缩放控制）
            var isResizable = (wrap && wrap.classList.contains('image-box')) || (el.tagName === 'IMG');
            if (isResizable && target && !target.querySelector('.rs-se')) {
                var corners = ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'];
                corners.forEach(function (dir) {
                    var r = document.createElement('div');
                    r.className = 'rs-handle rs-' + dir;
                    r.setAttribute('data-dir', dir);
                    target.appendChild(r);
                    self._bindResize(r, target);
                });
                target.style.resize = 'none';
            }

            // 如果 target 是 wrap 或原生图片外壳，则 Hover 或 focus-within 其内部结构都需要触发控件展示
            // 这里绑定拖拽
            this._bindDrag(controls.querySelector('.drag-handle'), el, wrap);

            // 绑定删除
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
                    // 对于图片元素或非文本元素，定死宽高以防止挤压
                    // 对于文本框（包含 text-box），由于启用了 min-width: max-content 弹性盒模型，不必锁死宽度，允许用户后期随意无限打字伸长
                    if (!wrap.classList.contains('text-box')) {
                        if (!wrap.style.width || wrap.style.width === 'auto') wrap.style.width = wrap.offsetWidth + 'px';
                        if (!wrap.style.height || wrap.style.height === 'auto') wrap.style.height = wrap.offsetHeight + 'px';
                    }

                    dragState = {
                        target: wrap,
                        startX: e.clientX, startY: e.clientY,
                        initLeft: wrap.offsetLeft, // 使用 offsetLeft 而不能用 parseInt() 以防读取到 50% 等百分比数值导致瞬间闪移
                        initTop: wrap.offsetTop,
                        type: 'abs'
                    };
                } else {
                    // 如果拖拽目标是原生的 img，我们需要移动它的 image-frame 容器，而不是 img 自己（容易导致渲染出框）
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
                if (dragState.type === 'abs') PersistenceLayer.saveCustomBoxes();
                else PersistenceLayer.saveNativeMods();
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

                // 缩放前定死原有的位置，使其脱离 flex 布局的流式计算（针对原生图片外壳）
                var cs = window.getComputedStyle(target);
                if (cs.position === 'static') target.style.position = 'relative';

                // 解除原生版式由于外部框架自带的边界防爆约束
                target.style.maxWidth = 'none';
                target.style.maxHeight = 'none';
                target.style.flexShrink = '0';

                // 设置内部图片充满框架，防止外壳缩放但图片不跟着走
                var innerImg = target.querySelector('img.slide-image');
                if (innerImg) {
                    innerImg.style.width = '100%';
                    innerImg.style.height = '100%';
                    innerImg.style.maxHeight = 'none'; // 解除针对原生图片的最高高度锁定
                }

                // 解析元素当前的相对偏移，以此作为安全基底起点，而非 offsetLeft（因为 relative 元素的 offsetLeft 包含父级流式居中的位移，强套进 left 会直接闪现数百像素）
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

                // 右与下，只改宽高
                if (rsState.dir.indexOf('e') > -1) t.style.width = Math.max(20, rsState.w + dx) + 'px';
                if (rsState.dir.indexOf('s') > -1) t.style.height = Math.max(20, rsState.h + dy) + 'px';

                // 左与上，根据原本的相对基座进行抵消反推，防止位置跳跃
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
                // 更新两种可能受影响的缓存
                PersistenceLayer.saveCustomBoxes();
                PersistenceLayer.saveNativeMods();
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

                // 原有逻辑处理
                if (isCustom) {
                    var id = el.getAttribute('data-edit-id');
                    wrap.remove();
                    try { localStorage.removeItem(storageKey('e:' + id)); } catch (e) { }
                    PersistenceLayer.saveCustomBoxes();
                } else {
                    // 如果删除的是原生图片，隐藏它对应的容器，而不是仅仅隐藏 img 本体以免在原处留下框架
                    var delTarget = el;
                    if (el.tagName === 'IMG') delTarget = el.closest('.image-frame') || el.closest('.image-fullbleed') || el.parentNode;
                    delTarget.style.display = 'none';
                    PersistenceLayer.saveNativeMods();
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
            editArea.style.cssText = 'padding:8px; min-width:20px; min-height:24px; font-size:var(--body-size,1rem); color:var(--editor-danger,#e74c3c);';
            editArea.innerHTML = content || '📝批注...';

            wrap.appendChild(editArea);
            container.appendChild(wrap);

            // 注入统一控件
            this._injectControls(editArea);

            // 绑定输入事件
            editArea.addEventListener('input', function () {
                if (window.editorCore && window.editorCore.isActive) {
                    PersistenceLayer.saveElement(editArea);
                    PersistenceLayer.saveCustomBoxes();
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

            // 注入统一控件
            this._injectControls(img);

            // Resize 事件极难直接监听，故利用 MutationObserver 或者直接在 moseup 里顺带持久化
            if (typeof ResizeObserver !== 'undefined') {
                var ro = new ResizeObserver(function () {
                    if (window.editorCore && window.editorCore.isActive) {
                        PersistenceLayer.saveCustomBoxes();
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
            // 自定义图元事件监听恢复
            slideEl.querySelectorAll('.editable-wrap.custom-box').forEach(function (wrap) {
                var editArea = wrap.querySelector('[data-edit-id]');
                if (!editArea) return;
                if (editArea.tagName === 'IMG' && typeof ResizeObserver !== 'undefined') {
                    var ro = new ResizeObserver(function () {
                        if (window.editorCore && window.editorCore.isActive) {
                            PersistenceLayer.saveCustomBoxes();
                        }
                    });
                    ro.observe(wrap);
                } else if (editArea.tagName !== 'IMG') {
                    editArea.addEventListener('input', function () {
                        if (window.editorCore && window.editorCore.isActive) {
                            PersistenceLayer.saveElement(editArea);
                            PersistenceLayer.saveCustomBoxes();
                        }
                    });
                }
            });
        }
    };

    // ========================================
    // 模块 4：RichTextToolbar（富文本工具栏）
    // ========================================
    var RichTextToolbar = {
        savedRange: null,

        /** 可选字体列表（英文框） */
        FONTS_ENG: [
            { name: 'Space Grotesk', family: "'Space Grotesk'" },
            { name: 'Manrope', family: "'Manrope'" },
            { name: 'Plus Jakarta Sans', family: "'Plus Jakarta Sans'" },
            { name: 'Outfit', family: "'Outfit'" },
            { name: 'DM Sans', family: "'DM Sans'" },
            { name: 'Work Sans', family: "'Work Sans'" },
            { name: 'IBM Plex Sans', family: "'IBM Plex Sans'" },
            { name: 'Syne', family: "'Syne'" },
            { name: 'Archivo', family: "'Archivo'" },
            { name: 'Cormorant', family: "'Cormorant'" },
            { name: 'Bodoni Moda', family: "'Bodoni Moda'" },
            { name: 'Fraunces', family: "'Fraunces'" },
            { name: 'JetBrains Mono', family: "'JetBrains Mono'" },
            { name: 'Space Mono', family: "'Space Mono'" },
            { name: '--- 手写体 ---', family: '' },
            { name: 'MV Boli', family: "'MV Boli'" },
            { name: 'Caveat', family: "'Caveat'" },
            { name: '--- 汉字体 ---', family: '' },
            { name: '微软雅黑', family: "'Microsoft YaHei', 'PingFang SC', sans-serif" },
            { name: '等线', family: "DengXian, 'PingFang SC', sans-serif" },
            { name: '宋体', family: "SimSun, 'Songti SC', serif" },
            { name: '楷体', family: "KaiTi, 'Kaiti SC', serif" },
            { name: '仿宋', family: "FangSong, 'FangSong SC', serif" }
        ],

        /** 可选字体列表（中文框） */
        FONTS_ZH: [
            { name: '微软雅黑', family: "'Microsoft YaHei', 'PingFang SC', sans-serif" },
            { name: '等线', family: "DengXian, 'PingFang SC', sans-serif" },
            { name: '宋体', family: "SimSun, 'Songti SC', serif" },
            { name: '楷体', family: "KaiTi, 'Kaiti SC', serif" },
            { name: '仿宋', family: "FangSong, 'FangSong SC', serif" },
            { name: '--- 手写体 ---', family: '' },
            { name: '华文行楷', family: "'STXingkai', 'Xingkai SC', '华文行楷', cursive" }
        ],

        init: function () {
            var self = this;

            // 监听光标变化
            document.addEventListener('selectionchange', function () {
                if (!window.editorCore || !window.editorCore.isActive) return;
                var sel = window.getSelection();
                if (sel.rangeCount > 0) {
                    var range = sel.getRangeAt(0);
                    var el = range.commonAncestorContainer;
                    el = el.nodeType === 3 ? el.parentNode : el;
                    if (el && el.closest && el.closest('[contenteditable="true"]')) {
                        self.savedRange = range;
                    } else {
                        // 关键拦截：如果选区已经离开了可编辑范围（如点到了幻灯片背景上），那么就当做释放，把缓存选区置空
                        self.savedRange = null;
                    }
                } else {
                    self.savedRange = null;
                }
                self.syncFontIndicators();
            });

            this._initPalettes();
            this._initFontMenu('engFontDropdown', this.FONTS_ENG, 'eng');
            this._initFontMenu('zhFontDropdown', this.FONTS_ZH, 'zh');
        },

        restoreSelection: function () {
            if (!this.savedRange) return;
            var sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(this.savedRange);
        },

        /** 执行 execCommand 并记录历史（删除线使用自定义实现） */
        execAndRecord: function (cmd, val) {
            if (cmd === 'strikethrough') {
                this._toggleDecoration('line-through', '#e74c3c');
                return;
            }
            this.restoreSelection();
            document.execCommand(cmd, false, val || null);
            window.historyMgr.recordState(true);
        },

        /**
         * 通用装饰去除：清理 fragment/元素内所有匹配 decorationType 的 span
         * @returns {boolean} 是否找到并清理了装饰
         */
        _cleanDecoration: function (root, decorationType) {
            var found = false;
            var spans = Array.from(root.querySelectorAll('span'));
            for (var i = spans.length - 1; i >= 0; i--) {
                var s = spans[i];
                if (s.style.textDecoration && s.style.textDecoration.indexOf(decorationType) !== -1) {
                    found = true;
                    s.style.removeProperty('text-decoration');
                    s.style.removeProperty('text-decoration-color');
                    s.style.removeProperty('text-underline-offset');
                    if (!s.getAttribute('style') || s.getAttribute('style').trim() === '') {
                        var parent = s.parentNode;
                        while (s.firstChild) parent.insertBefore(s.firstChild, s);
                        parent.removeChild(s);
                    }
                }
            }
            return found;
        },

        /**
         * 在提取前检查活 DOM：选区内的所有文本是否全部拥有指定装饰
         * 用于判断 toggle 的方向（全部有 → 取消，否则 → 应用）
         */
        _isRangeFullyDecorated: function (range, container, decorationType) {
            var ancestor = range.commonAncestorContainer;
            var el = ancestor.nodeType === 3 ? ancestor.parentNode : ancestor;

            // 快速路径：如果选区的公共祖先本身就在装饰 span 内
            var checkEl = el;
            while (checkEl && checkEl !== container && checkEl !== container.parentNode) {
                if (checkEl.style && checkEl.style.textDecoration &&
                    checkEl.style.textDecoration.indexOf(decorationType) !== -1) {
                    return true;
                }
                checkEl = checkEl.parentNode;
            }

            // 完整路径：遍历选区内的每个文本节点
            var root = ancestor.nodeType === 3 ? ancestor.parentNode : ancestor;
            var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
            var node;
            var foundAny = false;

            while (node = walker.nextNode()) {
                if (!range.intersectsNode(node)) continue;
                if (!node.textContent || node.textContent.trim() === '') continue;
                foundAny = true;

                var hasDecor = false;
                var parent = node.parentNode;
                while (parent && parent !== container && parent !== container.parentNode) {
                    if (parent.style && parent.style.textDecoration &&
                        parent.style.textDecoration.indexOf(decorationType) !== -1) {
                        hasDecor = true;
                        break;
                    }
                    parent = parent.parentNode;
                }
                if (!hasDecor) return false;
            }
            return foundAny;
        },

        /**
         * 清理容器中因 extractContents 残留的空装饰 span
         */
        _cleanEmptyDecoSpans: function (container, decorationType) {
            Array.from(container.querySelectorAll('span')).forEach(function (s) {
                if (s.style.textDecoration && s.style.textDecoration.indexOf(decorationType) !== -1) {
                    if (!s.textContent) s.parentNode.removeChild(s);
                }
            });
        },

        /**
         * 核心：将包裹选区的装饰 span 在选区边界处劈开
         * 劈开后选区内容不再被装饰 span 包裹，后续 extractContents 即可正常工作
         */
        _splitDecoSpanAtRange: function (range, container, decorationType) {
            var startEl = range.startContainer.nodeType === 3 ? range.startContainer.parentNode : range.startContainer;
            var decoSpan = null;
            var check = startEl;
            while (check && check !== container) {
                if (check.tagName === 'SPAN' && check.style.textDecoration &&
                    check.style.textDecoration.indexOf(decorationType) !== -1) {
                    decoSpan = check;
                    break;
                }
                check = check.parentNode;
            }
            if (!decoSpan) return; // 选区不在装饰 span 内，无需劈开

            var parent = decoSpan.parentNode;

            // 1. 提取「选区之后」的内容
            var afterRange = document.createRange();
            afterRange.setStart(range.endContainer, range.endOffset);
            if (decoSpan.lastChild) afterRange.setEndAfter(decoSpan.lastChild);
            else afterRange.setEnd(decoSpan, 0);
            var afterFrag = afterRange.extractContents();

            // 2. 提取「选中」的内容
            var selectedFrag = range.extractContents();

            // decoSpan 现在只剩「选区之前」的内容
            var nextSib = decoSpan.nextSibling;

            // 3. 插入「之后」部分（保留装饰）
            if (afterFrag.textContent) {
                var afterSpan = decoSpan.cloneNode(false);
                afterSpan.appendChild(afterFrag);
                parent.insertBefore(afterSpan, nextSib);
            }

            // 4. 插入「选中」部分 — 保留无样式 span 做选区锚点（不影响渲染）
            //    不解包！解包会导致浏览器丢失选区，这是之前的 bug 根因
            var bareWrap = document.createElement('span');
            bareWrap.appendChild(selectedFrag);
            parent.insertBefore(bareWrap, decoSpan.nextSibling);

            // 5. 清空的前半 span 移除
            if (!decoSpan.textContent) parent.removeChild(decoSpan);

            // 6. 设置选区指向 bareWrap 内容
            var sel = window.getSelection();
            var newRange = document.createRange();
            newRange.selectNodeContents(bareWrap);
            sel.removeAllRanges();
            sel.addRange(newRange);
            this.savedRange = newRange;
        },

        /**
         * 切换装饰（删除线等）
         * 先劈开 → 再提取清理 → 全部有则取消，否则统一应用
         */
        _toggleDecoration: function (decorationType, decoColor) {
            this.restoreSelection();
            var sel = window.getSelection();
            if (!sel.rangeCount || sel.isCollapsed) return;
            var container = getActiveEditContainer();
            if (!container) return;

            var range = sel.getRangeAt(0);
            var allDecorated = this._isRangeFullyDecorated(range, container, decorationType);

            // 先劈开，确保选区不在装饰 span 内部
            this._splitDecoSpanAtRange(range, container, decorationType);
            this.restoreSelection();
            sel = window.getSelection();
            if (!sel.rangeCount) return;
            range = sel.getRangeAt(0);

            var fragment = range.extractContents();
            this._cleanDecoration(fragment, decorationType);
            this._cleanEmptyDecoSpans(container, decorationType);

            if (allDecorated) {
                range.insertNode(fragment);
            } else {
                var span = document.createElement('span');
                span.style.textDecoration = decorationType;
                if (decoColor) span.style.textDecorationColor = decoColor;
                if (decorationType === 'underline') span.style.textUnderlineOffset = '3px';
                span.appendChild(fragment);
                range.insertNode(span);
                var newRange = document.createRange();
                newRange.selectNodeContents(span);
                sel.removeAllRanges();
                sel.addRange(newRange);
                this.savedRange = newRange;
            }
            container.normalize();
            PersistenceLayer.saveElement(container);
            window.historyMgr.recordState(true);
        },

        /**
         * 有色下划线：劈开旧 span → 清理 → 包裹新下划线
         */
        applyUnderlineColor: function (color) {
            this.restoreSelection();
            var sel = window.getSelection();
            if (!sel.rangeCount || sel.isCollapsed) return;
            var container = getActiveEditContainer();
            if (!container) return;

            var range = sel.getRangeAt(0);
            this._splitDecoSpanAtRange(range, container, 'underline');
            this.restoreSelection();
            sel = window.getSelection();
            if (!sel.rangeCount) return;
            range = sel.getRangeAt(0);

            var fragment = range.extractContents();
            this._cleanDecoration(fragment, 'underline');
            this._cleanEmptyDecoSpans(container, 'underline');
            var span = document.createElement('span');
            span.style.textDecoration = 'underline';
            span.style.textDecorationColor = color;
            span.style.textUnderlineOffset = '3px';
            span.appendChild(fragment);
            range.insertNode(span);
            var newRange = document.createRange();
            newRange.selectNodeContents(span);
            sel.removeAllRanges();
            sel.addRange(newRange);
            this.savedRange = newRange;
            container.normalize();
            PersistenceLayer.saveElement(container);
            window.historyMgr.recordState(true);
        },

        /** 去掉下划线：劈开 → 清理 → 裸插回 */
        removeUnderline: function () {
            this.restoreSelection();
            var sel = window.getSelection();
            // 无选区：这部分逻辑已被移除，由 applyMixedFontFamily 全局接管。但如果需要兼容旧代码可留在这是因为旧的 applyFontFamily 被废弃了。yer.saveElement(container);
            window.historyMgr.recordState(true);
            this.closeDropdowns();
        },

        applyHyperlink: function (url) {
            this.restoreSelection();
            var sel = window.getSelection();
            var container = getActiveEditContainer();
            if (!container) {
                // 如果没有活动容器（比如光标不在可编辑区内，提示用户）
                alert('请先将光标放置在文本框内！');
                return;
            }

            if (sel.isCollapsed) {
                // 直接插入文字形态的跳转链接
                var linkUrl = '<a href="' + url + '" target="_blank" style="text-decoration:underline;">' + url + '</a>';
                document.execCommand('insertHTML', false, linkUrl);
            } else {
                // 包裹选区文字
                document.execCommand('createLink', false, url);
                // 给刚刚创建的 A 标签添加 target="_blank"
                this.restoreSelection();
                sel = window.getSelection();
                if (sel.rangeCount > 0) {
                    var range = sel.getRangeAt(0);
                    var el = range.commonAncestorContainer;
                    var parent = el.nodeType === 3 ? el.parentNode : el;
                    if (parent && parent.tagName === 'A') {
                        parent.setAttribute('target', '_blank');
                    } else if (parent) {
                        parent.querySelectorAll('a').forEach(function (a) {
                            if (a.getAttribute('href') === url) {
                                a.setAttribute('target', '_blank');
                            }
                        });
                    }
                }
            }
            container.normalize();
            PersistenceLayer.saveElement(container);
            window.historyMgr.recordState(true);
            this.closeDropdowns();
        },

        removeHyperlink: function () {
            this.restoreSelection();
            if (!getActiveEditContainer()) return;
            document.execCommand('unlink');
            PersistenceLayer.saveElement(getActiveEditContainer());
            window.historyMgr.recordState(true);
            this.closeDropdowns();
        },

        applyForeColor: function (c) {
            this.restoreSelection();
            document.execCommand('foreColor', false, c);
            window.historyMgr.recordState(true);
        },

        applyHiliteColor: function (c) {
            this.restoreSelection();
            if (!document.execCommand('hiliteColor', false, c)) document.execCommand('backColor', false, c);
            window.historyMgr.recordState(true);
        },

        /**
         * 修改字体
         * @param {string} fontFamily - CSS font-family 值
         */
        applyFontFamily: function (fontFamily) {
            var container = getActiveEditContainer();
            if (!container) return;

            // 智能双模式：有选区 → 仅改选中部分；无选区 → 改整个容器
            var sel = window.getSelection();
            if (sel.rangeCount > 0 && !sel.isCollapsed) {
                // 选中部分
                this.restoreSelection();
                document.execCommand('fontName', false, fontFamily);
            } else {
                // 整个容器
                container.style.fontFamily = fontFamily;
            }

            PersistenceLayer.saveElement(container);
            window.historyMgr.recordState(true);
            this.closeDropdowns();
        },

        /**
         * 智能双模式字号调节
         * 有选区 → 只改选中部分；无选区 → 改整个文本框
         * @param {number} dir - 1增大 / -1缩小
         */
        changeFontSize: function (dir) {
            // 先恢复选区，确保 getActiveEditContainer 能找到容器
            this.restoreSelection();
            var container = getActiveEditContainer();
            if (!container) return;

            var sel = window.getSelection();
            var hasSelection = sel.rangeCount > 0 && !sel.isCollapsed;

            if (hasSelection) {
                var range = sel.getRangeAt(0);
                var anchor = sel.anchorNode;
                var anchorEl = anchor ? (anchor.nodeType === 3 ? anchor.parentNode : anchor) : null;
                var rtNode = anchorEl ? anchorEl.closest('rt') : null;

                if (rtNode) {
                    var cs = parseFloat(window.getComputedStyle(rtNode).fontSize);
                    rtNode.style.fontSize = Math.max(8, cs + dir * 2) + 'px';
                } else {
                    // 先获取当前选区文本的字号
                    var currentFS = parseFloat(window.getComputedStyle(container).fontSize);
                    // 尝试从选区直接计算
                    if (anchorEl && anchorEl !== container) {
                        currentFS = parseFloat(window.getComputedStyle(anchorEl).fontSize);
                    }
                    var span = document.createElement('span');
                    span.style.fontSize = Math.max(10, currentFS + dir * 2) + 'px';
                    span.style.lineHeight = 'inherit';
                    span.appendChild(range.extractContents());
                    range.insertNode(span);

                    // 关键修复：重建选区指向新 span 内部，确保下次操作仍然有效
                    var newRange = document.createRange();
                    newRange.selectNodeContents(span);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                    this.savedRange = newRange;
                }
            } else {
                // 无选区：修改整个容器字号
                var currentSize = parseFloat(window.getComputedStyle(container).fontSize);
                container.style.fontSize = Math.max(10, currentSize + dir * 2) + 'px';

                // 清洗子元素的碎片字号（保留 rt 内的）
                container.querySelectorAll('*').forEach(function (child) {
                    if (!child.closest('rt') && child.style && child.style.fontSize) {
                        child.style.removeProperty('font-size');
                    }
                });
            }

            PersistenceLayer.saveElement(container);
            window.historyMgr.recordState(true);
        },

        /** Ruby 顶标批注 */
        addRubyAnnotation: function () {
            if (!window.editorCore || !window.editorCore.isActive) return;
            var sel = window.getSelection();
            if (!sel.rangeCount || sel.isCollapsed) { alert('请先用鼠标选中一段文字！'); return; }

            var range = sel.getRangeAt(0);
            var ancestor = range.commonAncestorContainer;
            var editableNode = (ancestor.nodeType === 3 ? ancestor.parentNode : ancestor).closest('[data-edit-id]');
            if (!editableNode) return;

            var ruby = document.createElement('ruby');
            var fragment = range.extractContents();
            var rt = document.createElement('rt');
            rt.innerText = '批注';
            ruby.appendChild(fragment);
            ruby.appendChild(rt);
            range.insertNode(ruby);

            PersistenceLayer.saveElement(editableNode);
            window.historyMgr.recordState(true);
            sel.removeAllRanges();
        },

        toggleDropdown: function (id) {
            document.querySelectorAll('.rt-dropdown-menu.show').forEach(function (m) { if (m.id !== id) m.classList.remove('show'); });
            if (!id) return;
            var m = document.getElementById(id);
            if (m) {
                m.classList.toggle('show');
            }
        },

        closeDropdowns: function () {
            document.querySelectorAll('.rt-dropdown-menu.show').forEach(function (m) { m.classList.remove('show'); });
        },

        /** 初始化调色板 */
        _initPalettes: function () {
            var self = this;
            var tc = ['#000000', '#2C3E50', '#7F8C8D', '#BDC3C7', '#E74C3C', '#E67E22', '#F1C40F', '#2ECC71', '#1ABC9C', '#3498DB', '#9B59B6', '#FFFFFF'];
            var hc = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#fd79a8', '#ffffff', 'transparent'];
            var tg = document.querySelector('.text-colors');
            var bg = document.querySelector('.bg-colors');
            if (bg) bg.style.gridTemplateColumns = 'repeat(5, 1fr)';

            if (tg) tc.forEach(function (c) {
                var s = document.createElement('div'); s.className = 'color-swatch'; s.style.background = c;
                if (c === '#FFFFFF') s.style.border = '1px solid #ccc';
                s.addEventListener('pointerdown', function (e) { e.preventDefault(); self.applyForeColor(c); });
                tg.appendChild(s);
            });

            if (bg) hc.forEach(function (c) {
                var s = document.createElement('div'); s.className = 'color-swatch';
                if (c === 'transparent') {
                    s.style.background = '#fff';
                    s.innerHTML = '<div style="width:100%;height:100%;background:linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%),linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%);background-size:8px 8px;background-position:0 0,4px 4px;border-radius:3px;"></div>';
                } else { s.style.background = c; }
                s.addEventListener('pointerdown', function (e) { e.preventDefault(); self.applyHiliteColor(c === 'transparent' ? 'rgba(0,0,0,0)' : c); });
                bg.appendChild(s);
            });

            // 下划线颜色面板：首项为去掉下划线
            var ulGrid = document.querySelector('.ul-colors');
            if (ulGrid) {
                var removeBtn = document.createElement('div');
                removeBtn.className = 'color-swatch';
                removeBtn.style.background = '#fff';
                removeBtn.title = '去掉下划线';
                removeBtn.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:14px;color:#e74c3c;font-weight:bold;">&#10005;</div>';
                removeBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); self.removeUnderline(); });
                ulGrid.appendChild(removeBtn);
                tc.forEach(function (c) {
                    if (c === '#FFFFFF') return;
                    var s = document.createElement('div'); s.className = 'color-swatch'; s.style.background = c;
                    s.addEventListener('pointerdown', function (e) { e.preventDefault(); self.applyUnderlineColor(c); });
                    ulGrid.appendChild(s);
                });
            }

            document.addEventListener('pointerdown', function (e) {
                if (!e.target.closest('.rt-dropdown')) self.closeDropdowns();
            });
        },

        /**
             * 获取当前容器的真实内外 Computed 字体数组
             */
        _getCurrentFontTuple: function () {
            var target = document.body;
            var sel = window.getSelection();
            if (sel.rangeCount > 0 && !sel.isCollapsed) { // 有选中区才算
                var anchor = sel.anchorNode;
                var el = anchor ? (anchor.nodeType === 3 ? anchor.parentNode : anchor) : null;
                if (el && el.closest && el.closest('[data-edit-id]')) target = el;
            } else {
                var container = getActiveEditContainer();
                if (container) target = container;
            }

            var ff = window.getComputedStyle(target).fontFamily;
            var fonts = ff.split(',').map(function (s) { return s.trim().replace(/['"]/g, ''); });
            var eng = fonts[0] || 'sans-serif';
            var zh = fonts.length > 1 ? fonts[1] : fonts[0];
            return { eng: eng, zh: zh };
        },

        /**
         * 实时同步状态按钮内的文字
         */
        syncFontIndicators: function () {
            var engBtn = document.getElementById('engFontToggle');
            var zhBtn = document.getElementById('zhFontToggle');
            if (!engBtn || !zhBtn) return;
            var t = this._getCurrentFontTuple();
            var engRaw = t.eng;
            var zhRaw = t.zh;

            function getShortName(raw, isZhFallback) {
                var name = raw;
                if (/YaHei/i.test(raw)) name = '微软雅黑';
                else if (/SimSun|Songti/i.test(raw)) name = '宋体';
                else if (/KaiTi/i.test(raw)) name = '楷体';
                else if (/FangSong/i.test(raw)) name = '仿宋';
                else if (/DengXian/i.test(raw)) name = '等线';
                else if (/PingFang/i.test(raw)) name = '苹方';
                else if (raw === 'sans-serif') name = isZhFallback ? '默认黑体' : '默认体系';
                else if (raw === 'serif') name = isZhFallback ? '默认宋体' : '默认衬线';
                else if (name.length > 12) name = name.substring(0, 10) + '..';
                return name;
            }

            var isPrimaryChinese = /[\u4e00-\u9fa5]|YaHei|SimSun|KaiTi|FangSong|Songti|PingFang|DengXian/i.test(engRaw);

            engBtn.innerHTML = '<span style="font-weight:700;">' + getShortName(engRaw, false) + '</span>';
            // 若英文被中文霸占，中文按钮显示关联状态
            if (isPrimaryChinese) {
                zhBtn.innerHTML = '<span style="font-size:0.9em;font-weight:500;color:var(--editor-text-muted);">(同左)</span>';
            } else {
                zhBtn.innerHTML = '<span style="font-weight:700;">' + getShortName(zhRaw, true) + '</span>';
            }
        },

        applyMixedFontFamily: function (fontFamily, type) {
            var t = this._getCurrentFontTuple();
            var engRaw = t.eng;
            var zhRaw = t.zh;

            var mergedFontStr = '';
            if (type === 'eng') {
                mergedFontStr = fontFamily + ", '" + zhRaw + "', sans-serif";
                // 如果左侧选的本来就是中文（用户执意要全段中文），直接应用即可，不需挂后面的尾巴
                var isChinese = /[\u4e00-\u9fa5]|YaHei|SimSun|KaiTi|FangSong|Songti|PingFang|DengXian/i.test(fontFamily);
                if (isChinese) mergedFontStr = fontFamily;
            } else if (type === 'zh') {
                mergedFontStr = "'" + engRaw + "', " + fontFamily + ", sans-serif";
            }

            var container = getActiveEditContainer();
            var sel = window.getSelection();

            if (sel.rangeCount > 0 && !sel.isCollapsed && container) {
                // 选中部分修改
                this.restoreSelection();
                document.execCommand('fontName', false, mergedFontStr);
            } else {
                // 无选区模式：修改全局层
                document.documentElement.style.setProperty('--font-body', mergedFontStr);
                document.documentElement.style.setProperty('--font-display', mergedFontStr);
                // 兼容 editor-test.html 等没有严谨使用 var() 而是写死 body { font-family } 的环境
                document.body.style.fontFamily = mergedFontStr;

                // 对所有标题元素强行压入字体（因为 h1~h6 有权重较高的独立定义）
                document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(function (h) {
                    h.style.fontFamily = mergedFontStr;
                });
            }

            if (container) PersistenceLayer.saveElement(container);
            window.historyMgr.recordState(true);
            this.closeDropdowns();
            this.syncFontIndicators();
        },

        /** 初始化字体选择菜单 */
        _initFontMenu: function (menuId, fontsArray, type) {
            var self = this;
            var menu = document.getElementById(menuId);
            if (!menu) return;

            fontsArray.forEach(function (f) {
                var opt = document.createElement('div');
                opt.className = 'font-option';
                opt.textContent = f.name;
                if (!f.family) {
                    opt.style.cssText = 'background:none; text-align:center; color:var(--editor-text-muted); font-size:10px; cursor:default;';
                } else {
                    opt.style.fontFamily = f.family;
                    opt.addEventListener('pointerdown', function (e) {
                        e.preventDefault();
                        self.applyMixedFontFamily(f.family, type);
                    });
                    opt.addEventListener('mouseenter', function () {
                        if (f.family) opt.style.fontFamily = f.family;
                    });
                }
                menu.appendChild(opt);
            });

            // 防止滚轮事件继续往外冒泡被其他东西错误拦截
            menu.addEventListener('wheel', function(e) {
                e.stopPropagation();
            }, { passive: true });
        }
    };

    // ========================================
    // 模块 5：EditorCore（编辑模式总控）
    // ========================================
    function EditorCore() {
        this.isActive = false;
        this.editableSet = new Set();
        this._navLocked = false;

        // 恢复持久化内容
        PersistenceLayer.restoreAllElements();
        PersistenceLayer.restoreNativeMods();
        this.refreshEditables();
        this._bindInputListener();
    }

    EditorCore.prototype = {
        refreshEditables: function () {
            this.editableSet = new Set(document.querySelectorAll('[data-edit-id]'));
            if (this.isActive) {
                this.editableSet.forEach(function (el) { el.setAttribute('contenteditable', 'true'); });
            }
            if (typeof RichTextToolbar !== 'undefined' && RichTextToolbar.syncFontIndicators) {
                RichTextToolbar.syncFontIndicators();
            }
        },

        toggleEditMode: function () {
            this.isActive = !this.isActive;
            var toggle = document.getElementById('editToggle');
            var toolbar = document.getElementById('richToolbar');

            if (this.isActive) {
                // 1. 获取几何中心最贴近视野的幻灯片
                var targetIndex = getCurrentSlideIndex();
                var slides = getAllSlides();
                if (slides[targetIndex]) {
                    // 2. 强制瞬间居中当前页面，矫正处于两页之间的尴尬位置
                    slides[targetIndex].scrollIntoView({ behavior: 'auto', block: 'center' });
                }

                // 3. 锁定全局滚动底盘
                document.documentElement.classList.add('editor-mode');
                document.body.classList.add('editor-mode');
                document.execCommand('styleWithCSS', false, true);
                if (toggle) toggle.classList.add('active');
                if (toolbar) toolbar.classList.add('visible');
                this.editableSet.forEach(function (el) { el.setAttribute('contenteditable', 'true'); });
                window.historyMgr.captureBaseline();
                this._navLocked = true;
                EditorHooks.fire('onEditModeEnter');
            } else {
                document.documentElement.classList.remove('editor-mode');
                document.body.classList.remove('editor-mode');
                if (toggle) toggle.classList.remove('active');
                if (toolbar) toolbar.classList.remove('visible');
                this.editableSet.forEach(function (el) { el.setAttribute('contenteditable', 'false'); });
                this._navLocked = false;
                EditorHooks.fire('onEditModeExit');
            }
        },

        _bindInputListener: function () {
            document.body.addEventListener('input', function (e) {
                if (window.historyMgr.isRestoring) return;
                if (e.target.isContentEditable) {
                    var editEl = e.target.closest ? e.target.closest('[data-edit-id]') : null;
                    if (editEl) PersistenceLayer.saveElement(editEl);
                    window.historyMgr.recordState(false);
                }
            });
        }
    };

    // ========================================
    // 初始化引导
    // ========================================
    var historyMgr = new HistoryManager();
    window.historyMgr = historyMgr;

    var editorCore = new EditorCore();
    window.editorCore = editorCore;

    RichTextToolbar.init();
    window.richToolbar = RichTextToolbar;

    BoxManager.init();
    window.boxManager = BoxManager;

    PersistenceLayer.loadCustomBoxes();

    // 编辑热区交互
    var hotzone = document.querySelector('.edit-hotzone');
    var editToggle = document.getElementById('editToggle');
    var hideTimeout = null;

    if (hotzone && editToggle) {
        hotzone.addEventListener('mouseenter', function () { clearTimeout(hideTimeout); editToggle.classList.add('show'); });
        hotzone.addEventListener('mouseleave', function () { hideTimeout = setTimeout(function () { if (!editorCore.isActive) editToggle.classList.remove('show'); }, 400); });
        editToggle.addEventListener('mouseenter', function () { clearTimeout(hideTimeout); });
        editToggle.addEventListener('mouseleave', function () { hideTimeout = setTimeout(function () { if (!editorCore.isActive) editToggle.classList.remove('show'); }, 400); });
        editToggle.addEventListener('click', function (e) { e.stopPropagation(); editorCore.toggleEditMode(); });
        hotzone.addEventListener('click', function () { editorCore.toggleEditMode(); });
    }

    // 添加文本框按钮
    var addBoxBtn = document.getElementById('addTextBoxBtn');
    if (addBoxBtn) {
        addBoxBtn.addEventListener('click', function () {
            var slides = getAllSlides();
            var cs = slides[getCurrentSlideIndex()];
            if (!cs) return;
            BoxManager.createTextBox('custom-' + Date.now(), '10%', '10%', null, cs);
            PersistenceLayer.saveCustomBoxes();
            historyMgr.recordState(true);
        });
    }

    // ========================================
    // 全局快捷键（捕获阶段，优先于导航脚本）
    // ========================================
    document.addEventListener('keydown', function (e) {
        // E 键切换编辑模式
        if ((e.key === 'e' || e.key === 'E') && !e.target.getAttribute('contenteditable')) {
            editorCore.toggleEditMode();
        }

        // Ctrl+Z 撤销
        if (editorCore.isActive && e.ctrlKey && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
            e.preventDefault(); historyMgr.undo();
        }

        // Ctrl+Y / Ctrl+Shift+Z 重做
        if (editorCore.isActive && ((e.ctrlKey && (e.key === 'y' || e.key === 'Y')) ||
            (e.ctrlKey && e.shiftKey && (e.key === 'z' || e.key === 'Z')))) {
            e.preventDefault(); historyMgr.redo();
        }

        // Ctrl+S 纯净导出
        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
            e.preventDefault(); PersistenceLayer.exportCleanHTML();
        }

        // 编辑模式下：拦截所有导航键（包括空格），防止误触翻页
        // 关键修复：在 contenteditable 内打空格不再触发翻页
        if (editorCore._navLocked) {
            var navKeys = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight',
                ' ', 'PageDown', 'PageUp', 'Home', 'End'];
            if (navKeys.indexOf(e.key) !== -1) {
                e.stopPropagation();
                if (!e.target.isContentEditable) {
                    e.preventDefault();
                }
            }
        }
    }, true); // 捕获阶段

    // 编辑模式下彻底阻止原生滚轮翻页与触控翻页
    document.addEventListener('wheel', function (e) {
        if (editorCore._navLocked) {
            // 放行富文本工具栏内的滚轮事件
            if (e.target.closest && e.target.closest('.rich-toolbar')) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
        }
    }, { capture: true, passive: false });

    document.addEventListener('touchmove', function (e) {
        if (editorCore._navLocked) {
            if (e.target.closest && e.target.closest('.rich-toolbar')) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
        }
    }, { capture: true, passive: false });

    // ========================================
    // 工具栏按钮事件绑定
    // ========================================
    var undoBtn = document.getElementById('undobtn');
    var redoBtn = document.getElementById('redobtn');
    if (undoBtn) undoBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); historyMgr.undo(); });
    if (redoBtn) redoBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); historyMgr.redo(); });

    // data-cmd 按钮自动绑定（pointerdown 保持焦点在编辑区）
    document.querySelectorAll('[data-cmd]').forEach(function (btn) {
        btn.addEventListener('pointerdown', function (e) {
            e.preventDefault();
            RichTextToolbar.restoreSelection();
            RichTextToolbar.execAndRecord(btn.getAttribute('data-cmd'));
        });
    });

    // 字号
    var fontUp = document.getElementById('fontSizeUp');
    var fontDown = document.getElementById('fontSizeDown');
    if (fontUp) fontUp.addEventListener('pointerdown', function (e) { e.preventDefault(); RichTextToolbar.changeFontSize(1); });
    if (fontDown) fontDown.addEventListener('pointerdown', function (e) { e.preventDefault(); RichTextToolbar.changeFontSize(-1); });

    // 颜色
    var colorToggle = document.getElementById('colorToggle');
    var bgToggle = document.getElementById('bgToggle');
    if (colorToggle) colorToggle.addEventListener('pointerdown', function (e) { e.preventDefault(); RichTextToolbar.toggleDropdown('colorDropdown'); });
    if (bgToggle) bgToggle.addEventListener('pointerdown', function (e) { e.preventDefault(); RichTextToolbar.toggleDropdown('bgDropdown'); });

    // 字体 (中英文分离)
    var engFontToggle = document.getElementById('engFontToggle');
    var zhFontToggle = document.getElementById('zhFontToggle');
    if (engFontToggle) engFontToggle.addEventListener('pointerdown', function (e) { e.preventDefault(); RichTextToolbar.toggleDropdown('engFontDropdown'); });
    if (zhFontToggle) zhFontToggle.addEventListener('pointerdown', function (e) { e.preventDefault(); RichTextToolbar.toggleDropdown('zhFontDropdown'); });

    // 顶标
    var rubyBtn = document.getElementById('rubyBtn');
    if (rubyBtn) rubyBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); RichTextToolbar.addRubyAnnotation(); });

    // 下划线颜色
    var ulColorToggle = document.getElementById('ulColorToggle');
    if (ulColorToggle) ulColorToggle.addEventListener('pointerdown', function (e) { e.preventDefault(); RichTextToolbar.toggleDropdown('ulColorDropdown'); });

    // 插入图片
    var imageToggle = document.getElementById('imageToggle');
    if (imageToggle) imageToggle.addEventListener('pointerdown', function (e) { e.preventDefault(); RichTextToolbar.toggleDropdown('imageDropdown'); });

    var applyImageBtn = document.getElementById('applyImageBtn');
    var imageUrlInput = document.getElementById('imageUrlInput');
    if (applyImageBtn && imageUrlInput) {
        applyImageBtn.addEventListener('click', function (e) {
            e.preventDefault();
            var url = imageUrlInput.value.trim();
            if (!url) return;
            var slides = getAllSlides(); var cs = slides[getCurrentSlideIndex()]; if (!cs) return;
            BoxManager.createImageBox('img-' + Date.now(), 'center', 'center', null, null, url, cs);
            PersistenceLayer.saveCustomBoxes();
            historyMgr.recordState(true);
            RichTextToolbar.closeDropdowns();
            imageUrlInput.value = '';
        });
    }

    var triggerImageFileBtn = document.getElementById('triggerImageFileBtn');
    var imageFileInput = document.getElementById('imageFileInput');
    if (triggerImageFileBtn && imageFileInput) {
        triggerImageFileBtn.addEventListener('click', function (e) { e.preventDefault(); imageFileInput.click(); });
        imageFileInput.addEventListener('change', function (e) {
            var file = e.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function (evt) {
                var img = new Image();
                img.onload = function () {
                    var canvas = document.createElement('canvas');
                    var maxW = 1000; var maxH = 1000;
                    var w = img.width; var h = img.height;
                    // 压缩算法
                    if (w > maxW) { h *= maxW / w; w = maxW; }
                    if (h > maxH) { w *= maxH / h; h = maxH; }
                    canvas.width = w; canvas.height = h;
                    var ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    var b64 = canvas.toDataURL((file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp'), 0.85);

                    var slides = getAllSlides(); var cs = slides[getCurrentSlideIndex()];
                    if (cs) {
                        BoxManager.createImageBox('img-' + Date.now(), 'center', 'center', null, null, b64, cs);
                        PersistenceLayer.saveCustomBoxes();
                        historyMgr.recordState(true);
                        RichTextToolbar.closeDropdowns();
                    }
                };
                img.src = evt.target.result;
            };
            reader.readAsDataURL(file);
            imageFileInput.value = '';
        });
    }

    // 插入超链接
    var linkToggle = document.getElementById('linkToggle');
    if (linkToggle) linkToggle.addEventListener('pointerdown', function (e) { e.preventDefault(); RichTextToolbar.toggleDropdown('linkDropdown'); });
    var applyLinkBtn = document.getElementById('applyLinkBtn');
    var linkUrlInput = document.getElementById('linkUrlInput');
    var removeLinkBtn = document.getElementById('removeLinkBtn');

    if (applyLinkBtn && linkUrlInput) {
        applyLinkBtn.addEventListener('click', function (e) {
            e.preventDefault();
            var url = linkUrlInput.value.trim();
            if (!url) return;
            if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
            RichTextToolbar.applyHyperlink(url);
            linkUrlInput.value = '';
        });
    }
    if (removeLinkBtn) {
        removeLinkBtn.addEventListener('click', function (e) {
            e.preventDefault();
            RichTextToolbar.removeHyperlink();
        });
    }

    // 防止在工具栏输入框中打字时触发快捷键
    document.querySelectorAll('.rt-dropdown-menu input').forEach(function (input) {
        input.addEventListener('keydown', function (e) { e.stopPropagation(); });
    });

    // 导出公共 API
    window.PersistenceLayer = PersistenceLayer;
    window.BoxManager = BoxManager;
    window.RichTextToolbar = RichTextToolbar;
    window.EditorHooks = EditorHooks;

    // ==========================================
    // 【架构级自愈：排版剥离与溢出解绑】
    // 1. 修复由于 CSS 中的 overflow: hidden 导致顶标（如 "批注" tag）超高时被切掉一半的问题
    document.querySelectorAll('.slide-content, .slide-inner').forEach(function(sc) {
        sc.style.overflow = 'visible';
    });

    // 2. 修复误将内联 tag 塞入 h1 等长文本块导致"物理粘连"（一选全选中）的问题
    document.querySelectorAll('[data-edit-id] .tag').forEach(function(tag) {
        var parentBlock = tag.closest('[data-edit-id]');
        // 只要 tag 还在别人肚子里，就立刻进行物理隔离剖腹产
        if (parentBlock && parentBlock !== tag) {
            // 如果用户是手敲的回车换行，tag 后面大概率跟着一个脏 <br>，一起消灭掉
            var sibling = tag.nextSibling;
            if (sibling && sibling.nodeType === 1 && sibling.tagName === 'BR') {
                sibling.remove();
            } else if (sibling && sibling.nodeType === 3 && sibling.textContent.trim() === '') {
                // 清理可能跟随的空文本节点
                if (sibling.nextSibling && sibling.nextSibling.tagName === 'BR') {
                    sibling.nextSibling.remove();
                }
                sibling.remove();
            }
            
            // 赋予它独立的人权（可编辑 ID）
            if (!tag.hasAttribute('data-edit-id')) {
                tag.setAttribute('data-edit-id', 'tag-' + Math.random().toString(36).substr(2, 6));
            }
            // 剥离并置于父块的头顶（由于 flex 它是会自动换行的）
            parentBlock.parentNode.insertBefore(tag, parentBlock);
        }
    });

    // 3. 实现顶标注音文字（rt）的交互解耦：拦截双击/三击导致选中穿透主文本的通病
    document.addEventListener('mousedown', function(e) {
        if (e.detail >= 2) {
            var rt = e.target.closest('rt');
            if (rt) {
                // 阻止浏览器默认的双击切词或三击全行选中的穿透行为
                e.preventDefault();
                e.stopPropagation();
                // 强制建立一个精确包裹整个顶标内部文本的安全选区
                var sel = window.getSelection();
                var range = document.createRange();
                range.selectNodeContents(rt);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }
    });

})();
