/* ===========================================
   EDITOR-HISTORY.JS
   HTML-Slides 编辑器 — 按页撤销/重做管理器
   依赖：editor-utils.js (window._editorUtils)
   运行时依赖：window.editorCore, window.BoxManager, window.PersistenceLayer
   暴露：window.HistoryManager (构造函数，由 editor-core.js 创建实例)
   =========================================== */

(function () {
    'use strict';

    var utils = window._editorUtils;
    var getAllSlides = utils.getAllSlides;
    var getCurrentSlideIndex = utils.getCurrentSlideIndex;

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
            // 安全网：如果当前页尚未拍过基线快照，则先补拍一张"操作前原貌"
            // 这样 undo 栈至少有 2 条记录（基线 + 本次），第一次操作也能撤销
            if (stack.undo.length === 0) {
                this.captureBaseline();
            }
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
                window.BoxManager.rehydrateSlide(slide);
                window.PersistenceLayer.syncFromDOM(slide);
                // innerHTML 替换导致浏览器重新触发入场动画，瞬间完成它们
                if (slide.getAnimations) {
                    try {
                        slide.getAnimations({ subtree: true }).forEach(function (a) { a.finish(); });
                    } catch (e) {}
                }
                
                // 【灾后抢修机制】：恢复 innerHTML 后，DOM 节点属于全新重建，所有 JS 事件均已剥离
                // 必须在此处重新唤醒并注入包含气泡、选项连线等复杂挂载了交互的组件
                if (window.initQuizAnnotation) {
                    slide.querySelectorAll('.quiz-annotation').forEach(function(qa) {
                        // 第一步：净化 — 剥离残留在HTML快照中的动态生成节点（栏头、按钮容器等）
                        // 这些节点的事件绑定已随 innerHTML 替换而灰飞烟灭
                        if (window.stripDynamicQAElements) {
                            window.stripDynamicQAElements(qa);
                        }
                        // 第二步：撕掉初始化标签，让 init 认为是全新的组件
                        qa.removeAttribute('data-qa-initialized');
                        // 第三步：从零重建 — 重新创建所有动态元素并绑定全套事件
                        window.initQuizAnnotation(qa);
                    });
                }
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

    window.HistoryManager = HistoryManager;

})();
