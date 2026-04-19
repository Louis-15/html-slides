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