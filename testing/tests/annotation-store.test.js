import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..', '..');
const annotationStorePath = path.join(projectRoot, 'assets', 'annotation-store.js');
const annotationStoreSource = fs.readFileSync(annotationStorePath, 'utf-8');

function parseAnnotationPayload(jsContent) {
  const prefix = 'window.__annotationData = ';
  assert.match(jsContent, /^window\.__annotationData = /, 'expected annotation-store writes to serialize a window.__annotationData assignment');
  return JSON.parse(jsContent.slice(prefix.length).replace(/;\s*$/, ''));
}

function evaluateAnnotationStore(url) {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    runScripts: 'outside-only',
    url
  });
  const { window } = dom;
  const headAppends = [];
  const bodyAppends = [];

  window.setTimeout = () => 0;
  window.clearTimeout = () => {};

  const originalHeadAppend = window.document.head.appendChild.bind(window.document.head);
  const originalBodyAppend = window.document.body.appendChild.bind(window.document.body);

  window.document.head.appendChild = (node) => {
    headAppends.push(node.tagName);
    return node;
  };
  window.document.body.appendChild = (node) => {
    bodyAppends.push(node.tagName);
    return node;
  };

  try {
    window.eval(annotationStoreSource);
  } finally {
    window.document.head.appendChild = originalHeadAppend;
    window.document.body.appendChild = originalBodyAppend;
  }

  return { headAppends, bodyAppends };
}

function createAnnotationStoreHarness(bodyHtml, url = 'https://example.com/demo.html') {
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${bodyHtml}</body></html>`, {
    runScripts: 'outside-only',
    url
  });
  const { window } = dom;
  const writes = [];

  window.console.log = () => {};
  window.console.warn = () => {};
  window.indexedDB = {
    open() {
      throw new Error('indexeddb-disabled-for-test');
    }
  };
  window.setTimeout = (callback) => {
    callback();
    return 1;
  };
  window.clearTimeout = () => {};
  window.showSaveFilePicker = async () => ({
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    createWritable: async () => ({
      write: async (content) => {
        writes.push(content);
      },
      close: async () => {}
    })
  });

  window.eval(annotationStoreSource);

  return { dom, window, writes };
}

async function authorizeAndCollect(window, writes) {
  const saved = await window.AnnotationStore.authorizeAndSave();
  assert.equal(saved, true, 'expected authorizeAndSave to succeed with the fake writable handle');
  assert.ok(writes.length > 0, 'expected authorizeAndSave to write one annotation payload');
  return parseAnnotationPayload(writes[writes.length - 1]);
}

describe('annotation store loader', () => {
  it('uses the legacy script-tag loader for file protocol decks', () => {
    const { headAppends, bodyAppends } = evaluateAnnotationStore('file:///D:/Projects/html-slides/demo.html');

    assert.deepEqual(headAppends, ['SCRIPT'], 'expected local file decks to load annotation data through a direct script tag for reliable file:// recovery');
    assert.deepEqual(bodyAppends, [], 'expected local file decks not to rely on a sandbox iframe for annotation recovery');
  });

  it('keeps the sandbox iframe loader for non-file protocols', () => {
    const { headAppends, bodyAppends } = evaluateAnnotationStore('https://example.com/demo.html');

    assert.deepEqual(headAppends, [], 'expected non-file decks not to inject annotation data scripts into the main document');
    assert.deepEqual(bodyAppends, ['IFRAME'], 'expected non-file decks to continue loading annotation data through the sandbox iframe');
  });
});

describe('annotation store collection', () => {
  it('collects ordinary data-edit-id roots that contain authored fragments into elements', async () => {
    const { window, writes } = createAnnotationStoreHarness(`
      <div class="slide active" data-slide="1">
        <div class="header-title" data-edit-id="title-root">
          Intro <span data-fragment-step="true" data-fragment-format="highlight">hidden fragment</span> content.
        </div>
        <div class="card-desc" data-edit-id="desc-root">Plain content without fragments.</div>
      </div>
    `);

    const data = await authorizeAndCollect(window, writes);

    assert.equal(Object.prototype.hasOwnProperty.call(data.elements, 'title-root'), true, 'expected ordinary roots with authored fragments to enter the shared elements payload');
    assert.equal(Object.prototype.hasOwnProperty.call(data.elements, 'desc-root'), false, 'expected ordinary roots without authored fragments to stay out of the sidecar payload');
  });

  it('collects only the nearest ordinary root that owns a fragment when ordinary roots are nested', async () => {
    const { window, writes } = createAnnotationStoreHarness(`
      <div class="slide active" data-slide="1">
        <section class="card-shell" data-edit-id="outer-root">
          Outer wrapper content.
          <div class="card-body" data-edit-id="inner-root">
            Inner <span data-fragment-step="true" data-fragment-format="highlight">hidden fragment</span> content.
          </div>
        </section>
      </div>
    `);

    const data = await authorizeAndCollect(window, writes);

    assert.equal(Object.prototype.hasOwnProperty.call(data.elements, 'outer-root'), false, 'expected ancestor ordinary roots not to claim fragments owned by a nested ordinary root');
    assert.equal(Object.prototype.hasOwnProperty.call(data.elements, 'inner-root'), true, 'expected the nearest ordinary root that owns the fragment to enter the sidecar payload');
  });

  it('skips ordinary roots on slides that contain quiz-annotation while preserving quiz collection behavior', async () => {
    const { window, writes } = createAnnotationStoreHarness(`
      <div class="slide active" data-slide="1">
        <div class="header-title" data-edit-id="title-root">
          Intro <span data-fragment-step="true" data-fragment-format="highlight">hidden fragment</span> content.
        </div>
        <div class="quiz-annotation">
          <div class="qa-note-bubble" data-link="note-01">
            <div class="qa-note-content" data-edit-id="quiz-root">Quiz note content.</div>
          </div>
        </div>
      </div>
    `);

    const data = await authorizeAndCollect(window, writes);

    assert.equal(Object.prototype.hasOwnProperty.call(data.elements, 'title-root'), false, 'expected ordinary roots on quiz slides to be skipped by the whole-slide ordinary-fragment ban');
    assert.equal(Object.prototype.hasOwnProperty.call(data.elements, 'quiz-root'), true, 'expected existing quiz-internal collection behavior to remain intact on mixed slides');
  });

  it('strips transient reveal state from collected ordinary fragment markup', async () => {
    const { window, writes } = createAnnotationStoreHarness(`
      <div class="slide active" data-slide="1">
        <div class="header-title" data-edit-id="title-root">
          Intro <span class="qa-fragment-visible" data-fragment-step="true" data-fragment-format="highlight" data-fragment-manual-reveal="true">hidden fragment</span> content.
        </div>
      </div>
    `);

    const data = await authorizeAndCollect(window, writes);
    const html = data.elements['title-root'];
    const temp = new JSDOM(`<!DOCTYPE html><html><body><div id="root">${html}</div></body></html>`);
    const fragment = temp.window.document.querySelector('[data-fragment-step="true"]');

    assert.ok(fragment, 'expected collected ordinary fragment markup to retain authored fragment structure');
    assert.equal(fragment.classList.contains('qa-fragment-visible'), false, 'expected sidecar collection to strip runtime-only qa-fragment-visible state from ordinary fragments');
    assert.equal(fragment.hasAttribute('data-fragment-manual-reveal'), false, 'expected sidecar collection to strip runtime-only manual reveal markers from ordinary fragments');
  });
});