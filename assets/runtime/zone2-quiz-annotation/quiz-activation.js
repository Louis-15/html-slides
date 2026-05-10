/* ===========================================
   quiz-activation.js
   答题与批注组件 — 气泡激活与降噪
   依赖：quiz-core.js、quiz-fragments.js、quiz-panel.js、quiz-connectors.js
   =========================================== */

(function () {
  'use strict';
  var QA = window.QA = window.QA || {};

  /* =========================================
     音效
     ========================================= */

  QA.playBubbleFocusSound = function () {
    if (window.AudioRuntime && typeof window.AudioRuntime.playGlobalCue === 'function') {
      window.AudioRuntime.playGlobalCue('focus-shift');
    }
  };

  QA.playFragmentStepSound = function (direction, reason) {
    if (window.QuizAnnotationAudio && typeof window.QuizAnnotationAudio.playFragmentStep === 'function') {
      window.QuizAnnotationAudio.playFragmentStep({ direction: direction, reason: reason || 'step' });
    }
  };

  QA.playFragmentHoverSound = function (anchor) {
    if (!QA.canTriggerFragmentDiscovery(anchor)) return;
    if (window.QuizAnnotationAudio && typeof window.QuizAnnotationAudio.playFragmentHover === 'function') {
      window.QuizAnnotationAudio.playFragmentHover({
        linkId: anchor.getAttribute('data-link-answer') || anchor.getAttribute('data-link') || '',
        side: anchor.classList.contains('answer-anchor') ? 'right' : 'left'
      });
    }
  };

  /* =========================================
     片段发现条件检测
     ========================================= */

  QA.anchorHasAuthoredFragments = function (anchor) {
    return !!(anchor && anchor.querySelector('[data-fragment-step="true"]'));
  };

  QA.canTriggerFragmentDiscovery = function (anchor) {
    if (!anchor || !QA.anchorHasAuthoredFragments(anchor) || QA.isEditorMode()) return false;
    var qa = anchor.closest('.quiz-annotation');
    return !QA.shouldSuppressFragmentDiscovery(qa);
  };

  QA.getFragmentPlainText = function (fragment) {
    if (!fragment) return '';
    var clone = fragment.cloneNode(true);
    clone.querySelectorAll('rt').forEach(function (rt) { return rt.remove(); });
    return QA.normalizeFragmentSelectionText(clone.textContent);
  };

  /* =========================================
     批注激活
     ========================================= */

  /** 激活指定批注 */
  QA.activateNote = function (qa, bubble) {
    if (!qa || !bubble) return;

    if (bubble.classList.contains('note-active')) {
      if (typeof window.activateInteractionStepForElement === 'function') {
        window.activateInteractionStepForElement(qa);
      }
      QA.updateProgressCounter(qa);
      return;
    }

    var endpointState = QA.normalizeBubbleEndpointState(qa, bubble);
    var linkId = endpointState.linkId;
    var hasRight = endpointState.hasRight;

    // 现有焦点降级为展开态，保留已展开批注
    QA.clearAllActive(qa, true, false);

    // 激活气泡
    bubble.classList.add('note-active');
    // 自动展开折叠内容
    bubble.classList.add('note-expanded');
    QA.syncNoteFragments(bubble);
    qa.classList.add('has-active-note');
    QA.replayNoteActivationAnimation(bubble);
    QA.playBubbleFocusSound();

    // 激活左栏原文锚点
    var anchor = QA.getAnchorByLink(qa, linkId);
    if (anchor) anchor.classList.add('anchor-active');

    // 激活右栏答题锚点（如果有）
    if (hasRight) {
      var answerAnchor = QA.getAnswerAnchorByLink(qa, linkId);
      if (answerAnchor) answerAnchor.classList.add('anchor-active');
    }

    // 焦点定位现在改由左右端点与气泡头条的联动样式承担；
    // 旧的常驻橙色步进连线不再展示，但保留统一入口方便其它路径继续复用清理逻辑。
    QA.drawStepConnectors(qa, bubble);

    // 三栏双向追视
    QA.scrollIntoViewSmooth(bubble);
    if (anchor) QA.scrollIntoViewSmooth(anchor);
    if (hasRight) {
      var ansAnchor = QA.getAnswerAnchorByLink(qa, linkId);
      if (ansAnchor) QA.scrollIntoViewSmooth(ansAnchor);
    }

    // 更新进度指示器
    QA.updateProgressCounter(qa);

    if (typeof window.activateInteractionStepForElement === 'function') {
      window.activateInteractionStepForElement(qa);
    }
  };

  /** 取消指定批注激活 */
  QA.deactivateNote = function (qa, bubble) {
    if (!bubble) return;
    bubble.classList.remove('note-active');
    if (QA.isEditorMode()) {
      bubble.classList.add('note-expanded');
    } else {
      bubble.classList.remove('note-expanded');
    }
    var linkId = bubble.dataset.link;
    var anchor = QA.getAnchorByLink(qa, linkId);
    if (anchor) anchor.classList.remove('anchor-active');
    // 清除右栏锚点激活
    var ansAnchor = QA.getAnswerAnchorByLink(qa, linkId);
    if (ansAnchor) ansAnchor.classList.remove('anchor-active');
  };

  /** 清除所有激活状态 */
  QA.clearAllActive = function (qa, preserveExpanded, resetFragments) {
    if (resetFragments === undefined) resetFragments = true;
    if (!qa) return;
    qa.querySelectorAll('.note-active').forEach(function (bubble) {
      bubble.classList.remove('note-active');
      if (resetFragments) QA.resetNoteFragments(bubble);
      if (preserveExpanded || QA.isEditorMode()) {
        bubble.classList.add('note-expanded');
      } else {
        bubble.classList.remove('note-expanded');
      }
    });
    if (!preserveExpanded && !QA.isEditorMode()) {
      qa.querySelectorAll('.qa-note-bubble').forEach(function (bubble) {
        bubble.classList.remove('note-expanded');
        if (resetFragments) QA.resetNoteFragments(bubble);
      });
    }
    qa.querySelectorAll('.anchor-active').forEach(function (a) { return a.classList.remove('anchor-active'); });
    qa.classList.remove('has-active-note');
    QA.clearStepConnectors(qa);
  };

})();
