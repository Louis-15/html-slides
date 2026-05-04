# Data-Driven Courseware Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 html-slides 从“HTML 内嵌正文内容 + localStorage / sidecar 混合持久化”重构为“HTML 壳 + 外挂 JSON 真相源 + IndexedDB 最新状态缓存 + 显式导出保存”的新架构，并同步改写 skill 输出机制。

**Architecture:** 新课件不再把正文、批注、标注直接写进 HTML，而是生成 `my-deck.html + my-deck.deck.json + assets/`。HTML 与 JSON 必须保持同主名绑定，例如 `foo.html` 对应 `foo.deck.json`，manifest 只允许指向同目录的对应 JSON。运行时增加 `deck-runtime-entry.js` 作为唯一启动总入口，按“读取 manifest -> bootstrap 种子/缓存 -> render block DOM -> 初始化 editor/quiz/example-card”顺序启动，避免空壳先被旧编辑器恢复链和 history 基线捕获。JSON 是可迁移真相源，IndexedDB 仅保存当前最新稳定状态；撤销/重做只来自运行时内存 history 栈；左下角 doodle 按钮右侧新增“保存 / 读取”两个并排按钮，其中“保存”显式把当前快照写回 JSON，“读取”默认从同目录同主名 JSON 读取，并在覆盖当前内容前要求用户二次确认。

**Tech Stack:** 原生 HTML / CSS / JavaScript、IndexedDB、File System Access API、Node.js `--test` + jsdom、既有 editor / quiz / example-card 运行时。

**执行约束补充：**
1. 不考虑兼容旧课件；旧示例文件允许在新架构完成后重新生成。
2. 块级数据化采用“块结构化 + 块内 HTML 片段保真”路线，不在第一版引入富文本 AST。
3. JSON 是可迁移真相源，IndexedDB 只是最新状态缓存；不允许把两者重新做成并行真相源。
4. 新架构首版不再依赖 `annotation-store.js` 参与日常运行时恢复；外挂文件只在首开导入与显式保存时参与。
5. 运行时新增文件继续采用浏览器全局脚本 + `window.*` 暴露模式，不切到 ESM；Node 测试统一走 jsdom + harness + `window.eval()`。
6. 必须在独立 worktree 分支中开发，禁止在当前主工作区直接大改运行时与 skill 文档。
7. 新架构首版显式禁用 `custom-box`、`native mods`；保留 doodle 按钮与现有涂鸦能力，但 doodle 数据存储不纳入本轮 JSON 真相源迁移，继续按现有独立链路工作。若未来要把 doodle 也并入统一数据模型，单独开新计划。

---

## 先解决的 8 个高风险点

在进入大迁移前，必须先把下面 8 件事钉死，否则实现阶段会高频返工：

1. **统一测试/实现模块约定**：运行时文件继续用浏览器全局脚本，测试不能再写成直接 `import { ... } from '../../assets/*.js'`。
2. **先打通“manifest -> seed/cached doc -> render #deck”闭环**：如果没有单独的 bootstrap / renderer 任务，实现者会在 `deck-runtime-entry.js` 里临时拼逻辑，最后出现“页面空白、根本没内容”的结果。
3. **固定启动顺序**：必须先 bootstrap + render + refresh slides/nav，再允许 `editor-core.js`、`quiz-annotation-runtime.js`、`example-card-runtime.js` 初始化。
4. **拆清 HTML 壳、播放器 chrome 与课件内容的边界**：`#progress`、`#slideNav`、`#counter`、`#particles` 属于播放器壳，不属于课件正文，不能跟正文一起剥离。
5. **把 `slides-runtime.js` 纳入主迁移面**：现有翻页、小圆点、页码、进度条都由它控制；如果不显式修改它去适配“空壳先加载、render 后补内容”，就会出现“只有首页、不能翻页”的共性故障。
6. **清理旧持久化残留链路**：不能只补新保存调用，却保留旧 `AnnotationStore` / localStorage 恢复逻辑继续抢状态源。
7. **保存前必须净化编辑态 DOM**：若 `saveBlockFromNode()` 直接写 `innerHTML`，`.editable-wrap`、`.box-controls`、`.rs-handle`、`contenteditable` 等编辑态临时结构会污染真相源，刷新后页面就会“卡在编辑模式”。
8. **补齐测试夹具并收缩首版范围**：`custom-box`、`native mods` 不属于本轮必须完成的“正文/批注/标注数据驱动化”，必须显式关停；`doodle` 保留现有能力但不纳入本轮存储迁移；缺少 harness 的任务不得进入实现。

---

## 固定契约

### 1. HTML 壳保留播放器 chrome + 空挂载根，不保留课件内容

HTML 保留的信息分为两层：

**播放器 chrome（永远留在壳里，不随课件变化）：**

1. 幻灯片导航 UI：`div#progress`、`div#slideNav`、`div#counter`、`div#particles`。
2. 挂载根与加载态：`div#deck`（空）、`.deck-loading-state`、`.deck-shell-toolbar`。
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

**课件内容（全部外挂到 JSON，HTML 壳里不允许出现）：**

1. 每个 slide 的 block HTML（标题、题干、批注、选项、解析等）。
2. speaker notes。
3. 任何因课件不同而变化的结构和文字。

> ⚠️ **Bug 1 教训：** 最初设计时把 `#progress`、`#counter` 等播放器 chrome 元素也当成课件内容删掉了，导致 `slides-runtime.js` 初始化时 `getElementById` 返回 null、导航系统瘫痪。判断标准：删掉它会崩溃的 → 播放器 chrome → 留在壳里；删掉它只是没内容显示的 → 课件内容 → 外挂 JSON。

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

### 3. HTML 与 JSON 的绑定命名规则

1. 每个 HTML 壳只允许对应一个同目录、同主名的 JSON 文件。
2. 命名规则固定为：`foo.html` 对应 `foo.deck.json`；这里的“同名”指主名 `foo` 必须一致。
3. `script.deck-manifest` 里的 `seedPath` 必须指向这个同目录同主名 JSON，不允许再指向跨目录或其他别名文件。
4. Task 8 产出模板与 Task 9 示例课件都必须遵守这条命名规则，避免生成物与运行时读取约定脱节。

### 4. JSON 与 IndexedDB 的关系

1. JSON 是可迁移真相源。
2. IndexedDB 只保存当前最新稳定状态，不保存历史版本链。
3. manifest 里的 `seedVersion` 与 IndexedDB 中缓存版本一致时，启动直接读 IndexedDB。
4. 版本不一致或缓存缺失时，bootstrap 才重新加载 JSON 并导入 IndexedDB。
5. 左下角工具区的“保存”按钮始终把当前 IndexedDB 快照写回同目录同主名 JSON 文件。
6. 左下角工具区的“读取”按钮默认读取同目录同主名 JSON，但只有在用户完成二次确认后才允许覆盖当前 IndexedDB 与当前页面内容。

### 5. 撤销 / 重做边界

1. `editor-history.js` 继续作为唯一历史管理器，负责记录当前会话中的 undo / redo 栈。
2. `DeckDataAuthoring` 每次保存 block 时，只把最新结果写入 IndexedDB，不负责维护历史版本链。
3. `historyMgr.undo()` / `redo()` 恢复 DOM 后，允许触发一次“把恢复后的最新状态重新写回 IndexedDB”的同步动作；但这个动作不能反过来生成新的 history 帧。
4. 禁止把 IndexedDB 设计成撤销仓库，不引入“从 IndexedDB 回放上一步快照”的实现路径。
5. 第一版不追求“刷新页面后还能撤销刷新前的每一步操作”；如果未来需要跨刷新编辑历史，必须单独设计操作日志层。

### 6. `file://` 首开导入策略

为避免纯 `file://` 下直接 `fetch()` JSON 不稳定，bootstrap 必须实现双路径：

1. `http(s)`：优先 `fetch(manifest.seedPath)`。
2. `file://`：优先尝试文本桥读取 manifest 指向的同目录同主名 JSON。
3. 如果 `file://` 文本桥失败，显示“导入本地 JSON 数据文件”降级入口，但不能静默失败。
4. 这条路径必须先通过技术尖刺验证，再允许进入正式迁移。
5. 必须把“首开可读”和“按钮可覆写”视为两种不同能力分别验证；能 bootstrap 读到 JSON，不等于浏览器已经具备同名 JSON 覆写能力。
6. `saveDeckToFile()` 首次成功覆写前，必须通过显式用户手势拿到可复用的写句柄或等价能力；若当前环境拿不到覆写能力，必须给出明确错误或降级提示。
7. `readDeckFromSeedFile()` 若无法直接读取 manifest 指向文件，也必须走显式降级路径；不能因为启动阶段曾成功导入过一次，就假定后续手动读取一定可用。

### 7. `seedVersion` 是缓存失效的强制信号

