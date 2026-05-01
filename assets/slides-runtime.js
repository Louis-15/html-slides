/* ===========================================
   SLIDES RUNTIME
   Shared by all Pro themes. Copy verbatim into
   the <script> tag at the end of <body>.
   Handles: particles, navigation, charts,
   speaker notes console logging.
   =========================================== */

/* --- 页面切换钩子 ---
   外部模块通过 window.addSlideChangeListener(fn) 注册回调，
   在 goTo() 完成翻页后统一触发，替代在 body 上挂 MutationObserver 的做法。 */
const _slideChangeListeners = [];
window.addSlideChangeListener = function(fn) {
  if (typeof fn === 'function') _slideChangeListeners.push(fn);
};

/* --- Zone 变体自动检测 ---
   扫描所有 zone 容器元素。如果未显式指定变体 class，自动补上默认变体。
   这样即使 HTML 中忘了写变体名，页面也不会因为缺少样式而空白。 */
const ZONE_VARIANT_DEFAULTS = {
  'slide-header': 'banner'       // Zone 1 默认变体
  // 'summary-trigger': 'popup'  // Zone 3 未来扩展
};

Object.entries(ZONE_VARIANT_DEFAULTS).forEach(([baseClass, defaultVariant]) => {
  document.querySelectorAll('.' + baseClass).forEach(el => {
    // 检查：如果元素除了基础 class 之外没有任何已知变体 class，则自动补上默认变体
    if (!el.classList.contains(defaultVariant)) {
      el.classList.add(defaultVariant);
    }
  });
});

// Particles
const pc = document.getElementById('particles');
for (let i = 0; i < 35; i++) {
  const p = document.createElement('div');
  p.className = 'particle';
  p.style.left = Math.random()*100+'%';
  p.style.animationDuration = (8+Math.random()*14)+'s';
  p.style.animationDelay = Math.random()*10+'s';
  p.style.width = p.style.height = (1+Math.random()*2)+'px';
  pc.appendChild(p);
}

// Navigation
const slides = document.querySelectorAll('.slide');
const progress = document.getElementById('progress');
const counter = document.getElementById('counter');
const slideNav = document.getElementById('slideNav');
let current = 0;
const total = slides.length;

slides.forEach((_, i) => {
  const dot = document.createElement('div');
  dot.className = 'slide-nav-dot' + (i===0?' active':'');
  dot.addEventListener('click', () => goTo(i));
  slideNav.appendChild(dot);
});

function ensureSlidePager() {
  if (document.getElementById('slidePager')) return;

  const pager = document.createElement('div');
  pager.id = 'slidePager';
  pager.className = 'slide-pager';
  pager.innerHTML = `
    <button type="button" class="slide-pager-btn slide-pager-prev" aria-label="上一页">上一页</button>
    <button type="button" class="slide-pager-btn slide-pager-next" aria-label="下一页">下一页</button>
  `;

  pager.querySelector('.slide-pager-prev').addEventListener('click', prev);
  pager.querySelector('.slide-pager-next').addEventListener('click', next);
  document.body.appendChild(pager);
}

function updateUI() {
  progress.style.width = ((current+1)/total*100)+'%';
  counter.textContent = `${current+1} / ${total}`;
  document.querySelectorAll('.slide-nav-dot').forEach((d,i) => d.classList.toggle('active', i===current));

  const prevBtn = document.querySelector('.slide-pager-prev');
  const nextBtn = document.querySelector('.slide-pager-next');
  if (prevBtn) prevBtn.disabled = current <= 0;
  if (nextBtn) nextBtn.disabled = current >= total - 1;
}

function playGlobalCue(name) {
  if (!name || !window.AudioRuntime || typeof window.AudioRuntime.playGlobalCue !== 'function') return false;
  return window.AudioRuntime.playGlobalCue(name) === true;
}

function finishSlideAnimationsForEditorMode(slide) {
  if (!slide) return;

  const editorMode = document.documentElement.classList.contains('editor-mode') ||
    document.body.classList.contains('editor-mode');
  if (!editorMode || typeof slide.getAnimations !== 'function') return;

  slide.getAnimations({ subtree: true }).forEach((animation) => {
    if (!animation || typeof animation.finish !== 'function') return;
    try {
      animation.finish();
    } catch (e) {
      // 某些浏览器在动画已结束或不可控时会抛错，这里静默跳过即可。
    }
  });
}

