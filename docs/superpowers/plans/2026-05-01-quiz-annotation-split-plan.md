# Quiz Annotation Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将答题与批注组件从当前“大型集中式文件”重构为“共享核心 + 题型适配 + 作者态 + 持久化边界”结构，在不改变既有 HTML 公开入口和运行时行为的前提下，显著降低单文件复杂度。

**Architecture:** 采用“兼容壳 + 组件私有目录”的渐进式拆分方案。保留 `assets/quiz-annotation-runtime.js`、`assets/quiz-annotation-audio.js`、`assets/zones/zone2-quiz-annotation.css` 作为公开入口与兼容壳；新增 `assets/quiz-annotation/` 私有目录，把共享核心、批注子系统、作者态子系统、四类题型适配层以及 sidecar 持久化适配层拆开。第一阶段先稳定外部加载契约，第二阶段再逐步拆题型、测试与 CSS，避免一次性重构导致 HTML 模板、文档与 `file://` 课件全部同时回归。

**Tech Stack:** 原生 HTML / CSS / JavaScript、既有 `registerStepStrategy()` 步进系统、`annotation-store.js` sidecar 体系、Node.js `--test` + jsdom。

**执行约束补充：**
1. 当前仓库是零构建、零依赖运行时，拆分后仍必须保持“浏览器直接加载脚本即可运行”的契约。
2. 运行时与复杂分支必须补充详细中文注释，尤其要解释模块边界、状态归属与兼容保留行为。
3. 不允许先删旧入口、后补兼容；必须反过来先建立兼容壳，再迁移内部实现。
4. CSS 不与 JS 同轮做大规模结构迁移；先拆 JS，再拆 CSS。

---

## 文件地图

### 保留为公开入口的现有文件

- `assets/quiz-annotation-runtime.js`
- `assets/quiz-annotation-audio.js`
- `assets/zones/zone2-quiz-annotation.css`

### 新增组件私有目录

- `assets/quiz-annotation/index.js`
- `assets/quiz-annotation/core/`
- `assets/quiz-annotation/annotation/`
- `assets/quiz-annotation/authoring/`
- `assets/quiz-annotation/types/`
- `assets/quiz-annotation/store/`

### 建议的目标文件结构

| 文件 | 责任 |
|------|------|
| `assets/quiz-annotation/index.js` | 组件统一装配入口，串起初始化顺序与对外暴露的公共 API |
| `assets/quiz-annotation/core/constants.js` | 题型枚举、选择器、事件名、公共常量 |
| `assets/quiz-annotation/core/state.js` | 组件级状态仓，统一管理每个 `.quiz-annotation` 实例状态 |
| `assets/quiz-annotation/core/dom.js` | DOM 查询、实例定位、公共节点获取 |
| `assets/quiz-annotation/core/step-strategy.js` | `registerStepStrategy()` 接入与批注步进控制 |
| `assets/quiz-annotation/core/layout.js` | 面板展开收起、分割线按钮、阅读类型解析、共享 UI 状态切换 |
| `assets/quiz-annotation/core/connectors.js` | SVG 连线、边缘钉定、滚动重绘 |
| `assets/quiz-annotation/annotation/anchors.js` | 左右锚点解析、linkId 对齐、角标同步 |
| `assets/quiz-annotation/annotation/bubbles.js` | 批注气泡初始化、激活态、折叠态、hover 行为 |
| `assets/quiz-annotation/annotation/sorting.js` | 批注气泡拖拽排序、按正文顺序回正、步进号重算 |
| `assets/quiz-annotation/annotation/fragments.js` | 锚点内 fragment 步进、hover 高亮、相关音效入口 |
| `assets/quiz-annotation/authoring/selection-toolbar.js` | 新建/关联批注的下划线调色面板 |
| `assets/quiz-annotation/authoring/fragment-toolbar.js` | 锚点内部富文本工具条 |
| `assets/quiz-annotation/authoring/linking.js` | 关联左侧/右侧模式的进入、退出与选区落点 |
| `assets/quiz-annotation/types/single.js` | 阅读单选题初始化、选择、提交与回显 |
| `assets/quiz-annotation/types/matching.js` | 阅读七选五拖拽与判分 |
| `assets/quiz-annotation/types/blank.js` | 阅读填空的学生态、作者态、正确答案同步与恢复 |
| `assets/quiz-annotation/types/analysis.js` | 文章解析页的无题目模式与中栏/左栏联动 |
| `assets/quiz-annotation/store/payload.js` | quiz 专属 sidecar 数据提取、恢复与序列化 |
| `assets/quiz-annotation/store/bridge.js` | `annotation-store.js` 与 quiz 私有 store 适配层 |

### 测试目标结构

- `testing/tests/quiz-annotation/core.test.js`
- `testing/tests/quiz-annotation/annotation.test.js`
- `testing/tests/quiz-annotation/authoring.test.js`
- `testing/tests/quiz-annotation/types-single.test.js`
- `testing/tests/quiz-annotation/types-matching.test.js`
- `testing/tests/quiz-annotation/types-blank.test.js`
- `testing/tests/quiz-annotation/types-analysis.test.js`
- `testing/tests/annotation-store.test.js` 按需补充 quiz store bridge 回归

