(function initExampleCardRuntime() {
  if (window.ExampleCardRuntime) {
    return;
  }

  const CARD_SELECTOR = '.example-card';
  const OPTION_SELECTOR = '.example-card__option';
  const ANSWER_KEY_SELECTOR = '.example-card__answer-key';
  const ANALYSIS_TOGGLE_SELECTOR = '.example-card__analysis-toggle';
  const SUBMIT_BUTTON_SELECTOR = '.example-card__submit-btn';
  const ANALYSIS_PANEL_SELECTOR = '.example-card__analysis';
  const BLANK_SELECTOR = '.example-card__blank[data-correct-answer]';
  const QUESTION_SELECTOR = '.example-card__question';
  const RESULT_MARK_SELECTOR = '.qa-result-mark';
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

  function ensureState(root) {
    if (!stateMap.has(root)) {
      stateMap.set(root, {
        // Task 2 需要在提交时统一对比“已选答案集合”和“正确答案集合”，即便当前只做单选，
        // 也先把状态形状收敛成数组，避免提交逻辑还要同时兼容字符串和数组两套分支。
        selectedValues: [],
        correctValues: [],
        // 未提交时用 null 区分“还没判分”和“已经判错”，
        // 后续音效或提交流程只需要消费这个稳定语义，不必重新回看选项集合。
        isCorrect: null,
        submitted: false,
        analysisExpanded: false,
        annotationHydrationScheduled: false
      });
    }

    return stateMap.get(root);
  }

  function collectCorrectValues(root) {
    return Array.from(root.querySelectorAll(OPTION_SELECTOR))
      .filter((option) => option.hasAttribute('data-correct'))
      .map((option) => option.getAttribute('data-option-value') || '')
      .filter(Boolean);
  }

  function getQuestionType(root) {
    return root.getAttribute('data-question-type') || 'single';
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
    const correctValues = collectCorrectValues(root);

    root.querySelectorAll(ANSWER_KEY_SELECTOR).forEach((button) => {
      const value = button.getAttribute('data-answer-value') || '';
      button.classList.toggle('is-active', value !== '' && correctValues.includes(value));
    });
  }

  function updateCorrectValuesFromAnswerKey(root, button) {
    const value = button.getAttribute('data-answer-value') || '';

    if (value === '') {
      return;
    }

    // 答案键本质上是作者配置“标准答案”的入口，而不是学生作答控件；
    // 只有在编辑态才允许改写 data-correct，才能避免放映/练习态误触后直接篡改判分基准。
    if (!isEditorMode()) {
      return;
    }

    root.querySelectorAll(OPTION_SELECTOR).forEach((option) => {
      const optionValue = option.getAttribute('data-option-value') || '';

      if (optionValue === value) {
        option.setAttribute('data-correct', 'true');
      } else {
        option.removeAttribute('data-correct');
      }
    });

    const state = ensureState(root);
    state.correctValues = collectCorrectValues(root);

    if (state.submitted) {
      state.isCorrect = hasSameValueSet(state.selectedValues, state.correctValues);
      renderSubmission(root);
    }

    syncAnswerKey(root);
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
      const isActive = !question.hidden && (question.classList.contains('is-active') || index === 0);

      question.setAttribute('data-question-active', isActive ? 'true' : 'false');
      // 2A 还没有多题状态机，这里只把当前显示题是否已提交显式写回 DOM，
      // 供普通页 fragment runtime 判断“是否允许 reveal”。其它题先保持 false，避免提前暴露后续题的讲评片段。
      question.setAttribute('data-question-submitted', isActive && state.submitted ? 'true' : 'false');
    });
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
    const state = ensureState(root);

    root.querySelectorAll(OPTION_SELECTOR).forEach((option) => {
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
    const state = ensureState(root);
    const analysisToggle = root.querySelector(ANALYSIS_TOGGLE_SELECTOR);
    const submitBtn = root.querySelector(SUBMIT_BUTTON_SELECTOR);

    root.classList.toggle('is-submitted', state.submitted);

    if (analysisToggle) {
      analysisToggle.disabled = !state.submitted;
    }

    if (submitBtn) {
      submitBtn.disabled = state.submitted;
    }

    root.querySelectorAll(OPTION_SELECTOR).forEach((option) => {
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
    const state = ensureState(root);
    const analysis = root.querySelector(ANALYSIS_PANEL_SELECTOR);
    const shouldOpen = state.submitted && state.analysisExpanded;

    if (analysis) {
      analysis.hidden = !shouldOpen;
    }

    root.classList.toggle('is-analysis-open', shouldOpen);
  }

  function handleOptionClick(option) {
    const root = option.closest(CARD_SELECTOR);

    if (!root) {
      return;
    }

    const value = option.getAttribute('data-option-value') || '';

    // 没有稳定选项值的节点不参与状态写入，避免异常标记把整张卡片置入不可预测状态。
    if (value === '') {
      return;
    }

    const state = ensureState(root);

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

    // Task 2 仍只实现单选：最后一次点击覆盖之前选择，不提前扩到多选规则。
    state.selectedValues = [value];
    renderSelection(root);
  }

  function submitCard(root) {
    const state = ensureState(root);
    const questionType = getQuestionType(root);

    state.submitted = true;
    state.analysisExpanded = false;

    if (questionType === 'blank') {
      state.correctValues = [];
      // blank 题这一轮只做“揭示标准答案”，不做学生输入与对错判定；
      // 因为当前组件还没有采集 blank 作答值的正式交互，硬给 true/false 只会制造伪判分语义，
      // 同时也不能播放对错音效，否则会把“仅 reveal 正确答案”误包装成已经完成正式判分。
      state.isCorrect = null;
      revealBlankAnswers(root);
      renderSubmission(root);
      renderAnalysis(root);
      refreshFragmentRuntime(root);
      return;
    }

    state.correctValues = collectCorrectValues(root);
    // 提交瞬间把卡片级判分结果固化下来，后续音效、统计、解析开关等逻辑
    // 都应该消费这个布尔语义，而不是重复比较集合，避免提交后语义源分散。
    state.isCorrect = hasSameValueSet(state.selectedValues, state.correctValues);

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
    const state = ensureState(root);
    const analysis = root.querySelector(ANALYSIS_PANEL_SELECTOR);

    // 解析区在提交前必须保持关闭，核心原因是它承担的是“判分后的复盘信息”，
    // 不是作答前提示；如果允许提前展开，就会直接泄露答案线索，打破先作答再讲解的流程边界。
    if (!state.submitted || !analysis) {
      return;
    }

    state.analysisExpanded = !state.analysisExpanded;
    renderAnalysis(root);
  }

  function initCard(root) {
    const initialHtmlSnapshot = captureEditableHtmlSnapshot(root);

    ensureState(root);
    /* example-card 在真实课件页里经常不是源码直出，而是 template clone 之后才挂到 DOM。
       这意味着 editor-core / annotation-store 的全局首次恢复可能已经跑完了，
       但当前题卡的 stem / option / analysis 根块此刻才真正出现。
       因此这里要像答题与批注组件动态创建气泡那样，在 initCard 阶段主动补一次持久化回放，
       并在 AnnotationStore 延迟就绪时再补一次，避免用户遇到“第一次刷新还看不到，第二次才出现”。 */
    hydratePersistedEditRoots(root, initialHtmlSnapshot);
    scheduleAnnotationStoreHydration(root, initialHtmlSnapshot);
    syncAnswerKey(root);
    renderSelection(root);
    renderSubmission(root);
    renderAnalysis(root);
    syncQuestionGateState(root);
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

    const analysisToggle = event.target.closest(ANALYSIS_TOGGLE_SELECTOR);

    if (analysisToggle) {
      const root = analysisToggle.closest(CARD_SELECTOR);

      if (root) {
        toggleAnalysis(root);
      }
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