function goTo(index) {
  if (index<0 || index>=total || index===current) return;
  const prev = current;
  current = index;

  // 为旧幻灯片注入 leaving 生命周期，预留退出动画时间
  const prevSlide = slides[prev];
  prevSlide.classList.remove('active');
  prevSlide.classList.add('leaving');
  setTimeout(() => {
    prevSlide.classList.remove('leaving');
  }, 450); // 与 CSS 统一退出计时相匹配

  // 激活新幻灯片
  slides[current].classList.add('active');
  finishSlideAnimationsForEditorMode(slides[current]);

  updateUI();
  showSpeakerNotes(current);

  // Chart lifecycle: destroy on exit, create on entry
  if (typeof Chart !== 'undefined') {
    slides[prev].querySelectorAll('.chart-container canvas').forEach(c => destroyChart(c.id));
    setTimeout(() => {
      slides[current].querySelectorAll('.chart-container canvas').forEach(c => createChart(c.id));
    }, 350);
  }

  // 步进队列管理：构建新页的交互队列（自动恢复记忆状态）
  buildInteractionQueue(current);

  /* 翻页音效统一收口在 goTo 成功切页之后。
     这样键盘、右下角分页按钮、导航圆点等所有导航入口都会自然复用同一 cue，
     同时 goTo 自己已经拦住了“同页点击”和越界翻页，所以不会误播空响。 */
  playGlobalCue('page-turn');

  // 触发页面切换钩子（供外部模块监听）
  _slideChangeListeners.forEach(fn => fn(current, prev));
}

function next() { goTo(current+1); }
function prev() { goTo(current-1); }

function isQuizAnnotationSlide(index = current) {
  const slide = slides[index];
  return !!(slide && slide.querySelector('.quiz-annotation'));
}

document.addEventListener('keydown', (e) => {
  // 一级步进：↑↓ 先走当前页组件焦点，页内耗尽后再翻页。
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (!stepForward() && !isQuizAnnotationSlide()) next();
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (!stepBackward() && !isQuizAnnotationSlide()) prev();
  }
  // PageDown/PageUp 仍保留为直接翻页，兼容键盘习惯。
  if (e.key === 'PageDown') { e.preventDefault(); next(); }
  if (e.key === 'PageUp') { e.preventDefault(); prev(); }
  // 二级步进：←→ 只交给当前焦点组件内部的片段逻辑。
  if (e.key === 'ArrowRight') { e.preventDefault(); stepFragment('forward'); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); stepFragment('backward'); }
  // 空格键 = 预留给长文组件页内滚动（无长文组件时不做操作）
  if (e.key === ' ') { e.preventDefault(); handleSpaceKey(); }
  // Home / End = 跳页
  if (e.key === 'Home') { e.preventDefault(); goTo(0); }
  if (e.key === 'End') { e.preventDefault(); goTo(total - 1); }
});

/* 触摸事件已移除 — 目标用户场景为电脑 + 蓝牙翻页器 */

let wheelCD = false;
document.addEventListener('wheel', (e) => {
  // 如果当前幻灯片包含答题与批注组件，完全禁止滚轮翻页（防误触）
  const slide = e.target.closest && e.target.closest('.slide');
  if (slide && slide.querySelector('.quiz-annotation')) return;

  // 智能滚轮：鼠标在普通可滚动容器内时不翻页，让容器自然滚动
  if (e.target.closest && e.target.closest('[data-scrollable]')) return;
  
  if (wheelCD) return; wheelCD = true;
  setTimeout(() => wheelCD=false, 600);
  if (e.deltaY>0||e.deltaX>0) next(); else prev();
}, {passive:true});

// =========================================
// 页内交互步进系统 (Interaction Step-through)
// 上下键翻页，左右键控制当前页组件的正向/反向交互
// 适配蓝牙翻页器（上下翻页 + 左右步进）
// =========================================

/* --- 运行时自动标记可步进组件 ---
   内置组件（.flip-card, .collapse-card, .summary-trigger）自动检测标记，
   无需手动在 HTML 中添加 data-steppable 属性。
   未来自定义组件通过手动声明 data-steppable="xxx" 接入。 */
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

/* --- 交互策略表 ---
   每种可步进组件注册三个方法：
     forward()     — 正向触发一步交互
     backward()    — 反向撤销一步交互
     hasNextStep() — 该组件是否还有下一步（预留给"一个组件多步"场景，如长文批注） */
