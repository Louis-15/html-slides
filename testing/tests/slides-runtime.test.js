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
const quizRuntimePath = path.join(projectRoot, 'assets', 'quiz-annotation-runtime.js');
const zone1HeaderPath = path.join(projectRoot, 'assets', 'zones', 'zone1-header.css');
const zone2ContentPath = path.join(projectRoot, 'assets', 'zones', 'zone2-content.css');
const zone3SummaryPath = path.join(projectRoot, 'assets', 'zones', 'zone3-summary.css');
const xindongfangThemePath = path.join(projectRoot, 'assets', 'themes', 'xindongfang-green.css');
const runtimeSource = fs.readFileSync(runtimePath, 'utf-8');
const componentsSource = fs.readFileSync(componentsPath, 'utf-8');
const quizRuntimeSource = fs.readFileSync(quizRuntimePath, 'utf-8');
const zone1HeaderSource = fs.readFileSync(zone1HeaderPath, 'utf-8');
const zone2ContentSource = fs.readFileSync(zone2ContentPath, 'utf-8');
const zone3SummarySource = fs.readFileSync(zone3SummaryPath, 'utf-8');
const xindongfangThemeSource = fs.readFileSync(xindongfangThemePath, 'utf-8');

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

function createClickFocusSyncDom() {
  const html = `<!DOCTYPE html><html><body>
    <div id="particles"></div>
    <div id="progress"></div>
    <div id="counter"></div>
    <div id="slideNav"></div>
    <div class="deck">
      <div class="slide active" data-slide="1">
        <div class="focus-card focus-card-a" data-steppable="manual-focus">
          <button class="focus-card-inner focus-card-a-inner">A</button>
        </div>
        <div class="focus-card focus-card-b" data-steppable="manual-focus">
          <button class="focus-card-inner focus-card-b-inner">B</button>
        </div>
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

  const hostA = window.document.querySelector('.focus-card-a');
  const hostB = window.document.querySelector('.focus-card-b');
  const fragmentState = new Map([
    [hostA, []],
    [hostB, []]
  ]);

  function syncHost(host) {
    host.dataset.visibleFragments = fragmentState.get(host).join(',');
  }

  window.registerStepStrategy('manual-focus', {
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
    stepFragment(host, direction) {
      const current = fragmentState.get(host);
      if (!current) return false;
      if (direction === 'forward') {
        if (current.length >= 1) return false;
        current.push(host === hostA ? 'frag-a-01' : 'frag-b-01');
        syncHost(host);
        return true;
      }
      if (current.length === 0) return false;
      current.pop();
      syncHost(host);
      return true;
    }
  });

  syncHost(hostA);
  syncHost(hostB);
  return { dom, hostA, hostB };
}

function createSummarySteppingDom() {
  const html = `<!DOCTYPE html><html><body>
    <div id="particles"></div>
    <div id="progress"></div>
    <div id="counter"></div>
    <div id="slideNav"></div>
    <div class="deck">
      <div class="slide active" data-slide="1">
        <button class="summary-trigger" onclick="this.closest('.slide').querySelector('.summary-panel').classList.toggle('visible')">Summary</button>
        <div class="summary-panel"></div>
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

  const summaryTrigger = window.document.querySelector('.summary-trigger');
  const summaryPanel = window.document.querySelector('.summary-panel');
  summaryTrigger.addEventListener('click', () => {
    summaryPanel.classList.toggle('visible');
  });

  return dom;
}

function createSummaryFocusTransitionDom() {
  const html = `<!DOCTYPE html><html><body>
    <div id="particles"></div>
    <div id="progress"></div>
    <div id="counter"></div>
    <div id="slideNav"></div>
    <div class="deck">
      <div class="slide active" data-slide="1">
        <div class="flip-card">Flip</div>
        <button class="summary-trigger" onclick="this.closest('.slide').querySelector('.summary-panel').classList.toggle('visible')">Summary</button>
        <div class="summary-panel"></div>
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

  const summaryTrigger = window.document.querySelector('.summary-trigger');
  const summaryPanel = window.document.querySelector('.summary-panel');
  summaryTrigger.addEventListener('click', () => {
    summaryPanel.classList.toggle('visible');
  });

  return dom;
}

function createOrdinaryComponentQueueDom() {
  const html = `<!DOCTYPE html><html><body>
    <div id="particles"></div>
    <div id="progress"></div>
    <div id="counter"></div>
    <div id="slideNav"></div>
    <div class="deck">
      <div class="slide active" data-slide="1">
        <div class="slide-content layout-single">
          <div class="card ordinary-card">
            <div class="card-title">Passive card</div>
          </div>
          <div class="flip-card interactive-card">
            <div class="flip-front">Front</div>
            <div class="flip-back">Back</div>
            <button class="flip-action-btn" onclick="this.closest('.flip-card').classList.toggle('flipped')">Flip</button>
          </div>
        </div>
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

  return {
    dom,
    ordinaryCard: window.document.querySelector('.ordinary-card'),
    interactiveCard: window.document.querySelector('.interactive-card')
  };
}

