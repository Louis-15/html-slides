/* ===========================================
   quiz-stepping.js
   答题与批注组件 — 步进策略注册
   依赖：quiz-core.js、quiz-activation.js、quiz-fragments.js、quiz-panel.js
   =========================================== */

(function () {
  'use strict';
  var QA = window.QA = window.QA || {};

  /* === 模块级变量 === */
  /** 当前活跃的批注内部步进索引（-1 表示无） */
  QA.annotationStepIndex = -1;

  /** 注册 annotation 步进策略 */
  if (typeof window.registerStepStrategy === 'function') {
    window.registerStepStrategy('annotation', {
      canStepTopLevelForward: function (el) {
        var qa = el.closest('.quiz-annotation') || el;
        if (QA.shouldLockKeyboardAnnotationStepping(qa)) return false;
        var bubbles = QA.getSortedBubbles(qa);
        return QA.annotationStepIndex < bubbles.length - 1;
      },
      canStepTopLevelBackward: function (el) {
        var qa = el.closest('.quiz-annotation') || el;
        if (QA.shouldLockKeyboardAnnotationStepping(qa)) return false;
        return QA.annotationStepIndex >= 0;
      },
      forwardTopLevel: function (el) {
        var qa = el.closest('.quiz-annotation') || el;
        if (QA.shouldLockKeyboardAnnotationStepping(qa)) return false;
        var bubbles = QA.getSortedBubbles(qa);
        if (bubbles.length === 0) return false;

        // 确保批注面板已展开
        if (!qa.classList.contains('notes-active')) {
          QA.toggleNotesPanel(qa);
        }

        if (QA.annotationStepIndex >= bubbles.length - 1) return false;
        QA.annotationStepIndex++;
        if (QA.annotationStepIndex >= bubbles.length) {
          QA.annotationStepIndex = bubbles.length - 1;
        }
        QA.activateNote(qa, bubbles[QA.annotationStepIndex]);
        return true;
      },
      backwardTopLevel: function (el) {
        var qa = el.closest('.quiz-annotation') || el;
        if (QA.shouldLockKeyboardAnnotationStepping(qa)) return false;
        var bubbles = QA.getSortedBubbles(qa);

        if (QA.annotationStepIndex < 0) return false;

        if (QA.annotationStepIndex >= 0) {
          QA.deactivateNote(qa, bubbles[QA.annotationStepIndex]);
        }
        QA.annotationStepIndex--;
        if (QA.annotationStepIndex >= 0 && QA.annotationStepIndex < bubbles.length) {
          QA.activateNote(qa, bubbles[QA.annotationStepIndex]);
        } else {
          QA.clearAllActive(qa, false, false);
          QA.annotationStepIndex = -1;
        }
        return true;
      },
      stepFragment: function (el, direction) {
        var qa = el.closest('.quiz-annotation') || el;
        if (direction === 'forward') {
          return QA.revealNextNoteFragment(qa);
        }
        return QA.hidePreviousNoteFragment(qa);
      },
      // 兼容旧接口，避免外部仍按 forward/backward 调用时失效。
      forward: function (el) {
        return this.forwardTopLevel(el);
      },
      backward: function (el) {
        return this.backwardTopLevel(el);
      },
      hasNextStep: function (el) {
        return this.canStepTopLevelForward(el);
      },
      hasPrevStep: function () {
        return this.canStepTopLevelBackward();
      }
    });
  }

})();
