# Data-Driven Courseware Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 html-slides 从“HTML 内嵌正文内容 + localStorage / sidecar 混合持久化”重构为“HTML 壳 + 外挂 JSON 真相源 + IndexedDB 运行时缓存 + 显式导出保存”的新架构，并同步改写 skill 输出机制。

**Architecture:** 新课件只保留 HTML 壳、运行时脚本引用、少量启动元数据，不再把正文、批注、标注内容直接写进 HTML。生成时产出同目录 `*.deck.json` 作为可迁移真相源；首次打开时由极薄的 bootstrap 读取 shell manifest，在 IndexedDB 缓存缺失或版本不匹配时导入 JSON，平时仅从 IndexedDB 读取并渲染。所有作者态修改统一写回 IndexedDB，左上角“保存到本地化文件”按钮再把当前缓存显式导出为 JSON。

**Tech Stack:** 原生 HTML / CSS / JavaScript、IndexedDB、File System Access API、Node.js `--test` + jsdom、既有 editor / quiz / example-card 运行时。

**执行约束补充：**
1. 不考虑兼容旧课件；旧示例文件允许在新架构完成后重新生成。
2. 块级数据化采用“块结构化 + 块内 HTML 片段保真”路线，不在第一版引入富文本 AST。
3. JSON 是可迁移真相源，IndexedDB 只是运行时缓存；不允许把两者重新做成并行真相源。
4. 新架构不再依赖 `annotation-store.js` 参与日常运行时恢复；外挂文件只在首开导入与显式保存时参与。
5. 必须在独立 worktree 分支中开发，禁止在当前主工作区直接大改运行时与 skill 文档。

---

## 文件地图

### 新增运行时文件

| 文件 | 责任 |
| --- | --- |
| `assets/deck-data-schema.js` | 课件 JSON schema、manifest 解析、版本与校验辅助 |
| `assets/deck-data-store.js` | IndexedDB 打开、读取、导入、更新、脏标记、快照导出 |
| `assets/deck-data-bootstrap.js` | 首开导入桥，按 manifest 决定走缓存还是种子 JSON |
| `assets/deck-data-renderer.js` | 根据 JSON / IndexedDB 文档把 slide、header、block 渲染进 HTML 壳 |
| `assets/deck-data-authoring.js` | 作者态统一保存入口，把 DOM 变更回写到对应 block |
| `assets/deck-save-runtime.js` | 左上角保存按钮、File System Access 导出、后续覆盖写句柄 |
| `assets/deck-shell.css` | HTML 壳级占位样式、加载态、空壳提示、保存按钮样式 |

### 需要修改的现有运行时文件

| 文件 | 新职责 |
| --- | --- |
| `assets/editor-core.js` | 注入“保存到本地化文件”按钮，接入新数据运行时初始化顺序 |
| `assets/editor-history.js` | 保持撤销/重做基于运行时内存历史栈，不让 IndexedDB 承担编辑历史仓库职责 |
| `assets/editor-persistence.js` | 从 localStorage 持久化层改为 `DeckDataAuthoring` 代理层 |
| `assets/editor-rich-text.js` | 富文本标注改为写 block HTML 到 IndexedDB，而不是写 sidecar / localStorage |
| `assets/page-richtext-annotation-runtime.js` | 保持 reveal 行为，但不再依赖旧 sidecar 恢复链 |
| `assets/quiz-annotation-runtime.js` | 结构变更与气泡正文变更统一回写当前 quiz block |
| `assets/example-card-runtime.js` | 选项文本、题干、解析与 fragment 统一回写当前 example-card block |

### 需要修改的 skill / 文档文件

| 文件 | 新职责 |
| --- | --- |
| `SKILL.md` | 改写输出定义：生成 HTML 壳 + JSON 数据文件 + 新运行时脚本 |
| `README.md` | 更新架构说明、输出产物、保存与迁移语义 |
| `QUICKSTART.md` | 更新新架构使用说明、首开导入与保存按钮说明 |
| `references/html-template.md` | 提供新的 shell 模板与 manifest 模板 |
| `references/component-templates.md` | 说明组件 HTML 现在进入 JSON block 的 `html` 字段 |
| `开发者文档/答题与批注组件.md` | 更新 quiz block 在新架构中的存储与保存语义 |
| `开发者文档/例题组件.md` | 更新 example-card block 在新架构中的存储与保存语义 |

### 新增测试文件