### 本轮明确不做的事情

1. 不改变课件 HTML 里的现有脚本标签名称与默认加载顺序。
2. 不引入 ES Module、打包器或任何 npm 构建步骤。
3. 不重写现有交互合同，只做职责切分与边界收敛。
4. 不在第一阶段同步重构所有 CSS 选择器命名。

---

## 第一阶段：运行时、题型、作者态与持久化边界拆分

本阶段只处理 JS、测试、sidecar 边界与组件私有目录，不进入 CSS 结构重排。

### Task 1: 冻结公开契约，先补“拆分保护网”

**Files:**
- Modify: `testing/tests/quiz-annotation-runtime.test.js`
- Modify: `testing/tests/annotation-store.test.js`
- Modify: `开发者文档/答题与批注组件.md`

- [ ] **Step 1: 先在文档里补一段“公开入口保持不变”的约束说明**

在 `开发者文档/答题与批注组件.md` 新增一段架构注记，明确以下事实：

1. 课件 HTML 仍继续加载 `assets/quiz-annotation-runtime.js`。
2. 未来拆分后的私有目录不属于模板作者直接引用面。
3. `annotation-store.js` 仍是 sidecar 总线入口，但 quiz 专属逻辑会迁到私有适配层。

- [ ] **Step 2: 给现有大测试文件补一组“公开入口行为守卫测试”**

在 `testing/tests/quiz-annotation-runtime.test.js` 追加最小守卫测试，锁住下列不允许回归的行为：

1. `window.initQuizAnnotation` 仍然存在并可初始化单个实例。
2. `window.registerStepStrategy('annotation', ...)` 的语义不变。
3. 阅读类型解析仍能得到 `single / matching / blank / analysis` 四类结果。
4. 阅读填空编辑态仍优先走“本地缓存优先，sidecar 兜底”的恢复顺序。

- [ ] **Step 3: 给 `annotation-store` 补 quiz 桥接守卫测试**

在 `testing/tests/annotation-store.test.js` 增加最小回归，锁住以下边界：

1. `qa-blank-slot[data-correct-answer]` 仍会进入 quiz payload。
2. 动态批注气泡与 blank 正确答案仍能从 sidecar 回放。
3. 非 quiz 页面仍不会被 quiz 清理逻辑误伤。

- [ ] **Step 4: 先跑一次现有回归，确保“保护网”是绿色基线**

Run: `Set-Location 'd:/Projects/html-slides/testing'; node --test tests/quiz-annotation-runtime.test.js tests/annotation-store.test.js`

Expected: PASS，且失败原因不能来自新目录尚未创建，因为这一任务只是在现状上补保护网。

---

### Task 2: 建立组件私有目录与兼容壳

**Files:**
- Create: `assets/quiz-annotation/index.js`
- Create: `assets/quiz-annotation/core/constants.js`
- Modify: `assets/quiz-annotation-runtime.js`
- Modify: `assets/quiz-annotation-audio.js`

- [ ] **Step 1: 新建 `assets/quiz-annotation/` 私有目录，但先只放最小骨架**

第一批目录只创建：`core/`、`annotation/`、`authoring/`、`types/`、`store/`。每个目录先放一个带详细中文头注释的占位文件，写清楚未来责任边界。

- [ ] **Step 2: 把 `assets/quiz-annotation-runtime.js` 缩成兼容壳**

兼容壳只保留三类职责：

1. 防止重复加载。
2. 调用 `window.QuizAnnotationRuntime` 或内部统一入口完成初始化。
3. 继续向外暴露已有全局入口，例如 `initQuizAnnotation`。

不得在这一轮里删除任何旧的全局 API 名称。

- [ ] **Step 3: 把 `assets/quiz-annotation-audio.js` 对齐为同样的兼容壳模式**

保持 `AudioRuntime` 的接入方式不变，只把 quiz 音效的内部实现逐步迁到私有目录；对外仍使用现有脚本文件名。

- [ ] **Step 4: 只跑入口级测试，确认“旧脚本名 + 新内部目录”能同时存在**

Run: `Set-Location 'd:/Projects/html-slides/testing'; node --test tests/quiz-annotation-runtime.test.js`

Expected: PASS，证明历史课件继续只引顶层脚本也不会炸。

---

### Task 3: 先抽共享核心，再瘦身主运行时

**Files:**
- Create: `assets/quiz-annotation/core/constants.js`
- Create: `assets/quiz-annotation/core/state.js`
- Create: `assets/quiz-annotation/core/dom.js`
- Create: `assets/quiz-annotation/core/layout.js`
- Create: `assets/quiz-annotation/core/step-strategy.js`
- Modify: `assets/quiz-annotation-runtime.js`

- [ ] **Step 1: 优先提炼“无题型差异”的公共能力**

先搬以下内容，不碰题型逻辑：

1. 阅读类型标签与公共常量。
2. 当前实例查找、锚点/气泡/面板 DOM 查询。
3. `WeakMap` 或等价结构管理的组件级共享状态。
4. 面板展开收起、分割线按钮、阅读类型解析。
5. 步进策略注册与上一条/下一条查找。

