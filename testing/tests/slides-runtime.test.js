import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..', '..');
const runtimePath = path.join(projectRoot, 'assets', 'slides-runtime.js');
const componentsPath = path.join(projectRoot, 'assets', 'components.css');
const runtimeSource = fs.readFileSync(runtimePath, 'utf-8');
const componentsSource = fs.readFileSync(componentsPath, 'utf-8');

function pressKey(window, key) {
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
}

function clickElement(window, element) {
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

function createSlidesDom() {
  const html = `<!DOCTYPE html><html class="editor-mode"><body class="editor-mode">
    <div id="particles"></div>
    <div id="progress"></div>
    <div id="counter"></div>
    <div id="slideNav"></div>
    <div class="deck">
      <div class="slide active" data-slide="1">
        <div class="anim-1">Slide 1</div>
      </div>
      <div class="slide" data-slide="2">
        <div class="anim-1">Slide 2</div>
      </div>
    </div>
  </body></html>`;

  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'http://localhost/'
  });

  const { window } = dom;
  window.console.log = () => {};
  window.setTimeout = (callback) => {
    callback();
    return 1;
  };
  window.clearTimeout = () => {};

  window.eval(runtimeSource);

  return dom;
}

function createSteppingDom() {
  const html = `<!DOCTYPE html><html><body>
    <div id="particles"></div>
    <div id="progress"></div>
    <div id="counter"></div>
    <div id="slideNav"></div>
    <div class="deck">
      <div class="slide active" data-slide="1">
        <div class="qa-step-host" data-steppable="annotation"></div>
      </div>
      <div class="slide" data-slide="2">
        <div class="anim-1">Slide 2</div>
      </div>
    </div>
  </body></html>`;

  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'http://localhost/'
  });

  const { window } = dom;
  window.console.log = () => {};
  window.setTimeout = (callback) => {
    callback();
    return 1;
  };
  window.clearTimeout = () => {};

  window.eval(runtimeSource);

  const host = window.document.querySelector('.qa-step-host');
  const state = {
    focusIndex: -1,
    fragmentCursor: -1,
    revealed: []
  };
  const bubbleIds = ['note-01', 'note-02'];
  const fragmentIds = ['frag-01', 'frag-02'];

  function sync() {
    if (state.focusIndex >= 0) {
      host.dataset.focusBubble = bubbleIds[state.focusIndex];
    } else {
      delete host.dataset.focusBubble;
    }
    host.dataset.visibleFragments = state.revealed.join(',');
  }

  window.registerStepStrategy('annotation', {
    canStepTopLevelForward() {
      return state.focusIndex < bubbleIds.length - 1;
    },
    canStepTopLevelBackward() {
      return state.focusIndex >= 0;
    },
    forwardTopLevel() {
      if (state.focusIndex >= bubbleIds.length - 1) return false;
      state.focusIndex += 1;
      state.fragmentCursor = -1;
      state.revealed = [];
      sync();
      return true;
    },
    backwardTopLevel() {
      if (state.focusIndex < 0) return false;
      state.focusIndex -= 1;
      state.fragmentCursor = -1;
      state.revealed = [];
      sync();
      return true;
    },
    stepFragment(_, direction) {
      if (state.focusIndex < 0) return false;
      if (direction === 'forward') {
        if (state.fragmentCursor >= fragmentIds.length - 1) return false;
        state.fragmentCursor += 1;
        const nextId = fragmentIds[state.fragmentCursor];
        if (!state.revealed.includes(nextId)) {
          state.revealed.push(nextId);
        }
        sync();
        return true;
      }

      if (state.revealed.length === 0) return false;
      state.revealed.pop();
      state.fragmentCursor = state.revealed.length - 1;
      sync();
      return true;
    }
  });

  return { dom, host };
}

