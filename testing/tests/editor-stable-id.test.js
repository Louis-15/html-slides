import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..', '..');
const editorUtilsPath = path.join(projectRoot, 'assets', 'editor', 'editor-utils.js');
const editorPersistencePath = path.join(projectRoot, 'assets', 'editor', 'editor-persistence.js');
const editorCorePath = path.join(projectRoot, 'assets', 'editor', 'editor-core.js');

const editorUtilsSource = fs.readFileSync(editorUtilsPath, 'utf-8');
const editorPersistenceSource = fs.readFileSync(editorPersistencePath, 'utf-8');
const editorCoreSource = fs.readFileSync(editorCorePath, 'utf-8');

function createDom(bodyHtml, url = 'http://localhost/deck.html') {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><head><title>stable-id-deck</title></head><body>${bodyHtml}</body></html>`,
    {
      runScripts: 'outside-only',
      url
    },
  );

  const { window } = dom;
  window.console.log = () => {};
  window.console.warn = () => {};
  window.setTimeout = (callback) => {
    callback();
    return 1;
  };
  window.clearTimeout = () => {};

  return dom;
}

function predictStableId(bodyHtml, selector, url = 'http://localhost/deck.html') {
  const dom = createDom(bodyHtml, url);
  const { window } = dom;
  window.eval(editorUtilsSource);
  window._editorUtils.ensureStableEditableIds();
  const target = window.document.querySelector(selector);
  return target ? target.getAttribute('data-edit-id') : null;
}

function installEditorCoreStubs(window) {
  function HistoryManager() {
    this.isRestoring = false;
  }
  HistoryManager.prototype.captureBaseline = function () {};
  HistoryManager.prototype.recordState = function () {};
  HistoryManager.prototype.undo = function () {};
  HistoryManager.prototype.redo = function () {};

  window.HistoryManager = HistoryManager;
  window.RichTextToolbar = {
    init() {},
    syncFontIndicators() {},
    savedRange: null,
  };
  window.BoxManager = {
    init() {},
    _injectControls() {},
    createTextBox() {},
    createImageBox() {},
  };
}

describe('stable editable ids', () => {
  it('assigns deterministic ids to ordinary editables while skipping quiz option roots', () => {
    const bodyHtml = `
      <div class="deck">
        <div class="slide active" data-slide="1">
          <div class="header-module">方法模块</div>
          <div class="header-title">普通标题</div>
          <div class="card-title">普通卡片标题</div>
          <div class="card-desc" data-edit-id="fixed-card">保留显式 id</div>
          <div class="quiz-annotation">
            <div class="qa-option-text">保持 quiz 专属恢复链路</div>
          </div>
        </div>
      </div>`;

    const firstId = predictStableId(bodyHtml, '.header-title');
    const secondId = predictStableId(bodyHtml, '.header-title');

    assert.ok(firstId, 'expected ordinary editable roots without source ids to receive a stable id');
    assert.equal(secondId, firstId, 'expected the same deck structure to produce the same stable id on every load');

    const dom = createDom(bodyHtml);
    const { window } = dom;
    window.eval(editorUtilsSource);
    window._editorUtils.ensureStableEditableIds();
    window._editorUtils.ensureStableEditableIds();

    assert.equal(
      window.document.querySelector('.header-title').getAttribute('data-edit-id'),
      firstId,
      'expected repeated preparation to be idempotent rather than regenerating ids',
    );
    assert.equal(
      window.document.querySelector('.card-desc').getAttribute('data-edit-id'),
      'fixed-card',
      'expected explicit source ids to remain untouched',
    );
    assert.equal(
      window.document.querySelector('.qa-option-text').getAttribute('data-edit-id'),
      null,
      'expected quiz answer option roots to keep their dedicated restore path instead of entering the generic stable-id flow',
    );
  });

  it('treats example-card option text as a generic editable root while keeping quiz option text on the dedicated path', () => {
    const bodyHtml = `
      <div class="deck">
        <div class="slide active" data-slide="1">
          <section class="example-card">
            <button type="button" class="qa-option example-card__option" data-option-value="A">
              <span class="qa-option-label">A</span>
              <span class="qa-option-text" data-edit-id="example-option-a">Example option text</span>
            </button>
          </section>

          <div class="quiz-annotation">
            <button type="button" class="qa-option" data-option="A">
              <span class="qa-option-label">A</span>
              <span class="qa-option-text">Quiz option text</span>
            </button>
          </div>
        </div>
      </div>`;

    const dom = createDom(bodyHtml);
    const { window } = dom;
    window.eval(editorUtilsSource);

    const exampleOption = window.document.querySelector('.example-card .qa-option-text');
    const quizOption = window.document.querySelector('.quiz-annotation .qa-option-text');
    const candidates = window._editorUtils.getEditableCandidates();

    assert.ok(exampleOption, '测试夹具必须提供 example-card 选项文本');
    assert.ok(quizOption, '测试夹具必须提供 quiz 选项文本');
    assert.equal(candidates.includes(exampleOption), true, 'expected example-card option text to enter the generic editable candidate set even though it sits inside a button');
    assert.equal(candidates.includes(quizOption), false, 'expected quiz option text to stay out of the generic editable candidate set');
  });

  it('restores localStorage content for generated stable ids before editor-core finishes booting', () => {
    const bodyHtml = `
      <div class="deck">
        <div class="slide active" data-slide="1">
          <div class="header-title">原始标题</div>
        </div>
      </div>`;

    const predictedId = predictStableId(bodyHtml, '.header-title');
    const dom = createDom(bodyHtml);
    const { window } = dom;

    window.eval(editorUtilsSource);
    const storageKey = window._editorUtils.storageKey('e:' + predictedId);
    window.localStorage.setItem(storageKey, '<em>已恢复标题</em>');

    installEditorCoreStubs(window);
    window.eval(editorPersistenceSource);
    window.eval(editorCoreSource);

    const title = window.document.querySelector('.header-title');
    assert.equal(
      title.getAttribute('data-edit-id'),
      predictedId,
      'expected editor-core to prepare the same stable id before restoreAllElements executes',
    );
    assert.equal(
      title.innerHTML,
      '<em>已恢复标题</em>',
      'expected restoreAllElements to hit ordinary editable roots that originally had no source data-edit-id',
    );
  });

  it('lets annotation-store apply generic element payloads onto ordinary roots without source ids under the real script order', async () => {
    const bodyHtml = `
      <div class="deck">
        <div class="slide active" data-slide="1">
          <div class="header-title">原始标题</div>
        </div>
      </div>`;

    const predictedId = predictStableId(bodyHtml, '.header-title', 'file:///D:/Projects/html-slides/deck.html');
    const dom = createDom(bodyHtml, 'file:///D:/Projects/html-slides/deck.html');
    const { window } = dom;

    window.indexedDB = {
      open() {
        throw new Error('indexeddb-disabled-for-test');
      },
    };

    const originalAppendChild = window.document.head.appendChild.bind(window.document.head);
    window.document.head.appendChild = (node) => {
      if (node.tagName === 'SCRIPT' && /deck\.annotations\.js$/i.test(node.src || '')) {
        window.__annotationData = {
          version: 1,
          title: 'stable-id-deck',
          elements: {
            [predictedId]: '<strong>来自 sidecar</strong>',
          },
          answerKeys: [],
          deletedNotes: [],
        };
        queueMicrotask(() => {
          if (typeof node.onload === 'function') node.onload();
        });
        return node;
      }
      return originalAppendChild(node);
    };

    // annotation-store.js has been removed; skip eval.

    await Promise.resolve();
  window.eval(editorUtilsSource);
  await Promise.resolve();
  await Promise.resolve();

    const title = window.document.querySelector('.header-title');
    assert.equal(
      title.getAttribute('data-edit-id'),
      predictedId,
      'expected annotation-store to prepare deterministic ids before applying generic element payloads',
    );
    assert.equal(
      title.innerHTML,
      '<strong>来自 sidecar</strong>',
      'expected sidecar restore to reach ordinary roots that originally lacked source ids',
    );
  });
});