| 文件 | 责任 |
| --- | --- |
| `testing/tests/deck-data-schema.test.js` | schema 归一化、manifest 解析、版本规则 |
| `testing/tests/deck-data-store.test.js` | IndexedDB 导入、读取、更新、导出 |
| `testing/tests/deck-data-bootstrap.test.js` | 首开导入桥、`file://` / `http(s)` 加载策略、manifest 命中逻辑 |
| `testing/tests/deck-data-renderer.test.js` | shell -> slide -> block 渲染结果 |
| `testing/tests/deck-data-authoring.test.js` | 块回写、富文本保真、普通块保存 |
| `testing/tests/deck-history-contract.test.js` | 撤销/重做只依赖运行时内存历史栈，不从 IndexedDB 回放历史 |
| `testing/tests/deck-save-runtime.test.js` | 保存按钮、导出 JSON、句柄复用 |
| `testing/tests/deck-skill-output.test.js` | 新模板输出契约，不再依赖旧 sidecar |

### 需要更新的示例课件

| 文件 | 责任 |
| --- | --- |
| `高考英语阅读实战.html` | 改为新 shell 形式 |
| `高考英语阅读实战.deck.json` | 对应新架构课程数据 |
| `七选五理论论述.html` | 改为新 shell 形式 |
| `七选五理论论述.deck.json` | 对应新架构课程数据 |

---

## 新架构的固定契约

### 1. HTML 壳保留内容

HTML 只允许保留以下信息：

1. `div.deck`、slide 挂载根、工具条挂载根、加载态 / 空态容器。
2. 固定 `<template>`，用于 renderer 创建 slide 骨架。
3. 小型 manifest 元数据，不包含正文内容：

```html
<script type="application/json" class="deck-manifest">
{
  "deckId": "gaokao-reading-demo",
  "schemaVersion": 1,
  "seedVersion": "2026-05-02T19:30:00Z",
  "seedPath": "./高考英语阅读实战.deck.json"
}
</script>
```

4. 运行时脚本引用与 CSS 引用。

### 2. JSON 数据文件契约

第一版统一采用块级数据化：slide 结构化，block 结构化，block 内正文保留 HTML 片段。

```json
{
  "schemaVersion": 1,
  "deckId": "gaokao-reading-demo",
  "seedVersion": "2026-05-02T19:30:00Z",
  "title": "高考英语阅读实战",
  "theme": "teaching",
  "slides": [
    {
      "slideId": "s1",
      "module": "七选五",
      "title": "阅读与批注",
      "layout": "layout-single",
      "speakerNotes": {
        "title": "阅读与批注",
        "script": "...",
        "notes": ["..."]
      },
      "blocks": [
        {
          "blockId": "s1-main",
          "kind": "quiz-annotation",
          "slot": "main",
          "html": "<section class=\"quiz-annotation\">...</section>"
        }
      ]
    }
  ]
}
```

### 3. JSON 与 IndexedDB 的关系

1. JSON 是可迁移真相源。
2. IndexedDB 是运行时缓存与编辑态主读层。
3. HTML manifest 里的 `seedVersion` 与 IndexedDB 中缓存版本一致时，启动直接读 IndexedDB。
4. 版本不一致或缓存缺失时，bootstrap 才重新加载 JSON 并导入 IndexedDB。
5. 左上角保存按钮始终导出当前 IndexedDB 快照到 JSON 文件。
6. 撤销 / 重做基于运行时内存历史栈，不从 IndexedDB 读取“上一步 / 下一步”历史。
7. 刷新页面后只要求从 IndexedDB 恢复“最新稳定状态”，不要求继续保留刷新前的完整撤销 / 重做链。

### 4. 撤销 / 重做边界

1. `editor-history.js` 继续作为唯一历史管理器，负责记录当前会话中的 undo / redo 栈。
2. `DeckDataAuthoring` 每次保存 block 时，只把“最新结果”写入 IndexedDB，不负责维护历史版本链。
3. `historyMgr.undo()` / `redo()` 恢复 DOM 后，允许触发一次“把恢复后的最新状态重新写回 IndexedDB”的同步动作；但这个同步动作不能反过来生成新的历史帧。
4. 禁止把 IndexedDB 设计成撤销仓库，不引入“从 IndexedDB 回放上一步快照”的实现路径。
5. 第一版不追求“刷新页面后还能撤销刷新前的每一步操作”；如果未来需要跨刷新编辑历史，必须单独设计操作日志层，而不是挤进当前缓存层。

### 5. `file://` 首开导入策略

为避免纯 `file://` 下直接 `fetch()` JSON 不稳定，bootstrap 必须实现双路径：

1. `http(s)`：优先 `fetch(manifest.seedPath)`。
2. `file://`：优先用隐藏 iframe / object 读取同目录 JSON 纯文本，再 `JSON.parse`。
3. 如果 `file://` 文本桥失败，显示“导入本地 JSON 数据文件”降级入口，但不能静默失败。

---

## Task 1: 建立 worktree、HTML 壳契约与最小种子夹具

**Files:**
- Create: `testing/fixtures/data-driven/minimal-shell.html`
- Create: `testing/fixtures/data-driven/minimal-shell.deck.json`
- Create: `testing/tests/deck-shell-contract.test.js`
- Modify: `references/html-template.md`

