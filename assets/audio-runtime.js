(function initAudioRuntime() {
  if (window.AudioRuntime) return;

  let audioContext = null;
  const componentCueRegistry = new Map();
  const cuePlayerCache = new Map();
  const runtimeScriptUrl = document.currentScript && document.currentScript.src ? document.currentScript.src : '';
  const debugState = {
    lastCueName: '',
    lastPlayerType: '',
    lastErrorMessage: '',
    protocol: window.location.protocol || ''
  };

  function resolveSoundUrl(fileName) {
    const baseUrl = runtimeScriptUrl ? new URL('../sound/', runtimeScriptUrl) : new URL('./sound/', window.location.href);
    return new URL(fileName, baseUrl).href;
  }

  // 这一层只维护“全局可复用 cue 名称 -> 实际音频资源”的映射。
  // 组件层继续只关心 cue 名称，不关心底下到底是 mp3、flac，还是未来替换成别的素材。
  const cueDefinitions = Object.freeze({
    'focus-shift': Object.freeze({
      type: 'file',
      src: resolveSoundUrl('pop.mp3'),
      gain: 2
    }),
    'page-turn': Object.freeze({
      type: 'file',
      /* 翻页音效这轮明确指定使用 turn_page.mp3。
         用户没有要求额外放大量，因此保持源文件 1x 音量，避免把翻页声做得比焦点切换更抢前景。 */
      src: resolveSoundUrl('turn_page.mp3'),
      gain: 1
    }),
    'summary-open': Object.freeze({
      type: 'file',
      /* 总结组件弹出时单独使用收银机音效，和翻页、焦点切换彻底分开。
         这里同样保持 1x 源音量，避免在 summary reveal 时把其它交互 cue 全部盖住。 */
      src: resolveSoundUrl('cash_register.mp3'),
      gain: 1
    }),
    'fragment-swoosh': Object.freeze({
      type: 'file',
      src: resolveSoundUrl('whoosh.mp3'),
      gain: 2
    }),
    'fragment-swoosh-back': Object.freeze({
      type: 'file',
      src: resolveSoundUrl('whoosh_back.mp3'),
      gain: 2
    }),
    'ui-hover': Object.freeze({
      type: 'file',
      src: resolveSoundUrl('annotation_hover.flac'),
      gain: 5
    })
  });

  function isEditorMode() {
    return document.documentElement.classList.contains('editor-mode') ||
      document.body.classList.contains('editor-mode');
  }

  // 目前项目只有放映、涂鸦、编辑三种模式。
  // 按本轮约定：编辑模式静音，其余两种模式允许播音效。
  function isEnabled() {
    return !isEditorMode();
  }

  function getAudioContext() {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;
    if (!audioContext) {
      audioContext = new AudioContextCtor();
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }
    return audioContext;
  }

  function getCueDefinition(name) {
    const definition = cueDefinitions[name];
    if (!definition) return null;
    return { ...definition };
  }

  function getDebugState() {
    return { ...debugState };
  }

  function updateDebugState(patch) {
    Object.assign(debugState, patch || {});
  }

  function createAudioElement(src, volume) {
    if (typeof window.Audio !== 'function') return null;
    const audio = new window.Audio(src);
    audio.preload = 'auto';
    audio.muted = false;
    audio.volume = Math.max(0, Math.min(1, Number(volume) || 1));
    if (typeof audio.load === 'function') {
      audio.load();
    }
    return audio;
  }

  function splitGainAcrossPlayers(gain) {
    const targetGain = Math.max(Number(gain) || 1, 1);
    const wholeCount = Math.floor(targetGain);
    const remainder = targetGain - wholeCount;
    const volumes = [];

    for (let index = 0; index < wholeCount; index += 1) {
      volumes.push(1);
    }
    if (remainder > 0.001) {
      volumes.push(remainder);
    }
    if (volumes.length === 0) {
      volumes.push(1);
    }
    return volumes;
  }

  function playAudioElement(audio) {
    if (!audio) return false;
    if (typeof audio.pause === 'function') {
      try {
        audio.pause();
      } catch (_) {
        // 某些浏览器在未开始播放前调用 pause 会抛错，忽略即可。
      }
    }

    try {
      audio.currentTime = 0;
    } catch (_) {
      // 流媒体或尚未 ready 的媒体元素可能暂时不允许改 currentTime，不影响下一次 play。
    }

    const playResult = typeof audio.play === 'function' ? audio.play() : null;
    if (playResult && typeof playResult.catch === 'function') {
      playResult.catch((error) => {
        updateDebugState({ lastErrorMessage: error && error.message ? error.message : String(error || 'playback rejected') });
      });
    }
    return true;
  }

  function createFanOutPlayer(definition) {
    const volumes = splitGainAcrossPlayers(definition.gain);
    const audios = volumes
      .map((volume) => createAudioElement(definition.src, volume))
      .filter(Boolean);

    if (audios.length === 0) return null;
    return {
      type: 'fan-out',
      audios
    };
  }

  function canUseMediaGraphPath() {
    // 课件大量以独立 HTML 文件直接打开的方式使用；
    // file:// 场景下把本地媒体接入 Web Audio 在部分浏览器会直接抛 SecurityError 或输出静音。
    // 这里优先回退到多路普通 audio 并发播放，保证“能听到”优先于“实现最理想的数字增益”。
    return window.location.protocol !== 'file:';
  }

  function createMediaGraphPlayer(definition) {
    const audio = createAudioElement(definition.src, 1);
    if (!audio) return null;

    const context = getAudioContext();
    let gainNode = null;

    if (context && typeof context.createMediaElementSource === 'function' && typeof context.createGain === 'function') {
      const sourceNode = context.createMediaElementSource(audio);
      gainNode = context.createGain();
      gainNode.gain.value = typeof definition.gain === 'number' ? definition.gain : 1;
      sourceNode.connect(gainNode);
      gainNode.connect(context.destination);
    }

    return {
      type: 'media-graph',
      audio,
      gainNode
    };
  }

  function createCuePlayer(definition) {
    if (!definition || definition.type !== 'file' || typeof window.Audio !== 'function') return null;

    if (!canUseMediaGraphPath()) {
      return createFanOutPlayer(definition);
    }

    try {
      return createMediaGraphPlayer(definition);
    } catch (error) {
      updateDebugState({
        lastErrorMessage: error && error.message ? error.message : String(error || 'media graph unavailable')
      });
      return createFanOutPlayer(definition);
    }
  }

  function getCuePlayer(name, definition) {
    if (!cuePlayerCache.has(name)) {
      const player = createCuePlayer(definition);
      if (!player) return null;
      cuePlayerCache.set(name, player);
    }
    return cuePlayerCache.get(name);
  }

  function playFileCue(name, definition) {
    const player = getCuePlayer(name, definition);
    if (!player) return false;

    updateDebugState({
      lastCueName: name,
      lastPlayerType: player.type || 'unknown',
      lastErrorMessage: debugState.lastPlayerType === (player.type || 'unknown') ? debugState.lastErrorMessage : debugState.lastErrorMessage
    });

    if (player.type === 'fan-out') {
      player.audios.forEach((audio) => {
        playAudioElement(audio);
      });
      return true;
    }

    if (player.gainNode && typeof definition.gain === 'number') {
      player.gainNode.gain.value = definition.gain;
    } else if ('volume' in player.audio) {
      player.audio.volume = Math.max(0, Math.min(1, Number(definition.gain) || 1));
    }

    return playAudioElement(player.audio);
  }

  function playPreset(name) {
    if (!isEnabled()) return false;

    const definition = cueDefinitions[name];
    if (!definition) return false;
    if (definition.type === 'file') {
      return playFileCue(name, definition);
    }

    return false;
  }

  function cueKey(componentName, cueName) {
    return `${componentName || 'global'}::${cueName || 'unknown'}`;
  }

  window.AudioRuntime = {
    isEnabled,
    getCueDefinition,
    getDebugState,
    playPreset,
    playGlobalCue(name) {
      return playPreset(name);
    },
    registerComponentCue(componentName, cueName, handler) {
      if (!componentName || !cueName || typeof handler !== 'function') return;
      componentCueRegistry.set(cueKey(componentName, cueName), handler);
    },
    playComponentCue(componentName, cueName, payload) {
      if (!isEnabled()) return false;
      const handler = componentCueRegistry.get(cueKey(componentName, cueName));
      if (!handler) return false;
      return handler(payload || {}) === true;
    }
  };
})();