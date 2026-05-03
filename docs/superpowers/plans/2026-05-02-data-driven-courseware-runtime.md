# Data-Driven Courseware Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 html-slides 从“HTML 内嵌正文内容 + localStorage / sidecar 混合持久化”重构为“HTML 壳 + 外挂 JSON 真相源 + IndexedDB 最新状态缓存 + 显式导出保存”的新架构，并同步改写 skill 输出机制。

**Architecture:** 新课件不再把正文、批注、标注直接写进 HTML，而是生成 `my-deck.html + my-deck.deck.json + assets/`。运行时增加 `deck-runtime-entry.js` 作为唯一启动总入口，按“读取 manifest -> bootstrap 种子/缓存 -> render block DOM -> 初始化 editor/quiz/example-card”顺序启动，避免空壳先被旧编辑器恢复链和 history 基线捕获。JSON 是可迁移真相源，IndexedDB 仅保存当前最新稳定状态；撤销/重做只来自运行时内存 history 栈，左上角按钮显式把当前快照导出为 JSON。

**Tech Stack:** 原生 HTML / CSS / JavaScript、IndexedDB、File System Access API、Node.js `--test` + jsdom、既有 editor / quiz / example-card 运行时。

**执行约束补充：**
1. 不考虑兼容旧课件；旧示例文件允许在新架构完成后重新生成。
2. 块级数据化采用“块结构化 + 块内 HTML 片段保真”路线，不在第一版引入富文本 AST。
3. JSON 是可迁移真相源，IndexedDB 只是最新状态缓存；不允许把两者重新做成并行真相源。
4. 新架构首版不再依赖 `annotation-store.js` 参与日常运行时恢复；外挂文件只在首开导入与显式保存时参与。
5. 运行时新增文件继续采用浏览器全局脚本 + `window.*` 暴露模式，不切到 ESM；Node 测试统一走 jsdom + harness + `window.eval()`。
6. 必须在独立 worktree 分支中开发，禁止在当前主工作区直接大改运行时与 skill 文档。
7. 新架构首版显式禁用 `custom-box`、`native mods`、`doodle`，避免旧 localStorage 状态源继续污染运行时。若未来要恢复这些能力，单独开新计划。

---

## 先解决的 5 个高风险点

在进入大迁移前，必须先把下面 5 件事钉死，否则实现阶段会高频返工：

1. **统一测试/实现模块约定**：运行时文件继续用浏览器全局脚本，测试不能再写成直接 `import { ... } from '../../assets/*.js'`。
2. **固定启动顺序**：必须先 bootstrap + render，再允许 `editor-core.js`、`quiz-annotation-runtime.js`、`example-card-runtime.js` 初始化。
3. **清理旧持久化残留链路**：不能只补新保存调用，却保留旧 `AnnotationStore` / localStorage 恢复逻辑继续抢状态源。
4. **补齐测试夹具**：原计划里引用了大量 `create*Harness()`，但没有把 helper 文件列入任务和文件地图。
5. **收缩首版范围**：`custom-box`、`native mods`、`doodle` 不属于本轮必须完成的“正文/批注/标注数据驱动化”，必须显式关停。

---

## 固定契约

### 1. HTML 壳只保留结构，不保留内容

HTML 只允许保留以下信息：

1. `div#deck`、加载态 / 空态容器、工具条挂载根。
2. 可选 `<template>`，仅用于 renderer 生成 slide 骨架。
3. 小型 manifest 元数据，不包含正文内容：

```html
<script type="application/json" class="deck-manifest">
{
  "deckId": "gaokao-reading-demo",
  "schemaVersion": 1,
  "seedVersion": "2026-05-03T10:00:00Z",
  "seedPath": "./高考英语阅读实战.deck.json"
}
</script>
```

4. 运行时脚本与 CSS 引用。

### 2. JSON 文件是可迁移真相源

第一版统一采用块级数据化：slide 结构化，block 结构化，block 内正文保留 HTML 片段。

```json
{
  "schemaVersion": 1,
  "deckId": "gaokao-reading-demo",
  "seedVersion": "2026-05-03T10:00:00Z",
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
2. IndexedDB 只保存当前最新稳定状态，不保存历史版本链。
3. manifest 里的 `seedVersion` 与 IndexedDB 中缓存版本一致时，启动直接读 IndexedDB。
4. 版本不一致或缓存缺失时，bootstrap 才重新加载 JSON 并导入 IndexedDB。
5. 左上角保存按钮始终导出当前 IndexedDB 快照到 JSON 文件。

### 4. 撤销 / 重做边界

1. `editor-history.js` 继续作为唯一历史管理器，负责记录当前会话中的 undo / redo 栈。
2. `DeckDataAuthoring` 每次保存 block 时，只把最新结果写入 IndexedDB，不负责维护历史版本链。
3. `historyMgr.undo()` / `redo()` 恢复 DOM 后，允许触发一次“把恢复后的最新状态重新写回 IndexedDB”的同步动作；但这个动作不能反过来生成新的 history 帧。
4. 禁止把 IndexedDB 设计成撤销仓库，不引入“从 IndexedDB 回放上一步快照”的实现路径。
5. 第一版不追求“刷新页面后还能撤销刷新前的每一步操作”；如果未来需要跨刷新编辑历史，必须单独设计操作日志层。

### 5. `file://` 首开导入策略