- [ ] **Step 1: 在独立 worktree 中开始实现，不在主工作区直接改代码**

Run:

```powershell
Set-Location 'd:/Projects/html-slides'
git worktree add '.worktrees/data-driven-courseware-runtime' -b 'feature/data-driven-courseware-runtime'
Set-Location '.worktrees/data-driven-courseware-runtime/testing'
node --test tests/spec-validator.test.js
```

Expected: worktree 创建成功，现有基线测试可跑；如果基线失败，先把失败输出记录到计划执行日志，再决定是否继续。

- [ ] **Step 2: 先写 shell 契约测试，锁住“HTML 不再内嵌正文内容”的边界**

在 `testing/tests/deck-shell-contract.test.js` 写入失败测试：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('data-driven shell keeps only manifest and empty deck host', () => {
  const html = fs.readFileSync(new URL('../fixtures/data-driven/minimal-shell.html', import.meta.url), 'utf8');
  assert.match(html, /class="deck-manifest"/);
  assert.match(html, /id="deck"/);
  assert.doesNotMatch(html, /高考英语阅读实战正文/);
  assert.doesNotMatch(html, /class="quiz-annotation"/);
});
```

- [ ] **Step 3: 创建最小 HTML 壳与最小 JSON 种子夹具，让测试变绿**

`testing/fixtures/data-driven/minimal-shell.html` 最小内容采用：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>Data Driven Shell</title>
  <link rel="stylesheet" href="../../assets/deck-shell.css" />
</head>
<body>
  <div class="deck-shell-toolbar"></div>
  <div class="deck-loading-state">正在加载课件数据...</div>
  <div class="deck" id="deck"></div>
  <script type="application/json" class="deck-manifest">{"deckId":"minimal-shell","schemaVersion":1,"seedVersion":"2026-05-02T20:00:00Z","seedPath":"./minimal-shell.deck.json"}</script>
</body>
</html>
```

`testing/fixtures/data-driven/minimal-shell.deck.json` 最小内容采用：

```json
{
  "schemaVersion": 1,
  "deckId": "minimal-shell",
  "seedVersion": "2026-05-02T20:00:00Z",
  "title": "最小课件",
  "theme": "teaching",
  "slides": []
}
```

- [ ] **Step 4: 更新 `references/html-template.md`，让后续 skill 有新的输出模板可参照**

必须新增一节“Data-Driven Shell Template”，明确以下模板元素：

1. `div#deck` 只作为挂载根。
2. `script.deck-manifest` 只保存 deckId / schemaVersion / seedVersion / seedPath。
3. 顶部工具条保留保存按钮挂载位，不内嵌正文内容。

- [ ] **Step 5: 运行最小壳契约测试并提交**

Run:

```powershell
Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime/testing'
node --test tests/deck-shell-contract.test.js
```

Expected: PASS

Commit:

```powershell
Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime'
git add testing/fixtures/data-driven/minimal-shell.html testing/fixtures/data-driven/minimal-shell.deck.json testing/tests/deck-shell-contract.test.js references/html-template.md
git commit -m "test: lock data-driven shell contract"
```

---

## Task 2: 建立 JSON schema 与 IndexedDB 存储层

**Files:**
- Create: `assets/deck-data-schema.js`
- Create: `assets/deck-data-store.js`
- Create: `testing/tests/deck-data-schema.test.js`
- Create: `testing/tests/deck-data-store.test.js`

- [ ] **Step 1: 先写 schema 失败测试，锁住最小文档结构与 manifest 归一化规则**

在 `testing/tests/deck-data-schema.test.js` 写入：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDeckDocument, parseDeckManifest } from '../../assets/deck-data-schema.js';

test('normalizeDeckDocument preserves block html and required metadata', () => {
  const normalized = normalizeDeckDocument({
    schemaVersion: 1,
    deckId: 'demo',
    seedVersion: 'v1',
    title: 'Demo',
    theme: 'teaching',
    slides: [{ slideId: 's1', module: 'M', title: 'T', layout: 'layout-single', blocks: [{ blockId: 'b1', kind: 'richtext', slot: 'main', html: '<p>Hello</p>' }] }]
  });
  assert.equal(normalized.slides[0].blocks[0].html, '<p>Hello</p>');
});

