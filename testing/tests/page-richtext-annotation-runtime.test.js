import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..', '..');
const slidesRuntimePath = path.join(projectRoot, 'assets', 'slides-runtime.js');
const pageRuntimePath = path.join(projectRoot, 'assets', 'page-richtext-annotation-runtime.js');
const fragmentCssPath = path.join(projectRoot, 'assets', 'zones', 'zone2-quiz-annotation.css');

const slidesRuntimeSource = fs.readFileSync(slidesRuntimePath, 'utf-8');
const pageRuntimeSource = fs.existsSync(pageRuntimePath)
  ? fs.readFileSync(pageRuntimePath, 'utf-8')
  : '';
const fragmentCssSource = fs.readFileSync(fragmentCssPath, 'utf-8');

function pressKey(window, key) {
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
}

function rightClickElement(window, element) {
  element.dispatchEvent(new window.MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    button: 2,
  }));
}

function createRuntimeDom(slideMarkup) {
  const html = `<!DOCTYPE html><html><body>
    <div id="particles"></div>
    <div id="progress"></div>
    <div id="counter"></div>
    <div id="slideNav"></div>
    <div class="deck">
      ${slideMarkup}
    </div>
  </body></html>`;

  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'http://localhost/'
  });

  const { window } = dom;
  window.console.log = () => {};
  window.console.warn = () => {};
  window.setTimeout = (callback) => {
    callback();
    return 1;
  };
  window.clearTimeout = () => {};

  window.eval(slidesRuntimeSource);
  if (pageRuntimeSource) {
    window.eval(pageRuntimeSource);
  }

  return dom;
}

function createQuizFreePageDom() {
  return createRuntimeDom(`
    <div class="slide active" data-slide="1">
      <div class="header-title" data-edit-id="title-root">
        Intro <span class="page-fragment page-fragment-single" data-fragment-step="true">first</span> fragment.
      </div>
      <div class="card-desc" data-edit-id="desc-root">
        Then
        <span class="page-fragment page-fragment-group-outer" data-fragment-step="true" data-fragment-group="frag-02" data-fragment-format="highlight" style="background-color: rgba(255, 208, 0, 0.45);">
          grouped <span class="page-fragment page-fragment-group-inner" data-fragment-step="true" data-fragment-group="frag-02" data-fragment-format="ruby"><ruby>fragment<rt>组</rt></ruby></span>
        </span>
        appears.
      </div>
    </div>
    <div class="slide" data-slide="2">
      <div class="header-title">Slide 2</div>
    </div>
  `);
}

function createQuizLockedPageDom() {
  return createRuntimeDom(`
    <div class="slide active" data-slide="1">
      <div class="header-title" data-edit-id="title-root">
        Intro <span class="page-fragment page-fragment-single" data-fragment-step="true">first</span> fragment.
      </div>
      <div class="quiz-annotation">
        <div class="qa-note-bubble">Quiz host</div>
      </div>
    </div>
    <div class="slide" data-slide="2">
      <div class="header-title">Slide 2</div>
    </div>
  `);
}