为避免纯 `file://` 下直接 `fetch()` JSON 不稳定，bootstrap 必须实现双路径：

1. `http(s)`：优先 `fetch(manifest.seedPath)`。
2. `file://`：优先尝试文本桥读取同目录 JSON。
3. 如果 `file://` 文本桥失败，显示“导入本地 JSON 数据文件”降级入口，但不能静默失败。
4. 这条路径必须先通过技术尖刺验证，再允许进入正式迁移。

### 6. 启动顺序是强制契约

唯一允许的顺序是：

1. `deck-runtime-entry.js` 解析 manifest。
2. `deck-data-bootstrap.js` 决定走 IndexedDB 还是 seed JSON。
3. `deck-data-renderer.js` 把 slide / block 渲染到 `#deck`。
4. render 完成后，再显式调用 editor / quiz / example-card 初始化。
5. 任何旧模块都不允许在空壳阶段先执行恢复、初始化或 baseline 捕获。

---

## 文件地图

### 新增运行时文件

| 文件 | 责任 |
| --- | --- |
| `assets/deck-runtime-entry.js` | 新架构唯一启动入口，统一编排 bootstrap -> render -> editor/quiz/example-card init |
| `assets/deck-data-schema.js` | 课件 JSON schema、manifest 解析、版本校验辅助 |
| `assets/deck-data-store.js` | IndexedDB 打开、最新快照读取、导入、更新、导出 |
| `assets/deck-data-bootstrap.js` | 首开导入桥，按 manifest 决定走缓存还是种子 JSON |
| `assets/deck-data-renderer.js` | 根据 JSON / IndexedDB 文档把 slide、header、block 渲染进 HTML 壳 |
| `assets/deck-data-authoring.js` | 作者态统一保存入口，把 DOM 变更回写到对应 block |
| `assets/deck-save-runtime.js` | 左上角保存按钮、File System Access 导出、后续覆盖写句柄 |
| `assets/deck-shell.css` | HTML 壳级占位样式、加载态、空壳提示、保存按钮样式 |

### 需要修改的现有运行时文件

| 文件 | 新职责 |
| --- | --- |
| `assets/editor-core.js` | 不再自行在空壳阶段恢复内容；改为受 `deck-runtime-entry.js` 控制初始化，并注入“保存到本地化文件”按钮 |
| `assets/editor-history.js` | 保持撤销/重做基于运行时内存历史栈，不让 IndexedDB 承担编辑历史仓库职责 |
| `assets/editor-persistence.js` | 从 localStorage 普通内容持久化层改为 `DeckDataAuthoring` 代理层；数据驱动模式下禁用旧 `boxes/nmods` 流程 |
| `assets/editor-rich-text.js` | 富文本标注改为写 block HTML 到 `DeckDataAuthoring`，不再写 sidecar / localStorage |
| `assets/page-richtext-annotation-runtime.js` | 保持 reveal 行为，但不再依赖旧 sidecar 恢复链 |
| `assets/quiz-annotation-runtime.js` | 删除 `AnnotationStore` 保存/恢复/授权链，结构变更与气泡正文统一回写当前 quiz block |
| `assets/example-card-runtime.js` | 删除 `AnnotationStore` / localStorage 文本水合与 authoring config 旧链，题干/选项/解析统一回写当前 example-card block |
| `assets/editor-utils.js` | 继续负责 example-card 可编辑候选，但不再为旧 localStorage/sidecar 恢复特殊兜底 |

### 测试辅助文件

这些 helper 必须先落地，再允许写业务测试：

| 文件 | 责任 |
| --- | --- |
| `testing/tests/helpers/deck-bootstrap-harness.js` | 构造 manifest + seed loader + fake IndexedDB 的 bootstrap 测试夹具 |
| `testing/tests/helpers/deck-authoring-harness.js` | 构造 block DOM、store、editor persistence 的普通块作者态夹具 |
| `testing/tests/helpers/deck-history-harness.js` | 构造 historyMgr + store + DOM 的撤销/重做契约夹具 |
| `testing/tests/helpers/deck-quiz-block-harness.js` | 构造 quiz block 迁移集成夹具 |
| `testing/tests/helpers/deck-example-card-harness.js` | 构造 example-card block 迁移集成夹具 |
| `testing/tests/helpers/deck-save-harness.js` | 构造导出按钮与保存句柄夹具 |
| `testing/tests/helpers/deck-runtime-entry-harness.js` | 构造 shell -> bootstrap -> render -> init 顺序测试夹具 |

### 新增测试文件

| 文件 | 责任 |
| --- | --- |
| `testing/tests/deck-shell-contract.test.js` | HTML 壳不再内嵌正文内容 |
| `testing/tests/deck-bootstrap-spike.test.js` | 最高风险尖刺：`file://` 文本桥和 seed 导入策略 |
| `testing/tests/deck-runtime-entry.test.js` | 启动顺序：先 render 后 init，禁止空壳先 baseline |
| `testing/tests/deck-data-schema.test.js` | schema 归一化、manifest 解析、版本规则 |
| `testing/tests/deck-data-store.test.js` | IndexedDB 导入、读取、更新、导出 |
| `testing/tests/deck-data-bootstrap.test.js` | bootstrap 命中逻辑 |
| `testing/tests/deck-data-renderer.test.js` | shell -> slide -> block 渲染结果 |
| `testing/tests/deck-data-authoring.test.js` | 块回写、富文本保真、普通块保存 |
| `testing/tests/deck-history-contract.test.js` | 撤销/重做只依赖运行时内存历史栈，不从 IndexedDB 回放历史 |
| `testing/tests/deck-save-runtime.test.js` | 保存按钮、导出 JSON、句柄复用 |
| `testing/tests/deck-skill-output.test.js` | 新模板输出契约，不再依赖旧 sidecar |