const StepStrategies = {
  flip: {
    forward(el) {
      /* flip 的正向互动这轮已经从通用 pop 中拆出来，
         只有真正把卡片翻到背面时才播放专属 flip-forward；
         反向撤销保持静音，因此不要在 backward 里补声。 */
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
      /* drawer cue 只服务“正向展开”这一步。
         收起属于反向撤销，这轮已明确要求静音，因此 backward 不补声。 */
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
      const panel = el.closest('.slide').querySelector('.summary-panel');
      if (!panel) return;
      const wasVisible = panel.classList.contains('visible');

      /* 用户这轮明确要求“先出音，再出现组件”。
         因此 summary 的专属 cue 必须在面板真正 visible 之前先发出，
         让听感成为一次“开场提示”，而不是面板已经弹出来后才补一个拖尾音。 */
      if (!wasVisible) {
        playGlobalCue('summary-open');
      }
      panel.classList.add('visible');
    },
    backward(el) {
      const panel = el.closest('.slide').querySelector('.summary-panel');
      if (panel) panel.classList.remove('visible');
    },
    hasNextStep(el) {
      const panel = el.closest('.slide').querySelector('.summary-panel');
      return panel && !panel.classList.contains('visible');
    }
  }
};

/* 外部模块注册新策略的接口（未来扩展用）
   用法：window.registerStepStrategy('annotation', { forward(el){...}, backward(el){...}, hasNextStep(el){...} }); */
window.registerStepStrategy = function(name, strategy) {
  StepStrategies[name] = strategy;
};

/* --- 每页交互队列与状态记忆 ---
   slideStepState 缓存每页的 stepIndex，翻页后再回来时恢复原状。 */
const slideStepState = {};
let interactionQueue = [];
let stepIndex = -1;

function getStrategyByElement(el) {
  if (!el) return null;
  const type = el.getAttribute('data-steppable');
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

  /* 这里刻意采用“结构约定”而不是组件白名单：
     - 未来 Zone2 继续新增组件时，只要作者仍然把“组件根元素”直接放进 slide-content 插槽，
       一级焦点队列就会自动纳入它；
     - 同时又按本轮设计采用严格模式，裸原生标签默认不算组件根，
       因此至少要求它是一个带 class 的显式包装块。 */
  if (!el.classList || el.classList.length === 0) return false;
  if (isOrdinarySlotContainer(el)) return false;
  if (el.classList.contains('summary-panel')) return false;
  return true;
}

function collectOrdinaryFocusableRoots(slide) {
  if (!slide) return [];

  const roots = [];

  slide.querySelectorAll('.slide-content').forEach((slideContent) => {
    Array.from(slideContent.children).forEach((child) => {
      if (isOrdinarySlotContainer(child)) {
        Array.from(child.children).forEach((slotChild) => {
          if (isOrdinaryComponentRoot(slotChild)) roots.push(slotChild);
        });
        return;
      }

      if (isOrdinaryComponentRoot(child)) {
        roots.push(child);
      }
    });
  });

  return roots;
}

function sortElementsByDocumentOrder(elements) {
  return elements.sort((a, b) => {
    if (a === b) return 0;
    const position = a.compareDocumentPosition(b);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });
}

/* 构建指定页的交互队列，并恢复记忆的步进位置。
  新合同把一级焦点单位改成“组件根”，而不是“只有声明了 data-steppable 的少数互动体”。
  因此这里要同时兼容两类来源：
  1. 普通页 Zone2 里按插槽结构自动发现的组件根；
  2. quiz / page-richtext / 未来扩展显式注册的 data-steppable 宿主。
  最后再按文档顺序去重合并，避免同一个互动组件既被结构发现、又被 data-steppable 重复入队。 */
function buildInteractionQueue(slideIndex) {
  const slide = slides[slideIndex];
  const seen = new Set();
  const queueCandidates = [
    ...collectOrdinaryFocusableRoots(slide),
    ...Array.from(slide.querySelectorAll('[data-steppable]'))
  ];

  interactionQueue = sortElementsByDocumentOrder(queueCandidates).filter((el) => {
    if (!el || seen.has(el)) return false;
    seen.add(el);
    return true;
  });

  stepIndex = (slideIndex in slideStepState) ? slideStepState[slideIndex] : -1;
  updateStepActiveClass();
}