1. manifest / seed JSON 与 IndexedDB 的新旧判断只看 `seedVersion`。
2. 任何会影响初始渲染或已修复脏数据的改动，都必须同步 bump `seedVersion`。
3. 若不 bump 版本，即使代码修好了，浏览器仍可能继续命中旧缓存，导致用户误以为“修复无效”。

### 8. 启动顺序是强制契约

唯一允许的顺序是：

1. `deck-runtime-entry.js` 解析 manifest。
2. `deck-data-bootstrap.js` 决定走 IndexedDB 还是 seed JSON。
3. `deck-data-renderer.js` 把 slide / block 渲染到 `#deck`。
4. render 完成后，立即调用 `window.refreshSlidesNav()` 或等价入口，重新扫描 `.slide`、重建导航点、刷新页码与进度条。
5. slides/nav 就绪后，再显式调用 editor / quiz / example-card 初始化。
6. 任何旧模块都不允许在空壳阶段先执行恢复、初始化或 baseline 捕获。
7. 用户点击“读取”并确认覆盖后，也必须复用这同一条受控顺序；禁止在已有运行时上直接 `innerHTML = ...` 热替换 deck DOM。
8. 覆盖读取前必须先销毁当前交互运行时引用并清空当前 history baseline；覆盖完成后，再以新快照重建 editor / quiz / example-card。

### 9. `slides-runtime.js` 必须支持“空壳安全降级 + 渲染后重扫”

1. 现有 `slides-runtime.js` 在脚本加载时就会读取 `#progress`、`#counter`、`#slideNav`，并扫描 `.slide`。
2. 数据驱动模式下，脚本加载时 `#deck` 为空属于正常状态，因此 `slides-runtime.js` 不能把“此时没有 slide”当作异常。
3. 必须把 slide 列表和总数从一次性常量改为可刷新的运行时状态，例如 `let slides`、`let total`。
4. 必须新增 `refreshSlidesNav()` 或等价公开入口，在 renderer 完成后重建导航点、重绑当前 slide、更新 UI。
5. `total === 0` 时，所有依赖 slide 列表的初始化逻辑都必须安全跳过，而不是抛错或卡死在首页。

### 10. 真相源写回前必须剥离编辑态临时 DOM

1. `DeckDataAuthoring.saveBlockFromNode()` 不允许直接保存 `blockEl.innerHTML`。
2. 在写入 IndexedDB / JSON 前，必须先克隆 block 根节点并清理编辑器注入的 wrapper、控件、手柄、属性和临时 reveal 标记。
3. 第一版至少要剥离：`.editable-wrap`、`.box-controls`、`.rs-handle`、`contenteditable`、纯编辑态 `style.position = 'relative'`、`.qa-fragment-visible`、`data-fragment-manual-reveal`。
4. `custom-box` 不属于首版种子数据，若出现在清理副本中必须直接移除，不能被序列化回真相源。
5. 所有从 DOM 取 HTML 写回真相源的路径都必须复用同一个净化函数，禁止每个模块各写一版不一致的 strip 逻辑。
6. doodle 运行时生成的 `svg.doodle-layer`、`#doodleToolbar`、`#doodleToggleBtn`、`#doodleLaserPointer` 与相关状态类同样不得进入 JSON 真相源。

### 11. doodle 与 JSON 真相源必须严格隔离

1. doodle 继续沿用现有 `doodle-runtime.js`、localStorage 与 `.doodle` 导入/导出链路，不进入 `DeckDataStore`。
2. `saveDeckToFile()` 与 `readDeckFromSeedFile()` 只处理课件 JSON 快照，不得读写 `ds_doodles_*` 之类 doodle 存储键，也不得劫持 `.doodle` 导入/导出流程。
3. 覆盖读取 JSON 时，不得顺手执行 doodle 清空、导入或恢复逻辑；若为防止命中冲突需要暂时退出 doodle mode，也只能暂停交互态，不能删除现有涂鸦数据。
4. 用户如果需要处理涂鸦，继续使用现有 doodle 工具栏里的导入 / 导出 / 清空能力；JSON 保存/读取按钮不是 doodle 备份按钮。

---

## 文件地图

### 新增运行时文件

| 文件 | 责任 |
| --- | --- |
| `assets/deck-runtime-entry.js` | 新架构唯一启动入口，统一编排 bootstrap -> render -> slides refresh -> editor/quiz/example-card init |
| `assets/deck-data-schema.js` | 课件 JSON schema、manifest 解析、版本校验辅助 |
| `assets/deck-data-store.js` | IndexedDB 打开、最新快照读取、导入、更新、导出 |
| `assets/deck-data-bootstrap.js` | 首开导入桥，按 manifest 决定走缓存还是种子 JSON，并负责显式降级态 |
| `assets/deck-data-renderer.js` | 根据 JSON / IndexedDB 文档把 slide、header、block 渲染进 HTML 壳 |
| `assets/deck-data-authoring.js` | 作者态统一保存入口，负责 block HTML 净化与回写 |
| `assets/deck-save-runtime.js` | 左下角“保存 / 读取”按钮、同主名 JSON 写回、覆盖前确认、受控重启委托、后续文件句柄复用 |
| `assets/deck-shell.css` | HTML 壳级占位样式、加载态、空壳提示、保存/读取按钮样式 |

### 需要修改的现有运行时文件

| 文件 | 新职责 |
| --- | --- |
| `assets/slides-runtime.js` | 改为支持空壳安全降级、render 后 `refreshSlidesNav()` 重扫、导航圆点/页码/进度条重建 |
| `assets/editor-core.js` | 不再自行在空壳阶段恢复内容；改为受 `deck-runtime-entry.js` 控制初始化，并把“保存 / 读取”按钮注入到 `#doodleToggleBtn` 右侧 |
| `assets/editor-history.js` | 保持撤销/重做基于运行时内存历史栈，不让 IndexedDB 承担编辑历史仓库职责 |
| `assets/editor-persistence.js` | 从 localStorage 普通内容持久化层改为 `DeckDataAuthoring` 代理层；数据驱动模式下禁用旧 `boxes/nmods` 流程 |
| `assets/editor-rich-text.js` | 富文本标注改为写 block HTML 到 `DeckDataAuthoring`，不再写 sidecar / localStorage |
| `assets/page-richtext-annotation-runtime.js` | 保持 reveal 行为，但不再依赖旧 sidecar 恢复链 |
| `assets/quiz-annotation-runtime.js` | 删除 `AnnotationStore` 保存/恢复/授权链，结构变更与气泡正文统一回写当前 quiz block |
| `assets/example-card-runtime.js` | 删除 `AnnotationStore` / localStorage 文本水合与 authoring config 旧链，题干/选项/解析统一回写当前 example-card block |
| `assets/doodle-runtime.js` | 保持现有 `#doodleToggleBtn` / `#doodleToolbar` / `.doodle-layer` / `.doodle` 导入导出链路；与 JSON 保存/读取入口并存，但不并入真相源 |
| `assets/editor-utils.js` | 继续负责 example-card 可编辑候选，但不再为旧 localStorage/sidecar 恢复特殊兜底 |

### 测试辅助文件

这些 helper 必须先落地，再允许写业务测试：

| 文件 | 责任 |
| --- | --- |
| `testing/tests/helpers/deck-bootstrap-harness.js` | 构造 manifest + seed loader + fake IndexedDB 的 bootstrap 测试夹具 |
| `testing/tests/helpers/deck-renderer-harness.js` | 构造 shell DOM、seed 文档与 renderer 输出断言夹具 |
| `testing/tests/helpers/deck-authoring-harness.js` | 构造 block DOM、store、editor persistence 的普通块作者态夹具 |
| `testing/tests/helpers/deck-history-harness.js` | 构造 historyMgr + store + DOM 的撤销/重做契约夹具 |
| `testing/tests/helpers/deck-quiz-block-harness.js` | 构造 quiz block 迁移集成夹具 |
| `testing/tests/helpers/deck-example-card-harness.js` | 构造 example-card block 迁移集成夹具 |
| `testing/tests/helpers/deck-save-harness.js` | 构造保存/读取按钮、覆盖确认与文件句柄夹具 |
| `testing/tests/helpers/slides-runtime-harness.js` | 构造空壳 + render 后 slide 列表重扫的导航运行时夹具 |
| `testing/tests/helpers/deck-runtime-entry-harness.js` | 构造 shell -> bootstrap -> render -> init 顺序测试夹具 |

### 新增测试文件

