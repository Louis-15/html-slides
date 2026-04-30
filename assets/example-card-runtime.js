(function initExampleCardRuntime() {
  if (window.ExampleCardRuntime) {
    return;
  }

  const CARD_SELECTOR = '.example-card';
  const OPTION_SELECTOR = '.example-card__option';
  const stateMap = new WeakMap();

  function ensureState(root) {
    if (!stateMap.has(root)) {
      stateMap.set(root, {
        // Task 1 只需要记住当前单选题的唯一选中项，提交判分等状态留到后续任务再加，避免提前扩展行为面。
        selectedValue: ''
      });
    }

    return stateMap.get(root);
  }

  function renderSelection(root) {
    const state = ensureState(root);

    root.querySelectorAll(OPTION_SELECTOR).forEach((option) => {
      const value = option.getAttribute('data-option-value') || '';

      // 选择态完全由状态驱动重绘，避免通过直接切换 DOM 类名导致多个选项残留 selected。
      option.classList.toggle('selected', value !== '' && value === state.selectedValue);
    });
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

    // 单选题的最小规则就是“最后一次点击覆盖之前选择”，因此这里只保留一个 canonical value。
    state.selectedValue = value;
    renderSelection(root);
  }

  function initCard(root) {
    ensureState(root);
    renderSelection(root);
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

    const option = event.target.closest(OPTION_SELECTOR);

    if (option) {
      handleOptionClick(option);
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