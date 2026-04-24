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

    /**
     * localStorage 以“文件路径优先、标题兜底”生成命名空间。
     * 旧实现只看 document.title，不同课件同标题时会出现串缓存风险。
     */
    function getStorageIdentity() {
        var pathname = '';
        try {
            pathname = decodeURIComponent(location.pathname || '');
        } catch (e) {
            pathname = location.pathname || '';
        }
        return pathname || document.title || 'untitled';
    }

    var LEGACY_FILE_HASH = hashTitle(document.title || 'untitled');
    var FILE_HASH = hashTitle(getStorageIdentity());
    function storageKey(suffix) { return 'hslides:' + FILE_HASH + ':' + suffix; }
    function legacyStorageKey(suffix) { return 'hslides:' + LEGACY_FILE_HASH + ':' + suffix; }

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

    /* 全量可编辑选择器：覆盖幻灯片内所有承载文本的叶子容器。
     * 这里上移到 utils，是为了让“稳定 data-edit-id 准备器”能在 editor-core 恢复 localStorage、
     * 以及 annotation-store 回放 sidecar 之前就复用同一套候选范围，避免不同模块各自维护一份名单。 */
    var EDITABLE_SELECTOR = [
        /* 带有显式编辑标记的元素（向后兼容） */
        '[data-edit-id]',
        /* Zone 1 标题栏 */
        '.header-module',
        '.header-title',
        /* 卡片系 */
        '.card-icon',
        '.card-title',
        '.card-desc',
        '.card-label',
        '.card-text',
        /* 翻转卡片 */
        '.flip-icon',
        '.flip-icon-big',
        '.flip-title',
        '.flip-subtitle',
        '.flip-detail',
        /* 数字强调卡片 */
        '.stat-number',
        '.stat-label',
        '.stat-desc',
        /* 高亮卡片 */
        '.highlight-label',
        '.highlight-title',
        '.highlight-text',
        /* 时间线 */
        '.timeline-text',
        /* 表格单元格 */
        '.table-wrap td',
        '.table-wrap th',
        /* 内容块与排版元素 */
        '.content-block',
        '.text',
        /* 封面标题组 */
        '.title-hero-subject',
        '.title-hero-heading',
        '.title-hero-author',
        /* 通用排版 */
        '.slide-tag',
        '.subtitle',
        'h1',
        'h2',
        'h3',
        /* 总结面板 */
        '.summary-content h3',
        '.summary-content li',
        /* 代码窗口文件名 */
        '.code-filename',
        /* 折叠卡片展开区 */
        '.card-expand-inner',
        /* 答题与批注：正文与答题选项系统 */
        '.qa-passage p',
        '.qa-answer-title',
        '.qa-question p',
        '.qa-question-text',
        '.qa-option-text',
        '.qa-option-label',
        '.qa-drag-option',
        '.qa-note-content',
    ].join(', ');

    /* 不允许被编辑的元素黑名单（防止误伤控件） */
    var EDITABLE_BLACKLIST = [
        '.rich-toolbar',
        '.edit-toggle',
        '.edit-hotzone',
        '.slide-nav',
        '.slide-counter',
        '.progress-bar',
        '.branding',
        '.summary-trigger',
        '.nav-hints',
        '.flip-action-btn',
        '.collapse-action-btn',
        '#doodleToolbar',
        '#doodleToggleBtn',
        'script',
        'style',
        'button',
    ].join(', ');

    /* quiz 右侧选项文本仍走组件专属恢复协议。
     * 如果这里提前塞入通用 data-edit-id，会让 localStorage / sidecar 的通用元素恢复链路
     * 与 answer-anchor 专属恢复链路发生覆盖顺序竞争，因此稳定 id 准备器需要显式跳过它。 */
    var STABLE_ID_SKIP_SELECTOR = '.quiz-annotation .qa-option-text';

    function getEditableCandidates(root) {
        var scope = root && root.querySelectorAll ? root : document;
        var selector = scope === document
            ? '.slide ' + EDITABLE_SELECTOR.split(', ').join(', .slide ')
            : EDITABLE_SELECTOR;
        var candidates = scope.querySelectorAll(selector);
        var filtered = [];
        candidates.forEach(function (el) {
            if ((EDITABLE_BLACKLIST && el.matches(EDITABLE_BLACKLIST)) ||
                (EDITABLE_BLACKLIST && el.closest(EDITABLE_BLACKLIST))) {
                return;
            }
            filtered.push(el);
        });
        return filtered;
    }

    function buildStableNodePath(el, boundary) {
        var parts = [];
        var node = el;
        while (node && node !== boundary) {
            var parent = node.parentElement;
            if (!parent) break;
            parts.unshift(Array.prototype.indexOf.call(parent.children, node));
            node = parent;
        }
        return parts.length ? parts.join('-') : '0';
    }

    function pickStableRole(el) {
        var classTokens = Array.prototype.slice.call(el.classList || []);
        var preferred = classTokens.find(function (token) {
            return token && token !== 'active' && token.indexOf('anim-') !== 0;
        });
        return (preferred || el.tagName || 'node').replace(/[^a-z0-9_-]+/ig, '-').toLowerCase();
    }

    function buildStableEditableId(el) {
        var existing = el.getAttribute('data-edit-id');
        if (existing) return existing;

        var slide = el.closest('.slide');
        var slides = getAllSlides();
        var slideIndex = slide ? Array.prototype.indexOf.call(slides, slide) : -1;
        var scopeRoot = slide || document.body;

        return '_auto_stable_' +
            (slideIndex >= 0 ? 's' + slideIndex : 'global') + '_' +
            pickStableRole(el) + '_' +
            buildStableNodePath(el, scopeRoot);
    }

    /**
     * 为缺少源级 data-edit-id 的普通可编辑根块补“确定性稳定 id”。
     * 目标不是把这些 id 立刻当成作者手写的永久 schema，而是保证：
     * 1. restoreAllElements / annotation-store 在恢复阶段就能命中普通标题、卡片、总结区等节点；
     * 2. 同一份 deck 在每次重新打开时，生成的 id 都一致，不再依赖 Date.now() 这类瞬时值；
     * 3. quiz 内仍有组件专属恢复协议的区域，不会被通用链路抢写。
     */
    function ensureStableEditableIds(root) {
        getEditableCandidates(root).forEach(function (el) {
            if (el.getAttribute('data-edit-id')) return;
            if (STABLE_ID_SKIP_SELECTOR && el.matches(STABLE_ID_SKIP_SELECTOR)) return;
            el.setAttribute('data-edit-id', buildStableEditableId(el));
            el.setAttribute('data-edit-id-auto', 'true');
        });
    }

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
        getStorageIdentity: getStorageIdentity,
        FILE_HASH: FILE_HASH,
        LEGACY_FILE_HASH: LEGACY_FILE_HASH,
        storageKey: storageKey,
        legacyStorageKey: legacyStorageKey,
        getActiveEditContainer: getActiveEditContainer,
        getCurrentSlideIndex: getCurrentSlideIndex,
        getAllSlides: getAllSlides,
        EDITABLE_SELECTOR: EDITABLE_SELECTOR,
        EDITABLE_BLACKLIST: EDITABLE_BLACKLIST,
        getEditableCandidates: getEditableCandidates,
        buildStableEditableId: buildStableEditableId,
        ensureStableEditableIds: ensureStableEditableIds
    };

    if (document && document.dispatchEvent) {
        var editorUtilsReadyEvent;
        try {
            editorUtilsReadyEvent = new window.CustomEvent('editor-utils-ready');
        } catch (e) {
            editorUtilsReadyEvent = document.createEvent('Event');
            editorUtilsReadyEvent.initEvent('editor-utils-ready', false, false);
        }
        document.dispatchEvent(editorUtilsReadyEvent);
    }

})();
