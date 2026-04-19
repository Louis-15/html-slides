import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..', '..');
const runtimePath = path.join(projectRoot, 'assets', 'quiz-annotation-runtime.js');
const zoneCssPath = path.join(projectRoot, 'assets', 'zones', 'zone2-quiz-annotation.css');
const runtimeSource = fs.readFileSync(runtimePath, 'utf-8');
const zoneCssSource = fs.readFileSync(zoneCssPath, 'utf-8');

function dispatchSelectionChange(window) {
  window.document.dispatchEvent(new window.Event('selectionchange', { bubbles: true }));
}

function clickElement(window, element) {
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

function rightClickElement(window, element) {
  element.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, button: 2 }));
}

function dispatchDragEvent(window, element, type, init = {}) {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, init);
  if (!event.dataTransfer) {
    Object.defineProperty(event, 'dataTransfer', {
      value: {
        effectAllowed: '',
        setData() {},
        getData() { return ''; }
      }
    });
  }
  element.dispatchEvent(event);
  return event;
}

function findTextNode(container, text) {
  const walker = container.ownerDocument.createTreeWalker(container, container.ownerDocument.defaultView.NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const index = node.textContent.indexOf(text);
    if (index !== -1) {
      return { node, index };
    }
  }
  throw new Error(`Unable to find text "${text}"`);
}

function selectText(window, container, text) {
  const { node, index } = findTextNode(container, text);
  const range = window.document.createRange();
  range.setStart(node, index);
  range.setEnd(node, index + text.length);
  range.getClientRects = () => [{ left: 120, top: 140, right: 260, bottom: 164 }];

  const qa = container.closest('.quiz-annotation');
  if (qa) {
    qa.getBoundingClientRect = () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 });
  }

  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  dispatchSelectionChange(window);
  return range;
}

function ensureQaInitialized(window, qa) {
  qa.removeAttribute('data-qa-initialized');
  window.initQuizAnnotation(qa);
}

function createRuntimeDom(html) {
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'http://localhost/'
  });

  const { window } = dom;

  // 为运行时提供最小浏览器桩，避免测试环境缺失 API。
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
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.MutationObserver = class {
    observe() {}
    disconnect() {}
    takeRecords() { return []; }
  };
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  if (typeof window.getSelection !== 'function') {
    window.getSelection = () => ({
      rangeCount: 0,
      removeAllRanges() {},
      addRange() {}
    });
  }
  window.EditorHooks = { register() {} };
  window.alert = () => {};
  window.confirm = () => true;
  window.prompt = () => '顶标';
  window.HTMLElement.prototype.scrollIntoView = () => {};

  window.eval(runtimeSource);

  return dom;
}

function createQuizDom() {
  const html = `<!DOCTYPE html><html><body>
    <div class="slide active" data-slide="1">
      <div class="quiz-annotation has-quiz notes-active">
        <div class="qa-body">
          <svg class="qa-connector-canvas" aria-hidden="true"></svg>
          <div class="qa-passage">
            <span class="text-anchor" data-link="note-01" data-step="1">anchor<sup class="note-badge">1</sup></span>
          </div>
          <div class="qa-answer-panel">
            <div class="qa-answer-header">
              <div class="qa-answer-title">Question</div>
              <button class="qa-submit-btn">Submit</button>
            </div>
            <div class="qa-answer-content">
              <div class="qa-question" data-type="single">
                <div class="qa-option" data-option="A" data-correct="true">
                  <span class="qa-status-dot"></span>
                  <span class="qa-option-label">A</span>
                  <span class="qa-option-text">Option</span>
                </div>
              </div>
            </div>
          </div>
          <div class="qa-notes-panel">
            <div class="qa-note-bubble" data-link="note-01" data-step="1" draggable="true">
              <div class="qa-note-header">
                <div class="qa-note-handle">
                  <span class="qa-note-step">1</span>
                </div>
                <div class="qa-note-actions">
                  <button class="qa-note-action-btn action-delete" title="删除批注">✖</button>
                </div>
              </div>
              <div class="qa-note-content">Note content</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </body></html>`;

  return createRuntimeDom(html);
}