| 文件 | 责任 |
| --- | --- |
| `testing/tests/deck-shell-contract.test.js` | HTML 壳不再内嵌正文内容 |
| `testing/tests/deck-bootstrap-spike.test.js` | 最高风险尖刺：`file://` 文本桥和 seed 导入策略 |
| `testing/tests/slides-runtime.test.js` | 空壳加载后经 `refreshSlidesNav()` 重新建立翻页、页码、导航圆点 |
| `testing/tests/deck-runtime-entry.test.js` | 启动顺序：先 render 后 init，禁止空壳先 baseline |
| `testing/tests/deck-data-schema.test.js` | schema 归一化、manifest 解析、版本规则 |
| `testing/tests/deck-data-store.test.js` | IndexedDB 导入、读取、更新、导出 |
| `testing/tests/deck-data-bootstrap.test.js` | bootstrap 命中逻辑与显式降级结果 |
| `testing/tests/deck-data-renderer.test.js` | shell -> slide -> block 渲染结果 |
| `testing/tests/deck-data-authoring.test.js` | 块回写、富文本保真、普通块保存、编辑态 DOM 净化 |
| `testing/tests/deck-history-contract.test.js` | 撤销/重做只依赖运行时内存历史栈，不从 IndexedDB 回放历史 |
| `testing/tests/deck-save-runtime.test.js` | 保存按钮、读取按钮、覆盖确认、JSON 写回/覆盖、受控重启与句柄复用 |
| `testing/tests/doodle-runtime-compat.test.js` | doodle 按钮/工具栏锚点、JSON 读取覆盖不污染 doodle 独立链路 |
| `testing/tests/deck-skill-output.test.js` | 新模板输出契约，不再依赖旧 sidecar |

### 首版明确不做的东西

1. `custom-box` 持久化。
2. 原生元素位移 / 隐藏状态 `nmods` 持久化。
3. `doodle` 数据并入统一 JSON 真相源。
4. 跨刷新完整撤销/重做历史。

其中 `doodle` 按钮与现有能力继续保留，但它的数据存储边界必须明确写成“暂不并入本轮 JSON 真相源”；其余未纳入首版的能力必须显式关停或隐藏，不允许处于“计划没写，但运行时可能还活着”的灰区。

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
+  assert.match(html, /id="progress"/);
+  assert.match(html, /id="slideNav"/);
+  assert.match(html, /doodle-runtime\.js/);
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
+  assert.deepEqual(harness.lifecycle, ['bootstrap:start', 'bootstrap:ready', 'render:start', 'render:done', 'slides:refresh', 'editor:init']);
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
+  <!-- 播放器 chrome：运行时脚本初始化时就需要这些元素 -->
+  <div class="progress-bar" id="progress"></div>
+  <div class="particles" id="particles"></div>
+  <div class="slide-nav" id="slideNav"></div>
+  <div class="slide-counter" id="counter"></div>
+  <div class="deck-shell-toolbar"></div>
+  <div class="deck-loading-state">正在加载课件数据...</div>
+  <!-- 课件内容挂载根：空的，由 renderer 从 JSON 渲染注入 -->
+  <div class="deck" id="deck"></div>
+  <script type="application/json" class="deck-manifest">{"deckId":"minimal-shell","schemaVersion":1,"seedVersion":"2026-05-03T10:00:00Z","seedPath":"./minimal-shell.deck.json"}</script>
+  <script src="../../assets/doodle-runtime.js"></script>
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

1. HTML 壳必须包含播放器 chrome 元素（`#progress`、`#particles`、`#slideNav`、`#counter`）和空挂载根（`#deck`）。这些是运行时脚本初始化阶段的依赖，不属于课件内容。
2. `script.deck-manifest` 只保存 deckId / schemaVersion / seedVersion / seedPath。
3. 顶部工具条保留保存按钮挂载位，不内嵌正文内容。
4. 模板必须继续保留 `doodle-runtime.js`，并维持 `#doodleToggleBtn` / `#doodleToolbar` 的现有左下角注入与避让约定，Task 7 的按钮直接挂在这个锚点右侧，不得另起一套新工具区。
5. 首版禁用 `custom-box`、`native mods`，并明确 `doodle` 保留现有能力但不纳入本轮 JSON 存储迁移的说明。

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
- Create: `testing/tests/slides-runtime.test.js`
- Create: `testing/tests/helpers/deck-runtime-entry-harness.js`
- Create: `testing/tests/helpers/slides-runtime-harness.js`
- Modify: `assets/slides-runtime.js`
- Modify: `assets/editor-core.js`
- Modify: `assets/quiz-annotation-runtime.js`
- Modify: `assets/example-card-runtime.js`

- [ ] **Step 1: 先写失败测试，锁住“render 完成前不允许初始化”，并补上导航运行时重扫契约**

在 `testing/tests/deck-runtime-entry.test.js` 写入：

```js
+import { test } from 'node:test';
+import assert from 'node:assert/strict';
+import { createRuntimeEntryHarness } from './helpers/deck-runtime-entry-harness.js';
+
+test('runtime entry renders deck before editor captures baseline', async () => {
+  const harness = await createRuntimeEntryHarness();
+  await harness.start();
+  assert.deepEqual(harness.lifecycle, ['bootstrap:start', 'bootstrap:ready', 'render:start', 'render:done', 'slides:refresh', 'editor:init', 'quiz:init', 'example-card:init']);
+  assert.equal(harness.emptyShellBaselineCaptured, false);
+});
+
+test('runtime entry restart rebuilds interactive state from a fresh baseline after confirmed read', async () => {
+  const harness = await createRuntimeEntryHarness();
+  await harness.start();
+  await harness.restartFromCurrentStore();
+  assert.deepEqual(harness.restartLifecycle, ['runtime:dispose', 'render:start', 'render:done', 'slides:refresh', 'editor:init', 'quiz:init', 'example-card:init']);
+  assert.equal(harness.historyReset, true);
+});
```

在 `testing/tests/slides-runtime.test.js` 写入：

```js
+import { test } from 'node:test';
+import assert from 'node:assert/strict';
+import { createSlidesRuntimeHarness } from './helpers/slides-runtime-harness.js';
+
+test('slides runtime rebuilds navigation and paging after renderer injects slides', async () => {
+  const harness = await createSlidesRuntimeHarness();
+  harness.renderSlides(3);
+  harness.window.refreshSlidesNav();
+  assert.equal(harness.document.querySelectorAll('.slide').length, 3);
+  assert.equal(harness.document.querySelectorAll('.slide-nav-dot').length, 3);
+  assert.match(harness.document.getElementById('counter').textContent, /1\s*\/\s*3/);
+});
+
+test('slides runtime safely stays idle when shell starts with zero slides', async () => {
+  const harness = await createSlidesRuntimeHarness();
+  assert.doesNotThrow(function () {
+    harness.window.refreshSlidesNav();
+  });
+  assert.equal(harness.document.querySelectorAll('.slide-nav-dot').length, 0);
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
+    const doc = boot.document || await boot.store.getDocument(boot.manifest.deckId);
+    window.DeckDataRenderer.renderDeck(document, doc);
+    if (typeof window.refreshSlidesNav === 'function') {
+      window.refreshSlidesNav();
+    }
+    initializeInteractiveRuntimes();
+    return boot;
+  }
+
+  async function restartDeckRuntime() {}
+
+  window.DeckRuntimeEntry = { startDeckRuntime, restartDeckRuntime };
+})();
```

要求补充：

1. `restartDeckRuntime()` 必须先释放旧 DOM 上挂着的 editor / quiz / example-card 引用、监听器与 history baseline，再从当前 store 快照重新 render。
2. Task 7 的“读取并确认覆盖”只能委托 `DeckRuntimeEntry.restartDeckRuntime()` 或等价入口完成，禁止在 `deck-save-runtime.js` 里私自复制一套启动流程。
3. 若当前正处于 doodle mode，重启前只允许暂时退出命中态或隐藏工具栏，不能删除现有 doodle 独立存储。

- [ ] **Step 3: 修改 `assets/editor-core.js`，把当前构造期自动恢复改成受控流程**

要求：

1. 数据驱动模式下，`EditorCore` 构造期不得直接执行 `restoreAllElements()`、`restoreNativeMods()`、`refreshEditables()`。
2. 这些动作改成 `editorCore.initializeAfterRender()` 之类的显式入口，由 `deck-runtime-entry.js` 在 render 完成后调用。
3. `loadCustomBoxes()` 在数据驱动模式下不执行。
4. 补中文注释，说明为什么空壳阶段不能先做 baseline 与 editable 候选收集。

- [ ] **Step 4: 修改 `assets/slides-runtime.js`，把当前“脚本加载时一次性扫描 slide 列表”的模型改成懒初始化**

要求：

1. 把 `const slides` / `const total` 改成可刷新的运行时状态，例如 `let slides` / `let total`。
2. 新增 `refreshSlidesNav()` 或等价公开入口，render 后重新扫描 `.slide`、重建圆点、刷新 `#progress` / `#counter`。
3. `total === 0` 时，`updateUI()`、`goTo()`、speaker notes、Chart 初始化、interaction queue 构建都必须安全降级，不得把空壳当作异常。
4. 补中文注释，明确说明数据驱动架构下“脚本先加载、内容后注入”是正常时序，不允许未来维护者再把它改回一次性初始化。