describe('page richtext annotation runtime', () => {
  it('reveals and rolls back ordinary page fragments in DOM order with ArrowRight and ArrowLeft', () => {
    const dom = createQuizFreePageDom();
    const { window } = dom;
    const activeSlide = window.document.querySelector('.slide.active');
    const firstFragment = window.document.querySelector('.page-fragment-single');
    const groupedFragments = window.document.querySelectorAll('[data-fragment-group="frag-02"]');

    assert.ok(activeSlide.classList.contains('page-richtext-fragment-host'), 'expected quiz-free slides with ordinary fragments to opt into the ordinary fragment CSS contract');

    pressKey(window, 'ArrowRight');
    assert.ok(firstFragment.classList.contains('qa-fragment-visible'), 'expected the first DOM fragment to be revealed on quiz-free slides');
    assert.equal(Array.from(groupedFragments).some((fragment) => fragment.classList.contains('qa-fragment-visible')), false, 'expected later fragment groups to stay hidden until their DOM turn arrives');

    pressKey(window, 'ArrowRight');
    assert.equal(Array.from(groupedFragments).filter((fragment) => fragment.classList.contains('qa-fragment-visible')).length, 2, 'expected one more ArrowRight to reveal every layer in the next fragment group together');

    pressKey(window, 'ArrowLeft');
    assert.equal(Array.from(groupedFragments).some((fragment) => fragment.classList.contains('qa-fragment-visible')), false, 'expected ArrowLeft to roll back the latest revealed fragment group first');
    assert.ok(firstFragment.classList.contains('qa-fragment-visible'), 'expected earlier DOM fragments to remain visible until their own rollback turn arrives');

    pressKey(window, 'ArrowLeft');
    assert.equal(firstFragment.classList.contains('qa-fragment-visible'), false, 'expected the earliest fragment to roll back last');
  });

  it('reveals a single fragment or its whole fragment group immediately on right click for quiz-free slides', () => {
    const dom = createQuizFreePageDom();
    const { window } = dom;
    const firstFragment = window.document.querySelector('.page-fragment-single');
    const ruby = window.document.querySelector('ruby');
    const groupedFragments = window.document.querySelectorAll('[data-fragment-group="frag-02"]');

    rightClickElement(window, firstFragment);
    assert.ok(firstFragment.classList.contains('qa-fragment-visible'), 'expected an ungrouped fragment to reveal immediately on right click');

    rightClickElement(window, ruby);
    assert.equal(Array.from(groupedFragments).filter((fragment) => fragment.classList.contains('qa-fragment-visible')).length, 2, 'expected right click inside a grouped fragment to reveal every authored layer in that group');
  });

  it('disables ordinary page stepping and right-click reveal on slides that contain quiz-annotation', () => {
    const dom = createQuizLockedPageDom();
    const { window } = dom;
    const activeSlide = window.document.querySelector('.slide.active');
    const firstFragment = window.document.querySelector('.page-fragment-single');

    assert.equal(activeSlide.classList.contains('page-richtext-fragment-host'), false, 'expected mixed / quiz slides not to opt into the ordinary fragment CSS contract');

    pressKey(window, 'ArrowRight');
    assert.equal(firstFragment.classList.contains('qa-fragment-visible'), false, 'expected quiz slides to block ArrowRight fallback into the ordinary page fragment host');

    rightClickElement(window, firstFragment);
    assert.equal(firstFragment.classList.contains('qa-fragment-visible'), false, 'expected quiz slides to block ordinary page right-click reveal as well');
  });

  it('clears cached reveal state and rebuilds fragment order after refreshSlide', () => {
    const dom = createQuizFreePageDom();
    const { window } = dom;
    const runtime = window.PageRichTextAnnotationRuntime;
    const activeSlide = window.document.querySelector('.slide.active');
    const titleRoot = window.document.querySelector('[data-edit-id="title-root"]');
    const descRoot = window.document.querySelector('[data-edit-id="desc-root"]');

    assert.equal(typeof runtime?.refreshSlide, 'function', 'expected the ordinary page runtime to expose a refreshSlide API so authoring-side DOM rewrites can reset cached reveal state');

    pressKey(window, 'ArrowRight');
    assert.ok(window.document.querySelector('.page-fragment-single').classList.contains('qa-fragment-visible'), 'expected the first fragment to be visible before mutating authored DOM');

    titleRoot.innerHTML = 'Intro revised.';
    descRoot.innerHTML = 'Now <span class="page-fragment replacement-first" data-fragment-step="true">replacement</span> appears before <span class="page-fragment replacement-second" data-fragment-step="true">follow-up</span>.';

    runtime.refreshSlide(activeSlide);

    assert.equal(activeSlide.querySelectorAll('.qa-fragment-visible').length, 0, 'expected refreshSlide to clear stale reveal classes so the old visible index cannot leak into the new fragment order');

    pressKey(window, 'ArrowRight');
    assert.ok(activeSlide.querySelector('.replacement-first').classList.contains('qa-fragment-visible'), 'expected refreshSlide to rebuild the fragment queue from the rewritten authored DOM before the next reveal step');
    assert.equal(activeSlide.querySelector('.replacement-second').classList.contains('qa-fragment-visible'), false, 'expected only the new first fragment to reveal after refreshSlide resets the queue');
  });

  it('refreshes the page-richtext-fragment-host class when the first fragment is added and the last fragment is removed', () => {
    const dom = createRuntimeDom(`
      <div class="slide active" data-slide="1">
        <div class="header-title" data-edit-id="title-root">Plain text only.</div>
      </div>
      <div class="slide" data-slide="2">
        <div class="header-title">Slide 2</div>
      </div>
    `);
    const { window } = dom;
    const runtime = window.PageRichTextAnnotationRuntime;
    const activeSlide = window.document.querySelector('.slide.active');
    const titleRoot = window.document.querySelector('[data-edit-id="title-root"]');

    assert.equal(typeof runtime?.refreshSlide, 'function', 'expected the ordinary page runtime to expose a refreshSlide API so authoring can resync host eligibility after DOM edits');
    assert.equal(activeSlide.classList.contains('page-richtext-fragment-host'), false, 'expected slides without fragments to stay out of the ordinary fragment host contract');

    titleRoot.innerHTML = 'Plain <span class="page-fragment first-added" data-fragment-step="true">first</span> text.';
    runtime.refreshSlide(activeSlide);
    assert.ok(activeSlide.classList.contains('page-richtext-fragment-host'), 'expected refreshSlide to opt the slide into the ordinary fragment host contract once authoring adds the first fragment group');

    titleRoot.textContent = 'Plain first text.';
    runtime.refreshSlide(activeSlide);
    assert.equal(activeSlide.classList.contains('page-richtext-fragment-host'), false, 'expected refreshSlide to remove the ordinary fragment host contract once the last fragment group is cleared');
  });

  it('shares the fragment hide and reveal CSS contract with ordinary data-edit-id roots', () => {
    assert.match(fragmentCssSource, /\.page-richtext-fragment-host\s+\[data-edit-id\]\s+\[data-fragment-step="true"\][\s\S]*color:\s*inherit\s*!important;/, 'expected ordinary page fragments to opt into the hidden baseline through a dedicated slide class instead of a global bare [data-edit-id] selector');
    assert.match(fragmentCssSource, /\.page-richtext-fragment-host\s+\[data-edit-id\]\s+\[data-fragment-step="true"\]\.qa-fragment-visible\[data-fragment-format="highlight"\][\s\S]*background-color:\s*var\(--qa-fragment-highlight, transparent\)\s*!important;/, 'expected ordinary page reveal to restore authored highlight formatting once the runtime marks a fragment visible');
  });
});