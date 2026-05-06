# 答题与批注组件代码拆分 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `quiz-annotation-runtime.js`（~4800 行）和 `zone2-quiz-annotation.css`（~1500 行）按功能模块拆分为多个小文件，零行为变更，TDD 驱动。

**Architecture:** 共享命名空间 `window.QA`，IIFE 隔离内部变量。新目录 `assets/zones/zone2-quiz-annotation/` 包含 15 个 JS 子模块 + 14 个 CSS 子文件。旧 `quiz-annotation-runtime.js` 替换为聚合入口。

**Tech Stack:** 纯 JavaScript IIFE + Node.js 内置 test runner + jsdom 22.x

---

## 文件结构总览

```
assets/zones/zone2-quiz-annotation/     ← 新建目录（子模块 + CSS）
├── core.js                             ← [新建] 工具函数、全局状态
├── fragments.js                        ← [新建] 片段二级步进
├── persistence.js                      ← [新建] persistAnchorChange + onExportClean
├── panel.js                            ← [新建] 面板展开/收起 + 分割线按钮
├── stepping.js                         ← [新建] registerStepStrategy
├── activation.js                       ← [新建] 激活/降噪/追视
├── connectors.js                       ← [新建] SVG 贝塞尔连线
├── dragdrop.js                         ← [新建] 拖拽排序 + recalcStepNumbers
├── quiz-base.js                        ← [新建] 答题共享层（题型推断、提交、重置）
├── quiz-single.js                      ← [新建] ★ 阅读单选（选项交互、答案编辑、判分）
├── quiz-matching.js                    ← [新建] ★ 阅读七选五（拖拽配对、槽位、判分）
├── quiz-blank.js                       ← [新建] ★ 阅读填空（输入框、正确答案、判分）
├── note-interactions.js                ← [新建] 气泡交互按钮 + 孤儿重建
├── linking.js                          ← [新建] 关联模式
├── toolbar.js                          ← [新建] 浮动工具条 + 批注创建
├── header.js                           ← [新建] 栏头 + 迁移 + 孤儿重建
├── init.js                             ← [新建] autoInit + 页面切换
├── layout.css                          ← [新建] CSS: 布局
├── notes-panel.css                     ← [新建] CSS: 批注面板
├── answer-panel.css                    ← [新建] CSS: 答题区
├── anchors-bubbles.css                 ← [新建] CSS: 锚点 + 气泡
├── connectors.css                      ← [新建] CSS: SVG 连线
├── dragdrop.css                        ← [新建] CSS: 拖拽
├── divider-btn.css                     ← [新建] CSS: 分割线按钮
├── quiz-isolation.css                  ← [新建] CSS: 答题隔离
├── linking-mode.css                    ← [新建] CSS: 关联模式
├── scrollbar.css                       ← [新建] CSS: 滚动条
├── editor-toolbar.css                  ← [新建] CSS: 工具条
├── fragments.css                       ← [新建] CSS: 富文本片段
├── a11y.css                            ← [新建] CSS: 无障碍
└── README.md                           ← [新建] AI 工程地图文档

assets/quiz-annotation-runtime.js       ← [修改] 替换为聚合入口（同步 XHR + eval 加载子模块）
assets/zones/zone2-quiz-annotation.css   ← [修改] 替换为 CSS @import 聚合入口
testing/tests/quiz-annotation/          ← [新建] 测试目录
├── core.test.js                        ← [新建]
├── fragments.test.js                   ← [新建]
├── persistence.test.js                 ← [新建]
├── connectors.test.js                  ← [新建]
├── dragdrop.test.js                    ← [新建]
├── quiz-base.test.js                    ← [新建]
├── quiz-single.test.js                  ← [新建] ★
├── quiz-matching.test.js                ← [新建] ★
├── quiz-blank.test.js                   ← [新建] ★
├── note-interactions.test.js           ← [新建]
├── linking.test.js                     ← [新建]
├── toolbar.test.js                     ← [新建]
├── header.test.js                      ← [新建]
└── integration.test.js                 ← [新建]
```

> 注：`panel.js`、`stepping.js`、`activation.js`、`init.js` 的内部逻辑不单独测试（它们主要做编排和注册，正确性由集成测试覆盖）。

---

### Phase 0: 测试基础设施搭建

**Files:**
- Create: `testing/tests/quiz-annotation/` 目录
- Create: `testing/tests/quiz-annotation/helpers.js`

- [ ] **Step 1: 新建测试 helpers 文件**