- [ ] **Step 5: 修改 `assets/quiz-annotation-runtime.js` 与 `assets/example-card-runtime.js` 的 auto-init 入口**

要求：

1. 数据驱动模式下不再等待 `AnnotationStore.whenReady()`。
2. 数据驱动模式下只响应 `DeckRuntimeEntry` 的渲染完成调用。
3. 旧模式入口暂时保留，直到新示例课件全部切换完成。

- [ ] **Step 6: 运行 runtime-entry 与 slides-runtime 测试并提交**

Run:

```powershell
+Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime/testing'
+node --test tests/deck-runtime-entry.test.js tests/slides-runtime.test.js
```

Expected: PASS

Commit:

```powershell
+Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime'
+git add assets/deck-runtime-entry.js assets/slides-runtime.js assets/editor-core.js assets/quiz-annotation-runtime.js assets/example-card-runtime.js testing/tests/deck-runtime-entry.test.js testing/tests/slides-runtime.test.js testing/tests/helpers/deck-runtime-entry-harness.js testing/tests/helpers/slides-runtime-harness.js
+git commit -m "feat: freeze runtime order and lazy-init slide navigation"
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

### Task 4: 新增 `deck-data-bootstrap.js` 与 `deck-data-renderer.js`，先打通内容载入与首屏渲染

**Files:**
- Create: `assets/deck-data-bootstrap.js`
- Create: `assets/deck-data-renderer.js`
- Create: `testing/tests/deck-data-bootstrap.test.js`
- Create: `testing/tests/deck-data-renderer.test.js`
- Create: `testing/tests/helpers/deck-renderer-harness.js`

- [ ] **Step 1: 先写 bootstrap 失败测试，锁住“首开必须能拿到 seed 文档或给出显式降级”**

```js
+import { test } from 'node:test';
+import assert from 'node:assert/strict';
+import { createBootstrapHarness } from './helpers/deck-bootstrap-harness.js';
+
+test('bootstrap imports seed into indexeddb when cache is missing', async () => {
+  const harness = await createBootstrapHarness({ protocol: 'https:' });
+  const result = await harness.bootstrap();
+  assert.equal(result.source, 'seed');
+  assert.equal(result.document.deckId, 'minimal-shell');
+});
+
+test('bootstrap surfaces manual import requirement instead of blank screen on file fallback miss', async () => {
+  const harness = await createBootstrapHarness({ protocol: 'file:', failTextBridge: true });
+  const result = await harness.bootstrap();
+  assert.equal(result.source, 'manual-import-required');
+  assert.match(result.message, /导入本地 JSON 数据文件/);
+});
```

- [ ] **Step 2: 再写 renderer 失败测试，锁住“render 后 `#deck` 里必须真的出现 slide/block DOM”**

```js
+import { test } from 'node:test';
+import assert from 'node:assert/strict';
+import { createDeckRendererHarness } from './helpers/deck-renderer-harness.js';
+
+test('renderer injects slides and blocks into empty deck host', async () => {
+  const harness = await createDeckRendererHarness();
+  harness.window.DeckDataRenderer.renderDeck(harness.document, harness.seedDocument);
+  assert.equal(harness.document.querySelectorAll('#deck .slide').length, 2);
+  assert.equal(harness.document.querySelectorAll('#deck [data-block-id]').length, 2);
+});
+
+test('renderer preserves shell chrome while replacing only deck host content', async () => {
+  const harness = await createDeckRendererHarness();
+  harness.window.DeckDataRenderer.renderDeck(harness.document, harness.seedDocument);
+  assert.ok(harness.document.getElementById('progress'));
+  assert.ok(harness.document.getElementById('slideNav'));
+  assert.ok(harness.document.getElementById('counter'));
+});
```

- [ ] **Step 3: 实现 `assets/deck-data-bootstrap.js`，负责缓存命中、seed 导入与显式降级态**

最小 API：

```js
+(function () {
+  'use strict';
+
+  async function bootstrapDeckRuntime() {}
+
+  window.DeckDataBootstrap = { bootstrapDeckRuntime };
+})();
```

要求：

1. 先解析 manifest，再比较 `seedVersion` 决定是否命中缓存。
2. 命中缓存时返回 `source: 'cache'`；重新导入 seed 时返回 `source: 'seed'`。
3. `file://` 文本桥失败时返回可渲染的降级信息，禁止静默失败成空白页面。
4. bootstrap 返回值里必须带 `manifest`、`store`、`document` 或等价字段，禁止让 `deck-runtime-entry.js` 自己重复 fetch / import 逻辑。

- [ ] **Step 4: 实现 `assets/deck-data-renderer.js`，负责把 deck document 显式渲染进 `#deck`**

最小 API：

```js
+(function () {
+  'use strict';
+
+  function renderDeck(doc, deckDocument) {}
+
+  window.DeckDataRenderer = { renderDeck };
+})();
```

要求：

1. `renderDeck()` 只替换 `#deck` 挂载根内容，不得碰 `#progress`、`#slideNav`、`#counter`、`#particles` 等播放器 chrome。
2. 每个 slide 必须渲染为现有运行时可识别的 `.slide` 结构，block 根必须带 `data-block-id`。
3. renderer 必须负责“当前页初始 active 态”与空 deck loading state 收口，避免首屏虽然有 DOM 但仍停留在加载态。
4. speaker notes、header、layout class 等课件结构必须在这里还原，不能留给 editor/quiz/example-card 去临时拼。

- [ ] **Step 5: 运行 bootstrap + renderer 测试并提交**

Run:

```powershell
+Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime/testing'
+node --test tests/deck-data-bootstrap.test.js tests/deck-data-renderer.test.js
```

Expected: PASS

Commit:

```powershell
+Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime'
+git add assets/deck-data-bootstrap.js assets/deck-data-renderer.js testing/tests/deck-data-bootstrap.test.js testing/tests/deck-data-renderer.test.js testing/tests/helpers/deck-renderer-harness.js
+git commit -m "feat: add deck bootstrap and renderer pipeline"
```

### Task 5: 用统一 authoring 桥接替换普通块的 localStorage / sidecar 保存

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

**执行顺序与边界：**

1. 本任务只负责普通块 authoring、history 边界、普通页 sidecar 触发链切换。
2. 在本任务完成前，不得修改 `assets/quiz-annotation-runtime.js`、`assets/example-card-runtime.js`、`assets/editor-utils.js`。
3. 推荐把本任务按 3 个连续切片推进：
  - 切片 A：`deck-data-authoring.js` 最小桥接 + 普通块失败测试。
  - 切片 B：`editor-history.js` / `editor-persistence.js` 入口切换。
  - 切片 C：普通页 `editor-rich-text.js` / `page-richtext-annotation-runtime.js` sidecar 触发链切换。
4. 只有本任务相关窄测试全绿后，才能进入 Task 6。