### 首版明确不做的东西

1. `custom-box` 持久化。
2. 原生元素位移 / 隐藏状态 `nmods` 持久化。
3. `doodle` 数据迁移。
4. 跨刷新完整撤销/重做历史。

这些能力在新 shell 首版必须显式关停或隐藏，不允许处于“计划没写，但运行时可能还活着”的灰区。

---

## Phase A: 技术尖刺与启动边界冻结

### Task 1: worktree + 技术尖刺 + 壳契约

**Files:**
- Create: `testing/fixtures/data-driven/minimal-shell.html`
- Create: `testing/fixtures/data-driven/minimal-shell.deck.json`
- Create: `testing/tests/deck-shell-contract.test.js`
- Create: `testing/tests/deck-bootstrap-spike.test.js`
- Create: `testing/tests/helpers/deck-bootstrap-harness.js`
- Modify: `references/html-template.md`

- [ ] **Step 1: 在独立 worktree 中开始实现，不在主工作区直接改代码**

Run:

```powershell
+Set-Location 'd:/Projects/html-slides'
+git worktree add '.worktrees/data-driven-courseware-runtime' -b 'feature/data-driven-courseware-runtime'
+Set-Location '.worktrees/data-driven-courseware-runtime/testing'
+node --test tests/spec-validator.test.js
```

Expected: worktree 创建成功，现有基线测试可跑；如果基线失败，先把失败输出记录到计划执行日志，再决定是否继续。

- [ ] **Step 2: 先写 shell 契约测试，锁住“HTML 不再内嵌正文内容”的边界**

在 `testing/tests/deck-shell-contract.test.js` 写入：

```js
+import { test } from 'node:test';
+import assert from 'node:assert/strict';
+import fs from 'node:fs';
+
+test('data-driven shell keeps only manifest and empty deck host', () => {
+  const html = fs.readFileSync(new URL('../fixtures/data-driven/minimal-shell.html', import.meta.url), 'utf8');
+  assert.match(html, /class="deck-manifest"/);
+  assert.match(html, /id="deck"/);
+  assert.doesNotMatch(html, /高考英语阅读实战正文/);
+  assert.doesNotMatch(html, /class="quiz-annotation"/);
+});
```

- [ ] **Step 3: 写技术尖刺测试，只验证两件最高风险前提**

在 `testing/tests/deck-bootstrap-spike.test.js` 写入：

```js
+import { test } from 'node:test';
+import assert from 'node:assert/strict';
+import { createBootstrapHarness } from './helpers/deck-bootstrap-harness.js';
+
+test('bootstrap spike proves file protocol seed bridge can produce seed text or explicit fallback', async () => {
+  const harness = await createBootstrapHarness({ protocol: 'file:' });
+  const result = await harness.tryLoadSeed();
+  assert.ok(result.kind === 'seed-json' || result.kind === 'manual-import-required');
+});
+
+test('bootstrap spike never lets editor initialize before deck render completes', async () => {
+  const harness = await createBootstrapHarness({ protocol: 'https:' });
+  await harness.runFullBoot();
+  assert.deepEqual(harness.lifecycle, ['bootstrap:start', 'bootstrap:ready', 'render:start', 'render:done', 'editor:init']);
+});
```

- [ ] **Step 4: 创建最小 HTML 壳与最小 JSON 种子夹具，让壳契约测试变绿**

`testing/fixtures/data-driven/minimal-shell.html` 最小内容采用：

```html
+<!DOCTYPE html>
+<html lang="zh-CN">
+<head>
+  <meta charset="UTF-8" />
+  <title>Data Driven Shell</title>
+  <link rel="stylesheet" href="../../assets/deck-shell.css" />
+</head>
+<body>
+  <div class="deck-shell-toolbar"></div>
+  <div class="deck-loading-state">正在加载课件数据...</div>
+  <div class="deck" id="deck"></div>
+  <script type="application/json" class="deck-manifest">{"deckId":"minimal-shell","schemaVersion":1,"seedVersion":"2026-05-03T10:00:00Z","seedPath":"./minimal-shell.deck.json"}</script>
+</body>
+</html>
```

`testing/fixtures/data-driven/minimal-shell.deck.json` 最小内容采用：

```json
+{
+  "schemaVersion": 1,
+  "deckId": "minimal-shell",
+  "seedVersion": "2026-05-03T10:00:00Z",
+  "title": "最小课件",
+  "theme": "teaching",
+  "slides": []
+}
```

- [ ] **Step 5: 更新 `references/html-template.md`，加入新 shell 模板和首版禁用说明**

必须新增：

1. `div#deck` 只作为挂载根。
2. `script.deck-manifest` 只保存 deckId / schemaVersion / seedVersion / seedPath。
3. 顶部工具条保留保存按钮挂载位，不内嵌正文内容。
4. 首版禁用 `custom-box`、`native mods`、`doodle` 的说明。

- [ ] **Step 6: 运行壳契约 + 技术尖刺测试并提交**

Run:

```powershell
+Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime/testing'
+node --test tests/deck-shell-contract.test.js tests/deck-bootstrap-spike.test.js
```

Expected: PASS；如果 `file://` 仍不能稳定自动读 JSON，必须在计划执行日志中做出明确结论，再决定保留 JSON 文本桥还是降级到 `seed.js` 启动桥。

Commit:

```powershell
+Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime'
+git add testing/fixtures/data-driven/minimal-shell.html testing/fixtures/data-driven/minimal-shell.deck.json testing/tests/deck-shell-contract.test.js testing/tests/deck-bootstrap-spike.test.js testing/tests/helpers/deck-bootstrap-harness.js references/html-template.md
+git commit -m "test: lock shell contract and bootstrap spike"
```

---

## Phase B: 启动总入口与模块约定

### Task 2: 新增 `deck-runtime-entry.js` 并冻结初始化顺序

**Files:**
- Create: `assets/deck-runtime-entry.js`
- Create: `testing/tests/deck-runtime-entry.test.js`
- Create: `testing/tests/helpers/deck-runtime-entry-harness.js`
- Modify: `assets/editor-core.js`
- Modify: `assets/quiz-annotation-runtime.js`
- Modify: `assets/example-card-runtime.js`

- [ ] **Step 1: 先写失败测试，锁住“render 完成前不允许 editor/quiz/example-card 初始化”**

在 `testing/tests/deck-runtime-entry.test.js` 写入：

```js
+import { test } from 'node:test';
+import assert from 'node:assert/strict';
+import { createRuntimeEntryHarness } from './helpers/deck-runtime-entry-harness.js';
+
+test('runtime entry renders deck before editor captures baseline', async () => {
+  const harness = await createRuntimeEntryHarness();
+  await harness.start();
+  assert.deepEqual(harness.lifecycle, ['bootstrap:start', 'bootstrap:ready', 'render:start', 'render:done', 'editor:init', 'quiz:init', 'example-card:init']);
+  assert.equal(harness.emptyShellBaselineCaptured, false);
+});
```

- [ ] **Step 2: 实现 `assets/deck-runtime-entry.js`，它是唯一允许的启动总入口**

最小 API：

```js
+(function () {
+  'use strict';
+
+  async function startDeckRuntime() {
+    const boot = await window.DeckDataBootstrap.bootstrapDeckRuntime();
+    const doc = await boot.store.getDocument(boot.manifest.deckId);
+    window.DeckDataRenderer.renderDeck(document, doc);
+    initializeInteractiveRuntimes();
+    return boot;
+  }
+
+  window.DeckRuntimeEntry = { startDeckRuntime };
+})();
```

- [ ] **Step 3: 修改 `assets/editor-core.js`，把当前构造期自动恢复改成受控流程**

要求：

1. 数据驱动模式下，`EditorCore` 构造期不得直接执行 `restoreAllElements()`、`restoreNativeMods()`、`refreshEditables()`。
2. 这些动作改成 `editorCore.initializeAfterRender()` 之类的显式入口，由 `deck-runtime-entry.js` 在 render 完成后调用。
3. `loadCustomBoxes()` 在数据驱动模式下不执行。
4. 补中文注释，说明为什么空壳阶段不能先做 baseline 与 editable 候选收集。

- [ ] **Step 4: 修改 `assets/quiz-annotation-runtime.js` 与 `assets/example-card-runtime.js` 的 auto-init 入口**

要求：

1. 数据驱动模式下不再等待 `AnnotationStore.whenReady()`。
2. 数据驱动模式下只响应 `DeckRuntimeEntry` 的渲染完成调用。
3. 旧模式入口暂时保留，直到新示例课件全部切换完成。

- [ ] **Step 5: 运行 runtime-entry 测试并提交**

Run:

```powershell
+Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime/testing'
+node --test tests/deck-runtime-entry.test.js
```

Expected: PASS

Commit:

```powershell
+Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime'
+git add assets/deck-runtime-entry.js assets/editor-core.js assets/quiz-annotation-runtime.js assets/example-card-runtime.js testing/tests/deck-runtime-entry.test.js testing/tests/helpers/deck-runtime-entry-harness.js
+git commit -m "feat: add runtime entry and freeze init order"
```

---

## Phase C: Schema、Store 与普通块 authoring/hydration

### Task 3: 建立 JSON schema 与 IndexedDB 最新状态缓存层

**Files:**
- Create: `assets/deck-data-schema.js`
- Create: `assets/deck-data-store.js`
- Create: `testing/tests/deck-data-schema.test.js`
- Create: `testing/tests/deck-data-store.test.js`

- [ ] **Step 1: 先写 schema 失败测试，锁住最小文档结构与 manifest 归一化规则**

在 `testing/tests/deck-data-schema.test.js` 写入：

```js
+import { test } from 'node:test';
+import assert from 'node:assert/strict';
+
+test('normalizeDeckDocument preserves block html and required metadata', () => {
+  const schema = window.DeckDataSchema;
+  const normalized = schema.normalizeDeckDocument({
+    schemaVersion: 1,
+    deckId: 'demo',
+    seedVersion: 'v1',
+    title: 'Demo',
+    theme: 'teaching',
+    slides: [{ slideId: 's1', module: 'M', title: 'T', layout: 'layout-single', blocks: [{ blockId: 'b1', kind: 'richtext', slot: 'main', html: '<p>Hello</p>' }] }]
+  });
+  assert.equal(normalized.slides[0].blocks[0].html, '<p>Hello</p>');
+});
```

