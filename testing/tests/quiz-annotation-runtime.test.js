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
});