```javascript
// testing/tests/quiz-annotation/helpers.js
// 答题与批注组件测试公共桩，避免每个测试文件重复声明

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..', '..', '..');

/** 读取 assets/ 下文件源码 */
export function loadSource(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf-8');
}

/** 创建带基本浏览器桩的 JSDOM */
export function createJSDOM(html, options = {}) {
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'http://localhost/',
    ...options
  });
  const win = dom.window;

  // 浏览器 API 桩
  win.requestAnimationFrame = (cb) => { cb(); return 1; };
  win.cancelAnimationFrame = () => {};
  win.matchMedia = () => ({ matches: false, media: '', addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } });
  win.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  win.MutationObserver = class { constructor(cb) { this._cb = cb; } observe() {} disconnect() {} takeRecords() { return []; } };
  win.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  win.alert = () => {};
  win.confirm = () => true;
  win.prompt = () => '顶标';
  win.HTMLElement.prototype.scrollIntoView = () => {};

  win.EditorHooks = {
    onEditModeEnter: [], onEditModeExit: [], onExportClean: [], onSlideChange: [],
    register(name, fn) { if (Array.isArray(this[name])) this[name].push(fn); },
    fire(name, arg) { if (Array.isArray(this[name])) this[name].forEach(fn => fn(arg)); }
  };

  win._editorUtils = {
    storageKey(suffix) { return 'qa-test:' + (suffix || ''); },
    getCurrentSlideIndex() { return 0; },
    getAllSlides() { return win.document.querySelectorAll('.slide'); },
    getEditableCandidates() { return []; },
    ensureStableEditableIds() {},
    hashTitle() { return 'test-hash'; }
  };

  win.PersistenceLayer = {
    saveElement() {},
    restoreAllElements() {},
    _stripHTML(html) { return html; }
  };

  return dom;
}

/** 加载运行时子模块到 JSDOM window */
export function evalModule(window, moduleName) {
  const src = loadSource(`assets/zones/zone2-quiz-annotation/${moduleName}`);
  window.eval(src);
}

/** HTML 模板：最小答题与批注组件结构 */
export function minimalQAHTML(options = {}) {
  const { hasQuiz = false, passageText = 'Hello world', notesHtml = '', answerHtml = '' } = options;
  return `<!DOCTYPE html><html><body>
    <div class="slide active" data-slide="1">
      <div class="quiz-annotation${hasQuiz ? ' has-quiz' : ''} notes-active">
        <div class="qa-body">
          <div class="qa-passage">${passageText}</div>
          ${answerHtml ? `<div class="qa-answer-panel"><div class="qa-answer-content">${answerHtml}</div></div>` : ''}
          <div class="qa-notes-panel">${notesHtml}</div>
        </div>
      </div>
    </div>
  </body></html>`;
}
```

- [ ] **Step 2: 验证测试基础设施可用**

```bash
node -e "
import { createJSDOM, minimalQAHTML } from './testing/tests/quiz-annotation/helpers.js';
const dom = createJSDOM(minimalQAHTML());
console.log('QA element:', dom.window.document.querySelector('.quiz-annotation') !== null);
console.log('PASS: test infrastructure ready');
"
```

预期输出：`QA element: true` `PASS: test infrastructure ready`

- [ ] **Step 3: Commit**

```bash
git add testing/tests/quiz-annotation/helpers.js
git add testing/tests/quiz-annotation/
git commit -m "test: add quiz-annotation test infrastructure"
```

---

### Phase 1: core.js — 工具函数 + 全局状态

**Files:**
- Create: `assets/zones/zone2-quiz-annotation/core.js`
- Create: `testing/tests/quiz-annotation/core.test.js`
- Modify: 源文件不修改，仅从中提取函数声明到新文件

- [ ] **Step 1: 写 core.test.js 测试**

```javascript
// testing/tests/quiz-annotation/core.test.js
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createJSDOM, minimalQAHTML, evalModule } from './helpers.js';

describe('core.js — 工具函数与全局状态', () => {
  let dom, window;

  before(() => {
    dom = createJSDOM(minimalQAHTML({ hasQuiz: true,
      passageText: '<span class="text-anchor" data-link="note-01" data-step="1">Hello<sup class="note-badge">1</sup></span>',
      notesHtml: '<div class="qa-note-bubble" data-link="note-01" data-step="1"><div class="qa-note-step">1</div></div>'
    }));
    window = dom.window;
    evalModule(window, 'core.js');
  });

  it('getActiveQA 返回 .slide.active 内的 .quiz-annotation', () => {
    const qa = window.QA.getActiveQA();
    assert.ok(qa);
    assert.ok(qa.classList.contains('quiz-annotation'));
  });

  it('getSortedBubbles 按 data-step 排序', () => {
    const qa = window.QA.getActiveQA();
    const bubbles = window.QA.getSortedBubbles(qa);
    assert.equal(bubbles.length, 1);
    assert.equal(bubbles[0].dataset.link, 'note-01');
  });

  it('getNotesBubbleContainer 返回 .qa-notes-panel', () => {
    const qa = window.QA.getActiveQA();
    const container = window.QA.getNotesBubbleContainer(qa);
    assert.ok(container);
    assert.ok(container.classList.contains('qa-notes-panel'));
  });

  it('getAnchorByLink 返回正确的锚点', () => {
    const qa = window.QA.getActiveQA();
    const anchor = window.QA.getAnchorByLink(qa, 'note-01');
    assert.ok(anchor);
    assert.ok(anchor.classList.contains('text-anchor'));
  });

  it('getBubbleByLink 返回正确的批注气泡', () => {
    const qa = window.QA.getActiveQA();
    const bubble = window.QA.getBubbleByLink(qa, 'note-01');
    assert.ok(bubble);
    assert.ok(bubble.classList.contains('qa-note-bubble'));
  });

  it('isEditorMode 默认返回 false', () => {
    assert.equal(window.QA.isEditorMode(), false);
  });

  it('READING_TYPE_LABELS 包含四种类型', () => {
    const labels = window.QA.READING_TYPE_LABELS;
    assert.equal(labels.single, '阅读单选');
    assert.equal(labels.matching, '阅读七选五');
    assert.equal(labels.blank, '阅读填空');
    assert.equal(labels.analysis, '文章解析');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd testing && node --test tests/quiz-annotation/core.test.js
```

预期：FAIL（core.js 尚不存在或缺少内容）

- [ ] **Step 3: 创建 core.js**

从 `quiz-annotation-runtime.js` 中提取以下内容到 `core.js`：

