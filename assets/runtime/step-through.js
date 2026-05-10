/* ===========================================
   STEP-THROUGH.JS
   页内交互步进系统 — 焦点管理、队列构建、策略注册、鼠标点击
   依赖：navigation.js（使用 slides, current, playGlobalCue, goTo）
   将 buildInteractionQueue/stepForward/stepBackward 注册到 __slideRuntime__
   =========================================== */

var RT = window.__slideRuntime__;

/* --- 自动标记可步进组件 --- */
function autoTagSteppables() {
  document.querySelectorAll('.flip-card').forEach(el => {
    if (!el.hasAttribute('data-steppable')) el.setAttribute('data-steppable', 'flip');
  });
  document.querySelectorAll('.collapse-card').forEach(el => {
    if (!el.hasAttribute('data-steppable')) el.setAttribute('data-steppable', 'collapse');
  });
  document.querySelectorAll('.summary-trigger').forEach(el => {
    if (!el.hasAttribute('data-steppable')) el.setAttribute('data-steppable', 'summary');
  });
}

/* --- 交互策略表 --- */
var StepStrategies = {
  flip: {
    forward(el) {
      if (!el.classList.contains('flipped')) {
        playGlobalCue('flip-forward');
      }
      el.classList.add('flipped');
    },
    backward(el) { el.classList.remove('flipped'); },
    hasNextStep(el) { return !el.classList.contains('flipped'); }
  },
  collapse: {
    forward(el) {
      if (!el.classList.contains('expanded')) {
        playGlobalCue('collapse-expand');
      }
      el.classList.add('expanded');
    },
    backward(el) { el.classList.remove('expanded'); },
    hasNextStep(el) { return !el.classList.contains('expanded'); }
  },
  summary: {
    forward(el) {
      var panel = el.closest('.slide').querySelector('.summary-panel');
      if (!panel) return;
      var wasVisible = panel.classList.contains('visible');
      if (!wasVisible) {
        playGlobalCue('summary-open');
      }
      panel.classList.add('visible');
    },
    backward(el) {
      var panel = el.closest('.slide').querySelector('.summary-panel');
      if (panel) panel.classList.remove('visible');
    },
    hasNextStep(el) {
      var panel = el.closest('.slide').querySelector('.summary-panel');
      return panel && !panel.classList.contains('visible');
    }
  }
};

window.registerStepStrategy = function(name, strategy) {
  StepStrategies[name] = strategy;
};

/* --- 共享状态（归 __slideRuntime__ 管理） --- */
var interactionQueue = RT.interactionQueue;
var stepIndex = -1;
RT.stepIndex = -1;
var slideStepState = RT.slideStepState;

/* --- 策略查询 --- */
function getStrategyByElement(el) {
  if (!el) return null;
  var type = el.getAttribute('data-steppable');
  return type ? StepStrategies[type] : null;
}

function canStepTopLevelForward(strategy, el) {
  if (!strategy) return false;
  if (typeof strategy.canStepTopLevelForward === 'function') return !!strategy.canStepTopLevelForward(el);
  if (typeof strategy.hasNextStep === 'function') return !!strategy.hasNextStep(el);
  return false;
}

function canStepTopLevelBackward(strategy, el) {
  if (!strategy) return false;
  if (typeof strategy.canStepTopLevelBackward === 'function') return !!strategy.canStepTopLevelBackward(el);
  if (typeof strategy.hasPrevStep === 'function') return !!strategy.hasPrevStep(el);
  if (typeof strategy.hasNextStep === 'function') return !strategy.hasNextStep(el);
  return true;
}

function hasExplicitBackwardState(strategy) {
  return !!strategy && (
    typeof strategy.canStepTopLevelBackward === 'function' ||
    typeof strategy.hasPrevStep === 'function' ||
    typeof strategy.hasNextStep === 'function'
  );
}

function runTopLevelForward(strategy, el) {
  if (!strategy) return false;
  if (typeof strategy.forwardTopLevel === 'function') return strategy.forwardTopLevel(el) !== false;
  if (typeof strategy.forward === 'function') {
    strategy.forward(el);
    return true;
  }
  return false;
}

function runTopLevelBackward(strategy, el) {
  if (!strategy) return false;
  if (typeof strategy.backwardTopLevel === 'function') return strategy.backwardTopLevel(el) !== false;
  if (typeof strategy.backward === 'function') {
    strategy.backward(el);
    return true;
  }
  return false;
}

function isOrdinarySlotContainer(el) {
  return !!(el && el.classList && (
    el.classList.contains('col') ||
    el.classList.contains('cell') ||
    el.classList.contains('row')
  ));
}

function isOrdinaryComponentRoot(el) {
  if (!el || el.nodeType !== 1) return false;
  if (!el.classList || el.classList.length === 0) return false;
  if (isOrdinarySlotContainer(el)) return false;
  if (el.classList.contains('summary-panel')) return false;
  return true;
}