- [ ] **Step 2: 再写 store 失败测试，锁住导入、读取、更新与导出**

在 `testing/tests/deck-data-store.test.js` 写入：

```js
+import { test } from 'node:test';
+import assert from 'node:assert/strict';
+import { createRuntimeEntryHarness } from './helpers/deck-runtime-entry-harness.js';
+
+test('imports seed document and exports the latest snapshot', async () => {
+  const harness = await createRuntimeEntryHarness();
+  const store = await harness.window.DeckDataStore.createDeckStore({ dbName: 'deck-data-store-test' });
+  await store.importSeed({ schemaVersion: 1, deckId: 'demo', seedVersion: 'v1', title: 'Demo', theme: 'teaching', slides: [] });
+  const snapshot = await store.exportSnapshot('demo');
+  assert.equal(snapshot.deckId, 'demo');
+  assert.equal(snapshot.seedVersion, 'v1');
+});
```

- [ ] **Step 3: 实现 `assets/deck-data-schema.js`，只做 schema 解析与 clone**

最小 API：

```js
+(function () {
+  'use strict';
+
+  function parseDeckManifest(rawJson) {}
+  function normalizeDeckDocument(rawDoc) {}
+  function cloneDeckDocument(doc) { return JSON.parse(JSON.stringify(doc)); }
+
+  window.DeckDataSchema = { parseDeckManifest, normalizeDeckDocument, cloneDeckDocument };
+})();
```

- [ ] **Step 4: 实现 `assets/deck-data-store.js`，只承担最新快照缓存，不碰历史栈**

最小 API：

```js
+(function () {
+  'use strict';
+
+  async function createDeckStore(options) {
+    return {
+      importSeed(doc) {},
+      getDocument(deckId) {},
+      updateDocument(deckId, updater) {},
+      exportSnapshot(deckId) {},
+      getMeta(deckId) {}
+    };
+  }
+
+  window.DeckDataStore = { createDeckStore };
+})();
```

要求：

1. `updateDocument(deckId, updater)` 内部始终先 clone，再允许更新。
2. store 元数据至少保存 `deckId`、`seedVersion`、`updatedAt`。
3. 不在这一层引入 DOM 逻辑。
4. 不在这一层保存 undo/redo 历史。

- [ ] **Step 5: 运行 schema + store 测试并提交**

Run:

```powershell
+Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime/testing'
+node --test tests/deck-data-schema.test.js tests/deck-data-store.test.js
```

Expected: PASS

Commit:

```powershell
+Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime'
+git add assets/deck-data-schema.js assets/deck-data-store.js testing/tests/deck-data-schema.test.js testing/tests/deck-data-store.test.js
+git commit -m "feat: add deck schema and indexeddb latest-state store"
```

### Task 4: 用统一 authoring 桥接替换普通块的 localStorage / sidecar 保存

**Files:**
- Create: `assets/deck-data-authoring.js`
- Modify: `assets/editor-history.js`
- Modify: `assets/editor-persistence.js`
- Modify: `assets/editor-rich-text.js`
- Modify: `assets/page-richtext-annotation-runtime.js`
- Create: `testing/tests/deck-data-authoring.test.js`
- Create: `testing/tests/deck-history-contract.test.js`
- Create: `testing/tests/helpers/deck-authoring-harness.js`
- Create: `testing/tests/helpers/deck-history-harness.js`

- [ ] **Step 1: 先写普通块 authoring 失败测试**

```js
+import { test } from 'node:test';
+import assert from 'node:assert/strict';
+import { createAuthoringHarness } from './helpers/deck-authoring-harness.js';
+
+test('saveElement updates owning block html in indexeddb snapshot', async () => {
+  const harness = await createAuthoringHarness('<div data-block-id="b1"><p data-edit-id="p1">Old</p></div>');
+  harness.document.querySelector('[data-edit-id="p1"]').innerHTML = 'New';
+  await harness.window.PersistenceLayer.saveElement(harness.document.querySelector('[data-edit-id="p1"]'));
+  const snapshot = await harness.exportSnapshot();
+  assert.match(snapshot.slides[0].blocks[0].html, /New/);
+});
```

- [ ] **Step 2: 再写 history 契约失败测试，锁住“撤销 / 重做只看内存历史，不看 IndexedDB 历史”**

```js
+import { test } from 'node:test';
+import assert from 'node:assert/strict';
+import { createHistoryHarness } from './helpers/deck-history-harness.js';
+
+test('undo restores the previous in-memory snapshot without asking indexeddb for a historical frame', async () => {
+  const harness = await createHistoryHarness('<div data-block-id="b1"><p data-edit-id="p1">Old</p></div>');
+  harness.document.querySelector('[data-edit-id="p1"]').innerHTML = 'New';
+  harness.window.historyMgr.recordState(true);
+  await harness.window.DeckDataAuthoring.saveBlockFromNode(harness.document.querySelector('[data-edit-id="p1"]'));
+  await harness.window.historyMgr.undo();
+  assert.match(harness.document.querySelector('[data-edit-id="p1"]').innerHTML, /Old/);
+  assert.equal(harness.indexedDbHistoricalReadCount, 0);
+});
```

- [ ] **Step 3: 实现 `assets/deck-data-authoring.js`，给所有作者态模块一个统一保存入口**

最小 API：