- [ ] **Step 1: 先写普通块 authoring 失败测试，并补一个“编辑态 DOM 不得污染快照”的失败测试**

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
+
+test('saveBlockFromNode strips editor-only wrapper dom before writing snapshot', async () => {
+  const harness = await createAuthoringHarness('<div data-block-id="b1"><div class="editable-wrap native-edit-wrap"><p data-edit-id="p1" contenteditable="true" style="position: relative;">New</p><div class="box-controls"></div><div class="rs-handle"></div></div></div>');
+  await harness.window.DeckDataAuthoring.saveBlockFromNode(harness.document.querySelector('[data-edit-id="p1"]'));
+  const snapshot = await harness.exportSnapshot();
+  assert.doesNotMatch(snapshot.slides[0].blocks[0].html, /editable-wrap|box-controls|rs-handle|contenteditable/);
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
+  function cleanBlockHtml(blockEl) {}
+  async function saveBlockFromNode(node) {}
+  function scheduleBlockSaveFromNode(node) {}
+  async function exportCurrentDeck() {}
+
+  window.DeckDataAuthoring = { cleanBlockHtml, saveBlockFromNode, scheduleBlockSaveFromNode, exportCurrentDeck };
+})();
```

要求：

1. `saveBlockFromNode(node)` 必须上溯到最近的 `data-block-id` 容器。
2. 回写时更新 JSON 文档中对应 block 的 `html` 字段。
3. 第一版只做 block 级整块序列化，不做局部 patch。
4. 必须抽出单一 `cleanBlockHtml(blockEl)` 或等价函数，在保存前统一剥离编辑态 wrapper、控件、手柄、属性和临时 reveal 标记。
5. 允许在撤销 / 重做恢复完成后把恢复后的最新 DOM 重新写回 IndexedDB，但不得在这个同步过程中新增 history 帧。
6. `saveBlockFromNode(node)` 的宿主边界只认 `data-block-id`，不认中间层的 `[data-edit-id]`、`.qa-note-bubble`、`.text-anchor`、`.example-card__question` 或按钮容器；quiz 与 example-card 仍然是“整块真相源”，不能被误切成子块保存。
7. `cleanBlockHtml(blockEl)` 必须支持组件级额外净化规则；至少要允许 quiz/example-card 在整块回写前剥离各自的运行时脏状态，而不是只清理普通页面的编辑器 wrapper。
8. 这一阶段只打通普通块最小闭环，不接入 quiz / example-card 专属 runtime；组件级净化只允许预留扩展口，不允许顺手把组件迁移并进来。

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
5. 这一阶段只做代理与旧入口关停，不扩大到 quiz / example-card 的宿主边界问题。

- [ ] **Step 6: 只改普通页 `editor-rich-text.js` 与 `page-richtext-annotation-runtime.js`，彻底切断旧 sidecar 触发**

把以下调用全部替换：

```js
+window.AnnotationStore.scheduleSave()
+window.AnnotationStore.saveNow()
```

替换为：

```js
+window.DeckDataAuthoring.scheduleBlockSaveFromNode(targetNode)
```

要求：

1. 只处理普通页路径，不动 quiz / example-card 组件专属 runtime。
2. 这一刀完成后，普通页路径不再写旧 `AnnotationStore` sidecar。
3. 如果这里出现“第一次刷新没变，第二次才对”，先回查普通页是否仍存在双写 / 双恢复链，不要提前跳去修改 renderer。

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

### Task 6: 把 quiz-annotation 与 example-card 改成整块回写模型，并逐项清空旧链路

**Files:**
- Modify: `assets/quiz-annotation-runtime.js`
- Modify: `assets/example-card-runtime.js`
- Modify: `assets/editor-utils.js`
- Modify: `testing/tests/quiz-annotation-runtime.test.js`
- Modify: `testing/tests/example-card-runtime.test.js`
- Create: `testing/tests/helpers/deck-quiz-block-harness.js`
- Create: `testing/tests/helpers/deck-example-card-harness.js`

**执行顺序与边界：**

1. 本任务必须严格按下面顺序串行推进：先 quiz 写路径，再 quiz 旧链拆除；再 example-card 整卡保存，再 example-card 旧链拆除；最后才允许动 `editor-utils.js`。
2. 不允许把 quiz 迁移和 example-card 迁移并成同一次大改，也不允许把 `editor-utils.js` 提前成第一刀。
3. 如果实际提交要合并，只能按相邻切片合并；不能跨 quiz / example-card / Task 7 乱并。
4. 只有本任务全量回归通过后，才能进入 Task 7 的“保存 / 读取”按钮链路。

- [ ] **Step 1: 先补 quiz 失败测试，锁住“新增 / 删除批注一次刷新就生效”**

```js
+it('persists a newly created note after one refresh through block html snapshots', async () => {
+  const { window, qa, exportSnapshot, reloadFromSnapshot } = await createQuizBlockHarness();
+  await createDynamicNote(qa, '新批注');
+  const snapshot = await exportSnapshot();
+  const reloadWindow = await reloadFromSnapshot(snapshot);
+  assert.match(reloadWindow.document.querySelector('.quiz-annotation').innerHTML, /新批注/);
+});
+
+it('quiz block snapshots strip runtime-only active classes, connectors and result marks', async () => {
+  const { window, qa, exportSnapshot } = await createQuizBlockHarness();
+  activateBubbleByLink(qa, 'note-1');
+  const snapshot = await exportSnapshot();
+  const html = snapshot.slides[0].blocks[0].html;
+  assert.doesNotMatch(html, /note-active|note-expanded|anchor-active|qa-connector-canvas|connector-step|connector-hover|qa-result-mark/);
+});
```

- [ ] **Step 2: 先只改 `quiz-annotation-runtime.js` 的写路径与快照净化，不拆旧初始化 / 授权链**

必须同时完成：

1. 所有锚点、气泡正文、删除墓碑变化统一先接到：

```js
+window.DeckDataAuthoring.scheduleBlockSaveFromNode(qa);
```

2. quiz 的保存宿主边界固定为当前 `.quiz-annotation` block；从 `.qa-note-content`、`.text-anchor`、`.answer-anchor` 触发保存时，不得只序列化局部 `[data-edit-id]` 根。
3. 整块回写前必须剥离 `.note-active`、`.note-expanded`、`.anchor-active`、`.qa-connector-canvas`、`.connector-step`、`.connector-hover`、`.qa-result-mark` 与同类纯运行时节点 / class。
4. 这一刀不删 `AnnotationStore.whenReady()`、授权状态文案与旧初始化栅栏；先把“写路径已切换且快照已净化”单独跑稳。

- [ ] **Step 3: 运行 quiz 窄回归并提交第一刀**

Run:

```powershell
+Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime/testing'
+node --test tests/quiz-annotation-runtime.test.js tests/deck-data-authoring.test.js
```

Expected: PASS，且“新增 / 删除批注一次刷新就生效”已经成立。

Commit:

```powershell
+Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime'
+git add assets/quiz-annotation-runtime.js testing/tests/quiz-annotation-runtime.test.js testing/tests/helpers/deck-quiz-block-harness.js
+git commit -m "feat: persist quiz mutations via block snapshots"
```

- [ ] **Step 4: 再拆 `quiz-annotation-runtime.js` 的旧 AnnotationStore 初始化 / 授权链**

必须同时完成：

1. 删除 `AnnotationStore.scheduleSave()` / `saveNow()` / `authorizeAndSave()` / `hasWriteAccess()` 路径。
2. 删除 `getAnnotationStoreElementHTML()` 和 `AnnotationStore.whenReady()` 初始化栅栏。
3. 删除旧 JSON 存档状态文案与首次授权分支。
4. 如果这一步出现“第一次刷新没变，第二次才对”，优先回查是否仍存在旧 localStorage / `AnnotationStore` 双恢复链，而不是先怀疑 renderer。

- [ ] **Step 5: 运行 quiz 全量回归并提交第二刀**

Run:

```powershell
+Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime/testing'
+node --test tests/quiz-annotation-runtime.test.js tests/page-richtext-annotation-runtime.test.js tests/deck-data-authoring.test.js
```

Expected: PASS，且不再调用旧 `AnnotationStore` 路径。

Commit:

```powershell
+Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime'
+git add assets/quiz-annotation-runtime.js testing/tests/quiz-annotation-runtime.test.js
+git commit -m "refactor: remove legacy annotation-store flow from quiz"
```

- [ ] **Step 6: 再补 example-card 失败测试，锁住题干 / 选项 / 解析的块级持久化**

```js
+it('persists edited example-card option text through block html snapshots', async () => {
+  const { window, exportSnapshot, reloadFromSnapshot } = await createExampleCardBlockHarness();
+  window.document.querySelector('.qa-option-text').innerHTML = '新的选项文本';
+  await window.DeckDataAuthoring.saveBlockFromNode(window.document.querySelector('.qa-option-text'));
+  const snapshot = await exportSnapshot();
+  const reloadWindow = await reloadFromSnapshot(snapshot);
+  assert.match(reloadWindow.document.querySelector('.qa-option-text').innerHTML, /新的选项文本/);
+});
+
+it('example-card saves the whole card block instead of only the active question subtree', async () => {
+  const { window, exportSnapshot } = await createExampleCardBlockHarness({ multiQuestion: true });
+  window.document.querySelector('.qa-option-text').innerHTML = '当前题新文案';
+  await window.DeckDataAuthoring.saveBlockFromNode(window.document.querySelector('.qa-option-text'));
+  const html = (await exportSnapshot()).slides[0].blocks[0].html;
+  assert.match(html, /当前题新文案/);
+  assert.match(html, /另一题原文/);
+});
+
+it('example-card snapshots strip runtime-only question gate and editor-only dom', async () => {
+  const { window, exportSnapshot, root } = await createExampleCardBlockHarness();
+  root.setAttribute('data-question-active', 'true');
+  root.setAttribute('data-question-submitted', 'true');
+  root.classList.add('is-submitted');
+  const snapshot = await exportSnapshot();
+  const html = snapshot.slides[0].blocks[0].html;
+  assert.doesNotMatch(html, /data-question-active|data-question-submitted|is-submitted|qa-result-mark|data-editor-only/);
+});
```

- [ ] **Step 7: 先只改 `example-card-runtime.js` 的整卡保存边界，不拆旧恢复链，也不提前动 `editor-utils.js`**

必须同时完成：

1. 保留 `.qa-option-text` 可编辑，但编辑态文本统一回写当前 example-card block。
2. example-card 的保存宿主边界固定为整张 `.example-card` block；不得因为当前正在编辑某一道题，就只序列化 `.example-card__question` 子树，否则多题卡片会在保存后丢掉未激活题目内容。
3. 这一刀先锁住“整卡保存”和“多题不丢内容”，不删 `readStoredEditableHTML()`、`getAnnotationStoreElementHTML()`、`scheduleAnnotationStoreHydration()`、`writeStoredAuthoringConfig()`。

- [ ] **Step 8: 运行 example-card 窄回归并提交第三刀**

Run:

```powershell
+Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime/testing'
+node --test tests/example-card-runtime.test.js tests/deck-data-authoring.test.js
```

Expected: PASS，且多题卡片保存后未激活题不丢。

Commit:

```powershell
+Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime'
+git add assets/example-card-runtime.js testing/tests/example-card-runtime.test.js testing/tests/helpers/deck-example-card-harness.js
+git commit -m "feat: persist example-card edits at card block level"
```

- [ ] **Step 9: 再拆 `example-card-runtime.js` 的旧恢复链，并把 `editor-utils.js` 留到最后只做边界修正**

必须同时完成：

1. 清理 `readStoredEditableHTML()`、`getAnnotationStoreElementHTML()`、`scheduleAnnotationStoreHydration()` 旧文本恢复链。
2. 清理 `writeStoredAuthoringConfig()` 和对应 localStorage authoring config 路径，除非它被明确迁入 deck document schema；本计划第一版默认不迁，故直接删除并用 block 数据承载。
3. `data-question-active`、`data-question-submitted`、`.is-submitted`、`.qa-result-mark` 以及 `data-editor-only` 生成的作者态控件都属于运行时 / 作者态门禁，不得写回 JSON 真相源；这些状态必须在 runtime init / submit / 切题时重新推导。
4. 普通页面 fragment host 对 example-card 的 reveal / hover 门禁继续只认 runtime 重新推导出的“当前激活且已提交题目”；不能依赖快照里残留的 question gate 属性。
5. 如果出现“切题后普通页 fragment 宿主错绑”，先查 question gate 是否残留在快照里，不要先改 `page-richtext-annotation-runtime.js` 的 host 选择算法。
6. `editor-utils.js` 只能在这一步最后收口 generic editable / 稳定 id 边界：`.example-card .qa-option-text` 仍可编辑，而 `.quiz-annotation .qa-option-text` 不得被 generic 恢复链抢权。

- [ ] **Step 10: 运行 Task 6 全量回归并提交**

Run:

```powershell
+Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime/testing'
+node --test tests/quiz-annotation-runtime.test.js tests/example-card-runtime.test.js tests/page-richtext-annotation-runtime.test.js tests/deck-data-authoring.test.js
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

