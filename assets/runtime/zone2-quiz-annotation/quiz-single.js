/* ===========================================
   quiz-single.js
   答题与批注组件 — 阅读单选与多选
   依赖：quiz-core.js、quiz-base.js
   =========================================== */

(function () {
  'use strict';
  var QA = window.QA = window.QA || {};

  /* =========================================
     选择题答案键编辑器
     ========================================= */

  QA.syncChoiceAnswerKeyEditors = function (qa) {
    if (!qa) return;

    qa.querySelectorAll('.qa-question[data-type="single"], .qa-question[data-type="multi"]').forEach(function (question) {
      var prompt = question.querySelector('p, .qa-question-text');
      var firstOption = question.querySelector('.qa-option');
      if (!firstOption) return;

      var row = question.querySelector('.qa-answer-key-row');
      if (!row) {
        row = document.createElement('div');
        row.className = 'qa-answer-key-row';
      }

      row.innerHTML = '';

      var label = document.createElement('span');
      label.className = 'qa-answer-key-label';
      label.textContent = '正确答案';

      var chips = document.createElement('div');
      chips.className = 'qa-answer-key-options';

      var correctOptions = QA.getCorrectOptionIds(question);
      question.querySelectorAll('.qa-option').forEach(function (option) {
        var optionId = option.getAttribute('data-option') || '';
        if (!optionId) return;

        var chip = QA.createAnswerKeyChip(optionId, correctOptions.indexOf(optionId) !== -1);
        chip.addEventListener('click', function () {
          if (!QA.isEditorMode()) return;

          var currentCorrect = QA.getCorrectOptionIds(question);
          var isMulti = question.dataset.type === 'multi';
          var isAlreadyCorrect = currentCorrect.indexOf(optionId) !== -1;
          var nextCorrectOptions = currentCorrect.slice();

          if (isMulti) {
            if (isAlreadyCorrect) {
              nextCorrectOptions = currentCorrect.filter(function (id) { return id !== optionId; });
            } else {
              nextCorrectOptions.push(optionId);
            }
          } else {
            if (currentCorrect.length === 1 && currentCorrect[0] === optionId) return;
            nextCorrectOptions = [optionId];
          }

          QA.setChoiceCorrectAnswers(question, nextCorrectOptions);
          QA.resetQuizSubmissionState(qa);
          QA.persistQuizAuthoringChange();
        });

        chips.appendChild(chip);
      });

      row.appendChild(label);
      row.appendChild(chips);

      if (prompt) {
        prompt.insertAdjacentElement('afterend', row);
      } else {
        question.insertBefore(row, firstOption);
      }

      QA.updateAnswerKeyChipSelection(row, QA.getCorrectOptionIds(question));
    });
  };

  /* =========================================
     选择题判分清理
     ========================================= */

  /** 清除普通选择题的"未作答判错"提醒 */
  QA.clearQuestionUnansweredState = function (question) {
    if (!question) return;
    question.classList.remove('result-unanswered');
    question.removeAttribute('aria-invalid');
    question.querySelectorAll('.qa-question-feedback.unanswered').forEach(function (el) { return el.remove(); });
  };

  /** 确保普通选择题拥有可读的结果提示 */
  QA.ensureQuestionResultFeedback = function (question, variant, message) {
    if (!question) return null;

    var feedback = question.querySelector('.qa-question-feedback.' + variant);
    if (!feedback) {
      feedback = document.createElement('div');
      feedback.className = 'qa-question-feedback ' + variant;
      feedback.setAttribute('role', 'status');
      feedback.setAttribute('aria-live', 'polite');
      feedback.setAttribute('aria-atomic', 'true');

      var badge = document.createElement('span');
      badge.className = 'qa-question-feedback-badge';
      feedback.appendChild(badge);

      var prompt = question.querySelector('p, .qa-question-text');
      if (prompt) {
        prompt.insertAdjacentElement('afterend', feedback);
      } else {
        question.insertBefore(feedback, question.firstChild);
      }
    }

    var badgeEl = feedback.querySelector('.qa-question-feedback-badge');
    if (badgeEl) badgeEl.textContent = variant === 'unanswered' ? '未作答' : '提示';

    var existingTextEl = feedback.querySelector('.qa-question-feedback-text');
    if (message) {
      var textEl = existingTextEl;
      if (!textEl) {
        textEl = document.createElement('span');
        textEl.className = 'qa-question-feedback-text';
        feedback.appendChild(textEl);
      }
      textEl.textContent = message;
      feedback.setAttribute('aria-label', (badgeEl ? badgeEl.textContent : '') + '，' + message);
    } else {
      if (existingTextEl) existingTextEl.remove();
      feedback.setAttribute('aria-label', badgeEl ? badgeEl.textContent : '提示');
    }

    return feedback;
  };

  /** 清理普通选择题的运行时判分 UI，但保留用户当前选择状态 */
  QA.clearSelectionQuestionResults = function (qa) {
    if (!qa) return;

    qa.querySelectorAll('.qa-question').forEach(function (question) {
      if (question.dataset.type === 'matching') return;

      QA.clearQuestionUnansweredState(question);

      question.querySelectorAll('.qa-option').forEach(function (option) {
        option.classList.remove('result-correct', 'result-incorrect');
        option.querySelectorAll('.qa-result-mark').forEach(function (el) { return el.remove(); });
      });
    });
  };

  /** 渲染普通选择题的提交反馈 */
  QA.renderSelectionQuestionResults = function (qa) {
    if (!qa) return;
    QA.clearSelectionQuestionResults(qa);

    qa.querySelectorAll('.qa-question').forEach(function (question) {
      var questionType = question.dataset.type;
      if (questionType === 'matching' || questionType === 'blank') return;

      var options = Array.from(question.querySelectorAll('.qa-option'));
      if (!options.length) return;

      var selectedOptions = options.filter(function (option) { return option.classList.contains('selected'); });
      var isAnswered = selectedOptions.length > 0;

      if (!isAnswered) {
        question.classList.add('result-unanswered');
        question.setAttribute('aria-invalid', 'true');
        QA.ensureQuestionResultFeedback(question, 'unanswered');
      }

      options.forEach(function (option) {
        var isCorrect = option.dataset.correct === 'true';
        var isSelected = option.classList.contains('selected');
        var optionLabel = option.querySelector('.qa-option-label') || option;

        var markEl = optionLabel.querySelector('.qa-result-mark');
        if (!markEl) {
          markEl = document.createElement('span');
          markEl.className = 'qa-result-mark';
          optionLabel.appendChild(markEl);
        }

        if (isCorrect) {
          markEl.textContent = '✓';
          markEl.classList.add('correct');
          option.classList.add('result-correct');
          setTimeout(function () { return markEl.classList.add('visible'); }, 100);
        } else if (isSelected) {
          markEl.textContent = '✗';
          markEl.classList.add('incorrect');
          option.classList.add('result-incorrect');
          setTimeout(function () { return markEl.classList.add('visible'); }, 150);
        }
      });
    });
  };

})();