function getFocusedInteractionElement() {
  return (stepIndex >= 0 && stepIndex < interactionQueue.length)
    ? interactionQueue[stepIndex]
    : null;
}

function findInteractionQueueElement(target, currentSlide) {
  if (!target) return null;

  /* 键盘路径已经改成“所有组件根共用一级队列”，
     因此鼠标路径也不能继续只靠 data-steppable 向上找。
     这里统一改成：只要点击命中了当前页 interactionQueue 中任一组件根的后代，
     就把那一个队列元素解析出来，保证 passive / interactive / fragment 宿主都走同一套焦点合同。 */
  let cursor = (target.nodeType === 1) ? target : target.parentElement;
  while (cursor && cursor !== currentSlide) {
    if (interactionQueue.includes(cursor)) {
      return cursor;
    }
    cursor = cursor.parentElement;
  }

  return null;
}

function isInteractiveQueueElement(el) {
  if (!el) return false;

  /* pop 的新语义是“提醒当前组件可互动”，不是“所有一级焦点切换的通用提示音”。
     因此这里只看目标宿主是否属于互动体：
     - 显式 data-steppable 的宿主，包括 flip / collapse / summary / page-richtext host；
     - 以及未来通过 strategy 扩展出来的互动组件。 */
  if (el.hasAttribute && el.hasAttribute('data-steppable')) return true;

  const strategy = getStrategyByElement(el);
  return !!(strategy && (
    typeof strategy.forwardTopLevel === 'function' ||
    typeof strategy.forward === 'function' ||
    typeof strategy.stepFragment === 'function' ||
    typeof strategy.canStepTopLevelForward === 'function' ||
    typeof strategy.hasNextStep === 'function'
  ));
}

function setInteractionFocusIndex(nextIndex, options) {
  const previousFocusedElement = getFocusedInteractionElement();
  const shouldMuteFocusCue = !!(options && options.silentFocusCue === true);

  stepIndex = nextIndex;
  updateStepActiveClass();

  const nextFocusedElement = getFocusedInteractionElement();

  /* 这里的 cue 只服务“一级焦点组件真的换了”这一件事：
     - 上下键从一个宿主跳到另一个宿主时播；
     - 鼠标点击把当前焦点切到另一个宿主时播；
     - 同一宿主内部的翻转、抽拉、fragment reveal 这类组件自带互动不播；
     - passive 组件只负责承载焦点，不再发出 pop，避免把“可互动提示音”误播成普通浏览音。
     因此除了前后宿主真的发生切换，还必须要求目标宿主本身是互动体。 */
  if (
    !shouldMuteFocusCue &&
    previousFocusedElement &&
    nextFocusedElement &&
    previousFocusedElement !== nextFocusedElement &&
    isInteractiveQueueElement(nextFocusedElement)
  ) {
    playGlobalCue('focus-shift');
  }

  return nextFocusedElement;
}

function shouldSilenceFocusCueForSummaryOpen(el) {
  if (!el || el.getAttribute('data-steppable') !== 'summary') return false;
  const panel = el.closest('.slide') && el.closest('.slide').querySelector('.summary-panel');
  return !!(panel && !panel.classList.contains('visible'));
}

function getDirectInteractionClickAction(target, steppable) {
  if (!target || !steppable || !target.closest) return null;

  const stepType = steppable.getAttribute('data-steppable');

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

  /* 这轮 redesign 明确排除了 quiz 页面。
     因此 quiz-annotation 继续保留旧语义：
     第一次 ArrowDown 落到宿主时就立刻推进到第一个 bubble，
     不能套用普通页“先聚焦、后互动”的两步模型。 */
  return isQuizAnnotationSlide(current) && !!(el.closest && el.closest('.quiz-annotation'));
}

function usesFocusLandingModel(el) {
  return !!el && !shouldAutoRunForwardOnFirstFocus(el);
}

/* 保存当前页的步进位置 */
function saveStepState() {
  slideStepState[current] = stepIndex;
}

/* 正向步进：触发当前页下一个组件的交互（→ 右键）
   支持"一个组件多步"：批注组件每个批注是一步，
   在当前组件内部步骤耗尽前不会切到下一个组件。 */