- [ ] **Step 2: 抽完一类，就从主运行时删一类，避免“双份实现”并存**

要求每迁走一块，就让主入口直接转发到新模块；不能长期保留旧逻辑和新逻辑并行，否则后面会失去真实归属。

- [ ] **Step 3: 为共享核心补充中文注释，重点解释状态归属**

必须写清：

1. 哪些状态属于整个 `.quiz-annotation` 实例。
2. 哪些状态属于具体批注或具体题目。
3. 为什么某些旧 API 仍保留在兼容壳层。

- [ ] **Step 4: 跑共享核心回归，确认公共骨架可独立支撑旧行为**

Run: `Set-Location 'd:/Projects/html-slides/testing'; node --test tests/quiz-annotation-runtime.test.js tests/slides-runtime.test.js`

Expected: PASS，且步进策略相关失败数为 0。

---

### Task 4: 拆批注子系统，不和答题题型混在一起

**Files:**
- Create: `assets/quiz-annotation/annotation/anchors.js`
- Create: `assets/quiz-annotation/annotation/bubbles.js`
- Create: `assets/quiz-annotation/annotation/sorting.js`
- Create: `assets/quiz-annotation/annotation/fragments.js`
- Create: `assets/quiz-annotation/core/connectors.js`
- Modify: `assets/quiz-annotation-runtime.js`

- [ ] **Step 1: 先按“数据归属”拆，而不是按屏幕区域拆**

按以下规则切：

1. 锚点与 linkId 对齐逻辑进 `anchors.js`。
2. 气泡的激活、折叠、hover、按钮显隐进 `bubbles.js`。
3. 拖拽回正、DOM 顺序与步进号重算进 `sorting.js`。
4. fragment 二级步进与 hover 高亮进 `fragments.js`。
5. SVG 连线与边缘钉定进 `connectors.js`。

- [ ] **Step 2: 不把单选/填空的提交结果写进批注模块**

批注模块只关心 linkId、锚点、气泡和步进，不接受题型专属判分状态作为输入源，避免未来再次长回“大一统状态机”。

- [ ] **Step 3: 给批注逻辑新增更细的回归文件或子 `describe` 块**

优先把这几类行为从大测试文件中拆出来：

1. 左栏正文顺序优先。
2. 右侧 only 批注排序保序。
3. 点击气泡 / hover 气泡 / 步进激活三套连线显示规则。
4. fragment hover 高亮与音效去重。

- [ ] **Step 4: 运行批注回归，确认拆完后步进和连线都还活着**

Run: `Set-Location 'd:/Projects/html-slides/testing'; node --test tests/quiz-annotation-runtime.test.js`

Expected: PASS，且涉及 bubble 顺序、linkId、fragment hover 的断言全部为绿。

---

### Task 5: 按题型拆适配层，优先 blank，再 single，再 matching，analysis 最后收口

**Files:**
- Create: `assets/quiz-annotation/types/blank.js`
- Create: `assets/quiz-annotation/types/single.js`
- Create: `assets/quiz-annotation/types/matching.js`
- Create: `assets/quiz-annotation/types/analysis.js`
- Modify: `assets/quiz-annotation-runtime.js`
- Create: `testing/tests/quiz-annotation/types-blank.test.js`
- Create: `testing/tests/quiz-annotation/types-single.test.js`
- Create: `testing/tests/quiz-annotation/types-matching.test.js`
- Create: `testing/tests/quiz-annotation/types-analysis.test.js`

- [ ] **Step 1: 先拆 blank，因为它最复杂也最容易牵出 store / authoring 边界**

`blank.js` 必须单独承接以下能力：

1. 学生态输入与提交回显。
2. 编辑态正确答案直接编辑。
3. passage slot 与右栏 input 的双向同步。
4. `.submitted` 污染清理与作者态恢复。

- [ ] **Step 2: 再拆 single，把选择与判分状态从主文件挪走**

`single.js` 只负责选项点击、提交判分与题型相关 DOM 更新，不承接批注、步进与编辑器逻辑。

- [ ] **Step 3: 再拆 matching，把拖放与判分反馈关进独立模块**

`matching.js` 独立负责空槽、选项池、拖放与使用态，不再让这些逻辑散落在主运行时和通用工具函数里。

- [ ] **Step 4: 最后加 `analysis.js`，把“无答题区”的特殊分支显式化**

目的不是制造一个复杂模块，而是把“分析页没有右栏真实题目内容”这个合同写死，避免继续依赖主运行时中的 if/else 漫游。

- [ ] **Step 5: 每拆完一种题型，就立刻建立对应测试文件**

推荐执行顺序：

1. `types-blank.test.js`
2. `types-single.test.js`
3. `types-matching.test.js`
4. `types-analysis.test.js`

旧的 `testing/tests/quiz-annotation-runtime.test.js` 只保留跨题型集成回归。

- [ ] **Step 6: 跑题型专项测试与总回归**

