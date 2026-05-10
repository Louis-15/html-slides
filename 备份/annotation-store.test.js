import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..', '..');
const annotationStorePath = path.join(projectRoot, 'assets', 'runtime', 'annotation-store.js');
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

function createAnnotationStoreHarness(bodyHtml, url = 'https://example.com/demo.html', options = {}) {
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${bodyHtml}</body></html>`, {
    runScripts: 'outside-only',
    url
  });
  const { window } = dom;
  const writes = [];
  const pickerCalls = [];
  const pendingTimers = [];
  const originalHeadAppendChild = window.document.head.appendChild.bind(window.document.head);

  window.console.log = () => {};
  window.console.warn = () => {};
  window.EditorHooks = {
    _hooks: {
      onEditModeExit: []
    },
    register(hookName, fn) {
      if (!this._hooks[hookName]) this._hooks[hookName] = [];
      this._hooks[hookName].push(fn);
    },
    fire(hookName, arg) {
      (this._hooks[hookName] || []).forEach((fn) => fn(arg));
    }
  };
  window.indexedDB = {
    open() {
      throw new Error('indexeddb-disabled-for-test');
    }
  };
  window.setTimeout = (callback) => {
    if (options.deferTimers) {
      pendingTimers.push(callback);
      return pendingTimers.length;
    }
    callback();
    return 1;
  };
  window.clearTimeout = () => {};
  window.document.head.appendChild = (node) => {
    if (node.tagName === 'SCRIPT' && /\.annotations\.js$/i.test(node.src || '')) {
      queueMicrotask(() => {
        if (options.mockAnnotationData) {
          window.__annotationData = options.mockAnnotationData;
          if (typeof node.onload === 'function') node.onload();
          return;
        }

        if (typeof node.onerror === 'function') node.onerror(new Error('missing-annotation-sidecar-for-test'));
      });
      return node;
    }
    return originalHeadAppendChild(node);
  };
  const writableHandle = options.fileHandle || ({
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    createWritable: async () => ({
      write: async (content) => {
        writes.push(content);
      },
      close: async () => {}
    })
  });
  window.showSaveFilePicker = async () => {
    pickerCalls.push('picked');
    return writableHandle;
  };

  window.eval(annotationStoreSource);

  return {
    dom,
    window,
    writes,
    pickerCalls,
    runPendingTimers() {
      while (pendingTimers.length > 0) {
        const callback = pendingTimers.shift();
        callback();
      }
    }
  };
}

async function authorizeAndCollect(window, writes) {
  const saved = await window.AnnotationStore.authorizeAndSave();
  assert.equal(saved, true, 'expected authorizeAndSave to succeed with the fake writable handle');
  assert.ok(writes.length > 0, 'expected authorizeAndSave to write one annotation payload');
  return parseAnnotationPayload(writes[writes.length - 1]);
}

async function flushMicrotasks(turns = 4) {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
  }
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
  it('flushes a pending sidecar save immediately when edit mode exits', async () => {
    const { window, writes } = createAnnotationStoreHarness(`
      <div class="slide active" data-slide="1">
        <div class="header-title" data-edit-id="title-root">
          Intro <span data-fragment-step="true" data-fragment-format="highlight">hidden fragment</span> content.
        </div>
      </div>
    `, 'file:///D:/Projects/html-slides/demo.html', { deferTimers: true });

    await window.AnnotationStore.whenReady();
    await window.AnnotationStore.authorizeAndSave();
    writes.length = 0;

    const titleRoot = window.document.querySelector('[data-edit-id="title-root"]');
    titleRoot.innerHTML = 'Updated <span data-fragment-step="true" data-fragment-format="highlight">hidden fragment</span> content.';

    window.AnnotationStore.scheduleSave();
    assert.equal(writes.length, 0, 'expected the delayed save queue not to write immediately before edit mode exits');

    window.EditorHooks.fire('onEditModeExit');
    await flushMicrotasks();

    assert.equal(writes.length, 1, 'expected edit mode exit to flush the pending sidecar save immediately');
    const data = parseAnnotationPayload(writes[writes.length - 1]);
    assert.match(data.elements['title-root'], /Updated/, 'expected the flushed payload to contain the newest rich-text authoring change');
  });

  it('serializes overlapping sidecar writes so a later save cannot truncate the file mid-write', async () => {
    let activeWritableCount = 0;
    let peakWritableCount = 0;
    let writableSerial = 0;
    let releaseFirstWrite;
    const firstWriteGate = new Promise((resolve) => {
      releaseFirstWrite = resolve;
    });
    const lifecycle = [];
    const writes = [];
    const fileHandle = {
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      createWritable: async () => {
        writableSerial += 1;
        const currentSerial = writableSerial;
        activeWritableCount += 1;
        peakWritableCount = Math.max(peakWritableCount, activeWritableCount);
        lifecycle.push(`create:${currentSerial}`);
        return {
          write: async (content) => {
            lifecycle.push(`write:${currentSerial}`);
            writes.push(content);
            if (currentSerial === 1) {
              await firstWriteGate;
            }
          },
          close: async () => {
            lifecycle.push(`close:${currentSerial}`);
            activeWritableCount -= 1;
          }
        };
      }
    };
    const harness = createAnnotationStoreHarness(`
      <div class="slide active" data-slide="1">
        <div class="header-title" data-edit-id="title-root">Initial <span data-fragment-step="true" data-fragment-format="highlight">title</span>.</div>
      </div>
    `, 'file:///D:/Projects/html-slides/demo.html', { fileHandle });
    const { window } = harness;

    await window.AnnotationStore.whenReady();

    const firstSavePromise = window.AnnotationStore.authorizeAndSave();
    await flushMicrotasks();

    window.document.querySelector('[data-edit-id="title-root"]').innerHTML = 'Updated <span data-fragment-step="true" data-fragment-format="highlight">title</span>.';
    const secondSavePromise = window.AnnotationStore.saveNow();
    await flushMicrotasks();

    assert.deepEqual(lifecycle, ['create:1', 'write:1'], 'expected the second save to wait until the first writable fully finishes before opening a new one');
    assert.equal(peakWritableCount, 1, 'expected annotation-store never to hold two writable handles for the same sidecar at once');

    releaseFirstWrite();
    await Promise.all([firstSavePromise, secondSavePromise]);

    assert.equal(peakWritableCount, 1, 'expected serialized writes to keep writable concurrency at one even after queued saves flush');
    assert.deepEqual(lifecycle, ['create:1', 'write:1', 'close:1', 'create:2', 'write:2', 'close:2'], 'expected queued writes to run strictly one after another');
    assert.equal(writes.length, 2, 'expected both save requests to eventually flush their payloads');
    const latestPayload = parseAnnotationPayload(writes[1]);
    assert.match(latestPayload.elements['title-root'], /Updated/, 'expected the later queued save to preserve the newest DOM snapshot');
  });

  it('requests write access on the first user gesture without eagerly rewriting the sidecar payload', async () => {
    const { window, writes, pickerCalls } = createAnnotationStoreHarness(`
      <div class="slide active" data-slide="1">
        <div class="header-title" data-edit-id="title-root">
          Intro <span data-fragment-step="true" data-fragment-format="highlight">hidden fragment</span> content.
        </div>
      </div>
    `);

    await window.AnnotationStore.whenReady();

    window.document.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    assert.deepEqual(pickerCalls, ['picked'], 'expected annotation-store to request file access on the first real user gesture when no write handle is cached');
    assert.equal(writes.length, 0, 'expected first-gesture authorization to acquire access only, without eagerly overwriting the sidecar before the user actually edits content');
    assert.equal(window.AnnotationStore.hasWriteAccess(), true, 'expected write access to remain available for subsequent automatic saves after the first authorization');
  });

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

  it('collects example-card option roots that contain authored fragments into ordinary elements payload', async () => {
    const { window, writes } = createAnnotationStoreHarness(`
      <div class="slide active" data-slide="1">
        <section class="example-card">
          <button type="button" class="qa-option example-card__option" data-option-value="A">
            <span class="qa-option-label">A</span>
            <span class="qa-option-text" data-edit-id="example-option-a">
              Option <span data-fragment-step="true" data-fragment-format="highlight">hidden fragment</span> text.
            </span>
          </button>
        </section>
      </div>
    `);

    const data = await authorizeAndCollect(window, writes);

    assert.equal(Object.prototype.hasOwnProperty.call(data.elements, 'example-option-a'), true, 'expected example-card option roots with authored fragments to enter the shared ordinary elements payload');
  });

  it('restores sidecar element payloads into example-card option roots on deck reload', async () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>
      <div class="slide active" data-slide="1">
        <section class="example-card">
          <button type="button" class="qa-option example-card__option" data-option-value="A">
            <span class="qa-option-label">A</span>
            <span class="qa-option-text" data-edit-id="example-option-a">Original option text.</span>
          </button>
        </section>
      </div>
    </body></html>`, {
      runScripts: 'outside-only',
      url: 'file:///D:/Projects/html-slides/deck.html'
    });

    const { window } = dom;
    window.console.log = () => {};
    window.console.warn = () => {};
    window._editorUtils = {
      ensureStableEditableIds() {}
    };
    window.indexedDB = {
      open() {
        throw new Error('indexeddb-disabled-for-test');
      }
    };

    const originalAppendChild = window.document.head.appendChild.bind(window.document.head);

    window.document.head.appendChild = (node) => {
      if (node.tagName === 'SCRIPT' && /deck\.annotations\.js$/i.test(node.src || '')) {
        window.__annotationData = {
          version: 1,
          title: 'deck',
          elements: {
            'example-option-a': 'Restored <span data-fragment-step="true" data-fragment-format="highlight">fragment</span> text.'
          },
          answerKeys: [],
          deletedNotes: []
        };
        queueMicrotask(() => {
          if (typeof node.onload === 'function') node.onload();
        });
        return node;
      }
      return originalAppendChild(node);
    };

    window.eval(annotationStoreSource);
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    window.dispatchEvent(new window.Event('load'));
    await Promise.resolve();
    await Promise.resolve();

    const target = window.document.querySelector('[data-edit-id="example-option-a"]');

    assert.match(target.innerHTML, /data-fragment-step="true"/);
    assert.match(target.textContent, /Restored/);
  });

  it('prefers localStorage content over stale sidecar payloads for the same edit root on reload', async () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>
      <div class="slide active" data-slide="1">
        <div class="quiz-annotation">
          <p data-edit-id="s1-p3">Original paragraph.</p>
        </div>
      </div>
    </body></html>`, {
      runScripts: 'outside-only',
      url: 'file:///D:/Projects/html-slides/deck.html'
    });

    const { window } = dom;
    window.console.log = () => {};
    window.console.warn = () => {};
    window._editorUtils = {
      ensureStableEditableIds() {},
      storageKey(suffix) {
        return `test:${suffix}`;
      },
      legacyStorageKey(suffix) {
        return `legacy:${suffix}`;
      }
    };
    const localStore = new Map();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem(key) {
          return localStore.has(key) ? localStore.get(key) : null;
        },
        setItem(key, value) {
          localStore.set(key, String(value));
        },
        removeItem(key) {
          localStore.delete(key);
        }
      }
    });
    window.localStorage.setItem(
      'test:e:s1-p3',
      'Fresh <span data-fragment-step="true" data-fragment-format="strikethrough">local</span> paragraph.'
    );
    window.indexedDB = {
      open() {
        throw new Error('indexeddb-disabled-for-test');
      }
    };

    const originalAppendChild = window.document.head.appendChild.bind(window.document.head);

    window.document.head.appendChild = (node) => {
      if (node.tagName === 'SCRIPT' && /deck\.annotations\.js$/i.test(node.src || '')) {
        window.__annotationData = {
          version: 1,
          title: 'deck',
          elements: {
            's1-p3': 'Stale <span data-fragment-step="true" data-fragment-format="highlight">sidecar</span> paragraph.'
          },
          answerKeys: [],
          deletedNotes: []
        };
        queueMicrotask(() => {
          if (typeof node.onload === 'function') node.onload();
        });
        return node;
      }
      return originalAppendChild(node);
    };

    window.eval(annotationStoreSource);
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    window.dispatchEvent(new window.Event('load'));
    await Promise.resolve();
    await Promise.resolve();

    const target = window.document.querySelector('[data-edit-id="s1-p3"]');

    assert.match(target.textContent, /Fresh local paragraph\./, 'expected localStorage to remain authoritative when it already contains a fresher edit-root snapshot than the sidecar');
    assert.doesNotMatch(target.textContent, /Stale sidecar paragraph\./, 'expected stale sidecar content not to overwrite the fresher localStorage snapshot during reload');
  });
});