test('parseDeckManifest reads seed metadata without treating it as content', () => {
  const manifest = parseDeckManifest('{"deckId":"demo","schemaVersion":1,"seedVersion":"v1","seedPath":"./demo.deck.json"}');
  assert.equal(manifest.seedPath, './demo.deck.json');
});
```

- [ ] **Step 2: 再写 store 失败测试，锁住导入、读取、更新与导出**

在 `testing/tests/deck-data-store.test.js` 写入：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeckStore } from '../../assets/deck-data-store.js';

test('imports seed document and exports the latest snapshot', async () => {
  const store = await createDeckStore({ dbName: 'deck-data-store-test' });
  await store.importSeed({ schemaVersion: 1, deckId: 'demo', seedVersion: 'v1', title: 'Demo', theme: 'teaching', slides: [] });
  const snapshot = await store.exportSnapshot('demo');
  assert.equal(snapshot.deckId, 'demo');
  assert.equal(snapshot.seedVersion, 'v1');
});
```

- [ ] **Step 3: 实现 `assets/deck-data-schema.js`，只做三件事**

实现最小 API：

```js
(function () {
  'use strict';

  function parseDeckManifest(rawJson) { /* JSON.parse + 字段校验 */ }
  function normalizeDeckDocument(rawDoc) { /* 补 slides / blocks 数组默认值，保留 block.html */ }
  function cloneDeckDocument(doc) { return JSON.parse(JSON.stringify(doc)); }

  window.DeckDataSchema = { parseDeckManifest, normalizeDeckDocument, cloneDeckDocument };
})();
```

- [ ] **Step 4: 实现 `assets/deck-data-store.js`，定义唯一允许的缓存 API**

第一版只暴露以下 API：

```js
(function () {
  'use strict';

  async function createDeckStore(options) {
    return {
      importSeed(doc) {},
      getDocument(deckId) {},
      updateDocument(deckId, updater) {},
      exportSnapshot(deckId) {},
      getMeta(deckId) {}
    };
  }

  window.DeckDataStore = { createDeckStore };
})();
```

要求：

1. `updateDocument(deckId, updater)` 内部始终先 clone，再允许更新。
2. store 元数据至少保存 `deckId`、`seedVersion`、`updatedAt`。
3. 不在这一层引入 DOM 逻辑。

- [ ] **Step 5: 跑 schema + store 测试并提交**

Run:

```powershell
Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime/testing'
node --test tests/deck-data-schema.test.js tests/deck-data-store.test.js
```

Expected: PASS

Commit:

```powershell
Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime'
git add assets/deck-data-schema.js assets/deck-data-store.js testing/tests/deck-data-schema.test.js testing/tests/deck-data-store.test.js
git commit -m "feat: add deck schema and indexeddb store"
```

---

## Task 3: 实现 bootstrap 首开导入桥与 shell 渲染器

**Files:**
- Create: `assets/deck-data-bootstrap.js`
- Create: `assets/deck-data-renderer.js`
- Create: `testing/tests/deck-data-bootstrap.test.js`
- Create: `testing/tests/deck-data-renderer.test.js`

- [ ] **Step 1: 先写 bootstrap 失败测试，锁住“命中缓存直接走 IndexedDB，未命中才加载 JSON”**

在 `testing/tests/deck-data-bootstrap.test.js` 写入：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBootstrapHarness } from './helpers/deck-bootstrap-harness.js';

test('bootstrap skips seed load when indexeddb seedVersion already matches', async () => {
  const harness = await createBootstrapHarness({ cachedSeedVersion: 'v1', manifestSeedVersion: 'v1' });
  await harness.bootstrap();
  assert.equal(harness.seedLoadCount, 0);
});

test('bootstrap imports seed JSON on cache miss', async () => {
  const harness = await createBootstrapHarness({ cachedSeedVersion: null, manifestSeedVersion: 'v1' });
  await harness.bootstrap();
  assert.equal(harness.seedLoadCount, 1);
});
```

- [ ] **Step 2: 再写 renderer 失败测试，锁住 slide / block 渲染结果**

在 `testing/tests/deck-data-renderer.test.js` 写入：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

test('renderer creates slide headers and injects block html into slots', () => {
  const dom = new JSDOM('<!DOCTYPE html><div id="deck"></div>');
  dom.window.DeckDataRenderer.renderDeck(dom.window.document, {
    slides: [{ slideId: 's1', module: 'M', title: 'T', layout: 'layout-single', blocks: [{ blockId: 'b1', kind: 'richtext', slot: 'main', html: '<p>Hello</p>' }] }]
  });
  assert.match(dom.window.document.querySelector('#deck').innerHTML, /Hello/);
});
```

- [ ] **Step 3: 实现 `assets/deck-data-bootstrap.js`，把 JSON 加载桥限制在极窄范围**

最小 API：

```js
(function () {
  'use strict';

  async function bootstrapDeckRuntime() {
    const manifest = window.DeckDataSchema.parseDeckManifest(document.querySelector('.deck-manifest').textContent);
    const store = await window.DeckDataStore.createDeckStore({ dbName: 'html-slides-decks' });
    const meta = await store.getMeta(manifest.deckId);
    if (!meta || meta.seedVersion !== manifest.seedVersion) {
      const seedDoc = await loadSeedDocument(manifest);
      await store.importSeed(seedDoc);
    }
    return { manifest, store };
  }

  window.DeckDataBootstrap = { bootstrapDeckRuntime };
})();
```

