/* ===========================================
   EDITOR-UTILS.JS
   HTML-Slides 编辑器 — 工具函数 + 插件钩子系统
   依赖：无（最先加载）
   暴露：window.EditorHooks, window._editorUtils
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
        if (window.RichTextToolbar && window.RichTextToolbar.savedRange) {
            var sr = window.RichTextToolbar.savedRange;
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

        // 优先根据现代排版引擎的 .active 标识来判定
        for (var idx = 0; idx < slides.length; idx++) {
            if (slides[idx].classList.contains('active')) {
                return idx;
            }
        }

        // 回退逻辑：几何推算当前最居中的幻灯片索引（适用于传统瀑布流长图排版）
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
    // 预留插件钩子（供涂鸦、录音等模块使用）
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
    // 暴露到全局
    // ========================================
    window.EditorHooks = EditorHooks;
    window._editorUtils = {
        hashTitle: hashTitle,
        FILE_HASH: FILE_HASH,
        storageKey: storageKey,
        getActiveEditContainer: getActiveEditContainer,
        getCurrentSlideIndex: getCurrentSlideIndex,
        getAllSlides: getAllSlides
    };

})();