function createSelectionEditorDom(questionType = 'single') {
  const html = `<!DOCTYPE html><html><body>
    <div class="slide active" data-slide="1">
      <div class="quiz-annotation has-quiz notes-active">
        <div class="qa-body">
          <svg class="qa-connector-canvas" aria-hidden="true"></svg>
          <div class="qa-passage"><p data-edit-id="passage-01">The first sentence. The second sentence.</p></div>
          <div class="qa-answer-panel">
            <div class="qa-answer-header">
              <div class="qa-answer-title">Question</div>
              <button class="qa-submit-btn">Submit</button>
            </div>
            <div class="qa-answer-content">
              <div class="qa-question" data-type="${questionType}">
                <p>25. Test question</p>
                <div class="qa-option" data-option="A" data-correct="true">
                  <span class="qa-status-dot"></span>
                  <span class="qa-option-label">A</span>
                  <span class="qa-option-text">Option A</span>
                </div>
                <div class="qa-option" data-option="B">
                  <span class="qa-status-dot"></span>
                  <span class="qa-option-label">B</span>
                  <span class="qa-option-text">Option B</span>
                </div>
                <div class="qa-option" data-option="C">
                  <span class="qa-status-dot"></span>
                  <span class="qa-option-label">C</span>
                  <span class="qa-option-text">Option C</span>
                </div>
              </div>
            </div>
          </div>
          <div class="qa-notes-panel"></div>
        </div>
      </div>
    </div>
  </body></html>`;

  return createRuntimeDom(html);
}

function createBubbleEditorDom() {
  const html = `<!DOCTYPE html><html><body>
    <div class="slide active" data-slide="1">
      <div class="quiz-annotation has-quiz notes-active has-active-note">
        <div class="qa-body">
          <svg class="qa-connector-canvas" aria-hidden="true"></svg>
          <div class="qa-passage">
            <p data-edit-id="passage-01"><span class="text-anchor" data-link="note-01" data-step="1">Anchor fragment sample sentence.<sup class="note-badge">1</sup></span></p>
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
                  <span class="qa-option-text">Answer sentence.</span>
                </div>
              </div>
            </div>
          </div>
          <div class="qa-notes-panel">
            <div class="qa-note-bubble note-active note-expanded" data-link="note-01" data-step="1" draggable="true">
              <div class="qa-note-header">
                <div class="qa-note-handle">
                  <span class="qa-note-step">1</span>
                </div>
              </div>
              <div class="qa-note-content" contenteditable="true" data-edit-id="note-01">Keyword fragment sample note.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </body></html>`;

  return createRuntimeDom(html);
}

function createLeftLinkEditorDom() {
  const html = `<!DOCTYPE html><html><body>
    <div class="slide active" data-slide="1">
      <div class="quiz-annotation has-quiz notes-active">
        <div class="qa-body">
          <svg class="qa-connector-canvas" aria-hidden="true"></svg>
          <div class="qa-passage"><p data-edit-id="passage-01">The first sentence. The second sentence.</p></div>
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
                  <span class="qa-option-text">Option A</span>
                </div>
              </div>
            </div>
          </div>
          <div class="qa-notes-panel">
            <div class="qa-note-bubble" data-link="note-01" data-step="1">
              <div class="qa-note-header">
                <div class="qa-note-handle"><span class="qa-note-step">1</span></div>
              </div>
              <div class="qa-note-content" contenteditable="true" data-edit-id="note-01">Explain the sentence.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </body></html>`;

  return createRuntimeDom(html);
}

function createDragEditorDom() {
  const html = `<!DOCTYPE html><html><body>
    <div class="slide active" data-slide="1">
      <div class="quiz-annotation has-quiz notes-active">
        <div class="qa-body">
          <svg class="qa-connector-canvas" aria-hidden="true"></svg>
          <div class="qa-passage"><p data-edit-id="passage-01">The first sentence. The second sentence.</p></div>
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
                  <span class="qa-option-text">Option A</span>
                </div>
              </div>
            </div>
          </div>
          <div class="qa-notes-panel"></div>
        </div>
      </div>
    </div>
  </body></html>`;

  return createRuntimeDom(html);
}

