/* ===========================================
   quiz-panel.js
   答题与批注组件 — 面板展开收起与分割线按钮
   依赖：quiz-core.js、quiz-constants.js、quiz-fragments.js
   =========================================== */

(function () {
  'use strict';
  var QA = window.QA = window.QA || {};

  /* =========================================
     面板展开/收起
     ========================================= */

  /** 切换批注面板 */
  QA.toggleNotesPanel = function (qa) {
    if (!qa) return;
    var isActive = qa.classList.toggle('notes-active');

    // 展开时更新分割线位置
    if (isActive) {
      QA.syncNotesPanelForCurrentMode(qa);
      requestAnimationFrame(function () { QA.updateDividerPositions(qa); });
    } else {
      // 收起时，自动退出所有的激活焦点、隐藏连线并重置步进计数器
      QA.hideAllBubbles(qa);
      QA.annotationStepIndex = -1;
    }

    // 更新进度指示器
    QA.updateProgressCounter(qa);
  };

  /* =========================================
     分割线位置
     ========================================= */

  /** 更新分割线的 CSS 变量位置 */
  QA.updateDividerPositions = function (qa) {
    var body = qa.querySelector('.qa-body');
    if (!body) return;

    var bodyRect = body.getBoundingClientRect();
    var passage = qa.querySelector('.qa-passage');
    var notesPanel = qa.querySelector('.qa-notes-panel');

    if (passage) {
      var passageRect = passage.getBoundingClientRect();
      var pos1 = ((passageRect.right - bodyRect.left) / bodyRect.width * 100);
      body.style.setProperty('--divider-1-left', pos1 + '%');
    }

    if (notesPanel && qa.classList.contains('notes-active') && qa.classList.contains('has-quiz')) {
      var notesRect = notesPanel.getBoundingClientRect();
      var pos2 = ((notesRect.right - bodyRect.left) / bodyRect.width * 100);
      body.style.setProperty('--divider-2-left', pos2 + '%');
    }
  };

  /* =========================================
     分割线悬浮按钮
     ========================================= */

  QA.hideDividerButton = function (qa) {
    var dividerBtn = qa && qa.querySelector('.qa-divider-btn');
    if (dividerBtn) {
      dividerBtn.classList.remove('visible');
    }
  };

  QA.updateDividerButtonHoverState = function (qa, clientX, clientY) {
    if (!qa) return;

    var body = qa.querySelector('.qa-body');
    var dividerBtn = qa.querySelector('.qa-divider-btn');
    var passage = qa.querySelector('.qa-passage');
    if (!body || !dividerBtn || !passage) return;

    if (qa.classList.contains('notes-active') || QA.isDoodleDrawingActive()) {
      QA.hideDividerButton(qa);
      return;
    }

    var bodyRect = body.getBoundingClientRect();
    var passageRect = passage.getBoundingClientRect();
    if (!bodyRect || !passageRect) {
      QA.hideDividerButton(qa);
      return;
    }

    var dividerX = passageRect.right;
    var HOVER_ZONE = 20;
    if (Math.abs(clientX - dividerX) <= HOVER_ZONE) {
      dividerBtn.style.left = (dividerX - bodyRect.left) + 'px';
      dividerBtn.style.top = (clientY - bodyRect.top - 16) + 'px';
      dividerBtn.classList.add('visible');
      return;
    }

    QA.hideDividerButton(qa);
  };

  /** 初始化分割线悬浮按钮 */
  QA.initDividerButton = function (qa) {
    var body = qa.querySelector('.qa-body');
    if (!body) return;

    // 创建悬浮按钮 DOM
    var dividerBtn = qa.querySelector('.qa-divider-btn');
    if (!dividerBtn) {
      dividerBtn = document.createElement('button');
      dividerBtn.className = 'qa-divider-btn';
      dividerBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/></svg>';
      dividerBtn.title = '展开批注面板 (D)';
      body.appendChild(dividerBtn);
    }

    body.addEventListener('mousemove', function (e) {
      QA.updateDividerButtonHoverState(qa, e.clientX, e.clientY);
    });

    // 鼠标离开 body 时隐藏按钮
    body.addEventListener('mouseleave', function () {
      QA.hideDividerButton(qa);
    });

    // 点击悬浮按钮 → 展开批注面板
    dividerBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      QA.toggleNotesPanel(qa);
    });
  };

  /* =========================================
     气泡批量操作
     ========================================= */

  QA.expandAllBubbles = function (qa) {
    if (!qa) return;
    qa.querySelectorAll('.qa-note-bubble').forEach(function (bubble) {
      bubble.classList.remove('note-active');
      bubble.classList.add('note-expanded');
      QA.syncNoteFragments(bubble);
    });
    qa.classList.remove('has-active-note');
    qa.querySelectorAll('.anchor-active').forEach(function (anchor) { return anchor.classList.remove('anchor-active'); });
    QA.clearStepConnectors(qa);
  };

  QA.hideAllBubbles = function (qa) {
    if (!qa) return;
    qa.querySelectorAll('.qa-note-bubble').forEach(function (bubble) {
      bubble.classList.remove('note-active', 'note-expanded');
      QA.resetNoteFragments(bubble);
    });
    qa.classList.remove('has-active-note');
    qa.querySelectorAll('.anchor-active').forEach(function (anchor) { return anchor.classList.remove('anchor-active'); });
    QA.clearStepConnectors(qa);
  };

  QA.replayNoteActivationAnimation = function (bubble) {
    if (!bubble) return;

    if (bubble.__qaActivationTimer) {
      window.clearTimeout(bubble.__qaActivationTimer);
    }

    bubble.classList.remove('note-activating');
    void bubble.offsetWidth;
    bubble.classList.add('note-activating');

    var clearAnimationState = function () {
      bubble.classList.remove('note-activating');
      bubble.__qaActivationTimer = null;
    };

    bubble.addEventListener('animationend', clearAnimationState, { once: true });
    bubble.__qaActivationTimer = window.setTimeout(clearAnimationState, 380);
  };

})();
