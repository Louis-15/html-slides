import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..', '..');
const runtimePath = path.join(projectRoot, 'assets', 'quiz-annotation-runtime.js');
const runtimeSource = fs.readFileSync(runtimePath, 'utf-8');

function clickElement(window, element) {
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
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
  window.getSelection = () => ({
    rangeCount: 0,
    removeAllRanges() {}
  });
  window.EditorHooks = { register() {} };
  window.alert = () => {};
  window.confirm = () => true;
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
          <div class="qa-passage"></div>
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
});