function createCollapseComponentQueueDom() {
  const html = `<!DOCTYPE html><html><body>
    <div id="particles"></div>
    <div id="progress"></div>
    <div id="counter"></div>
    <div id="slideNav"></div>
    <div class="deck">
      <div class="slide active" data-slide="1">
        <div class="slide-content layout-single">
          <div class="card ordinary-card">
            <div class="card-title">Passive card</div>
          </div>
          <div class="collapse-card interactive-card">
            <div class="collapse-header">Header</div>
            <div class="collapse-body">Body</div>
            <button class="collapse-action-btn" onclick="this.closest('.collapse-card').classList.toggle('expanded')">Toggle</button>
          </div>
        </div>
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

  return {
    dom,
    ordinaryCard: window.document.querySelector('.ordinary-card'),
    interactiveCard: window.document.querySelector('.interactive-card')
  };
}

function createPassiveComponentAuditDom() {
  const html = `<!DOCTYPE html><html><body>
    <div id="particles"></div>
    <div id="progress"></div>
    <div id="counter"></div>
    <div id="slideNav"></div>
    <div class="deck">
      <div class="slide active" data-slide="1">
        <div class="slide-content layout-single">
          <div class="stat-card audit-stat-card">
            <div class="stat-number green">42</div>
            <div class="stat-label">Stat</div>
            <div class="stat-desc">Numbers still need top-level focus.</div>
          </div>
          <div class="timeline-card audit-timeline-card">
            <span class="timeline-dot green"></span>
            <div class="timeline-text"><strong>Timeline</strong> keeps its own host.</div>
          </div>
          <div class="highlight-card audit-highlight-card">
            <div class="highlight-label">Key Idea</div>
            <div class="highlight-title">Highlight</div>
            <div class="highlight-text">Emphasis block.</div>
          </div>
          <div class="code-window audit-code-window">
            <div class="code-titlebar">
              <span class="code-dot red"></span>
              <span class="code-dot yellow"></span>
              <span class="code-dot green"></span>
              <span class="code-filename">demo.js</span>
            </div>
            <div class="code-body">console.log('focus');</div>
          </div>
          <div class="chart-container audit-chart-container">
            <canvas id="audit-chart"></canvas>
          </div>
          <div class="table-wrap audit-table-wrap">
            <table>
              <thead><tr><th>Col</th></tr></thead>
              <tbody><tr><td>Value</td></tr></tbody>
            </table>
          </div>
          <div class="image-block audit-image-block">
            <img class="slide-image" alt="audit" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">
          </div>
          <div class="dual-bar audit-dual-bar">
            <div class="dual-bar-half left">Before</div>
            <div class="dual-bar-half right">After</div>
          </div>
          <div class="content-block audit-content-block">
            <p>Lead-in text host.</p>
          </div>
        </div>
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

  return {
    dom,
    roots: [
      { label: 'stat-card', element: window.document.querySelector('.audit-stat-card') },
      { label: 'timeline-card', element: window.document.querySelector('.audit-timeline-card') },
      { label: 'highlight-card', element: window.document.querySelector('.audit-highlight-card') },
      { label: 'code-window', element: window.document.querySelector('.audit-code-window') },
      { label: 'chart-container', element: window.document.querySelector('.audit-chart-container') },
      { label: 'table-wrap', element: window.document.querySelector('.audit-table-wrap') },
      { label: 'image-block', element: window.document.querySelector('.audit-image-block') },
      { label: 'dual-bar', element: window.document.querySelector('.audit-dual-bar') },
      { label: 'content-block', element: window.document.querySelector('.audit-content-block') }
    ]
  };
}

