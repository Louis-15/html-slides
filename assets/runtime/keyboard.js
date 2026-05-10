/* ===========================================
   KEYBOARD.JS
   键盘事件分发 — 页面类型检测 + example-card 特化 + keydown 总控
   依赖：navigation.js（使用 goTo, next, prev, slides, current）
   后续模块 step-through.js 加载后，stepForward/stepBackward/stepFragment 自动生效
   =========================================== */

/* --- 页面类型检测 --- */
function isQuizAnnotationSlide(index) {
  index = (index === undefined) ? current : index;
  const slide = slides[index];
  return !!(slide && slide.querySelector('.quiz-annotation'));
}

function isExampleCardSlide(index) {
  index = (index === undefined) ? current : index;
  const slide = slides[index];
  return !!(slide && slide.querySelector('.example-card'));
}

/* --- Example-Card 键盘目标解析 --- */
function getExampleCardKeyboardTarget(slide, hintTarget) {
  if (!slide) return null;

  const candidateCards = [];
  const pushCard = (card) => {
    if (!card || !slide.contains(card) || candidateCards.includes(card)) return;
    candidateCards.push(card);
  };

  if (hintTarget && hintTarget.closest) {
    pushCard(hintTarget.closest('.example-card'));
  }

  const focusedElement = typeof window.__slideRuntime__.getFocusedInteractionElement === 'function'
    ? window.__slideRuntime__.getFocusedInteractionElement()
    : null;
  if (focusedElement && focusedElement.closest) {
    pushCard(focusedElement.closest('.example-card'));
  }

  pushCard(slide.querySelector('.example-card__main.step-active')?.closest('.example-card'));
  slide.querySelectorAll('.example-card').forEach((card) => pushCard(card));

  return candidateCards[0] || null;
}

function getExampleCardMainHost(slide, hintTarget) {
  const card = getExampleCardKeyboardTarget(slide, hintTarget);
  if (!card) return null;

  const activeQuestion = card.querySelector('.example-card__question[data-question-active="true"]:not([hidden]):not([aria-hidden="true"])')
    || card.querySelector('.example-card__question:not([hidden]):not([aria-hidden="true"])')
    || card.querySelector('.example-card__question');

  if (!activeQuestion) return null;
  return activeQuestion.querySelector('.example-card__main') || null;
}

function navigateExampleCardQuestion(direction, slide, hintTarget) {
  const card = getExampleCardKeyboardTarget(slide, hintTarget);
  if (!card) return false;

  const activeQuestion = card.querySelector('.example-card__question[data-question-active="true"]:not([hidden]):not([aria-hidden="true"])')
    || card.querySelector('.example-card__question:not([hidden]):not([aria-hidden="true"])')
    || card.querySelector('.example-card__question');
  if (!activeQuestion) return false;

  const selector = direction === 'backward'
    ? '.example-card__prev-btn'
    : '.example-card__next-btn';
  const button = activeQuestion.querySelector(selector) || card.querySelector(selector);

  if (!button || button.disabled) {
    return false;
  }

  button.click();
  return true;
}

/* --- 键盘事件总控 --- */
document.addEventListener('keydown', (e) => {
  // 一级步进：↑↓ 先走当前页组件焦点，页内耗尽后再翻页
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (isExampleCardSlide()) {
      navigateExampleCardQuestion('forward', slides[current]);
      return;
    }
    if (typeof window.__slideRuntime__.stepForward === 'function') {
      if (!window.__slideRuntime__.stepForward() && !isQuizAnnotationSlide()) {
        next({ resetFocus: true });
      }
    }
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (isExampleCardSlide()) {
      navigateExampleCardQuestion('backward', slides[current]);
      return;
    }
    if (typeof window.__slideRuntime__.stepBackward === 'function') {
      if (!window.__slideRuntime__.stepBackward() && !isQuizAnnotationSlide()) {
        prev({ resetFocus: true });
      }
    }
    return;
  }
  if (e.key === 'PageDown') { e.preventDefault(); next(); return; }
  if (e.key === 'PageUp') { e.preventDefault(); prev(); return; }
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    if (typeof window.__slideRuntime__.stepFragment === 'function') {
      window.__slideRuntime__.stepFragment('forward');
    }
    return;
  }
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    if (typeof window.__slideRuntime__.stepFragment === 'function') {
      window.__slideRuntime__.stepFragment('backward');
    }
    return;
  }
  if (e.key === ' ') { e.preventDefault(); handleSpaceKey(); return; }
  if (e.key === 'Home') { e.preventDefault(); goTo(0); return; }
  if (e.key === 'End') { e.preventDefault(); goTo(total - 1); return; }
});

/* --- 空格键处理 --- */
function handleSpaceKey() {
  const scrollable = slides[current].querySelector('[data-scrollable]');
  if (scrollable) {
    scrollable.scrollBy({ top: scrollable.clientHeight * 0.85, behavior: 'smooth' });
  }
}