### Task 7: 在左下角 doodle 按钮右侧增加“保存 / 读取”按钮，并完成 JSON 写回与覆盖读取链路

**Files:**
- Create: `assets/deck-save-runtime.js`
- Create: `testing/tests/deck-save-runtime.test.js`
- Create: `testing/tests/doodle-runtime-compat.test.js`
- Create: `testing/tests/helpers/deck-save-harness.js`
- Modify: `assets/editor-core.js`
- Modify: `assets/editor.css`
- Modify: `assets/deck-shell.css`

**进入前提：**

1. Task 5 与 Task 6 全量回归必须已经通过。
2. quiz / example-card 的宿主边界、旧恢复链拆除、`editor-utils.js` 边界修正必须已经稳定。
3. 本任务只负责把已经稳定的 block snapshot / controlled restart 能力挂到 UI，不允许回头再改 Task 5 / Task 6 的宿主归属。

- [ ] **Step 1: 先写保存/读取失败测试，锁住“保存写回最新快照，读取覆盖必须二次确认”**

```js
+import { test } from 'node:test';
+import assert from 'node:assert/strict';
+import { createSaveHarness } from './helpers/deck-save-harness.js';
+
+test('save runtime writes current deck snapshot to the sibling same-name json file', async () => {
+  const runtime = await createSaveHarness({ deckId: 'demo', blockHtml: '<p>Saved</p>' });
+  const result = await runtime.saveDeckToFile();
+  assert.equal(result.targetPath, './demo.deck.json');
+  assert.match(result.writtenJson, /Saved/);
+});
+
+test('read runtime asks for overwrite confirmation before replacing current deck state', async () => {
+  const runtime = await createSaveHarness({ deckId: 'demo', blockHtml: '<p>Before</p>' });
+  const result = await runtime.readDeckFromSeedFile();
+  assert.equal(result.confirmationRequired, true);
+  assert.equal(result.applied, false);
+});
+
+test('confirmed read rebuilds the deck through a controlled restart instead of hot-swapping current dom', async () => {
+  const runtime = await createSaveHarness({ deckId: 'demo', blockHtml: '<p>Before</p>' });
+  const result = await runtime.confirmReadAndApply();
+  assert.deepEqual(result.lifecycle, ['runtime:dispose', 'render:start', 'render:done', 'slides:refresh', 'editor:init', 'quiz:init', 'example-card:init']);
+  assert.equal(result.historyReset, true);
+});
+
+test('json save and read never mutate doodle sidecar state', async () => {
+  const runtime = await createSaveHarness({ deckId: 'demo', blockHtml: '<p>Before</p>', doodleStorageSeeded: true });
+  await runtime.saveDeckToFile();
+  await runtime.readDeckFromSeedFile();
+  assert.equal(runtime.doodleStorageWriteCount, 0);
+});
```

- [ ] **Step 2: 实现 `assets/deck-save-runtime.js`，负责同主名 JSON 写回、读取与覆盖确认**

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
+  async function readDeckFromSeedFile() {}
+
+  window.DeckSaveRuntime = { exportCurrentDeck, saveDeckToFile, readDeckFromSeedFile };
+})();
```

要求：

1. `saveDeckToFile()` 默认写回 manifest 指向的同目录同主名 JSON；不得让保存目标与当前 HTML 对应 JSON 脱钩。
2. `readDeckFromSeedFile()` 默认读取 manifest 指向的同目录同主名 JSON。
3. 读取后不得立刻覆盖，必须先弹出二次确认；只有用户明确确认，才允许替换 IndexedDB 当前快照并触发重新渲染。
4. 若用户取消覆盖，当前页面与 IndexedDB 状态必须完全保持不变。
5. 读取失败时必须给出显式错误提示，禁止静默失败。
6. 用户确认覆盖后，`deck-save-runtime.js` 只能调用 `DeckRuntimeEntry.restartDeckRuntime()` 或等价受控重启入口；禁止自己直接替换 `#deck` 内容。
7. 覆盖完成后必须把 history 栈重置到“新快照刚加载完成”的基线，不能保留旧内容的 undo / redo 帧。
8. JSON 保存/读取链路不得读写 doodle localStorage 或 `.doodle` 导入导出状态；doodle 继续完全走独立链路。

- [ ] **Step 3: 修改 `editor-core.js`，把“保存 / 读取”两个按钮注入到左下角 doodle 按钮右侧**

新增按钮 HTML：

```html
+<button type="button" class="deck-save-btn" aria-label="保存">保存</button>
+<button type="button" class="deck-load-btn" aria-label="读取">读取</button>
```

绑定行为：

```js
+saveBtn.addEventListener('click', function () {
+  window.DeckSaveRuntime.saveDeckToFile();
+});
+loadBtn.addEventListener('click', function () {
+  window.DeckSaveRuntime.readDeckFromSeedFile();
+});
```

要求：

1. 两个按钮必须并排放在左下角 doodle 按钮右侧，作为同一工具区的一部分。
2. 不得挪到左上角或顶部工具条，避免与用户现有操作习惯冲突。
3. doodle 按钮本身继续保留并可用，本轮只在它右侧扩展 JSON 保存/读取入口。

- [ ] **Step 4: 在 `editor.css` 与 `deck-shell.css` 里补保存/读取按钮样式，不影响现有编辑开关与 doodle 区域**

按钮需满足：

1. 固定在左下角 doodle 工具区右侧。
2. 编辑模式与放映模式都可见。
3. 不使用“自动保存”文案，避免误解为实时写文件。
4. 两个按钮必须明确区分主次态，避免把“读取”误解为“刷新页面”。

- [ ] **Step 5: 运行保存/读取按钮测试并提交**

Run:

```powershell
+Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime/testing'
+node --test tests/deck-save-runtime.test.js tests/doodle-runtime-compat.test.js tests/deck-data-authoring.test.js
```

Expected: PASS

Commit:

```powershell
+Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime'
+git add assets/deck-save-runtime.js assets/editor-core.js assets/editor.css assets/deck-shell.css testing/tests/deck-save-runtime.test.js testing/tests/doodle-runtime-compat.test.js testing/tests/helpers/deck-save-harness.js
+git commit -m "feat: add explicit json save and reload buttons"
```

### Task 8: 改写 skill 输出机制，让新课件生成 HTML 壳 + JSON 数据文件

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
+  assert.match(template, /foo\.html/);
+  assert.match(template, /foo\.deck\.json/);
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
4. 文件命名固定为 `foo.html` 对应 `foo.deck.json`，二者必须在同目录且主名一致。
5. 首版禁用 `custom-box`、`native mods`；`doodle` 保留现有能力，但其数据存储不纳入本轮 JSON 真相源迁移。

