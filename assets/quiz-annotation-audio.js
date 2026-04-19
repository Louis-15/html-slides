(function initQuizAnnotationAudio() {
  if (window.QuizAnnotationAudio) return;

  const COMPONENT_NAME = 'quiz-annotation';
  const HOVER_COOLDOWN_MS = 160;
  let lastHoverKey = '';
  let lastHoverTime = 0;

  function registerCues() {
    if (!window.AudioRuntime || typeof window.AudioRuntime.registerComponentCue !== 'function') return;

    window.AudioRuntime.registerComponentCue(COMPONENT_NAME, 'fragment-step', (payload) => {
      const direction = payload && payload.direction === 'backward' ? 'backward' : 'forward';
      return window.AudioRuntime.playPreset(direction === 'backward' ? 'fragment-swoosh-back' : 'fragment-swoosh');
    });

    window.AudioRuntime.registerComponentCue(COMPONENT_NAME, 'fragment-hover', () => {
      return window.AudioRuntime.playPreset('ui-hover');
    });
  }

  function playFragmentStep(payload) {
    if (!window.AudioRuntime || typeof window.AudioRuntime.playComponentCue !== 'function') return false;
    return window.AudioRuntime.playComponentCue(COMPONENT_NAME, 'fragment-step', payload || {});
  }

  function playFragmentHover(payload) {
    if (!window.AudioRuntime || typeof window.AudioRuntime.playComponentCue !== 'function') return false;

    const linkId = String(payload?.linkId || '');
    const now = Date.now();
    if (linkId && lastHoverKey === linkId && (now - lastHoverTime) < HOVER_COOLDOWN_MS) {
      return false;
    }

    lastHoverKey = linkId;
    lastHoverTime = now;
    return window.AudioRuntime.playComponentCue(COMPONENT_NAME, 'fragment-hover', payload || {});
  }

  registerCues();

  window.QuizAnnotationAudio = {
    registerCues,
    playFragmentStep,
    playFragmentHover
  };
})();