```js
+(function () {
+  'use strict';
+
+  async function saveBlockFromNode(node) {}
+  function scheduleBlockSaveFromNode(node) {}
+  async function exportCurrentDeck() {}
+
+  window.DeckDataAuthoring = { saveBlockFromNode, scheduleBlockSaveFromNode, exportCurrentDeck };
+})();
```

要求：

1. `saveBlockFromNode(node)` 必须上溯到最近的 `data-block-id` 容器。
2. 回写时更新 JSON 文档中对应 block 的 `html` 字段。
3. 第一版只做 block 级整块序列化，不做局部 patch。
4. 允许在撤销 / 重做恢复完成后把恢复后的最新 DOM 重新写回 IndexedDB，但不得在这个同步过程中新增 history 帧。

- [ ] **Step 4: 修改 `assets/editor-history.js`，显式保留“历史栈在内存、持久化层只存最新结果”的边界**

要求：

1. `HistoryManager` 仍只维护内存中的快照数组 / 指针。
2. `isRestoring` 继续作为恢复门禁，防止 undo / redo 触发新的 history 记录。
3. 如需把 undo / redo 后的最新 DOM 同步进 IndexedDB，这个调用必须放在恢复完成后，并显式绕过 `recordState()`。
4. 补详细中文注释，说明“撤销历史不落 IndexedDB”的原因，避免后续维护者误改。

- [ ] **Step 5: 修改 `assets/editor-persistence.js`，并显式关停新模式下的旧残留状态源**

要求：

1. `saveElement()` 改走 `DeckDataAuthoring.saveBlockFromNode()`。
2. `restoreAllElements()` 改为 no-op，填值由 renderer 完成。
3. 数据驱动模式下，`saveCustomBoxes()`、`loadCustomBoxes()`、`saveNativeMods()`、`restoreNativeMods()` 全部显式 no-op 或 gated return。
4. 补中文注释，说明这些能力属于首版范围外，禁止“半迁移半保留”。

- [ ] **Step 6: 改 `editor-rich-text.js` 与 `page-richtext-annotation-runtime.js`，彻底切断旧 sidecar 触发**

把以下调用全部替换：

```js
+window.AnnotationStore.scheduleSave()
+window.AnnotationStore.saveNow()
```

替换为：

```js
+window.DeckDataAuthoring.scheduleBlockSaveFromNode(targetNode)
```

- [ ] **Step 7: 运行普通块 authoring / history 测试与相关回归并提交**

Run:

```powershell
+Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime/testing'
+node --test tests/deck-data-authoring.test.js tests/deck-history-contract.test.js tests/page-richtext-annotation-runtime.test.js
```

Expected: PASS

Commit:

```powershell
+Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime'
+git add assets/deck-data-authoring.js assets/editor-history.js assets/editor-persistence.js assets/editor-rich-text.js assets/page-richtext-annotation-runtime.js testing/tests/deck-data-authoring.test.js testing/tests/deck-history-contract.test.js testing/tests/helpers/deck-authoring-harness.js testing/tests/helpers/deck-history-harness.js
+git commit -m "feat: route ordinary authoring into deck data runtime"
```

---

## Phase D: quiz / example-card 迁移清单

### Task 5: 把 quiz-annotation 与 example-card 改成整块回写模型，并逐项清空旧链路

**Files:**
- Modify: `assets/quiz-annotation-runtime.js`
- Modify: `assets/example-card-runtime.js`
- Modify: `assets/editor-utils.js`
- Modify: `testing/tests/quiz-annotation-runtime.test.js`
- Modify: `testing/tests/example-card-runtime.test.js`
- Create: `testing/tests/helpers/deck-quiz-block-harness.js`
- Create: `testing/tests/helpers/deck-example-card-harness.js`

- [ ] **Step 1: 先补 quiz 失败测试，锁住“新增 / 删除批注一次刷新就生效”**

```js
+it('persists a newly created note after one refresh through block html snapshots', async () => {
+  const { window, qa, exportSnapshot, reloadFromSnapshot } = await createQuizBlockHarness();
+  await createDynamicNote(qa, '新批注');
+  const snapshot = await exportSnapshot();
+  const reloadWindow = await reloadFromSnapshot(snapshot);
+  assert.match(reloadWindow.document.querySelector('.quiz-annotation').innerHTML, /新批注/);
+});
```

- [ ] **Step 2: 再补 example-card 失败测试，锁住题干 / 选项 / 解析的块级持久化**

```js
+it('persists edited example-card option text through block html snapshots', async () => {
+  const { window, exportSnapshot, reloadFromSnapshot } = await createExampleCardBlockHarness();
+  window.document.querySelector('.qa-option-text').innerHTML = '新的选项文本';
+  await window.DeckDataAuthoring.saveBlockFromNode(window.document.querySelector('.qa-option-text'));
+  const snapshot = await exportSnapshot();
+  const reloadWindow = await reloadFromSnapshot(snapshot);
+  assert.match(reloadWindow.document.querySelector('.qa-option-text').innerHTML, /新的选项文本/);
+});
```

- [ ] **Step 3: 改 `quiz-annotation-runtime.js`，不仅改保存路径，还要删完整个旧 AnnotationStore 链**

必须同时完成：

