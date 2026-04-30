(function initExampleCardAudio() {
  if (window.ExampleCardAudio) {
    return;
  }

  function playSubmitResult(payload) {
    if (!window.AudioRuntime || typeof window.AudioRuntime.playGlobalCue !== 'function') {
      return false;
    }

    // 例题运行时只知道“这次提交是对还是错”的业务语义，
    // 具体播哪个全局 cue 交给这一层适配，避免组件代码直接依赖底层素材命名。
    return window.AudioRuntime.playGlobalCue(payload && payload.isCorrect === true ? 'answer-correct' : 'answer-wrong');
  }

  window.ExampleCardAudio = {
    playSubmitResult
  };
})();