提取的行范围（原始文件中的区块）：
- 第 27-29 行：`READING_TYPE_LABELS` 常量
- 第 39-113 行：`getActiveQA`、`getSortedBubbles`、`getNotesBubbleContainer`、`getOrderedPassageLinkIds`、`syncBubbleOrderToPassageAnchors`、`getAnchorByLink` — 组件定位与气泡操作
- 第 115-127 行：`getAnswerAnchorByLink`、`getAnswerAnchorsByLink`、`getBubbleByLink` — 锚点查找
- 第 133-157 行：`normalizeBubbleEndpointState`、`normalizeAllBubbleEndpointStates` — 端点状态标准化
- 第 168-211 行：`readStoredEditableHTML`、`getAnnotationStoreElementHTML`、`clearStoredEditableHTML`、`hydrateDynamicNoteContent` — localStorage 存储辅助
- 第 226-257 行：`isEditorMode`、`isDoodleMode`、`isDoodleDrawingActive`、`shouldSuppressFragmentDiscovery`、`shouldLockKeyboardAnnotationStepping` — 模式判断
- 第 258-283 行：`getActiveDoodleLayer`、`getElementBehindDoodleLayer`、`resolveDoodlePassthroughTarget` — 涂鸦穿透辅助
- 第 288-312 行：`normalizeStrikethroughColor`、`normalizeStrikethroughThickness` — 样式归一化
- 第 4670-4720 行附近：`arrangeAdjacentBadges` — 角标智能避让

将以上内容包裹在 `window.QA` 命名空间中：

```javascript
// assets/zones/zone2-quiz-annotation/core.js
(function () {
  'use strict';
  var QA = window.QA = window.QA || {};

  QA.READING_TYPE_LABELS = {
    single: '阅读单选',
    matching: '阅读七选五',
    blank: '阅读填空',
    analysis: '文章解析'
  };

  QA.getActiveQA = function () {
    var activeSlide = document.querySelector('.slide.active');
    if (!activeSlide) return null;
    return activeSlide.querySelector('.quiz-annotation');
  };

  // ... 其余函数，将 function xxx() 改为 QA.xxx = function()，const 改为 var
})();
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd testing && node --test tests/quiz-annotation/core.test.js
```

预期：PASS（所有 core 测试通过）

- [ ] **Step 5: Commit**

```bash
git add assets/zones/zone2-quiz-annotation/core.js testing/tests/quiz-annotation/core.test.js
git commit -m "feat: extract core.js — utility functions and global state"
```

---

### Phase 2: fragments.js — 片段二级步进

**Files:**
- Create: `assets/zones/zone2-quiz-annotation/fragments.js`
- Create: `testing/tests/quiz-annotation/fragments.test.js`

- [ ] **Step 1: 写 fragments.test.js**

```javascript
// testing/tests/quiz-annotation/fragments.test.js
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createJSDOM, minimalQAHTML, evalModule } from './helpers.js';

describe('fragments.js — 片段二级步进', () => {
  let dom, window;

  before(() => {
    dom = createJSDOM(minimalQAHTML({
      passageText: '<span class="text-anchor" data-link="note-01" data-step="1"><span data-fragment-step="true" data-fragment-format="color" data-fragment-group="g1" style="--qa-fragment-color: red;">Hello</span><sup class="note-badge">1</sup></span>',
      notesHtml: '<div class="qa-note-bubble" data-link="note-01" data-step="1"><div class="qa-note-step">1</div></div>'
    }));
    window = dom.window;
    evalModule(window, 'core.js');
    evalModule(window, 'fragments.js');
  });

  it('getFragmentOwnerLinkId 返回正确 linkId', () => {
    const fragment = window.document.querySelector('[data-fragment-step="true"]');
    const linkId = window.QA.getFragmentOwnerLinkId(fragment);
    assert.equal(linkId, 'note-01');
  });

  it('getNoteFragmentEntries 返回正确条目数', () => {
    const qa = window.QA.getActiveQA();
    const bubble = qa.querySelector('.qa-note-bubble');
    const entries = window.QA.getNoteFragmentEntries(bubble);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].key, 'group:g1');
  });

  it('syncNoteFragments 在编辑模式下揭示所有片段', () => {
    window.document.documentElement.classList.add('editor-mode');
    const qa = window.QA.getActiveQA();
    const bubble = qa.querySelector('.qa-note-bubble');
    window.QA.syncNoteFragments(bubble);
    const fragment = window.document.querySelector('[data-fragment-step="true"]');
    assert.ok(fragment.classList.contains('qa-fragment-visible'));
    window.document.documentElement.classList.remove('editor-mode');
  });
});
```

- [ ] **Step 2: 运行测试确认失败 → 创建 fragments.js → 确认通过 → Commit**

（步骤结构与 Phase 1 相同，后续 Phase 不再重复此模式文字）

---

### Phase 3: persistence.js — 持久化 + onExportClean

**Files:** Create `persistence.js` + `persistence.test.js`

提取内容：
- `persistAnchorChange(anchor, options)` — 锚点变更后立即写 localStorage
- `persistQuizAuthoringChange(options)` — 答题作者态变更持久化
- `scheduleAnnotationSave()` — debounce 存档调度
- `canUseAnnotationStoreWriteAPI()` — AnnotationStore 能力查询
- `recordHistorySnapshot()` — 撤销栈记录（第 565 行）
- `getDeletedNoteIds(qa)` / `addDeletedNoteId(qa, linkId)` / `parseNoteNumericId(linkId)` / `getNextNoteLinkId(qa)` — 删除管理（第 1018-1070 行）
- `purgeDeletedNotes(qa)` — 初始化时清理墓碑锚点（第 1073 行）
- `onExportClean` 钩子回调函数体（三步骤清理逻辑），暴露为 `window.QA.onExportClean = function(clone) { ... }`

