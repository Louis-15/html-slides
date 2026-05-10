/* ===========================================
   quiz-constants.js
   答题与批注组件 — 常量与选择器
   依赖：quiz-core.js
   =========================================== */

(function () {
  'use strict';
  var QA = window.QA = window.QA || {};

  /* =========================================
     题型标签映射
     ========================================= */

  QA.READING_TYPE_LABELS = {
    single: '阅读单选',
    matching: '阅读七选五',
    blank: '阅读填空',
    analysis: '文章解析'
  };

  /* =========================================
     Doodle 穿透选择器
     ========================================= */

  QA.DOODLE_PASSTHROUGH_BUTTON_SELECTOR = '.qa-divider-btn, .qa-notes-collapse-btn, .note-badge, .qa-note-handle, .qa-note-action-btn, .qa-submit-btn';

  /* =========================================
     删除线格式化图标 SVG
     ========================================= */

  QA.REMOVE_FORMAT_TOOL_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#7F8C8D;"><path d="m16 22-1-4"/><path d="M19 14a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2h-3a1 1 0 0 1-1-1V4a2 2 0 0 0-4 0v5a1 1 0 0 1-1 1H6a2 2 0 0 0-2 2v1a1 1 0 0 0 1 1"/><path d="M19 14H5l-1.973 6.767A1 1 0 0 0 4 22h16a1 1 0 0 0 .973-1.233z"/><path d="m8 22 1-4"/></svg>';

})();
