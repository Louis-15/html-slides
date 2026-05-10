/* ===========================================
   EXAMPLE-CARD-AUTHORING.JS
   例题组件 — 作者态模块
   职责：题型切换器、答案键编辑、填空答案编辑、作者配置持久化、编辑退出守卫
   依赖：example-card-core.js（通过 window.ExampleCardRuntime 访问核心 API）
   =========================================== */

(function () {
  'use strict';

  var RT = window.ExampleCardRuntime;
  if (!RT || typeof RT.initAll !== 'function') return;

  /* ========== 编辑器 UI 元素创建 ========== */

  function createEditorLabel(text) {
    var label = document.createElement('span');
    label.className = 'example-card__editor-label';
    label.textContent = text;
    return label;
  }

  function createAnswerKeyButton(value) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'example-card__answer-key';
    button.setAttribute('data-answer-value', value);
    button.textContent = value;
    return button;
  }

  function createTypeButton(type) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'example-card__type-button';
    button.setAttribute('data-question-type-value', type);
    button.textContent = RT.QUESTION_TYPE_LABELS[type];
    return button;
  }

  /* ========== DOM 结构确保函数 ========== */

  function ensureTypePickerRow(root, questionRoot) {
    var main = RT.getQuestionMain(questionRoot || root);
    if (!main) return null;

    var row = main.querySelector('.example-card__editor-type-picker');
    if (row) return row;

    row = document.createElement('div');
    row.className = 'example-card__editor-type-picker';
    row.setAttribute('data-editor-only', 'true');
    row.appendChild(createEditorLabel('题型'));

    ['single', 'multi', 'flex', 'blank'].forEach(function (type) {
      row.appendChild(createTypeButton(type));
    });

    var multiHint = document.createElement('span');
    multiHint.className = 'example-card__editor-multi-hint';
    multiHint.textContent = '\u81F3\u5C11\u9009\u62E9\u4E24\u4E2A\u7B54\u6848';
    multiHint.hidden = true;
    row.appendChild(multiHint);

    var answerKeyRow = ensureAnswerKeyRow(root, questionRoot);
    if (answerKeyRow && answerKeyRow.parentNode === main) {
      main.insertBefore(row, answerKeyRow);
    } else {
      main.prepend(row);
    }
    return row;
  }

  function ensureAnswerKeyRow(root, questionRoot) {
    var main = RT.getQuestionMain(questionRoot || root);
    if (!main) return null;

    var row = main.querySelector('.example-card__editor-answer-key');
    if (row) return row;

    row = document.createElement('div');
    row.className = 'example-card__editor-answer-key';
    row.setAttribute('data-editor-only', 'true');
    row.setAttribute('aria-label', '\u6B63\u786E\u7B54\u6848\u7F16\u8F91\u533A');
    row.appendChild(createEditorLabel('\u6B63\u786E\u7B54\u6848'));
    RT.DEFAULT_CHOICE_VALUES.forEach(function (value) { row.appendChild(createAnswerKeyButton(value)); });

    var stem = RT.getQuestionStem(questionRoot || root);
    if (stem && stem.parentNode === main) {
      main.insertBefore(row, stem);
    } else {
      main.prepend(row);
    }
    return row;
  }

  function ensureBlankAnswerEditorRow(root, questionRoot) {
    var main = RT.getQuestionMain(questionRoot || root);
    if (!main) return null;

    var row = main.querySelector('.example-card__editor-blank-answer');
    if (row) return row;

    row = document.createElement('div');
    row.className = 'example-card__editor-blank-answer';
    row.setAttribute('data-editor-only', 'true');
    row.setAttribute('aria-label', '\u586B\u7A7A\u7B54\u6848\u7F16\u8F91\u533A');
    row.appendChild(createEditorLabel('\u6B63\u786E\u7B54\u6848'));

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'example-card__blank-answer-input';
    input.placeholder = '\u8BF7\u8F93\u5165\u586B\u7A7A\u7B54\u6848';
    input.autocomplete = 'off';
    input.spellcheck = false;
    row.appendChild(input);

    var stem = RT.getQuestionStem(questionRoot || root);
    if (stem && stem.parentNode === main) {
      main.insertBefore(row, stem);
    } else {
      main.prepend(row);
    }
    return row;
  }

  function ensureChoiceAnswerSection(root, questionRoot) {
    var targetRoot = questionRoot || root;
    var answers = targetRoot.querySelector('.example-card__answers');
    if (answers) return answers;

    var main = RT.getQuestionMain(targetRoot);
    if (!main) return null;

    answers = document.createElement('div');
    answers.className = 'example-card__answers';
    var questionDomKey = RT.buildQuestionDomKey(root, questionRoot || root);

    RT.DEFAULT_CHOICE_VALUES.forEach(function (value, index) {
      var option = document.createElement('button');
      option.type = 'button';
      option.className = 'qa-option example-card__option';
      option.setAttribute('data-option-value', value);
      if (index === 0) option.setAttribute('data-correct', 'true');

      var label = document.createElement('span');
      label.className = 'qa-option-label';
      label.textContent = value;

      var text = document.createElement('span');
      text.className = 'qa-option-text';
      text.setAttribute('data-edit-id', questionDomKey + '-option-' + value.toLowerCase());
      text.textContent = '\u9009\u9879 ' + value;

      option.appendChild(label);
      option.appendChild(text);
      answers.appendChild(option);
    });

    main.appendChild(answers);
    return answers;
  }

  function ensureBlankSlot(root, questionRoot) {
    var targetRoot = questionRoot || root;
    var stem = RT.getQuestionStem(targetRoot);
    if (!stem || stem.querySelector(RT.BLANK_SELECTOR)) return stem ? stem.querySelector(RT.BLANK_SELECTOR) : null;

    var blank = document.createElement('span');
    blank.className = 'example-card__blank';
    blank.setAttribute('data-blank-id', RT.buildQuestionDomKey(root, questionRoot || root) + '-blank-1');
    blank.setAttribute('data-correct-answer', '\u7B54\u6848');
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
  }

  /* ========== 作者配置持久化 ========== */

  function getAuthoringPersistenceKey(root, questionRoot) {
    var utils = window._editorUtils;
    if (!utils || typeof utils.storageKey !== 'function') return '';

    var targetRoot = questionRoot || root;
    var stem = RT.getQuestionStem(targetRoot);
    var stemEditId = stem && stem.getAttribute ? stem.getAttribute('data-edit-id') : '';
    var cardId = root.getAttribute('data-card-id') || '';
    var fallbackId = RT.buildQuestionDomKey(root, targetRoot === root ? null : targetRoot);
    var persistenceId = stemEditId || cardId || fallbackId;
    if (!persistenceId) return '';
    return utils.storageKey('example-card-authoring:' + persistenceId);
  }

  function readStoredAuthoringConfig(root, questionRoot) {
    var key = getAuthoringPersistenceKey(root, questionRoot);
    if (!key) return null;
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function writeStoredAuthoringConfig(root, questionRoot) {
    var key = getAuthoringPersistenceKey(root, questionRoot);
    var targetRoot = questionRoot || root;
    if (!key) return;

    var blankAnswers = Array.from(targetRoot.querySelectorAll(RT.BLANK_SELECTOR)).map(function (blank) {
      return {
        blankId: blank.getAttribute('data-blank-id') || '',
        correctAnswer: blank.getAttribute('data-correct-answer') || ''
      };
    });

    try {
      window.localStorage.setItem(key, JSON.stringify({
        questionType: RT.getQuestionType(root, questionRoot),
        correctValues: RT.collectCorrectValues(root, questionRoot),
        blankAnswers: blankAnswers
      }));
    } catch (e) {}
  }

  function applyStoredAuthoringConfig(root, questionRoot, config) {
    var targetRoot = questionRoot || root;
    if (!config || typeof config !== 'object') return;

    var storedQuestionType = RT.normalizeQuestionType(config.questionType) || RT.getQuestionType(root, questionRoot);
    ensureQuestionStructureForType(root, questionRoot, storedQuestionType);
    targetRoot.setAttribute('data-question-type', storedQuestionType);

    if (Array.isArray(config.correctValues) && storedQuestionType !== 'blank') {
      targetRoot.querySelectorAll(RT.OPTION_SELECTOR).forEach(function (option) {
        option.removeAttribute('data-correct');
      });
      config.correctValues.forEach(function (value) {
        var option = Array.from(targetRoot.querySelectorAll(RT.OPTION_SELECTOR)).find(function (candidate) {
          return (candidate.getAttribute('data-option-value') || '') === value;
        });
        if (option) option.setAttribute('data-correct', 'true');
      });
    }

    if (Array.isArray(config.blankAnswers)) {
      config.blankAnswers.forEach(function (blankConfig, index) {
        var blankId = blankConfig && blankConfig.blankId ? blankConfig.blankId : '';
        var selector = blankId ? RT.BLANK_SELECTOR + '[data-blank-id="' + blankId + '"]' : null;
        var blank = selector
          ? targetRoot.querySelector(selector)
          : targetRoot.querySelectorAll(RT.BLANK_SELECTOR)[index] || null;
        if (blank) {
          blank.setAttribute('data-correct-answer', blankConfig && blankConfig.correctAnswer ? blankConfig.correctAnswer : '');
        }
      });
    }
  }

  function hydrateStoredAuthoringConfig(root) {
    RT.getQuestionContainers(root).forEach(function (questionRoot) {
      var scopedQuestionRoot = questionRoot === root ? null : questionRoot;
      var config = readStoredAuthoringConfig(root, scopedQuestionRoot);
      applyStoredAuthoringConfig(root, scopedQuestionRoot, config);
    });
  }

  /* ========== 题型切换逻辑 ========== */

  function setCorrectValuesForSingleChoice(targetRoot, value) {
    targetRoot.querySelectorAll(RT.OPTION_SELECTOR).forEach(function (option) {
      var optionValue = option.getAttribute('data-option-value') || '';
      if (optionValue === value) {
        option.setAttribute('data-correct', 'true');
      } else {
        option.removeAttribute('data-correct');
      }
    });
  }

  function toggleCorrectValueForMultiChoice(targetRoot, value) {
    var targetOption = Array.from(targetRoot.querySelectorAll(RT.OPTION_SELECTOR)).find(function (option) {
      return (option.getAttribute('data-option-value') || '') === value;
    });
    if (!targetOption) return;
    if (targetOption.hasAttribute('data-correct')) {
      targetOption.removeAttribute('data-correct');
    } else {
      targetOption.setAttribute('data-correct', 'true');
    }
  }

  function setQuestionType(root, questionRoot, nextType) {
    var normalizedType = RT.normalizeQuestionType(nextType) || 'single';
    var targetRoot = questionRoot || root;

    ensureQuestionStructureForType(root, questionRoot, normalizedType);
    targetRoot.setAttribute('data-question-type', normalizedType);

    if (normalizedType === 'single') {
      var firstCorrectValue = RT.collectCorrectValues(root, questionRoot)[0]
        || (targetRoot.querySelector(RT.OPTION_SELECTOR) && targetRoot.querySelector(RT.OPTION_SELECTOR).getAttribute('data-option-value'))
        || 'A';
      setCorrectValuesForSingleChoice(targetRoot, firstCorrectValue);
    }

    if ((normalizedType === 'multi' || normalizedType === 'flex') && RT.collectCorrectValues(root, questionRoot).length === 0) {
      var firstOption = targetRoot.querySelector(RT.OPTION_SELECTOR);
      if (firstOption) firstOption.setAttribute('data-correct', 'true');
    }

    var state = RT.getQuestionState(root, questionRoot);
    state.correctValues = RT.collectCorrectValues(root, questionRoot);
    if (state.submitted && normalizedType !== 'blank') {
      state.isCorrect = RT.hasSameValueSet(state.selectedValues, state.correctValues);
    }
    if (state.submitted && normalizedType === 'blank') {
      state.isCorrect = null;
    }

    RT.syncActiveQuestionSnapshot(root, RT.getState(root));
    RT.syncQuestionTypeUI(root);
    RT.syncAnswerKey(root);
    RT.renderSelection(root);
    RT.renderSubmission(root);
    writeStoredAuthoringConfig(root, questionRoot);
  }

  function updateCorrectValuesFromAnswerKey(root, button) {
    var questionRoot = button.closest(RT.QUESTION_SELECTOR);
    var value = button.getAttribute('data-answer-value') || '';
    var questionType = RT.getQuestionType(root, questionRoot);

    if (value === '' || !RT.isEditorMode() || questionType === 'blank') return;

    var targetRoot = questionRoot || root;
    if (questionType === 'multi' || questionType === 'flex') {
      toggleCorrectValueForMultiChoice(targetRoot, value);
    } else {
      setCorrectValuesForSingleChoice(targetRoot, value);
    }

    var state = RT.getQuestionState(root, questionRoot);
    state.correctValues = RT.collectCorrectValues(root, questionRoot);
    if (state.submitted) {
      state.isCorrect = RT.hasSameValueSet(state.selectedValues, state.correctValues);
      RT.syncActiveQuestionSnapshot(root, RT.getState(root));
      RT.renderSubmission(root);
    }

    RT.syncQuestionTypeUI(root);
    RT.syncAnswerKey(root);
    writeStoredAuthoringConfig(root, questionRoot);
  }

  function updateBlankAnswerFromEditor(root, input) {
    if (!root || !input || !RT.isEditorMode()) return;

    var questionRoot = input.closest(RT.QUESTION_SELECTOR);
    var targetRoot = questionRoot || root;
    var blank = targetRoot.querySelector(RT.BLANK_SELECTOR);
    if (!blank || RT.getQuestionType(root, questionRoot) !== 'blank') return;

    blank.setAttribute('data-correct-answer', input.value);
    writeStoredAuthoringConfig(root, questionRoot);
    RT.syncQuestionTypeUI(root);
    RT.renderSubmission(root);
  }

  /* ========== 多选编辑守卫 ========== */

  function shakeMultiHint(root, questionRoot) {
    var targetRoot = questionRoot || root;
    var hint = targetRoot.querySelector(RT.MULTI_HINT_SELECTOR);
    if (!hint) return;
    hint.hidden = false;
    hint.classList.add('is-invalid');
    hint.classList.remove('is-shaking');
    void hint.offsetWidth;
    hint.classList.add('is-shaking');
  }

  function hasInvalidMultiAnswerConfiguration(root, questionRoot) {
    return RT.getQuestionType(root, questionRoot) === 'multi' && RT.collectCorrectValues(root, questionRoot).length < 2;
  }

  var _exitGuardInstalled = false;

  function installEditorExitGuard() {
    if (_exitGuardInstalled) return;
    _exitGuardInstalled = true;

    var editorCore = window.editorCore;
    if (!editorCore || typeof editorCore.toggleEditMode !== 'function') return;

    var originalToggleEditMode = editorCore.toggleEditMode;
    editorCore.toggleEditMode = function patchedExampleCardEditModeToggle() {
      if (this.isActive) {
        var invalidContexts = [];
        document.querySelectorAll(RT.CARD_SELECTOR).forEach(function (root) {
          RT.getQuestionContainers(root).forEach(function (questionRoot) {
            var scopedQuestionRoot = questionRoot === root ? null : questionRoot;
            if (hasInvalidMultiAnswerConfiguration(root, scopedQuestionRoot)) {
              invalidContexts.push({ root: root, questionRoot: scopedQuestionRoot });
            }
          });
        });

        if (invalidContexts.length > 0) {
          invalidContexts.forEach(function (ctx) {
            RT.syncQuestionTypeUI(ctx.root);
            shakeMultiHint(ctx.root, ctx.questionRoot);
          });
          return false;
        }
      }
      return originalToggleEditMode.apply(this, arguments);
    };
  }

  /* ========== 注册到核心模块 ========== */
  RT.ensureQuestionStructureForType = ensureQuestionStructureForType;
  RT.setQuestionType = setQuestionType;
  RT.updateCorrectValuesFromAnswerKey = updateCorrectValuesFromAnswerKey;
  RT.updateBlankAnswerFromEditor = updateBlankAnswerFromEditor;
  RT.hydrateStoredAuthoringConfig = hydrateStoredAuthoringConfig;
  RT.installEditorExitGuard = installEditorExitGuard;

})();
