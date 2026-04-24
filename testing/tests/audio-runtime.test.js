import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..', '..');
const runtimePath = path.join(projectRoot, 'assets', 'audio-runtime.js');
const qaAudioPath = path.join(projectRoot, 'assets', 'quiz-annotation-audio.js');
const runtimeSource = fs.readFileSync(runtimePath, 'utf-8');
const qaAudioSource = fs.readFileSync(qaAudioPath, 'utf-8');

function createAudioRuntimeDom(options = {}) {
  const {
    url = 'http://localhost/',
    throwOnMediaSource = false
  } = options;

  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    runScripts: 'outside-only',
    url
  });

  const { window } = dom;
  const createdAudios = [];
  const createdGains = [];

  window.Audio = class FakeAudio {
    constructor(src) {
      this.src = src;
      this.preload = 'none';
      this.currentTime = 0;
      this.playCalls = 0;
      this.pauseCalls = 0;
      createdAudios.push(this);
    }

    play() {
      this.playCalls += 1;
      return Promise.resolve();
    }

    pause() {
      this.pauseCalls += 1;
    }
  };

  window.AudioContext = class FakeAudioContext {
    constructor() {
      this.state = 'running';
      this.destination = { nodeType: 'destination' };
    }

    resume() {
      return Promise.resolve();
    }

    createMediaElementSource(audio) {
      if (throwOnMediaSource) {
        throw new Error('SecurityError: local file media cannot be routed through Web Audio');
      }
      return {
        audio,
        connections: [],
        connect(target) {
          this.connections.push(target);
        }
      };
    }

    createGain() {
      const gainNode = {
        gain: { value: 0 },
        connections: [],
        connect(target) {
          this.connections.push(target);
        }
      };
      createdGains.push(gainNode);
      return gainNode;
    }
  };

  window.eval(runtimeSource);

  return { dom, window, createdAudios, createdGains };
}