function createQuizAnnotationLockDom() {
  const html = `<!DOCTYPE html><html><body>
    <div id="particles"></div>
    <div id="progress"></div>
    <div id="counter"></div>
    <div id="slideNav"></div>
    <div class="deck">
      <div class="slide active" data-slide="1">
        <div class="quiz-annotation" data-steppable="annotation"></div>
      </div>
      <div class="slide" data-slide="2">
        <div class="anim-1">Slide 2</div>
      </div>
    </div>
  </body></html>`;

  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'http://localhost/'
  });

  const { window } = dom;
  window.console.log = () => {};
  window.setTimeout = (callback) => {
    callback();
    return 1;
  };
  window.clearTimeout = () => {};

  window.eval(runtimeSource);

  let stepped = false;
  window.registerStepStrategy('annotation', {
    canStepTopLevelForward() {
      return !stepped;
    },
    canStepTopLevelBackward() {
      return stepped;
    },
    forwardTopLevel() {
      if (stepped) return false;
      stepped = true;
      return true;
    },
    backwardTopLevel() {
      if (!stepped) return false;
      stepped = false;
      return true;
    },
    stepFragment() {
      return false;
    }
  });

  return dom;
}

function createManualActivationSyncDom() {
  const html = `<!DOCTYPE html><html><body>
    <div id="particles"></div>
    <div id="progress"></div>
    <div id="counter"></div>
    <div id="slideNav"></div>
    <div class="deck">
      <div class="slide active" data-slide="1">
        <div class="quiz-annotation" data-steppable="annotation"></div>
      </div>
    </div>
  </body></html>`;

  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'http://localhost/'
  });

  const { window } = dom;
  window.console.log = () => {};
  window.setTimeout = (callback) => {
    callback();
    return 1;
  };
  window.clearTimeout = () => {};

  window.eval(runtimeSource);

  const host = window.document.querySelector('.quiz-annotation');
  host.dataset.visibleFragments = '';
  window.registerStepStrategy('annotation', {
    canStepTopLevelForward() {
      return false;
    },
    canStepTopLevelBackward() {
      return false;
    },
    forwardTopLevel() {
      return false;
    },
    backwardTopLevel() {
      return false;
    },
    stepFragment(_, direction) {
      if (direction !== 'forward') return false;
      host.dataset.visibleFragments = 'frag-01';
      return true;
    }
  });

  return dom;
}