Run: `Set-Location 'd:/Projects/html-slides/testing'; node --test tests/quiz-annotation/**/*.test.js tests/quiz-annotation-runtime.test.js`

Expected: PASS，且 blank 相关测试必须覆盖“本地缓存优先，sidecar 兜底”的作者态恢复合同。

---

### Task 6: 把作者态从主运行时拆出去，避免和学生态互相污染

**Files:**
- Create: `assets/quiz-annotation/authoring/selection-toolbar.js`
- Create: `assets/quiz-annotation/authoring/fragment-toolbar.js`
- Create: `assets/quiz-annotation/authoring/linking.js`
- Modify: `assets/quiz-annotation-runtime.js`
- Create: `testing/tests/quiz-annotation/authoring.test.js`

- [ ] **Step 1: 先把新建/关联批注的选区工具条拆出去**

`selection-toolbar.js` 只负责：

1. `selectionchange` 与 `pointerup` 时机控制。
2. 工具条定位。
3. 下划线调色面板的显示、点击与销毁。

- [ ] **Step 2: 再拆锚点内部富文本工具条**

`fragment-toolbar.js` 负责锚点内二级富文本，不要再让普通锚点创建逻辑知道 fragment 格式细节。

- [ ] **Step 3: 最后拆关联模式状态机**

`linking.js` 负责 `关联左侧 / 关联右侧` 的进入、目标区域高亮、Esc 退出、点击外部取消与成功落点后的收口。

- [ ] **Step 4: 用独立测试锁住作者态和学生态的隔离**

至少覆盖：

1. 编辑模式始终显示批注。
2. 学生态未提交时批注 UI 隐藏。
3. blank 编辑态不会保留学生态判分痕迹。

- [ ] **Step 5: 跑作者态专项测试**

Run: `Set-Location 'd:/Projects/html-slides/testing'; node --test tests/quiz-annotation/authoring.test.js tests/quiz-annotation/types-blank.test.js`

Expected: PASS，尤其是 blank 作者态恢复链路必须保持绿色。

---

### Task 7: 缩小 `annotation-store.js`，把 quiz 专属 sidecar 适配迁到组件目录

**Files:**
- Create: `assets/quiz-annotation/store/payload.js`
- Create: `assets/quiz-annotation/store/bridge.js`
- Modify: `assets/annotation-store.js`
- Modify: `testing/tests/annotation-store.test.js`

- [ ] **Step 1: 先识别 `annotation-store.js` 里只服务 quiz 的分支**

迁移目标包括：

1. quiz blank 正确答案收集。
2. quiz 动态批注气泡提取与恢复。
3. quiz 页面专属清理逻辑。

- [ ] **Step 2: 把这些逻辑搬到 `store/payload.js` 与 `store/bridge.js`**

桥接层只向 `annotation-store.js` 暴露最小接口，例如：

1. `collectQuizAnnotationPayload(qa)`
2. `restoreQuizAnnotationPayload(qa, payload)`
3. `cleanupQuizAnnotationTransientState(qa)`

- [ ] **Step 3: 让 `annotation-store.js` 退回通用编排层**

`annotation-store.js` 继续负责授权、落盘、sidecar 总线和通用元素恢复，但不再直接持有 quiz 细节。

- [ ] **Step 4: 跑 sidecar 回归，确认第一次刷新不再被旧数据压回**

Run: `Set-Location 'd:/Projects/html-slides/testing'; node --test tests/annotation-store.test.js tests/quiz-annotation/types-blank.test.js tests/quiz-annotation-runtime.test.js`

Expected: PASS，且 blank 正确答案与动态批注恢复顺序断言保持为绿。

---

## 第二阶段：CSS 拆分与视觉架构重组

本阶段只处理样式文件归属、聚合入口和视觉回归，不再新增 JS 结构拆分任务。

### Task 8: CSS 拆分蓝图，保持旧入口聚合新子文件

**Files:**
- Create: `assets/zones/quiz-annotation/layout.css`
- Create: `assets/zones/quiz-annotation/notes.css`
- Create: `assets/zones/quiz-annotation/types.css`
- Create: `assets/zones/quiz-annotation/authoring.css`
- Modify: `assets/zones/zone2-quiz-annotation.css`

- [ ] **Step 1: 明确聚合策略，旧入口文件继续存在，但内部改成 manifest + import 壳**

这里必须明确采用哪一种聚合方式，否则“拆成多个 CSS 文件但 HTML 仍只引一个入口”会落不下去。推荐方案如下：

1. `assets/zones/zone2-quiz-annotation.css` 保留为课件 HTML 唯一引用的公开入口。
2. 该文件在第二阶段改成“头注释 + `@import` 顺序清单 + 极少量跨域补丁”的聚合壳。
3. 不修改 HTML 模板里的 `<link rel="stylesheet" href="./assets/zones/zone2-quiz-annotation.css">`。
4. 不引入构建脚本，也不依赖拼接工具。

推荐的导入顺序固定为：

1. `@import url('./quiz-annotation/layout.css');`
2. `@import url('./quiz-annotation/notes.css');`
3. `@import url('./quiz-annotation/types.css');`
4. `@import url('./quiz-annotation/authoring.css');`

