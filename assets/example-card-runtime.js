(function initExampleCardRuntime() {
  if (window.ExampleCardRuntime) {
    return;
  }

  const CARD_SELECTOR = '.example-card';
  const OPTION_SELECTOR = '.example-card__option';
  const ANSWER_KEY_SELECTOR = '.example-card__answer-key';
  const BLANK_ANSWER_INPUT_SELECTOR = '.example-card__blank-answer-input';
  const TYPE_PICKER_SELECTOR = '.example-card__editor-type-picker';
  const TYPE_BUTTON_SELECTOR = '.example-card__type-button';
  const MULTI_HINT_SELECTOR = '.example-card__editor-multi-hint';
  const ANALYSIS_TOGGLE_SELECTOR = '.example-card__analysis-toggle';
  const SUBMIT_BUTTON_SELECTOR = '.example-card__submit-btn';
  const PREV_BUTTON_SELECTOR = '.example-card__prev-btn';
  const NEXT_BUTTON_SELECTOR = '.example-card__next-btn';
  const ANALYSIS_PANEL_SELECTOR = '.example-card__analysis';
  const BLANK_SELECTOR = '.example-card__blank[data-correct-answer]';
  const QUESTION_SELECTOR = '.example-card__question';
  const RESULT_MARK_SELECTOR = '.qa-result-mark';
  const SINGLE_QUESTION_STATE_KEY = '__single__';
  const QUESTION_TYPE_LABELS = {
    single: '单选',
    multi: '多选',
    flex: '不定项选择',
    blank: '填空'
  };
  const DEFAULT_CHOICE_VALUES = ['A', 'B', 'C', 'D'];
  const stateMap = new WeakMap();

  function readStoredEditableHTML(editId) {
    const utils = window._editorUtils;

    if (!editId || !utils || typeof utils.storageKey !== 'function') {
      return null;
    }

    try {
      const primaryKey = utils.storageKey(`e:${editId}`);
      const primaryValue = window.localStorage.getItem(primaryKey);

      if (primaryValue !== null) {
        return primaryValue;
      }

      if (typeof utils.legacyStorageKey !== 'function') {
        return null;
      }

      const legacyKey = utils.legacyStorageKey(`e:${editId}`);
      if (!legacyKey || legacyKey === primaryKey) {
        return null;
      }

      return window.localStorage.getItem(legacyKey);
    } catch (error) {
      return null;
    }
  }

  function getAuthoringPersistenceKey(root, questionRoot) {
    const utils = window._editorUtils;
    if (!utils || typeof utils.storageKey !== 'function') {
      return '';
    }

    const targetRoot = questionRoot || root;
    const stem = getQuestionStem(targetRoot);
    const stemEditId = stem && stem.getAttribute ? stem.getAttribute('data-edit-id') : '';
    const cardId = root.getAttribute('data-card-id') || '';
    const fallbackId = buildQuestionDomKey(root, targetRoot === root ? null : targetRoot);
    const persistenceId = stemEditId || cardId || fallbackId;

    if (!persistenceId) {
      return '';
    }

    return utils.storageKey(`example-card-authoring:${persistenceId}`);
  }

  function readStoredAuthoringConfig(root, questionRoot) {
    const key = getAuthoringPersistenceKey(root, questionRoot);

    if (!key) {
      return null;
    }

    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function writeStoredAuthoringConfig(root, questionRoot) {
    const key = getAuthoringPersistenceKey(root, questionRoot);
    const targetRoot = questionRoot || root;

    if (!key) {
      return;
    }

    const blankAnswers = Array.from(targetRoot.querySelectorAll(BLANK_SELECTOR)).map((blank) => ({
      blankId: blank.getAttribute('data-blank-id') || '',
      correctAnswer: blank.getAttribute('data-correct-answer') || ''
    }));

    try {
      window.localStorage.setItem(key, JSON.stringify({
        questionType: getQuestionType(root, questionRoot),
        correctValues: collectCorrectValues(root, questionRoot),
        blankAnswers
      }));
    } catch (error) {
      return;
    }
  }

  function getAnnotationStoreElementHTML(editId) {
    if (!editId || !window.AnnotationStore || typeof window.AnnotationStore.getInitData !== 'function') {
      return null;
    }

    const initData = window.AnnotationStore.getInitData();
    if (!initData || !initData.elements) {
      return null;
    }

    return Object.prototype.hasOwnProperty.call(initData.elements, editId)
      ? initData.elements[editId]
      : null;
  }

  function captureEditableHtmlSnapshot(root) {
    const snapshot = new Map();

    root.querySelectorAll('[data-edit-id]').forEach((element) => {
      const editId = element.getAttribute('data-edit-id');
      if (!editId) return;
      snapshot.set(editId, element.innerHTML);
    });

    return snapshot;
  }

  function hydratePersistedEditRoots(root, initialHtmlSnapshot) {
    let hasHydratedFragmentMarkup = false;

    root.querySelectorAll('[data-edit-id]').forEach((element) => {
      const editId = element.getAttribute('data-edit-id');
      if (!editId) return;

      const persistedHTML = readStoredEditableHTML(editId) ?? getAnnotationStoreElementHTML(editId);
      if (persistedHTML === null) return;

      if (initialHtmlSnapshot && initialHtmlSnapshot.has(editId) && element.innerHTML !== initialHtmlSnapshot.get(editId)) {
        return;
      }

      element.innerHTML = persistedHTML;
      if (persistedHTML.indexOf('data-fragment-step') !== -1) {
        hasHydratedFragmentMarkup = true;
      }
    });

    if (hasHydratedFragmentMarkup && window.PageRichTextAnnotationRuntime && typeof window.PageRichTextAnnotationRuntime.refreshSlide === 'function') {
      const slide = root.closest('.slide');
      if (slide) {
        window.PageRichTextAnnotationRuntime.refreshSlide(slide);
      }
    }
  }

  function scheduleAnnotationStoreHydration(root, initialHtmlSnapshot) {
    if (!window.AnnotationStore || typeof window.AnnotationStore.whenReady !== 'function') {
      return;
    }

    const state = ensureState(root);
    if (state.annotationHydrationScheduled) {
      return;
    }

    state.annotationHydrationScheduled = true;
    window.AnnotationStore.whenReady().then(() => {
      if (!root.isConnected) {
        return;
      }

      hydratePersistedEditRoots(root, initialHtmlSnapshot);
    }).catch(() => {});
  }

  function refreshFragmentRuntime(root) {
    const slide = root && root.closest ? root.closest('.slide') : null;

    if (!slide || !window.PageRichTextAnnotationRuntime || typeof window.PageRichTextAnnotationRuntime.refreshSlide !== 'function') {
      return;
    }

    /* example-card 的提交会立即改变 ordinary fragment 的 reveal / hover 资格。
       如果这里只写 data-question-submitted 而不立刻刷新普通页 fragment runtime，
       CSS 侧基于运行时资格打下的 hover 标记会一直停留在“提交前”的旧状态，
       用户就会看到提交后仍然没有高光，直到下一次整页刷新才恢复。 */
    window.PageRichTextAnnotationRuntime.refreshSlide(slide);
  }

  function playQuestionNavigationSound() {
    if (!window.AudioRuntime || typeof window.AudioRuntime.playGlobalCue !== 'function') {
      return false;
    }

    /* 例题组件的“上一题 / 下一题”语义已经和整页翻页对齐成同一种课堂节奏切换。
       这里直接复用全局 page-turn cue，既能让鼠标点按钮与键盘 ↑↓ 保持完全同音，
       也避免再额外维护一套内容相同但调用路径分叉的题内翻页音效。 */
    return window.AudioRuntime.playGlobalCue('page-turn') === true;
  }

  function getQuestionNodes(root) {
    return Array.from(root.querySelectorAll(QUESTION_SELECTOR));
  }

  function getQuestionId(question, index) {
    if (!question) {
      return SINGLE_QUESTION_STATE_KEY;
    }

    const existingId = question.getAttribute('data-question-id');
    if (existingId) {
      return existingId;
    }

    const fallbackId = `question-${index + 1}`;
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
    const questionNodes = getQuestionNodes(root);

    if (questionNodes.length === 0) {
      return SINGLE_QUESTION_STATE_KEY;
    }

    const activeQuestion = questionNodes.find((question) => {
      return question.classList.contains('is-active') && !question.hidden && question.getAttribute('aria-hidden') !== 'true';
    }) || questionNodes.find((question) => !question.hidden && question.getAttribute('aria-hidden') !== 'true') || questionNodes[0];

    return getQuestionId(activeQuestion, questionNodes.indexOf(activeQuestion));
  }

  function ensureQuestionStateMap(root, state) {
    const questionNodes = getQuestionNodes(root);

    if (questionNodes.length === 0) {
      if (!state.questionStates[SINGLE_QUESTION_STATE_KEY]) {
        state.questionStates[SINGLE_QUESTION_STATE_KEY] = createQuestionState();
      }

      if (!state.activeQuestionId) {
        state.activeQuestionId = SINGLE_QUESTION_STATE_KEY;
      }

      return;
    }

    questionNodes.forEach((question, index) => {
      const questionId = getQuestionId(question, index);

      if (!state.questionStates[questionId]) {
        state.questionStates[questionId] = createQuestionState();
      }
    });

    if (!state.activeQuestionId || !state.questionStates[state.activeQuestionId]) {
      state.activeQuestionId = getInitialActiveQuestionId(root, state);
    }
  }

  function getQuestionState(root, question) {
    const state = ensureState(root);
    const questionNodes = getQuestionNodes(root);
    const questionId = question
      ? getQuestionId(question, questionNodes.indexOf(question))
      : (state.activeQuestionId || SINGLE_QUESTION_STATE_KEY);

    if (!state.questionStates[questionId]) {
      state.questionStates[questionId] = createQuestionState();
    }

    return state.questionStates[questionId];
  }

  function getActiveQuestionFromState(root, state) {
    const questionNodes = getQuestionNodes(root);

    if (questionNodes.length === 0) {
      return null;
    }

    return questionNodes.find((question, index) => getQuestionId(question, index) === state.activeQuestionId) || questionNodes[0];
  }

  function getActiveQuestion(root) {
    const state = stateMap.get(root) || ensureState(root);
    return getActiveQuestionFromState(root, state);
  }

  function getActiveQuestionContainer(root) {
    return getActiveQuestion(root) || root;
  }

  function syncActiveQuestionSnapshot(root, state) {
    const currentState = state || stateMap.get(root);

    if (!currentState) {
      return;
    }

    const activeQuestion = getQuestionNodes(root).length > 0
      ? getActiveQuestionFromState(root, currentState)
      : null;
    const activeQuestionState = currentState.questionStates[currentState.activeQuestionId || SINGLE_QUESTION_STATE_KEY] || createQuestionState();

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

    const state = stateMap.get(root);
    ensureQuestionStateMap(root, state);
    syncActiveQuestionSnapshot(root, state);
    return state;
  }

  function collectCorrectValues(root, question) {
    const targetRoot = question || root;

    return Array.from(targetRoot.querySelectorAll(OPTION_SELECTOR))
      .filter((option) => option.hasAttribute('data-correct'))
      .map((option) => option.getAttribute('data-option-value') || '')
      .filter(Boolean);
  }

  function normalizeQuestionType(questionType) {
    return Object.prototype.hasOwnProperty.call(QUESTION_TYPE_LABELS, questionType)
      ? questionType
      : '';
  }

  function getQuestionContainers(root) {
    const questionNodes = getQuestionNodes(root);
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
      const questionNodes = getQuestionNodes(root);
      return getQuestionId(questionRoot, questionNodes.indexOf(questionRoot));
    }

    return root.getAttribute('data-card-id') || 'example-card';
  }

  function createEditorLabel(text) {
    const label = document.createElement('span');
    label.className = 'example-card__editor-label';
    label.textContent = text;
    return label;
  }

  function createAnswerKeyButton(value) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'example-card__answer-key';
    button.setAttribute('data-answer-value', value);
    button.textContent = value;
    return button;
  }

  function ensureBlankAnswerEditorRow(root, questionRoot) {
    const main = getQuestionMain(questionRoot || root);

    if (!main) {
      return null;
    }

    let row = main.querySelector('.example-card__editor-blank-answer');

    if (row) {
      return row;
    }

    row = document.createElement('div');
    row.className = 'example-card__editor-blank-answer';
    row.setAttribute('data-editor-only', 'true');
    row.setAttribute('aria-label', '填空答案编辑区');
    row.appendChild(createEditorLabel('正确答案'));

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'example-card__blank-answer-input';
    input.placeholder = '请输入填空答案';
    input.autocomplete = 'off';
    input.spellcheck = false;
    row.appendChild(input);

    const stem = getQuestionStem(questionRoot || root);
    if (stem) {
      main.insertBefore(row, stem);
    } else {
      main.prepend(row);
    }

    return row;
  }

  function ensureAnswerKeyRow(root, questionRoot) {
    const main = getQuestionMain(questionRoot || root);

    if (!main) {
      return null;
    }

    let row = main.querySelector('.example-card__editor-answer-key');

    if (row) {
      return row;
    }

    row = document.createElement('div');
    row.className = 'example-card__editor-answer-key';
    row.setAttribute('data-editor-only', 'true');
    row.setAttribute('aria-label', '正确答案编辑区');
    row.appendChild(createEditorLabel('正确答案'));
    DEFAULT_CHOICE_VALUES.forEach((value) => {
      row.appendChild(createAnswerKeyButton(value));
    });

    const stem = getQuestionStem(questionRoot || root);
    if (stem) {
      main.insertBefore(row, stem);
    } else {
      main.prepend(row);
    }

    return row;
  }

  function createTypeButton(type) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'example-card__type-button';
    button.setAttribute('data-question-type-value', type);
    button.textContent = QUESTION_TYPE_LABELS[type];
    return button;
  }

  function ensureTypePickerRow(root, questionRoot) {
    const main = getQuestionMain(questionRoot || root);

    if (!main) {
      return null;
    }

    let row = main.querySelector(TYPE_PICKER_SELECTOR);

    if (row) {
      return row;
    }

    row = document.createElement('div');
    row.className = 'example-card__editor-type-picker';
    row.setAttribute('data-editor-only', 'true');
    row.appendChild(createEditorLabel('题型'));

    ['single', 'multi', 'flex', 'blank'].forEach((type) => {
      row.appendChild(createTypeButton(type));
    });

    const multiHint = document.createElement('span');
    multiHint.className = 'example-card__editor-multi-hint';
    multiHint.textContent = '至少选择两个答案';
    multiHint.hidden = true;
    row.appendChild(multiHint);

    const answerKeyRow = ensureAnswerKeyRow(root, questionRoot);
    if (answerKeyRow && answerKeyRow.parentNode === main) {
      main.insertBefore(row, answerKeyRow);
    } else {
      main.prepend(row);
    }

    return row;
  }

  function ensureChoiceAnswerSection(root, questionRoot) {
    const targetRoot = questionRoot || root;
    let answers = targetRoot.querySelector('.example-card__answers');

    if (answers) {
      return answers;
    }

    const main = getQuestionMain(targetRoot);
    if (!main) {
      return null;
    }

    answers = document.createElement('div');
    answers.className = 'example-card__answers';
    const questionDomKey = buildQuestionDomKey(root, questionRoot || root);

    DEFAULT_CHOICE_VALUES.forEach((value, index) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'qa-option example-card__option';
      option.setAttribute('data-option-value', value);

      if (index === 0) {
        option.setAttribute('data-correct', 'true');
      }

      const label = document.createElement('span');
      label.className = 'qa-option-label';
      label.textContent = value;

      const text = document.createElement('span');
      text.className = 'qa-option-text';
      text.setAttribute('data-edit-id', `${questionDomKey}-option-${value.toLowerCase()}`);
      text.textContent = `选项 ${value}`;

      option.appendChild(label);
      option.appendChild(text);
      answers.appendChild(option);
    });

    main.appendChild(answers);
    return answers;
  }

  function ensureBlankSlot(root, questionRoot) {
    const targetRoot = questionRoot || root;
    const stem = getQuestionStem(targetRoot);

    if (!stem || stem.querySelector(BLANK_SELECTOR)) {
      return stem ? stem.querySelector(BLANK_SELECTOR) : null;
    }

    const blank = document.createElement('span');
    blank.className = 'example-card__blank';
    blank.setAttribute('data-blank-id', `${buildQuestionDomKey(root, questionRoot || root)}-blank-1`);
    blank.setAttribute('data-correct-answer', '答案');
    blank.textContent = '______';
    stem.append(' ', blank);
    return blank;
  }

  function ensureQuestionStructureForType(root, questionRoot, questionType) {
    ensureTypePickerRow(root, questionRoot);

    if (questionType === 'blank') {
      ensureBlankSlot(root, questionRoot);
      ensureBlankAnswerEditorRow(root, questionRoot);
      return;
    }

    ensureAnswerKeyRow(root, questionRoot);
    ensureChoiceAnswerSection(root, questionRoot);
    ensureBlankAnswerEditorRow(root, questionRoot);
  }

  function applyStoredAuthoringConfig(root, questionRoot, config) {
    const targetRoot = questionRoot || root;

    if (!config || typeof config !== 'object') {
      return;
    }

    const storedQuestionType = normalizeQuestionType(config.questionType) || getQuestionType(root, questionRoot);

    ensureQuestionStructureForType(root, questionRoot, storedQuestionType);
    targetRoot.setAttribute('data-question-type', storedQuestionType);

    if (Array.isArray(config.correctValues) && storedQuestionType !== 'blank') {
      targetRoot.querySelectorAll(OPTION_SELECTOR).forEach((option) => {
        option.removeAttribute('data-correct');
      });

      config.correctValues.forEach((value) => {
        const option = Array.from(targetRoot.querySelectorAll(OPTION_SELECTOR)).find((candidate) => {
          return (candidate.getAttribute('data-option-value') || '') === value;
        });

        if (option) {
          option.setAttribute('data-correct', 'true');
        }
      });
    }

    if (Array.isArray(config.blankAnswers)) {
      config.blankAnswers.forEach((blankConfig, index) => {
        const blankId = blankConfig && blankConfig.blankId ? blankConfig.blankId : '';
        const selector = blankId
          ? `${BLANK_SELECTOR}[data-blank-id="${blankId}"]`
          : null;
        const blank = selector
          ? targetRoot.querySelector(selector)
          : targetRoot.querySelectorAll(BLANK_SELECTOR)[index] || null;

        if (blank) {
          blank.setAttribute('data-correct-answer', blankConfig && blankConfig.correctAnswer ? blankConfig.correctAnswer : '');
        }
      });
    }
  }

  function hydrateStoredAuthoringConfig(root) {
    getQuestionContainers(root).forEach((questionRoot) => {
      const scopedQuestionRoot = questionRoot === root ? null : questionRoot;
      const config = readStoredAuthoringConfig(root, scopedQuestionRoot);
      applyStoredAuthoringConfig(root, scopedQuestionRoot, config);
    });
  }

  function inferQuestionType(root, question) {
    const explicitType = normalizeQuestionType((question && question.getAttribute('data-question-type')) || root.getAttribute('data-question-type'));

    if (explicitType) {
      return explicitType;
    }

    const targetRoot = question || root;

    if (targetRoot.querySelector(BLANK_SELECTOR)) {
      return 'blank';
    }

    return collectCorrectValues(root, question).length > 1 ? 'multi' : 'single';
  }

  function getQuestionType(root, question) {
    return inferQuestionType(root, question);
  }

  function isEditorMode() {
    const docEl = document.documentElement;
    const body = document.body;

    return Boolean(
      (docEl && docEl.classList.contains('editor-mode')) ||
      (body && body.classList.contains('editor-mode'))
    );
  }

  function syncAnswerKey(root) {
    const questionRoot = getActiveQuestionContainer(root);
    const questionType = getQuestionType(root, questionRoot === root ? null : questionRoot);
    const correctValues = collectCorrectValues(root, questionRoot === root ? null : questionRoot);
    const answerKeyRow = questionRoot.querySelector('.example-card__editor-answer-key');

    if (answerKeyRow) {
      answerKeyRow.hidden = questionType === 'blank';
      answerKeyRow.setAttribute('aria-hidden', questionType === 'blank' ? 'true' : 'false');
    }

    questionRoot.querySelectorAll(ANSWER_KEY_SELECTOR).forEach((button) => {
      const value = button.getAttribute('data-answer-value') || '';
      button.classList.toggle('is-active', value !== '' && correctValues.includes(value));
    });
  }

  function syncQuestionTypeUI(root) {
    getQuestionContainers(root).forEach((questionRoot) => {
      const normalizedType = getQuestionType(root, questionRoot === root ? null : questionRoot);
      const targetRoot = questionRoot === root ? root : questionRoot;
      const stem = getQuestionStem(questionRoot);
      const typePicker = ensureTypePickerRow(root, questionRoot === root ? null : questionRoot);
      const answers = targetRoot.querySelector('.example-card__answers');
      const answerKeyRow = ensureAnswerKeyRow(root, questionRoot === root ? null : questionRoot);
      const blankAnswerRow = ensureBlankAnswerEditorRow(root, questionRoot === root ? null : questionRoot);
      const correctCount = collectCorrectValues(root, questionRoot === root ? null : questionRoot).length;
      const blank = targetRoot.querySelector(BLANK_SELECTOR);

      targetRoot.setAttribute('data-question-type', normalizedType);

      if (stem) {
        stem.setAttribute('data-question-type-label', QUESTION_TYPE_LABELS[normalizedType] || '');
        stem.setAttribute('data-question-type', normalizedType);
      }

      if (typePicker) {
        typePicker.querySelectorAll(TYPE_BUTTON_SELECTOR).forEach((button) => {
          const typeValue = button.getAttribute('data-question-type-value') || '';
          button.classList.toggle('is-active', typeValue === normalizedType);
        });

        const multiHint = typePicker.querySelector(MULTI_HINT_SELECTOR);
        if (multiHint) {
          const shouldShowMultiHint = normalizedType === 'multi';
          multiHint.hidden = !shouldShowMultiHint;
          multiHint.classList.toggle('is-invalid', shouldShowMultiHint && correctCount < 2);
          if (!shouldShowMultiHint) {
            multiHint.classList.remove('is-shaking');
          }
        }
      }

      if (answerKeyRow) {
        answerKeyRow.hidden = normalizedType === 'blank';
        answerKeyRow.setAttribute('aria-hidden', normalizedType === 'blank' ? 'true' : 'false');
      }

      if (blankAnswerRow) {
        const shouldShowBlankEditor = normalizedType === 'blank';
        const blankInput = blankAnswerRow.querySelector(BLANK_ANSWER_INPUT_SELECTOR);
        blankAnswerRow.hidden = !shouldShowBlankEditor;
        blankAnswerRow.setAttribute('aria-hidden', shouldShowBlankEditor ? 'false' : 'true');

        if (blankInput) {
          blankInput.disabled = !shouldShowBlankEditor;
          blankInput.value = blank ? (blank.getAttribute('data-correct-answer') || '') : '';
        }
      }

      if (answers) {
        answers.hidden = normalizedType === 'blank';
        answers.setAttribute('aria-hidden', normalizedType === 'blank' ? 'true' : 'false');
      }
    });
  }

  function setCorrectValuesForSingleChoice(targetRoot, value) {
    targetRoot.querySelectorAll(OPTION_SELECTOR).forEach((option) => {
      const optionValue = option.getAttribute('data-option-value') || '';

      if (optionValue === value) {
        option.setAttribute('data-correct', 'true');
      } else {
        option.removeAttribute('data-correct');
      }
    });
  }

  function toggleCorrectValueForMultiChoice(targetRoot, value) {
    const targetOption = Array.from(targetRoot.querySelectorAll(OPTION_SELECTOR)).find((option) => {
      return (option.getAttribute('data-option-value') || '') === value;
    });

    if (!targetOption) {
      return;
    }

    if (targetOption.hasAttribute('data-correct')) {
      targetOption.removeAttribute('data-correct');
    } else {
      targetOption.setAttribute('data-correct', 'true');
    }
  }

  function setQuestionType(root, questionRoot, nextType) {
    const normalizedType = normalizeQuestionType(nextType) || 'single';
    const targetRoot = questionRoot || root;

    ensureQuestionStructureForType(root, questionRoot, normalizedType);
    targetRoot.setAttribute('data-question-type', normalizedType);

    if (normalizedType === 'single') {
      const firstCorrectValue = collectCorrectValues(root, questionRoot)[0]
        || (targetRoot.querySelector(OPTION_SELECTOR) && targetRoot.querySelector(OPTION_SELECTOR).getAttribute('data-option-value'))
        || 'A';
      setCorrectValuesForSingleChoice(targetRoot, firstCorrectValue);
    }

    if ((normalizedType === 'multi' || normalizedType === 'flex') && collectCorrectValues(root, questionRoot).length === 0) {
      const firstOption = targetRoot.querySelector(OPTION_SELECTOR);
      if (firstOption) {
        firstOption.setAttribute('data-correct', 'true');
      }
    }

    const state = getQuestionState(root, questionRoot);
    state.correctValues = collectCorrectValues(root, questionRoot);

    if (state.submitted && normalizedType !== 'blank') {
      state.isCorrect = hasSameValueSet(state.selectedValues, state.correctValues);
    }

    if (state.submitted && normalizedType === 'blank') {
      state.isCorrect = null;
    }

    syncActiveQuestionSnapshot(root, stateMap.get(root));
    syncQuestionTypeUI(root);
    syncAnswerKey(root);
    renderSelection(root);
    renderSubmission(root);
    writeStoredAuthoringConfig(root, questionRoot);
  }

  function updateBlankAnswerFromEditor(root, input) {
    if (!root || !input || !isEditorMode()) {
      return;
    }

    const questionRoot = input.closest(QUESTION_SELECTOR);
    const targetRoot = questionRoot || root;
    const blank = targetRoot.querySelector(BLANK_SELECTOR);

    if (!blank || getQuestionType(root, questionRoot) !== 'blank') {
      return;
    }

    blank.setAttribute('data-correct-answer', input.value);

    /* 填空题的标准答案不在富文本正文里直接表达，
       编辑态这里必须显式写回作者态快照，才能保证刷新后仍然保留最新答案。 */
    writeStoredAuthoringConfig(root, questionRoot);
    syncQuestionTypeUI(root);
    renderSubmission(root);
  }

  function shakeMultiHint(root, questionRoot) {
    const targetRoot = questionRoot || root;
    const hint = targetRoot.querySelector(MULTI_HINT_SELECTOR);

    if (!hint) {
      return;
    }

    hint.hidden = false;
    hint.classList.add('is-invalid');
    hint.classList.remove('is-shaking');
    void hint.offsetWidth;
    hint.classList.add('is-shaking');
  }

  function hasInvalidMultiAnswerConfiguration(root, questionRoot) {
    return getQuestionType(root, questionRoot) === 'multi' && collectCorrectValues(root, questionRoot).length < 2;
  }

  function installEditorExitGuard() {
    const editorCore = window.editorCore;

    if (!editorCore || typeof editorCore.toggleEditMode !== 'function' || editorCore.__exampleCardExitGuardInstalled) {
      return;
    }

    const originalToggleEditMode = editorCore.toggleEditMode;

    editorCore.toggleEditMode = function patchedExampleCardEditModeToggle() {
      if (this.isActive) {
        const invalidContexts = [];

        document.querySelectorAll(CARD_SELECTOR).forEach((root) => {
          getQuestionContainers(root).forEach((questionRoot) => {
            const scopedQuestionRoot = questionRoot === root ? null : questionRoot;

            if (hasInvalidMultiAnswerConfiguration(root, scopedQuestionRoot)) {
              invalidContexts.push({ root, questionRoot: scopedQuestionRoot });
            }
          });
        });

        if (invalidContexts.length > 0) {
          invalidContexts.forEach(({ root, questionRoot }) => {
            syncQuestionTypeUI(root);
            shakeMultiHint(root, questionRoot);
          });
          return false;
        }
      }

      return originalToggleEditMode.apply(this, arguments);
    };

    editorCore.__exampleCardExitGuardInstalled = true;
  }

  function updateCorrectValuesFromAnswerKey(root, button) {
    const questionRoot = button.closest(QUESTION_SELECTOR);
    const value = button.getAttribute('data-answer-value') || '';
    const questionType = getQuestionType(root, questionRoot);

    if (value === '') {
      return;
    }

    // 答案键本质上是作者配置“标准答案”的入口，而不是学生作答控件；
    // 只有在编辑态才允许改写 data-correct，才能避免放映/练习态误触后直接篡改判分基准。
    if (!isEditorMode()) {
      return;
    }

    const targetRoot = questionRoot || root;

    if (questionType === 'blank') {
      return;
    }

    if (questionType === 'multi' || questionType === 'flex') {
      toggleCorrectValueForMultiChoice(targetRoot, value);
    } else {
      setCorrectValuesForSingleChoice(targetRoot, value);
    }

    const state = getQuestionState(root, questionRoot);
    state.correctValues = collectCorrectValues(root, questionRoot);

    if (state.submitted) {
      state.isCorrect = hasSameValueSet(state.selectedValues, state.correctValues);
      syncActiveQuestionSnapshot(root, stateMap.get(root));
      renderSubmission(root);
    }

    syncQuestionTypeUI(root);
    syncAnswerKey(root);
    writeStoredAuthoringConfig(root, questionRoot);
  }

  function revealBlankAnswers(root) {
    root.querySelectorAll(BLANK_SELECTOR).forEach((blank) => {
      blank.textContent = blank.getAttribute('data-correct-answer') || '';
      blank.classList.add('is-revealed');
    });
  }

  function syncQuestionGateState(root) {
    const state = ensureState(root);
    const questionNodes = root.querySelectorAll(QUESTION_SELECTOR);

    if (questionNodes.length === 0) {
      // 单题旧结构还没有 question wrapper 时，直接把门禁状态落在卡片根上，
      // 让 page-richtext runtime 仍然能从 DOM 上读到“当前这题是否已提交”。
      root.setAttribute('data-question-active', 'true');
      root.setAttribute('data-question-submitted', state.submitted ? 'true' : 'false');
      return;
    }

    questionNodes.forEach((question, index) => {
      const questionId = getQuestionId(question, index);
      const questionState = state.questionStates[questionId] || createQuestionState();
      const isActive = state.activeQuestionId === questionId;

      question.hidden = !isActive;
      question.setAttribute('aria-hidden', isActive ? 'false' : 'true');
      question.classList.toggle('is-active', isActive);
      question.setAttribute('data-question-active', isActive ? 'true' : 'false');
      question.setAttribute('data-question-submitted', isActive && questionState.submitted ? 'true' : 'false');
    });
  }

  function renderNavigation(root) {
    const questionNodes = getQuestionNodes(root);
    const questionRoot = getActiveQuestionContainer(root);
    const prevBtn = questionRoot.querySelector(PREV_BUTTON_SELECTOR) || root.querySelector(PREV_BUTTON_SELECTOR);
    const nextBtn = questionRoot.querySelector(NEXT_BUTTON_SELECTOR) || root.querySelector(NEXT_BUTTON_SELECTOR);

    if (questionNodes.length <= 1) {
      if (prevBtn) {
        prevBtn.disabled = true;
      }

      if (nextBtn) {
        nextBtn.disabled = true;
      }

      return;
    }

    const activeQuestion = getActiveQuestion(root);
    const activeIndex = activeQuestion ? questionNodes.indexOf(activeQuestion) : 0;

    if (prevBtn) {
      prevBtn.disabled = activeIndex <= 0;
    }

    if (nextBtn) {
      nextBtn.disabled = activeIndex >= questionNodes.length - 1;
    }
  }

  function activateQuestion(root, nextQuestionId) {
    const state = ensureState(root);

    if (!nextQuestionId || !state.questionStates[nextQuestionId] || state.activeQuestionId === nextQuestionId) {
      return false;
    }

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
    const questionNodes = getQuestionNodes(root);

    if (questionNodes.length <= 1) {
      return false;
    }

    const activeQuestion = getActiveQuestion(root);
    const activeIndex = activeQuestion ? questionNodes.indexOf(activeQuestion) : 0;
    const nextIndex = direction === 'backward' ? activeIndex - 1 : activeIndex + 1;
    const nextQuestion = questionNodes[nextIndex];

    if (!nextQuestion) {
      return false;
    }

    const didActivate = activateQuestion(root, getQuestionId(nextQuestion, nextIndex));

    if (didActivate) {
      playQuestionNavigationSound();
    }

    return didActivate;
  }

  function hasSameValueSet(selectedValues, correctValues) {
    const selectedSet = new Set(selectedValues);
    const correctSet = new Set(correctValues);

    // 判分要比较的是“最终答案集合是否一致”，而不是数组顺序；
    // 这样后续即便扩展到多选，也能继续复用同一条卡片级判分语义。
    if (selectedSet.size !== correctSet.size) {
      return false;
    }

    return Array.from(selectedSet).every((value) => correctSet.has(value));
  }

  function renderSelection(root) {
    const state = getQuestionState(root, getActiveQuestion(root));
    const questionRoot = getActiveQuestionContainer(root);

    questionRoot.querySelectorAll(OPTION_SELECTOR).forEach((option) => {
      const value = option.getAttribute('data-option-value') || '';

      // 选择态完全由状态驱动重绘，避免通过直接切换 DOM 类名导致多个选项残留 selected。
      option.classList.toggle('selected', value !== '' && state.selectedValues.includes(value));
    });
  }

  function syncResultMark(option, markKind) {
    const optionLabel = option.querySelector('.qa-option-label') || option;
    let markEl = optionLabel.querySelector(RESULT_MARK_SELECTOR);

    if (!markKind) {
      if (markEl) {
        markEl.remove();
      }

      return;
    }

    if (!markEl) {
      markEl = document.createElement('span');
      markEl.className = 'qa-result-mark';
      optionLabel.appendChild(markEl);
    }

    // 这里沿用答题与批注组件的 √ / ✗ 语义，
    // 让学生在提交后第一眼就能从选项字母圆点旁读出“我选错了什么 / 正确项是哪一个”，
    // 不需要再额外扫一遍整张题卡去猜红绿边框分别代表什么。
    markEl.textContent = markKind === 'correct' ? '✓' : '✗';
    markEl.className = `qa-result-mark ${markKind} visible`;
  }

  function renderSubmission(root) {
    const state = getQuestionState(root, getActiveQuestion(root));
    const questionRoot = getActiveQuestionContainer(root);
    const analysisToggle = questionRoot.querySelector(ANALYSIS_TOGGLE_SELECTOR);
    const submitBtn = questionRoot.querySelector(SUBMIT_BUTTON_SELECTOR);

    root.classList.toggle('is-submitted', state.submitted);

    if (analysisToggle) {
      analysisToggle.disabled = !state.submitted;
    }

    if (submitBtn) {
      submitBtn.disabled = state.submitted;
    }

    questionRoot.querySelectorAll(OPTION_SELECTOR).forEach((option) => {
      const value = option.getAttribute('data-option-value') || '';
      const isSelected = value !== '' && state.selectedValues.includes(value);
      const isCorrect = value !== '' && state.correctValues.includes(value);

      // 提交后的反馈需要同时告诉学生“你错选了什么”和“标准答案是什么”，
      // 否则只把错误项标红会让复盘断在半路，还得额外猜哪一项才是正确答案。
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
    const state = getQuestionState(root, getActiveQuestion(root));
    const questionRoot = getActiveQuestionContainer(root);
    const analysis = questionRoot.querySelector(ANALYSIS_PANEL_SELECTOR);
    const shouldOpen = state.submitted && state.analysisExpanded;

    root.querySelectorAll(ANALYSIS_PANEL_SELECTOR).forEach((panel) => {
      panel.hidden = panel !== analysis || !shouldOpen;
    });

    root.classList.toggle('is-analysis-open', shouldOpen);
  }

  function handleOptionClick(option) {
    const root = option.closest(CARD_SELECTOR);
    const questionRoot = option.closest(QUESTION_SELECTOR);

    if (!root) {
      return;
    }

    const value = option.getAttribute('data-option-value') || '';

    // 没有稳定选项值的节点不参与状态写入，避免异常标记把整张卡片置入不可预测状态。
    if (value === '') {
      return;
    }

    const state = getQuestionState(root, questionRoot);
  const questionType = getQuestionType(root, questionRoot);

    // 编辑模式下点击选项的意图是把光标放进题目文案里继续编辑，
    // 不是执行学生态作答。这里如果不直接短路，作者一边改选项文本、一边就会把 runtime 的 selectedValues 改脏，
    // 后续提交态与答案键预览都会读到一份并非作者真正想表达的“作答结果”。
    if (isEditorMode()) {
      return;
    }

    // 提交后的卡片必须冻结作答交互，原因不是单纯防止重复点击，
    // 而是要保证“作答结果”和“判分结果”一一对应，避免用户在看到正确答案后再改选，破坏复盘语义。
    if (state.submitted) {
      return;
    }

     /* 多选与不定项选择在学生态都要保留“答案集合”的语义，
       区别只在作者态约束：多选必须至少两个标准答案，不定项允许一个或多个。
       但一旦进入学生作答阶段，这两类题都不能再退回“最后一次点击覆盖之前全部选择”的单选行为，
       否则不定项选择会看起来像单选题，提交后也无法保留被错选项的红色反馈。 */
     if (questionType === 'multi' || questionType === 'flex') {
      const selectedSet = new Set(state.selectedValues);

      if (selectedSet.has(value)) {
        selectedSet.delete(value);
      } else {
        selectedSet.add(value);
      }

      state.selectedValues = Array.from(selectedSet);
    } else {
      state.selectedValues = [value];
    }

    syncActiveQuestionSnapshot(root, stateMap.get(root));
    renderSelection(root);
  }

  function submitCard(root) {
    const questionRoot = getActiveQuestion(root);
    const state = getQuestionState(root, questionRoot);
    const questionType = getQuestionType(root, questionRoot);

    state.submitted = true;
    state.analysisExpanded = false;

    if (questionType === 'blank') {
      state.correctValues = [];
      // blank 题这一轮只做“揭示标准答案”，不做学生输入与对错判定；
      // 因为当前组件还没有采集 blank 作答值的正式交互，硬给 true/false 只会制造伪判分语义，
      // 同时也不能播放对错音效，否则会把“仅 reveal 正确答案”误包装成已经完成正式判分。
      state.isCorrect = null;
      syncActiveQuestionSnapshot(root, stateMap.get(root));
      revealBlankAnswers(root);
      renderSubmission(root);
      renderAnalysis(root);
      refreshFragmentRuntime(root);
      return;
    }

    state.correctValues = collectCorrectValues(root, questionRoot);
    // 提交瞬间把卡片级判分结果固化下来，后续音效、统计、解析开关等逻辑
    // 都应该消费这个布尔语义，而不是重复比较集合，避免提交后语义源分散。
    state.isCorrect = hasSameValueSet(state.selectedValues, state.correctValues);
    syncActiveQuestionSnapshot(root, stateMap.get(root));

    renderSelection(root);
    renderSubmission(root);
    renderAnalysis(root);
    refreshFragmentRuntime(root);

    if (window.ExampleCardAudio && typeof window.ExampleCardAudio.playSubmitResult === 'function') {
      // runtime 这里保持在“提交结果语义”层，而不直接播 answer-correct / answer-wrong cue；
      // 这样音频资源映射、兜底静音和未来题型差异都还能收敛在 ExampleCardAudio 里，不把组件运行时绑死到全局 cue 名称。
      window.ExampleCardAudio.playSubmitResult({ isCorrect: state.isCorrect === true });
    }
  }

  function toggleAnalysis(root) {
    const questionRoot = getActiveQuestion(root);
    const state = getQuestionState(root, questionRoot);
    const analysis = getActiveQuestionContainer(root).querySelector(ANALYSIS_PANEL_SELECTOR);

    // 解析区在提交前必须保持关闭，核心原因是它承担的是“判分后的复盘信息”，
    // 不是作答前提示；如果允许提前展开，就会直接泄露答案线索，打破先作答再讲解的流程边界。
    if (!state.submitted || !analysis) {
      return;
    }

    state.analysisExpanded = !state.analysisExpanded;
    syncActiveQuestionSnapshot(root, stateMap.get(root));
    renderAnalysis(root);
  }

  function initCard(root) {
    const initialHtmlSnapshot = captureEditableHtmlSnapshot(root);

    ensureState(root);
    getQuestionContainers(root).forEach((questionRoot) => {
      const scopedQuestionRoot = questionRoot === root ? null : questionRoot;
      ensureQuestionStructureForType(root, scopedQuestionRoot, getQuestionType(root, scopedQuestionRoot));
    });
    installEditorExitGuard();
    /* example-card 在真实课件页里经常不是源码直出，而是 template clone 之后才挂到 DOM。
       这意味着 editor-core / annotation-store 的全局首次恢复可能已经跑完了，
       但当前题卡的 stem / option / analysis 根块此刻才真正出现。
       因此这里要像答题与批注组件动态创建气泡那样，在 initCard 阶段主动补一次持久化回放，
       并在 AnnotationStore 延迟就绪时再补一次，避免用户遇到“第一次刷新还看不到，第二次才出现”。 */
    hydratePersistedEditRoots(root, initialHtmlSnapshot);
    scheduleAnnotationStoreHydration(root, initialHtmlSnapshot);
    hydrateStoredAuthoringConfig(root);
    syncQuestionGateState(root);
    syncQuestionTypeUI(root);
    syncAnswerKey(root);
    renderSelection(root);
    renderSubmission(root);
    renderAnalysis(root);
    renderNavigation(root);
  }

  function initAll(scope = document) {
    scope.querySelectorAll(CARD_SELECTOR).forEach((root) => {
      initCard(root);
    });
  }

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    const typeButton = event.target.closest(TYPE_BUTTON_SELECTOR);

    if (typeButton) {
      const root = typeButton.closest(CARD_SELECTOR);

      if (root) {
        const questionRoot = typeButton.closest(QUESTION_SELECTOR);
        const nextType = typeButton.getAttribute('data-question-type-value') || '';
        setQuestionType(root, questionRoot, nextType);
      }

      return;
    }

    const answerKey = event.target.closest(ANSWER_KEY_SELECTOR);

    if (answerKey) {
      const root = answerKey.closest(CARD_SELECTOR);

      if (root) {
        updateCorrectValuesFromAnswerKey(root, answerKey);
      }

      return;
    }

    const option = event.target.closest(OPTION_SELECTOR);

    if (option) {
      handleOptionClick(option);
      return;
    }

    const submitBtn = event.target.closest(SUBMIT_BUTTON_SELECTOR);

    if (submitBtn) {
      const root = submitBtn.closest(CARD_SELECTOR);

      if (root) {
        submitCard(root);
      }

      return;
    }

    const prevBtn = event.target.closest(PREV_BUTTON_SELECTOR);

    if (prevBtn) {
      const root = prevBtn.closest(CARD_SELECTOR);

      if (root) {
        navigateQuestion(root, 'backward');
      }

      return;
    }

    const nextBtn = event.target.closest(NEXT_BUTTON_SELECTOR);

    if (nextBtn) {
      const root = nextBtn.closest(CARD_SELECTOR);

      if (root) {
        navigateQuestion(root, 'forward');
      }

      return;
    }

    const analysisToggle = event.target.closest(ANALYSIS_TOGGLE_SELECTOR);

    if (analysisToggle) {
      const root = analysisToggle.closest(CARD_SELECTOR);

      if (root) {
        toggleAnalysis(root);
      }
    }
  });

  document.addEventListener('input', (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    const blankInput = event.target.closest(BLANK_ANSWER_INPUT_SELECTOR);

    if (!blankInput) {
      return;
    }

    const root = blankInput.closest(CARD_SELECTOR);
    if (root) {
      updateBlankAnswerFromEditor(root, blankInput);
    }
  });

  window.ExampleCardRuntime = {
    initAll,
    initCard
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initAll();
    });
  } else {
    initAll();
  }
})();