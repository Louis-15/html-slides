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

function movePointer(window, target, options = {}) {
  target.dispatchEvent(new window.MouseEvent('pointermove', {
    bubbles: true,
    cancelable: true,
    clientX: options.clientX ?? 48,
    clientY: options.clientY ?? 24,
  }));
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

function createCollapseCardOrdinaryPageDom() {
  return createRuntimeDom(`
    <div class="slide active" data-slide="1">
      <div class="collapse-card">
        <div class="card-title" data-edit-id="collapse-title-root">
          Rule <span class="page-fragment collapse-fragment-one" data-fragment-step="true">first</span> step.
        </div>
        <div class="card-desc" data-edit-id="collapse-desc-root">
          Lead-in text.
        </div>
        <div class="card-expand">
          <div class="card-expand-inner" data-edit-id="collapse-expand-root">
            Expanded <span class="page-fragment collapse-fragment-two" data-fragment-step="true">second</span> step.
          </div>
        </div>
      </div>
    </div>
    <div class="slide" data-slide="2">
      <div class="header-title">Slide 2</div>
    </div>
  `);
}

function createSummaryOrdinaryPageDom() {
  // zone3 summary 的真实结构里，summary-trigger 与 summary-panel 是同一 slide 下的兄弟节点，
  // 不是祖先链关系；回归用例必须保留这个 sibling 关系，才能锁住本次宿主归属 bug。
  return createRuntimeDom(`
    <div class="slide active" data-slide="1">
      <div class="slide-content layout-single">
        <div class="content-block">Lead-in content.</div>
      </div>
      <button class="summary-trigger">Summary</button>
      <div class="summary-panel">
        <div class="summary-content">
          <ul>
            <li data-edit-id="summary-root">
              Key point <span class="page-fragment summary-fragment-one" data-fragment-step="true">first</span> cue.
            </li>
          </ul>
        </div>
      </div>
    </div>
    <div class="slide" data-slide="2">
      <div class="header-title">Slide 2</div>
    </div>
  `);
}

function createCardHostOrdinaryPageDom() {
  return createRuntimeDom(`
    <div class="slide active" data-slide="1">
      <div class="layout-2col">
        <div class="card card-left">
          <div class="card-title" data-edit-id="card-left-title-root">
            Left title <span class="page-fragment card-left-fragment" data-fragment-step="true">first</span> cue.
          </div>
          <div class="card-desc" data-edit-id="card-left-desc-root">
            Left desc <span class="page-fragment card-left-desc-fragment" data-fragment-step="true">second</span> cue.
          </div>
        </div>
        <div class="card card-right">
          <div class="card-title" data-edit-id="card-right-title-root">
            Right title <span class="page-fragment card-right-fragment" data-fragment-step="true">first</span> cue.
          </div>
          <div class="card-desc" data-edit-id="card-right-desc-root">
            Right desc <span class="page-fragment card-right-desc-fragment" data-fragment-step="true">second</span> cue.
          </div>
        </div>
      </div>
    </div>
    <div class="slide" data-slide="2">
      <div class="header-title">Slide 2</div>
    </div>
  `);
}

function createRootHoverOrdinaryPageDom() {
  return createRuntimeDom(`
    <div class="slide active" data-slide="1">
      <div class="card-desc hover-root" data-edit-id="hover-root">
        Prefix text.
        <span class="page-fragment hover-fragment-one" data-fragment-step="true">first</span>
        <span class="hover-gap">gap area</span>
        <span class="page-fragment hover-fragment-two" data-fragment-step="true">second</span>
        suffix.
      </div>
    </div>
    <div class="slide" data-slide="2">
      <div class="header-title">Slide 2</div>
    </div>
  `);
}

function createDoodleOrdinaryPageDom() {
  return createRuntimeDom(`
    <div class="slide active" data-slide="1">
      <svg class="doodle-layer" aria-hidden="true"></svg>
      <div class="header-title" data-edit-id="title-root">
        Intro <span class="page-fragment page-fragment-single" data-fragment-step="true">first</span> fragment.
      </div>
      <div class="card-desc" data-edit-id="desc-root">
        Then <span class="page-fragment page-fragment-second" data-fragment-step="true">second</span> fragment.
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

function createExampleCardFragmentDom(questionMarkup) {
  return createRuntimeDom(`
    <div class="slide active" data-slide="1">
      <section class="example-card">
        ${questionMarkup}
      </section>
    </div>
    <div class="slide" data-slide="2">
      <div class="header-title">Slide 2</div>
    </div>
  `);
}

describe('page richtext annotation runtime', () => {
  it('uses ArrowDown to focus ordinary roots first, then keeps ArrowRight and ArrowLeft scoped to the focused root fragments', () => {
    const dom = createQuizFreePageDom();
    const { window } = dom;
    const activeSlide = window.document.querySelector('.slide.active');
    const titleRoot = window.document.querySelector('[data-edit-id="title-root"]');
    const descRoot = window.document.querySelector('[data-edit-id="desc-root"]');
    const firstFragment = window.document.querySelector('.page-fragment-single');
    const groupedFragments = window.document.querySelectorAll('[data-fragment-group="frag-02"]');

    assert.ok(activeSlide.classList.contains('page-richtext-fragment-host'), 'expected quiz-free slides with ordinary fragments to opt into the ordinary fragment CSS contract');
    assert.equal(titleRoot.classList.contains('step-active'), false, 'expected ordinary roots not to start focused before ArrowDown enters the page-level queue');

    pressKey(window, 'ArrowDown');
    assert.ok(titleRoot.classList.contains('step-active'), 'expected ArrowDown to focus the first owning ordinary root before any fragment reveal runs');
    assert.equal(descRoot.classList.contains('step-active'), false, 'expected only one ordinary root to hold the top-level focus at a time');

    pressKey(window, 'ArrowRight');
    assert.ok(firstFragment.classList.contains('qa-fragment-visible'), 'expected the first DOM fragment to be revealed on quiz-free slides');
    assert.equal(Array.from(groupedFragments).some((fragment) => fragment.classList.contains('qa-fragment-visible')), false, 'expected later fragment groups to stay hidden until their DOM turn arrives');

    pressKey(window, 'ArrowDown');
    assert.ok(descRoot.classList.contains('step-active'), 'expected ArrowDown to move the top-level focus to the next owning ordinary root once the current root has no top-level interaction of its own');
    assert.equal(titleRoot.classList.contains('step-active'), false, 'expected the previous ordinary root to lose the visible top-level focus when the next root becomes active');
    assert.ok(firstFragment.classList.contains('qa-fragment-visible'), 'expected moving focus to another root not to clear already revealed fragments from the previous root');

    pressKey(window, 'ArrowRight');
    assert.equal(Array.from(groupedFragments).filter((fragment) => fragment.classList.contains('qa-fragment-visible')).length, 2, 'expected one more ArrowRight to reveal every layer in the next fragment group together');
    assert.ok(firstFragment.classList.contains('qa-fragment-visible'), 'expected the first root to keep its previously revealed fragment visible while the second root reveals its own fragment group');

    pressKey(window, 'ArrowLeft');
    assert.equal(Array.from(groupedFragments).some((fragment) => fragment.classList.contains('qa-fragment-visible')), false, 'expected ArrowLeft to roll back the latest revealed fragment group first');
    assert.ok(firstFragment.classList.contains('qa-fragment-visible'), 'expected earlier DOM fragments to remain visible until their own rollback turn arrives');

    pressKey(window, 'ArrowUp');
    assert.ok(titleRoot.classList.contains('step-active'), 'expected ArrowUp to move the top-level focus back to the previous ordinary root');
    assert.equal(descRoot.classList.contains('step-active'), false, 'expected ArrowUp to remove focus from the later ordinary root');

    pressKey(window, 'ArrowLeft');
    assert.equal(firstFragment.classList.contains('qa-fragment-visible'), false, 'expected the earliest fragment to roll back last');
  });

  it('lets an existing collapse-card host own ordinary fragments so ArrowRight works immediately after the first ArrowDown enters the component', () => {
    const dom = createCollapseCardOrdinaryPageDom();
    const { window } = dom;
    const collapseCard = window.document.querySelector('.collapse-card');
    const titleRoot = window.document.querySelector('[data-edit-id="collapse-title-root"]');
    const expandRoot = window.document.querySelector('[data-edit-id="collapse-expand-root"]');
    const firstFragment = window.document.querySelector('.collapse-fragment-one');
    const secondFragment = window.document.querySelector('.collapse-fragment-two');

    pressKey(window, 'ArrowDown');
    assert.ok(collapseCard.classList.contains('step-active'), 'expected the first ArrowDown to enter the existing collapse-card host, not an internal ordinary text root');
    assert.equal(titleRoot.classList.contains('step-active'), false, 'expected the collapse-card title root not to become a second top-level focus item');
    assert.equal(expandRoot.classList.contains('step-active'), false, 'expected the collapse-card expanded text root not to require an extra ArrowDown before fragment stepping');

    pressKey(window, 'ArrowRight');
    assert.ok(firstFragment.classList.contains('qa-fragment-visible'), 'expected ArrowRight to reveal the collapse-card ordinary fragment as soon as the component itself is focused');
    assert.equal(secondFragment.classList.contains('qa-fragment-visible'), false, 'expected later collapse-card fragments to remain hidden until their own ArrowRight turn');
  });

  it('uses the zone3 summary-trigger as the owning host for summary-panel ordinary fragments', () => {
    const dom = createSummaryOrdinaryPageDom();
    const { window } = dom;
    const firstSlide = window.document.querySelector('.slide[data-slide="1"]');
    const secondSlide = window.document.querySelector('.slide[data-slide="2"]');
    const leadInBlock = window.document.querySelector('.content-block');
    const summaryTrigger = window.document.querySelector('.summary-trigger');
    const summaryPanel = window.document.querySelector('.summary-panel');
    const summaryRoot = window.document.querySelector('[data-edit-id="summary-root"]');
    const firstFragment = window.document.querySelector('.summary-fragment-one');

    pressKey(window, 'ArrowDown');
    assert.ok(leadInBlock.classList.contains('step-active'), 'expected the lead-in content block to remain the first ordinary top-level focus item by DOM order');

    pressKey(window, 'ArrowDown');
    assert.ok(summaryTrigger.classList.contains('step-active'), 'expected the next ArrowDown to move focus onto the summary-trigger top-level host');
    assert.equal(summaryRoot.classList.contains('step-active'), false, 'expected the summary-panel ordinary root not to become its own top-level step item');
    assert.equal(summaryPanel.classList.contains('visible'), false, 'expected the focus step onto summary-trigger not to open the summary panel yet');

    pressKey(window, 'ArrowDown');
    assert.ok(summaryPanel.classList.contains('visible'), 'expected the following ArrowDown to open the summary panel after summary-trigger is already focused');

    pressKey(window, 'ArrowRight');
    assert.ok(firstFragment.classList.contains('qa-fragment-visible'), 'expected ArrowRight to reveal the summary-panel ordinary fragment after the summary trigger has already opened the panel');

    pressKey(window, 'ArrowDown');
    assert.ok(secondSlide.classList.contains('active'), 'expected the next ArrowDown to flip to the next slide once the summary top-level step is exhausted');
    assert.equal(firstSlide.classList.contains('active'), false, 'expected the current slide not to consume ArrowDown with an erroneous standalone summary text root');
  });

  it('uses card shells as the top-level ordinary fragment hosts instead of each internal text root', () => {
    const dom = createCardHostOrdinaryPageDom();
    const { window } = dom;
    const leftCard = window.document.querySelector('.card-left');
    const rightCard = window.document.querySelector('.card-right');
    const leftTitleRoot = window.document.querySelector('[data-edit-id="card-left-title-root"]');
    const leftDescRoot = window.document.querySelector('[data-edit-id="card-left-desc-root"]');
    const rightTitleRoot = window.document.querySelector('[data-edit-id="card-right-title-root"]');
    const rightDescRoot = window.document.querySelector('[data-edit-id="card-right-desc-root"]');
    const leftFragments = window.document.querySelectorAll('.card-left [data-fragment-step="true"]');
    const rightFragments = window.document.querySelectorAll('.card-right [data-fragment-step="true"]');

    pressKey(window, 'ArrowDown');
    assert.ok(leftCard.classList.contains('step-active'), 'expected the first top-level ordinary focus to land on the left card shell');
    assert.equal(leftTitleRoot.classList.contains('step-active'), false, 'expected the card title text root not to enter the top-level queue independently');
    assert.equal(leftDescRoot.classList.contains('step-active'), false, 'expected the card desc text root not to enter the top-level queue independently');

    pressKey(window, 'ArrowRight');
    assert.ok(leftFragments[0].classList.contains('qa-fragment-visible'), 'expected ArrowRight to reveal the current card host fragment without inserting an internal text-root focus step');
    assert.equal(Array.from(rightFragments).some((fragment) => fragment.classList.contains('qa-fragment-visible')), false, 'expected the other card host fragments to remain untouched while focus stays on the left card');

    pressKey(window, 'ArrowDown');
    assert.ok(rightCard.classList.contains('step-active'), 'expected the next ArrowDown to move directly to the right card shell instead of the left card internal roots');
    assert.equal(rightTitleRoot.classList.contains('step-active'), false, 'expected the right card title root not to become its own top-level step');
    assert.equal(rightDescRoot.classList.contains('step-active'), false, 'expected the right card desc root not to become its own top-level step');

    pressKey(window, 'ArrowRight');
    assert.ok(rightFragments[0].classList.contains('qa-fragment-visible'), 'expected ArrowRight to reveal the focused right card fragment once the card shell receives focus');
  });

  it('reveals a single fragment or its whole fragment group immediately on right click for quiz-free slides', () => {
    const dom = createQuizFreePageDom();
    const { window } = dom;
    const titleRoot = window.document.querySelector('[data-edit-id="title-root"]');
    const descRoot = window.document.querySelector('[data-edit-id="desc-root"]');
    const firstFragment = window.document.querySelector('.page-fragment-single');
    const ruby = window.document.querySelector('ruby');
    const groupedFragments = window.document.querySelectorAll('[data-fragment-group="frag-02"]');

    rightClickElement(window, firstFragment);
    assert.ok(firstFragment.classList.contains('qa-fragment-visible'), 'expected an ungrouped fragment to reveal immediately on right click');
    assert.ok(titleRoot.classList.contains('step-active'), 'expected right-click reveal to sync the top-level focus to the owning ordinary root so later ArrowLeft and ArrowRight stay aligned');
    assert.equal(descRoot.classList.contains('step-active'), false, 'expected immediate reveal not to move focus to a different ordinary root than the one that owns the clicked fragment');

    rightClickElement(window, ruby);
    assert.equal(Array.from(groupedFragments).filter((fragment) => fragment.classList.contains('qa-fragment-visible')).length, 2, 'expected right click inside a grouped fragment to reveal every authored layer in that group');
    assert.ok(descRoot.classList.contains('step-active'), 'expected immediate reveal inside another ordinary root to move the top-level focus to that owning root');
    assert.equal(titleRoot.classList.contains('step-active'), false, 'expected only the owning root of the latest immediate reveal to keep the visible focus state');
  });

  it('keeps ordinary host focus sync silent when right click reveal moves from one text root to another', () => {
    const dom = createQuizFreePageDom();
    const { window } = dom;
    const titleRoot = window.document.querySelector('[data-edit-id="title-root"]');
    const descRoot = window.document.querySelector('[data-edit-id="desc-root"]');
    const firstFragment = window.document.querySelector('.page-fragment-single');
    const calls = [];

    window.AudioRuntime = {
      playGlobalCue(name) {
        calls.push(name);
        return true;
      }
    };

    assert.equal(typeof window.activateInteractionStepForElement, 'function', '测试夹具必须暴露一级焦点同步入口');
    assert.ok(titleRoot, '测试夹具必须提供标题 ordinary root');
    assert.ok(descRoot, '测试夹具必须提供描述 ordinary root');
    assert.ok(firstFragment, '测试夹具必须提供可右键 reveal 的 ordinary fragment');

    /* 先把一级焦点落到另一侧 ordinary root，
       再右键当前 fragment，才能稳定复现“reveal 音效 + focus-shift 双响”这个回归。 */
    window.activateInteractionStepForElement(descRoot, { silentFocusCue: true });
    calls.length = 0;

    rightClickElement(window, firstFragment);

    assert.ok(firstFragment.classList.contains('qa-fragment-visible'), 'expected right click to keep revealing the target ordinary fragment immediately');
    assert.equal(titleRoot.classList.contains('step-active'), true, 'expected right click reveal to keep syncing top-level focus onto the owning ordinary root');
    assert.equal(descRoot.classList.contains('step-active'), false, 'expected the previously focused ordinary root to lose step-active after the reveal target takes ownership');
    assert.deepEqual(calls, ['fragment-swoosh'], 'expected ordinary page right click reveal to keep only the fragment reveal cue, not an extra focus-shift pop while syncing focus between left and right hosts');
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

    pressKey(window, 'ArrowDown');
    pressKey(window, 'ArrowRight');
    assert.ok(window.document.querySelector('.page-fragment-single').classList.contains('qa-fragment-visible'), 'expected the first fragment to be visible before mutating authored DOM');

    titleRoot.innerHTML = 'Intro revised.';
    descRoot.innerHTML = 'Now <span class="page-fragment replacement-first" data-fragment-step="true">replacement</span> appears before <span class="page-fragment replacement-second" data-fragment-step="true">follow-up</span>.';

    runtime.refreshSlide(activeSlide);

    assert.equal(activeSlide.querySelectorAll('.qa-fragment-visible').length, 0, 'expected refreshSlide to clear stale reveal classes so the old visible index cannot leak into the new fragment order');

    pressKey(window, 'ArrowDown');
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

  it('plays hover cues when the pointer is anywhere inside the owning text root, then keeps editor mode silent', () => {
    const dom = createRootHoverOrdinaryPageDom();
    const { window } = dom;
    const calls = [];
    const hoverRoot = window.document.querySelector('.hover-root');
    const firstFragment = window.document.querySelector('.hover-fragment-one');

    window.AudioRuntime = {
      playGlobalCue(name) {
        calls.push(name);
        return true;
      }
    };

    movePointer(window, hoverRoot);
    movePointer(window, firstFragment);
    pressKey(window, 'ArrowDown');
    pressKey(window, 'ArrowRight');
    pressKey(window, 'ArrowLeft');

    assert.deepEqual(calls, ['ui-hover', 'fragment-swoosh', 'fragment-swoosh-back'], 'expected pointer hover anywhere inside one ordinary text root to emit only one hover cue before reveal and rollback sounds');

    window.document.documentElement.classList.add('editor-mode');
    movePointer(window, hoverRoot);
    pressKey(window, 'ArrowRight');
    pressKey(window, 'ArrowLeft');

    assert.deepEqual(calls, ['ui-hover', 'fragment-swoosh', 'fragment-swoosh-back'], 'expected editor mode to stay silent and not emit ordinary page cue traffic');
  });

  it('does not reveal example-card fragments before the active question is submitted', () => {
    const dom = createExampleCardFragmentDom(`
      <article class="example-card__question is-active" data-question-id="q1" data-question-active="true" data-question-submitted="false">
        <div class="example-card__stem" data-edit-id="example-stem">
          Intro <span class="page-fragment example-card-fragment" data-fragment-step="true">hidden</span> cue.
        </div>
      </article>
    `);

    const { window } = dom;
    const fragment = window.document.querySelector('.example-card-fragment');

    assert.ok(fragment, '测试夹具必须提供 example-card fragment');

    rightClickElement(window, fragment);

    assert.equal(fragment.classList.contains('qa-fragment-visible'), false, 'expected unsubmitted example-card fragments to stay unrevealable');
  });

  it('does not mark unsubmitted example-card roots hover-eligible before submit', () => {
    const dom = createExampleCardFragmentDom(`
      <article class="example-card__question is-active" data-question-id="q1" data-question-active="true" data-question-submitted="false">
        <div class="example-card__stem" data-edit-id="example-stem">
          Intro <span class="page-fragment example-card-fragment" data-fragment-step="true">hidden</span> cue.
        </div>
      </article>
    `);

    const { window } = dom;
    const root = window.document.querySelector('[data-edit-id="example-stem"]');

    assert.ok(root, '测试夹具必须提供 example-card 的 ordinary text root');
    assert.equal(root.getAttribute('data-page-richtext-hover-eligible'), null, 'expected unsubmitted example-card roots not to receive ordinary fragment hover eligibility before the student submits the answer');
  });

  it('reveals only the active submitted example-card question fragments', () => {
    const dom = createExampleCardFragmentDom(`
      <article class="example-card__question is-active" data-question-id="q1" data-question-active="true" data-question-submitted="true">
        <div class="example-card__stem" data-edit-id="active-stem">
          Active <span class="page-fragment active-fragment" data-fragment-step="true">hidden</span> cue.
        </div>
      </article>
      <article class="example-card__question" data-question-id="q2" hidden data-question-active="false" data-question-submitted="true">
        <div class="example-card__stem" data-edit-id="inactive-stem">
          Hidden <span class="page-fragment inactive-fragment" data-fragment-step="true">hidden</span> cue.
        </div>
      </article>
    `);

    const { window } = dom;
    const activeFragment = window.document.querySelector('.active-fragment');
    const inactiveFragment = window.document.querySelector('.inactive-fragment');
  const activeRoot = window.document.querySelector('[data-edit-id="active-stem"]');
  const inactiveRoot = window.document.querySelector('[data-edit-id="inactive-stem"]');

    assert.ok(activeFragment, '测试夹具必须提供活跃题 fragment');
    assert.ok(inactiveFragment, '测试夹具必须提供非活跃题 fragment');
  assert.ok(activeRoot, '测试夹具必须提供活跃题 ordinary text root');
  assert.ok(inactiveRoot, '测试夹具必须提供非活跃题 ordinary text root');

  assert.equal(activeRoot.getAttribute('data-page-richtext-hover-eligible'), 'true', 'expected the active submitted example-card root to receive ordinary fragment hover eligibility after submission');
  assert.equal(inactiveRoot.getAttribute('data-page-richtext-hover-eligible'), null, 'expected inactive example-card roots not to receive ordinary fragment hover eligibility even if they already have authored fragments');

    rightClickElement(window, activeFragment);
    rightClickElement(window, inactiveFragment);

    assert.equal(activeFragment.classList.contains('qa-fragment-visible'), true, 'expected the active submitted question fragment to reveal');
    assert.equal(inactiveFragment.classList.contains('qa-fragment-visible'), false, 'expected inactive question fragments to stay unrevealable');
  });

  it('forwards doodle pointer hover through to the owning text root and keeps right click reveal aligned to that root host', () => {
    const dom = createDoodleOrdinaryPageDom();
    const { window } = dom;
    const doodleLayer = window.document.querySelector('.doodle-layer');
    const titleRoot = window.document.querySelector('[data-edit-id="title-root"]');
    const descRoot = window.document.querySelector('[data-edit-id="desc-root"]');
    const firstFragment = window.document.querySelector('.page-fragment-single');
    const secondFragment = window.document.querySelector('.page-fragment-second');
    const calls = [];

    window.AudioRuntime = {
      playGlobalCue(name) {
        calls.push(name);
        return true;
      }
    };

    window.document.documentElement.classList.add('doodle-mode');
    window.document.body.classList.add('doodle-mode');
    window.document.elementFromPoint = () => firstFragment;

    movePointer(window, doodleLayer, { clientX: 120, clientY: 48 });
    assert.ok(titleRoot.classList.contains('page-fragment-hover-proxy'), 'expected doodle hover passthrough to mark the owning text root instead of a single fragment node');
    assert.equal(firstFragment.classList.contains('page-fragment-hover-proxy'), false, 'expected doodle hover passthrough not to leave the proxy class on the fragment itself');

    rightClickElement(window, doodleLayer);
    assert.ok(firstFragment.classList.contains('qa-fragment-visible'), 'expected right click on the doodle layer to reveal the underlying ordinary fragment immediately');
    assert.equal(titleRoot.classList.contains('step-active'), true, 'expected doodle passthrough reveal to keep syncing top-level focus to the owning standalone text root host');

    window.document.elementFromPoint = () => secondFragment;
    movePointer(window, doodleLayer, { clientX: 180, clientY: 60 });
    assert.equal(titleRoot.classList.contains('page-fragment-hover-proxy'), false, 'expected doodle hover passthrough to clear the previous owning text root when the pointer moves away');
    assert.ok(descRoot.classList.contains('page-fragment-hover-proxy'), 'expected doodle hover passthrough to follow the latest underlying owning text root');
    assert.equal(secondFragment.classList.contains('page-fragment-hover-proxy'), false, 'expected doodle passthrough not to proxy-highlight only the leaf fragment node');
    assert.deepEqual(calls, ['ui-hover', 'fragment-swoosh', 'ui-hover'], 'expected doodle hover and reveal passthrough to emit the same ordinary page cue names as direct interaction');
  });

  it('shares the fragment hide and reveal CSS contract with ordinary data-edit-id roots', () => {
    assert.match(fragmentCssSource, /\.page-richtext-fragment-host\s+\[data-edit-id\]\s+\[data-fragment-step="true"\][\s\S]*color:\s*inherit\s*!important;/, 'expected ordinary page fragments to opt into the hidden baseline through a dedicated slide class instead of a global bare [data-edit-id] selector');
    assert.match(fragmentCssSource, /\.page-richtext-fragment-host\s+\[data-edit-id\]\s+\[data-fragment-step="true"\]\.qa-fragment-visible\[data-fragment-format="highlight"\][\s\S]*background-color:\s*var\(--qa-fragment-highlight, transparent\)\s*!important;/, 'expected ordinary page reveal to restore authored highlight formatting once the runtime marks a fragment visible');
    assert.match(fragmentCssSource, /html:not\(\.editor-mode\)\s+body:not\(\.editor-mode\)\s+\.page-richtext-fragment-host\s+\[data-page-richtext-hover-eligible="true"\]:hover\s+\[data-fragment-step="true"\][\s\S]*\[data-page-richtext-hover-eligible="true"\]\.page-fragment-hover-proxy\s+\[data-fragment-step="true"\][\s\S]*background-color:\s*rgba\(var\(--brand-secondary-rgb, 243, 152, 0\), 0\.24\)\s*!important;/, 'expected ordinary page hover CSS to light every fragment only for roots that the runtime has explicitly marked hover-eligible, including doodle proxy cases');
    assert.doesNotMatch(fragmentCssSource, /\.page-richtext-fragment-host\s+\[data-edit-id\]:hover\s+\[data-fragment-step="true"\]/, 'expected ordinary page hover CSS not to target every bare ordinary root, otherwise unsubmitted example-card roots would still show orange hover glow before submission');
    assert.doesNotMatch(fragmentCssSource, /\.page-richtext-fragment-host\s+\[data-page-richtext-root="true"\]\.step-active/, 'expected ordinary page CSS not to keep the previous orange root-level step-active container styling');
  });
});