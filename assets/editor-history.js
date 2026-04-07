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
