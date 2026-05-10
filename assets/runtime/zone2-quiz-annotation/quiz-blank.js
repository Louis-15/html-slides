/* ===========================================
   quiz-blank.js
   答题与批注组件 — 阅读填空
   依赖：quiz-core.js、quiz-base.js
   =========================================== */

(function () {
  'use strict';
  var QA = window.QA = window.QA || {};

  /* =========================================
     填空结果清理
     ========================================= */

  QA.clearBlankAnswerResults = function (qa) {
    if (!qa) return;

    qa.querySelectorAll('.qa-answer-slot--blank').forEach(function (slot) {
      var input = slot.querySelector('.qa-slot-input');
      var currentValue = QA.isEditorMode()
        ? ((input ? input.value : '') || slot.dataset.correctAnswer || '')
        : (input ? input.value : (slot.dataset.userAnswer || ''));

      slot.classList.remove('slot-correct', 'slot-incorrect');
      slot.classList.toggle('filled', !!String(currentValue || '').trim());
      slot.querySelectorAll('.qa-slot-mark, .qa-slot-correct, .qa-slot-feedback').forEach(function (el) { return el.remove(); });

      if (input) {
        input.disabled = qa.classList.contains('submitted') && !QA.isEditorMode();
      }
    });
  };

  /* =========================================
     填空 UI 同步
     ========================================= */

  /**
   * 阅读填空与七选五不同：
   * - 左栏正文只负责阅读语境与空位位置
   * - 右栏统一承担学生输入、判分和正确答案展示
   */
  QA.syncBlankAnswerUI = function (qa) {
    if (!qa) return;

    var blankQuestion = qa.querySelector('.qa-question[data-type="blank"]');
    if (!blankQuestion) return;

    var answerContent = qa.querySelector('.qa-answer-content');
    if (!answerContent) return;
    var editorMode = QA.isEditorMode();

    var passageSlots = Array.from(qa.querySelectorAll('.qa-passage .qa-blank-slot[data-correct-answer]'));
    if (!passageSlots.length) return;

    var divider = answerContent.querySelector('.qa-slots-divider.qa-slots-divider--blank');
    if (!divider) {
      divider = document.createElement('div');
      divider.className = 'qa-slots-divider qa-slots-divider--blank';
    }
    divider.textContent = editorMode
      ? '↑ 编辑模式下请直接在右侧横线上修改正确答案 ↓'
      : '↑ 在横线上输入答案，提交后查看正确答案 ↓';

    var slotsContainer = answerContent.querySelector('.qa-answer-slots.qa-answer-slots--blank');
    if (!slotsContainer) {
      slotsContainer = document.createElement('div');
      slotsContainer.className = 'qa-answer-slots qa-answer-slots--blank';
    }
    slotsContainer.innerHTML = '';

    passageSlots.forEach(function (passageSlot) {
      var blankId = passageSlot.dataset.blankId || '';
      var correctAnswer = passageSlot.dataset.correctAnswer || '';
      var userAnswer = passageSlot.dataset.userAnswer || '';
      var slot = document.createElement('div');
      slot.className = 'qa-answer-slot qa-answer-slot--blank';
      slot.dataset.blankId = blankId;
      slot.dataset.correctAnswer = correctAnswer;
      if (userAnswer) {
        slot.dataset.userAnswer = userAnswer;
      }

      var label = document.createElement('span');
      label.className = 'qa-slot-label';
      label.textContent = blankId + '.';

      var blankWrap = document.createElement('label');
      blankWrap.className = 'qa-slot-blank qa-slot-blank-input-wrap';

      var input = document.createElement('input');
      input.className = 'qa-slot-input qa-blank-input';
      input.type = 'text';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.placeholder = editorMode ? '编辑正确答案' : '请输入答案';
      input.value = editorMode ? correctAnswer : userAnswer;
      input.disabled = qa.classList.contains('submitted') && !editorMode;
      input.setAttribute('aria-label', '第 ' + blankId + ' 题' + (editorMode ? '正确答案' : '答案'));

      input.addEventListener('input', function () {
        var nextValue = input.value;

        if (editorMode) {
          slot.dataset.correctAnswer = nextValue;
          passageSlot.dataset.correctAnswer = nextValue;
          /* 阅读填空的正确答案本质上是"正文 data-edit-id 根块里的结构化作者态"。
             这里显式提升到离散 authoring 的即时持久化链 */
          QA.persistQuizAuthoringChange({ node: passageSlot, immediate: true });
        } else {
          if (qa.classList.contains('submitted')) return;
          slot.dataset.userAnswer = nextValue;
          passageSlot.dataset.userAnswer = nextValue;
        }

        slot.classList.toggle('filled', !!nextValue.trim());

        /* 学生重新输入时，只清当前槽位的判分痕迹 */
        slot.classList.remove('slot-correct', 'slot-incorrect');
        slot.querySelectorAll('.qa-slot-mark, .qa-slot-correct, .qa-slot-feedback').forEach(function (el) { return el.remove(); });
      });

      blankWrap.appendChild(input);
      slot.appendChild(label);
      slot.appendChild(blankWrap);
      slotsContainer.appendChild(slot);
    });

    if (divider.parentNode !== answerContent) {
      answerContent.appendChild(divider);
    }
    if (slotsContainer.parentNode !== answerContent) {
      answerContent.appendChild(slotsContainer);
    }

    QA.clearBlankAnswerResults(qa);
    /* submitted 只应该驱动学生态的判分回显 */
    if (qa.classList.contains('submitted') && !editorMode) {
      QA.renderBlankAnswerResults(qa);
    }
  };

  /* =========================================
     填空判分渲染
     ========================================= */

  QA.renderBlankAnswerResults = function (qa) {
    if (!qa) return;

    qa.querySelectorAll('.qa-answer-slot--blank').forEach(function (slot) {
      var label = slot.querySelector('.qa-slot-label');
      var input = slot.querySelector('.qa-slot-input');
      var correctAnswer = slot.dataset.correctAnswer || '';
      var currentValue = input ? input.value : (slot.dataset.userAnswer || '');
      var normalizedUserAnswer = QA.normalizeBlankAnswer(currentValue);
      var normalizedCorrectAnswer = QA.normalizeBlankAnswer(correctAnswer);
      var isAnswered = normalizedUserAnswer.length > 0;
      var isCorrect = isAnswered && normalizedUserAnswer === normalizedCorrectAnswer;

      slot.dataset.userAnswer = currentValue;
      slot.classList.toggle('filled', !!String(currentValue || '').trim());
      slot.classList.remove('slot-correct', 'slot-incorrect');
      slot.querySelectorAll('.qa-slot-mark, .qa-slot-correct, .qa-slot-feedback').forEach(function (el) { return el.remove(); });

      if (input) {
        input.disabled = true;
      }

      var markEl = document.createElement('span');
      markEl.className = 'qa-slot-mark ' + (isCorrect ? 'correct' : 'incorrect');
      markEl.textContent = isCorrect ? '✓' : '✗';
      if (label) {
        label.appendChild(markEl);
      }

      if (isCorrect) {
        slot.classList.add('slot-correct');
      } else {
        slot.classList.add('slot-incorrect');
      }

      if (!isAnswered) {
        var feedbackEl = document.createElement('span');
        feedbackEl.className = 'qa-slot-feedback unanswered';
        feedbackEl.textContent = '未作答';
        slot.appendChild(feedbackEl);
      }

      var correctEl = document.createElement('span');
      correctEl.className = 'qa-slot-correct';
      correctEl.innerHTML = '<span class="qa-slot-correct-prefix">正确答案：</span>' + correctAnswer;
      slot.appendChild(correctEl);
    });
  };

})();
