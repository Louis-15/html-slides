/* ===========================================
   quiz-init.js
   答题与批注组件 — 初始化总控（最后加载）
   依赖：所有其他 quiz-* 模块
   =========================================== */

(function () {
  'use strict';
  var QA = window.QA = window.QA || {};

  /* === 模块级变量 === */
  var editorModeSyncBound = false;

  /* =========================================
     编辑模式同步
     ========================================= */

  QA.bindEditorModeSync = function () {
    if (editorModeSyncBound) return;
    editorModeSyncBound = true;

    var sync = function () {
      document.querySelectorAll('.quiz-annotation').forEach(function (qa) {
        QA.hideQASelectionToolbars(qa);
      });
      QA.syncAllNotesPanelsForCurrentMode();
    };
    var lastEditorMode = QA.isEditorMode();

    if (window.EditorHooks && typeof window.EditorHooks.register === 'function') {
      window.EditorHooks.register('onEditModeEnter', sync);
      window.EditorHooks.register('onEditModeExit', sync);
    }

    // ★ 注册 onExportClean 钩子：持久化逻辑统一放在 quiz-persistence.js 中处理
    QA.registerOnExportClean();

    if (typeof MutationObserver === 'function' && document.documentElement && document.body) {
      var observer = new MutationObserver(function () {
        var currentEditorMode = QA.isEditorMode();
        if (currentEditorMode === lastEditorMode) return;
        lastEditorMode = currentEditorMode;
        sync();
      });

      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
  };

  /* =========================================
     灾后净化函数
     ========================================= */

  /**
   * 【灾后净化函数】：剥离所有运行时生成的动态DOM元素
   * 在 HistoryManager._restoreState 通过 innerHTML 恢复DOM后，
   * 恢复出的HTML中残留着首次初始化时注入的动态节点（栏头、按钮容器、工具条等），
   * 但这些节点上的 JavaScript 事件绑定已经全部丢失。
   * 必须先将它们剥离干净，让 initQuizAnnotation 从零重建并正确绑定事件。
   */
  QA.stripDynamicElements = function (qa) {
    // 1. 剥离栏头（initNotesHeader 会重建，需要重新绑定折叠按钮事件）
    var header = qa.querySelector('.qa-notes-header');
    if (header) header.remove();

    // 2. 解包 .qa-notes-list 容器 — 将气泡搬回 .qa-notes-panel 再移除空壳
    var notesList = qa.querySelector('.qa-notes-list');
    if (notesList) {
      var panel = notesList.parentNode;
      // 先收集所有气泡，再逐个移出（避免迭代过程中DOM变动）
      Array.from(notesList.children).forEach(function (child) { return panel.appendChild(child); });
      notesList.remove();
    }

    // 3. 剥离各气泡上的动态操作按钮容器（initNoteInteractions 会重建）
    qa.querySelectorAll('.qa-note-actions').forEach(function (a) { return a.remove(); });

    // 4. 剥离分割线悬浮按钮（initDividerButton 会重建）
    qa.querySelectorAll('.qa-divider-btn').forEach(function (b) { return b.remove(); });

    // 5. 剥离浮动批注工具条（initAnnotationToolbar 会重建）
    QA.removeAnnotationToolbar(qa);
    qa.querySelectorAll('.qa-annotation-toolbar').forEach(function (t) { return t.remove(); });
    qa.querySelectorAll('.qa-note-fragment-toolbar').forEach(function (t) { return t.remove(); });
    qa.querySelectorAll('.qa-note-placeholder').forEach(function (p) { return p.remove(); });

    // 6. 清除 data-scrollable 标记（initQuizAnnotation 会重新添加）
    qa.querySelectorAll('[data-scrollable]').forEach(function (el) { return el.removeAttribute('data-scrollable'); });

    // 7. 剥离七选五运行时插入的固定槽位与滚动包装层
    qa.querySelectorAll('.qa-answer-slots, .qa-slots-divider').forEach(function (el) { return el.remove(); });
    qa.querySelectorAll('.qa-answer-options-scroll').forEach(function (wrapper) {
      var parent = wrapper.parentNode;
      Array.from(wrapper.children).forEach(function (child) { return parent.appendChild(child); });
      wrapper.remove();
    });
  };

  /* =========================================
     核心初始化
     ========================================= */

  /**
   * quiz-annotation 主初始化函数
   * 外部可通过 window.initQuizAnnotation(qa) 调用
   */
  QA.initQuizAnnotation = function (qa) {
    if (!qa) return;

    /* editor mode 的工具条/面板同步不能只靠 autoInit 首次批量初始化。
       撤销恢复、局部重建和测试桩都会直接调用 initQuizAnnotation(qa)；
       这里幂等地补绑一次 editor-mode sync，才能保证 onEditModeExit 一定能把浮动工具条收掉。 */
    QA.bindEditorModeSync();

    if (qa.dataset.qaInitialized) return;
    qa.dataset.qaInitialized = 'true';

    // 标记可滚动区域
    qa.querySelectorAll('.qa-passage, .qa-answer-content, .qa-notes-list').forEach(function (el) {
      el.setAttribute('data-scrollable', '');
    });

    // 清洗已存在锚点的首尾不当空格
    qa.querySelectorAll('.text-anchor, .answer-anchor').forEach(function (anchor) {
      QA.trimAnchorWhitespaces(anchor);
      QA.ensureAnchorTextVisualLayer(anchor);
    });

    qa.querySelectorAll('.qa-passage .qa-blank-slot[data-blank-id]').forEach(function (slot) {
      QA.trimBlankSlotWhitespaces(slot);
    });

    // 清除已删除的批注（从原始 HTML 中清除残留的锚点和气泡）
    QA.purgeDeletedNotes(qa);

    // 将任何由于历史生成的 HTML 硬编码带来的旧气泡自动迁移至新的 qa-note-header 结构
    QA.migrateLegacyBubbles(qa);

    // 初始化批注面板栏头（动态生成 header + notes-list 结构）
    QA.initNotesHeader(qa);

    // 扫描孤儿锚点
    QA.rebuildOrphanBubbles(qa);

    // 统一把新旧 HTML 拉回到同一 linkId 双端点模型
    QA.normalizeAllBubbleEndpointStates(qa);

    // 刷新后可能有孤儿气泡与源码气泡共存，需统一按原文顺序重排和编号
    QA.recalcStepNumbers(qa);

    // 初始化各子系统
    QA.bindDoodleModePassthrough();
    QA.initNoteInteractions(qa);
    QA.initDragAndDrop(qa);
    QA.initQuizSystem(qa);
    QA.initAnnotationToolbar(qa);
    QA.initDividerButton(qa);

    // 角标避让
    QA.arrangeAdjacentBadges(qa);

    QA.syncNotesPanelForCurrentMode(qa);

    // 初始化进度指示器
    QA.updateProgressCounter(qa);

    // 初始分割线位置
    requestAnimationFrame(function () { return QA.updateDividerPositions(qa); });

    // 为所有 AI 原生气泡绑定内容编辑事件，确保编辑后触发 JSON 保存
    qa.querySelectorAll('.qa-note-content[data-edit-id]').forEach(function (contentEl) {
      contentEl.addEventListener('input', function () {
        if (window.PersistenceLayer && typeof window.PersistenceLayer.saveElement === 'function') {
          window.PersistenceLayer.saveElement(contentEl);
        }
        QA.scheduleAnnotationSave();
      });
      contentEl.addEventListener('blur', function () {
        if (window.PersistenceLayer && typeof window.PersistenceLayer.saveElement === 'function') {
          window.PersistenceLayer.saveElement(contentEl);
        }
        QA.scheduleAnnotationSave();
      });
    });

    // 创建 AnnotationStore 状态指示器
    QA._initStoreUI(qa);
  };

  /* =========================================
     自动初始化与页面切换
     ========================================= */

  // 暴露给编辑器引擎：撤销/重做恢复 DOM 后，重新唤醒交互
  window.initQuizAnnotation = QA.initQuizAnnotation;
  window.stripDynamicQAElements = QA.stripDynamicElements;

  // 自动标记并初始化
  function autoInit() {
    function doInit() {
      QA.bindEditorModeSync();
      document.querySelectorAll('.quiz-annotation').forEach(function (qa) {
        // 标记 data-steppable 使 step-through.js 能匹配到 annotation 步进策略
        if (!qa.hasAttribute('data-steppable')) {
          qa.setAttribute('data-steppable', 'annotation');
        }
        QA.initQuizAnnotation(qa);
      });
    }

    // 如果 AnnotationStore 存在，等它加载完 JSON 数据后再初始化
    if (window.AnnotationStore && window.AnnotationStore.whenReady) {
      window.AnnotationStore.whenReady().then(doInit).catch(doInit);
    } else {
      doInit();
    }
  }

  // 在 DOMContentLoaded 或者立即执行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }

  // 监听页面切换，重置步进索引
  if (typeof window.addSlideChangeListener === 'function') {
    window.addSlideChangeListener(function (currentIdx, prevIdx) {
      QA.annotationStepIndex = -1;
      // 退出关联模式
      QA.exitLinkingMode();
      var qa = QA.getActiveQA();
      if (qa) {
        QA.syncNotesPanelForCurrentMode(qa);
        requestAnimationFrame(function () { return QA.updateDividerPositions(qa); });
      }
    });
  }

})();
