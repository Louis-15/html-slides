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
    forward(el) { el.classList.add('flipped'); },
    backward(el) { el.classList.remove('flipped'); },
    hasNextStep(el) { return !el.classList.contains('flipped'); }
  },
  collapse: {
    forward(el) { el.classList.add('expanded'); },
    backward(el) { el.classList.remove('expanded'); },
    hasNextStep(el) { return !el.classList.contains('expanded'); }
  },
  summary: {
    forward(el) {
      const panel = el.closest('.slide').querySelector('.summary-panel');
      if (panel) panel.classList.add('visible');
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

/* 构建指定页的交互队列，并恢复记忆的步进位置。
  这里只收显式 data-steppable。
  普通页富文本运行时会把“真正 owning fragment 的 ordinary [data-edit-id] 根块”晚一点自动打上
  data-steppable，再通过下面暴露的 refresh hook 把这些 root 刷进当前页队列。
  这样上下键的一级步进单位终于能落到组件根块，而不是错误地把整张 slide 当成二级 reveal 宿主。 */
function buildInteractionQueue(slideIndex) {
  interactionQueue = Array.from(
    slides[slideIndex].querySelectorAll('[data-steppable]')
  );
  stepIndex = (slideIndex in slideStepState) ? slideStepState[slideIndex] : -1;
  updateStepActiveClass();
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
  stepIndex++;
  const el = interactionQueue[stepIndex];
  const strategy = getStrategyByElement(el);
  runTopLevelForward(strategy, el);
  updateStepActiveClass();
  saveStepState();
  return true;
}

/* 反向步进：撤销当前页上一个组件的交互（← 左键）
   多步组件在所有内部步骤回退完毕后才切回上一个组件。 */
function stepBackward() {
  if (stepIndex < 0) return false;
  const el = interactionQueue[stepIndex];
  const strategy = getStrategyByElement(el);
  if (!runTopLevelBackward(strategy, el)) return false;
  // 检查当前组件是否已经完全回退（无更多内部步骤可回退）
  // 对于多步组件，backward 会逐步回退，只有全部回退完才减 stepIndex
  if (hasExplicitBackwardState(strategy) ? canStepTopLevelBackward(strategy, el) : false) {
    // 还有内部步骤（backward 后仍有状态），保持在当前组件
    updateStepActiveClass();
    saveStepState();
    return true;
  }
  stepIndex--;
  updateStepActiveClass();
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

window.activateInteractionStepForElement = function(el) {
  if (!el) return false;
  const currentSlide = slides[current];
  if (!currentSlide) return false;

  const target = el.matches && el.matches('[data-steppable]')
    ? el
    : (el.closest ? el.closest('[data-steppable]') : null);

  if (!target || !currentSlide.contains(target)) return false;

  const nextIndex = interactionQueue.indexOf(target);
  if (nextIndex === -1) return false;

  stepIndex = nextIndex;
  updateStepActiveClass();
  saveStepState();
  return true;
};


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