顺序理由：

1. `layout.css` 提供整体骨架。
2. `notes.css` 提供批注基础视觉。
3. `types.css` 在骨架上叠加题型态。
4. `authoring.css` 最后覆盖编辑模式和关联态，避免被前面基础样式冲掉。

注意：`@import` 必须位于所有普通规则之前，所以聚合壳里除了头部注释外，不要把 live selector 放在 import 前面。

- [ ] **Step 2: 先新建四个子文件，只拷贝“天然成段”的完整区块，不做选择器改名**

第二阶段的唯一目标是“文件归属拆开”，不是改视觉或改命名。执行时只做三种动作：

1. 从现有 `zone2-quiz-annotation.css` 拷贝完整区块到新文件。
2. 在确认新文件生效后，再从旧文件删除原区块。
3. 全程保持类名、变量名、动画名、选择器优先级不变。

禁止事项：

1. 不顺手统一 BEM 命名。
2. 不顺手合并相似选择器。
3. 不顺手改视觉数值。
4. 不顺手“优化层级”导致覆盖顺序改变。

- [ ] **Step 3: `layout.css` 只收组件骨架与滚动容器，不收题型态和作者态**

`assets/zones/quiz-annotation/layout.css` 的责任固定如下：

1. `14.0 沉浸式逃逸`：`.slide:has(.quiz-annotation) .slide-header`、`.slide:has(.quiz-annotation) .slide-content`
2. `14.1 组件根容器`：`.quiz-annotation` 与 `.quiz-annotation:not(.has-quiz)`
3. `14.2 主体区域`：`.qa-body` 与不同 grid 模式切换
4. `14.3 栏间分割线`：`.qa-body::before`、`.qa-body::after` 与 `.has-active-note` 下的退让规则
5. `14.4 左栏骨架`：`.qa-passage`、`.qa-reading-type-pill` 的基础样式，但不含按题型变化的颜色覆写
6. `14.5 中栏骨架`：`.qa-notes-panel`、`.qa-notes-header`、`.qa-notes-header-left`、`.qa-notes-collapse-btn`、`.qa-notes-list`
7. `14.6 右栏骨架`：`.qa-answer-panel`、`.qa-answer-header`、`.qa-answer-title`、`.qa-answer-content`、`.qa-answer-options-scroll`
8. `14.11 分割线悬浮按钮`：`.qa-divider-btn` 及其 hover / visible / svg 规则
9. `14.14 隐形滚动条`：四个滚动容器的 scrollbar 规则

明确不属于 `layout.css` 的内容：

1. `.qa-answer-slot*`、`.qa-slot-*`、`.qa-question*`、`.qa-option*`
2. `.text-anchor`、`.answer-anchor`、`.note-badge`
3. `.qa-note-bubble*`、`.qa-connector-*`
4. `.quiz-annotation.linking-left/right`
5. 所有 `html.editor-mode` / `body.editor-mode` 专用覆盖

- [ ] **Step 4: `notes.css` 只收批注显示系统与提交后讲解态，不收编辑器工具条**

`assets/zones/quiz-annotation/notes.css` 的责任固定如下：

1. `14.7 原文锚点 + 角标`：`.text-anchor`、`.answer-anchor`、`.qa-anchor-text`、`.note-badge` 及其 active / hover 态
2. 与批注焦点相关的动画：`@keyframes qaAuroraShift`、`@keyframes qaBadgePulse`、`@keyframes qaBadgePulseOrange`
3. `14.8 批注气泡`：`.qa-note-bubble`、`.qa-note-header`、`.qa-note-handle`、`.qa-note-step`、`.qa-note-content`、`.qa-note-actions`、`.qa-note-action-btn`
4. 气泡激活动画：`@keyframes qa-note-focus-in`
5. `14.9 SVG 连线`：`.qa-connector-canvas`、`.qa-connector-line`、`.qa-edge-arrow`
6. `14.10 拖拽占位符`：`.qa-note-placeholder`
7. `14.12 答题隔离规则`：未提交前隐藏 note badge、隐藏讲解装饰、提交后渐入批注 UI 的规则
8. `14.15A` 中属于放映态/讲解态的 fragment 呈现规则：
	- `[data-fragment-step="true"]` 的基础隐藏协议
	- hover / proxy 高亮规则
	- `.qa-fragment-visible` 与 `data-fragment-format="color|highlight|strikethrough|ruby"` 的显示规则
	- `@keyframes qaFadeIn`

明确不属于 `notes.css` 的内容：

1. `.qa-annotation-toolbar`、`.qa-note-fragment-toolbar`、`.page-richtext-fragment-toolbar`
2. `.quiz-annotation.linking-left/right`
3. 所有 `html.editor-mode` / `body.editor-mode` 下“编辑模式始终可见”的特殊放行规则
4. 题型特定的 `.qa-answer-slot--blank`、`.qa-option.result-correct` 等判分样式

- [ ] **Step 5: `types.css` 只收四类题型与阅读类型变体，不碰批注系统本体**

`assets/zones/quiz-annotation/types.css` 的责任固定如下：