1. 删除 `AnnotationStore.scheduleSave()` / `saveNow()` / `authorizeAndSave()` / `hasWriteAccess()` 路径。
2. 删除 `getAnnotationStoreElementHTML()` 和 `AnnotationStore.whenReady()` 初始化栅栏。
3. 删除旧 JSON 存档状态文案与首次授权分支。
4. 所有锚点、气泡正文、删除墓碑变化统一改为：

```js
+window.DeckDataAuthoring.scheduleBlockSaveFromNode(qa);
```

- [ ] **Step 4: 改 `example-card-runtime.js` 与 `editor-utils.js`，不仅改保存路径，还要删 localStorage / AnnotationStore 旧恢复链**

必须同时完成：

1. 清理 `readStoredEditableHTML()`、`getAnnotationStoreElementHTML()`、`scheduleAnnotationStoreHydration()` 旧文本恢复链。
2. 清理 `writeStoredAuthoringConfig()` 和对应 localStorage authoring config 路径，除非它被明确迁入 deck document schema；本计划第一版默认不迁，故直接删除并用 block 数据承载。
3. 保留 `.qa-option-text` 可编辑，但编辑态文本统一回写当前 example-card block。

- [ ] **Step 5: 运行 quiz / example-card 回归并提交**

Run:

```powershell
+Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime/testing'
+node --test tests/quiz-annotation-runtime.test.js tests/example-card-runtime.test.js tests/page-richtext-annotation-runtime.test.js
```

Expected: PASS，且“新增/删除批注需要刷新两次”类回归为 0，并且不再调用旧 `AnnotationStore` 路径。

Commit:

```powershell
+Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime'
+git add assets/quiz-annotation-runtime.js assets/example-card-runtime.js assets/editor-utils.js testing/tests/quiz-annotation-runtime.test.js testing/tests/example-card-runtime.test.js testing/tests/helpers/deck-quiz-block-harness.js testing/tests/helpers/deck-example-card-harness.js
+git commit -m "feat: migrate quiz and example-card to block snapshots"
```

---

## Phase E: 保存、skill 输出与示例课件

### Task 6: 增加左上角“保存到本地化文件”按钮与 JSON 导出链路

**Files:**
- Create: `assets/deck-save-runtime.js`
- Create: `testing/tests/deck-save-runtime.test.js`
- Create: `testing/tests/helpers/deck-save-harness.js`
- Modify: `assets/editor-core.js`
- Modify: `assets/editor.css`
- Modify: `assets/deck-shell.css`

- [ ] **Step 1: 先写保存按钮失败测试，锁住“导出的是当前 IndexedDB 快照，不是 DOM 即时拼接字符串”**

```js
+import { test } from 'node:test';
+import assert from 'node:assert/strict';
+import { createSaveHarness } from './helpers/deck-save-harness.js';
+
+test('save runtime exports current deck snapshot as json', async () => {
+  const runtime = await createSaveHarness({ deckId: 'demo', blockHtml: '<p>Saved</p>' });
+  const exported = await runtime.exportCurrentDeck();
+  assert.equal(exported.deckId, 'demo');
+  assert.match(JSON.stringify(exported), /Saved/);
+});
```

- [ ] **Step 2: 实现 `assets/deck-save-runtime.js`，只负责导出与文件句柄复用**

最小 API：

```js
+(function () {
+  'use strict';
+
+  async function exportCurrentDeck() {
+    const snapshot = await window.DeckDataAuthoring.exportCurrentDeck();
+    return snapshot;
+  }
+
+  async function saveDeckToFile() {
+    const snapshot = await exportCurrentDeck();
+    const json = JSON.stringify(snapshot, null, 2);
+  }
+
+  window.DeckSaveRuntime = { exportCurrentDeck, saveDeckToFile };
+})();
```

- [ ] **Step 3: 修改 `editor-core.js`，把保存按钮注入到左上角固定区域**

新增按钮 HTML：

```html
+<button type="button" class="deck-save-btn" aria-label="保存到本地化文件">保存到本地化文件</button>
```

绑定行为：

```js
+saveBtn.addEventListener('click', function () {
+  window.DeckSaveRuntime.saveDeckToFile();
+});
```

- [ ] **Step 4: 在 `editor.css` 与 `deck-shell.css` 里补保存按钮样式，不影响现有编辑开关**

按钮需满足：

1. 固定在左上角工具区。
2. 编辑模式与放映模式都可见。
3. 不使用“自动保存”文案，避免误解为实时写文件。

- [ ] **Step 5: 运行保存按钮测试并提交**

Run:

```powershell
+Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime/testing'
+node --test tests/deck-save-runtime.test.js tests/deck-data-authoring.test.js
```

Expected: PASS

Commit:

```powershell
+Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime'
+git add assets/deck-save-runtime.js assets/editor-core.js assets/editor.css assets/deck-shell.css testing/tests/deck-save-runtime.test.js testing/tests/helpers/deck-save-harness.js
+git commit -m "feat: add explicit json export button"
```

### Task 7: 改写 skill 输出机制，让新课件生成 HTML 壳 + JSON 数据文件

**Files:**
- Modify: `SKILL.md`
- Modify: `README.md`
- Modify: `QUICKSTART.md`
- Modify: `references/html-template.md`
- Modify: `references/component-templates.md`
- Create: `testing/tests/deck-skill-output.test.js`

- [ ] **Step 1: 先写输出契约失败测试，锁住生成产物不再包含旧 sidecar 路径**