function stepForward() {
  // 先检查当前组件是否还有内部步骤（多步组件支持）
  if (stepIndex >= 0 && stepIndex < interactionQueue.length) {
    const el = interactionQueue[stepIndex];
    const strategy = getStrategyByElement(el);
    if (canStepTopLevelForward(strategy, el)) {
      runTopLevelForward(strategy, el);
      updateStepActiveClass();
      saveStepState();
      return true;
    }
  }
  // 当前组件步骤耗尽，切到下一个组件
  if (interactionQueue.length === 0 || stepIndex >= interactionQueue.length - 1) return false;
  const nextIndex = stepIndex + 1;

  /* 这轮 redesign 把“切到组件根”和“执行组件动作”严格拆成两步：
     - ArrowDown 第一次只负责把一级焦点落到下一个组件；
     - 只有当当前组件已经持有焦点时，再次 ArrowDown 才交给该组件自己的 forward。
     这样普通组件、互动组件和只带隐藏式标注的宿主终于共用同一条一级步进语义。
     例外只有 quiz 页面：它不在本轮 redesign 范围内，仍保留旧的一步推进。 */
  setInteractionFocusIndex(nextIndex);

  if (shouldAutoRunForwardOnFirstFocus(interactionQueue[stepIndex])) {
    const el = interactionQueue[stepIndex];
    const strategy = getStrategyByElement(el);
    runTopLevelForward(strategy, el);
  }

  saveStepState();
  return true;
}

/* 反向步进：撤销当前页上一个组件的交互（← 左键）
   多步组件在所有内部步骤回退完毕后才切回上一个组件。 */