1. 阅读类型胶囊的题型变体：
	- `.quiz-annotation[data-reading-type-resolved="analysis"] .qa-reading-type-pill`
	- `.quiz-annotation[data-reading-type-resolved="matching"] .qa-reading-type-pill`
2. passage 中与 blank / matching 紧耦合的样式：
	- `.qa-passage .qa-blank-slot`
	- `.qa-passage .qa-blank-user`
	- `.qa-passage .qa-blank-value`
	- `.qa-passage .qa-matching-passage-slot ...`
	- `.qa-passage .qa-blank-slot.show-correct-answer ...`
3. `14.6.1a 连线题右栏答题槽位` 整段：
	- `.qa-answer-slots`
	- `.qa-answer-slot`
	- `.qa-answer-slot.drag-over`
	- `.qa-answer-slot.filled`
	- `.qa-slot-label`
	- `.qa-slot-blank`
	- `.qa-slot-value`
	- `.qa-slot-mark`
	- `.qa-slot-feedback`
	- `.qa-answer-key-*`
	- `.qa-answer-slot--blank`
	- `.qa-slot-input`
	- `.qa-slots-divider`
	- `.qa-option.used`、`.qa-option.dragging`
4. `14.6.2 选择题选项` 整段：
	- `.qa-question.result-unanswered`
	- `.qa-question-feedback*`
	- `.qa-option*`
	- `.qa-status-dot*`
	- `.qa-result-mark*`
	- `@keyframes qa-question-unanswered-nudge`
5. `14.6.3 提交按钮`：`.qa-submit-btn*`

明确不属于 `types.css` 的内容：

1. `.qa-answer-panel`、`.qa-answer-header`、`.qa-answer-content` 的骨架盒模型
2. `.text-anchor`、`.answer-anchor`、`.qa-note-bubble*`
3. 编辑模式工具条与关联模式光效

- [ ] **Step 6: `authoring.css` 只收编辑模式、工具条、关联模式和作者态豁免**

`assets/zones/quiz-annotation/authoring.css` 的责任固定如下：

1. 编辑模式防裁切补丁：`.editor-mode .quiz-annotation .qa-passage`、`.editor-mode .quiz-annotation .qa-answer-panel`
2. 编辑模式全局工字光标覆盖：`body.editor-mode .qa-note-bubble`、`body.editor-mode .qa-passage`、`body.editor-mode .qa-answer-panel`、`body.editor-mode .qa-option`
3. 编辑模式下强制可见/强制隐藏的规则：
	- `html.editor-mode .quiz-annotation.notes-active .qa-note-bubble`
	- `html.editor-mode .qa-answer-key-row`
	- `html.editor-mode .qa-note-bubble .qa-note-content`
	- `html.editor-mode .qa-question-feedback` / `.qa-slot-feedback` / `.qa-slot-correct` / `.qa-result-mark`
4. `14.13 关联模式视觉反馈`：`.quiz-annotation.linking-left .qa-passage`、`.quiz-annotation.linking-right .qa-answer-panel`、`@keyframes qaLinkingPulse`
5. `14.15 编辑模式浮动工具条` 整段：
	- `.qa-annotation-toolbar`
	- `.qa-note-fragment-toolbar`
	- `.page-richtext-fragment-toolbar`
	- `.qa-toolbar-*`
	- `.fragment-toolbar-label`
	- `.qa-format-dropdown` / `.rt-dropdown-menu` 的 quiz 专用覆盖
6. `14.15A` 中只属于编辑态豁免的规则：
	- `html.editor-mode` / `body.editor-mode` 下 fragment 永久显示的规则

明确不属于 `authoring.css` 的内容：

1. 放映态 fragment hover 高亮
2. 提交后 note badge 渐入
3. 选择题 / 填空题 / 七选五本身的学生态判分视觉

- [ ] **Step 7: 聚合壳 `zone2-quiz-annotation.css` 只保留 import 与跨域减动效补丁**

拆分完成后，`assets/zones/zone2-quiz-annotation.css` 目标上应只保留：

1. 文件头注释，说明“这是 quiz CSS 公共入口，不再直接承载大段 live selector”。
2. 四条固定顺序的 `@import`。
3. `14.16 响应式与无障碍` 中跨 layout / notes / types / authoring 的 `prefers-reduced-motion` 总补丁。

不要把别的 live selector 留在这个文件里，避免它再次长回第二个大文件。

- [ ] **Step 8: 按固定顺序迁移，避免一次改太多导致无法判断谁破了**

第二阶段推荐的真实执行顺序固定如下：

1. 先创建 `layout.css` 并迁移 layout 区块，验证页面仍能出骨架。
2. 再创建 `notes.css` 并迁移批注区块，验证锚点、气泡、连线仍正常。
3. 再创建 `types.css` 并迁移四类题型视觉，验证 single / matching / blank / analysis 四类页面。
4. 最后创建 `authoring.css` 并迁移编辑模式和工具条规则，验证编辑态。
5. 每完成一个子文件迁移，就立即从原入口删掉对应旧区块，避免双份规则长期共存。

不允许的执行顺序：