`loadSeedDocument(manifest)` 必须按以下顺序：

1. `http(s)` 直接 `fetch`。
2. `file://` 走隐藏 iframe / object 文本桥。
3. 两者都失败时，渲染可见导入提示，不允许悄悄吞掉错误。

- [ ] **Step 4: 实现 `assets/deck-data-renderer.js`，把 block HTML 注入到渲染后的 slot 容器里**

第一版渲染器只需要做：

```js
(function () {
  'use strict';

  function renderDeck(doc, deckDocument) { /* 清空 #deck，创建 slide，填 header，创建 slot，注入 block.html */ }

  window.DeckDataRenderer = { renderDeck };
})();
```

要求：

1. 每个 block 外层包一层 `div[data-block-id]`。
2. `block.kind` 原样写到 `data-block-kind`。
3. 注入后的 DOM 仍能被 quiz / example-card 现有 runtime 识别。

- [ ] **Step 5: 跑 bootstrap + renderer 测试并提交**

Run:

```powershell
Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime/testing'
node --test tests/deck-data-bootstrap.test.js tests/deck-data-renderer.test.js
```

Expected: PASS

Commit:

```powershell
Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime'
git add assets/deck-data-bootstrap.js assets/deck-data-renderer.js testing/tests/deck-data-bootstrap.test.js testing/tests/deck-data-renderer.test.js
git commit -m "feat: add bootstrap and shell renderer"
```

---

## Task 4: 用统一 authoring 桥接替换普通块的 localStorage / sidecar 保存

**Files:**
- Create: `assets/deck-data-authoring.js`
- Modify: `assets/editor-history.js`
- Modify: `assets/editor-persistence.js`
- Modify: `assets/editor-rich-text.js`
- Modify: `assets/page-richtext-annotation-runtime.js`
- Create: `testing/tests/deck-data-authoring.test.js`
- Create: `testing/tests/deck-history-contract.test.js`

- [ ] **Step 1: 先写失败测试，锁住“普通块编辑后只写当前 block.html，不写 localStorage / sidecar”**

在 `testing/tests/deck-data-authoring.test.js` 写入：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthoringHarness } from './helpers/deck-authoring-harness.js';

test('saveElement updates owning block html in indexeddb snapshot', async () => {
  const harness = await createAuthoringHarness('<div data-block-id="b1"><p data-edit-id="p1">Old</p></div>');
  harness.document.querySelector('[data-edit-id="p1"]').innerHTML = 'New';
  await harness.window.PersistenceLayer.saveElement(harness.document.querySelector('[data-edit-id="p1"]'));
  const snapshot = await harness.exportSnapshot();
  assert.match(snapshot.slides[0].blocks[0].html, /New/);
});
```

- [ ] **Step 2: 再写 history 契约失败测试，锁住“撤销 / 重做只看内存历史，不看 IndexedDB 历史”**

在 `testing/tests/deck-history-contract.test.js` 写入：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHistoryHarness } from './helpers/deck-history-harness.js';

test('undo restores the previous in-memory snapshot without asking indexeddb for a historical frame', async () => {
  const harness = await createHistoryHarness('<div data-block-id="b1"><p data-edit-id="p1">Old</p></div>');
  harness.document.querySelector('[data-edit-id="p1"]').innerHTML = 'New';
  harness.window.historyMgr.recordState(true);
  await harness.window.DeckDataAuthoring.saveBlockFromNode(harness.document.querySelector('[data-edit-id="p1"]'));
  await harness.window.historyMgr.undo();
  assert.match(harness.document.querySelector('[data-edit-id="p1"]').innerHTML, /Old/);
  assert.equal(harness.indexedDbHistoricalReadCount, 0);
});
```

- [ ] **Step 3: 实现 `assets/deck-data-authoring.js`，给所有作者态模块一个统一保存入口**

最小 API：

```js
(function () {
  'use strict';

  async function saveBlockFromNode(node) {}
  function scheduleBlockSaveFromNode(node) {}
  async function exportCurrentDeck() {}

  window.DeckDataAuthoring = { saveBlockFromNode, scheduleBlockSaveFromNode, exportCurrentDeck };
})();
```

要求：

1. `saveBlockFromNode(node)` 必须上溯到最近的 `data-block-id` 容器。
2. 回写时更新 JSON 文档中对应 block 的 `html` 字段。
3. 第一版只做 block 级整块序列化，不做局部 patch。
4. 允许在撤销 / 重做恢复完成后把“恢复后的最新 DOM”重新写回 IndexedDB，但不得在这个同步过程中新增 history 帧。