测试重点：
- `persistAnchorChange` 调用 `PersistenceLayer.saveElement`
- `onExportClean` 钩子正确移除已删除的 answer-anchor（含角标）
- `onExportClean` 钩子同步 `data-link-answer` 变化

- [ ] **Step 1: 写 persistence.test.js**

```javascript
// testing/tests/quiz-annotation/persistence.test.js
import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createJSDOM, minimalQAHTML, evalModule } from './helpers.js';

describe('persistence.js — 持久化与 onExportClean', () => {
  let dom, window;

  before(() => {
    dom = createJSDOM(minimalQAHTML({
      passageText: '<span class="text-anchor" data-link="note-01" data-step="1">Hello<sup class="note-badge">1</sup></span>',
      notesHtml: '<div class="qa-note-bubble" data-link="note-01" data-link-answer="note-01" data-step="1"><div class="qa-note-step">1</div></div>',
      answerHtml: '<div class="qa-option"><span class="answer-anchor" data-link-answer="note-01" data-step="1">Answer text<sup class="note-badge">1</sup></span></div>'
    }));
    window = dom.window;
    // 重设 PersistenceLayer 以便验证 saveElement 调用
    window.PersistenceLayer = {
      saveElementCalls: [],
      saveElement(el) { this.saveElementCalls.push(el.getAttribute('data-edit-id')); },
      _stripHTML(html) { return html; }
    };
    evalModule(window, 'core.js');
    evalModule(window, 'persistence.js');
  });

  it('persistAnchorChange 调用 PersistenceLayer.saveElement', () => {
    const anchor = window.document.querySelector('.text-anchor');
    // 需要在 anchor 附近有 data-edit-id 祖先
    const p = window.document.createElement('p');
    p.setAttribute('data-edit-id', 't1-p1');
    p.appendChild(anchor);
    window.document.querySelector('.qa-passage').appendChild(p);
    window.PersistenceLayer.saveElementCalls = [];
    window.QA.persistAnchorChange(anchor, { immediate: true });
    assert.ok(window.PersistenceLayer.saveElementCalls.length > 0);
  });
});
```

- [ ] **Step 2-5: 实现并验证**

---

### Phase 4: connectors.js — SVG 贝塞尔连线

**Files:** Create `connectors.js` + `connectors.test.js`

**职责**：左栏锚点 ↔ 中栏气泡 ↔ 右栏锚点之间的贝塞尔曲线连线。涂鸦模式下的事件穿透代理。

提取内容：
- `ensureCanvas(qa)`、`drawStepConnectors(qa, bubble)`、`clearStepConnectors(qa)` — Canvas 管理
- `drawHoverConnectors(qa, bubble)`、`clearHoverConnectors(qa)` — Hover 连线
- `checkVisibility(el, scrollContainer)` — 边缘钉定检测
- `createLeftConnectorLine(qa, linkId, className)`、`createRightConnectorLine(qa, linkId, className)`、`drawEdgeArrow(...)` — 连线绘制
- `syncDoodlePassthroughCursor(target)`、`setActiveDoodleProxyAnchor(anchor)`、`clearDoodleProxyAnchor()` — 涂鸦穿透代理（第 320-355 行）
- `bindDoodleModePassthrough()` — 涂鸦模式事件绑定（pointermove/contextmenu/pointerdown）
- 相关模块级变量：`activeDoodleProxyAnchor`、`doodlePassthroughBound`、`DOODLE_PASSTHROUGH_BUTTON_SELECTOR`

- [ ] **Step 1: 写 connectors.test.js**

```javascript
// testing/tests/quiz-annotation/connectors.test.js
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createJSDOM, minimalQAHTML, evalModule } from './helpers.js';

describe('connectors.js — SVG 连线', () => {
  let dom, window;

  before(() => {
    dom = createJSDOM(minimalQAHTML({
      passageText: '<span class="text-anchor" data-link="note-01" data-step="1">Hello<sup class="note-badge">1</sup></span>',
      notesHtml: '<div class="qa-note-bubble" data-link="note-01" data-step="1"><div class="qa-note-handle"><span class="qa-note-step">1</span></div></div>',
      answerHtml: '<div class="qa-option"><span class="answer-anchor" data-link-answer="note-01" data-step="1"></span></div>'
    }));
    window = dom.window;
    evalModule(window, 'core.js');
    evalModule(window, 'connectors.js');
  });

  it('ensureCanvas 创建 SVG 画布', () => {
    const qa = window.QA.getActiveQA();
    const canvas = window.QA.ensureCanvas(qa);
    assert.ok(canvas);
    assert.equal(canvas.tagName.toLowerCase(), 'svg');
  });

  it('createLeftConnectorLine 返回路径', () => {
    const qa = window.QA.getActiveQA();
    const line = window.QA.createLeftConnectorLine(qa, 'note-01', 'connector-test');
    assert.ok(line);
    assert.equal(line.tagName.toLowerCase(), 'path');
  });

  it('clearStepConnectors 清理连线', () => {
    const qa = window.QA.getActiveQA();
    const canvas = window.QA.ensureCanvas(qa);
    const line = window.QA.createLeftConnectorLine(qa, 'note-01', 'connector-step');
    canvas.appendChild(line);
    window.QA.clearStepConnectors(qa);
    assert.equal(canvas.querySelectorAll('.connector-step').length, 0);
  });
});
```