describe('audio runtime cues', () => {
  it('maps focus, page-turn, summary, and fragment cues to the provided files and requested gain multipliers', () => {
    const { window, createdAudios, createdGains } = createAudioRuntimeDom();

    const focusCue = window.AudioRuntime.getCueDefinition('focus-shift');
    const pageTurnCue = window.AudioRuntime.getCueDefinition('page-turn');
    const summaryCue = window.AudioRuntime.getCueDefinition('summary-open');
    const stepCue = window.AudioRuntime.getCueDefinition('fragment-swoosh');
    const backwardStepCue = window.AudioRuntime.getCueDefinition('fragment-swoosh-back');
    const hoverCue = window.AudioRuntime.getCueDefinition('ui-hover');

    assert.match(focusCue.src, /\/sound\/pop\.mp3$/, 'expected bubble focus cue to use pop.mp3');
    assert.equal(focusCue.gain, 2, 'expected bubble focus cue to amplify the provided pop.mp3 by 2x');
    assert.match(pageTurnCue.src, /\/sound\/turn_page\.mp3$/, 'expected page-turn cue to use turn_page.mp3');
    assert.equal(pageTurnCue.gain, 1, 'expected page-turn cue to keep the source file volume unless a stronger gain is explicitly requested');
    assert.match(summaryCue.src, /\/sound\/cash_register\.mp3$/, 'expected summary popup cue to use cash_register.mp3');
    assert.equal(summaryCue.gain, 1, 'expected summary popup cue to keep the source file volume unless a stronger gain is explicitly requested');
    assert.match(stepCue.src, /\/sound\/whoosh\.mp3$/, 'expected fragment step cue to use whoosh.mp3');
    assert.equal(stepCue.gain, 2, 'expected fragment step cue to amplify the provided whoosh.mp3 by 2x');
    assert.match(backwardStepCue.src, /\/sound\/whoosh_back\.mp3$/, 'expected fragment backward-step cue to use whoosh_back.mp3');
    assert.equal(backwardStepCue.gain, 2, 'expected fragment backward-step cue to amplify the provided whoosh_back.mp3 by 2x');
    assert.match(hoverCue.src, /\/sound\/annotation_hover\.flac$/, 'expected fragment hover cue to use annotation_hover.flac');
    assert.equal(hoverCue.gain, 5, 'expected fragment hover cue to amplify the provided annotation_hover.flac by 5x');

    assert.equal(window.AudioRuntime.playGlobalCue('focus-shift'), true, 'expected global focus cue playback to succeed');
    assert.equal(window.AudioRuntime.playGlobalCue('page-turn'), true, 'expected global page-turn cue playback to succeed');
    assert.equal(window.AudioRuntime.playGlobalCue('summary-open'), true, 'expected global summary-popup cue playback to succeed');
    assert.equal(window.AudioRuntime.playPreset('fragment-swoosh'), true, 'expected fragment step cue playback to succeed');
    assert.equal(window.AudioRuntime.playPreset('fragment-swoosh-back'), true, 'expected fragment backward-step cue playback to succeed');
    assert.equal(window.AudioRuntime.playPreset('ui-hover'), true, 'expected fragment hover cue playback to succeed');

    assert.equal(createdAudios.length, 6, 'expected each cue to create a media-backed audio instance on first playback');
    assert.match(createdAudios[0].src, /\/sound\/pop\.mp3$/, 'expected focus playback to instantiate pop.mp3');
    assert.match(createdAudios[1].src, /\/sound\/turn_page\.mp3$/, 'expected page-turn playback to instantiate turn_page.mp3');
    assert.match(createdAudios[2].src, /\/sound\/cash_register\.mp3$/, 'expected summary-popup playback to instantiate cash_register.mp3');
    assert.match(createdAudios[3].src, /\/sound\/whoosh\.mp3$/, 'expected fragment step playback to instantiate whoosh.mp3');
    assert.match(createdAudios[4].src, /\/sound\/whoosh_back\.mp3$/, 'expected fragment backward-step playback to instantiate whoosh_back.mp3');
    assert.match(createdAudios[5].src, /\/sound\/annotation_hover\.flac$/, 'expected fragment hover playback to instantiate annotation_hover.flac');
    assert.deepEqual(createdGains.map((gainNode) => gainNode.gain.value), [2, 1, 1, 2, 2, 5], 'expected playback gain nodes to use the requested amplification values');
  });

  it('falls back to parallel plain-audio playback when Web Audio routing is unavailable for local files', () => {
    const { window, createdAudios, createdGains } = createAudioRuntimeDom({
      url: 'file:///D:/Projects/html-slides/%E9%AB%98%E8%80%83%E8%8B%B1%E8%AF%AD%E9%98%85%E8%AF%BB%E5%AE%9E%E6%88%98.html',
      throwOnMediaSource: true
    });

    assert.equal(window.AudioRuntime.playGlobalCue('focus-shift'), true, 'expected local-file playback to succeed even when createMediaElementSource is blocked');

    assert.equal(createdGains.length, 0, 'expected the local-file fallback path to avoid gain nodes when Web Audio routing is unavailable');
    assert.equal(createdAudios.length, 2, 'expected a 2x cue to fan out into two plain audio instances so local playback is still louder than the source file');
    assert.match(createdAudios[0].src, /\/sound\/pop\.mp3$/, 'expected fallback playback to keep using pop.mp3');
    assert.deepEqual(createdAudios.map((audio) => audio.playCalls), [1, 1], 'expected each fallback audio instance to be played once');
    assert.deepEqual(createdAudios.map((audio) => audio.volume), [1, 1], 'expected fallback fan-out to keep each plain audio instance at full volume');
    assert.equal(window.AudioRuntime.getDebugState().lastPlayerType, 'fan-out', 'expected debug state to record that local-file playback used the fan-out fallback');
  });

  it('routes forward and backward fragment steps to different cue files', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      runScripts: 'outside-only',
      url: 'http://localhost/'
    });
    const { window } = dom;
    const presetCalls = [];
    const cueRegistry = new Map();

    window.AudioRuntime = {
      registerComponentCue(componentName, cueName, handler) {
        cueRegistry.set(`${componentName}:${cueName}`, handler);
      },
      playComponentCue(componentName, cueName, payload) {
        const handler = cueRegistry.get(`${componentName}:${cueName}`);
        return handler ? handler(payload) : false;
      },
      playPreset(name) {
        presetCalls.push(name);
        return true;
      }
    };

    window.eval(qaAudioSource);

    window.QuizAnnotationAudio.playFragmentStep({ direction: 'forward' });
    window.QuizAnnotationAudio.playFragmentStep({ direction: 'backward' });

    assert.deepEqual(presetCalls, ['fragment-swoosh', 'fragment-swoosh-back'], 'expected fragment step audio to use whoosh.mp3 for forward and whoosh_back.mp3 for backward');
  });
});