- [ ] **Step 4: 修改 `assets/editor-history.js`，显式保留“历史栈在内存、持久化层只存最新结果”的边界**

要求：

1. `HistoryManager` 仍只维护内存中的快照数组 / 指针。
2. `isRestoring` 继续作为恢复门禁，防止 undo / redo 触发新的 history 记录。
3. 如需把 undo / redo 后的最新 DOM 同步进 IndexedDB，这个调用必须放在恢复完成后，并显式绕过 `recordState()`。
4. 补详细中文注释，说明“撤销历史不落 IndexedDB”的原因，避免后续维护者误改。

- [ ] **Step 5: 把 `editor-persistence.js` 从 localStorage 方案改成 authoring 代理**

只保留旧 API 名称，内部实现改成：

```js
saveElement: function (el) {
  return window.DeckDataAuthoring.saveBlockFromNode(el);
},
restoreAllElements: function () {
  return Promise.resolve();
}
```

说明：新架构下 `restoreAllElements()` 不再主动向 DOM 填值，填值由 renderer 完成。

- [ ] **Step 6: 改 `editor-rich-text.js` 与 `page-richtext-annotation-runtime.js`，彻底切断旧 sidecar 触发**

把以下调用全部替换：

```js
window.AnnotationStore.scheduleSave()
window.AnnotationStore.saveNow()
```

替换为：

```js
window.DeckDataAuthoring.scheduleBlockSaveFromNode(targetNode)
```

并补中文注释说明：普通富文本标注现在只是“更新 block.html 并标记缓存脏”，不再参与旧 sidecar 体系。

- [ ] **Step 7: 跑普通块 authoring / history 测试与相关回归并提交**

Run:

```powershell
Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime/testing'
node --test tests/deck-data-authoring.test.js tests/deck-history-contract.test.js tests/page-richtext-annotation-runtime.test.js
```

Expected: PASS

Commit:

```powershell
Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime'
git add assets/deck-data-authoring.js assets/editor-history.js assets/editor-persistence.js assets/editor-rich-text.js assets/page-richtext-annotation-runtime.js testing/tests/deck-data-authoring.test.js testing/tests/deck-history-contract.test.js
git commit -m "feat: route ordinary authoring into deck data store"
```

---

## Task 5: 把 quiz-annotation 与 example-card 改成整块回写模型

**Files:**
- Modify: `assets/quiz-annotation-runtime.js`
- Modify: `assets/example-card-runtime.js`
- Modify: `assets/editor-utils.js`
- Modify: `testing/tests/quiz-annotation-runtime.test.js`
- Modify: `testing/tests/example-card-runtime.test.js`

- [ ] **Step 1: 先补失败测试，锁住“新增 / 删除批注一次刷新就生效”**

在 `testing/tests/quiz-annotation-runtime.test.js` 新增回归：

```js
it('persists a newly created note after one refresh through block html snapshots', async () => {
  const { window, qa, exportSnapshot, reloadFromSnapshot } = await createQuizBlockHarness();
  await createDynamicNote(qa, '新批注');
  const snapshot = await exportSnapshot();
  const reloadWindow = await reloadFromSnapshot(snapshot);
  assert.match(reloadWindow.document.querySelector('.quiz-annotation').innerHTML, /新批注/);
});
```

- [ ] **Step 2: 再补 example-card 失败测试，锁住题干 / 选项 / 解析的块级持久化**

在 `testing/tests/example-card-runtime.test.js` 新增：

```js
it('persists edited example-card option text through block html snapshots', async () => {
  const { window, exportSnapshot, reloadFromSnapshot } = await createExampleCardBlockHarness();
  window.document.querySelector('.qa-option-text').innerHTML = '新的选项文本';
  await window.DeckDataAuthoring.saveBlockFromNode(window.document.querySelector('.qa-option-text'));
  const snapshot = await exportSnapshot();
  const reloadWindow = await reloadFromSnapshot(snapshot);
  assert.match(reloadWindow.document.querySelector('.qa-option-text').innerHTML, /新的选项文本/);
});
```

- [ ] **Step 3: 改 `quiz-annotation-runtime.js`，把所有结构与正文变化统一收敛到当前 block 保存**

替换以下行为：

1. 删除 `AnnotationStore.scheduleSave()` / `saveNow()` 路径。
2. 删除“首次保存需要授权 JSON 存档文件”的旧状态文案。
3. 所有锚点、气泡正文、删除墓碑变化统一改为：

```js
window.DeckDataAuthoring.scheduleBlockSaveFromNode(qa);
```

必须补中文注释说明：新架构下 quiz 持久化的权威状态是当前 `data-block-id` 容器序列化结果，而不是 sidecar 补丁。

- [ ] **Step 4: 改 `example-card-runtime.js` 与 `editor-utils.js`，让选项文本编辑和块保存对齐**