function collectOrdinaryFocusableRoots(slide) {
  if (!slide) return [];
  var roots = [];
  slide.querySelectorAll('.slide-content').forEach(function(slideContent) {
    Array.from(slideContent.children).forEach(function(child) {
      if (isOrdinarySlotContainer(child)) {
        Array.from(child.children).forEach(function(slotChild) {
          if (isOrdinaryComponentRoot(slotChild)) roots.push(slotChild);
        });
        return;
      }
      if (isOrdinaryComponentRoot(child)) roots.push(child);
    });
  });
  return roots;
}

function sortElementsByDocumentOrder(elements) {
  return elements.sort(function(a, b) {
    if (a === b) return 0;
    var pos = a.compareDocumentPosition(b);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });
}

function buildInteractionQueue(slideIndex, options) {
  var slide = slides[slideIndex];
  var seen = new Set();
  var queueCandidates = collectOrdinaryFocusableRoots(slide).concat(
    Array.from(slide.querySelectorAll('[data-steppable]'))
  );

  interactionQueue = sortElementsByDocumentOrder(queueCandidates).filter(function(el) {
    if (!el || seen.has(el)) return false;
    seen.add(el);
    return true;
  });
  RT.interactionQueue = interactionQueue;

  stepIndex = (options && options.resetFocus === true)
    ? -1
    : ((slideIndex in slideStepState) ? slideStepState[slideIndex] : -1);
  RT.stepIndex = stepIndex;
  updateStepActiveClass();
}

function getFocusedInteractionElement() {
  return (stepIndex >= 0 && stepIndex < interactionQueue.length)
    ? interactionQueue[stepIndex]
    : null;
}

function findInteractionQueueElement(target, currentSlide) {
  if (!target) return null;
  var cursor = (target.nodeType === 1) ? target : target.parentElement;
  while (cursor && cursor !== currentSlide) {
    if (interactionQueue.indexOf(cursor) !== -1) return cursor;
    cursor = cursor.parentElement;
  }
  return null;
}

function isInteractiveQueueElement(el) {
  if (!el) return false;
  if (el.hasAttribute && el.hasAttribute('data-steppable')) return true;
  var strategy = getStrategyByElement(el);
  return !!(strategy && (
    typeof strategy.forwardTopLevel === 'function' ||
    typeof strategy.forward === 'function' ||
    typeof strategy.stepFragment === 'function' ||
    typeof strategy.canStepTopLevelForward === 'function' ||
    typeof strategy.hasNextStep === 'function'
  ));
}

function setInteractionFocusIndex(nextIndex, options) {
  var previousFocusedElement = getFocusedInteractionElement();
  var shouldMuteFocusCue = !!(options && options.silentFocusCue === true);

  stepIndex = nextIndex;
  RT.stepIndex = nextIndex;
  updateStepActiveClass();

  var nextFocusedElement = getFocusedInteractionElement();

  if (
    !shouldMuteFocusCue &&
    nextFocusedElement &&
    previousFocusedElement !== nextFocusedElement &&
    (previousFocusedElement || RT.pendingFirstFocusCueAfterPageTurn) &&
    isInteractiveQueueElement(nextFocusedElement)
  ) {
    playGlobalCue('focus-shift');
  }

  RT.pendingFirstFocusCueAfterPageTurn = false;

  return nextFocusedElement;
}

/* 暴露给 keyboard.js 用 */
window.__slideRuntime__.getFocusedInteractionElement = getFocusedInteractionElement;

function shouldSilenceFocusCueForSummaryOpen(el) {
  if (!el || el.getAttribute('data-steppable') !== 'summary') return false;
  var panel = el.closest('.slide') && el.closest('.slide').querySelector('.summary-panel');
  return !!(panel && !panel.classList.contains('visible'));
}

function getDirectInteractionClickAction(target, steppable) {
  if (!target || !steppable || !target.closest) return null;
  var stepType = steppable.getAttribute('data-steppable');

  if (stepType === 'flip' && target.closest('.flip-action-btn')) {
    return steppable.classList.contains('flipped') ? 'backward' : 'forward';
  }
  if (stepType === 'collapse' && target.closest('.collapse-action-btn')) {
    return steppable.classList.contains('expanded') ? 'backward' : 'forward';
  }
  if (stepType === 'summary' && target.closest('.summary-trigger')) {
    return shouldSilenceFocusCueForSummaryOpen(steppable) ? 'forward' : 'backward';
  }
  return null;
}

function shouldAutoRunForwardOnFirstFocus(el) {
  if (!el) return false;
  return !!isQuizAnnotationSlide() && !!(el.closest && el.closest('.quiz-annotation'));
}

function usesFocusLandingModel(el) {
  return !!el && !shouldAutoRunForwardOnFirstFocus(el);
}

/* --- 步进位置持久化 --- */
function saveStepState() {
  slideStepState[current] = stepIndex;
}

/* --- 正向步进 --- */
function stepForward() {
  if (stepIndex >= 0 && stepIndex < interactionQueue.length) {
    var el = interactionQueue[stepIndex];
    var strategy = getStrategyByElement(el);
    if (canStepTopLevelForward(strategy, el)) {
      runTopLevelForward(strategy, el);
      updateStepActiveClass();
      saveStepState();
      return true;
    }
  }
  if (interactionQueue.length === 0 || stepIndex >= interactionQueue.length - 1) return false;
  var nextIndex = stepIndex + 1;

  setInteractionFocusIndex(nextIndex);

  if (shouldAutoRunForwardOnFirstFocus(interactionQueue[stepIndex])) {
    var el2 = interactionQueue[stepIndex];
    var strategy2 = getStrategyByElement(el2);
    runTopLevelForward(strategy2, el2);
  }

  saveStepState();
  return true;
}

