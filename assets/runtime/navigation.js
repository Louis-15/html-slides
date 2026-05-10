/* ===========================================
   NAVIGATION.JS
   幻灯片导航核心 — 翻页、UI、Zone 变体检测、粒子、滚轮
   依赖：无（最先加载）
   为其他模块提供：goTo(), next(), prev(), slides, current, total
   其他模块通过 window.__slideRuntime__ 注册钩子
   =========================================== */

/* --- 共享状态转发层 ---
   后续模块（step-through, chart, speaker-notes）通过此对象
   将各自的函数注册进来，供 goTo() 翻页时调用。 */
window.__slideRuntime__ = {
  // 由其他模块注册的 forward refs
  buildInteractionQueue: null,
  showSpeakerNotes: null,
  createChart: null,
  destroyChart: null,
  stepForward: null,
  stepBackward: null,
  stepFragment: null,

  // 跨模块共享的可变状态
  interactionQueue: [],
  stepIndex: -1,
  pendingFirstFocusCueAfterPageTurn: false,
  slideStepState: {},
  chartInstances: {}
};

/* --- 页面切换钩子 --- */
const _slideChangeListeners = [];
window.addSlideChangeListener = function(fn) {
  if (typeof fn === 'function') _slideChangeListeners.push(fn);
};

/* --- Zone 变体自动检测 --- */
const ZONE_VARIANT_DEFAULTS = {
  'slide-header': 'banner'
};

Object.entries(ZONE_VARIANT_DEFAULTS).forEach(([baseClass, defaultVariant]) => {
  document.querySelectorAll('.' + baseClass).forEach(el => {
    if (!el.classList.contains(defaultVariant)) {
      el.classList.add(defaultVariant);
    }
  });
});

/* --- 粒子效果 --- */
const pc = document.getElementById('particles');
if (pc) {
  for (let i = 0; i < 35; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.animationDuration = (8 + Math.random() * 14) + 's';
    p.style.animationDelay = Math.random() * 10 + 's';
    p.style.width = p.style.height = (1 + Math.random() * 2) + 'px';
    pc.appendChild(p);
  }
}

/* --- 导航系统 --- */
const slides = document.querySelectorAll('.slide');
const progress = document.getElementById('progress');
const counter = document.getElementById('counter');
const slideNav = document.getElementById('slideNav');
let current = 0;
const total = slides.length;

slides.forEach((_, i) => {
  const dot = document.createElement('div');
  dot.className = 'slide-nav-dot' + (i === 0 ? ' active' : '');
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
  progress.style.width = ((current + 1) / total * 100) + '%';
  counter.textContent = (current + 1) + ' / ' + total;
  document.querySelectorAll('.slide-nav-dot').forEach((d, i) => d.classList.toggle('active', i === current));

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
    } catch (e) { /* 静默跳过 */ }
  });
}

function goTo(index, options) {
  if (index < 0 || index >= total || index === current) return;
  const prev = current;
  current = index;

  // 旧幻灯片退场
  const prevSlide = slides[prev];
  prevSlide.classList.remove('active');
  prevSlide.classList.add('leaving');
  setTimeout(() => {
    prevSlide.classList.remove('leaving');
  }, 450);

  // 新幻灯片入场
  slides[current].classList.add('active');
  finishSlideAnimationsForEditorMode(slides[current]);

  updateUI();

  // 讲者备注（由 speaker-notes.js 注册）
  if (typeof window.__slideRuntime__.showSpeakerNotes === 'function') {
    window.__slideRuntime__.showSpeakerNotes(current);
  }

  // Chart 生命周期（由 chart-integration.js 注册）
  if (typeof Chart !== 'undefined') {
    slides[prev].querySelectorAll('.chart-container canvas').forEach(c => {
      if (typeof window.__slideRuntime__.destroyChart === 'function') {
        window.__slideRuntime__.destroyChart(c.id);
      }
    });
    setTimeout(() => {
      slides[current].querySelectorAll('.chart-container canvas').forEach(c => {
        if (typeof window.__slideRuntime__.createChart === 'function') {
          window.__slideRuntime__.createChart(c.id);
        }
      });
    }, 350);
  }

  // 交互队列重建（由 step-through.js 注册）
  window.__slideRuntime__.pendingFirstFocusCueAfterPageTurn = !!(options && options.resetFocus === true);
  if (typeof window.__slideRuntime__.buildInteractionQueue === 'function') {
    window.__slideRuntime__.buildInteractionQueue(current, options || {});
  }

  playGlobalCue('page-turn');
  _slideChangeListeners.forEach(fn => fn(current, prev));
}

function next(options) { goTo(current + 1, options); }
function prev(options) { goTo(current - 1, options); }

/* --- 滚轮翻页 --- */
let wheelCD = false;
document.addEventListener('wheel', (e) => {
  const slide = e.target.closest && e.target.closest('.slide');
  if (slide && slide.querySelector('.quiz-annotation')) return;
  if (e.target.closest && e.target.closest('[data-scrollable]')) return;

  if (wheelCD) return;
  wheelCD = true;
  setTimeout(() => wheelCD = false, 600);
  if (e.deltaY > 0 || e.deltaX > 0) next();
  else prev();
}, { passive: true });
