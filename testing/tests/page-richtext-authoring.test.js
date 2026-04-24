import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..', '..');
const editorUtilsPath = path.join(projectRoot, 'assets', 'editor-utils.js');
const editorRichTextPath = path.join(projectRoot, 'assets', 'editor-rich-text.js');

const editorUtilsSource = fs.readFileSync(editorUtilsPath, 'utf-8');
const editorRichTextSource = fs.readFileSync(editorRichTextPath, 'utf-8');

function dispatchSelectionChange(window) {
  window.document.dispatchEvent(new window.Event('selectionchange', { bubbles: true }));
}

function dispatchPointerEvent(window, element, type) {
  const event = new window.MouseEvent(type, { bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
}

function clickToolbarControl(window, element) {
  dispatchPointerEvent(window, element, 'pointerdown');
  dispatchPointerEvent(window, element, 'click');
}

function findTextNode(container, text) {
  const walker = container.ownerDocument.createTreeWalker(
    container,
    container.ownerDocument.defaultView.NodeFilter.SHOW_TEXT,
  );

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const index = node.textContent.indexOf(text);
    if (index !== -1) {
      return { node, index };
    }
  }

  throw new Error(`Unable to find text "${text}"`);
}

function stubRangeGeometry(range) {
  const rect = {
    left: 120,
    top: 140,
    right: 260,
    bottom: 164,
    width: 140,
    height: 24,
    x: 120,
    y: 140,
  };

  /* JSDOM 没有真实排版盒模型。这里给选区补最小几何桩，
     让浮动工具条逻辑可以像浏览器里一样根据选区矩形决定是否显示。 */
  range.getBoundingClientRect = () => rect;
  range.getClientRects = () => [rect];
  return range;
}

function applySelection(window, range) {
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(stubRangeGeometry(range));
  dispatchSelectionChange(window);
  return range;
}

function setViewportScroll(window, x, y) {
  Object.defineProperty(window, 'scrollX', {
    value: x,
    configurable: true,
  });
  Object.defineProperty(window, 'scrollY', {
    value: y,
    configurable: true,
  });
}

function selectText(window, container, text) {
  const { node, index } = findTextNode(container, text);
  const range = window.document.createRange();
  range.setStart(node, index);
  range.setEnd(node, index + text.length);
  return applySelection(window, range);
}

function selectAcrossRoots(window, startContainer, startText, endContainer, endText) {
  const start = findTextNode(startContainer, startText);
  const end = findTextNode(endContainer, endText);
  const range = window.document.createRange();
  range.setStart(start.node, start.index);
  range.setEnd(end.node, end.index + endText.length);
  return applySelection(window, range);
}

function createAuthoringDom() {
  const html = `<!DOCTYPE html><html><body>
    <div class="slide active" data-slide="1">
      <div class="header-title" data-edit-id="title-root" contenteditable="true">
        Alpha fragment sample text for ordinary page authoring.
      </div>
      <div class="card-desc" data-edit-id="desc-root" contenteditable="true">
        Beta fragment sample text for ordinary page authoring.
      </div>
      <div class="quiz-annotation">
        <div class="qa-note-content" data-edit-id="quiz-root" contenteditable="true">
          Quiz fragment sample text should stay on the quiz path.
        </div>
      </div>
    </div>
  </body></html>`;

  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'http://localhost/'
  });

  const { window } = dom;
  window.console.log = () => {};
  window.console.warn = () => {};
  window.alert = () => {};
  window.prompt = () => '主语';
  window.document.execCommand = () => true;
  window.editorCore = { isActive: true };

  const persistenceCalls = [];
  const historyCalls = [];
  const scheduleSaveCalls = [];
  window.PersistenceLayer = {
    saveElement(element) {
      persistenceCalls.push(element);
    }
  };
  window.historyMgr = {
    recordState(forceSnapshot) {
      historyCalls.push(forceSnapshot);
    }
  };
  window.AnnotationStore = {
    scheduleSave() {
      scheduleSaveCalls.push('scheduled');
    }
  };

  /* 这里不加载 editor-core。测试只关心 editor-rich-text 的普通页面作者态分支，
     因此手工提供最小全局桩，避免把顶部 rich-toolbar 注入和其他编辑器职责带进来。 */
  window.eval(editorUtilsSource);
  window.eval(editorRichTextSource);
  window.RichTextToolbar.init();

  return {
    dom,
    window,
    persistenceCalls,
    historyCalls,
    scheduleSaveCalls,
  };
}

function getPageFragmentToolbar(document) {
  return document.querySelector('.page-richtext-fragment-toolbar');
}

function requireVisiblePageFragmentToolbar(document) {
  const toolbar = getPageFragmentToolbar(document);
  assert.ok(toolbar?.classList.contains('visible'), 'expected the ordinary-page fragment toolbar to be visible before interacting with its controls');
  return toolbar;
}

