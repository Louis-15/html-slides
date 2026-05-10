/* ===========================================
   quiz-base.js
   答题与批注组件 — 答题共享层
   依赖：quiz-core.js、quiz-constants.js、quiz-persistence.js、
         quiz-single.js、quiz-matching.js、quiz-blank.js
   =========================================== */

(function () {
  'use strict';
  var QA = window.QA = window.QA || {};

  /* =========================================
     正确答案管理
     ========================================= */

  QA.getCorrectOptionIds = function (question) {
    if (!question) return [];
    return Array.from(question.querySelectorAll('.qa-option[data-correct="true"]'))
      .map(function (option) { return option.getAttribute('data-option'); })
      .filter(Boolean);
  };

  QA.updateAnswerKeyChipSelection = function (container, selectedOptions) {
    if (!container) return;
    var selected = new Set(selectedOptions || []);
    container.querySelectorAll('.qa-answer-key-chip').forEach(function (chip) {
      var isSelected = selected.has(chip.getAttribute('data-option'));
      chip.classList.toggle('is-correct', isSelected);
      chip.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    });
  };

  QA.createAnswerKeyChip = function (optionId, isSelected) {
    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'qa-answer-key-chip';
    chip.textContent = optionId;
    chip.setAttribute('data-option', optionId);
    chip.setAttribute('contenteditable', 'false');
    chip.setAttribute('aria-label', '将 ' + optionId + ' 设为正确答案');
    chip.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    chip.classList.toggle('is-correct', !!isSelected);
    return chip;
  };

  QA.setChoiceCorrectAnswers = function (question, nextCorrectOptions) {
    if (!question) return;

    var selected = new Set(nextCorrectOptions || []);
    question.querySelectorAll('.qa-option').forEach(function (option) {
      var optionId = option.getAttribute('data-option');
      if (optionId && selected.has(optionId)) {
        option.setAttribute('data-correct', 'true');
      } else {
        option.removeAttribute('data-correct');
      }
    });

    QA.updateAnswerKeyChipSelection(question.querySelector('.qa-answer-key-row'), nextCorrectOptions || []);
  };

  /* =========================================
     题型推断
     ========================================= */

  /**
   * 答题与批注组件这轮正式收口为 4 种阅读形态：
   * - 阅读单选：普通阅读选择题
   * - 阅读七选五：沿用 matching 拖拽配对模型
   * - 阅读填空：右栏输入、提交后展示正确答案
   * - 文章解析：没有答题区，只有正文与批注
   */
  QA.inferReadingType = function (qa) {
    if (!qa) return 'analysis';

    var explicitType = (qa.dataset.readingType || '').trim();
    if (explicitType && Object.prototype.hasOwnProperty.call(QA.READING_TYPE_LABELS, explicitType)) {
      return explicitType;
    }

    if (qa.querySelector('.qa-question[data-type="matching"]')) {
      return 'matching';
    }

    if (qa.querySelector('.qa-question[data-type="blank"]')) {
      return 'blank';
    }

    if (qa.querySelector('.qa-question[data-type="single"], .qa-question[data-type="multi"]')) {
      return 'single';
    }

    return 'analysis';
  };

  /**
   * 左栏顶部的题型胶囊是组件级语义入口
   */
  QA.syncReadingTypePill = function (qa) {
    if (!qa) return;

    var passage = qa.querySelector('.qa-passage');
    if (!passage) return;

    var readingType = QA.inferReadingType(qa);
    qa.dataset.readingTypeResolved = readingType;

    var pill = passage.querySelector('.qa-reading-type-pill');
    if (!pill) {
      pill = document.createElement('div');
      pill.className = 'qa-reading-type-pill';
      passage.insertBefore(pill, passage.firstChild);
    }

    pill.textContent = QA.READING_TYPE_LABELS[readingType] || QA.READING_TYPE_LABELS.analysis;
  };

  /* =========================================
     答案标准化
     ========================================= */

  QA.normalizeBlankAnswer = function (value) {
    return String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toUpperCase();
  };

  /* =========================================
     提交状态管理
     ========================================= */

  QA.resetQuizSubmissionState = function (qa) {
    if (!qa) return;

    qa.classList.remove('submitted');

    var submitBtn = qa.querySelector('.qa-submit-btn');
    if (submitBtn) submitBtn.disabled = false;

    QA.clearSelectionQuestionResults(qa);

    if (qa.querySelector('.qa-question[data-type="matching"]')) {
      QA.resetMatchingQuestionState(qa);
      QA.syncMatchingOptionDragState(qa);
    }
  };

  /**
   * 连线题的拖拽能力只在"未提交 + 非编辑态"时开放。
   */
  QA.syncMatchingOptionDragState = function (qa) {
    if (!qa) return;

    var allowDrag = !QA.isEditorMode() && !qa.classList.contains('submitted');
    qa.querySelectorAll('.qa-question[data-type="matching"] .qa-option').forEach(function (option) {
      option.setAttribute('draggable', allowDrag ? 'true' : 'false');
      if (!allowDrag) option.classList.remove('dragging');
    });
  };

  /* =========================================
     答题系统初始化
     ========================================= */

  QA.initQuizSystem = function (qa) {
    // 检测是否有答题内容
    var answerContent = qa.querySelector('.qa-answer-content');
    if (answerContent && answerContent.children.length > 0) {
      qa.classList.add('has-quiz');
    }

    QA.syncReadingTypePill(qa);

    // 普通选择题的未作答提醒与判分角标都属于运行时反馈，未提交时统一清理
    if (!qa.classList.contains('submitted')) {
      QA.clearSelectionQuestionResults(qa);
    }

    // — 选择题点选 —
    qa.querySelectorAll('.qa-option').forEach(function (option) {
      if (option.dataset.qaSelectBound === 'true') return;
      option.dataset.qaSelectBound = 'true';

      option.addEventListener('click', function () {
        if (QA.isEditorMode()) return;
        if (qa.classList.contains('submitted')) return;
        // 连线题不使用点选，由拖拽交互驱动
        var questionEl = option.closest('.qa-question');
        if (questionEl && questionEl.dataset.type === 'matching') return;

        var isMulti = questionEl && questionEl.dataset.type === 'multi';
        if (!isMulti) {
          var container = option.closest('.qa-question, .qa-answer-content');
          container.querySelectorAll('.qa-option').forEach(function (o) {
            o.classList.remove('selected');
          });
        }
        option.classList.toggle('selected');

        // 一旦用户重新作答，立即移除"未作答判错"的即时提示
        QA.clearQuestionUnansweredState(option.closest('.qa-question'));
      });
    });

    QA.syncChoiceAnswerKeyEditors(qa);

    // — 连线题（七选五）：在右栏动态生成答题槽位并绑定拖拽 —
    var matchingQuestion = qa.querySelector('.qa-question[data-type="matching"]');
    if (matchingQuestion) {
      QA.syncMatchingAnswerUI(qa, {
        resetTransientState: !qa.querySelector('.qa-answer-slots')
      });
    }

    var blankQuestion = qa.querySelector('.qa-question[data-type="blank"]');
    if (blankQuestion) {
      QA.syncBlankAnswerUI(qa);
    }

    // — 提交按钮 —
    var submitBtn = qa.querySelector('.qa-submit-btn');
    if (submitBtn) {
      if (qa.classList.contains('submitted')) {
        submitBtn.disabled = true;
      }
      if (submitBtn.dataset.qaSubmitBound !== 'true') {
        submitBtn.dataset.qaSubmitBound = 'true';
        submitBtn.addEventListener('click', function () {
          if (QA.isEditorMode()) return;
          if (qa.classList.contains('submitted')) return;
          QA.submitQuiz(qa);
        });
      }
    }
  };

  /* =========================================
     提交判分
     ========================================= */

  QA.submitQuiz = function (qa) {
    qa.classList.add('submitted');

    var submitBtn = qa.querySelector('.qa-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    // 普通选择题在提交时统一重渲染结果
    QA.renderSelectionQuestionResults(qa);

    var hasMatchingQ = qa.querySelector('.qa-question[data-type="matching"]');
    var hasBlankQ = qa.querySelector('.qa-question[data-type="blank"]');
    if (hasMatchingQ) {
      QA.syncMatchingOptionDragState(qa);
      qa.querySelectorAll('.qa-passage .qa-blank-slot[data-correct-answer]').forEach(function (slot) {
        QA.renderMatchingPassageSlot(slot, true);
      });
      QA.renderMatchingAnswerResults(qa);
    }

    if (hasBlankQ) {
      QA.renderBlankAnswerResults(qa);
    }

    // — 填空题判分（连线题的正文空位不再显示判分标记，由右栏槽位统一处理） —
    qa.querySelectorAll('.qa-blank-slot[data-correct-answer]').forEach(function (slot) {
      // 连线题的正文空位跳过视觉标记
      if (hasMatchingQ || hasBlankQ) return;

      var correctAnswer = slot.dataset.correctAnswer;
      var userAnswer = slot.dataset.userAnswer || '';

      var userSpan = slot.querySelector('.qa-blank-user');
      var answerSpan = slot.querySelector('.qa-blank-answer');

      if (userSpan && answerSpan) {
        var isCorrect = userAnswer.toUpperCase() === correctAnswer.toUpperCase();

        var markEl = slot.querySelector('.qa-result-mark');
        if (!markEl) {
          markEl = document.createElement('span');
          markEl.className = 'qa-result-mark';
          userSpan.after(markEl);
        }
        markEl.textContent = isCorrect ? '✓' : '✗';
        markEl.classList.add(isCorrect ? 'correct' : 'incorrect');
        setTimeout(function () { return markEl.classList.add('visible'); }, 150);

        if (isCorrect) {
          slot.classList.add('result-correct');
        } else {
          answerSpan.textContent = correctAnswer;
        }
      } else {
        var correctEl = slot.querySelector('.qa-blank-correct');
        if (!correctEl) {
          correctEl = document.createElement('span');
          correctEl.className = 'qa-blank-correct';
          correctEl.textContent = correctAnswer;
          slot.appendChild(correctEl);
        }
      }
    });
  };

  /* =========================================
     进度指示器
     ========================================= */

  QA.updateProgressCounter = function (qa) {
    // 更新栏头中的进度计数
    var counterEl = qa.querySelector('.qa-notes-counter');
    if (!counterEl) return;
    var bubbles = QA.getSortedBubbles(qa);
    var total = bubbles.length;
    var current = QA.annotationStepIndex + 1;
    counterEl.textContent = current + '/' + total;
  };

})();
