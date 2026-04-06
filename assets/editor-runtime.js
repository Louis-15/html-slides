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

    /** 获取当前幻灯片索引（兼容 scroll-snap 和 .deck 架构） */
    function getCurrentSlideIndex() {
        if (window.presentation && typeof window.presentation.currentSlideIndex === 'number') return window.presentation.currentSlideIndex;
        if (typeof window.current === 'number') return window.current;
        return 0;
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

        /** 保存所有自定义文本框的位置和内容 */
        saveCustomBoxes: function () {
            var slides = getAllSlides();
            var boxes = [];
            document.querySelectorAll('.editable-wrap.custom-box').forEach(function (wrap) {
                var slide = wrap.closest('.slide');
                var slideIndex = Array.from(slides).indexOf(slide);
                var editArea = wrap.querySelector('[data-edit-id]');
                if (!editArea) return;
                boxes.push({
                    si: slideIndex,
                    id: editArea.getAttribute('data-edit-id'),
                    l: wrap.style.left,
                    t: wrap.style.top,
                    c: editArea.innerHTML
                });
            });
            try { localStorage.setItem(storageKey('boxes'), JSON.stringify(boxes)); } catch (e) { }
        },

        /** 从 localStorage 加载自定义文本框 */
        loadCustomBoxes: function () {
            try {
                var saved = localStorage.getItem(storageKey('boxes'));
                if (!saved) return;
                var boxes = JSON.parse(saved);
                var slides = getAllSlides();
                boxes.forEach(function (db) {
                    if (document.querySelector('[data-edit-id="' + db.id + '"]')) return;
                    var ts = slides[db.si];
                    if (ts) BoxManager.createTextBox(db.id, db.l, db.t, db.c, ts);
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

            // 移除浮动控件
            clone.querySelectorAll('.floating-controls, .overlay-ctrl').forEach(function (el) { el.remove(); });

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
         * 原生元素：控件作为 el 的子元素
         * 自定义文本框：控件作为 .editable-wrap 的子元素
         */
        _injectControls: function (el) {
            // 如果已经有控件条则跳过
            var wrap = el.closest('.editable-wrap');
            var target = wrap || el;

            if (target.querySelector('.box-controls')) return;

            // td 元素不注入（表格单元格拖不动）
            if (el.tagName === 'TD' || el.tagName === 'TH') return;

            // 让原生元素也具备 position: relative 以便控件绝对定位
            if (!wrap) {
                var cs = window.getComputedStyle(el);
                if (cs.position === 'static') el.style.position = 'relative';
            }

            var controls = document.createElement('div');
            controls.className = 'box-controls';
            controls.innerHTML = '<span class="drag-handle" title="按住拖动📍">📍</span><span class="del-btn" title="删除/隐藏">✖</span>';

            target.appendChild(controls);

            // 绑定拖拽
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
                    dragState = {
                        target: wrap,
                        startX: e.clientX, startY: e.clientY,
                        initLeft: parseInt(wrap.style.left) || wrap.offsetLeft,
                        initTop: parseInt(wrap.style.top) || wrap.offsetTop,
                        type: 'abs'
                    };
                } else {
                    var tx = BoxManager._parseTranslate(el);
                    dragState = {
                        target: el,
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

        /** 绑定删除/隐藏逻辑 */
        _bindDelete: function (btn, el, wrap) {
            btn.addEventListener('click', function () {
                if (!window.editorCore || !window.editorCore.isActive) return;
                var isCustom = wrap && wrap.classList.contains('custom-box');
                var msg = isCustom ? '确定要删除这个文本框吗？' : '确定要隐藏此文本框吗？';
                if (!confirm(msg)) return;

                if (isCustom) {
                    var id = el.getAttribute('data-edit-id');
                    wrap.remove();
                    try { localStorage.removeItem(storageKey('e:' + id)); } catch (e) { }
                    PersistenceLayer.saveCustomBoxes();
                } else {
                    el.style.display = 'none';
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
            wrap.className = 'editable-wrap custom-box';
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

        /** DOM 恢复后重新绑定事件 */
        rehydrateSlide: function (slideEl) {
            if (!slideEl) return;
            var self = this;
            slideEl.querySelectorAll('[data-edit-id]').forEach(function (el) {
                self._injectControls(el);
            });
            // 自定义文本框的输入事件
            slideEl.querySelectorAll('.editable-wrap.custom-box [data-edit-id]').forEach(function (editArea) {
                editArea.addEventListener('input', function () {
                    if (window.editorCore && window.editorCore.isActive) {
                        PersistenceLayer.saveElement(editArea);
                        PersistenceLayer.saveCustomBoxes();
                    }
                });
            });
        }
    };

    // ========================================
    // 模块 4：RichTextToolbar（富文本工具栏）
    // ========================================
    var RichTextToolbar = {
        savedRange: null,

        /** 可选字体列表（源自 STYLE_PRESETS.md 推荐，禁用 Inter/Arial 等 AI 泛型字体） */
        FONTS: [
            { name: 'Space Grotesk', family: "'Space Grotesk', sans-serif" },
            { name: 'Manrope', family: "'Manrope', sans-serif" },
            { name: 'Plus Jakarta Sans', family: "'Plus Jakarta Sans', sans-serif" },
            { name: 'Outfit', family: "'Outfit', sans-serif" },
            { name: 'DM Sans', family: "'DM Sans', sans-serif" },
            { name: 'Work Sans', family: "'Work Sans', sans-serif" },
            { name: 'IBM Plex Sans', family: "'IBM Plex Sans', sans-serif" },
            { name: 'Syne', family: "'Syne', sans-serif" },
            { name: 'Archivo', family: "'Archivo', sans-serif" },
            { name: 'Cormorant', family: "'Cormorant', serif" },
            { name: 'Bodoni Moda', family: "'Bodoni Moda', serif" },
            { name: 'Fraunces', family: "'Fraunces', serif" },
            { name: 'JetBrains Mono', family: "'JetBrains Mono', monospace" },
            { name: 'Space Mono', family: "'Space Mono', monospace" }
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
                    }
                }
            });

            this._initPalettes();
            this._initFontMenu();
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
            range.insertNode(fragment);
            container.normalize();
            PersistenceLayer.saveElement(container);
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
            if (m) m.classList.toggle('show');
        },

        closeDropdowns: function () {
            document.querySelectorAll('.rt-dropdown-menu.show').forEach(function (m) { m.classList.remove('show'); });
        },

        /** 初始化调色板 */
        _initPalettes: function () {
            var self = this;
            var tc = ['#000000','#2C3E50','#7F8C8D','#BDC3C7','#E74C3C','#E67E22','#F1C40F','#2ECC71','#1ABC9C','#3498DB','#9B59B6','#FFFFFF'];
            var hc = ['#F5B7B1','#FAD7A1','#F9E79F','#A9DFBF','#A3E4D7','#AED6F1','#D2B4DE','#EBDEF0','#E5E7E9','#EAEDED','#D5C4A1','transparent'];
            var tg = document.querySelector('.text-colors');
            var bg = document.querySelector('.bg-colors');

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

        /** 初始化字体选择菜单 */
        _initFontMenu: function () {
            var self = this;
            var menu = document.getElementById('fontDropdown');
            if (!menu) return;

            this.FONTS.forEach(function (f) {
                var opt = document.createElement('div');
                opt.className = 'font-option';
                opt.textContent = f.name;
                opt.style.fontFamily = f.family;
                opt.addEventListener('pointerdown', function (e) {
                    e.preventDefault();
                    self.applyFontFamily(f.family);
                });
                menu.appendChild(opt);
            });
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
        },

        toggleEditMode: function () {
            this.isActive = !this.isActive;
            var toggle = document.getElementById('editToggle');
            var toolbar = document.getElementById('richToolbar');

            if (this.isActive) {
                document.body.classList.add('editor-mode');
                document.execCommand('styleWithCSS', false, true);
                if (toggle) toggle.classList.add('active');
                if (toolbar) toolbar.classList.add('visible');
                this.editableSet.forEach(function (el) { el.setAttribute('contenteditable', 'true'); });
                window.historyMgr.captureBaseline();
                this._navLocked = true;
                EditorHooks.fire('onEditModeEnter');
            } else {
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
                // 无论是否在 contenteditable 内，都阻止冒泡（防止 slides-runtime 接收到事件）
                e.stopPropagation();

                // 不在 contenteditable 内时，还需要阻止默认行为（如页面滚动）
                if (!e.target.isContentEditable) {
                    e.preventDefault();
                }
            }
        }
    }, true); // 捕获阶段

    // 编辑模式下阻止滚轮翻页
    document.addEventListener('wheel', function (e) {
        if (editorCore._navLocked) e.stopPropagation();
    }, true);

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

    // 字体
    var fontToggle = document.getElementById('fontToggle');
    if (fontToggle) fontToggle.addEventListener('pointerdown', function (e) { e.preventDefault(); RichTextToolbar.toggleDropdown('fontDropdown'); });

    // 顶标
    var rubyBtn = document.getElementById('rubyBtn');
    if (rubyBtn) rubyBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); RichTextToolbar.addRubyAnnotation(); });

    // 下划线颜色
    var ulColorToggle = document.getElementById('ulColorToggle');
    if (ulColorToggle) ulColorToggle.addEventListener('pointerdown', function (e) { e.preventDefault(); RichTextToolbar.toggleDropdown('ulColorDropdown'); });

    // 导出公共 API
    window.PersistenceLayer = PersistenceLayer;
    window.BoxManager = BoxManager;
    window.RichTextToolbar = RichTextToolbar;
    window.EditorHooks = EditorHooks;

})();