1. 先全量复制四份，再晚点统一清旧文件。
2. 一口气把 1900 行全切走，再统一调错。

- [ ] **Step 9: 每迁完一个子文件就做一次 selector 归属自检**

每个子文件迁移完成后，都要用 `rg` 做边界检查。推荐命令如下：

1. `Set-Location 'd:/Projects/html-slides'`
2. `rg -n "^\.slide:has\(.quiz-annotation\)|^\.qa-body|^\.qa-passage|^\.qa-notes-panel|^\.qa-answer-panel|^\.qa-divider-btn" assets/zones/quiz-annotation/layout.css`
3. `rg -n "^\.text-anchor|^\.answer-anchor|^\.note-badge|^\.qa-note-bubble|^\.qa-connector|^\.qa-note-placeholder|qaFadeIn|qa-note-focus-in|qaAuroraShift" assets/zones/quiz-annotation/notes.css`
4. `rg -n "qa-blank-slot|qa-answer-slot|qa-slot-|qa-question|qa-option|qa-submit-btn|qa-question-unanswered-nudge" assets/zones/quiz-annotation/types.css`
5. `rg -n "editor-mode|qa-annotation-toolbar|qa-note-fragment-toolbar|page-richtext-fragment-toolbar|linking-left|linking-right|qaLinkingPulse" assets/zones/quiz-annotation/authoring.css`

Expected：每个文件只命中自己负责的选择器族，不出现“大面积串门”。

- [ ] **Step 10: 跑自动化回归，确认 CSS 拆分未误伤类名合同**

Run: `Set-Location 'd:/Projects/html-slides/testing'; node --test tests/quiz-annotation/**/*.test.js tests/quiz-annotation-runtime.test.js`

Expected: PASS；若失败来自选择器命名漂移、导入顺序错误或旧文件残留重复规则，必须先修 CSS 合同，不能把失败推给测试。

- [ ] **Step 11: 跑人工视觉回归矩阵，逐页确认不是“样式加载了但层级坏了”**

至少手动检查以下 10 项：

1. 阅读单选页：提交前右栏选项视觉正常，提交后正确/错误态仍正常。
2. 阅读单选页：提交前批注角标隐藏，提交后角标与锚点渐入。
3. 阅读七选五页：槽位、拖放 hover、used 状态、提交后只读讲解态正常。
4. 阅读填空页学生态：横线、输入框、判分态、正确答案 reveal 正常。
5. 阅读填空页作者态：输入框回到编辑态，不残留 `slot-correct / slot-incorrect`、`qa-slot-mark`、`qa-slot-correct`。
6. 文章解析页：无右栏时两栏 / 单栏切换、分割线和悬浮按钮位置正常。
7. 批注气泡：激活态极光头条、降噪态、折叠态、连线层级正常。
8. fragment hover：放映态 hover 高亮正常，编辑态不被 hover 规则误伤。
9. 编辑模式工具条：下划线面板、fragment 工具条、关联模式高亮仍可见且不被裁切。
10. reduced motion：系统偏好减少动效时，核心过渡不会继续强闪。

- [ ] **Step 12: 明确失败回滚标准，避免第二阶段把主入口拖死**

出现以下任一情况时，必须停止继续拆分并先回滚到“上一子文件迁移完成”的状态：

1. 单个页面出现大面积未样式化，说明 import 链或路径有问题。
2. 编辑态工具条被裁切或完全丢失，说明 authoring 规则未完整迁移。
3. 单测全部绿，但人工页面出现批注层级 / 气泡裁切 / hover 失效，说明 selector 覆盖顺序有问题。
4. `zone2-quiz-annotation.css` 仍保留大段 live selector，说明第二阶段实际上没有完成，只是复制了一份。

回滚粒度必须按子文件进行，而不是整轮全部推倒重来：

1. 先回滚当前刚迁移的那个子文件。
2. 保留已经验证通过的前一个子文件。
3. 重新确认 import 顺序和旧入口残留规则，再继续。

---

### 第二阶段 CSS 交接附录

#### A. 当前 `zone2-quiz-annotation.css` 的天然分段

当前文件已经有可利用的天然区块，第二阶段应优先按这些区块迁移，而不是人工重新切碎：

1. `14.0 沉浸式逃逸`
2. `14.1 组件根容器`
3. `14.2 主体区域：CSS Grid 三栏布局`
4. `14.3 栏间分割线`
5. `14.4 正文/题干区域（左栏）`
6. `14.5 批注面板（中栏）`
7. `14.6 选项/作答区域（右栏）`
8. `14.6.1a 连线题右栏答题槽位`
9. `14.6.2 选择题选项`
10. `14.6.3 提交按钮`
11. `14.7 原文锚点 + 角标`
12. `14.8 批注气泡`
13. `14.9 SVG 连线`
14. `14.10 拖拽占位符`
15. `14.11 分割线悬浮按钮`
16. `14.12 答题隔离规则`
17. `14.13 关联模式视觉反馈`
18. `14.14 隐形滚动条`
19. `14.15 编辑模式浮动工具条`
20. `14.15A 批注气泡内富文本片段`
21. `14.16 响应式与无障碍`