function createMatchingEditorDom() {
  const html = `<!DOCTYPE html><html><body>
    <div class="slide active" data-slide="1">
      <div class="quiz-annotation has-quiz notes-active">
        <div class="qa-body">
          <svg class="qa-connector-canvas" aria-hidden="true"></svg>
          <div class="qa-passage">
            <p>
              <span class="qa-blank-slot" data-blank-id="36" data-correct-answer="A"></span>
              <span class="qa-blank-slot" data-blank-id="37" data-correct-answer="B"></span>
            </p>
          </div>
          <div class="qa-answer-panel">
            <div class="qa-answer-header">
              <div class="qa-answer-title">Question</div>
              <button class="qa-submit-btn">Submit</button>
            </div>
            <div class="qa-answer-content">
              <div class="qa-question" data-type="matching">
                <div class="qa-option" data-option="A" draggable="true">
                  <span class="qa-status-dot"></span>
                  <span class="qa-option-label">A</span>
                  <span class="qa-option-text">Option A</span>
                </div>
                <div class="qa-option" data-option="B" draggable="true">
                  <span class="qa-status-dot"></span>
                  <span class="qa-option-label">B</span>
                  <span class="qa-option-text">Option B</span>
                </div>
                <div class="qa-option" data-option="C" draggable="true">
                  <span class="qa-status-dot"></span>
                  <span class="qa-option-label">C</span>
                  <span class="qa-option-text">Option C</span>
                </div>
              </div>
            </div>
          </div>
          <div class="qa-notes-panel"></div>
        </div>
      </div>
    </div>
  </body></html>`;

  return createRuntimeDom(html);
}

