/* ===========================================
   quiz-linking.js
   答题与批注组件 — 关联模式
   依赖：quiz-core.js、quiz-panel.js
   =========================================== */

(function () {
  'use strict';
  var QA = window.QA = window.QA || {};

  /* === 跨模块变量（挂载到 window 供 quiz-toolbar.js 等读取） === */
  window.linkingState = null; // { qa, bubble, direction: 'left'|'right' }
  window.qaSelectionPointerActive = false;
  window.qaSelectionPointerOwner = null;
  var qaToolbarOwnerSeq = 0;

  /* =========================================
     关联模式入口/出口
     ========================================= */

  /** 进入关联模式 */
  QA.enterLinkingMode = function (qa, bubble, direction) {
    window.linkingState = { qa: qa, bubble: bubble, direction: direction };

    // 添加视觉反馈（呼吸高亮边框）
    if (direction === 'left') {
      qa.classList.add('linking-left');
    } else {
      qa.classList.add('linking-right');
    }

    // Esc 键退出
    document.addEventListener('keydown', linkingEscHandler);
  };

  /** 退出关联模式 */
  QA.exitLinkingMode = function () {
    if (!window.linkingState) return;
    var qa = window.linkingState.qa;
    qa.classList.remove('linking-left', 'linking-right');
    window.linkingState = null;
    document.removeEventListener('keydown', linkingEscHandler);
    // 隐藏关联工具条
    var toolbar = QA.getAnnotationToolbar(qa);
    if (toolbar) toolbar.classList.remove('visible');
  };

  function linkingEscHandler(e) {
    if (e.key === 'Escape') {
      QA.exitLinkingMode();
    }
  }

  /* =========================================
     工具栏归属管理
     ========================================= */

  QA.ensureQAToolbarOwnerId = function (qa) {
    if (!qa) return '';
    if (!qa.dataset.qaToolbarOwner) {
      qaToolbarOwnerSeq += 1;
      qa.dataset.qaToolbarOwner = 'qa-toolbar-' + qaToolbarOwnerSeq;
    }
    return qa.dataset.qaToolbarOwner;
  };

  QA.getAnnotationToolbar = function (qa) {
    if (!qa) return null;
    var ownerId = QA.ensureQAToolbarOwnerId(qa);
    return document.body.querySelector('.qa-annotation-toolbar[data-qa-toolbar-owner="' + ownerId + '"]');
  };

  QA.getNoteFragmentToolbar = function (qa) {
    if (!qa) return null;
    return qa.querySelector('.qa-note-fragment-toolbar');
  };

  QA.removeAnnotationToolbar = function (qa) {
    var toolbar = QA.getAnnotationToolbar(qa);
    if (toolbar) toolbar.remove();
  };

  /* =========================================
     选区工具条管理
     ========================================= */

  QA.updateSelectionToolbars = function (qa) {
    if (!qa) return;

    var anchorToolbar = QA.getAnnotationToolbar(qa);
    var noteToolbar = QA.getNoteFragmentToolbar(qa);
    if (!anchorToolbar || !noteToolbar) return;

    QA.clearToolbarDropdownMenus(anchorToolbar);
    QA.clearToolbarDropdownMenus(noteToolbar);

    if (!QA.isEditorMode()) {
      QA.hideQASelectionToolbars(qa);
      return;
    }

    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      QA.hideQASelectionToolbars(qa);
      return;
    }

    var range = sel.getRangeAt(0);
    var commonNode = QA.getSelectionRootNode(range.commonAncestorContainer);
    var fragmentOwnerAnchor = QA.getFragmentOwnerAnchor(commonNode);
    if (fragmentOwnerAnchor && !window.linkingState) {
      anchorToolbar.classList.remove('visible');
      if (!QA.positionFloatingToolbar(noteToolbar, qa, range, 45)) {
        noteToolbar.classList.remove('visible');
        return;
      }
      noteToolbar.classList.add('visible');
      return;
    }

    noteToolbar.classList.remove('visible');

    var psg = qa.querySelector('.qa-passage');
    var ans = qa.querySelector('.qa-answer-panel');
    var inPassage = psg && psg.contains(range.commonAncestorContainer);
    var inAnswer = ans && ans.contains(range.commonAncestorContainer);

    if (!inPassage && !inAnswer) {
      anchorToolbar.classList.remove('visible');
      return;
    }

    if (window.linkingState) {
      var targetOk = (window.linkingState.direction === 'left' && inPassage) ||
        (window.linkingState.direction === 'right' && inAnswer);
      if (!targetOk) {
        anchorToolbar.classList.remove('visible');
        return;
      }
    }

    var parentAnchor = commonNode && commonNode.closest ? commonNode.closest('.text-anchor, .answer-anchor') : null;
    if (parentAnchor && !window.linkingState) {
      anchorToolbar.classList.remove('visible');
      return;
    }

    anchorToolbar.classList.add('visible');
    QA.openAnchorToolbarDropdown(anchorToolbar);
    if (!QA.positionAnchorToolbarBesideSelection(anchorToolbar, range)) {
      anchorToolbar.classList.remove('visible');
      QA.clearToolbarDropdownMenus(anchorToolbar);
    }
  };

  QA.hideQASelectionToolbars = function (qa) {
    if (!qa) return;
    [QA.getAnnotationToolbar(qa), QA.getNoteFragmentToolbar(qa)].filter(Boolean).forEach(function (toolbar) {
      toolbar.classList.remove('visible');
      QA.clearToolbarDropdownMenus(toolbar);
    });
  };

})();