function createLateSteppableDom() {
  const html = `<!DOCTYPE html><html><body>
    <div id="particles"></div>
    <div id="progress"></div>
    <div id="counter"></div>
    <div id="slideNav"></div>
    <div class="deck">
      <div class="slide active" data-slide="1">
        <div class="header-title">Plain text only.</div>
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

function createQuizFragmentPersistenceDom() {
  const html = `<!DOCTYPE html><html><body>
    <div id="particles"></div>
    <div id="progress"></div>
    <div id="counter"></div>
    <div id="slideNav"></div>
    <div class="deck">
      <div class="slide active" data-slide="1">
        <div class="quiz-annotation has-quiz notes-active" data-steppable="annotation">
          <div class="qa-body">
            <svg class="qa-connector-canvas" aria-hidden="true"></svg>
            <div class="qa-passage">
              <p data-edit-id="passage-01"><span class="text-anchor" data-link="note-01" data-step="1">First <span class="qa-note-fragment" data-fragment-step="true">fragment</span> anchor.<sup class="note-badge">1</sup></span></p>
              <p data-edit-id="passage-02"><span class="text-anchor" data-link="note-02" data-step="2">Second anchor.<sup class="note-badge">2</sup></span></p>
            </div>
            <div class="qa-answer-panel">
              <div class="qa-answer-header">
                <div class="qa-answer-title">Question</div>
                <button class="qa-submit-btn">Submit</button>
              </div>
              <div class="qa-answer-content">
                <div class="qa-question" data-type="single">
                  <div class="qa-option" data-option="A">
                    <span class="qa-status-dot"></span>
                    <span class="qa-option-label">A</span>
                    <span class="qa-option-text">Option</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="qa-notes-panel">
              <div class="qa-note-bubble" data-link="note-01" data-step="1">
                <div class="qa-note-header"><div class="qa-note-handle"><span class="qa-note-step">1</span></div></div>
                <div class="qa-note-content" contenteditable="true" data-edit-id="note-01">Note 1</div>
              </div>
              <div class="qa-note-bubble" data-link="note-02" data-step="2">
                <div class="qa-note-header"><div class="qa-note-handle"><span class="qa-note-step">2</span></div></div>
                <div class="qa-note-content" contenteditable="true" data-edit-id="note-02">Note 2</div>
              </div>
            </div>
          </div>
        </div>
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
  window.requestAnimationFrame = (callback) => {
    callback();
    return 1;
  };
  window.cancelAnimationFrame = () => {};
  window.matchMedia = () => ({
    matches: false,
    media: '',
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return false; }
  });
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.MutationObserver = class { observe() {} disconnect() {} takeRecords() { return []; } };
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.HTMLElement.prototype.scrollIntoView = () => {};

  window.eval(runtimeSource);
  window.eval(quizRuntimeSource);

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
    assert.equal(host.classList.contains('step-active'), true, 'expected the first ArrowDown to move top-level focus onto the interactive host before executing its own steps');
    assert.equal(host.dataset.focusBubble, undefined, 'expected the focus-only landing step not to consume the host\'s first internal top-level step yet');
    assert.equal(window.document.querySelector('.slide.active')?.getAttribute('data-slide'), '1', 'expected the focus-only landing step not to flip the slide early');

    pressKey(window, 'ArrowDown');
    assert.equal(host.dataset.focusBubble, 'note-01', 'expected the second ArrowDown to activate the host\'s first internal top-level step after focus has landed');

    pressKey(window, 'ArrowDown');
    assert.equal(host.dataset.focusBubble, 'note-02', 'expected ArrowDown to continue top-level stepping inside the current slide');

    pressKey(window, 'ArrowDown');
    assert.equal(window.document.querySelector('.slide.active')?.getAttribute('data-slide'), '2', 'expected ArrowDown to flip to the next slide after top-level steps are exhausted');
  });

  it('keeps ArrowLeft and ArrowRight scoped to fragment stepping inside the focused item', () => {
    const { dom, host } = createSteppingDom();
    const { window } = dom;

    pressKey(window, 'ArrowDown');
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

  it('widens the standard Zone1 and ordinary-page Zone2 content rails to 1300px', () => {
    assert.match(zone1HeaderSource, /\.slide-header\s*\{[\s\S]*max-width:\s*1300px;/, 'expected the standard Zone1 header rail to widen to 1300px so it stays aligned with the wider ordinary-page content rail');
    assert.match(zone2ContentSource, /\.slide-content\s*\{[\s\S]*max-width:\s*1300px;/, 'expected the ordinary-page Zone2 base container to widen to 1300px so desktop side margins each shrink by about 100px');
  });

  it('gives passive ordinary component variants a visible base step-active focus style', () => {
    assert.match(zone2ContentSource, /\.highlight-card\.step-active[\s\S]*transform:\s*translateY\(-2px\)\s*scale\(1\.02\);/, 'expected highlight-card to share the same focus lift once it becomes the current top-level host');
    assert.match(zone2ContentSource, /\.stat-card\.step-active[\s\S]*transform:\s*translateY\(-2px\)\s*scale\(1\.02\);/, 'expected stat-card to expose the same visible focus lift as its hover state');
    assert.match(zone2ContentSource, /\.timeline-card\.step-active[\s\S]*transform:\s*translateY\(-2px\)\s*scale\(1\.02\);/, 'expected timeline-card to keep a visible step-active state instead of only reacting on hover');
    assert.match(zone2ContentSource, /\.code-window\.step-active[\s\S]*transform:\s*translateY\(-2px\);/, 'expected code-window to keep a visible top-level focus lift when keyboard stepping lands on it');
    assert.match(zone2ContentSource, /\.chart-container\.step-active[\s\S]*box-shadow:\s*0 12px 40px rgba\(0, 0, 0, 0\.3\);/, 'expected chart-container to expose a visible step-active shell instead of hover-only chrome');
    assert.match(zone2ContentSource, /\.table-wrap\.step-active[\s\S]*box-shadow:\s*0 12px 40px rgba\(0, 0, 0, 0\.3\);/, 'expected table-wrap to keep a visible focus shell when it becomes the active top-level host');
    assert.match(zone2ContentSource, /\.image-block\.step-active\s+\.slide-image[\s\S]*transform:\s*scale\(1\.01\);/, 'expected image-block to project its focus state onto the slide image itself so keyboard focus remains visible');
    assert.match(zone2ContentSource, /\.dual-bar\.step-active[\s\S]*box-shadow:/, 'expected dual-bar to expose its own visible focus shell instead of only letting the halves react on hover');
    assert.match(zone2ContentSource, /\.content-block\.step-active[\s\S]*(box-shadow:|background:|background-color:)/, 'expected content-block to keep a visible keyboard focus treatment because it also participates in the top-level queue');
  });

  it('extends the xindongfang-green focus halo to passive ordinary component hosts too', () => {
    assert.match(xindongfangThemeSource, /\.stat-card\.step-active[\s\S]*0 0 16px\s+6px rgba\(0, 163, 85, 0\.28\)/, 'expected xindongfang-green to give stat-card the same radial halo as other focused hosts');
    assert.match(xindongfangThemeSource, /\.chart-container\.step-active[\s\S]*0 0 16px\s+6px rgba\(0, 163, 85, 0\.28\)/, 'expected xindongfang-green to extend the same halo to chart-container when keyboard focus lands there');
    assert.match(xindongfangThemeSource, /\.table-wrap\.step-active[\s\S]*0 0 16px\s+6px rgba\(0, 163, 85, 0\.28\)/, 'expected xindongfang-green to extend the same halo to table-wrap too');
    assert.match(xindongfangThemeSource, /\.highlight-card\.step-active[\s\S]*0 0 16px\s+6px rgba\(0, 163, 85, 0\.28\)/, 'expected xindongfang-green to keep highlight-card visually in the focus system');
    assert.match(xindongfangThemeSource, /\.timeline-card\.step-active[\s\S]*0 0 16px\s+6px rgba\(0, 163, 85, 0\.28\)/, 'expected xindongfang-green to keep timeline-card visually in the focus system');
    assert.match(xindongfangThemeSource, /\.code-window\.step-active[\s\S]*0 0 16px\s+6px rgba\(0, 163, 85, 0\.28\)/, 'expected xindongfang-green to extend the same halo to code-window as well');
  });

  it('gives the summary trigger a dedicated step-active lift and green halo before the panel opens', () => {
    assert.match(zone3SummarySource, /\.summary-trigger\.step-active\s*\{[\s\S]*transform:\s*translateX\(-50%\)\s*translateY\(-3px\)\s*scale\(1\.02\);/, 'expected the summary trigger to gain its own top-level focus lift state before the summary panel opens');
    assert.match(xindongfangThemeSource, /\.summary-trigger\.step-active\s*\{[\s\S]*box-shadow:\s*[\s\S]*0 0 16px\s+6px rgba\(0, 163, 85, 0\.28\)[\s\S]*0 0 44px 16px rgba\(0, 163, 85, 0\.16\)[\s\S]*0 0 96px 32px rgba\(0, 163, 85, 0\.08\)\s*!important;/, 'expected the summary trigger focus state to reuse the same green radial halo as other steppable interactive hosts');
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

  it('switches the focused component when a steppable component is clicked, then scopes fragment stepping to that clicked component', () => {
    const { dom, hostA, hostB } = createClickFocusSyncDom();
    const { window } = dom;

    const firstSync = window.activateInteractionStepForElement(hostA);
    assert.equal(firstSync, true, 'expected the first steppable component to be manually focusable before testing click-based switching');
    assert.ok(hostA.classList.contains('step-active'), 'expected the first steppable component to start as the focused step host');

    clickElement(window, hostB.querySelector('.focus-card-b-inner'));
    pressKey(window, 'ArrowRight');

    assert.equal(hostA.dataset.visibleFragments, '', 'expected clicking another component to move fragment stepping away from the previously focused host');
    assert.equal(hostB.dataset.visibleFragments, 'frag-b-01', 'expected ArrowRight to step fragments inside the clicked component');
    assert.equal(hostA.classList.contains('step-active'), false, 'expected the previously focused component to lose step-active after clicking another steppable component');
    assert.equal(hostB.classList.contains('step-active'), true, 'expected the clicked component to become the current step-active focus host');
  });

  it('plays the focus-shift cue only when the focused top-level host changes via ArrowDown or click', () => {
    const { dom, hostA, hostB } = createClickFocusSyncDom();
    const { window } = dom;
    const calls = [];

    window.AudioRuntime = {
      playGlobalCue(name) {
        calls.push(name);
        return true;
      }
    };

    window.activateInteractionStepForElement(hostA);
    calls.length = 0;

    pressKey(window, 'ArrowDown');
    pressKey(window, 'ArrowRight');
    clickElement(window, hostA.querySelector('.focus-card-a-inner'));
    clickElement(window, hostA.querySelector('.focus-card-a-inner'));

    assert.deepEqual(calls, ['focus-shift', 'focus-shift'], 'expected only true host switches to emit pop.mp3, while fragment stepping and repeated clicks on the same host stay silent');
    assert.equal(hostA.classList.contains('step-active'), true, 'expected the last click-based host switch to move focus back onto hostA');
    assert.equal(hostB.classList.contains('step-active'), false, 'expected the previously focused host to lose step-active after the click-based focus switch');
  });

  it('plays the page-turn cue only when goTo actually changes slides', () => {
    const dom = createSlidesDom();
    const { window } = dom;
    const calls = [];

    window.AudioRuntime = {
      playGlobalCue(name) {
        calls.push(name);
        return true;
      }
    };

    pressKey(window, 'PageDown');
    pressKey(window, 'PageDown');
    clickElement(window, window.document.querySelector('.slide-pager-prev'));

    assert.deepEqual(calls, ['page-turn', 'page-turn'], 'expected actual slide transitions to emit turn_page.mp3 once per successful page change, while exhausted navigation stays silent');
  });

  it('plays the summary-open cue only when the summary component actually pops open', () => {
    const dom = createSummarySteppingDom();
    const { window } = dom;
    const calls = [];

    window.AudioRuntime = {
      playGlobalCue(name) {
        calls.push(name);
        return true;
      }
    };

    pressKey(window, 'ArrowDown');
    pressKey(window, 'ArrowDown');
    pressKey(window, 'ArrowDown');

    assert.deepEqual(calls, ['summary-open', 'page-turn'], 'expected summary popup to use cash_register.mp3 exactly when the summary panel opens, then fall back to the normal page-turn cue on the later slide transition');
    assert.ok(window.document.querySelector('.summary-panel').classList.contains('visible'), 'expected the second ArrowDown to open the summary panel before the later page turn');
  });

  it('plays summary-open before ArrowDown makes the summary panel visible', () => {
    const dom = createSummarySteppingDom();
    const { window } = dom;
    const summaryPanel = window.document.querySelector('.summary-panel');
    const calls = [];

    window.AudioRuntime = {
      playGlobalCue(name) {
        calls.push({ name, visibleAtCueTime: summaryPanel.classList.contains('visible') });
        return true;
      }
    };

    pressKey(window, 'ArrowDown');
    pressKey(window, 'ArrowDown');

    assert.deepEqual(calls, [{ name: 'summary-open', visibleAtCueTime: false }], 'expected ArrowDown to fire cash_register before the summary panel is visually shown');
    assert.ok(summaryPanel.classList.contains('visible'), 'expected the summary panel to become visible after the cue has been emitted');
  });

  it('plays only summary-open when ArrowDown opens an already focused summary component', () => {
    const dom = createSummarySteppingDom();
    const { window } = dom;
    const calls = [];

    window.AudioRuntime = {
      playGlobalCue(name) {
        calls.push(name);
        return true;
      }
    };

    pressKey(window, 'ArrowDown');
    calls.length = 0;

    pressKey(window, 'ArrowDown');

    assert.deepEqual(calls, ['summary-open'], 'expected the open step on an already focused summary host to emit only the dedicated cash_register cue');
    assert.ok(window.document.querySelector('.summary-panel').classList.contains('visible'), 'expected the second ArrowDown to open the summary panel after the earlier focus-only step');
  });

  it('plays the summary-open cue when clicking the summary trigger to open the panel', () => {
    const dom = createSummarySteppingDom();
    const { window } = dom;
    const calls = [];

    window.AudioRuntime = {
      playGlobalCue(name) {
        calls.push(name);
        return true;
      }
    };

    clickElement(window, window.document.querySelector('.summary-trigger'));

    assert.deepEqual(calls, ['summary-open'], 'expected mouse-opening the summary component to play only the dedicated cash_register cue');
    assert.ok(window.document.querySelector('.summary-panel').classList.contains('visible'), 'expected clicking the summary trigger to open the summary panel');
  });

  it('plays summary-open before a mouse click makes the summary panel visible', () => {
    const dom = createSummarySteppingDom();
    const { window } = dom;
    const summaryPanel = window.document.querySelector('.summary-panel');
    const calls = [];

    window.AudioRuntime = {
      playGlobalCue(name) {
        calls.push({ name, visibleAtCueTime: summaryPanel.classList.contains('visible') });
        return true;
      }
    };

    clickElement(window, window.document.querySelector('.summary-trigger'));

    assert.deepEqual(calls, [{ name: 'summary-open', visibleAtCueTime: false }], 'expected mouse-opening summary to emit cash_register before the panel becomes visible');
    assert.ok(summaryPanel.classList.contains('visible'), 'expected the summary panel to become visible after the click cue fires');
  });

  it('moves focus across ordinary component roots before triggering flip-card interaction', () => {
    const { dom, ordinaryCard, interactiveCard } = createOrdinaryComponentQueueDom();
    const { window } = dom;

    /* 这个夹具故意把“纯展示组件”和“带按钮的互动组件”放在同一条一级队列里，
       用来锁定新合同：ArrowDown 先走组件根焦点，再在后续一步里执行互动。 */
    pressKey(window, 'ArrowDown');

    assert.equal(ordinaryCard.classList.contains('step-active'), true, 'expected the first ArrowDown to focus the passive ordinary component root');
    assert.equal(interactiveCard.classList.contains('step-active'), false, 'expected the interactive component to stay unfocused until the next top-level step');
    assert.equal(interactiveCard.classList.contains('flipped'), false, 'expected focusing the passive component not to pre-trigger the later flip-card interaction');

    pressKey(window, 'ArrowDown');

    assert.equal(ordinaryCard.classList.contains('step-active'), false, 'expected the passive component to relinquish focus when ArrowDown moves to the next component root');
    assert.equal(interactiveCard.classList.contains('step-active'), true, 'expected the second ArrowDown to move focus onto the flip-card root');
    assert.equal(interactiveCard.classList.contains('flipped'), false, 'expected the first focus step onto the flip-card to stay in focus-only state');

    pressKey(window, 'ArrowDown');

    assert.equal(interactiveCard.classList.contains('flipped'), true, 'expected the later ArrowDown to execute the flip-card interaction only after focus is already on that component');
  });

  it('lets a mouse click move focus onto a passive ordinary component root', () => {
    const { dom, ordinaryCard, interactiveCard } = createOrdinaryComponentQueueDom();
    const { window } = dom;

    /* 这里专门覆盖“普通组件也可用左键切焦点”的合同。
       先用键盘把焦点移到互动组件，再点击纯展示卡片，
       这样可以明确证明点击命中 passive root 时也会回写一级焦点。 */
    pressKey(window, 'ArrowDown');
    pressKey(window, 'ArrowDown');

    assert.equal(interactiveCard.classList.contains('step-active'), true, 'expected the keyboard path to place focus on the interactive component before the click handoff');

    clickElement(window, ordinaryCard.querySelector('.card-title'));

    assert.equal(ordinaryCard.classList.contains('step-active'), true, 'expected clicking inside the passive ordinary component to move top-level focus onto its root');
    assert.equal(interactiveCard.classList.contains('step-active'), false, 'expected the previously focused interactive component to lose top-level focus after the passive click');
  });

  it('keeps all passive ordinary component variants in the top-level focus queue by DOM order', () => {
    const { dom, roots } = createPassiveComponentAuditDom();
    const { window } = dom;

    roots.forEach(({ label, element }, index) => {
      pressKey(window, 'ArrowDown');

      roots.forEach(({ label: currentLabel, element: currentElement }, currentIndex) => {
        assert.equal(
          currentElement.classList.contains('step-active'),
          currentIndex === index,
          `expected ${label} focus turn ${index + 1} to leave only ${currentLabel} as the visible top-level host`
        );
      });
    });
  });

  it('plays pop only when focus lands on an interactive component root', () => {
    const { dom } = createOrdinaryComponentQueueDom();
    const { window } = dom;
    const calls = [];

    window.AudioRuntime = {
      playGlobalCue(name) {
        calls.push(name);
        return true;
      }
    };

    /* 这个合同把 pop 的语义从“所有一级焦点切换”收紧成“提醒当前组件可互动”。
       因此 passive 组件的落焦与回焦都应保持静音，只有落到 interactive root 时才发 pop。 */
    pressKey(window, 'ArrowDown');
    pressKey(window, 'ArrowDown');
    pressKey(window, 'ArrowUp');

    assert.deepEqual(calls, ['focus-shift'], 'expected pop.mp3 to fire only when focus lands on the interactive component, while passive focus transitions stay silent');
  });

  it('plays the dedicated flip cue only when ArrowDown executes the flip-card forward action', () => {
    const { dom, interactiveCard } = createOrdinaryComponentQueueDom();
    const { window } = dom;
    const calls = [];

    window.AudioRuntime = {
      playGlobalCue(name) {
        calls.push(name);
        return true;
      }
    };

    /* 这条合同专门区分“落焦提示”和“正向互动音”：
       - 第一次落到 flip-card 时只播 pop；
       - 真正执行翻转的那一步才播 flip-forward；
       - 两者不能合并成同一声。 */
    pressKey(window, 'ArrowDown');
    pressKey(window, 'ArrowDown');
    pressKey(window, 'ArrowDown');

    assert.deepEqual(calls, ['focus-shift', 'flip-forward'], 'expected ArrowDown to emit pop on interactive focus and flip-forward only on the later flip action step');
    assert.equal(interactiveCard.classList.contains('flipped'), true, 'expected the third ArrowDown to actually flip the card after the earlier focus-only step');
  });

  it('uses a silent two-step ArrowUp path for flip-card rollback before leaving focus', () => {
    const { dom, ordinaryCard, interactiveCard } = createOrdinaryComponentQueueDom();
    const { window } = dom;
    const calls = [];

    window.AudioRuntime = {
      playGlobalCue(name) {
        calls.push(name);
        return true;
      }
    };

    pressKey(window, 'ArrowDown');
    pressKey(window, 'ArrowDown');
    pressKey(window, 'ArrowDown');
    calls.length = 0;

    /* 反向语义按已确认的合同走对称两步：
       第一次 ArrowUp 只撤销翻转且保持焦点；
       第二次 ArrowUp 才离开当前组件，而且 reverse 全程静音。 */
    pressKey(window, 'ArrowUp');

    assert.equal(interactiveCard.classList.contains('flipped'), false, 'expected the first ArrowUp to roll back the flip state');
    assert.equal(interactiveCard.classList.contains('step-active'), true, 'expected the first ArrowUp to keep top-level focus on the current flip-card after rollback');
    assert.equal(ordinaryCard.classList.contains('step-active'), false, 'expected the previous passive component to stay unfocused until the second ArrowUp');
    assert.deepEqual(calls, [], 'expected reverse rollback to stay silent instead of replaying pop or flip audio');

    pressKey(window, 'ArrowUp');

    assert.equal(interactiveCard.classList.contains('step-active'), false, 'expected the second ArrowUp to finally leave the flip-card focus');
    assert.equal(ordinaryCard.classList.contains('step-active'), true, 'expected the second ArrowUp to move focus back to the previous passive component');
    assert.deepEqual(calls, [], 'expected the backward focus handoff to remain silent when it lands on a passive component');
  });

  it('plays the dedicated drawer cue only when ArrowDown executes the collapse-card expand action', () => {
    const { dom, interactiveCard } = createCollapseComponentQueueDom();
    const { window } = dom;
    const calls = [];

    window.AudioRuntime = {
      playGlobalCue(name) {
        calls.push(name);
        return true;
      }
    };

    pressKey(window, 'ArrowDown');
    pressKey(window, 'ArrowDown');
    pressKey(window, 'ArrowDown');

    assert.deepEqual(calls, ['focus-shift', 'collapse-expand'], 'expected ArrowDown to emit pop on collapse-card focus and collapse-expand only on the later expand action step');
    assert.equal(interactiveCard.classList.contains('expanded'), true, 'expected the third ArrowDown to expand the collapse-card after the earlier focus-only step');
  });

  it('lets clicking the flip action button focus and interact immediately without a pop cue', () => {
    const { dom, interactiveCard } = createOrdinaryComponentQueueDom();
    const { window } = dom;
    const calls = [];

    window.AudioRuntime = {
      playGlobalCue(name) {
        calls.push(name);
        return true;
      }
    };

    clickElement(window, interactiveCard.querySelector('.flip-action-btn'));

    assert.equal(interactiveCard.classList.contains('step-active'), true, 'expected clicking the flip button to move top-level focus onto the flip-card root');
    assert.equal(interactiveCard.classList.contains('flipped'), true, 'expected clicking the flip button to execute the flip interaction immediately even when the card was previously unfocused');
    assert.deepEqual(calls, ['flip-forward'], 'expected direct button interaction to skip pop and play only the dedicated flip-forward cue');
  });

  it('lets clicking the collapse action button focus and expand immediately without a pop cue', () => {
    const { dom, interactiveCard } = createCollapseComponentQueueDom();
    const { window } = dom;
    const calls = [];

    window.AudioRuntime = {
      playGlobalCue(name) {
        calls.push(name);
        return true;
      }
    };

    clickElement(window, interactiveCard.querySelector('.collapse-action-btn'));

    assert.equal(interactiveCard.classList.contains('step-active'), true, 'expected clicking the collapse button to move top-level focus onto the collapse-card root');
    assert.equal(interactiveCard.classList.contains('expanded'), true, 'expected clicking the collapse button to execute the expand interaction immediately even when the card was previously unfocused');
    assert.deepEqual(calls, ['collapse-expand'], 'expected direct collapse button interaction to skip pop and play only the dedicated drawer cue');
  });

  it('exposes a focused queue refresh hook for modules that auto-tag steppables after slides-runtime has already initialized', () => {
    const dom = createLateSteppableDom();
    const { window } = dom;
    const activeSlide = window.document.querySelector('.slide.active');
    const lateRoot = window.document.createElement('div');
    let stepped = false;

    lateRoot.className = 'late-root';
    lateRoot.setAttribute('data-steppable', 'late-test');
    activeSlide.appendChild(lateRoot);

    window.registerStepStrategy('late-test', {
      canStepTopLevelForward() {
        return !stepped;
      },
      canStepTopLevelBackward() {
        return stepped;
      },
      forwardTopLevel() {
        if (stepped) return false;
        stepped = true;
        lateRoot.dataset.focused = 'true';
        return true;
      },
      backwardTopLevel() {
        if (!stepped) return false;
        stepped = false;
        delete lateRoot.dataset.focused;
        return true;
      }
    });

    assert.equal(typeof window.refreshInteractionQueueForCurrentSlide, 'function', 'expected slides runtime to expose a focused queue refresh hook for late steppable tagging');

    window.refreshInteractionQueueForCurrentSlide();
    pressKey(window, 'ArrowDown');
    assert.equal(lateRoot.classList.contains('step-active'), true, 'expected the first ArrowDown after refresh to focus the newly tagged host before it executes its own forward step');

    pressKey(window, 'ArrowDown');

    assert.equal(lateRoot.dataset.focused, 'true', 'expected a freshly tagged steppable to enter the current slide interaction queue after an explicit refresh');
  });

  it('keeps revealed quiz fragments visible when ArrowDown moves focus to the next bubble', () => {
    const dom = createQuizFragmentPersistenceDom();
    const { window } = dom;
    const fragment = window.document.querySelector('.text-anchor[data-link="note-01"] [data-fragment-step="true"]');

    pressKey(window, 'ArrowDown');
    pressKey(window, 'ArrowRight');
    assert.ok(fragment.classList.contains('qa-fragment-visible'), 'expected ArrowRight to reveal the current bubble fragment before switching focus');

    pressKey(window, 'ArrowDown');

    assert.ok(fragment.classList.contains('qa-fragment-visible'), 'expected ArrowDown focus changes not to clear previously revealed fragment state');
  });

  it('plays the quiz-annotation fragment step cue when ArrowLeft or ArrowRight reveals or hides a fragment', () => {
    const dom = createQuizFragmentPersistenceDom();
    const { window } = dom;
    const calls = [];

    window.QuizAnnotationAudio = {
      playFragmentStep(payload) {
        calls.push(payload?.direction || 'unknown');
      }
    };

    pressKey(window, 'ArrowDown');
    pressKey(window, 'ArrowRight');
    pressKey(window, 'ArrowLeft');

    assert.deepEqual(calls, ['forward', 'backward'], 'expected fragment stepping to emit component-level swoosh cues for both reveal and hide');
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