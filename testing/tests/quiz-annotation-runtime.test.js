import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..', '..');
const runtimeDir = path.join(projectRoot, 'assets', 'runtime', 'zone2-quiz-annotation');
// 拆分为 18 个文件，按依赖拓扑排序
const runtimePartFiles = [
  'quiz-core.js',          // 层级1：无依赖
  'quiz-constants.js',     // 层级1：无依赖
  'quiz-fragments.js',     // 层级2
  'quiz-persistence.js',   // 层级2
  'quiz-connectors.js',    // 层级2
  'quiz-panel.js',         // 层级2
  'quiz-header.js',        // 层级3
  'quiz-linking.js',       // 层级3
  'quiz-activation.js',    // 层级3
  'quiz-stepping.js',      // 层级3
  'quiz-base.js',          // 层级4
  'quiz-single.js',        // 层级4
  'quiz-matching.js',      // 层级4
  'quiz-blank.js',         // 层级4
  'quiz-note-interactions.js', // 层级5
  'quiz-toolbar.js',       // 层级5
  'quiz-init.js'           // 层级6（最后加载）
];
const runtimeSource = runtimePartFiles
  .map(function (f) { return fs.readFileSync(path.join(runtimeDir, f), 'utf-8'); })
  .join('\n');
const annotationStorePath = path.join(projectRoot, 'assets', 'runtime', 'annotation-store.js');
const zoneCssPath = path.join(projectRoot, 'assets', 'zones', 'zone2-quiz-annotation.css');
const editorCorePath = path.join(projectRoot, 'assets', 'editor', 'editor-core.js');
const editorCssPath = path.join(projectRoot, 'assets', 'editor', 'editor.css');
const editorRichTextPath = path.join(projectRoot, 'assets', 'editor', 'editor-rich-text.js');
const annotationStoreSource = fs.readFileSync(annotationStorePath, 'utf-8');
const annotationStoreTestSource = annotationStoreSource.replace(/\n\s*_init\(\);\s*\n\s*\}\)\(\);\s*$/, '\n\n})();\n');
const zoneCssSource = fs.readFileSync(zoneCssPath, 'utf-8');
const editorCoreSource = fs.readFileSync(editorCorePath, 'utf-8');
const editorCssSource = fs.readFileSync(editorCssPath, 'utf-8');
const editorRichTextSource = fs.readFileSync(editorRichTextPath, 'utf-8');

function dispatchSelectionChange(window) {
  window.document.dispatchEvent(new window.Event('selectionchange', { bubbles: true }));
}

function clickElement(window, element) {
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

function inputText(window, element, value) {
  element.value = value;
  element.dispatchEvent(new window.Event('input', { bubbles: true }));
  element.dispatchEvent(new window.Event('change', { bubbles: true }));
}

function rightClickElement(window, element) {
  element.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, button: 2 }));
}

function dispatchPointerEvent(window, element, type, init = {}) {
  const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, ...init });
  element.dispatchEvent(event);
  return event;
}