/* --- 反向步进 --- */
function stepBackward() {
  if (stepIndex < 0) return false;

  var el = interactionQueue[stepIndex];
  var strategy = getStrategyByElement(el);
  var hadBackwardState = hasExplicitBackwardState(strategy) ? canStepTopLevelBackward(strategy, el) : false;

  if (hadBackwardState) {
    if (!runTopLevelBackward(strategy, el)) return false;
    if (usesFocusLandingModel(el)) {
      updateStepActiveClass();
      saveStepState();
      return true;
    }
    if (hasExplicitBackwardState(strategy) ? canStepTopLevelBackward(strategy, el) : false) {
      updateStepActiveClass();
      saveStepState();
      return true;
    }
    setInteractionFocusIndex(stepIndex - 1);
    saveStepState();
    return true;
  }

  if (stepIndex <= 0) return false;
  setInteractionFocusIndex(stepIndex - 1);
  saveStepState();
  return true;
}

/* --- 片段步进 --- */
function stepFragment(direction) {
  var currentFocusedElement = (stepIndex >= 0 && stepIndex < interactionQueue.length)
    ? interactionQueue[stepIndex]
    : null;

  if (stepIndex >= 0 && stepIndex < interactionQueue.length) {
    var el = interactionQueue[stepIndex];
    var strategy = getStrategyByElement(el);
    if (strategy && typeof strategy.stepFragment === 'function') {
      var didStep = strategy.stepFragment(el, direction);
      if (didStep) {
        updateStepActiveClass();
        saveStepState();
        return true;
      }
    }
  }

  var currentSlide = slides[current];
  var pageRichTextRuntime = window.PageRichTextAnnotationRuntime;

  if (
    currentSlide &&
    !isQuizAnnotationSlide() &&
    pageRichTextRuntime &&
    typeof pageRichTextRuntime.stepFragment === 'function'
  ) {
    return !!pageRichTextRuntime.stepFragment(direction, currentSlide, currentFocusedElement);
  }

  return false;
}

/* --- 焦点 class 管理 --- */
function updateStepActiveClass() {
  document.querySelectorAll('.step-active').forEach(function(el) {
    el.classList.remove('step-active');
  });
  if (stepIndex >= 0 && stepIndex < interactionQueue.length) {
    interactionQueue[stepIndex].classList.add('step-active');
  }
}

/* --- 外部刷新接口 --- */
window.refreshInteractionQueueForCurrentSlide = function(options) {
  if (options && options.resetFocus === true) {
    slideStepState[current] = -1;
  }
  buildInteractionQueue(current);
  return interactionQueue.length;
};

window.activateInteractionStepForElement = function(el, options) {
  if (!el) return false;
  var currentSlide = slides[current];
  if (!currentSlide) return false;

  var target = findInteractionQueueElement(el, currentSlide);
  if (!target || !currentSlide.contains(target)) return false;

  var nextIndex = interactionQueue.indexOf(target);
  if (nextIndex === -1) return false;

  setInteractionFocusIndex(nextIndex, options);
  saveStepState();
  return true;
};

/* --- 鼠标点击处理 --- */
document.addEventListener('click', function(e) {
  var target = e.target;
  if (!target || !target.closest) return;

  var currentSlide = slides[current];
  if (!currentSlide) return;

  var clickedSteppable = findInteractionQueueElement(target, currentSlide);
  var lockedExampleCardHost = currentSlide.contains(target)
    ? getExampleCardMainHost(currentSlide, target)
    : null;
  var steppable = lockedExampleCardHost || clickedSteppable;
  if (!steppable || !currentSlide.contains(steppable)) return;

  var directInteractionTarget = clickedSteppable || steppable;
  var directInteractionAction = getDirectInteractionClickAction(target, directInteractionTarget);
  var silentFocusCue = !!target.closest('.qa-note-bubble') || !!directInteractionAction;
  window.activateInteractionStepForElement(steppable, { silentFocusCue: silentFocusCue });

  if (directInteractionAction) {
    e.preventDefault();
    e.stopImmediatePropagation();

    var strategy = getStrategyByElement(directInteractionTarget);
    if (strategy) {
      if (directInteractionAction === 'forward') {
        runTopLevelForward(strategy, directInteractionTarget);
      } else {
        runTopLevelBackward(strategy, directInteractionTarget);
      }
      saveStepState();
    }
    return;
  }
}, true);

/* --- 注册到 __slideRuntime__ 供 navigation.js 调用 --- */
RT.buildInteractionQueue = buildInteractionQueue;
RT.stepForward = stepForward;
RT.stepBackward = stepBackward;
RT.stepFragment = stepFragment;

// 同时暴露为全局函数（供 keyboard.js 回调使用——它通过 __slideRuntime__ 转发）