要求：

1. `example-card` 内 `.qa-option-text` 继续可编辑。
2. 编辑态文本修改统一回写当前 example-card block。
3. 不再向 localStorage 写 example-card 的额外文本快照。

- [ ] **Step 5: 跑 quiz / example-card 相关回归并提交**

Run:

```powershell
Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime/testing'
node --test tests/quiz-annotation-runtime.test.js tests/example-card-runtime.test.js tests/page-richtext-annotation-runtime.test.js
```

Expected: PASS，且“新增/删除批注需要刷新两次”类回归为 0。

Commit:

```powershell
Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime'
git add assets/quiz-annotation-runtime.js assets/example-card-runtime.js assets/editor-utils.js testing/tests/quiz-annotation-runtime.test.js testing/tests/example-card-runtime.test.js
git commit -m "feat: persist quiz and example-card blocks into deck data store"
```

---

## Task 6: 增加左上角“保存到本地化文件”按钮与 JSON 导出链路

**Files:**
- Create: `assets/deck-save-runtime.js`
- Create: `testing/tests/deck-save-runtime.test.js`
- Modify: `assets/editor-core.js`
- Modify: `assets/editor.css`
- Modify: `assets/deck-shell.css`

- [ ] **Step 1: 先写保存按钮失败测试，锁住“导出的是当前 IndexedDB 快照，不是 DOM 即时拼接字符串”**

在 `testing/tests/deck-save-runtime.test.js` 写入：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('save runtime exports current deck snapshot as json', async () => {
  const runtime = await createSaveHarness({ deckId: 'demo', blockHtml: '<p>Saved</p>' });
  const exported = await runtime.exportCurrentDeck();
  assert.equal(exported.deckId, 'demo');
  assert.match(JSON.stringify(exported), /Saved/);
});
```

- [ ] **Step 2: 实现 `assets/deck-save-runtime.js`，只负责导出与文件句柄复用**

最小 API：

```js
(function () {
  'use strict';

  async function exportCurrentDeck() {
    const snapshot = await window.DeckDataAuthoring.exportCurrentDeck();
    return snapshot;
  }

  async function saveDeckToFile() {
    const snapshot = await exportCurrentDeck();
    const json = JSON.stringify(snapshot, null, 2);
    /* File System Access 优先，失败时回退 Blob 下载 */
  }

  window.DeckSaveRuntime = { exportCurrentDeck, saveDeckToFile };
})();
```

- [ ] **Step 3: 修改 `editor-core.js`，把保存按钮注入到左上角固定区域**

新增按钮 HTML：

```html
<button type="button" class="deck-save-btn" aria-label="保存到本地化文件">保存到本地化文件</button>
```

绑定行为：

```js
saveBtn.addEventListener('click', function () {
  window.DeckSaveRuntime.saveDeckToFile();
});
```

- [ ] **Step 4: 在 `editor.css` 与 `deck-shell.css` 里补保存按钮样式，不影响现有编辑开关**

按钮需满足：

1. 固定在左上角工具区。
2. 编辑模式与放映模式都可见。
3. 不使用“自动保存”文案，避免误解为实时写文件。

- [ ] **Step 5: 跑保存按钮测试与最小编辑器回归并提交**

Run:

```powershell
Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime/testing'
node --test tests/deck-save-runtime.test.js tests/deck-data-authoring.test.js
```

Expected: PASS

Commit:

```powershell
Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime'
git add assets/deck-save-runtime.js assets/editor-core.js assets/editor.css assets/deck-shell.css testing/tests/deck-save-runtime.test.js
git commit -m "feat: add explicit json export button"
```

---

## Task 7: 改写 skill 输出机制，让新课件生成 HTML 壳 + JSON 数据文件

**Files:**
- Modify: `SKILL.md`
- Modify: `README.md`
- Modify: `QUICKSTART.md`
- Modify: `references/html-template.md`
- Modify: `references/component-templates.md`
- Create: `testing/tests/deck-skill-output.test.js`

- [ ] **Step 1: 先写输出契约失败测试，锁住生成产物不再包含旧 sidecar 路径**

在 `testing/tests/deck-skill-output.test.js` 写入：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('html template references deck bootstrap runtime and sibling deck json seed', () => {
  const template = fs.readFileSync(new URL('../../references/html-template.md', import.meta.url), 'utf8');
  assert.match(template, /deck-data-bootstrap\.js/);
  assert.match(template, /deck-manifest/);
  assert.doesNotMatch(template, /annotation-store\.js/);
});
```

- [ ] **Step 2: 修改 `SKILL.md`，把输出定义改成三件产物**

输出说明必须改成：

```text
my-deck.html
my-deck.deck.json
assets/
```

并明确：

