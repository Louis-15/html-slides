(function initQuizAnnotationAudio() {
  if (window.QuizAnnotationAudio) return;

  const COMPONENT_NAME = 'quiz-annotation';

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

    /* 进入下划线批注范围的边界判断已经在 quiz runtime 层完成：
       常规模式走 mouseenter，doodle 透传模式只在底层 anchor 真正切换时才上报。
       因此音频适配层不应该再按 linkId 做二次节流，否则用户快速离开后重新进入同一批注时，
       会被这层冷却错误吞掉本该播放的 enter 音效。 */
    return window.AudioRuntime.playComponentCue(COMPONENT_NAME, 'fragment-hover', payload || {});
  }

  registerCues();

  window.QuizAnnotationAudio = {
    registerCues,
    playFragmentStep,
    playFragmentHover
  };
})();