function stepBackward() {
  if (stepIndex < 0) return false;

  const el = interactionQueue[stepIndex];
  const strategy = getStrategyByElement(el);
  const hadBackwardState = hasExplicitBackwardState(strategy) ? canStepTopLevelBackward(strategy, el) : false;

  /* 新合同下，普通页 interactive host 的 ArrowUp 要分成两步：
     1. 先撤销当前宿主的互动状态，但焦点仍留在当前宿主；
     2. 再下一次 ArrowUp 才离开该宿主。
     只有 quiz 页面保留旧语义，因此这里先看“回退前是否真的有互动状态”，
     再决定是留在当前宿主，还是按旧规则直接退到前一个宿主。 */
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

function stepFragment(direction) {
  const currentFocusedElement = (stepIndex >= 0 && stepIndex < interactionQueue.length)
    ? interactionQueue[stepIndex]
    : null;

  if (stepIndex >= 0 && stepIndex < interactionQueue.length) {
    const el = interactionQueue[stepIndex];
    const strategy = getStrategyByElement(el);
    if (strategy && typeof strategy.stepFragment === 'function') {
      const didStep = strategy.stepFragment(el, direction);
      if (didStep) {
        updateStepActiveClass();
        saveStepState();
        return true;
      }
    }
  }

  const currentSlide = slides[current];
  const pageRichTextRuntime = window.PageRichTextAnnotationRuntime;

  /* quiz 页已经有自己的二级步进、右键即时 reveal 与答题态门禁。
     普通页 fallback 现在还要拿到“当前一级焦点元素”，
     这样普通页 runtime 才能把 ← → 严格限定到当前焦点 ordinary root，
     不会因为某个 root 之前被右键 reveal 过，就在焦点已经切走后继续误吃左右键。 */
  if (
    currentSlide &&
    !isQuizAnnotationSlide(current) &&
    pageRichTextRuntime &&
    typeof pageRichTextRuntime.stepFragment === 'function'
  ) {
    return !!pageRichTextRuntime.stepFragment(direction, currentSlide, currentFocusedElement);
  }

  return false;
}

/* page-richtext 这类后加载运行时会在 slides-runtime 初始化之后，
   才给当前页的 ordinary root 自动补 data-steppable。
   这里暴露一个最小 refresh hook，让它们只重建当前页 interaction queue，
   不需要知道 slides-runtime 的内部数组与索引细节。 */
window.refreshInteractionQueueForCurrentSlide = function(options) {
  if (options && options.resetFocus === true) {
    slideStepState[current] = -1;
  }
  buildInteractionQueue(current);
  return interactionQueue.length;
};

window.activateInteractionStepForElement = function(el, options) {
  if (!el) return false;
  const currentSlide = slides[current];
  if (!currentSlide) return false;

  const target = findInteractionQueueElement(el, currentSlide);

  if (!target || !currentSlide.contains(target)) return false;

  const nextIndex = interactionQueue.indexOf(target);
  if (nextIndex === -1) return false;

  setInteractionFocusIndex(nextIndex, options);
  saveStepState();
  return true;
};

/* 统一处理鼠标点击时的一级焦点与按钮互动。
  普通组件主体点击仍然只负责切焦点；
  但 flip / collapse / summary 的互动按钮要走“静默切焦点 + 立即执行 forward/backward”的路径，
  这样才能满足“直接点按钮可立即互动、且不额外夹一个 pop”的新合同。 */
document.addEventListener('click', (e) => {
  const target = e.target;
  if (!target || !target.closest) return;

  const currentSlide = slides[current];
  if (!currentSlide) return;

  const steppable = findInteractionQueueElement(target, currentSlide);
  if (!steppable || !currentSlide.contains(steppable)) return;

  const directInteractionAction = getDirectInteractionClickAction(target, steppable);
    const isOrdinaryPageHostClick = steppable.getAttribute('data-steppable') === 'page-richtext-host';

  /* quiz 气泡点击本来就有自己的“气泡焦点切换”提示音。
     这里如果再把组件级 focus-shift 也一并播掉，会把一次点击放大成双响。
      互动按钮点击也要静默切焦点，因为它们自己会在后续 forward/backward 中发专属音效。
      ordinary page host 的鼠标点击同样只是在切换后续 ← → 的宿主所有权，不该发出额外 pop。 */
    const silentFocusCue = !!target.closest('.qa-note-bubble') || !!directInteractionAction || isOrdinaryPageHostClick;
  window.activateInteractionStepForElement(steppable, { silentFocusCue });

  if (directInteractionAction) {
    e.preventDefault();
    e.stopImmediatePropagation();

    const strategy = getStrategyByElement(steppable);
    if (strategy) {
      if (directInteractionAction === 'forward') {
        runTopLevelForward(strategy, steppable);
      } else {
        runTopLevelBackward(strategy, steppable);
      }
      saveStepState();
    }

    return;
  }
}, true);


/* 步进焦点管理：给当前焦点组件加上 .step-active 类（持久光晕 + 浮起）
   焦点始终跟着“最后一个已触发的组件”，全部撤销后无焦点。 */
function updateStepActiveClass() {
  // 清除当前页所有 step-active
  slides[current].querySelectorAll('.step-active').forEach(e => e.classList.remove('step-active'));
  // 给当前焦点组件加上 step-active
  if (stepIndex >= 0 && stepIndex < interactionQueue.length) {
    interactionQueue[stepIndex].classList.add('step-active');
  }
}

/* 空格键处理：预留给未来长文批注组件的页内滚动 */
function handleSpaceKey() {
  const scrollable = slides[current].querySelector('[data-scrollable]');
  if (scrollable) {
    scrollable.scrollBy({ top: scrollable.clientHeight * 0.85, behavior: 'smooth' });
  }
}

// --- 初始化 ---
autoTagSteppables();
ensureSlidePager();
updateUI();
buildInteractionQueue(0);
finishSlideAnimationsForEditorMode(slides[current]);

// =========================================
// Chart.js Integration
// =========================================

function getThemePalette() {
  const s = getComputedStyle(document.documentElement);
  const get = (v) => s.getPropertyValue(v).trim();
  return {
    text: get('--text') || get('--text-primary') || '#e6edf3',
    textMuted: get('--text-muted') || get('--text-secondary') || '#8b949e',
    textDim: get('--text-dim') || '#6e7681',
    border: get('--border') || 'rgba(255,255,255,0.07)',
    bgCard: get('--bg-card') || get('--bg-secondary') || '#131720',
    colors: [
      get('--accent-blue') || '#58a6ff',
      get('--accent-green') || '#3fb950',
      get('--accent-orange') || '#f0883e',
      get('--accent-purple') || '#a371f7',
      get('--accent-yellow') || '#d29922',
      get('--accent-red') || '#f85149'
    ]
  };
}

const chartInstances = {};

function createChart(canvasId) {
  if (typeof Chart === 'undefined') return;
  const el = document.getElementById(canvasId);
  if (!el) return;
  const configEl = document.querySelector(`[data-chart-config="${canvasId}"]`);
  if (!configEl) return;

  // Destroy existing instance
  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
    delete chartInstances[canvasId];
  }

  try {
    const palette = getThemePalette();
    const userConfig = JSON.parse(configEl.textContent);
    const chartType = userConfig.type;

    // Auto-assign theme colors to datasets
    userConfig.data.datasets.forEach((ds, i) => {
      const color = palette.colors[i % palette.colors.length];
      if (!ds.backgroundColor) {
        if (['pie','doughnut','polarArea'].includes(chartType)) {
          ds.backgroundColor = palette.colors.slice(0, ds.data.length);
          ds.borderColor = palette.bgCard;
          ds.borderWidth = 2;
        } else {
          ds.backgroundColor = color + '33';
          ds.borderColor = color;
          ds.borderWidth = 2;
        }
      }
      if (!ds.pointBackgroundColor && ['line','radar','scatter','bubble'].includes(chartType)) {
        ds.pointBackgroundColor = color;
      }
    });

    // Theme-aware defaults
    const themedOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 800, easing: 'easeOutQuart' },
      plugins: {
        legend: {
          labels: { color: palette.textMuted, font: { family: "'Inter', sans-serif", size: 12 } }
        },
        tooltip: {
          backgroundColor: palette.bgCard,
          titleColor: palette.text,
          bodyColor: palette.textMuted,
          borderColor: palette.border,
          borderWidth: 1
        }
      }
    };

    // Add themed scales for axis-based charts
    if (['bar','line','scatter','bubble'].includes(chartType)) {
      themedOptions.scales = {
        x: {
          ticks: { color: palette.textDim, font: { family: "'Inter', sans-serif", size: 11 } },
          grid: { color: palette.border }
        },
        y: {
          ticks: { color: palette.textDim, font: { family: "'Inter', sans-serif", size: 11 } },
          grid: { color: palette.border }
        }
      };
    }

    // Merge user options over themed defaults
    if (userConfig.options) {
      Object.assign(themedOptions.plugins, userConfig.options.plugins || {});
      Object.assign(themedOptions, userConfig.options, { plugins: themedOptions.plugins });
    }

    chartInstances[canvasId] = new Chart(el, {
      type: chartType,
      data: userConfig.data,
      options: themedOptions
    });
  } catch (e) {
    // Graceful fallback if Chart.js fails
    el.parentElement.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px;">Chart unavailable</p>';
  }
}