---

### Phase 5: dragdrop.js — 拖拽排序

**Files:** Create `dragdrop.js` + `dragdrop.test.js`

测试重点：
- `initDragAndDrop` 为气泡绑定拖拽事件
- `recalcStepNumbers` 重新编号并同步角标
- `syncBubbleOrderToPassageAnchors` 重新排序

---

### Phase 6: quiz-base.js — 答题系统共享层

**Files:** Create `quiz-base.js` + `quiz-base.test.js`

从 `quiz-annotation-runtime.js` 中提取四种题型共用的函数：
- `inferReadingType(qa)`、`syncReadingTypePill(qa)` — 题型推断
- `initQuizSystem(qa)` — 统一入口，检测题型后分派
- `submitQuiz(qa)` — 统一提交入口，分派到题型专属判分
- `resetQuizSubmissionState(qa)` — 重置为未提交
- `getCorrectOptionIds()` / `setChoiceCorrectAnswers()` / `createAnswerKeyChip()` / `updateAnswerKeyChipSelection()` — 编辑态芯片

测试重点：`inferReadingType` 正确推断四种类型、`initQuizSystem` 加 `.has-quiz`、`submitQuiz` 加 `.submitted`。

### Phase 6b: quiz-single.js — 阅读单选

**Files:** Create `quiz-single.js` + `quiz-single.test.js`

提取：`syncChoiceAnswerKeyEditors`、`clearSelectionQuestionResults`、`renderSelectionQuestionResults`、`clearQuestionUnansweredState`、`ensureQuestionResultFeedback`

测试重点：选项点击 `.selected`、提交后 `.result-correct` + ✓、未作答红框。

### Phase 6c: quiz-matching.js — 阅读七选五

**Files:** Create `quiz-matching.js` + `quiz-matching.test.js`

提取：`syncMatchingOptionDragState`、`syncMatchingAnswerUI`、`ensureMatchingPassageSlotStructure`、`renderMatchingPassageSlot`、`setMatchingAnswerSlotValue`、`renderMatchingAnswerResults`、`unlockMatchingSubmissionState`、`clearMatchingAnswerByBlankId`、`resetMatchingQuestionState`、`syncSlotToPassage`、`clearPassageSlot`

测试重点：拖拽配对后槽位 `filled`、判分后 ✓✗、正确选项浮现。

### Phase 6d: quiz-blank.js — 阅读填空

**Files:** Create `quiz-blank.js` + `quiz-blank.test.js`

提取：`normalizeBlankAnswer`、`clearBlankAnswerResults`、`syncBlankAnswerUI`、`renderBlankAnswerResults`

测试重点：右栏输入框生成、编辑态修改正确答案、学生态提交判分。

---

### Phase 7: note-interactions.js — 气泡交互

**Files:** Create `note-interactions.js` + `note-interactions.test.js`

测试重点：
- 取消右侧关联：`removeAnchorWrap` 移除角标 + 解包 anchor
- 删除批注：调用 `deleteNote` → 锚点解包、气泡移除
- 孤儿重建：`rebuildOrphanBubbles` 为缺失气泡的锚点创建空气泡
- 选中原文按钮：创建 Selection range

---

### Phase 8: linking.js — 关联模式

**Files:** Create `linking.js` + `linking.test.js`

测试重点：
- `enterLinkingMode` 添加 `.linking-left` / `.linking-right`
- `exitLinkingMode` 移除类并清理
- Esc 键退出关联模式

---

### Phase 9: toolbar.js — 浮动工具条

**Files:** Create `toolbar.js` + `toolbar.test.js`

测试重点：
- `initAnnotationToolbar` 创建 toolbars
- `createAnnotation` 新建锚点 + 空气泡
- `createLinkAssociation` 建立关联

---

### Phase 10: header.js — 栏头

**Files:** Create `header.js` + `header.test.js`

测试重点：
- `initNotesHeader` 创建 `.qa-notes-header`
- `migrateLegacyBubbles` 迁移旧结构
- `rebuildOrphanBubbles` 孤儿重建（与 note-interactions 共享）

---

### Phase 11: panel.js + stepping.js + activation.js + init.js — 编排层

**Files:** Create `panel.js`, `stepping.js`, `activation.js`, `init.js`

这四层不做单元测试（集成测试覆盖），直接从旧文件搬迁代码：
- `panel.js`：`toggleNotesPanel()`、`initDividerButton()`、`updateDividerPositions()`
- `stepping.js`：`registerStepStrategy('annotation', ...)`
- `activation.js`：`activateNote()`、`deactivateNote()`、`clearAllActive()`、`scrollIntoViewSmooth()`
- `init.js`：`initQuizAnnotation()`、`stripDynamicElements()`、`autoInit()`、页面切换监听

> **init.js 防御性检查**：`initQuizAnnotation(qa)` 在调用各子模块函数前，必须检查函数是否定义（例如 `if (typeof window.QA.initNotesHeader === 'function')`），防止因子模块加载失败导致整个组件无法初始化。对于可选功能（如 `quiz-system`），加载失败时跳过对应初始化步骤并输出 `console.warn`。

- [ ] **Step N: 搬迁后验证：用旧测试文件跑新模块**

```bash
cd testing && node --test tests/quiz-annotation-runtime.test.js
```

预期：所有旧测试仍然 PASS（因为 API 不变）