- [ ] **Step 3: 修改 `references/html-template.md` 与 `references/component-templates.md`**

要求：

1. 模板示例展示 shell + manifest + `deck-runtime-entry.js` 引用。
2. 组件模板示例明确：组件 HTML 现在写入 JSON block 的 `html` 字段，而不是直接内嵌到最终 HTML 成品。

- [ ] **Step 4: 修改 `README.md` 与 `QUICKSTART.md`，讲清首开导入与显式保存语义**

必须新增等价说明：

1. 首次打开时会从同目录 JSON 导入缓存。
2. 平时编辑只修改本地缓存。
3. 点击左下角 doodle 按钮右侧的“保存”按钮，才会把当前状态写回同目录同主名 JSON 文件。
4. 点击左下角 doodle 按钮右侧的“读取”按钮时，会先读取同目录同主名 JSON，并在覆盖前要求用户二次确认。
5. 首版新架构暂不支持 `custom-box`、`native mods`；`doodle` 保留现有能力，但其数据存储不纳入本轮 JSON 真相源迁移。
6. 读取确认后会走一次受控重启，避免旧 DOM 监听器、旧 history 帧和新内容混在一起。

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

### Task 9: 用新架构重生成示例课件并做整体验证

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
4. 示例文件命名必须满足 HTML 与 JSON 同主名绑定，例如 `高考英语阅读实战.html` 对应 `高考英语阅读实战.deck.json`。

- [ ] **Step 2: 补开发者文档，说明 quiz / example-card 在新架构里的保存语义**

必须明确：

1. 组件内容现在跟随 block JSON 走。
2. 日常编辑不会实时写同目录文件。
3. 显式点击左下角 doodle 按钮右侧的“保存”按钮才会把当前状态写回同目录同主名 JSON。
4. 点击“读取”按钮后，只有在用户二次确认覆盖后才会用同目录同主名 JSON 替换当前内容。
5. 首版不支持 `custom-box`、`native mods`；`doodle` 保留现有能力，但其数据存储不纳入本轮 JSON 真相源迁移。

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
4. 点击左下角“保存”按钮能把当前状态写回同目录同主名 JSON 文件。
5. 点击左下角“读取”按钮时，必须先看到覆盖确认；取消后内容不变，确认后才用 JSON 覆盖当前内容。
6. 清空 IndexedDB 后，重新打开 HTML 仍能从 JSON 还原。

- [ ] **Step 5: 完成最终提交**

```powershell
+Set-Location 'd:/Projects/html-slides/.worktrees/data-driven-courseware-runtime'
+git add 高考英语阅读实战.html 高考英语阅读实战.deck.json 七选五理论论述.html 七选五理论论述.deck.json 开发者文档/答题与批注组件.md 开发者文档/例题组件.md
+git commit -m "feat: ship data-driven courseware runtime"
```

---

## 实际实现中发现的 Bug 与修复记录

> 以下是在 Phase A–E 实现过程中实际遇到的 Bug，以及对应的根因分析和修复方案。这些问题在计划制定阶段未预见，但必须在计划文档中记录，以防后续迭代重犯同样错误。

### Bug 1: HTML 壳剥离过度——把播放器 chrome 也当成课件内容删掉了

**现象：** 数据驱动 HTML 打开后只能看到首页内容，无法通过键盘/滚轮翻到其他幻灯片。导航点、进度条、页码全部不显示。

**认知错误：** 在设计数据驱动架构时，对"HTML 壳里应该留什么"的判断出了偏差。把原 HTML 中**所有非脚本、非 CSS 的元素**都当成了"课件内容"全部剥离，只留下了 `<div id="deck">` 和加载状态提示。但实际上，原 HTML 中的 DOM 元素分为两层，不应该等同处理：

**第一层：播放器 chrome（player chrome）——不属于课件内容，但运行时脚本必须依赖的结构性 UI 元素。** 这些元素**不论课件内容是什么都永远存在**，和 `#deck` 一样属于壳本身：

| 元素 | 作用 | 运行时依赖 |
|---|---|---|
| `#progress` | 幻灯片进度条 | `slides-runtime.js` 初始化时 `getElementById` |
| `#counter` | 页码计数 "1/6" | `slides-runtime.js` 初始化时 `getElementById` |
| `#slideNav` | 导航点容器 | `slides-runtime.js` 初始化时 `getElementById`，并在 `goTo()` 中动态更新 |
| `#particles` | 背景粒子容器 | `slides-runtime.js` 初始化时创建粒子元素放入其中 |
| `.edit-hotzone` | 编辑模式触区 | `editor-core.js` 初始化时动态创建（需 body 已就绪） |
| `#editToggle` | 编辑按钮 | `editor-core.js` 初始化时动态创建 |
| `#richToolbar` | 富文本工具栏 | `editor-core.js` 初始化时动态创建 |

**第二层：课件内容（courseware content）——每个课件不同、需要可编辑、数据驱动化要外挂到 JSON 的东西：**

| 内容 | 应该外挂到 JSON |
|---|---|
| 每个 slide 的 block HTML | 是 |
| 标题文字、题干、选项、解析 | 是 |
| 批注气泡、锚点 | 是 |
| speaker notes | 是 |
| 例题卡片内容 | 是 |

**根因链：**

1. 第一步，把原 HTML 壳中 `#progress`、`#counter`、`#slideNav`、`#particles` 这些播放器 chrome 元素连同课件内容一起删掉了。
2. 第二步，`slides-runtime.js` 在脚本加载时 `getElementById` 获取这些元素，结果全是 `null`——导航点无法创建、进度条无法更新、页码无法显示。
3. 第三步，`slides-runtime.js` 在脚本加载时 `querySelectorAll('.slide')` 扫描幻灯片，但此时 `#deck` 还是空的（数据还没加载和渲染），所以 `slides` 是空 NodeList、`total = 0`，导航系统意味着总页数为 0，`goTo()` 任何索引都会被 `if (index < 0 || index >= total) return` 拦截。
4. 数据驱动渲染完成后，6 个 `.slide` 元素被注入 `#deck`，第一个加上 `.active` 所以能短暂看到首页，但导航系统仍然基于旧的空列表，无法翻页。

**修复：**

1. **HTML 壳必须保留播放器 chrome 元素。** 数据驱动的 HTML 壳不是越空越好，它仍然是一个完整的幻灯片播放器壳，只是课件内容从 HTML 硬编码变成了 JSON 外挂。壳里必须保留所有运行时脚本在初始化阶段就需要访问的结构性 UI 元素：

```html
<!-- 播放器 chrome：运行时脚本初始化时就要访问，必须留在壳里 -->
<div class="progress-bar" id="progress"></div>
<div class="particles" id="particles"></div>
<div class="slide-nav" id="slideNav"></div>
<div class="slide-counter" id="counter"></div>
<div class="deck-shell-toolbar"></div>
<div class="deck-loading-state">正在加载课件数据...</div>

<!-- 课件内容挂载根：空的，由 renderer 从 JSON 渲染注入 -->
<div class="deck" id="deck"></div>
```

2. **`slides-runtime.js`：幻灯片列表改为懒初始化。** 把 `const slides` / `const total` 改为 `let slides` / `let total`；新增 `refreshSlidesNav()` 函数，在数据驱动渲染完成后重新扫描 `.slide` 元素、重建导航点、刷新 UI；挂到 `window.refreshSlidesNav`。这是因为数据驱动架构下，脚本加载时 `#deck` 是空的，幻灯片列表要到 `renderDeck()` 完成后才存在。

```js
let slides = document.querySelectorAll('.slide');
let total = slides.length;

function refreshSlides() {
  slides = document.querySelectorAll('.slide');
  total = slides.length;
  // 重新扫描 Zone 变体、steppable 组件
  // 重建导航点、确保当前 slide 有 active 类
  rebuildNavDots();
  updateUI();
  showSpeakerNotes(current);
  buildInteractionQueue(current);
}
window.refreshSlidesNav = refreshSlides;
```

3. **`slides-runtime.js` 初始化安全守卫：** 在 `total === 0` 时跳过所有依赖非空 slide 列表的初始化步骤，包括 `updateUI()`、`buildInteractionQueue()`、`finishSlideAnimationsForEditorMode()`、Chart 初始化、speaker notes 初始化。这些步骤会在 `refreshSlidesNav()` 被调用时补上。

4. **`deck-runtime-entry.js`：** 在 `renderDeck()` 后立即调用 `window.refreshSlidesNav()`，触发导航系统的完整初始化。

**设计原则总结：** HTML 壳的职责边界是"播放器 chrome"（永远存在、不随课件变化）和"课件内容挂载根"（空容器，等渲染器从 JSON 填充）。判断一个元素归属哪一层的标准是：**如果删掉它，运行时脚本在初始化阶段就会崩溃或找不到依赖，那它就是播放器 chrome，必须留在壳里。**