```js
+import { test } from 'node:test';
+import assert from 'node:assert/strict';
+import fs from 'node:fs';
+
+test('html template references deck runtime entry and sibling deck json seed', () => {
+  const template = fs.readFileSync(new URL('../../references/html-template.md', import.meta.url), 'utf8');
+  assert.match(template, /deck-runtime-entry\.js/);
+  assert.match(template, /deck-manifest/);
+  assert.doesNotMatch(template, /annotation-store\.js/);
+});
```

- [ ] **Step 2: 修改 `SKILL.md`，把输出定义改成三件产物**

输出说明必须改成：

```text
+my-deck.html
+my-deck.deck.json
+assets/
```

并明确：

1. HTML 是壳。
2. JSON 存所有 slide / block 内容。
3. 新课件不再默认依赖 `annotation-store.js`。
4. 首版禁用 `custom-box`、`native mods`、`doodle`。

- [ ] **Step 3: 修改 `references/html-template.md` 与 `references/component-templates.md`**

要求：

1. 模板示例展示 shell + manifest + `deck-runtime-entry.js` 引用。
2. 组件模板示例明确：组件 HTML 现在写入 JSON block 的 `html` 字段，而不是直接内嵌到最终 HTML 成品。

- [ ] **Step 4: 修改 `README.md` 与 `QUICKSTART.md`，讲清首开导入与显式保存语义**

必须新增等价说明：

1. 首次打开时会从同目录 JSON 导入缓存。
2. 平时编辑只修改本地缓存。
3. 点击左上角按钮才会把当前状态写回 JSON 文件。
4. 首版新架构暂不支持 `custom-box`、`native mods`、`doodle`。

- [ ] **Step 5: 运行输出契约测试并提交**

Run:

```powershell
+Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime/testing'
+node --test tests/deck-skill-output.test.js
```

Expected: PASS

Commit:

```powershell
+Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime'
+git add SKILL.md README.md QUICKSTART.md references/html-template.md references/component-templates.md testing/tests/deck-skill-output.test.js
+git commit -m "docs: switch skill output to shell plus deck json"
```

### Task 8: 用新架构重生成示例课件并做整体验证

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
4. 首版不支持 `custom-box`、`native mods`、`doodle`。

- [ ] **Step 3: 跑全量自动化回归**

Run:

```powershell
+Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime/testing'
+node --test tests/deck-shell-contract.test.js tests/deck-bootstrap-spike.test.js tests/deck-runtime-entry.test.js tests/deck-data-schema.test.js tests/deck-data-store.test.js tests/deck-data-bootstrap.test.js tests/deck-data-renderer.test.js tests/deck-data-authoring.test.js tests/deck-history-contract.test.js tests/deck-save-runtime.test.js tests/deck-skill-output.test.js tests/page-richtext-annotation-runtime.test.js tests/quiz-annotation-runtime.test.js tests/example-card-runtime.test.js tests/slides-runtime.test.js
```

Expected: PASS

- [ ] **Step 4: 做两轮真实浏览器手测，并在通过后再收尾提交**

首轮手测清单：

1. 首开 shell 时能自动导入同目录 JSON，或给出明确导入降级提示。
2. render 完成后 editor 才可用，不能在空壳阶段 capture baseline。
3. 改正文后刷新一次即可恢复。

第二轮手测清单：

1. 新增批注后刷新一次即可恢复。
2. 删除批注后刷新一次仍保持删除态。
3. example-card 选项文本编辑后刷新一次即可恢复。
4. 点击左上角按钮能导出 JSON 文件。
5. 清空 IndexedDB 后，重新打开 HTML 仍能从 JSON 还原。

- [ ] **Step 5: 完成最终提交**

```powershell
+Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime'
+git add 高考英语阅读实战.html 高考英语阅读实战.deck.json 七选五理论论述.html 七选五理论论述.deck.json 开发者文档/答题与批注组件.md 开发者文档/例题组件.md
+git commit -m "feat: ship data-driven courseware runtime"
```

---

## 自检结果

### Spec coverage

1. HTML 壳只保留容器：Task 1、Task 2、Task 7、Task 8 覆盖。
2. JSON 外挂文件为真相源：Task 1、Task 3、Task 6、Task 7 覆盖。
3. 启动顺序被固定并前置验证：Task 1、Task 2 覆盖。
4. IndexedDB 作为最新状态缓存：Task 3、Task 4、Task 5 覆盖。
5. 撤销 / 重做基于运行时内存历史栈：Task 4 覆盖。
6. 左上角保存按钮：Task 6 覆盖。
7. 正文、批注、标注全部迁入新架构：Task 4、Task 5、Task 8 覆盖。
8. 旧持久化残留链路被显式迁移：Task 4、Task 5 覆盖。
9. 首版范围外能力被显式关停：固定契约、Task 4、Task 7、Task 8 覆盖。

### Placeholder scan

已消除上一版里“直接引用但未落地”的测试 helper 空洞；所有 `create*Harness()` 现在都进入文件地图和对应任务。仍然保留极少量函数体空壳，是为了表达任务骨架；这些函数体都已有对应测试和职责说明，不属于 `TODO` 式占位。

### Type consistency

计划统一使用以下命名：

1. `DeckRuntimeEntry`
2. `DeckDataSchema`
3. `DeckDataStore`
4. `DeckDataBootstrap`
5. `DeckDataRenderer`
6. `DeckDataAuthoring`
7. `DeckSaveRuntime`

后续实现中不要再引入同义但不同名的 API。