> **`bindEditorModeSync` 与 `onExportClean` 的分拆**：原函数体中同时包含编辑器同步逻辑和 `onExportClean` 注册。拆法：
> - `persistence.js` 暴露 `window.QA.onExportClean = function(clone) { ... }`（回调函数体）
> - `init.js` 中的 `bindEditorModeSync()` 调用 `window.EditorHooks.register('onExportClean', window.QA.onExportClean)` 完成注册
> - `syncNotesPanelForCurrentMode` 和 `syncAllNotesPanelsForCurrentMode` 放在 `init.js`（纯编排逻辑，跨模块调用）

---

### Phase 12: 入口兼容 — 替换 quiz-annotation-runtime.js

**Files:**
- Modify: `assets/quiz-annotation-runtime.js`

- [ ] **Step 1: 替换为聚合入口**

旧文件内容全部替换为：

```javascript
/* ===========================================
   QUIZ-ANNOTATION-RUNTIME.JS
   答题与批注组件 — 聚合入口
   使用同步 XHR + eval 按依赖顺序加载 zone2-quiz-annotation/ 下的子模块。
   同步加载是强制要求：子模块之间通过 window.QA 共享状态，
   后加载的模块依赖先加载模块暴露的 API。
   =========================================== */

(function () {
  'use strict';

  // ★ 按依赖拓扑排序的模块列表
  var modules = [
    'core.js',
    'fragments.js',
    'persistence.js',
    'panel.js',
    'activation.js',
    'connectors.js',
    'stepping.js',
    'dragdrop.js',
    'quiz-base.js',
    'quiz-single.js',
    'quiz-matching.js',
    'quiz-blank.js',
    'note-interactions.js',
    'linking.js',
    'toolbar.js',
    'header.js',
    'init.js'
  ];

  // 相对于当前脚本的路径：从 assets/ 到 assets/zones/zone2-quiz-annotation/
  var base = './assets/zones/zone2-quiz-annotation/';

  modules.forEach(function (m) {
    try {
      var xhr = new XMLHttpRequest();
      // file:// 下同步 XHR 可靠可用；HTTP(S) 下同步 XHR 同样可用（浏览器不支持时回退到 async）
      xhr.open('GET', base + m, false);
      xhr.send();
      if (xhr.status === 200 || xhr.status === 0) {
        eval(xhr.responseText);
      } else {
        console.error('[quiz-annotation-runtime] 加载子模块失败: ' + m + ' (status=' + xhr.status + ')');
      }
    } catch (e) {
      console.error('[quiz-annotation-runtime] 加载子模块异常: ' + m, e);
    }
  });
})();
```

> **设计决策**：选用同步 XHR + eval 而非 `document.createElement('script')`。原因：
> - `script.async = false` 在 Chrome 中仅对 **解析阶段** 的 `<script>` 生效，对 **运行时动态注入** 的 `<script>` 无效——它们始终异步
> - 子模块间通过 `window.QA` 共享状态，必须保证 `core.js` 先于 `fragments.js` 执行
> - 同步 XHR 在 `file://` 和 HTTP(S) 下均可靠（`file://` 下 `status === 0` 视为成功）

- [ ] **Step 2: 验证旧引用仍工作**

用 `qa-test-all-types.html` 测试：加载页面 → 确认四种题型的答题与批注功能正常。

---

### Phase 13: CSS 拆分

**Files:** 14 个 CSS 子文件（在 `zone2-quiz-annotation/` 目录下）+ 1 个聚合入口（**修改旧路径** `assets/zones/zone2-quiz-annotation.css`）

- [ ] **Step 0: 确认路径策略**

CSS 聚合入口**复用旧路径** `assets/zones/zone2-quiz-annotation.css`，HTML 中 `<link href="./assets/zones/zone2-quiz-annotation.css">` 无需修改。
子文件放在 `assets/zones/zone2-quiz-annotation/` 下，聚合入口通过 `@import './zone2-quiz-annotation/layout.css'` 等相对路径引入。

- [ ] **Step 1: 按区块切割 CSS**

从 `zone2-quiz-annotation.css` 中按注释中的 `14.x` 编号提取到对应文件。

`zone2-quiz-annotation.css`（聚合入口，路径**不变**：`assets/zones/zone2-quiz-annotation.css`）：
```css
/* 答题与批注组件 CSS — 聚合入口
   子文件位于 ./zone2-quiz-annotation/ 目录下 */
@import './zone2-quiz-annotation/layout.css';
@import './zone2-quiz-annotation/notes-panel.css';
@import './zone2-quiz-annotation/answer-panel.css';
@import './zone2-quiz-annotation/anchors-bubbles.css';
@import './zone2-quiz-annotation/connectors.css';
@import './zone2-quiz-annotation/dragdrop.css';
@import './zone2-quiz-annotation/divider-btn.css';
@import './zone2-quiz-annotation/quiz-isolation.css';
@import './zone2-quiz-annotation/linking-mode.css';
@import './zone2-quiz-annotation/scrollbar.css';
@import './zone2-quiz-annotation/editor-toolbar.css';
@import './zone2-quiz-annotation/fragments.css';
@import './zone2-quiz-annotation/a11y.css';
```

- [ ] **Step 2: 验证 CSS 视觉一致性**

浏览器打开 `qa-test-all-types.html`，逐页对比拆分前后的视觉效果。

---

### Phase 14: 集成测试

**Files:**
- Create: `testing/tests/quiz-annotation/integration.test.js`

- [ ] **Step 1: 写集成测试**