1. HTML 是壳。
2. JSON 存所有 slide / block 内容。
3. 新课件不再默认依赖 `annotation-store.js`。

- [ ] **Step 3: 修改 `references/html-template.md` 与 `references/component-templates.md`**

要求：

1. 模板示例展示 shell + manifest + bootstrap 引用。
2. 组件模板示例明确：组件 HTML 现在写入 JSON block 的 `html` 字段，而不是直接内嵌到最终 HTML 成品。

- [ ] **Step 4: 修改 `README.md` 与 `QUICKSTART.md`，讲清首开导入与显式保存语义**

必须新增一句等价说明：

1. 首次打开时会从同目录 JSON 导入缓存。
2. 平时编辑只修改本地缓存。
3. 点击左上角按钮才会把当前状态写回 JSON 文件。

- [ ] **Step 5: 跑输出契约测试并提交**

Run:

```powershell
Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime/testing'
node --test tests/deck-skill-output.test.js
```

Expected: PASS

Commit:

```powershell
Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime'
git add SKILL.md README.md QUICKSTART.md references/html-template.md references/component-templates.md testing/tests/deck-skill-output.test.js
git commit -m "docs: switch skill output to shell plus deck json"
```

---

## Task 8: 用新架构重生成示例课件并做整体验证

**Files:**
- Modify: `高考英语阅读实战.html`
- Create: `高考英语阅读实战.deck.json`
- Modify: `七选五理论论述.html`
- Create: `七选五理论论述.deck.json`
- Modify: `开发者文档/答题与批注组件.md`
- Modify: `开发者文档/例题组件.md`

- [ ] **Step 1: 先把两个示例课件改成新 shell，不再内嵌正文内容**

要求：

1. HTML 只保留壳、manifest、脚本引用。
2. 原本正文、题干、批注、例题内容全部迁入对应 `.deck.json`。
3. 删除同目录旧 `.annotations.js` 在新示例中的依赖关系。

- [ ] **Step 2: 补开发者文档，说明 quiz / example-card 在新架构里的保存语义**

必须明确：

1. 组件内容现在跟随 block JSON 走。
2. 日常编辑不会实时写同目录文件。
3. 显式点击保存按钮才会导出当前状态。

- [ ] **Step 3: 跑全量自动化回归**

Run:

```powershell
Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime/testing'
node --test tests/deck-shell-contract.test.js tests/deck-data-schema.test.js tests/deck-data-store.test.js tests/deck-data-bootstrap.test.js tests/deck-data-renderer.test.js tests/deck-data-authoring.test.js tests/deck-history-contract.test.js tests/deck-save-runtime.test.js tests/deck-skill-output.test.js tests/page-richtext-annotation-runtime.test.js tests/quiz-annotation-runtime.test.js tests/example-card-runtime.test.js tests/slides-runtime.test.js
```

Expected: PASS

- [ ] **Step 4: 做一次真实浏览器手测，并在通过后再收尾提交**

手测清单：

1. 首开 shell 时能自动导入同目录 JSON。
2. 改正文后刷新一次即可恢复。
3. 新增批注后刷新一次即可恢复。
4. 删除批注后刷新一次仍保持删除态。
5. 点击左上角按钮能导出 JSON 文件。
6. 换一台浏览器或清空 IndexedDB 后，重新打开 HTML 仍能从 JSON 还原。

- [ ] **Step 5: 完成最终提交**

```powershell
Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime'
git add 高考英语阅读实战.html 高考英语阅读实战.deck.json 七选五理论论述.html 七选五理论论述.deck.json 开发者文档/答题与批注组件.md 开发者文档/例题组件.md
git commit -m "feat: ship data-driven courseware runtime"
```

---

## 自检结果

### Spec coverage

1. HTML 壳只保留容器：Task 1、Task 3、Task 7、Task 8 覆盖。
2. JSON 外挂文件为真相源：Task 2、Task 3、Task 6、Task 7 覆盖。
3. IndexedDB 作为运行时缓存：Task 2、Task 3、Task 4、Task 5 覆盖。
4. 撤销 / 重做基于运行时内存历史栈：Task 4 覆盖。
5. 左上角保存按钮：Task 6 覆盖。
6. worktree 分支开发：Task 1 覆盖。
7. 正文、批注、标注全部迁入新架构：Task 4、Task 5、Task 8 覆盖。

### Placeholder scan

已消除 `TODO`、`TBD`、`类似 Task X` 这类占位描述；所有任务都给出文件路径、测试命令与最小代码骨架。

### Type consistency

计划统一使用以下命名：

1. `DeckDataSchema`
2. `DeckDataStore`
3. `DeckDataBootstrap`
4. `DeckDataRenderer`
5. `DeckDataAuthoring`
6. `DeckSaveRuntime`

后续实现中不要再引入同义但不同名的 API。