describe('quiz annotation runtime', () => {
  it('rebuilds note actions inside qa-note-header after history-style strip and re-init', () => {
    const dom = createQuizDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');
    const bubble = qa.querySelector('.qa-note-bubble');

    window.stripDynamicQAElements(qa);
    qa.removeAttribute('data-qa-initialized');
    window.initQuizAnnotation(qa);

    const header = bubble.querySelector('.qa-note-header');
    assert.ok(header, 'expected qa-note-header to remain present after re-init');

    const actionsInHeader = header.querySelector('.qa-note-actions');
    assert.ok(actionsInHeader, 'expected qa-note-actions to be recreated inside qa-note-header');

    const directActionChildren = Array.from(bubble.children).filter((child) => child.classList.contains('qa-note-actions'));
    assert.equal(directActionChildren.length, 0, 'expected qa-note-actions not to be appended to qa-note-bubble root');
  });

  it('renders single-choice result marks inside the option label so multi-line answers stay aligned', () => {
    const dom = createQuizDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');
    ensureQaInitialized(window, qa);
    const option = qa.querySelector('.qa-option');
    const optionLabel = option.querySelector('.qa-option-label');
    const optionText = option.querySelector('.qa-option-text');
    const submitBtn = qa.querySelector('.qa-submit-btn');

    optionText.textContent = 'A long option answer that intentionally wraps to a second line so the correctness mark must stay attached to the option badge instead of the whole card.';

    clickElement(window, option);
    clickElement(window, submitBtn);

    const resultMark = option.querySelector('.qa-result-mark');
    assert.ok(resultMark, 'expected single-choice submit to create a result mark');
    assert.equal(resultMark.parentElement, optionLabel, 'expected result mark to be rendered inside qa-option-label');
  });

  it('adds an entry animation state when a note badge activates its bubble', () => {
    const dom = createQuizDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');
    ensureQaInitialized(window, qa);
    const badge = qa.querySelector('.note-badge');
    const bubble = qa.querySelector('.qa-note-bubble');

    qa.classList.remove('notes-active');
    bubble.classList.remove('note-active', 'note-expanded');

    clickElement(window, badge);

    assert.ok(qa.classList.contains('notes-active'), 'expected note badge click to expand the notes panel');
    assert.ok(bubble.classList.contains('note-activating'), 'expected activated bubble to receive an entry animation state');
  });

  it('renders selectable answer chips for single-choice questions in editor mode', () => {
    const dom = createSelectionEditorDom('single');
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');
    const scheduleSaveCalls = [];

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');
    window.AnnotationStore = {
      hasWriteAccess() {
        return false;
      },
      scheduleSave() {
        scheduleSaveCalls.push('saved');
      }
    };

    ensureQaInitialized(window, qa);

    const question = qa.querySelector('.qa-question[data-type="single"]');
    const row = question.querySelector('.qa-answer-key-row');
    const chipB = question.querySelector('.qa-answer-key-chip[data-option="B"]');

    assert.ok(row, 'expected editor mode to inject a correct-answer row');
    assert.equal(row.previousElementSibling.tagName, 'P', 'expected correct-answer row to be inserted below the question stem');

    clickElement(window, chipB);

    assert.equal(question.querySelector('.qa-option[data-option="A"]').getAttribute('data-correct'), null, 'expected previous single-choice correct option to be cleared');
    assert.equal(question.querySelector('.qa-option[data-option="B"]').getAttribute('data-correct'), 'true', 'expected clicked chip to become the only correct option');
    assert.ok(chipB.classList.contains('is-correct'), 'expected the clicked chip to reflect the active correct answer');
    assert.equal(scheduleSaveCalls.length, 1, 'expected correct-answer edits to request persistence');
  });

  it('supports multi-choice correct-answer toggling in editor mode', () => {
    const dom = createSelectionEditorDom('multi');
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');

    ensureQaInitialized(window, qa);

    const question = qa.querySelector('.qa-question[data-type="multi"]');
    const chipB = question.querySelector('.qa-answer-key-chip[data-option="B"]');
    const chipA = question.querySelector('.qa-answer-key-chip[data-option="A"]');

    clickElement(window, chipB);
    assert.equal(question.querySelector('.qa-option[data-option="A"]').getAttribute('data-correct'), 'true', 'expected existing multi-choice answer to remain selected');
    assert.equal(question.querySelector('.qa-option[data-option="B"]').getAttribute('data-correct'), 'true', 'expected clicked multi-choice answer to be added');

    clickElement(window, chipA);
    assert.equal(question.querySelector('.qa-option[data-option="A"]').getAttribute('data-correct'), null, 'expected clicking an active multi-choice answer to toggle it off');
    assert.ok(!chipA.classList.contains('is-correct'), 'expected toggled-off chip to clear its active state');
  });

  it('renders matching answer-key slots in editor mode and syncs the selected correct answer', () => {
    const dom = createMatchingEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');

    ensureQaInitialized(window, qa);

    const divider = qa.querySelector('.qa-slots-divider');
    const slot = qa.querySelector('.qa-answer-slot[data-blank-id="36"]');
    const choiceButtons = Array.from(slot.querySelectorAll('.qa-answer-key-chip')).map((button) => button.textContent.trim());
    const chipC = slot.querySelector('.qa-answer-key-chip[data-option="C"]');

    assert.equal(divider.textContent, '↑ 点击设置每个空位的正确答案 ↓', 'expected matching editor mode to switch the slot helper copy');
    assert.deepEqual(choiceButtons, ['A', 'B', 'C'], 'expected each matching slot to expose all available answer candidates');

    clickElement(window, chipC);

    assert.equal(slot.getAttribute('data-correct-answer'), 'C', 'expected matching editor slot to store the selected correct answer');
    assert.equal(qa.querySelector('.qa-passage .qa-blank-slot[data-blank-id="36"]').getAttribute('data-correct-answer'), 'C', 'expected matching editor changes to sync back to the passage blank');
    assert.ok(chipC.classList.contains('is-correct'), 'expected the selected matching candidate to reflect its active state');
  });

  it('keeps matching correct answers unique when the same option is reassigned to another blank', () => {
    const dom = createMatchingEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');

    ensureQaInitialized(window, qa);

    const firstSlot = qa.querySelector('.qa-answer-slot[data-blank-id="36"]');
    const secondSlot = qa.querySelector('.qa-answer-slot[data-blank-id="37"]');

    clickElement(window, firstSlot.querySelector('.qa-answer-key-chip[data-option="C"]'));
    clickElement(window, secondSlot.querySelector('.qa-answer-key-chip[data-option="C"]'));

    assert.equal(firstSlot.getAttribute('data-correct-answer'), '', 'expected the previous slot to stay present but clear its duplicated correct answer');
    assert.equal(secondSlot.getAttribute('data-correct-answer'), 'C', 'expected the latest slot to take ownership of the reassigned correct answer');
    assert.ok(!firstSlot.querySelector('.qa-answer-key-chip[data-option="C"]').classList.contains('is-correct'), 'expected the old slot UI to clear the duplicated selection');
  });

  it('shows only underline color controls when creating a note in editor mode', () => {
    const dom = createSelectionEditorDom('single');
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');

    ensureQaInitialized(window, qa);
    selectText(window, qa.querySelector('.qa-passage p'), 'The first sentence.');

    const toolbar = qa.querySelector('.qa-annotation-toolbar');
    assert.ok(toolbar?.classList.contains('visible'), 'expected sentence selection to show the note toolbar');
    assert.ok(toolbar.querySelector('.btn-underline'), 'expected underline entry to stay available');
    assert.equal(toolbar.querySelector('.btn-color'), null, 'expected note creation toolbar to remove plain text color entry');
    assert.equal(toolbar.querySelector('.btn-highlight'), null, 'expected note creation toolbar to remove highlight entry');
    assert.equal(toolbar.querySelector('.btn-strikethrough'), null, 'expected note creation toolbar to remove strikethrough entry');
  });

  it('requires a full sentence selection before creating a note anchor', () => {
    const dom = createSelectionEditorDom('single');
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');

    ensureQaInitialized(window, qa);
    selectText(window, qa.querySelector('.qa-passage p'), 'first');

    clickElement(window, qa.querySelector('.qa-annotation-toolbar .btn-underline'));
    clickElement(window, qa.querySelector('.qa-annotation-toolbar .ul-colors .color-swatch'));

    assert.equal(qa.querySelectorAll('.qa-note-bubble').length, 0, 'expected partial sentence selection not to create a new note bubble');
    assert.equal(qa.querySelectorAll('.text-anchor').length, 0, 'expected partial sentence selection not to create a text anchor');
  });

  it('reuses the underline-only toolbar while linking an existing note to the answer panel', () => {
    const dom = createQuizDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');

    ensureQaInitialized(window, qa);

    clickElement(window, qa.querySelector('.qa-note-bubble .action-link-right'));
    selectText(window, qa.querySelector('.qa-option-text'), 'Option');

    const toolbar = qa.querySelector('.qa-annotation-toolbar');
    assert.equal(toolbar.querySelector('.qa-toolbar-label')?.textContent, '建立关联', 'expected linking mode to switch the toolbar label');
    assert.ok(toolbar.querySelector('.btn-underline'), 'expected linking mode to keep the underline color entry');
    assert.equal(toolbar.querySelector('.btn-color'), null, 'expected linking mode to remove plain text color entry');
    assert.equal(toolbar.querySelector('.btn-highlight'), null, 'expected linking mode to remove highlight entry');
    assert.equal(toolbar.querySelector('.btn-strikethrough'), null, 'expected linking mode to remove strikethrough entry');
  });

  it('allows left-side linking to open the underline palette when the selected sentence omits terminal punctuation', () => {
    const dom = createLeftLinkEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');

    ensureQaInitialized(window, qa);
    clickElement(window, qa.querySelector('.qa-note-bubble .action-link-left'));
    selectText(window, qa.querySelector('.qa-passage p'), 'The first sentence');

    const toolbar = qa.querySelector('.qa-annotation-toolbar');
    assert.ok(toolbar?.classList.contains('visible'), 'expected left-side linking to show the underline palette for a full sentence selection');

    clickElement(window, toolbar.querySelector('.btn-underline'));
    clickElement(window, toolbar.querySelector('.ul-colors .color-swatch'));

    const anchor = qa.querySelector('.text-anchor[data-link="note-01"]');
    assert.ok(anchor, 'expected selecting a left-side sentence to create the matching text anchor');
  });

  it('allows left-side linking for arbitrary partial selections instead of enforcing whole-sentence matching', () => {
    const dom = createLeftLinkEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');

    ensureQaInitialized(window, qa);
    clickElement(window, qa.querySelector('.qa-note-bubble .action-link-left'));
    selectText(window, qa.querySelector('.qa-passage p'), 'first');

    const toolbar = qa.querySelector('.qa-annotation-toolbar');
    assert.ok(toolbar?.classList.contains('visible'), 'expected left-side linking to reuse the unrestricted selection behavior of right-side linking');

    clickElement(window, toolbar.querySelector('.btn-underline'));
    clickElement(window, toolbar.querySelector('.ul-colors .color-swatch'));

    const anchor = qa.querySelector('.text-anchor[data-link="note-01"]');
    assert.ok(anchor, 'expected partial left-side selections to create a matching text anchor');
    assert.equal(anchor.childNodes[0]?.textContent, 'first', 'expected the linked anchor to preserve exactly the text selected by the user');
  });

  it('shows the fragment toolbar for partial selection inside an existing source anchor instead of the note bubble', () => {
    const dom = createBubbleEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');

    ensureQaInitialized(window, qa);
    selectText(window, qa.querySelector('.text-anchor'), 'fragment');

    const fragmentToolbar = qa.querySelector('.qa-note-fragment-toolbar');
    assert.ok(fragmentToolbar?.classList.contains('visible'), 'expected selecting anchored source text to show the fragment toolbar');
    assert.equal(qa.querySelector('.qa-annotation-toolbar')?.classList.contains('visible'), false, 'expected anchored source fragments not to reuse the anchor-creation toolbar');
  });

  it('applies fragment markup inside the linked source anchor instead of the note bubble', () => {
    const dom = createBubbleEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');

    ensureQaInitialized(window, qa);
    selectText(window, qa.querySelector('.text-anchor'), 'fragment');

    const fragmentToolbar = qa.querySelector('.qa-note-fragment-toolbar');
    clickElement(window, fragmentToolbar.querySelector('.btn-strikethrough'));

    assert.ok(qa.querySelector('.text-anchor [data-fragment-step="true"]'), 'expected fragment markup to be authored inside the source anchor');
    assert.equal(qa.querySelector('.qa-note-content [data-fragment-step="true"]'), null, 'expected note bubble text not to receive step fragments');
  });

  it('uses the same ruby icon as the global editor toolbar', () => {
    const dom = createBubbleEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    ensureQaInitialized(window, qa);

    const rubyBtn = qa.querySelector('.qa-note-fragment-toolbar .btn-ruby');
    const rubySvg = rubyBtn?.querySelector('svg');
    const rubyPaths = Array.from(rubySvg?.querySelectorAll('path') || []).map((path) => path.getAttribute('d'));

    assert.ok(rubySvg, 'expected the fragment toolbar ruby button to use an SVG icon');
    assert.deepEqual(
      rubyPaths,
      ['M4 19h16', 'm12 15 4-8 4 8', 'M14 11h4', 'M4 9h5', 'M6 5h1'],
      'expected the fragment toolbar to reuse the same ruby icon paths as the main editor toolbar'
    );
  });

  it('reveals an authored source fragment on right click in presentation mode', () => {
    const dom = createBubbleEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    ensureQaInitialized(window, qa);

    const anchor = qa.querySelector('.text-anchor');
    anchor.innerHTML = 'Anchor <span class="qa-note-fragment" data-fragment-step="true">fragment</span> sample sentence.<sup class="note-badge">1</sup>';
    const fragment = anchor.querySelector('[data-fragment-step="true"]');

    rightClickElement(window, fragment);

    assert.ok(fragment.classList.contains('qa-fragment-visible'), 'expected right click to reveal the authored source fragment immediately');
  });

  it('reveals all authored layers in the same fragment group with a single right click', () => {
    const dom = createBubbleEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    ensureQaInitialized(window, qa);

    const anchor = qa.querySelector('.text-anchor');
    anchor.innerHTML = 'Anchor <span class="qa-note-fragment" data-fragment-step="true" data-fragment-group="frag-01" data-fragment-format="highlight" style="background-color: rgba(255, 208, 0, 0.45);">others <span class="qa-note-fragment" data-fragment-step="true" data-fragment-group="frag-01" data-fragment-format="ruby"><ruby>has<rt>主语</rt></ruby></span></span> sample sentence.<sup class="note-badge">1</sup>';

    const ruby = anchor.querySelector('ruby');
    const groupedFragments = anchor.querySelectorAll('[data-fragment-group="frag-01"]');

    rightClickElement(window, ruby);

    assert.equal(Array.from(groupedFragments).filter((fragment) => fragment.classList.contains('qa-fragment-visible')).length, 2, 'expected one right click to reveal every authored layer that belongs to the same fragment group');
  });

  it('keeps hidden source fragments readable by neutralizing authored styles until reveal', () => {
    assert.match(zoneCssSource, /\.text-anchor \[data-fragment-step="true"\],[\s\S]*color:\s*inherit\s*!important;/, 'expected hidden source fragments to preserve readable base text color before reveal');
    assert.match(zoneCssSource, /\.text-anchor \[data-fragment-step="true"\],[\s\S]*background(?:-color)?:\s*transparent\s*!important;/, 'expected hidden source fragments to suppress authored highlight backgrounds before reveal');
    assert.match(zoneCssSource, /data-fragment-format="ruby"\][\s\S]*rt\s*\{[\s\S]*display:\s*none;/, 'expected ruby annotations to stay hidden until the fragment is explicitly revealed');
  });

  it('uses the theme secondary color for linking-mode emphasis instead of the primary green', () => {
    assert.match(zoneCssSource, /\.quiz-annotation\.linking-left \.qa-passage[\s\S]*brand-secondary-rgb/, 'expected left-side linking emphasis to use the theme secondary color token');
    assert.match(zoneCssSource, /\.quiz-annotation\.linking-right \.qa-answer-panel[\s\S]*brand-secondary-rgb/, 'expected right-side linking emphasis to use the theme secondary color token');
  });

  it('keeps only one drag placeholder and removes it after drag end even after multiple note creations', () => {
    const dom = createDragEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');

    ensureQaInitialized(window, qa);

    selectText(window, qa.querySelector('.qa-passage p'), 'The first sentence.');
    clickElement(window, qa.querySelector('.qa-annotation-toolbar .btn-underline'));
    clickElement(window, qa.querySelector('.qa-annotation-toolbar .ul-colors .color-swatch'));

    selectText(window, qa.querySelector('.qa-passage p'), 'The second sentence.');
    clickElement(window, qa.querySelector('.qa-annotation-toolbar .btn-underline'));
    clickElement(window, qa.querySelector('.qa-annotation-toolbar .ul-colors .color-swatch'));

    const notesList = qa.querySelector('.qa-notes-list');
    const bubble = qa.querySelector('.qa-note-bubble');
    clickElement(window, bubble.querySelector('.qa-note-header'));
    bubble.querySelector('.qa-note-header').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    dispatchDragEvent(window, bubble, 'dragstart');
    dispatchDragEvent(window, notesList, 'dragover', { clientY: 999 });

    assert.equal(qa.querySelectorAll('.qa-note-placeholder').length, 1, 'expected drag sorting to render only one placeholder slot');

    dispatchDragEvent(window, bubble, 'dragend');
    assert.equal(qa.querySelectorAll('.qa-note-placeholder').length, 0, 'expected drag end to remove placeholder slots completely');
  });
});