describe('slides runtime', () => {
  it('finishes animations on the newly active slide while editor mode is enabled', () => {
    const dom = createSlidesDom();
    const { window } = dom;
    const finishCalls = [];
    const nextSlide = window.document.querySelector('.slide[data-slide="2"]');
    const secondDot = window.document.querySelectorAll('.slide-nav-dot')[1];

    nextSlide.getAnimations = () => [{ finish: () => finishCalls.push('finished') }];

    clickElement(window, secondDot);

    assert.ok(nextSlide.classList.contains('active'), 'expected dot navigation to activate the target slide');
    assert.equal(finishCalls.length, 1, 'expected editor mode navigation to finish the new slide animations immediately');
  });

  it('uses ArrowDown and ArrowUp for top-level stepping before turning pages', () => {
    const { dom, host } = createSteppingDom();
    const { window } = dom;

    pressKey(window, 'ArrowDown');
    assert.equal(host.dataset.focusBubble, 'note-01', 'expected ArrowDown to activate the first top-level step');
    assert.equal(window.document.querySelector('.slide.active')?.getAttribute('data-slide'), '1', 'expected top-level stepping not to flip the slide early');

    pressKey(window, 'ArrowDown');
    assert.equal(host.dataset.focusBubble, 'note-02', 'expected ArrowDown to continue top-level stepping inside the current slide');

    pressKey(window, 'ArrowDown');
    assert.equal(window.document.querySelector('.slide.active')?.getAttribute('data-slide'), '2', 'expected ArrowDown to flip to the next slide after top-level steps are exhausted');
  });

  it('keeps ArrowLeft and ArrowRight scoped to fragment stepping inside the focused item', () => {
    const { dom, host } = createSteppingDom();
    const { window } = dom;

    pressKey(window, 'ArrowDown');
    pressKey(window, 'ArrowRight');
    assert.equal(host.dataset.visibleFragments, 'frag-01', 'expected ArrowRight to reveal the first fragment of the focused item');
    assert.equal(host.dataset.focusBubble, 'note-01', 'expected fragment stepping not to change the focused top-level item');

    pressKey(window, 'ArrowRight');
    assert.equal(host.dataset.visibleFragments, 'frag-01,frag-02', 'expected ArrowRight to continue revealing fragments in-order');

    pressKey(window, 'ArrowRight');
    assert.equal(host.dataset.focusBubble, 'note-01', 'expected extra ArrowRight presses not to advance to the next top-level item');
    assert.equal(window.document.querySelector('.slide.active')?.getAttribute('data-slide'), '1', 'expected fragment stepping not to flip the slide');

    pressKey(window, 'ArrowLeft');
    assert.equal(host.dataset.visibleFragments, 'frag-01', 'expected ArrowLeft to hide only the latest revealed fragment');
  });

  it('renders bottom-right pager buttons and wires them to slide navigation', () => {
    const dom = createSlidesDom();
    const { window } = dom;
    const nextBtn = window.document.querySelector('.slide-pager-next');
    const prevBtn = window.document.querySelector('.slide-pager-prev');

    assert.ok(prevBtn, 'expected the previous-page pager button to be rendered');
    assert.ok(nextBtn, 'expected the next-page pager button to be rendered');

    clickElement(window, nextBtn);
    assert.equal(window.document.querySelector('.slide.active')?.getAttribute('data-slide'), '2', 'expected next pager button to navigate to the next slide');

    clickElement(window, prevBtn);
    assert.equal(window.document.querySelector('.slide.active')?.getAttribute('data-slide'), '1', 'expected previous pager button to navigate back to the previous slide');
  });

  it('styles pager buttons with the theme secondary color token and white text', () => {
    assert.match(componentsSource, /\.slide-pager-btn\s*\{[\s\S]*background:\s*var\(--brand-secondary, var\(--accent-orange, #f39800\)\);/, 'expected pager buttons to use the theme secondary color variable as their fill');
    assert.match(componentsSource, /\.slide-pager-btn\s*\{[\s\S]*color:\s*#fff;/, 'expected pager buttons to render white button text');
  });

  it('exposes a way to sync manual component activation before fragment stepping', () => {
    const dom = createManualActivationSyncDom();
    const { window } = dom;
    const host = window.document.querySelector('.quiz-annotation');

    const didSync = window.activateInteractionStepForElement(host);
    pressKey(window, 'ArrowRight');

    assert.equal(didSync, true, 'expected slides runtime to accept manual interaction sync for the current steppable component');
    assert.equal(host.dataset.visibleFragments, 'frag-01', 'expected ArrowRight to route into fragment stepping after manual activation sync');
  });

  it('does not let ArrowDown or ArrowUp flip pages on quiz-annotation slides after stepping is exhausted', () => {
    const dom = createQuizAnnotationLockDom();
    const { window } = dom;

    pressKey(window, 'ArrowDown');
    assert.equal(window.document.querySelector('.slide.active')?.getAttribute('data-slide'), '1', 'expected the first top-level step to stay on the quiz slide');

    pressKey(window, 'ArrowDown');
    assert.equal(window.document.querySelector('.slide.active')?.getAttribute('data-slide'), '1', 'expected exhausted quiz-annotation steps not to auto-flip to the next slide');

    pressKey(window, 'ArrowUp');
    assert.equal(window.document.querySelector('.slide.active')?.getAttribute('data-slide'), '1', 'expected backward stepping on quiz-annotation slides to stay on the same page');

    pressKey(window, 'ArrowUp');
    assert.equal(window.document.querySelector('.slide.active')?.getAttribute('data-slide'), '1', 'expected exhausted backward steps on quiz-annotation slides not to auto-flip to the previous slide');
  });
});