function getToolbarButton(toolbar, matcher) {
  if (!toolbar) return null;
  return Array.from(toolbar.querySelectorAll('button')).find((button) => {
    const title = button.getAttribute('title') || '';
    const text = (button.textContent || '').trim();
    return title.includes(matcher) || text.includes(matcher);
  }) || null;
}

describe('page richtext authoring', () => {
  it('shows a dedicated ordinary-page fragment toolbar with the hidden-annotation label for partial single-root selection', () => {
    const { window } = createAuthoringDom();
    const titleRoot = window.document.querySelector('[data-edit-id="title-root"]');

    selectText(window, titleRoot, 'fragment sample');

    const toolbar = getPageFragmentToolbar(window.document);
    assert.ok(toolbar?.classList.contains('visible'), 'expected partial selection inside one ordinary root to show the dedicated ordinary-page fragment toolbar');
    assert.match(toolbar?.textContent || '', /隐藏型标注/, 'expected the ordinary-page toolbar to carry the explicit hidden-annotation label');
    assert.equal(window.document.querySelector('.qa-note-fragment-toolbar'), null, 'expected ordinary-page authoring not to reuse the quiz fragment toolbar DOM');

    const buttonLabels = Array.from(toolbar.querySelectorAll('button')).map((button) => button.getAttribute('title') || (button.textContent || '').trim());
    assert.ok(buttonLabels.some((label) => label.includes('文字颜色')), 'expected the ordinary toolbar to expose a text-color control');
    assert.ok(buttonLabels.some((label) => label.includes('背景高光')), 'expected the ordinary toolbar to expose a highlight control');
    assert.ok(buttonLabels.some((label) => label.includes('删除线')), 'expected the ordinary toolbar to expose a strikethrough control');
    assert.ok(buttonLabels.some((label) => label.includes('顶标')), 'expected the ordinary toolbar to expose a ruby control');
    assert.ok(buttonLabels.some((label) => label.includes('清除格式')), 'expected the ordinary toolbar to expose a clear-format control');
  });

  it('positions the ordinary-page fragment toolbar in viewport coordinates even when scroll offsets are non-zero', () => {
    const { window } = createAuthoringDom();
    const titleRoot = window.document.querySelector('[data-edit-id="title-root"]');

    setViewportScroll(window, 48, 96);
    selectText(window, titleRoot, 'fragment sample');

    const toolbar = requireVisiblePageFragmentToolbar(window.document);
    assert.equal(toolbar.style.left, '190px', 'expected the fixed ordinary-page toolbar to use the selection viewport x coordinate directly instead of re-adding scrollX');
    assert.equal(toolbar.style.top, '140px', 'expected the fixed ordinary-page toolbar to use the selection viewport y coordinate directly instead of re-adding scrollY');
  });

  it('does not show the ordinary-page fragment toolbar for cross-root selections', () => {
    const { window } = createAuthoringDom();
    const titleRoot = window.document.querySelector('[data-edit-id="title-root"]');
    const descRoot = window.document.querySelector('[data-edit-id="desc-root"]');

    selectAcrossRoots(window, titleRoot, 'fragment', descRoot, 'fragment');

    const toolbar = getPageFragmentToolbar(window.document);
    assert.equal(toolbar?.classList.contains('visible') || false, false, 'expected cross-root selections to be rejected before the ordinary fragment toolbar becomes visible');
  });

  it('does not show the ordinary-page fragment toolbar for quiz-internal selections', () => {
    const { window } = createAuthoringDom();
    const quizRoot = window.document.querySelector('[data-edit-id="quiz-root"]');

    selectText(window, quizRoot, 'fragment sample');

    const toolbar = getPageFragmentToolbar(window.document);
    assert.equal(toolbar?.classList.contains('visible') || false, false, 'expected quiz-internal rich text to stay on the quiz authoring path instead of opening the ordinary page toolbar');
  });

  it('authors fragment markup with step, format, and group attributes inside the current ordinary root', () => {
    const { window } = createAuthoringDom();
    const titleRoot = window.document.querySelector('[data-edit-id="title-root"]');

    selectText(window, titleRoot, 'fragment sample');

    const toolbar = requireVisiblePageFragmentToolbar(window.document);
    clickToolbarControl(window, getToolbarButton(toolbar, '删除线'));

    const fragment = titleRoot.querySelector('[data-fragment-step="true"]');
    assert.ok(fragment, 'expected the ordinary root to receive an authored fragment wrapper after clicking a format button');
    assert.equal(fragment.getAttribute('data-fragment-step'), 'true', 'expected ordinary page authoring to emit the runtime-compatible step marker');
    assert.equal(fragment.getAttribute('data-fragment-format'), 'strikethrough', 'expected the authored wrapper to record the chosen fragment format');
    assert.ok(fragment.getAttribute('data-fragment-group'), 'expected the authored wrapper to receive a reveal-group id');
    assert.equal(window.document.querySelector('[data-edit-id="desc-root"] [data-fragment-step="true"]'), null, 'expected authoring to stay within the active ordinary root');
  });

  it('calls AnnotationStore.scheduleSave after adding an ordinary fragment', () => {
    const { window, scheduleSaveCalls } = createAuthoringDom();
    const titleRoot = window.document.querySelector('[data-edit-id="title-root"]');

    selectText(window, titleRoot, 'fragment sample');
    clickToolbarControl(window, getToolbarButton(requireVisiblePageFragmentToolbar(window.document), '删除线'));

    assert.equal(scheduleSaveCalls.length, 1, 'expected ordinary fragment authoring to schedule one sidecar save immediately after adding authored fragment markup');
  });

  it('reuses the same fragment group when a second rich-text layer is authored inside an existing ordinary fragment', () => {
    const { window } = createAuthoringDom();
    const titleRoot = window.document.querySelector('[data-edit-id="title-root"]');

    selectText(window, titleRoot, 'fragment sample');
    clickToolbarControl(window, getToolbarButton(requireVisiblePageFragmentToolbar(window.document), '删除线'));

    const outerFragment = titleRoot.querySelector('[data-fragment-step="true"]');
    assert.ok(outerFragment, 'expected the first authored fragment layer to exist before nesting another format');

    selectText(window, outerFragment, 'fragment');
    clickToolbarControl(window, getToolbarButton(requireVisiblePageFragmentToolbar(window.document), '顶标'));

    const nestedFragment = outerFragment.querySelector('[data-fragment-step="true"][data-fragment-format="ruby"]');
    assert.ok(nestedFragment, 'expected the second authored fragment layer to exist');
    assert.equal(
      nestedFragment.getAttribute('data-fragment-group'),
      outerFragment.getAttribute('data-fragment-group'),
      'expected multiple authored layers over the same reveal unit to reuse one fragment group id',
    );
  });

  it('clears ordinary fragment wrappers that intersect the current selection', () => {
    const { window } = createAuthoringDom();
    const titleRoot = window.document.querySelector('[data-edit-id="title-root"]');
    titleRoot.innerHTML = 'Alpha <span data-fragment-step="true" data-fragment-format="highlight" data-fragment-group="frag-01"><span data-fragment-step="true" data-fragment-format="ruby" data-fragment-group="frag-01"><ruby>fragment<rt>主语</rt></ruby></span></span> sample text.';

    selectText(window, titleRoot, 'fragment');
    clickToolbarControl(window, getToolbarButton(requireVisiblePageFragmentToolbar(window.document), '清除格式'));

    assert.equal(titleRoot.querySelector('[data-fragment-step="true"]'), null, 'expected clear-format to remove every ordinary fragment wrapper intersecting the current selection');
    assert.match(titleRoot.textContent, /fragment/, 'expected clear-format to preserve the readable base text after removing fragment wrappers');
  });

  it('calls AnnotationStore.scheduleSave after clearing ordinary fragment format', () => {
    const { window, scheduleSaveCalls } = createAuthoringDom();
    const titleRoot = window.document.querySelector('[data-edit-id="title-root"]');
    titleRoot.innerHTML = 'Alpha <span data-fragment-step="true" data-fragment-format="highlight" data-fragment-group="frag-01"><span data-fragment-step="true" data-fragment-format="ruby" data-fragment-group="frag-01"><ruby>fragment<rt>主语</rt></ruby></span></span> sample text.';

    selectText(window, titleRoot, 'fragment');
    clickToolbarControl(window, getToolbarButton(requireVisiblePageFragmentToolbar(window.document), '清除格式'));

    assert.equal(scheduleSaveCalls.length, 1, 'expected ordinary fragment clear-format to schedule one sidecar save after removing authored fragment wrappers');
  });

  it('calls PersistenceLayer.saveElement(root) and historyMgr.recordState(true) after ordinary authoring changes', () => {
    const { window, persistenceCalls, historyCalls } = createAuthoringDom();
    const titleRoot = window.document.querySelector('[data-edit-id="title-root"]');

    selectText(window, titleRoot, 'fragment sample');
    clickToolbarControl(window, getToolbarButton(requireVisiblePageFragmentToolbar(window.document), '删除线'));

    assert.deepEqual(persistenceCalls, [titleRoot], 'expected ordinary fragment authoring to persist the owning root immediately after DOM changes');
    assert.deepEqual(historyCalls, [true], 'expected ordinary fragment authoring to record a force-snapshot history state after DOM changes');
  });
});