#### B. 给其他 AI 的边界判断规则

如果其他 AI 在执行时无法判断一段 CSS 归属到哪一个子文件，统一按下面规则裁决：

1. 影响整页 grid、滚动容器、分割线、面板列位置的，归 `layout.css`。
2. 影响锚点、角标、气泡、连线、提交后讲解显隐的，归 `notes.css`。
3. 影响具体题型答题槽、选项、输入框、判分标记、提交按钮的，归 `types.css`。
4. 只在编辑模式、工具条、关联模式、作者态豁免下生效的，归 `authoring.css`。
5. 同时跨越多个子域、且只是一层总开关的，优先留在公开入口壳或最后导入的 `authoring.css`，不要复制到多个文件。

#### C. 第二阶段完成的判定标准

第二阶段只有在同时满足以下条件时，才算真正完成：

1. `assets/zones/zone2-quiz-annotation.css` 已不再承载大段 live selector，只剩 import 壳和极少量跨域补丁。
2. 四个子文件都已建立，并且各自拥有明确 selector 族。
3. 自动化回归通过。
4. 四类页面的人工视觉回归通过。
5. 编辑态与放映态都验证过，没有出现“测试绿但真实页面坏了”的情况。

---

## 第三阶段：最终回归矩阵与人工验收闸口

本阶段不再做结构性拆分，只做自动化回归、人工验收和计划状态回写。

### Task 9: 最终回归矩阵与人工验收闸口

**Files:**
- Modify: `docs/superpowers/plans/2026-05-01-quiz-annotation-split-plan.md`

- [ ] **Step 1: 运行最小自动化回归矩阵**

Run: `Set-Location 'd:/Projects/html-slides/testing'; node --test tests/annotation-store.test.js tests/slides-runtime.test.js tests/quiz-annotation-runtime.test.js tests/quiz-annotation/**/*.test.js`

Expected: PASS。

- [ ] **Step 2: 进行四类页面人工验收**

至少覆盖：

1. 阅读单选：提交前隐藏批注、提交后显示批注。
2. 阅读七选五：拖放、判分、批注联动正常。
3. 阅读填空：作者态修改正确答案立即生效，刷新后仍正确。
4. 文章解析：无右栏题目时布局、步进、批注面板正常。

- [ ] **Step 3: 验证编辑模式与放映模式的隔离**

确认编辑态工具条、关联模式、fragment 富文本与放映态的展示门禁没有串味。

- [ ] **Step 4: 完成后回写计划状态与遗留风险**

在本计划文档末尾补一个简短执行备注，记录：

1. 实际拆分后最大的剩余大文件是谁。
2. 哪些模块仍可能继续细分。
3. 是否还需要下一轮“测试文件再拆分”或“CSS 再瘦身”。

---

## 第四阶段：更新文档与加载说明，收口长期维护规则

本阶段负责把最终架构沉淀到开发文档、模板文档和技能说明中，防止后续维护重新长回单文件结构。

### Task 10: 更新文档与加载说明，收口长期维护规则

**Files:**
- Modify: `开发者文档/答题与批注组件.md`
- Modify: `references/html-template.md`
- Modify: `references/component-templates.md`
- Modify: `SKILL.md`

- [ ] **Step 1: 更新组件文档的“文件归属”章节**

写清楚哪些文件是公开入口，哪些目录是私有实现。

- [ ] **Step 2: 更新模板文档中的加载顺序说明**

明确“模板作者仍只引用旧入口文件，不直接引用私有目录脚本”。

- [ ] **Step 3: 在组件模板文档里补一句维护规则**

新功能优先放入已有子模块，不再把逻辑堆回 `assets/quiz-annotation-runtime.js`。

- [ ] **Step 4: 跑一遍文档相关 grep 自检**

Run: `Set-Location 'd:/Projects/html-slides'; rg -n "quiz-annotation-runtime.js|zone2-quiz-annotation.css|assets/quiz-annotation/" 开发者文档 references SKILL.md docs/superpowers`

Expected: 文档中对公开入口和私有目录的描述一致，没有互相打架的旧说法。

---

## 阶段执行顺序总结

1. 第一阶段：先补保护网，再建私有目录和兼容壳，然后依次拆共享核心、批注子系统、题型模块、作者态与 `annotation-store.js` 边界。
2. 第二阶段：只拆 CSS，按 `layout → notes → types → authoring` 顺序迁移，并保持旧入口聚合壳不变。
3. 第三阶段：运行总回归、做人工验收、确认编辑态与放映态隔离，并回写最终遗留风险。
4. 第四阶段：更新组件文档、模板文档、技能说明与加载说明，收口长期维护规则。

## 风险提示

1. 最大风险不是“代码搬不动”，而是拆分过程中公开入口或 sidecar 恢复顺序被悄悄改掉。
2. `blank` 题型必须作为优先模块处理，因为它同时横跨学生态、作者态、持久化和恢复优先级，是最容易引发回归的交叉点。
3. 如果执行时发现某个子模块仍超过 600-800 行，应继续细分，不要把“拆到组件目录里”误当成真正完成。
