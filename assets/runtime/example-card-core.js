/* ===========================================
   EXAMPLE-CARD-CORE.JS
   例题组件 — 核心模块
   职责：状态管理、初始化、导航、共享渲染、事件绑定
   依赖：editor-utils.js (window._editorUtils)
   其他模块通过 window.ExampleCardRuntime 注册/访问共享 API
   =========================================== */

(function () {
  'use strict';

  /* ========== 常量 ========== */
  var CARD_SELECTOR = '.example-card';
  var OPTION_SELECTOR = '.example-card__option';
  var ANSWER_KEY_SELECTOR = '.example-card__answer-key';
  var BLANK_ANSWER_INPUT_SELECTOR = '.example-card__blank-answer-input';
  var TYPE_PICKER_SELECTOR = '.example-card__editor-type-picker';
  var TYPE_BUTTON_SELECTOR = '.example-card__type-button';
  var MULTI_HINT_SELECTOR = '.example-card__editor-multi-hint';
  var ANALYSIS_TOGGLE_SELECTOR = '.example-card__analysis-toggle';
  var SUBMIT_BUTTON_SELECTOR = '.example-card__submit-btn';
  var PREV_BUTTON_SELECTOR = '.example-card__prev-btn';
  var NEXT_BUTTON_SELECTOR = '.example-card__next-btn';
  var ANALYSIS_PANEL_SELECTOR = '.example-card__analysis';
  var BLANK_SELECTOR = '.example-card__blank[data-correct-answer]';
  var QUESTION_SELECTOR = '.example-card__question';
  var RESULT_MARK_SELECTOR = '.qa-result-mark';
  var SINGLE_QUESTION_STATE_KEY = '__single__';
  var QUESTION_TYPE_LABELS = {
    single: '单选',
    multi: '多选',
    flex: '不定项选择',
    blank: '填空'
  };
  var DEFAULT_CHOICE_VALUES = ['A', 'B', 'C', 'D'];
  var stateMap = new WeakMap();

  /* ========== 共享 API 容器（后续模块注册到此对象） ========== */
  window.ExampleCardRuntime = {
    /* 由 example-card-authoring.js 注册 */
    setQuestionType: null,
    updateCorrectValuesFromAnswerKey: null,
    updateBlankAnswerFromEditor: null,
    hydrateStoredAuthoringConfig: null,
    /* 由 example-card-student.js 注册 */
    handleOptionClick: null,
    submitCard: null,
    toggleAnalysis: null
  };

  var RT = window.ExampleCardRuntime;

  /* ========== 工具函数 ========== */

  function getQuestionNodes(root) {
    return Array.from(root.querySelectorAll(QUESTION_SELECTOR));
  }

  function getQuestionId(question, index) {
    if (!question) return SINGLE_QUESTION_STATE_KEY;
    var existingId = question.getAttribute('data-question-id');
    if (existingId) return existingId;
    var fallbackId = 'question-' + (index + 1);
    question.setAttribute('data-question-id', fallbackId);
    return fallbackId;
  }

  function createQuestionState() {
    return {
      selectedValues: [],
      correctValues: [],
      isCorrect: null,
      submitted: false,
      analysisExpanded: false
    };
  }

  function getInitialActiveQuestionId(root, state) {
    var questionNodes = getQuestionNodes(root);
    if (questionNodes.length === 0) return SINGLE_QUESTION_STATE_KEY;

    var activeQuestion = questionNodes.find(function (q) {
      return q.classList.contains('is-active') && !q.hidden && q.getAttribute('aria-hidden') !== 'true';
    }) || questionNodes.find(function (q) {
      return !q.hidden && q.getAttribute('aria-hidden') !== 'true';
    }) || questionNodes[0];

    return getQuestionId(activeQuestion, questionNodes.indexOf(activeQuestion));
  }

  function ensureQuestionStateMap(root, state) {
    var questionNodes = getQuestionNodes(root);

    if (questionNodes.length === 0) {
      if (!state.questionStates[SINGLE_QUESTION_STATE_KEY]) {
        state.questionStates[SINGLE_QUESTION_STATE_KEY] = createQuestionState();
      }
      if (!state.activeQuestionId) state.activeQuestionId = SINGLE_QUESTION_STATE_KEY;
      return;
    }

    questionNodes.forEach(function (question, index) {
      var questionId = getQuestionId(question, index);
      if (!state.questionStates[questionId]) {
        state.questionStates[questionId] = createQuestionState();
      }
    });

    if (!state.activeQuestionId || !state.questionStates[state.activeQuestionId]) {
      state.activeQuestionId = getInitialActiveQuestionId(root, state);
    }
  }

  function getQuestionState(root, question) {
    var state = ensureState(root);
    var questionNodes = getQuestionNodes(root);
    var questionId = question
      ? getQuestionId(question, questionNodes.indexOf(question))
      : (state.activeQuestionId || SINGLE_QUESTION_STATE_KEY);

    if (!state.questionStates[questionId]) {
      state.questionStates[questionId] = createQuestionState();
    }
    return state.questionStates[questionId];
  }

  function getActiveQuestionFromState(root, state) {
    var questionNodes = getQuestionNodes(root);
    if (questionNodes.length === 0) return null;
    return questionNodes.find(function (question, index) {
      return getQuestionId(question, index) === state.activeQuestionId;
    }) || questionNodes[0];
  }

  function getActiveQuestion(root) {
    var state = stateMap.get(root) || ensureState(root);
    return getActiveQuestionFromState(root, state);
  }

  function getActiveQuestionContainer(root) {
    return getActiveQuestion(root) || root;
  }

  function syncActiveQuestionSnapshot(root, state) {
    var currentState = state || stateMap.get(root);
    if (!currentState) return;

    var activeQuestion = getQuestionNodes(root).length > 0
      ? getActiveQuestionFromState(root, currentState)
      : null;
    var activeQuestionState = currentState.questionStates[currentState.activeQuestionId || SINGLE_QUESTION_STATE_KEY] || createQuestionState();

    activeQuestionState.correctValues = collectCorrectValues(root, activeQuestion);
    currentState.selectedValues = activeQuestionState.selectedValues;
    currentState.correctValues = activeQuestionState.correctValues;
    currentState.isCorrect = activeQuestionState.isCorrect;
    currentState.submitted = activeQuestionState.submitted;
    currentState.analysisExpanded = activeQuestionState.analysisExpanded;
  }

  function ensureState(root) {
    if (!stateMap.has(root)) {
      stateMap.set(root, {
        selectedValues: [],
        correctValues: [],
        isCorrect: null,
        submitted: false,
        analysisExpanded: false,
        annotationHydrationScheduled: false,
        activeQuestionId: '',
        questionStates: Object.create(null)
      });
    }
    var state = stateMap.get(root);
    ensureQuestionStateMap(root, state);
    syncActiveQuestionSnapshot(root, state);
    return state;
  }

  function collectCorrectValues(root, question) {
    var targetRoot = question || root;
    return Array.from(targetRoot.querySelectorAll(OPTION_SELECTOR))
      .filter(function (option) { return option.hasAttribute('data-correct'); })
      .map(function (option) { return option.getAttribute('data-option-value') || ''; })
      .filter(Boolean);
  }

  function normalizeQuestionType(questionType) {
    return Object.prototype.hasOwnProperty.call(QUESTION_TYPE_LABELS, questionType) ? questionType : '';
  }

  function getQuestionContainers(root) {
    var questionNodes = getQuestionNodes(root);
    return questionNodes.length > 0 ? questionNodes : [root];
  }

  function getQuestionMain(questionRoot) {
    return questionRoot ? questionRoot.querySelector('.example-card__main') : null;
  }

  function getQuestionStem(questionRoot) {
    return questionRoot ? questionRoot.querySelector('.example-card__stem') : null;
  }

  function buildQuestionDomKey(root, questionRoot) {
    if (questionRoot && questionRoot !== root) {
      var questionNodes = getQuestionNodes(root);
      return getQuestionId(questionRoot, questionNodes.indexOf(questionRoot));
    }
    return root.getAttribute('data-card-id') || 'example-card';
  }

  function inferQuestionType(root, question) {
    var explicitType = normalizeQuestionType(
      (question && question.getAttribute('data-question-type')) || root.getAttribute('data-question-type')
    );
    if (explicitType) return explicitType;

    var targetRoot = question || root;
    if (targetRoot.querySelector(BLANK_SELECTOR)) return 'blank';
    return collectCorrectValues(root, question).length > 1 ? 'multi' : 'single';
  }

  function getQuestionType(root, question) {
    return inferQuestionType(root, question);
  }

  function isEditorMode() {
    return Boolean(
      (document.documentElement && document.documentElement.classList.contains('editor-mode')) ||
      (document.body && document.body.classList.contains('editor-mode'))
    );
  }

  function hasSameValueSet(selectedValues, correctValues) {
    var selectedSet = new Set(selectedValues);
    var correctSet = new Set(correctValues);
    if (selectedSet.size !== correctSet.size) return false;
    return Array.from(selectedSet).every(function (value) { return correctSet.has(value); });
  }

  function playQuestionNavigationSound() {
    if (!window.AudioRuntime || typeof window.AudioRuntime.playGlobalCue !== 'function') return false;
    return window.AudioRuntime.playGlobalCue('page-turn') === true;
  }

  /* ========== 持久化恢复 ========== */

  function readStoredEditableHTML(editId) {
    var utils = window._editorUtils;
    if (!editId || !utils || typeof utils.storageKey !== 'function') return null;
    try { return window.localStorage.getItem(utils.storageKey('e:' + editId)); } catch (e) { return null; }
  }

  function getAnnotationStoreElementHTML(editId) {
    if (!editId || !window.AnnotationStore || typeof window.AnnotationStore.getInitData !== 'function') return null;
    var initData = window.AnnotationStore.getInitData();
    if (!initData || !initData.elements) return null;
    return Object.prototype.hasOwnProperty.call(initData.elements, editId) ? initData.elements[editId] : null;
  }

  function captureEditableHtmlSnapshot(root) {
    var snapshot = new Map();
    root.querySelectorAll('[data-edit-id]').forEach(function (element) {
      var editId = element.getAttribute('data-edit-id');
      if (!editId) return;
      snapshot.set(editId, element.innerHTML);
    });
    return snapshot;
  }

  function hydratePersistedEditRoots(root, initialHtmlSnapshot) {
    var hasHydratedFragmentMarkup = false;
    root.querySelectorAll('[data-edit-id]').forEach(function (element) {
      var editId = element.getAttribute('data-edit-id');
      if (!editId) return;
      var persistedHTML = readStoredEditableHTML(editId) ?? getAnnotationStoreElementHTML(editId);
      if (persistedHTML === null) return;
      if (initialHtmlSnapshot && initialHtmlSnapshot.has(editId) && element.innerHTML !== initialHtmlSnapshot.get(editId)) return;
      element.innerHTML = persistedHTML;
      if (persistedHTML.indexOf('data-fragment-step') !== -1) hasHydratedFragmentMarkup = true;
    });
    if (hasHydratedFragmentMarkup && window.PageRichTextAnnotationRuntime && typeof window.PageRichTextAnnotationRuntime.refreshSlide === 'function') {
      var slide = root.closest('.slide');
      if (slide) window.PageRichTextAnnotationRuntime.refreshSlide(slide);
    }
  }

  function scheduleAnnotationStoreHydration(root, initialHtmlSnapshot) {
    if (!window.AnnotationStore || typeof window.AnnotationStore.whenReady !== 'function') return;
    var state = ensureState(root);
    if (state.annotationHydrationScheduled) return;
    state.annotationHydrationScheduled = true;
    window.AnnotationStore.whenReady().then(function () {
      if (!root.isConnected) return;
      hydratePersistedEditRoots(root, initialHtmlSnapshot);
    }).catch(function () {});
  }

  function refreshFragmentRuntime(root) {
    var slide = root && root.closest ? root.closest('.slide') : null;
    if (!slide || !window.PageRichTextAnnotationRuntime || typeof window.PageRichTextAnnotationRuntime.refreshSlide !== 'function') return;
    window.PageRichTextAnnotationRuntime.refreshSlide(slide);
  }

  /* ========== 渲染函数（跨模块共享） ========== */

  function syncResultMark(option, markKind) {
    var optionLabel = option.querySelector('.qa-option-label') || option;
    var markEl = optionLabel.querySelector(RESULT_MARK_SELECTOR);
    if (!markKind) {
      if (markEl) markEl.remove();
      return;
    }
    if (!markEl) {
      markEl = document.createElement('span');
      markEl.className = 'qa-result-mark';
      optionLabel.appendChild(markEl);
    }
    markEl.textContent = markKind === 'correct' ? '\u2713' : '\u2717';
    markEl.className = 'qa-result-mark ' + markKind + ' visible';
  }

  function renderSelection(root) {
    var state = getQuestionState(root, getActiveQuestion(root));
    var questionRoot = getActiveQuestionContainer(root);
    questionRoot.querySelectorAll(OPTION_SELECTOR).forEach(function (option) {
      var value = option.getAttribute('data-option-value') || '';
      option.classList.toggle('selected', value !== '' && state.selectedValues.indexOf(value) !== -1);
    });
  }

  function renderSubmission(root) {
    var state = getQuestionState(root, getActiveQuestion(root));
    var questionRoot = getActiveQuestionContainer(root);
    var analysisToggle = questionRoot.querySelector(ANALYSIS_TOGGLE_SELECTOR);
    var submitBtn = questionRoot.querySelector(SUBMIT_BUTTON_SELECTOR);

    root.classList.toggle('is-submitted', state.submitted);
    if (analysisToggle) analysisToggle.disabled = !state.submitted;
    if (submitBtn) submitBtn.disabled = state.submitted;

    questionRoot.querySelectorAll(OPTION_SELECTOR).forEach(function (option) {
      var value = option.getAttribute('data-option-value') || '';
      var isSelected = value !== '' && state.selectedValues.indexOf(value) !== -1;
      var isCorrect = value !== '' && state.correctValues.indexOf(value) !== -1;

      option.classList.toggle('result-correct', state.submitted && isCorrect);
      option.classList.toggle('result-incorrect', state.submitted && isSelected && !isCorrect);

      if (state.submitted && isCorrect) {
        syncResultMark(option, 'correct');
      } else if (state.submitted && isSelected && !isCorrect) {
        syncResultMark(option, 'incorrect');
      } else {
        syncResultMark(option, null);
      }
    });

    syncQuestionGateState(root);
  }

  function renderAnalysis(root) {
    var state = getQuestionState(root, getActiveQuestion(root));
    var questionRoot = getActiveQuestionContainer(root);
    var analysis = questionRoot.querySelector(ANALYSIS_PANEL_SELECTOR);
    var shouldOpen = state.submitted && state.analysisExpanded;

    root.querySelectorAll(ANALYSIS_PANEL_SELECTOR).forEach(function (panel) {
      panel.hidden = panel !== analysis || !shouldOpen;
    });
    root.classList.toggle('is-analysis-open', shouldOpen);
  }

  /* ========== UI 同步函数 ========== */

  function syncAnswerKey(root) {
    var questionRoot = getActiveQuestionContainer(root);
    var questionType = getQuestionType(root, questionRoot === root ? null : questionRoot);
    var correctValues = collectCorrectValues(root, questionRoot === root ? null : questionRoot);
    var answerKeyRow = questionRoot.querySelector('.example-card__editor-answer-key');

    if (answerKeyRow) {
      answerKeyRow.hidden = questionType === 'blank';
      answerKeyRow.setAttribute('aria-hidden', questionType === 'blank' ? 'true' : 'false');
    }
    questionRoot.querySelectorAll(ANSWER_KEY_SELECTOR).forEach(function (button) {
      var value = button.getAttribute('data-answer-value') || '';
      button.classList.toggle('is-active', value !== '' && correctValues.indexOf(value) !== -1);
    });
  }

  function syncQuestionTypeUI(root) {
    getQuestionContainers(root).forEach(function (questionRoot) {
      var normalizedType = getQuestionType(root, questionRoot === root ? null : questionRoot);
      var targetRoot = questionRoot === root ? root : questionRoot;
      var stem = getQuestionStem(questionRoot);
      var typePicker = targetRoot.querySelector(TYPE_PICKER_SELECTOR);
      var answers = targetRoot.querySelector('.example-card__answers');
      var answerKeyRow = targetRoot.querySelector('.example-card__editor-answer-key');
      var blankAnswerRow = targetRoot.querySelector('.example-card__editor-blank-answer');
      var correctCount = collectCorrectValues(root, questionRoot === root ? null : questionRoot).length;
      var blank = targetRoot.querySelector(BLANK_SELECTOR);

      targetRoot.setAttribute('data-question-type', normalizedType);
      if (stem) {
        stem.setAttribute('data-question-type-label', QUESTION_TYPE_LABELS[normalizedType] || '');
        stem.setAttribute('data-question-type', normalizedType);
      }
      if (typePicker) {
        typePicker.querySelectorAll(TYPE_BUTTON_SELECTOR).forEach(function (button) {
          var typeValue = button.getAttribute('data-question-type-value') || '';
          button.classList.toggle('is-active', typeValue === normalizedType);
        });
        var multiHint = typePicker.querySelector(MULTI_HINT_SELECTOR);
        if (multiHint) {
          var shouldShow = normalizedType === 'multi';
          multiHint.hidden = !shouldShow;
          multiHint.classList.toggle('is-invalid', shouldShow && correctCount < 2);
          if (!shouldShow) multiHint.classList.remove('is-shaking');
        }
      }
      if (answerKeyRow) {
        answerKeyRow.hidden = normalizedType === 'blank';
        answerKeyRow.setAttribute('aria-hidden', normalizedType === 'blank' ? 'true' : 'false');
      }
      if (blankAnswerRow) {
        var shouldShowBlank = normalizedType === 'blank';
        var blankInput = blankAnswerRow.querySelector(BLANK_ANSWER_INPUT_SELECTOR);
        blankAnswerRow.hidden = !shouldShowBlank;
        blankAnswerRow.setAttribute('aria-hidden', shouldShowBlank ? 'false' : 'true');
        if (blankInput) {
          blankInput.disabled = !shouldShowBlank;
          blankInput.value = blank ? (blank.getAttribute('data-correct-answer') || '') : '';
        }
      }
      if (answers) {
        answers.hidden = normalizedType === 'blank';
        answers.style.display = normalizedType === 'blank' ? 'none' : '';
        answers.setAttribute('aria-hidden', normalizedType === 'blank' ? 'true' : 'false');
      }
    });
  }

  function syncQuestionGateState(root) {
    var state = ensureState(root);
    var questionNodes = root.querySelectorAll(QUESTION_SELECTOR);

    if (questionNodes.length === 0) {
      root.setAttribute('data-question-active', 'true');
      root.setAttribute('data-question-submitted', state.submitted ? 'true' : 'false');
      return;
    }

    questionNodes.forEach(function (question, index) {
      var questionId = getQuestionId(question, index);
      var questionState = state.questionStates[questionId] || createQuestionState();
      var isActive = state.activeQuestionId === questionId;

      question.hidden = !isActive;
      question.setAttribute('aria-hidden', isActive ? 'false' : 'true');
      question.classList.toggle('is-active', isActive);
      question.setAttribute('data-question-active', isActive ? 'true' : 'false');
      question.setAttribute('data-question-submitted', isActive && questionState.submitted ? 'true' : 'false');
    });
  }

  /* ========== 导航 ========== */

  function renderNavigation(root) {
    var questionNodes = getQuestionNodes(root);
    var questionRoot = getActiveQuestionContainer(root);
    var prevBtn = questionRoot.querySelector(PREV_BUTTON_SELECTOR) || root.querySelector(PREV_BUTTON_SELECTOR);
    var nextBtn = questionRoot.querySelector(NEXT_BUTTON_SELECTOR) || root.querySelector(NEXT_BUTTON_SELECTOR);

    if (questionNodes.length <= 1) {
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      return;
    }

    var activeQuestion = getActiveQuestion(root);
    var activeIndex = activeQuestion ? questionNodes.indexOf(activeQuestion) : 0;
    if (prevBtn) prevBtn.disabled = activeIndex <= 0;
    if (nextBtn) nextBtn.disabled = activeIndex >= questionNodes.length - 1;
  }

  function activateQuestion(root, nextQuestionId) {
    var state = ensureState(root);
    if (!nextQuestionId || !state.questionStates[nextQuestionId] || state.activeQuestionId === nextQuestionId) return false;

    state.activeQuestionId = nextQuestionId;
    syncActiveQuestionSnapshot(root, state);
    syncQuestionGateState(root);
    syncQuestionTypeUI(root);
    syncAnswerKey(root);
    renderSelection(root);
    renderSubmission(root);
    renderAnalysis(root);
    renderNavigation(root);
    refreshFragmentRuntime(root);
    return true;
  }

  function navigateQuestion(root, direction) {
    var questionNodes = getQuestionNodes(root);
    if (questionNodes.length <= 1) return false;

    var activeQuestion = getActiveQuestion(root);
    var activeIndex = activeQuestion ? questionNodes.indexOf(activeQuestion) : 0;
    var nextIndex = direction === 'backward' ? activeIndex - 1 : activeIndex + 1;
    var nextQuestion = questionNodes[nextIndex];
    if (!nextQuestion) return false;

    var didActivate = activateQuestion(root, getQuestionId(nextQuestion, nextIndex));
    if (didActivate) playQuestionNavigationSound();
    return didActivate;
  }

  /* ========== 初始化 ========== */

  function initCard(root) {
    var initialHtmlSnapshot = captureEditableHtmlSnapshot(root);
    ensureState(root);

    getQuestionContainers(root).forEach(function (questionRoot) {
      var scopedQuestionRoot = questionRoot === root ? null : questionRoot;
      /* 确保编辑器 UI 元素存在 — 由 authoring 模块注册 */
      if (typeof RT.ensureQuestionStructureForType === 'function') {
        RT.ensureQuestionStructureForType(root, scopedQuestionRoot, getQuestionType(root, scopedQuestionRoot));
      }
    });

    hydratePersistedEditRoots(root, initialHtmlSnapshot);
    scheduleAnnotationStoreHydration(root, initialHtmlSnapshot);

    /* 恢复作者配置 — 由 authoring 模块注册 */
    if (typeof RT.hydrateStoredAuthoringConfig === 'function') {
      RT.hydrateStoredAuthoringConfig(root);
    }

    /* 安装编辑退出守卫 — 由 authoring 模块注册 */
    if (typeof RT.installEditorExitGuard === 'function') {
      RT.installEditorExitGuard();
    }

    syncQuestionGateState(root);
    syncQuestionTypeUI(root);
    syncAnswerKey(root);
    renderSelection(root);
    renderSubmission(root);
    renderAnalysis(root);
    renderNavigation(root);

    /* 强制完成入场动画 */
    var slide = root.closest('.slide');
    if (slide && slide.getAnimations) {
      try { slide.getAnimations({ subtree: true }).forEach(function (a) { a.finish(); }); } catch (e) {}
    }
  }

  function initAll(scope) {
    scope = scope || document;
    scope.querySelectorAll(CARD_SELECTOR).forEach(function (root) { initCard(root); });
  }

  /* ========== 事件绑定 ========== */

  document.addEventListener('click', function (event) {
    if (!(event.target instanceof Element)) return;

    /* 题型切换按钮 → authoring */
    var typeButton = event.target.closest(TYPE_BUTTON_SELECTOR);
    if (typeButton) {
      var root = typeButton.closest(CARD_SELECTOR);
      if (root && typeof RT.setQuestionType === 'function') {
        var questionRoot = typeButton.closest(QUESTION_SELECTOR);
        RT.setQuestionType(root, questionRoot, typeButton.getAttribute('data-question-type-value') || '');
      }
      return;
    }

    /* 答案键 → authoring */
    var answerKey = event.target.closest(ANSWER_KEY_SELECTOR);
    if (answerKey) {
      var root2 = answerKey.closest(CARD_SELECTOR);
      if (root2 && typeof RT.updateCorrectValuesFromAnswerKey === 'function') {
        RT.updateCorrectValuesFromAnswerKey(root2, answerKey);
      }
      return;
    }

    /* 选项点击 → student */
    var option = event.target.closest(OPTION_SELECTOR);
    if (option) {
      if (typeof RT.handleOptionClick === 'function') RT.handleOptionClick(option);
      return;
    }

    /* 提交按钮 → student */
    var submitBtn = event.target.closest(SUBMIT_BUTTON_SELECTOR);
    if (submitBtn) {
      var root3 = submitBtn.closest(CARD_SELECTOR);
      if (root3 && typeof RT.submitCard === 'function') RT.submitCard(root3);
      return;
    }

    /* 上一题/下一题 → 导航（本模块） */
    var prevBtn = event.target.closest(PREV_BUTTON_SELECTOR);
    if (prevBtn) {
      var root4 = prevBtn.closest(CARD_SELECTOR);
      if (root4) navigateQuestion(root4, 'backward');
      return;
    }
    var nextBtn = event.target.closest(NEXT_BUTTON_SELECTOR);
    if (nextBtn) {
      var root5 = nextBtn.closest(CARD_SELECTOR);
      if (root5) navigateQuestion(root5, 'forward');
      return;
    }

    /* 解析切换 → student */
    var analysisToggle = event.target.closest(ANALYSIS_TOGGLE_SELECTOR);
    if (analysisToggle) {
      var root6 = analysisToggle.closest(CARD_SELECTOR);
      if (root6 && typeof RT.toggleAnalysis === 'function') RT.toggleAnalysis(root6);
    }
  });

  document.addEventListener('input', function (event) {
    if (!(event.target instanceof Element)) return;
    var blankInput = event.target.closest(BLANK_ANSWER_INPUT_SELECTOR);
    if (blankInput) {
      var root7 = blankInput.closest(CARD_SELECTOR);
      if (root7 && typeof RT.updateBlankAnswerFromEditor === 'function') {
        RT.updateBlankAnswerFromEditor(root7, blankInput);
      }
    }
  });

  /* ========== 暴露公共 API ========== */
  RT.initAll = initAll;
  RT.initCard = initCard;
  RT.navigateQuestion = navigateQuestion;
  RT.activateQuestion = activateQuestion;
  RT.getQuestionType = getQuestionType;
  RT.getQuestionState = getQuestionState;
  RT.getState = function (root) { return stateMap.get(root); };
  RT.ensureState = ensureState;
  RT.collectCorrectValues = collectCorrectValues;
  RT.normalizeQuestionType = normalizeQuestionType;
  RT.getQuestionContainers = getQuestionContainers;
  RT.getQuestionMain = getQuestionMain;
  RT.getQuestionStem = getQuestionStem;
  RT.buildQuestionDomKey = buildQuestionDomKey;
  RT.getActiveQuestion = getActiveQuestion;
  RT.getActiveQuestionContainer = getActiveQuestionContainer;
  RT.syncQuestionTypeUI = syncQuestionTypeUI;
  RT.syncAnswerKey = syncAnswerKey;
  RT.renderSelection = renderSelection;
  RT.renderSubmission = renderSubmission;
  RT.renderAnalysis = renderAnalysis;
  RT.renderNavigation = renderNavigation;
  RT.isEditorMode = isEditorMode;
  RT.hasSameValueSet = hasSameValueSet;
  RT.captureEditableHtmlSnapshot = captureEditableHtmlSnapshot;
  RT.hydratePersistedEditRoots = hydratePersistedEditRoots;
  RT.scheduleAnnotationStoreHydration = scheduleAnnotationStoreHydration;
  RT.refreshFragmentRuntime = refreshFragmentRuntime;
  RT.syncQuestionGateState = syncQuestionGateState;
  RT.syncActiveQuestionSnapshot = syncActiveQuestionSnapshot;
  RT.DEFAULT_CHOICE_VALUES = DEFAULT_CHOICE_VALUES;
  RT.QUESTION_TYPE_LABELS = QUESTION_TYPE_LABELS;
  RT.OPTION_SELECTOR = OPTION_SELECTOR;
  RT.BLANK_SELECTOR = BLANK_SELECTOR;
  RT.QUESTION_SELECTOR = QUESTION_SELECTOR;
  RT.MULTI_HINT_SELECTOR = MULTI_HINT_SELECTOR;
  RT.BLANK_ANSWER_INPUT_SELECTOR = BLANK_ANSWER_INPUT_SELECTOR;
  RT.ANSWER_KEY_SELECTOR = ANSWER_KEY_SELECTOR;
  RT.CARD_SELECTOR = CARD_SELECTOR;
  RT.SINGLE_QUESTION_STATE_KEY = SINGLE_QUESTION_STATE_KEY;

  /* ========== 自动初始化 ========== */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initAll(); });
  } else {
    setTimeout(function () { initAll(); }, 0);
  }

})();