function destroyChart(canvasId) {
  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
    delete chartInstances[canvasId];
  }
}

// Initialize charts on first slide
if (typeof Chart !== 'undefined') {
  setTimeout(() => {
    slides[0].querySelectorAll('.chart-container canvas').forEach(c => createChart(c.id));
  }, 400);
}

// =========================================
// Speaker Notes (Console)
// =========================================

function showSpeakerNotes(index) {
  const slide = slides[index];
  const notesEl = slide.querySelector('script.slide-notes') || slide.querySelector('[class="slide-notes"]');
  console.clear();
  if (notesEl) {
    try {
      const n = JSON.parse(notesEl.textContent);
      const title = n.title || 'Slide ' + (index + 1);
      const script = n.script || '';
      const notes = n.notes || [];
      var parts = ['\n%c\ud83d\udccb Slide ' + (index+1) + '/' + total + ': ' + title + '\n'];
      var styles = ['font-size:16px;font-weight:bold;color:#2563eb;'];
      if (script) {
        parts.push('\n%c' + script + '\n');
        styles.push('font-size:14px;color:#d97706;line-height:1.6;');
      }
      if (notes.length) {
        notes.forEach(function(note) {
          parts.push('\n  %c\u2022%c ' + note);
          styles.push('color:#16a34a;font-size:14px;');
          styles.push('color:#16a34a;font-size:14px;');
        });
        parts.push('\n');
      }
      parts.push('\n\n\n\n%cUse HTMLSlides presenter app for notes editing and more features.\nhtmlslides.com\n');
      styles.push('font-size:10px;color:#9ca3af;');
      console.log.apply(console, [parts.join('')].concat(styles));
    } catch(e) {}
  } else {
    console.log('%c\ud83d\udccb Slide ' + (index+1) + '/' + total + '\n\n%cNo speaker notes for this slide.',
      'font-size:16px;font-weight:bold;color:#2563eb;', 'font-size:12px;color:#9ca3af;');
  }
}

// Show notes for first slide on load
setTimeout(function() { showSpeakerNotes(0); }, 500);