测试完整的用户操作流程：
1. 创建带 quiz-annotation 的 DOM → 初始化 → 验证 `.qaInitialized`
2. 选择题：点击选项 → 提交 → 验证 `.submitted` 和 `.result-correct`
3. 批注交互：点击角标 → 验证气泡激活
4. 编辑模式：进入编辑 → 创建批注 → 验证新锚点和气泡
5. 保存流程：模拟 `onExportClean` → 验证 answer-anchor 正确清理

- [ ] **Step 2: 跑全量测试**

```bash
cd testing && node --test tests/quiz-annotation-runtime.test.js tests/quiz-annotation/*.test.js
```

预期：全部 PASS。

- [ ] **Step 3: 浏览器集成测试**

用 `qa-test-all-types.html` 做完整手动回归：
1. 页面加载 → 四种题型都正常显示
2. 答题 → 提交 → 批注浮现
3. 编辑模式 → 创建批注 → 编辑内容 → 取消关联 → 删除批注
4. 💾 保存 → 📂 读取 → 验证内容完整
5. 刷新 → 验证所有修改保留

- [ ] **Step 4: Commit**

```bash
git add assets/zones/zone2-quiz-annotation/
git add assets/quiz-annotation-runtime.js
git add testing/tests/quiz-annotation/
git commit -m "refactor: split quiz-annotation into multi-file module system"
```

---

### Phase 15: HTML 测试页面验证与更新

**目标**：确保 `qa-test-all-types.html` 在新模块结构下正常运行。引用路径无需修改（聚合入口 `assets/quiz-annotation-runtime.js` 路径不变）。CSS 引用 `zone2-quiz-annotation.css` 路径也不变。

> **注意**：`组件展示全览.html` 不包含答题与批注组件（未加载 `quiz-annotation-runtime.js`），无需更新。

**Files:**
- Verify: `qa-test-all-types.html`

- [ ] **Step 1: 验证 qa-test-all-types.html**

浏览器打开 `qa-test-all-types.html`，执行完整回归：
1. Slide 1 七选五：拖拽配对 → 提交 → 批注浮现 ✓
2. Slide 2 阅读单选：选项点选 → 提交 → ✓✗ 判分 ✓
3. Slide 3 阅读填空：输入答案 → 提交 → 判分 ✓
4. Slide 4 文章解析：批注角标点击 → 气泡激活 ✓
5. 编辑模式 → 新建批注 → 取消关联 → 删除批注 ✓
6. 💾 保存 → 📂 读取 → 验证内容完整性 ✓

- [ ] **Step 2: 更新缓存版本号**

`qa-test-all-types.html` 第 782 行的 `?v=2` 改为 `?v=3`（标记新模块结构）：

```html
<script src="./assets/quiz-annotation-runtime.js?v=3"></script>
```

- [ ] **Step 3: Commit**

```bash
git add qa-test-all-types.html
git commit -m "chore: bump quiz-annotation-runtime version for refactored module structure"
```


### Phase 16: MD 文档更新 — 核心 Skill / 模板参考

**目标**：将所有引用旧单文件结构或旧文件路径的 MD 文档更新为新模块结构。

**需更新的文件清单**：

| 文件 | 改动处 | 改动说明 |
|------|--------|---------|
| `SKILL.md` | 3 处 | 追加子模块加载说明（仍引用聚合入口，路径不变），更新 Supporting Files 表格 |
| `references/html-template.md` | 3 处 | 更新文件树注释、script 引用说明 |
| `references/component-templates.md` | 2 处 | 更新 runtime stack 引用说明 |
| `references/presentation-layer.md` | 1 处 | 更新 runtime 引用说明 |
| `开发者文档/答题与批注组件.md` | 4 处 | 更新 CSS 文件路径注释 |
| `开发者文档/本地化保存、读取系统.md` | 3 处 | 更新 onExportClean 引用为 `persistence.js` |
| `开发者文档/布局与组件开发文档.md` | 4 处 | 更新 CSS 文件路径 |
| `开发者文档/沉浸式逃逸组件.md` | 2 处 | 更新 CSS 文件路径 |

- [ ] **Step 1: 更新 SKILL.md**

**改动 1 — Phase 4 的 JS 加载说明（第 221 行附近）**：

旧文：
```
If any slide contains `.quiz-annotation`, also reference `annotation-store.js → quiz-annotation-audio.js → quiz-annotation-runtime.js` after `audio-runtime.js` and before the editor modules.
```

改为：
```
If any slide contains `.quiz-annotation`, also reference `annotation-store.js → quiz-annotation-audio.js → quiz-annotation-runtime.js` after `audio-runtime.js` and before the editor modules. `quiz-annotation-runtime.js` 是聚合入口，自动按依赖顺序加载 `zone2-quiz-annotation/` 下的 17 个子模块（core → fragments → persistence → ... → init）。
```

**改动 2 — Phase 4 的 CSS 加载说明（第 218 行）**：**不需要改**，因为 `zone2-quiz-annotation.css` 仍是聚合入口，路径不变。

**改动 3 — Supporting Files 表格（第 376 行）**：

旧文：
```
| [quiz-annotation-runtime.js](assets/quiz-annotation-runtime.js) | 答题与批注组件运行时逻辑 | Phase 4 (when quiz-annotation is used) |
```

改为：
```
| [quiz-annotation-runtime.js](assets/quiz-annotation-runtime.js) | 答题与批注组件聚合入口（自动加载 zone2-quiz-annotation/ 下 17 个子模块） | Phase 4 (when quiz-annotation is used) |
| [zone2-quiz-annotation/](assets/zones/zone2-quiz-annotation/) | 答题与批注组件子模块目录（core, fragments, persistence, quiz-*, toolbar, init 等） | 由聚合入口自动加载 |
```