### Bug 2: 编辑模式临时 DOM 污染 IndexedDB 数据导致刷新后页面"卡在编辑模式"

**现象：** 用户在第 N 页编辑一次内容后退出编辑模式，刷新页面，翻到第 N 页时看到的内容仍然带有编辑模式的视觉效果（`.editable-wrap` 边框、📍✖ 控件条、缩放手柄等），但实际上并未进入编辑模式（按 E 键不会退出，因为这些是残留的 DOM 元素而非真正的编辑状态）。

**和 Bug 1 的区别：** Bug 1 是 HTML 壳剥离过度导致**播放器 chrome** 缺失，问题在壳侧；Bug 2 是**保存侧**把运行时临时 DOM 序列化进了数据源，问题在 `DeckDataAuthoring` 和 `BoxManager` 的交互边界。

**根因分析：** 数据驱动架构中，课件内容的真相源链路是：

```
用户编辑 DOM → saveBlockFromNode() → IndexedDB block.html → 下次 renderDeck() 读取并渲染
```

问题出在 `saveBlockFromNode()` 直接使用 `blockEl.innerHTML` 取内容。但编辑模式下，`BoxManager._injectControls()` 会向每个可编辑元素注入以下运行时临时 DOM：

| 注入内容 | 作用 | 是否属于课件数据 |
|---|---|---|
| `.editable-wrap.native-edit-wrap` | 包裹可编辑元素的 wrapper 壳 | **否**，编辑态 UI |
| `.box-controls`（📍✖ 按钮） | 拖拽/删除控件 | **否**，编辑态 UI |
| `.rs-handle`（八爪鱼缩放点） | 缩放手柄 | **否**，编辑态 UI |
| `contenteditable="true"` | 使元素可编辑 | **否**，编辑态属性 |
| `style="position: relative"` | BoxManager 给元素加的定位 | **否**，编辑态样式 |

这些临时 DOM 是**播放器运行时状态**，不是**课件内容数据**，绝对不应该被持久化到 IndexedDB。但 `innerHTML` 把它们一股脑序列化了进去。下次刷新时渲染器从 IndexedDB 读到的 HTML 自带这些编辑态标记，直接渲染出来就"看起来像编辑模式"。

这和旧架构不会遇到这个问题形成对比：旧架构用 `localStorage` 保存，`PersistenceLayer.saveElement()` 调用 `stripTransientEditableHTML()` 做了净化，但数据驱动架构的 `saveBlockFromNode()` 是新写的代码路径，没有做同样的净化。

**修复：**

1. **`deck-data-authoring.js`：在保存前净化 block HTML。** 新增 `cleanBlockHtml(blockEl)` 函数，克隆 block 元素后移除所有编辑态临时 DOM，只返回干净的课件内容 HTML：

```js
function cleanBlockHtml(blockEl) {
  var clone = blockEl.cloneNode(true);

  // 1. 解包 .editable-wrap：用其子节点替换 wrapper 本身
  clone.querySelectorAll('.editable-wrap').forEach(function (wrap) {
    if (wrap.classList.contains('custom-box')) {
      wrap.remove();  // 自定义图元不属于种子数据
      return;
    }
    var parent = wrap.parentNode;
    if (!parent) return;
    while (wrap.firstChild) {
      parent.insertBefore(wrap.firstChild, wrap);
    }
    parent.removeChild(wrap);
  });

  // 2. 删除编辑控件和缩放手柄
  clone.querySelectorAll('.box-controls, .rs-handle').forEach(function (el) {
    el.remove();
  });

  // 3. 移除 contenteditable 属性
  clone.querySelectorAll('[contenteditable]').forEach(function (el) {
    el.removeAttribute('contenteditable');
  });

  // 4. 移除编辑模式注入的 style="position: relative"
  clone.querySelectorAll('[style*="position"]').forEach(function (el) {
    if (el.style.position === 'relative') {
      el.style.removeProperty('position');
      if (!el.style.cssText.trim()) el.removeAttribute('style');
    }
  });

  // 5. 清理批注运行时的手动揭示标记
  clone.querySelectorAll('.qa-fragment-visible').forEach(function (el) {
    el.classList.remove('qa-fragment-visible');
  });
  clone.querySelectorAll('[data-fragment-manual-reveal]').forEach(function (el) {
    el.removeAttribute('data-fragment-manual-reveal');
  });

  return clone.innerHTML;
}
```

2. 将 `saveBlockFromNode()` 中的 `var blockHtml = blockEl.innerHTML` 替换为 `var blockHtml = cleanBlockHtml(blockEl)`。

3. **设计原则：任何从 DOM 取 HTML 写入真相源的代码路径，都必须先做净化。** 旧架构的 `stripTransientEditableHTML()` 只清理了 fragment 相关的类，没有覆盖编辑模式的 wrapper/控件/属性。新的 `cleanBlockHtml()` 是数据驱动架构下的完整净化函数，两者覆盖范围不同但职责相同：**真相源里只存课件数据，不存运行时状态。**

4. **每次修复数据污染 Bug 后必须更新 `seedVersion` 时间戳。** 浏览器的 bootstrap 逻辑通过比较 manifest 中的 `seedVersion` 和 IndexedDB 缓存的版本来决定是否重新导入。如果只修了代码但没更新版本号，浏览器会命中旧缓存而不重新导入，被污染的数据仍然存在。

### 教训总结

1. **HTML 壳的职责是"播放器 chrome + 空挂载根"，不是"越空越好"。** 剥离课件内容到 JSON 时，必须区分两层：播放器 chrome（`#progress`、`#counter`、`#slideNav`、`#particles` 等）永远留在壳里，因为运行时脚本在初始化阶段就需要它们；课件内容（slide、block、标题、题干等）才外挂到 JSON。判断标准：删掉它会崩溃的 → 播放器 chrome → 留在壳里；删掉它只是没内容显示的 → 课件内容 → 外挂 JSON。

2. **真相源里只存课件数据，不存运行时状态。** `innerHTML` 会把编辑模式注入的 wrapper、控件、属性全部序列化。数据驱动架构中每条写入 IndexedDB/JSON 的代码路径（`saveBlockFromNode`、`scheduleBlockSaveFromNode`、`exportCurrentDeck`）都必须在保存前做净化，剥离编辑态临时 DOM。旧架构的 `stripTransientEditableHTML()` 覆盖不全，新的 `cleanBlockHtml()` 是完整替代。

3. **数据驱动架构下，运行时脚本的初始化必须分两阶段：空壳阶段安全降级 + 渲染后完整初始化。** `slides-runtime.js` 在脚本加载时 `querySelectorAll('.slide')` 为空是正常的——数据还没渲染。必须允许 `total === 0` 时安全跳过，等 `refreshSlidesNav()` 被调用再完成完整初始化。同理，所有在空壳阶段依赖非空 DOM 的逻辑都需要守卫。

4. **`const` vs `let` 在闭包中引用可变状态的问题。** `slides-runtime.js` 中 `const slides = document.querySelectorAll('.slide')` 在数据驱动模式下为空 NodeList，后续渲染完的 slide 不会自动更新这个引用。改为 `let` 并在 `refreshSlidesNav()` 中重新赋值。

5. **seedVersion 是数据驱动架构的关键过期机制。** 任何时候修复了数据污染或渲染 Bug，都必须同步更新 manifest 和 seed.js 里的 `seedVersion`，否则浏览器会命中旧缓存而不重新导入。版本号是 IndexedDB 缓存过期的唯一信号。

---

## 自检结果

### Spec coverage

1. HTML 壳保留播放器 chrome + 空挂载根（不是越空越好）：Task 1、Task 2、Task 8、Task 9 覆盖；Bug 1 记录了因过度剥离导致的问题与修复。
2. JSON 外挂文件为真相源：Task 1、Task 3、Task 4、Task 8 覆盖。
3. 启动顺序被固定并前置验证：Task 1、Task 2 覆盖。
4. IndexedDB 作为最新状态缓存：Task 3、Task 4、Task 5 覆盖。
5. 撤销 / 重做基于运行时内存历史栈：Task 5 覆盖。
6. 左下角 doodle 右侧的保存/读取按钮：Task 7 覆盖。
7. 正文、批注、标注全部迁入新架构：Task 4、Task 5、Task 6、Task 9 覆盖。
8. 旧持久化残留链路被显式迁移：Task 5、Task 6 覆盖。
9. 首版范围外能力与保留边界被显式写清：固定契约、Task 5、Task 8、Task 9 覆盖。
10. HTML 与 JSON 的同主名绑定被写成契约并进入输出测试：固定契约、Task 1、Task 8、Task 9 覆盖。
11. 手动“读取并覆盖”被锁成一次受控重启，而不是局部 DOM 热替换：固定契约、Task 2、Task 7、Task 9 覆盖。
12. doodle 保持独立链路，JSON 保存/读取不得污染其存储或导入导出流程：固定契约、Task 7、Task 8、Task 9 覆盖。

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