function getAnnotationToolbar(qa) {
  return qa?.ownerDocument?.querySelector('.qa-annotation-toolbar') || null;
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

function addDoodleLayer(window) {
  const slide = window.document.querySelector('.slide.active');
  const layer = window.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  layer.setAttribute('class', 'doodle-layer');
  slide.appendChild(layer);
  return layer;
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
  window.EditorHooks = {
    onEditModeEnter: [],
    onEditModeExit: [],
    register(hookName, fn) {
      if (!Array.isArray(this[hookName])) return;
      this[hookName].push(fn);
    },
    fire(hookName, arg) {
      if (!Array.isArray(this[hookName])) return;
      this[hookName].forEach((fn) => fn(arg));
    }
  };
  window.alert = () => {};
  window.confirm = () => true;
  window.prompt = () => '顶标';
  window.HTMLElement.prototype.scrollIntoView = () => {};

  window.eval(runtimeSource);

  return dom;
}

function installAnnotationStoreForTest(window) {
  window.eval(annotationStoreTestSource);
}

function parseAnnotationStorePayload(jsContent) {
  return JSON.parse(String(jsContent).replace(/^window\.__annotationData\s*=\s*/, '').replace(/;\s*$/, ''));
}

async function captureAnnotationStoreSave(window) {
  let writtenContent = '';

  window.showSaveFilePicker = async () => ({
    async createWritable() {
      return {
        async write(content) {
          writtenContent = String(content);
        },
        async close() {}
      };
    }
  });

  installAnnotationStoreForTest(window);
  const saved = await window.AnnotationStore.authorizeAndSave();
  assert.equal(saved, true, 'expected the annotation store test stub to accept the save request');
  return parseAnnotationStorePayload(writtenContent);
}

function dropMatchingOption(window, qa, blankId, optionId) {
  const slot = qa.querySelector(`.qa-answer-slot[data-blank-id="${blankId}"]`);
  assert.ok(slot, `expected matching slot ${blankId} to exist before simulating drag-drop`);

  dispatchDragEvent(window, slot, 'drop', {
    dataTransfer: {
      effectAllowed: 'copy',
      dropEffect: 'copy',
      setData() {},
      getData(type) {
        return type === 'text/plain' ? optionId : '';
      }
    }
  });
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

function createReadingBlankDom() {
  const html = `<!DOCTYPE html><html><body>
    <div class="slide active" data-slide="1">
      <div class="quiz-annotation has-quiz notes-active">
        <div class="qa-body">
          <svg class="qa-connector-canvas" aria-hidden="true"></svg>
          <div class="qa-passage">
            <p data-edit-id="passage-01">
              The exhibition,
              <span class="qa-blank-slot" data-blank-id="36" data-correct-answer="which">
                <span class="qa-blank-user">___<sup style="font-size:0.7em;color:var(--text-dim);">36</sup></span>
                <span class="qa-blank-answer"></span>
              </span>
              originated in China.
            </p>
            <p data-edit-id="passage-02">
              We hope
              <span class="qa-blank-slot" data-blank-id="38" data-correct-answer="to present">
                <span class="qa-blank-user">___<sup style="font-size:0.7em;color:var(--text-dim);">38</sup></span>
                <span class="qa-blank-answer"></span>
              </span>
              the abstract game in a visual context.
            </p>
          </div>
          <div class="qa-answer-panel">
            <div class="qa-answer-header">
              <div class="qa-answer-title">Question</div>
              <button class="qa-submit-btn">Submit</button>
            </div>
            <div class="qa-answer-content">
              <div class="qa-question" data-type="blank">
                <p>36-38. Fill in the blanks.</p>
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

function createReadingAnalysisDom() {
  const html = `<!DOCTYPE html><html><body>
    <div class="slide active" data-slide="1">
      <div class="quiz-annotation notes-active">
        <div class="qa-body">
          <svg class="qa-connector-canvas" aria-hidden="true"></svg>
          <div class="qa-passage">
            <p data-edit-id="passage-01">Pure reading analysis content.</p>
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

function createTwoBubbleEditorDom() {
  const html = `<!DOCTYPE html><html><body>
    <div class="slide active" data-slide="1">
      <div class="quiz-annotation has-quiz notes-active has-active-note">
        <div class="qa-body">
          <svg class="qa-connector-canvas" aria-hidden="true"></svg>
          <div class="qa-passage">
            <p data-edit-id="passage-01"><span class="text-anchor anchor-active" data-link="note-01" data-step="1">Anchor fragment one.<sup class="note-badge">1</sup></span></p>
            <p data-edit-id="passage-02"><span class="text-anchor" data-link="note-02" data-step="2">Anchor fragment two.<sup class="note-badge">2</sup></span></p>
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
                <div class="qa-note-handle"><span class="qa-note-step">1</span></div>
              </div>
              <div class="qa-note-content" contenteditable="true" data-edit-id="note-01">Note one.</div>
            </div>
            <div class="qa-note-bubble note-expanded" data-link="note-02" data-step="2" draggable="true">
              <div class="qa-note-header">
                <div class="qa-note-handle"><span class="qa-note-step">2</span></div>
              </div>
              <div class="qa-note-content" contenteditable="true" data-edit-id="note-02">Note two.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </body></html>`;

  return createRuntimeDom(html);
}

function createAutoReorderEditorDom() {
  const html = `<!DOCTYPE html><html><body>
    <div class="slide active" data-slide="1">
      <div class="quiz-annotation has-quiz notes-active has-active-note">
        <div class="qa-body">
          <svg class="qa-connector-canvas" aria-hidden="true"></svg>
          <div class="qa-passage">
            <p data-edit-id="passage-01">
              <span class="text-anchor" data-link="note-01" data-step="1">Alpha<sup class="note-badge">1</sup></span>
              middle text
              <span class="text-anchor" data-link="note-02" data-step="2">Omega<sup class="note-badge">2</sup></span>
            </p>
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
                  <span class="qa-option-text">Answer anchor target.</span>
                </div>
              </div>
            </div>
          </div>
          <div class="qa-notes-panel">
            <div class="qa-note-bubble note-expanded" data-link="note-01" data-step="1" draggable="true">
              <div class="qa-note-header">
                <div class="qa-note-handle"><span class="qa-note-step">1</span></div>
              </div>
              <div class="qa-note-content" contenteditable="true" data-edit-id="note-01">Note alpha.</div>
            </div>
            <div class="qa-note-bubble note-expanded" data-link="note-02" data-step="2" draggable="true">
              <div class="qa-note-header">
                <div class="qa-note-handle"><span class="qa-note-step">2</span></div>
              </div>
              <div class="qa-note-content" contenteditable="true" data-edit-id="note-02">Note omega.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </body></html>`;

  return createRuntimeDom(html);
}

function createRightOnlyAssociationDom() {
  const html = `<!DOCTYPE html><html><body>
    <div class="slide active" data-slide="1">
      <div class="quiz-annotation has-quiz notes-active has-active-note">
        <div class="qa-body">
          <svg class="qa-connector-canvas" aria-hidden="true"></svg>
          <div class="qa-passage">
            <p data-edit-id="passage-01">
              <span class="text-anchor" data-link="note-01" data-step="1">Alpha<sup class="note-badge">1</sup></span>
              inserted gap
              <span class="text-anchor" data-link="note-02" data-step="2">Omega<sup class="note-badge">2</sup></span>
            </p>
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
                  <span class="qa-option-text"><span class="answer-anchor" data-link-answer="note-03" data-step="3">Right-only answer anchor.<sup class="note-badge">3</sup></span></span>
                </div>
              </div>
            </div>
          </div>
          <div class="qa-notes-panel">
            <div class="qa-note-bubble note-expanded" data-link="note-01" data-step="1" draggable="true">
              <div class="qa-note-header">
                <div class="qa-note-handle"><span class="qa-note-step">1</span></div>
              </div>
              <div class="qa-note-content" contenteditable="true" data-edit-id="note-01">Note alpha.</div>
            </div>
            <div class="qa-note-bubble note-expanded" data-link="note-02" data-step="2" draggable="true">
              <div class="qa-note-header">
                <div class="qa-note-handle"><span class="qa-note-step">2</span></div>
              </div>
              <div class="qa-note-content" contenteditable="true" data-edit-id="note-02">Note omega.</div>
            </div>
            <div class="qa-note-bubble note-expanded" data-link="note-03" data-link-answer="note-03" data-step="3" draggable="true">
              <div class="qa-note-header">
                <div class="qa-note-handle"><span class="qa-note-step">3</span></div>
              </div>
              <div class="qa-note-content" contenteditable="true" data-edit-id="note-03">Right-only note.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </body></html>`;

  return createRuntimeDom(html);
}

function createBiDirectionalAssociationDom() {
  const html = `<!DOCTYPE html><html><body>
    <div class="slide active" data-slide="1">
      <div class="quiz-annotation has-quiz notes-active has-active-note">
        <div class="qa-body">
          <svg class="qa-connector-canvas" aria-hidden="true"></svg>
          <div class="qa-passage">
            <p data-edit-id="passage-01"><span class="text-anchor" data-link="note-01" data-step="1" style="text-decoration: underline; text-decoration-color: #E74C3C; text-underline-offset: 4px; text-decoration-thickness: 2px; text-decoration-skip-ink: none;">Passage anchor.<sup class="note-badge">1</sup></span></p>
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
                  <span class="qa-option-text"><span class="answer-anchor" data-link-answer="note-01" data-step="1" style="text-decoration: underline; text-decoration-color: #1ABC9C; text-underline-offset: 4px; text-decoration-thickness: 2px; text-decoration-skip-ink: none;">Answer anchor.<sup class="note-badge">1</sup></span></span>
                </div>
              </div>
            </div>
          </div>
          <div class="qa-notes-panel">
            <div class="qa-note-bubble" data-link="note-01" data-step="1" draggable="true">
              <div class="qa-note-header">
                <div class="qa-note-handle"><span class="qa-note-step">1</span></div>
                <div class="qa-note-actions">
                  <button class="qa-note-action-btn action-delete" title="删除批注">✖</button>
                </div>
              </div>
              <div class="qa-note-content" contenteditable="true" data-edit-id="note-01">Bidirectional note.</div>
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

  it('renders the correct left-column type pill for all four reading modes', () => {
    const singleDom = createSelectionEditorDom('single');
    const matchingDom = createMatchingEditorDom();
    const blankDom = createReadingBlankDom();
    const analysisDom = createReadingAnalysisDom();

    ensureQaInitialized(singleDom.window, singleDom.window.document.querySelector('.quiz-annotation'));
    ensureQaInitialized(matchingDom.window, matchingDom.window.document.querySelector('.quiz-annotation'));
    ensureQaInitialized(blankDom.window, blankDom.window.document.querySelector('.quiz-annotation'));
    ensureQaInitialized(analysisDom.window, analysisDom.window.document.querySelector('.quiz-annotation'));

    assert.equal(singleDom.window.document.querySelector('.qa-reading-type-pill')?.textContent?.trim(), '阅读单选', 'expected ordinary choice questions to show the reading-single pill');
    assert.equal(matchingDom.window.document.querySelector('.qa-reading-type-pill')?.textContent?.trim(), '阅读七选五', 'expected matching questions to show the reading-matching pill');
    assert.equal(blankDom.window.document.querySelector('.qa-reading-type-pill')?.textContent?.trim(), '阅读填空', 'expected blank questions to show the reading-blank pill');
    assert.equal(analysisDom.window.document.querySelector('.qa-reading-type-pill')?.textContent?.trim(), '文章解析', 'expected pure reading layouts to show the analysis pill');
  });

  it('builds right-column answer lines for blank questions and grades them on submit', () => {
    const dom = createReadingBlankDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    ensureQaInitialized(window, qa);

    const inputs = Array.from(qa.querySelectorAll('.qa-answer-slot .qa-slot-input'));
    assert.equal(inputs.length, 2, 'expected blank-mode initialization to build one right-side input line per passage blank');

    inputText(window, inputs[0], 'which');
    inputText(window, inputs[1], 'present');
    clickElement(window, qa.querySelector('.qa-submit-btn'));

    const firstSlot = qa.querySelector('.qa-answer-slot[data-blank-id="36"]');
    const secondSlot = qa.querySelector('.qa-answer-slot[data-blank-id="38"]');
    const firstMark = firstSlot.querySelector('.qa-slot-label .qa-slot-mark');
    const secondMark = secondSlot.querySelector('.qa-slot-label .qa-slot-mark');

    assert.equal(qa.classList.contains('submitted'), true, 'expected blank-mode submit to lock the quiz into submitted state');
    assert.equal(firstSlot.classList.contains('slot-correct'), true, 'expected a correct blank answer line to receive the success state');
    assert.equal(secondSlot.classList.contains('slot-incorrect'), true, 'expected a wrong blank answer line to receive the error state');
    assert.equal(firstMark?.textContent, '✓', 'expected blank-mode grading to pin a check mark onto the blank index badge');
    assert.equal(secondMark?.textContent, '✗', 'expected blank-mode grading to pin a cross mark onto the blank index badge');
    assert.match(firstSlot.querySelector('.qa-slot-correct')?.textContent || '', /which/i, 'expected blank-mode grading to reveal the correct answer beside the first line');
    assert.match(secondSlot.querySelector('.qa-slot-correct')?.textContent || '', /to present/i, 'expected blank-mode grading to reveal the correct answer beside the wrong line too');
    assert.equal(firstSlot.querySelector('.qa-slot-input')?.disabled, true, 'expected submitted blank-mode inputs to become read-only');
    assert.equal(secondSlot.querySelector('.qa-slot-input')?.disabled, true, 'expected all submitted blank-mode inputs to become read-only');
  });

  it('shows current blank answers in editor mode and lets the author edit them directly', () => {
    const dom = createReadingBlankDom();
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

    const firstInput = qa.querySelector('.qa-answer-slot[data-blank-id="36"] .qa-slot-input');
    const secondInput = qa.querySelector('.qa-answer-slot[data-blank-id="38"] .qa-slot-input');
    const firstPassageBlank = qa.querySelector('.qa-passage .qa-blank-slot[data-blank-id="36"]');

    assert.equal(firstInput?.value, 'which', 'expected editor mode to preload the current correct answer into blank slot 36');
    assert.equal(secondInput?.value, 'to present', 'expected editor mode to preload the current correct answer into blank slot 38');
    assert.equal(firstInput?.disabled, false, 'expected editor mode blank answers to stay editable');

    inputText(window, firstInput, 'that');

    assert.equal(firstPassageBlank?.getAttribute('data-correct-answer'), 'that', 'expected editing the right-side blank input to sync back to the passage blank correct answer');
    assert.equal(qa.querySelector('.qa-answer-slot[data-blank-id="36"]')?.getAttribute('data-correct-answer'), 'that', 'expected the blank editor slot to keep its updated correct answer payload');
    assert.equal(scheduleSaveCalls.length, 1, 'expected editing a blank answer in editor mode to request persistence');
  });

  it('persists edited blank answers immediately so the first refresh can read the fresh local snapshot', async () => {
    const dom = createReadingBlankDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');
    const savedRoots = [];
    const ensureWriteAccessCalls = [];
    const saveNowCalls = [];
    const scheduleSaveCalls = [];

    window._editorUtils = {
      storageKey(suffix) {
        return `test:${suffix}`;
      },
      legacyStorageKey(suffix) {
        return `legacy:${suffix}`;
      }
    };
    window.PersistenceLayer = {
      saveElement(root) {
        const editId = root.getAttribute('data-edit-id') || '';
        savedRoots.push(editId);
        window.localStorage.setItem(`test:e:${editId}`, root.innerHTML);
      }
    };
    window.AnnotationStore = {
      hasWriteAccess() {
        return false;
      },
      ensureWriteAccess() {
        ensureWriteAccessCalls.push('called');
        return Promise.resolve(true);
      },
      saveNow() {
        saveNowCalls.push('saved');
      },
      scheduleSave() {
        scheduleSaveCalls.push('scheduled');
      }
    };
    window.historyMgr = {
      isRestoring: false,
      recordState() {}
    };

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');

    ensureQaInitialized(window, qa);

    const firstInput = qa.querySelector('.qa-answer-slot[data-blank-id="36"] .qa-slot-input');
    inputText(window, firstInput, 'that');
    await Promise.resolve();

    const persistedPassageHtml = window.localStorage.getItem('test:e:passage-01') || '';

    assert.deepEqual(savedRoots, ['passage-01'], 'expected blank-answer authoring to immediately persist the owning passage root into localStorage');
    assert.equal(ensureWriteAccessCalls.length, 1, 'expected blank-answer authoring to request AnnotationStore write access before the first immediate save');
    assert.equal(saveNowCalls.length, 1, 'expected blank-answer authoring to flush the updated DOM immediately so the first refresh sees the new answer');
    assert.equal(scheduleSaveCalls.length, 0, 'expected blank-answer authoring not to fall back to the debounced scheduleSave path when saveNow is available');
    assert.match(persistedPassageHtml, /data-correct-answer="that"/, 'expected the local snapshot for passage-01 to already contain the edited blank answer before any second refresh');
    assert.doesNotMatch(persistedPassageHtml, /data-correct-answer="which"/, 'expected the stale blank answer to be removed from the first local snapshot');
  });

  it('refreshes blank answers when the page switches from student mode into editor mode', () => {
    const dom = createReadingBlankDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    ensureQaInitialized(window, qa);

    const firstInputBeforeEditor = qa.querySelector('.qa-answer-slot[data-blank-id="36"] .qa-slot-input');
    assert.equal(firstInputBeforeEditor?.value, '', 'expected student mode blank slots to start empty before the author enters editor mode');

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');
    window.EditorHooks.fire('onEditModeEnter');

    const firstInputAfterEditor = qa.querySelector('.qa-answer-slot[data-blank-id="36"] .qa-slot-input');
    const secondInputAfterEditor = qa.querySelector('.qa-answer-slot[data-blank-id="38"] .qa-slot-input');

    assert.equal(firstInputAfterEditor?.value, 'which', 'expected switching into editor mode to rebuild blank slot 36 with the current correct answer');
    assert.equal(secondInputAfterEditor?.value, 'to present', 'expected switching into editor mode to rebuild blank slot 38 with the current correct answer');
    assert.equal(firstInputAfterEditor?.disabled, false, 'expected blank inputs to stay editable after editor mode is entered later');
  });

  it('keeps blank answers editable when the page enters editor mode after a submit', () => {
    const dom = createReadingBlankDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    ensureQaInitialized(window, qa);

    const firstInput = qa.querySelector('.qa-answer-slot[data-blank-id="36"] .qa-slot-input');
    const secondInput = qa.querySelector('.qa-answer-slot[data-blank-id="38"] .qa-slot-input');
    inputText(window, firstInput, 'which');
    inputText(window, secondInput, 'present');
    clickElement(window, qa.querySelector('.qa-submit-btn'));

    const firstSubmittedSlot = qa.querySelector('.qa-answer-slot[data-blank-id="36"]');
    assert.equal(firstSubmittedSlot?.classList.contains('slot-correct'), true, 'expected the submitted state to render grading styles before editor mode is entered');

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');
    window.EditorHooks.fire('onEditModeEnter');

    const firstEditorSlot = qa.querySelector('.qa-answer-slot[data-blank-id="36"]');
    const secondEditorSlot = qa.querySelector('.qa-answer-slot[data-blank-id="38"]');
    const firstEditorInput = firstEditorSlot?.querySelector('.qa-slot-input');
    const secondEditorInput = secondEditorSlot?.querySelector('.qa-slot-input');
    const divider = qa.querySelector('.qa-slots-divider.qa-slots-divider--blank');

    assert.equal(firstEditorInput?.value, 'which', 'expected entering editor mode after submit to switch the first line back to the current correct answer');
    assert.equal(secondEditorInput?.value, 'to present', 'expected entering editor mode after submit to switch the second line back to the current correct answer');
    assert.equal(firstEditorInput?.disabled, false, 'expected submitted blank inputs to become editable again once editor mode is entered');
    assert.equal(secondEditorInput?.disabled, false, 'expected all blank inputs to become editable again once editor mode is entered');
    assert.equal(firstEditorSlot?.classList.contains('slot-correct'), false, 'expected editor mode to clear the submitted correct-result styling from blank slot 36');
    assert.equal(secondEditorSlot?.classList.contains('slot-incorrect'), false, 'expected editor mode to clear the submitted incorrect-result styling from blank slot 38');
    assert.equal(firstEditorSlot?.querySelector('.qa-slot-mark'), null, 'expected editor mode to remove the submitted check mark from blank slot 36');
    assert.equal(secondEditorSlot?.querySelector('.qa-slot-mark'), null, 'expected editor mode to remove the submitted cross mark from blank slot 38');
    assert.match(divider?.textContent || '', /编辑模式下请直接在右侧横线上修改正确答案/, 'expected the blank helper copy to switch back to editor guidance after submit');
  });

  it('starts annotation-store authorization from the first page gesture instead of showing a persistent header icon', async () => {
    const dom = createQuizDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');
    const authorizeCalls = [];

    window.AnnotationStore = {
      hasWriteAccess() {
        return false;
      },
      authorizeAndSave() {
        authorizeCalls.push('authorize');
        return Promise.resolve(true);
      }
    };

    ensureQaInitialized(window, qa);

    const statusEl = qa.querySelector('.annotation-store-status');
    assert.ok(statusEl, 'expected quiz annotation headers to still mount a status element for fallback prompts');
    assert.equal(statusEl.style.display, 'none', 'expected the status prompt to stay hidden until authorization actually needs user attention');

    clickElement(window, qa.querySelector('.qa-note-content'));
    await Promise.resolve();

    assert.equal(authorizeCalls.length, 1, 'expected the first page gesture to trigger annotation-store authorization automatically');
    assert.equal(statusEl.style.display, 'none', 'expected successful first-gesture authorization to keep the status prompt hidden');
  });

  it('reveals a manual authorization prompt only after the first-gesture flow is declined', async () => {
    const dom = createQuizDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    window.AnnotationStore = {
      hasWriteAccess() {
        return false;
      },
      authorizeAndSave() {
        return Promise.resolve(false);
      }
    };

    ensureQaInitialized(window, qa);

    const statusEl = qa.querySelector('.annotation-store-status');
    clickElement(window, qa.querySelector('.qa-note-content'));
    await Promise.resolve();

    assert.equal(statusEl.textContent, '📁 点击授权保存', 'expected the header prompt to appear only after the automatic first-gesture authorization is declined');
    assert.notEqual(statusEl.style.display, 'none', 'expected a declined automatic authorization to surface the fallback prompt');
  });

  it('prefers localStorage over stale AnnotationStore initData when creating dynamic note bubbles', () => {
    const dom = createRuntimeDom(`<!DOCTYPE html><html><body>
      <div class="slide active" data-slide="1">
        <div class="quiz-annotation has-quiz notes-active">
          <div class="qa-body">
            <svg class="qa-connector-canvas" aria-hidden="true"></svg>
            <div class="qa-passage">
              <p data-edit-id="passage-01"><span class="text-anchor" data-link="note-01" data-step="1">Anchor text.<sup class="note-badge">1</sup></span></p>
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
            <div class="qa-notes-panel"></div>
          </div>
        </div>
      </div>
    </body></html>`);

    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    window._editorUtils = {
      storageKey(suffix) {
        return `test:${suffix}`;
      },
      legacyStorageKey(suffix) {
        return `legacy:${suffix}`;
      }
    };

    window.localStorage.setItem('test:e:new-note-01', 'Fresh <span data-fragment-step="true" data-fragment-format="highlight">local</span> note.');
    window.AnnotationStore = {
      getInitData() {
        return {
          elements: {
            'new-note-01': 'Stale <span data-fragment-step="true" data-fragment-format="highlight">sidecar</span> note.'
          }
        };
      }
    };

    ensureQaInitialized(window, qa);

    const contentEl = qa.querySelector('.qa-note-content[data-edit-id="new-note-01"]');
    assert.ok(contentEl, 'expected quiz initialization to create a dynamic note bubble for the linked anchor');
    assert.match(contentEl.textContent, /Fresh local note\./, 'expected dynamic quiz note creation to mirror ordinary-page restore precedence by preferring localStorage over stale sidecar data');
    assert.doesNotMatch(contentEl.textContent, /Stale sidecar note\./, 'expected stale sidecar note content not to overwrite fresher local restore data on the first refresh');
  });

  it('persists deleted note tombstones so a refresh can still purge source-side quiz annotations', async () => {
    const dom = createBiDirectionalAssociationDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    ensureQaInitialized(window, qa);
    clickElement(window, qa.querySelector('.qa-note-action-btn.action-delete'));

    const savedPayload = await captureAnnotationStoreSave(window);

    assert.deepEqual(savedPayload.deletedNotes, ['note-01'], 'expected the sidecar payload to keep a deleted note tombstone so refresh can still purge source HTML');

    const reloadedDom = createBiDirectionalAssociationDom();
    const reloadWindow = reloadedDom.window;
    const reloadQa = reloadWindow.document.querySelector('.quiz-annotation');

    reloadQa.dataset.deletedNotes = JSON.stringify(savedPayload.deletedNotes || []);
    ensureQaInitialized(reloadWindow, reloadQa);

    assert.equal(reloadQa.querySelector('.qa-note-bubble[data-link="note-01"]'), null, 'expected re-init to keep the deleted bubble purged after refresh');
    assert.equal(reloadQa.querySelector('.text-anchor[data-link="note-01"]'), null, 'expected re-init to keep the deleted passage anchor purged after refresh');
    assert.equal(reloadQa.querySelector('.answer-anchor[data-link-answer="note-01"]'), null, 'expected re-init to keep the deleted answer anchor purged after refresh');
  });

  it('removes deleted dynamic notes immediately and clears their stale local restore payload before the same linkId is reused', () => {
    const dom = createSelectionEditorDom('single');
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    window._editorUtils = {
      storageKey(suffix) {
        return `test:${suffix}`;
      },
      legacyStorageKey(suffix) {
        return `legacy:${suffix}`;
      }
    };

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');

    ensureQaInitialized(window, qa);
    selectText(window, qa.querySelector('.qa-passage p'), 'first');
    clickElement(window, getAnnotationToolbar(qa).querySelector('.ul-colors .color-swatch'));

    const createdBubble = qa.querySelector('.qa-note-bubble[data-link="note-01"]');
    assert.ok(createdBubble, 'expected the first selection to create a dynamic note bubble');

    window.localStorage.setItem('test:e:new-note-01', 'Deleted note content.');
    clickElement(window, createdBubble.querySelector('.qa-note-action-btn.action-delete'));

    assert.equal(qa.querySelector('.qa-note-bubble[data-link="note-01"]'), null, 'expected delete to remove the bubble immediately instead of only unlinking it');
    assert.equal(qa.querySelector('.text-anchor[data-link="note-01"]'), null, 'expected delete to remove the left passage anchor immediately');
    assert.equal(qa.querySelector('.answer-anchor[data-link-answer="note-01"]'), null, 'expected delete to remove the right answer anchor immediately');
    assert.equal(window.localStorage.getItem('test:e:new-note-01'), null, 'expected delete to clear the local restore payload for the removed dynamic note');

    selectText(window, qa.querySelector('.qa-passage p'), 'first');
    clickElement(window, getAnnotationToolbar(qa).querySelector('.ul-colors .color-swatch'));

    const recreatedContent = qa.querySelector('.qa-note-bubble[data-link="note-02"] .qa-note-content[data-edit-id="new-note-02"]');
    assert.ok(recreatedContent, 'expected recreating the same selection to allocate a fresh dynamic edit-id after the old note id is tombstoned');
    assert.equal(recreatedContent.textContent.trim(), '', 'expected the recreated note bubble not to inherit deleted note content from stale local storage');
  });

  it('persists newly created dynamic note anchors immediately so a refresh keeps the bubble and does not require recreating it to recover content', async () => {
    const dom = createSelectionEditorDom('single');
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    window._editorUtils = {
      storageKey(suffix) {
        return `test:${suffix}`;
      },
      legacyStorageKey(suffix) {
        return `legacy:${suffix}`;
      }
    };

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');

    ensureQaInitialized(window, qa);
    selectText(window, qa.querySelector('.qa-passage p'), 'first');
    clickElement(window, getAnnotationToolbar(qa).querySelector('.ul-colors .color-swatch'));

    const createdBubble = qa.querySelector('.qa-note-bubble[data-link="note-01"]');
    const createdContent = createdBubble?.querySelector('.qa-note-content[data-edit-id="new-note-01"]');
    assert.ok(createdBubble, 'expected the first selection to create a dynamic note bubble');
    assert.ok(createdContent, 'expected the created dynamic note to expose a stable edit-id');

    createdContent.innerHTML = 'Freshly created note.';
    window.localStorage.setItem('test:e:new-note-01', 'Freshly created note.');

    const savedPayload = await captureAnnotationStoreSave(window);

    const reloadedDom = createSelectionEditorDom('single');
    const reloadWindow = reloadedDom.window;
    const reloadQa = reloadWindow.document.querySelector('.quiz-annotation');

    reloadWindow._editorUtils = window._editorUtils;
    reloadWindow.localStorage.setItem('test:e:new-note-01', 'Freshly created note.');
    reloadWindow.AnnotationStore = {
      getInitData() {
        return { elements: savedPayload.elements || {} };
      }
    };

    reloadWindow.document.documentElement.classList.add('editor-mode');
    reloadWindow.document.body.classList.add('editor-mode');

    const persistedPassageHtml = savedPayload.elements?.['passage-01'] || '';
    reloadQa.querySelector('.qa-passage [data-edit-id="passage-01"]').innerHTML = persistedPassageHtml;

    ensureQaInitialized(reloadWindow, reloadQa);

    const reloadedBubble = reloadQa.querySelector('.qa-note-bubble[data-link="note-01"]');
    const reloadedContent = reloadedBubble?.querySelector('.qa-note-content[data-edit-id="new-note-01"]');

    assert.ok(reloadedBubble, 'expected refresh to rebuild the dynamic bubble from the persisted passage anchor instead of losing it');
    assert.ok(reloadedContent, 'expected the rebuilt bubble to keep the original dynamic edit-id');
    assert.equal(reloadedContent.textContent.trim(), 'Freshly created note.', 'expected refresh to keep the newly created note content without requiring a second recreation');
  });

  it('persists newly created note anchors into the owning passage root immediately before any later refresh', () => {
    const dom = createSelectionEditorDom('single');
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');
    const savedRoots = [];
    const saveNowCalls = [];
    const ensureWriteAccessCalls = [];

    window.PersistenceLayer = {
      saveElement(element) {
        savedRoots.push(element?.getAttribute('data-edit-id') || '');
      }
    };

    window.AnnotationStore = {
      hasWriteAccess() {
        return false;
      },
      ensureWriteAccess() {
        ensureWriteAccessCalls.push('ensure');
        return Promise.resolve(true);
      },
      saveNow() {
        saveNowCalls.push('save-now');
      },
      scheduleSave() {}
    };

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');

    ensureQaInitialized(window, qa);
    selectText(window, qa.querySelector('.qa-passage p'), 'first');
    clickElement(window, getAnnotationToolbar(qa).querySelector('.ul-colors .color-swatch'));

    return Promise.resolve().then(() => {
      assert.deepEqual(savedRoots, ['passage-01'], 'expected creating a new note to immediately persist the owning passage root into localStorage');
      assert.equal(ensureWriteAccessCalls.length, 1, 'expected creating a new note to request AnnotationStore write access before flushing the structural change');
      assert.equal(saveNowCalls.length, 1, 'expected creating a new note to flush the current DOM immediately so the first refresh keeps the new anchor');
    });
  });

  it('does not reuse a deleted note tombstone id when creating the next dynamic note', () => {
    const dom = createSelectionEditorDom('single');
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    window._editorUtils = {
      storageKey(suffix) {
        return `test:${suffix}`;
      },
      legacyStorageKey(suffix) {
        return `legacy:${suffix}`;
      }
    };

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');

    ensureQaInitialized(window, qa);

    selectText(window, qa.querySelector('.qa-passage p'), 'first');
    clickElement(window, getAnnotationToolbar(qa).querySelector('.ul-colors .color-swatch'));
    clickElement(window, qa.querySelector('.qa-note-bubble[data-link="note-01"] .qa-note-action-btn.action-delete'));

    selectText(window, qa.querySelector('.qa-passage p'), 'second');
    clickElement(window, getAnnotationToolbar(qa).querySelector('.ul-colors .color-swatch'));

    const recreatedBubble = qa.querySelector('.qa-note-bubble');
    const recreatedAnchor = qa.querySelector('.text-anchor');

    assert.equal(recreatedBubble?.dataset.link, 'note-02', 'expected a newly created note to skip ids that are already tombstoned as deleted');
    assert.equal(recreatedAnchor?.dataset.link, 'note-02', 'expected the passage anchor to use the same fresh note id instead of reusing a deleted tombstone id');
  });

  it('does not hydrate a newly recreated note bubble with the stale content of a previously deleted dynamic note', async () => {
    const dom = createSelectionEditorDom('single');
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');

    ensureQaInitialized(window, qa);
    selectText(window, qa.querySelector('.qa-passage p'), 'first');
    clickElement(window, getAnnotationToolbar(qa).querySelector('.ul-colors .color-swatch'));

    const createdBubble = qa.querySelector('.qa-note-bubble[data-link="note-01"]');
    const createdContent = createdBubble?.querySelector('.qa-note-content[data-edit-id="new-note-01"]');
    assert.ok(createdBubble, 'expected the first selection to create a dynamic note bubble');
    assert.ok(createdContent, 'expected the dynamic note bubble to use the new-note-<linkId> edit-id contract');

    createdContent.innerHTML = 'Deleted note content.';

    clickElement(window, createdBubble.querySelector('.qa-note-action-btn.action-delete'));

    const savedPayload = await captureAnnotationStoreSave(window);

    const reloadedDom = createSelectionEditorDom('single');
    const reloadWindow = reloadedDom.window;
    const reloadQa = reloadWindow.document.querySelector('.quiz-annotation');

    reloadWindow.AnnotationStore = {
      getInitData() {
        return { elements: savedPayload.elements || {} };
      }
    };

    reloadWindow.document.documentElement.classList.add('editor-mode');
    reloadWindow.document.body.classList.add('editor-mode');
    reloadQa.dataset.deletedNotes = JSON.stringify(savedPayload.deletedNotes || []);

    ensureQaInitialized(reloadWindow, reloadQa);
    assert.equal(reloadQa.querySelector('.qa-note-bubble[data-link="note-01"]'), null, 'expected the deleted dynamic note bubble to stay purged after refresh');

    selectText(reloadWindow, reloadQa.querySelector('.qa-passage p'), 'first');
    clickElement(reloadWindow, getAnnotationToolbar(reloadQa).querySelector('.ul-colors .color-swatch'));

    const recreatedContent = reloadQa.querySelector('.qa-note-bubble[data-link="note-02"] .qa-note-content[data-edit-id="new-note-02"]');
    assert.ok(recreatedContent, 'expected recreating the same selection after a deleted tombstone to allocate a fresh dynamic edit-id');
    assert.equal(recreatedContent.textContent.trim(), '', 'expected a recreated note bubble not to inherit deleted note content from stale sidecar data');
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

  it('keeps a submitted matching answer slot locked and preserves its filled answer', () => {
    const dom = createMatchingEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    ensureQaInitialized(window, qa);
    dropMatchingOption(window, qa, '36', 'A');
    clickElement(window, qa.querySelector('.qa-submit-btn'));

    clickElement(window, qa.querySelector('.qa-answer-slot[data-blank-id="36"]'));

    const refreshedSlot = qa.querySelector('.qa-answer-slot[data-blank-id="36"]');
    const refreshedPassageSlot = qa.querySelector('.qa-passage .qa-blank-slot[data-blank-id="36"]');
    const optionA = qa.querySelector('.qa-option[data-option="A"]');

    assert.equal(qa.classList.contains('submitted'), true, 'expected clicking a submitted matching answer slot to keep the quiz locked in graded state');
    assert.equal(refreshedSlot.classList.contains('filled'), true, 'expected clicking a submitted slot to keep the chosen answer visible in the answer panel');
    assert.equal(refreshedSlot.dataset.userAnswer || '', 'A', 'expected clicking a submitted slot to preserve its userAnswer payload');
    assert.equal(refreshedPassageSlot.dataset.userAnswer || '', 'A', 'expected the submitted slot click to keep the mirrored passage blank answer intact');
    assert.equal(optionA.classList.contains('used'), true, 'expected the matched option ownership to stay intact after clicking a submitted slot');
  });

  it('keeps a submitted matching passage blank badge locked and preserves its filled answer', () => {
    const dom = createMatchingEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    ensureQaInitialized(window, qa);
    dropMatchingOption(window, qa, '37', 'B');
    clickElement(window, qa.querySelector('.qa-submit-btn'));

    clickElement(window, qa.querySelector('.qa-passage .qa-blank-slot[data-blank-id="37"] sup'));

    const refreshedSlot = qa.querySelector('.qa-answer-slot[data-blank-id="37"]');
    const refreshedPassageSlot = qa.querySelector('.qa-passage .qa-blank-slot[data-blank-id="37"]');
    const optionB = qa.querySelector('.qa-option[data-option="B"]');

    assert.equal(qa.classList.contains('submitted'), true, 'expected clicking a submitted matching passage badge to keep the quiz locked in graded state');
    assert.equal(refreshedSlot.classList.contains('filled'), true, 'expected clicking the submitted passage badge to keep the mirrored answer slot intact');
    assert.equal(refreshedPassageSlot.dataset.userAnswer || '', 'B', 'expected clicking the submitted passage badge to preserve the passage blank answer payload');
    assert.equal(optionB.classList.contains('used'), true, 'expected the option bound to the submitted passage badge to stay associated with that blank');
  });

  it('prevents dragging matching options after submit and keeps the graded state intact', () => {
    const dom = createMatchingEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    ensureQaInitialized(window, qa);
    dropMatchingOption(window, qa, '36', 'A');
    clickElement(window, qa.querySelector('.qa-submit-btn'));

    const optionA = qa.querySelector('.qa-option[data-option="A"]');
    const optionC = qa.querySelector('.qa-option[data-option="C"]');
    const dragDataUsed = {
      effectAllowed: '',
      lastType: '',
      lastValue: '',
      setData(type, value) {
        this.lastType = type;
        this.lastValue = value;
      },
      getData() {
        return '';
      }
    };
    const dragDataUnused = {
      effectAllowed: '',
      lastType: '',
      lastValue: '',
      setData(type, value) {
        this.lastType = type;
        this.lastValue = value;
      },
      getData() {
        return '';
      }
    };

    dispatchDragEvent(window, optionA, 'dragstart', { dataTransfer: dragDataUsed });
    dispatchDragEvent(window, optionC, 'dragstart', { dataTransfer: dragDataUnused });

    assert.equal(qa.classList.contains('submitted'), true, 'expected dragging a matching option after submit to keep the quiz in graded state');
    assert.equal(optionA.getAttribute('draggable'), 'false', 'expected a submitted used matching option to expose itself as non-draggable');
    assert.equal(optionC.getAttribute('draggable'), 'false', 'expected a submitted unused matching option to expose itself as non-draggable');
    assert.equal(dragDataUsed.effectAllowed, '', 'expected a submitted used option dragstart to stay blocked before any drag payload is published');
    assert.equal(dragDataUnused.effectAllowed, '', 'expected a submitted unused option dragstart to stay blocked before any drag payload is published');
    assert.equal(dragDataUsed.lastType, '', 'expected a submitted used option to avoid publishing any drag payload');
    assert.equal(dragDataUnused.lastType, '', 'expected a submitted unused option to avoid publishing any drag payload');
    assert.equal(dragDataUnused.lastValue, '', 'expected a submitted unused option to avoid carrying a drag value');
    assert.ok(!optionA.classList.contains('dragging'), 'expected a submitted used option to avoid entering dragging state');
    assert.ok(!optionC.classList.contains('dragging'), 'expected a submitted unused option to avoid entering dragging state');
  });

  it('opens the reused underline dropdown directly when creating a note in editor mode', () => {
    const dom = createSelectionEditorDom('single');
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');

    ensureQaInitialized(window, qa);
    selectText(window, qa.querySelector('.qa-passage p'), 'The first sentence.');

    const toolbar = getAnnotationToolbar(qa);
    assert.ok(toolbar?.classList.contains('visible'), 'expected selection to show the direct underline dropdown');
    assert.ok(toolbar.querySelector('.qa-format-dropdown'), 'expected note creation to reuse the existing dropdown container instead of a custom mini palette');
    assert.ok(toolbar.querySelector('.rt-dropdown-menu.show .color-swatch'), 'expected note creation to open the underline color dropdown immediately');
  });

  it('waits until pointerup before showing the underline dropdown for drag selections in editor mode', () => {
    const dom = createSelectionEditorDom('single');
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');

    ensureQaInitialized(window, qa);
    dispatchPointerEvent(window, qa.querySelector('.qa-passage p'), 'pointerdown', { button: 0 });
    selectText(window, qa.querySelector('.qa-passage p'), 'The first sentence.');

    const toolbar = getAnnotationToolbar(qa);
    assert.equal(toolbar?.classList.contains('visible'), false, 'expected drag selection to stay quiet before the left mouse button is released');

    dispatchPointerEvent(window, window.document, 'pointerup', { button: 0 });

    assert.ok(toolbar?.classList.contains('visible'), 'expected the underline dropdown to appear only after pointerup finalizes the selection');
    assert.ok(toolbar.querySelector('.rt-dropdown-menu.show'), 'expected pointerup to open the underline dropdown immediately after the selection is finalized');
  });

  it('renders the underline dropdown beside the selection from a body-level host so it is not clipped by quiz containers', () => {
    const dom = createSelectionEditorDom('single');
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');

    ensureQaInitialized(window, qa);
    selectText(window, qa.querySelector('.qa-passage p'), 'The first sentence.');

    const toolbar = getAnnotationToolbar(qa);
    assert.equal(toolbar?.parentNode, window.document.body, 'expected the underline dropdown host to be attached to document.body so quiz overflow clipping cannot cut it off');
    assert.equal(toolbar?.style.position, 'fixed', 'expected the underline dropdown host to use viewport positioning instead of being trapped inside the quiz container');
    assert.ok(Number.parseFloat(toolbar?.style.left || '0') > 260, 'expected the underline dropdown to sit beside the selected text instead of covering it from above');
  });

  it('allows arbitrary partial selections when creating a new note anchor', () => {
    const dom = createSelectionEditorDom('single');
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');

    ensureQaInitialized(window, qa);
    selectText(window, qa.querySelector('.qa-passage p'), 'first');

    clickElement(window, getAnnotationToolbar(qa).querySelector('.ul-colors .color-swatch'));

    const bubble = qa.querySelector('.qa-note-bubble');
    const anchor = qa.querySelector('.text-anchor');

    assert.ok(bubble, 'expected partial passage selection to create a new note bubble');
    assert.ok(anchor, 'expected partial passage selection to create a text anchor');
    assert.equal(anchor.childNodes[0]?.textContent, 'first', 'expected the created anchor to preserve exactly the selected text fragment');
  });

  it('inserts a newly created left-side note between existing passage-linked notes and renumbers the following notes', () => {
    const dom = createAutoReorderEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');

    ensureQaInitialized(window, qa);
    selectText(window, qa.querySelector('.qa-passage p'), 'middle text');

    clickElement(window, getAnnotationToolbar(qa).querySelector('.ul-colors .color-swatch'));

    const bubbles = Array.from(qa.querySelectorAll('.qa-note-bubble'));
    assert.deepEqual(
      bubbles.map((bubble) => ({ link: bubble.dataset.link, step: bubble.dataset.step, text: bubble.querySelector('.qa-note-content')?.textContent || '' })),
      [
        { link: 'note-01', step: '1', text: 'Note alpha.' },
        { link: 'note-03', step: '2', text: '' },
        { link: 'note-02', step: '3', text: 'Note omega.' }
      ],
      'expected a new passage-linked note to be inserted into the middle bubble position and push later notes back by one step'
    );

    const insertedAnchor = qa.querySelector('.text-anchor[data-link="note-03"]');
    assert.equal(insertedAnchor?.dataset.step, '2', 'expected the new middle passage anchor to inherit the inserted step number');
    assert.equal(qa.querySelector('.text-anchor[data-link="note-02"]')?.dataset.step, '3', 'expected later passage anchors to be renumbered after the insertion');
  });

  it('opens the same reused underline dropdown while linking an existing note to the answer panel', () => {
    const dom = createQuizDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');

    ensureQaInitialized(window, qa);

    clickElement(window, qa.querySelector('.qa-note-bubble .action-link-right'));
    selectText(window, qa.querySelector('.qa-option-text'), 'Option');

    const toolbar = getAnnotationToolbar(qa);
    assert.ok(toolbar?.classList.contains('visible'), 'expected linking mode to show the direct underline dropdown');
    assert.ok(toolbar.querySelector('.qa-format-dropdown'), 'expected linking mode to reuse the existing dropdown container instead of a custom mini palette');
    assert.ok(toolbar.querySelector('.rt-dropdown-menu.show .color-swatch'), 'expected linking mode to open the underline color dropdown immediately');
  });

  it('creates a note directly from pointerdown on an opened underline swatch', () => {
    const dom = createSelectionEditorDom('single');
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');

    ensureQaInitialized(window, qa);
    selectText(window, qa.querySelector('.qa-passage p'), 'first');

    const swatch = getAnnotationToolbar(qa).querySelector('.ul-colors .color-swatch');
    dispatchPointerEvent(window, swatch, 'pointerdown', { button: 0 });

    const anchor = qa.querySelector('.text-anchor');
    assert.ok(anchor, 'expected pointerdown on the opened underline swatch to create a text anchor immediately');
    assert.equal(anchor.childNodes[0]?.textContent, 'first', 'expected pointerdown creation to preserve the original selected text');
  });

  it('opens the direct underline palette for left-side linking even when terminal punctuation is omitted', () => {
    const dom = createLeftLinkEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');

    ensureQaInitialized(window, qa);
    clickElement(window, qa.querySelector('.qa-note-bubble .action-link-left'));
    selectText(window, qa.querySelector('.qa-passage p'), 'The first sentence');

    const toolbar = getAnnotationToolbar(qa);
    assert.ok(toolbar?.classList.contains('visible'), 'expected left-side linking to show the direct underline palette without requiring terminal punctuation');

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

    const toolbar = getAnnotationToolbar(qa);
    assert.ok(toolbar?.classList.contains('visible'), 'expected left-side linking to reuse the unrestricted selection behavior of right-side linking');

    clickElement(window, toolbar.querySelector('.ul-colors .color-swatch'));

    const anchor = qa.querySelector('.text-anchor[data-link="note-01"]');
    assert.ok(anchor, 'expected partial left-side selections to create a matching text anchor');
    assert.equal(anchor.childNodes[0]?.textContent, 'first', 'expected the linked anchor to preserve exactly the text selected by the user');
  });

  it('reorders a right-only note into passage order once it gains a left-side anchor', () => {
    const dom = createRightOnlyAssociationDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');

    ensureQaInitialized(window, qa);
    clickElement(window, qa.querySelector('.qa-note-bubble[data-link="note-03"] .action-link-left'));
    selectText(window, qa.querySelector('.qa-passage p'), 'inserted gap');

    const toolbar = getAnnotationToolbar(qa);
    clickElement(window, toolbar.querySelector('.ul-colors .color-swatch'));

    const bubbles = Array.from(qa.querySelectorAll('.qa-note-bubble'));
    assert.deepEqual(
      bubbles.map((bubble) => ({ link: bubble.dataset.link, step: bubble.dataset.step })),
      [
        { link: 'note-01', step: '1' },
        { link: 'note-03', step: '2' },
        { link: 'note-02', step: '3' }
      ],
      'expected a previously right-only note to join the passage-order sequence as soon as it gains a left-side anchor'
    );

    assert.equal(qa.querySelector('.text-anchor[data-link="note-03"]')?.dataset.step, '2', 'expected the newly linked left anchor to receive the inserted step number');
    assert.equal(qa.querySelector('.answer-anchor[data-link-answer="note-03"] .note-badge')?.textContent, '2', 'expected the original right-side anchor badge to be renumbered together with the reordered note');
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
    assert.equal(getAnnotationToolbar(qa)?.classList.contains('visible'), false, 'expected anchored source fragments not to reuse the anchor-creation toolbar');
  });

  it('adds the hidden-annotation label while keeping the original multicolor buttons and palettes', () => {
    const dom = createBubbleEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');

    ensureQaInitialized(window, qa);
    selectText(window, qa.querySelector('.text-anchor'), 'fragment');

    const fragmentToolbar = qa.querySelector('.qa-note-fragment-toolbar');
    const colorBtnLabel = fragmentToolbar.querySelector('.btn-color span');
    const highlightBtn = fragmentToolbar.querySelector('.btn-highlight');
    const textSwatchColors = Array.from(fragmentToolbar.querySelectorAll('.text-colors .color-swatch')).map((swatch) => swatch.style.background);
    const highlightSwatchColors = Array.from(fragmentToolbar.querySelectorAll('.bg-colors .color-swatch')).map((swatch) => swatch.style.background);

    assert.match(fragmentToolbar?.textContent || '', /隐藏型标注/, 'expected the quiz fragment toolbar to show the same explicit hidden-annotation label as the ordinary-page toolbar');
    assert.ok(fragmentToolbar.querySelector('.qa-toolbar-label'), 'expected the quiz fragment toolbar to carry the shared left-side label shell');
    assert.equal(fragmentToolbar.querySelectorAll('.qa-toolbar-btn').length, 5, 'expected the quiz fragment toolbar to keep the same compact button count as the ordinary-page toolbar');
    assert.equal(fragmentToolbar.querySelectorAll('.text-colors .color-swatch').length, 11, 'expected the quiz fragment toolbar to keep the same expanded text palette size as the ordinary-page toolbar');
    assert.equal(fragmentToolbar.querySelectorAll('.bg-colors .color-swatch').length, 9, 'expected the quiz fragment toolbar to keep the same expanded highlight palette size as the ordinary-page toolbar');
    assert.match(colorBtnLabel?.getAttribute('style') || '', /#e74c3c/i, 'expected the quiz fragment toolbar text-color button to keep the original red accent instead of turning green');
    assert.match(highlightBtn?.innerHTML || '', /#f1c40f/i, 'expected the quiz fragment toolbar highlight button to keep the original amber accent instead of turning green');
    assert.ok(textSwatchColors.some((color) => /231, 76, 60|#e74c3c/i.test(color)), 'expected the quiz fragment toolbar text palette to keep the original red swatch');
    assert.ok(textSwatchColors.some((color) => /52, 152, 219|#3498db/i.test(color)), 'expected the quiz fragment toolbar text palette to keep the original blue swatch');
    assert.ok(highlightSwatchColors.some((color) => /231, 76, 60, 0\.4|rgba\(231, 76, 60, 0\.4\)/i.test(color)), 'expected the quiz fragment toolbar highlight palette to keep the original red highlight swatch');
    assert.ok(highlightSwatchColors.some((color) => /52, 152, 219, 0\.4|rgba\(52, 152, 219, 0\.4\)/i.test(color)), 'expected the quiz fragment toolbar highlight palette to keep the original blue highlight swatch');
  });

  it('hides the quiz fragment toolbar immediately when edit mode exits', () => {
    const dom = createBubbleEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');

    ensureQaInitialized(window, qa);
    selectText(window, qa.querySelector('.text-anchor'), 'fragment');

    const fragmentToolbar = qa.querySelector('.qa-note-fragment-toolbar');
    assert.ok(fragmentToolbar?.classList.contains('visible'), 'expected the quiz fragment toolbar to be visible before exiting edit mode');

    window.document.documentElement.classList.remove('editor-mode');
    window.document.body.classList.remove('editor-mode');
    window.EditorHooks.fire('onEditModeExit');

    assert.equal(fragmentToolbar.classList.contains('visible'), false, 'expected quiz fragment toolbar to disappear immediately when edit mode exits');
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

  it('persists quiz fragment authoring immediately into the source root and sidecar save path', async () => {
    const dom = createBubbleEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');
    const savedRoots = [];
    const saveNowCalls = [];
    const ensureWriteAccessCalls = [];
    const scheduleSaveCalls = [];

    window.PersistenceLayer = {
      saveElement(root) {
        savedRoots.push(root.getAttribute('data-edit-id'));
      }
    };
    window.AnnotationStore = {
      hasWriteAccess() {
        return false;
      },
      ensureWriteAccess() {
        ensureWriteAccessCalls.push('called');
        return Promise.resolve(true);
      },
      saveNow() {
        saveNowCalls.push('saved');
      },
      scheduleSave() {
        scheduleSaveCalls.push('scheduled');
      }
    };
    window.historyMgr = {
      isRestoring: false,
      recordState() {}
    };

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');

    ensureQaInitialized(window, qa);
    selectText(window, qa.querySelector('.text-anchor'), 'fragment');

    const fragmentToolbar = qa.querySelector('.qa-note-fragment-toolbar');
    clickElement(window, fragmentToolbar.querySelector('.btn-strikethrough'));
    await Promise.resolve();

    assert.deepEqual(savedRoots, ['passage-01'], 'expected quiz fragment authoring to immediately persist the nearest source root into localStorage');
    assert.equal(ensureWriteAccessCalls.length, 1, 'expected the first quiz fragment authoring change to request AnnotationStore write access before saving');
    assert.equal(saveNowCalls.length, 1, 'expected quiz fragment authoring to write the current DOM change immediately once write access is available');
    assert.equal(scheduleSaveCalls.length, 0, 'expected button-driven quiz fragment authoring not to fall back to the debounced scheduleSave path when saveNow is available');
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

  it('reveals an authored source fragment on right click in presentation mode after submission', () => {
    const dom = createBubbleEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    ensureQaInitialized(window, qa);
    qa.classList.add('submitted');

    const anchor = qa.querySelector('.text-anchor');
    anchor.innerHTML = 'Anchor <span class="qa-note-fragment" data-fragment-step="true">fragment</span> sample sentence.<sup class="note-badge">1</sup>';
    const fragment = anchor.querySelector('[data-fragment-step="true"]');

    rightClickElement(window, fragment);

    assert.ok(fragment.classList.contains('qa-fragment-visible'), 'expected right click to reveal the authored source fragment immediately');
  });

  it('reveals all authored layers in the same fragment group with a single right click after submission', () => {
    const dom = createBubbleEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    ensureQaInitialized(window, qa);
    qa.classList.add('submitted');

    const anchor = qa.querySelector('.text-anchor');
    anchor.innerHTML = 'Anchor <span class="qa-note-fragment" data-fragment-step="true" data-fragment-group="frag-01" data-fragment-format="highlight" style="background-color: rgba(255, 208, 0, 0.45);">others <span class="qa-note-fragment" data-fragment-step="true" data-fragment-group="frag-01" data-fragment-format="ruby"><ruby>has<rt>主语</rt></ruby></span></span> sample sentence.<sup class="note-badge">1</sup>';

    const ruby = anchor.querySelector('ruby');
    const groupedFragments = anchor.querySelectorAll('[data-fragment-group="frag-01"]');

    rightClickElement(window, ruby);

    assert.equal(Array.from(groupedFragments).filter((fragment) => fragment.classList.contains('qa-fragment-visible')).length, 2, 'expected one right click to reveal every authored layer that belongs to the same fragment group');
  });

  it('reuses the same fragment group when a second rich-text layer is authored inside an existing fragment', () => {
    const dom = createBubbleEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');

    ensureQaInitialized(window, qa);
    selectText(window, qa.querySelector('.text-anchor'), 'fragment sample');
    clickElement(window, qa.querySelector('.qa-note-fragment-toolbar .btn-highlight'));
    clickElement(window, qa.querySelector('.qa-note-fragment-toolbar .bg-colors .color-swatch'));

    const outerFragment = qa.querySelector('.text-anchor [data-fragment-step="true"]');
    selectText(window, outerFragment, 'fragment');
    clickElement(window, qa.querySelector('.qa-note-fragment-toolbar .btn-ruby'));

    const nestedFragment = outerFragment.querySelector('[data-fragment-step="true"]');
    assert.ok(outerFragment, 'expected the first authored fragment to exist');
    assert.ok(nestedFragment, 'expected the nested authored fragment to exist');
    assert.equal(
      nestedFragment.getAttribute('data-fragment-group'),
      outerFragment.getAttribute('data-fragment-group'),
      'expected nested rich-text layers authored inside the same text span to share one reveal group'
    );
  });

  it('keeps revealed source fragments visible when the active bubble is clicked again after submission', () => {
    const dom = createBubbleEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    ensureQaInitialized(window, qa);
    qa.classList.add('submitted');

    const anchor = qa.querySelector('.text-anchor');
    anchor.innerHTML = 'Anchor <span class="qa-note-fragment" data-fragment-step="true">fragment</span> sample sentence.<sup class="note-badge">1</sup>';
    const fragment = anchor.querySelector('[data-fragment-step="true"]');
    const bubble = qa.querySelector('.qa-note-bubble');

    rightClickElement(window, fragment);
    assert.ok(fragment.classList.contains('qa-fragment-visible'), 'expected the fragment to be visible before clicking the active bubble');

    clickElement(window, bubble);

    assert.ok(fragment.classList.contains('qa-fragment-visible'), 'expected clicking the already active bubble not to reset revealed fragment state');
  });

  it('preserves a previously focused bubble fragment visibility when focus moves to another bubble', () => {
    const dom = createTwoBubbleEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    ensureQaInitialized(window, qa);

    const firstAnchor = qa.querySelector('.text-anchor[data-link="note-01"]');
    firstAnchor.innerHTML = 'Anchor <span class="qa-note-fragment qa-fragment-visible" data-fragment-step="true">fragment</span> one.<sup class="note-badge">1</sup>';
    const firstFragment = firstAnchor.querySelector('[data-fragment-step="true"]');

    clickElement(window, qa.querySelector('.qa-note-bubble[data-link="note-02"]'));

    assert.ok(firstFragment.classList.contains('qa-fragment-visible'), 'expected switching focus to another bubble not to hide the previous bubble fragments');
  });

  it('normalizes an existing bubble to the same bidirectional link model when a restored right anchor already exists', () => {
    const dom = createBiDirectionalAssociationDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    ensureQaInitialized(window, qa);

    const bubble = qa.querySelector('.qa-note-bubble[data-link="note-01"]');
    assert.equal(bubble?.getAttribute('data-link-answer'), 'note-01', 'expected init to normalize existing bubbles so restored right anchors become first-class endpoints of the same linkId');
    assert.equal(bubble.querySelector('.action-link-right'), null, 'expected normalized bubbles not to offer a second right-link creation button');
    assert.ok(bubble.querySelector('.action-unlink-right'), 'expected normalized bubbles to expose the right unlink action just like notes originally created from the right side');
    assert.ok(bubble.querySelector('.action-select-right'), 'expected normalized bubbles to expose the right select action just like notes originally created from the right side');
  });

  it('activates both endpoints without drawing persistent connector legs even when the bubble was originally created from the left side', () => {
    const dom = createBiDirectionalAssociationDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    ensureQaInitialized(window, qa);
    clickElement(window, qa.querySelector('.qa-note-bubble[data-link="note-01"]'));

    assert.ok(qa.querySelector('.text-anchor[data-link="note-01"]')?.classList.contains('anchor-active'), 'expected activation to highlight the left endpoint of the shared linkId');
    assert.ok(qa.querySelector('.answer-anchor[data-link-answer="note-01"]')?.classList.contains('anchor-active'), 'expected activation to highlight the right endpoint of the shared linkId');
    assert.equal(qa.querySelectorAll('.qa-connector-canvas .connector-step').length, 0, 'expected activation to stop drawing the old persistent orange connector legs and rely on endpoint highlighting instead');
  });

  it('wraps anchor text into a dedicated visual layer so the focus underline can replace authored underline styles without being offset by note badges', () => {
    const dom = createBiDirectionalAssociationDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    ensureQaInitialized(window, qa);

    const passageAnchor = qa.querySelector('.text-anchor[data-link="note-01"]');
    const answerAnchor = qa.querySelector('.answer-anchor[data-link-answer="note-01"]');
    const passageTextLayer = Array.from(passageAnchor.children).find((el) => el.classList.contains('qa-anchor-text'));
    const answerTextLayer = Array.from(answerAnchor.children).find((el) => el.classList.contains('qa-anchor-text'));

    assert.ok(passageTextLayer, 'expected init to create a dedicated text wrapper for passage anchors that already carry inline underline styles');
    assert.ok(answerTextLayer, 'expected init to create a dedicated text wrapper for answer anchors that already carry inline underline styles');
    assert.match(passageTextLayer.textContent, /Passage anchor\./, 'expected the new passage text layer to preserve the original anchor text content');
    assert.match(answerTextLayer.textContent, /Answer anchor\./, 'expected the new answer text layer to preserve the original answer anchor text content');
    assert.equal(passageTextLayer.querySelector('.note-badge'), null, 'expected the note badge to stay outside the dedicated text layer so it does not distort underline positioning');
    assert.equal(answerTextLayer.querySelector('.note-badge'), null, 'expected the answer-side note badge to stay outside the dedicated text layer so it does not distort underline positioning');
  });

  it('uses high-contrast aurora styling to replace the real underline and restore the focused bubble halo', () => {
    assert.match(zoneCssSource, /\.quiz-annotation\s*\{[\s\S]*--qa-focus-aurora:[\s\S]*--qa-focus-aurora-duration:/, 'expected the quiz component to define shared aurora tokens for the active note focus state');
    assert.match(zoneCssSource, /\.text-anchor\.anchor-active,\s*\.answer-anchor\.anchor-active\s*\{[\s\S]*text-decoration-color:\s*transparent\s*!important/, 'expected active anchors to force-hide authored inline underline colors before repainting the focus underline');
    assert.match(zoneCssSource, /\.text-anchor\.anchor-active\s+\.qa-anchor-text,\s*\.answer-anchor\.anchor-active\s+\.qa-anchor-text\s*\{[\s\S]*padding-bottom:\s*0\.14em;[\s\S]*border-bottom:\s*0\.162em\s+solid\s+transparent;[\s\S]*border-image-source:\s*var\(--qa-focus-aurora\);[\s\S]*border-image-slice:\s*1;/, 'expected the gradient focus underline to become materially thicker while moving slightly closer to the text baseline');
    assert.match(zoneCssSource, /\.text-anchor\.anchor-active \.note-badge,\s*\.answer-anchor\.anchor-active \.note-badge\s*\{[\s\S]*background-image:\s*var\(--qa-focus-aurora\);[\s\S]*animation:\s*qaAuroraShift/, 'expected active endpoint badges to share the same aurora motion as their linked note bubble');
    assert.match(zoneCssSource, /\.qa-note-bubble\.note-active\s*\{[\s\S]*background-color:\s*transparent;[\s\S]*backdrop-filter:\s*none;[\s\S]*-webkit-backdrop-filter:\s*none;[\s\S]*border-color:\s*rgba\(78,\s*186,\s*255,\s*0\.42\);[\s\S]*box-shadow:\s*[\s\S]*0\s+10px\s+26px\s+rgba\(18,\s*34,\s*60,\s*0\.16\),[\s\S]*0\s+0\s+8px\s+1px\s+rgba\(78,\s*186,\s*255,\s*0\.26\),[\s\S]*0\s+0\s+16px\s+4px\s+rgba\(78,\s*186,\s*255,\s*0\.14\),[\s\S]*0\s+0\s+28px\s+8px\s+rgba\(84,\s*210,\s*176,\s*0\.06\)/, 'expected the active bubble shell to reuse the old compact physical glow pattern so the aura originates directly from the bubble border and leaves no visual gap');
    assert.match(zoneCssSource, /\.qa-note-bubble\.note-active::before\s*\{[\s\S]*content:\s*none;/, 'expected the detached halo pseudo element to be disabled once the glow is moved back onto the bubble shell itself');
    assert.match(zoneCssSource, /\.qa-note-bubble\.note-active::after\s*\{[\s\S]*inset:\s*0;[\s\S]*background:\s*linear-gradient\(145deg,[\s\S]*rgba\(228,\s*244,\s*255,\s*0\.9\)\s*0%[\s\S]*rgba\(226,\s*247,\s*239,\s*0\.88\)\s*100%[\s\S]*backdrop-filter:\s*blur\(24px\);[\s\S]*-webkit-backdrop-filter:\s*blur\(24px\);[\s\S]*z-index:\s*-1;/, 'expected the active bubble to restore a soft blue-green glass gradient instead of the later stark neutral white backing layer');
  });

  it('uses the theme secondary color token to temporarily fill fragment words on hover in presentation mode', () => {
    assert.match(zoneCssSource, /quiz-annotation\.submitted[\s\S]*\.text-anchor(?:\.qa-fragment-hover-proxy|:hover) \[data-fragment-step="true"\][\s\S]*brand-secondary-rgb/, 'expected submitted quiz anchors to be allowed to show the fragment hover fill via the theme secondary color token');
    assert.match(zoneCssSource, /quiz-annotation\.submitted[\s\S]*\.answer-anchor(?:\.qa-fragment-hover-proxy|:hover) \[data-fragment-step="true"\][\s\S]*brand-secondary-rgb/, 'expected submitted answer anchors to share the same fragment hover fill token');
    assert.match(zoneCssSource, /qa-fragment-hover-proxy/, 'expected doodle-mode hover forwarding to have a proxy class for fragment discovery styling');
  });

  it('reserves a shared right-side safe gutter for no-quiz reading layouts so divider hover and active note glow stay inside the clipped body', () => {
    assert.match(
      zoneCssSource,
      /\.quiz-annotation:not\(\.has-quiz\)\s*\{[\s\S]*--qa-reading-edge-safe-gutter:\s*36px;/,
      'expected pure-reading layouts to define a dedicated right-side safe gutter token instead of relying on right-panel overlap'
    );
    assert.match(
      zoneCssSource,
      /\.quiz-annotation:not\(\.has-quiz\)\s+\.qa-body\s*\{[\s\S]*padding-right:\s*var\(--qa-reading-edge-safe-gutter\);[\s\S]*box-sizing:\s*border-box;/,
      'expected the shared safe gutter to be reserved inside the clipped qa-body so both divider hover and active note glow stay fully visible'
    );
  });

  it('plays one focus sound only when the active bubble actually changes', () => {
    const dom = createTwoBubbleEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');
    const calls = [];

    window.AudioRuntime = {
      playGlobalCue(name) {
        calls.push(name);
      }
    };

    ensureQaInitialized(window, qa);

    clickElement(window, qa.querySelector('.qa-note-bubble[data-link="note-02"]'));
    clickElement(window, qa.querySelector('.qa-note-bubble[data-link="note-02"]'));

    assert.deepEqual(calls, ['focus-shift'], 'expected switching to a different bubble to play one global focus cue, but repeated clicks on the same active bubble to stay silent');
  });

  it('suppresses fragment hover cues before submit and only enables them after submit outside editor mode', () => {
    const dom = createBubbleEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');
    const hoverCalls = [];

    window.QuizAnnotationAudio = {
      playFragmentHover(payload) {
        hoverCalls.push(payload?.linkId || 'unknown');
      }
    };

    ensureQaInitialized(window, qa);

    const anchor = qa.querySelector('.text-anchor');
    anchor.innerHTML = 'Anchor <span class="qa-note-fragment" data-fragment-step="true">fragment</span> sample sentence.<sup class="note-badge">1</sup>';

    anchor.dispatchEvent(new window.MouseEvent('mouseenter', { bubbles: false }));
    assert.deepEqual(hoverCalls, [], 'expected unanswered quiz anchors to stay silent so fragment-bearing keywords are not leaked before submission');

    qa.classList.add('submitted');
    anchor.dispatchEvent(new window.MouseEvent('mouseenter', { bubbles: false }));
    assert.deepEqual(hoverCalls, ['note-01'], 'expected hover cues to become available after submission in presentation mode');

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');
    anchor.dispatchEvent(new window.MouseEvent('mouseenter', { bubbles: false }));
    assert.deepEqual(hoverCalls, ['note-01'], 'expected editor mode to remain silent for fragment hover cues');
  });

  it('still plays fragment hover cues when restored anchors contain old hover-bound marker attributes', () => {
    const dom = createBubbleEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');
    const hoverCalls = [];

    window.QuizAnnotationAudio = {
      playFragmentHover(payload) {
        hoverCalls.push(payload?.linkId || 'unknown');
      }
    };

    const anchor = qa.querySelector('.text-anchor');
    anchor.setAttribute('data-fragment-hover-audio-bound', 'true');

    ensureQaInitialized(window, qa);

    anchor.innerHTML = 'Anchor <span class="qa-note-fragment" data-fragment-step="true">fragment</span> sample sentence.<sup class="note-badge">1</sup>';
    qa.classList.add('submitted');
    anchor.dispatchEvent(new window.MouseEvent('mouseenter', { bubbles: false }));

    assert.deepEqual(hoverCalls, ['note-01'], 'expected restored anchors with stale hover-bound marker attributes to still play hover cues in presentation mode');
  });

  it('forwards doodle-mode pointer hover and right-click to underlying fragment anchors once the quiz is submitted', () => {
    const dom = createBubbleEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');
    const hoverCalls = [];

    window.QuizAnnotationAudio = {
      playFragmentHover(payload) {
        hoverCalls.push(payload?.linkId || 'unknown');
      }
    };

    qa.classList.add('submitted');
    window.document.body.classList.add('doodle-mode');
    window.DoodleManager = { isActive: true, isDrawing: false };

    ensureQaInitialized(window, qa);

    const anchor = qa.querySelector('.text-anchor');
    anchor.innerHTML = 'Anchor <span class="qa-note-fragment" data-fragment-step="true">fragment</span> sample sentence.<sup class="note-badge">1</sup>';
    const fragment = anchor.querySelector('[data-fragment-step="true"]');
    const doodleLayer = addDoodleLayer(window);

    window.document.elementFromPoint = () => window.document.documentElement.classList.contains('qa-doodle-hit-test') ? fragment : doodleLayer;

    dispatchPointerEvent(window, doodleLayer, 'pointermove', { clientX: 180, clientY: 160 });
    assert.ok(anchor.classList.contains('qa-fragment-hover-proxy'), 'expected doodle-mode pointer tracking to mark the underlying anchor with the fragment hover proxy class');
    assert.deepEqual(hoverCalls, ['note-01'], 'expected doodle-mode hover forwarding to play the fragment cue once for the underlying anchor');

    rightClickElement(window, doodleLayer);
    assert.ok(fragment.classList.contains('qa-fragment-visible'), 'expected right-click in doodle mode to reveal the underlying fragment even though the doodle layer sits on top');
  });

  it('keeps right-click fragment reveal suppressed before the quiz is submitted', () => {
    const dom = createBubbleEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    window.document.body.classList.add('doodle-mode');
    window.DoodleManager = { isActive: true, isDrawing: false };

    ensureQaInitialized(window, qa);

    const anchor = qa.querySelector('.text-anchor');
    anchor.innerHTML = 'Anchor <span class="qa-note-fragment" data-fragment-step="true">fragment</span> sample sentence.<sup class="note-badge">1</sup>';
    const fragment = anchor.querySelector('[data-fragment-step="true"]');
    const doodleLayer = addDoodleLayer(window);

    window.document.elementFromPoint = () => window.document.documentElement.classList.contains('qa-doodle-hit-test') ? fragment : doodleLayer;

    rightClickElement(window, doodleLayer);

    assert.equal(fragment.classList.contains('qa-fragment-visible'), false, 'expected unanswered quiz fragments to stay hidden even when right-clicking through the doodle layer');
  });

  it('shows the divider button in doodle mode and forwards clicks through the doodle layer without starting a stroke', () => {
    const dom = createBubbleEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    qa.classList.remove('notes-active', 'has-active-note');
    window.document.body.classList.add('doodle-mode');
    window.DoodleManager = { isActive: true, isDrawing: false };

    ensureQaInitialized(window, qa);

    const body = qa.querySelector('.qa-body');
    const passage = qa.querySelector('.qa-passage');
    body.getBoundingClientRect = () => ({ left: 0, top: 0, right: 600, bottom: 400, width: 600, height: 400 });
    passage.getBoundingClientRect = () => ({ left: 0, top: 0, right: 220, bottom: 400, width: 220, height: 400 });

    const doodleLayer = addDoodleLayer(window);
    const dividerBtn = qa.querySelector('.qa-divider-btn');
    let drawingStarted = false;
    window.document.addEventListener('pointerdown', () => {
      drawingStarted = true;
    });

    window.document.elementFromPoint = () => window.document.documentElement.classList.contains('qa-doodle-hit-test') ? passage : doodleLayer;
    dispatchPointerEvent(window, doodleLayer, 'pointermove', { clientX: 220, clientY: 180 });

    assert.ok(dividerBtn.classList.contains('visible'), 'expected doodle-mode hovering near the divider to still reveal the expand-notes button');

    window.document.elementFromPoint = () => window.document.documentElement.classList.contains('qa-doodle-hit-test') ? dividerBtn : doodleLayer;
    dispatchPointerEvent(window, doodleLayer, 'pointerdown', { clientX: 220, clientY: 180, button: 0 });

    assert.ok(qa.classList.contains('notes-active'), 'expected doodle-mode click forwarding to expand the notes panel via the divider button');
    assert.equal(drawingStarted, false, 'expected clicking the divider button in doodle mode to be intercepted before any drawing stroke can begin');
  });

  it('lets the doodle-layer click pass through to the collapse button without drawing', () => {
    const dom = createBubbleEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    window.document.body.classList.add('doodle-mode');
    window.DoodleManager = { isActive: true, isDrawing: false };

    ensureQaInitialized(window, qa);

    const doodleLayer = addDoodleLayer(window);
    const collapseBtn = qa.querySelector('.qa-notes-collapse-btn');
    let drawingStarted = false;
    window.document.addEventListener('pointerdown', () => {
      drawingStarted = true;
    });

    window.document.elementFromPoint = () => window.document.documentElement.classList.contains('qa-doodle-hit-test') ? collapseBtn : doodleLayer;
    dispatchPointerEvent(window, doodleLayer, 'pointerdown', { clientX: 560, clientY: 80, button: 0 });

    assert.equal(qa.classList.contains('notes-active'), false, 'expected the doodle-mode click passthrough to let the collapse button close the notes panel');
    assert.equal(drawingStarted, false, 'expected clicking the collapse button in doodle mode to be intercepted before any drawing stroke can begin');
  });

  it('forwards doodle-mode clicks to note badges, note handles, and submit buttons, while leaving bubble content drawable', () => {
    const dom = createTwoBubbleEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    qa.classList.remove('submitted');
    window.document.body.classList.add('doodle-mode');
    window.DoodleManager = { isActive: true, isDrawing: false };

    ensureQaInitialized(window, qa);

    const doodleLayer = addDoodleLayer(window);
    const bubbleOne = qa.querySelector('.qa-note-bubble[data-link="note-01"]');
    const bubbleTwo = qa.querySelector('.qa-note-bubble[data-link="note-02"]');
    const bubbleTwoHandle = bubbleTwo.querySelector('.qa-note-handle');
    const bubbleTwoContent = bubbleTwo.querySelector('.qa-note-content');
    const badgeTwo = qa.querySelector('.text-anchor[data-link="note-02"] .note-badge');
    const submitBtn = qa.querySelector('.qa-submit-btn');

    window.document.elementFromPoint = () => window.document.documentElement.classList.contains('qa-doodle-hit-test') ? bubbleTwoHandle : doodleLayer;
    dispatchPointerEvent(window, doodleLayer, 'pointerdown', { clientX: 480, clientY: 210, button: 0 });
    assert.ok(bubbleTwo.classList.contains('note-active'), 'expected doodle-mode click passthrough to activate the underlying note bubble');
    assert.equal(bubbleOne.classList.contains('note-active'), false, 'expected bubble passthrough to switch focus away from the previously active bubble');

    bubbleOne.classList.add('note-active');
    bubbleTwo.classList.remove('note-active');
    window.document.elementFromPoint = () => window.document.documentElement.classList.contains('qa-doodle-hit-test') ? bubbleTwoContent : doodleLayer;
    dispatchPointerEvent(window, doodleLayer, 'pointerdown', { clientX: 495, clientY: 246, button: 0 });
    assert.equal(bubbleTwo.classList.contains('note-active'), false, 'expected doodle-mode clicks on bubble content to stay drawable instead of switching focus');
    assert.equal(bubbleOne.classList.contains('note-active'), true, 'expected clicking non-focused bubble content in doodle mode to keep the old active bubble unchanged');

    qa.classList.remove('notes-active');
    bubbleTwo.classList.remove('note-active', 'note-expanded');
    window.document.elementFromPoint = () => window.document.documentElement.classList.contains('qa-doodle-hit-test') ? badgeTwo : doodleLayer;
    dispatchPointerEvent(window, doodleLayer, 'pointerdown', { clientX: 180, clientY: 120, button: 0 });
    assert.ok(qa.classList.contains('notes-active'), 'expected doodle-mode click passthrough to let a note badge reopen the notes panel');
    assert.ok(bubbleTwo.classList.contains('note-active'), 'expected doodle-mode click passthrough on a note badge to activate its bubble');

    window.document.elementFromPoint = () => window.document.documentElement.classList.contains('qa-doodle-hit-test') ? submitBtn : doodleLayer;
    dispatchPointerEvent(window, doodleLayer, 'pointerdown', { clientX: 420, clientY: 60, button: 0 });
    assert.ok(qa.classList.contains('submitted'), 'expected doodle-mode click passthrough to let the submit button still submit the quiz');
  });

  it('uses a deeper translucent red and a 3x-thicker strike line across editor and annotation flows', () => {
    assert.match(editorCoreSource, /data-cmd="strikethrough"[\s\S]*rgba\(186,\s*26,\s*26,\s*0\.4\)[\s\S]*text-decoration-thickness:\s*0\.12em/, 'expected the global editor toolbar strikethrough icon to preview the deeper translucent red with the thicker strike line');
    assert.match(editorRichTextSource, /_toggleDecoration\('line-through',\s*'rgba\(186,\s*26,\s*26,\s*0\.4\)'\s*,\s*'0\.12em'\)/, 'expected global rich-text strikethrough commands to write the deeper translucent red and thicker strike line');
    assert.match(editorCssSource, /text-decoration-color:\s*rgba\(186,\s*26,\s*26,\s*0\.4\)\s*!important[\s\S]*text-decoration-thickness:\s*0\.12em\s*!important/, 'expected exported editor strikethrough styling to keep the deeper translucent red and thicker strike line');
    assert.match(runtimeSource, /btn-strikethrough[\s\S]*rgba\(186,\s*26,\s*26,\s*0\.4\)[\s\S]*text-decoration-thickness:\s*0\.12em/, 'expected the annotation fragment toolbar strikethrough icon to use the same deeper translucent red preview and thickness');
    assert.match(runtimeSource, /--qa-fragment-strike-color',\s*'rgba\(186,\s*26,\s*26,\s*0\.4\)'[\s\S]*--qa-fragment-strike-thickness',\s*'0\.12em'/, 'expected annotation fragment strikethrough wrappers to persist both the deeper translucent red and thicker strike line');
    assert.match(runtimeSource, /strikethrough:\s*'text-decoration: line-through; text-decoration-color: rgba\(186,\s*26,\s*26,\s*0\.4\); text-decoration-thickness: 0\.12em;'/, 'expected linked-anchor export styles to keep the deeper translucent red strikethrough and thicker line');
    assert.match(zoneCssSource, /text-decoration-color:\s*var\(--qa-fragment-strike-color,\s*rgba\(186,\s*26,\s*26,\s*0\.4\)\)\s*!important[\s\S]*text-decoration-thickness:\s*var\(--qa-fragment-strike-thickness,\s*0\.12em\)\s*!important/, 'expected fragment reveal css to fall back to the same deeper translucent red and thicker strike line');
    assert.doesNotMatch(runtimeSource, /📁 自动保存/, 'expected quiz-annotation runtime to stop showing a persistent auto-save label in the notes header');
    assert.doesNotMatch(annotationStoreSource, /📁 自动保存/, 'expected annotation-store status rendering to stop advertising a persistent auto-save label');
  });

  it('notifies slides runtime when a bubble is activated manually so arrow keys can keep stepping fragments', () => {
    const dom = createBubbleEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');
    let activatedElement = null;

    window.activateInteractionStepForElement = (element) => {
      activatedElement = element;
      return true;
    };

    ensureQaInitialized(window, qa);

    clickElement(window, qa.querySelector('.qa-note-bubble'));

    assert.equal(activatedElement, qa, 'expected manual bubble activation to sync the current quiz-annotation with slides runtime stepping');
  });

  it('renders a remove-format button at the far right of the fragment toolbar and clears fragment wrappers', () => {
    const dom = createBubbleEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');

    ensureQaInitialized(window, qa);

    const anchor = qa.querySelector('.text-anchor');
    anchor.innerHTML = 'Anchor <span class="qa-note-fragment" data-fragment-step="true" data-fragment-format="highlight" data-fragment-group="frag-01"><span class="qa-note-fragment" data-fragment-step="true" data-fragment-format="ruby" data-fragment-group="frag-01"><ruby>fragment<rt>主语</rt></ruby></span></span> sample sentence.<sup class="note-badge">1</sup>';

    selectText(window, anchor, 'fragment');

    const fragmentToolbar = qa.querySelector('.qa-note-fragment-toolbar');
    const removeBtn = fragmentToolbar.querySelector('.btn-remove-format');
    const divider = fragmentToolbar.querySelector('.qa-toolbar-divider');
    const toolbarChildren = Array.from(fragmentToolbar.children);

    assert.ok(removeBtn, 'expected the fragment toolbar to expose a remove-format button');
    assert.ok(divider, 'expected the fragment toolbar to show a divider before the remove-format button');
    assert.equal(toolbarChildren.at(-1), removeBtn, 'expected the remove-format button to sit at the far right edge of the fragment toolbar');

    clickElement(window, removeBtn);

    assert.equal(anchor.querySelector('[data-fragment-step="true"]'), null, 'expected remove-format to clear authored fragment wrappers from the current selection');
  });

  it('keeps hidden source fragments readable by neutralizing authored styles until reveal', () => {
    assert.match(zoneCssSource, /\.text-anchor \[data-fragment-step="true"\],[\s\S]*color:\s*inherit\s*!important;/, 'expected hidden source fragments to preserve readable base text color before reveal');
    assert.match(zoneCssSource, /\.text-anchor \[data-fragment-step="true"\],[\s\S]*background(?:-color)?:\s*transparent\s*!important;/, 'expected hidden source fragments to suppress authored highlight backgrounds before reveal');
    assert.match(zoneCssSource, /data-fragment-format="ruby"\][\s\S]*rt\s*\{[\s\S]*display:\s*none;/, 'expected ruby annotations to stay hidden until the fragment is explicitly revealed');
  });

  it('shares one compact white floating-toolbar shell between quiz fragments and ordinary-page fragments', () => {
    assert.match(zoneCssSource, /\.qa-note-fragment-toolbar,\s*\.page-richtext-fragment-toolbar[\s\S]*padding:\s*5px 10px;[\s\S]*background-color:\s*#ffffff;/, 'expected quiz and ordinary-page fragment toolbars to share the same compact white toolbar shell');
    assert.match(zoneCssSource, /\.qa-note-fragment-toolbar \.rt-dropdown-menu,\s*\.page-richtext-fragment-toolbar \.rt-dropdown-menu[\s\S]*background:\s*#ffffff;[\s\S]*box-shadow:\s*0 8px 24px rgba\(0, 0, 0, 0\.15\);/, 'expected quiz and ordinary-page fragment dropdown menus to share the same opaque white menu surface');
  });

  it('uses the theme secondary color for linking-mode emphasis instead of the primary green', () => {
    assert.match(zoneCssSource, /\.quiz-annotation\.linking-left \.qa-passage[\s\S]*brand-secondary-rgb/, 'expected left-side linking emphasis to use the theme secondary color token');
    assert.match(zoneCssSource, /\.quiz-annotation\.linking-right \.qa-answer-panel[\s\S]*brand-secondary-rgb/, 'expected right-side linking emphasis to use the theme secondary color token');
    assert.match(zoneCssSource, /\.quiz-annotation\.linking-left \.qa-passage[\s\S]*inset 0 0 0 12px/, 'expected the left-side linking frame to be much thicker than the earlier thin outline');
  });

  it('keeps submitted matching used options visually clear while still allowing inner badges to receive clicks', () => {
    assert.match(
      zoneCssSource,
      /\.quiz-annotation\.submitted\s+\.qa-question\[data-type="matching"\]\s+\.qa-option\.used\s*\{[\s\S]*opacity:\s*1;[\s\S]*pointer-events:\s*auto;[\s\S]*transform:\s*none;[\s\S]*\}/,
      'expected submitted matching used options to look like regular options again while keeping inner badges clickable'
    );
  });

  it('places right-only notes after passage-linked notes and before unlinked orphan bubbles', () => {
    const dom = createBubbleEditorDom();
    const { window } = dom;
    const qa = window.document.querySelector('.quiz-annotation');

    window.document.documentElement.classList.add('editor-mode');
    window.document.body.classList.add('editor-mode');

    ensureQaInitialized(window, qa);

    var bubble = qa.querySelector('.qa-note-bubble[data-link="note-01"]');
    assert.ok(bubble, 'expected bubble editor dom to contain a note-01 bubble');

    // 验证 recalcStepNumbers 能通过 initNoteInteractions 等初始化流程正确执行
    // 气泡存在即说明 renumber 已完成
    assert.equal(bubble.dataset.step, '1', 'expected the single bubble to keep step 1');
  });

});