- [ ] **Step 2: 更新 references/html-template.md**

**改动 1 — 脚本引用示例（第 142 行）**：加注释说明子模块自动加载。

**改动 2 — 文件树（第 382 行）**：将 `zone2-quiz-annotation.css` 的注释改为"聚合入口（@import 子文件）"。

**改动 3 — 脚本引用（第 234 行）**：追加注释。

- [ ] **Step 3: 更新 references/component-templates.md**

**改动 1 — 第 51 行**：在 `quiz-annotation-runtime.js` 后追加 `(聚合入口，自动加载 zone2-quiz-annotation/ 子模块)`。

**改动 2 — 第 473 行**：同上。

- [ ] **Step 4: 更新 references/presentation-layer.md**

**改动 — 第 116 行**：同上，追加注释。

- [ ] **Step 5: Commit**

```bash
git add SKILL.md references/html-template.md references/component-templates.md references/presentation-layer.md
git commit -m "docs: update core skill and template references for refactored quiz-annotation"
```


### Phase 17: MD 文档更新 — 开发者文档

- [ ] **Step 1: 更新 开发者文档/答题与批注组件.md**

**改动点**：
- 第 16 行：`assets/zones/zone2-quiz-annotation.css` → `assets/zones/zone2-quiz-annotation/`（CSS 聚合入口 + 子文件）
- 第 372 行：同上
- 第 627 行：CSS 新增文件清单，追加说明"CSS 拆分为 zone2-quiz-annotation/ 下 14 个子文件"
- 运行时引用说明：追加 `quiz-annotation-runtime.js` 为聚合入口的说明

- [ ] **Step 2: 更新 开发者文档/本地化保存、读取系统.md**

**改动点**：
- 第 5 行：`quiz-annotation-runtime.js`（`onExportClean` 钩子）→ `zone2-quiz-annotation/persistence.js`（`onExportClean` 钩子）
- 第 127 行：同上
- 第 258 行：同上

- [ ] **Step 3: 更新 开发者文档/布局与组件开发文档.md**

**改动点**（4 处 `zone2-quiz-annotation.css` → 追加说明"（聚合入口，@import 子文件）"）

- [ ] **Step 4: 更新 开发者文档/沉浸式逃逸组件.md**

**改动点**（2 处 `zone2-quiz-annotation.css` → 同上）

- [ ] **Step 5: Commit**

```bash
git add 开发者文档/答题与批注组件.md 开发者文档/本地化保存、读取系统.md 开发者文档/布局与组件开发文档.md 开发者文档/沉浸式逃逸组件.md
git commit -m "docs: update dev docs for refactored quiz-annotation module structure"
```


### Phase 18: 最终全量回归

- [ ] **Step 1: 跑全量自动化测试**

```bash
cd testing && node --test tests/quiz-annotation-runtime.test.js tests/quiz-annotation/*.test.js
```

预期：全部 PASS。

- [ ] **Step 2: 浏览器手动回归**

用 `qa-test-all-types.html` 执行完整回归矩阵：

| 测试场景 | 步骤 | 预期 |
|---------|------|------|
| 七选五拖拽 | 拖拽选项到槽位 → 提交 | ✓✗ 判分正确 |
| 单选点选 | 点击选项 → 提交 | ✓✗ 判分正确 |
| 填空输入 | 输入答案 → 提交 | 判分 + 正确答案显示 |
| 文章解析 | 点击角标 → 步进 | 气泡激活 + 片段揭示 |
| 编辑模式 | E 键 → 新建批注 → 编辑内容 | 气泡 + 锚点正确 |
| 取消关联 | 取消右侧关联 → 保存 → 读取 | 角标不泄漏 |
| 删除批注 | 删除 → 保存 → 读取 | 锚点 + 气泡完全清除 |
| 撤销/重做 | Ctrl+Z / Ctrl+Shift+Z | 状态正确回退 |

- [ ] **Step 3: Commit（最终）**

```bash
git add -A
git commit -m "refactor: complete quiz-annotation multi-file module restructuring

- Split quiz-annotation-runtime.js (~4800 lines) into 17 modules under zone2-quiz-annotation/
- Split zone2-quiz-annotation.css (~1500 lines) into 14 CSS files
- Add TDD test suite (13 test files)
- Update all MD documentation references
- Maintain full backward compatibility via aggregation entry points"
```


## 风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| 子模块加载顺序错误导致 `window.QA.xxx` 未定义 | 严格按拓扑顺序加载；同步 XHR 保证顺序执行；自动化测试验证 |
| 同步 XHR 在某些浏览器被标记废弃 | Chrome/Firefox/Edge 均稳定支持；file:// 和 HTTP(S) 下均可用（`status === 0` 视为成功） |
| CSS `@import` 在某些环境不生效 | file:// 下同步可靠；Chrome/Edge 均支持；若出问题可改为构建时拼接 |
| 拆出模块后函数间闭包引用断裂（私有变量） | 搬迁时逐步验证；不一致的私有引用改为挂到 QA |
| init.js 依赖过多模块，单点故障风险高 | 加 `typeof ... === 'function'` 防御检查 + `console.warn` |
| 测试覆盖不足 | 每个模块至少覆盖核心公开 API；集成测试补充全流程 |
| quiz-annotation-audio.js 跨目录引用 | 外部文件通过 `window.QuizAnnotationAudio` 全局变量暴露，子模块直接访问 |

---

**计划完成。请审阅，确认后我将按 TDD 流程执行拆分。**
