/* ===========================================
   EXAMPLE-CARD-STUDENT.JS
   例题组件 — 学生态模块
   职责：选项点击、提交判分、解析展开、blank reveal
   依赖：example-card-core.js（通过 window.ExampleCardRuntime 访问核心 API）
   =========================================== */

(function () {
  'use strict';

  var RT = window.ExampleCardRuntime;
  if (!RT || typeof RT.initAll !== 'function') return;

  /* ========== 选项点击 ========== */

  function handleOptionClick(option) {
    var root = option.closest(RT.CARD_SELECTOR);
    var questionRoot = option.closest(RT.QUESTION_SELECTOR);
    if (!root) return;

    var value = option.getAttribute('data-option-value') || '';
    if (value === '') return;

    var state = RT.getState(root).questionStates[RT.getState(root).activeQuestionId || RT.SINGLE_QUESTION_STATE_KEY];
    if (!state) return;

    var questionType = RT.getQuestionType(root, questionRoot);

    /* 编辑态和提交后冻结作答 */
    if (RT.isEditorMode()) return;
    if (state.submitted) return;

    if (questionType === 'multi' || questionType === 'flex') {
      var selectedSet = new Set(state.selectedValues);
      if (selectedSet.has(value)) {
        selectedSet.delete(value);
      } else {
        selectedSet.add(value);
      }
      state.selectedValues = Array.from(selectedSet);
    } else {
      state.selectedValues = [value];
    }

    RT.syncActiveQuestionSnapshot(root, RT.getState(root));
    RT.renderSelection(root);
  }

  /* ========== 提 交 ========== */

  function revealBlankAnswers(root) {
    root.querySelectorAll(RT.BLANK_SELECTOR).forEach(function (blank) {
      blank.textContent = blank.getAttribute('data-correct-answer') || '';
      blank.classList.add('is-revealed');
    });
  }

  function submitCard(root) {
    var questionRoot = RT.getActiveQuestion(root);
    var state = RT.getState(root).questionStates[RT.getState(root).activeQuestionId || RT.SINGLE_QUESTION_STATE_KEY];
    if (!state) return;

    var questionType = RT.getQuestionType(root, questionRoot);

    state.submitted = true;
    state.analysisExpanded = false;

    if (questionType === 'blank') {
      state.correctValues = [];
      state.isCorrect = null;
      RT.syncActiveQuestionSnapshot(root, RT.getState(root));
      revealBlankAnswers(root);
      RT.renderSubmission(root);
      RT.renderAnalysis(root);
      RT.refreshFragmentRuntime(root);
      return;
    }

    state.correctValues = RT.collectCorrectValues(root, questionRoot);
    state.isCorrect = RT.hasSameValueSet(state.selectedValues, state.correctValues);
    RT.syncActiveQuestionSnapshot(root, RT.getState(root));

    RT.renderSelection(root);
    RT.renderSubmission(root);
    RT.renderAnalysis(root);
    RT.refreshFragmentRuntime(root);

    if (window.ExampleCardAudio && typeof window.ExampleCardAudio.playSubmitResult === 'function') {
      window.ExampleCardAudio.playSubmitResult({ isCorrect: state.isCorrect === true });
    }
  }

  /* ========== 解析切换 ========== */

  function toggleAnalysis(root) {
    var questionRoot = RT.getActiveQuestion(root);
    var state = RT.getState(root).questionStates[RT.getState(root).activeQuestionId || RT.SINGLE_QUESTION_STATE_KEY];
    if (!state) return;

    var analysis = RT.getActiveQuestionContainer(root).querySelector('.example-card__analysis');
    if (!state.submitted || !analysis) return;

    state.analysisExpanded = !state.analysisExpanded;
    RT.syncActiveQuestionSnapshot(root, RT.getState(root));
    RT.renderAnalysis(root);
  }

  /* ========== 注册到核心模块 ========== */
  RT.handleOptionClick = handleOptionClick;
  RT.submitCard = submitCard;
  RT.toggleAnalysis = toggleAnalysis;

})();
