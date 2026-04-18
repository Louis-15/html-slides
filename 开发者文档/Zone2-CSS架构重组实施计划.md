# Zone 2 CSS 架构重组实施计划

> 来源：`docs/superpowers/plans/2026-04-18-zone2-css-architecture.md`
> 说明：本文件为中文译稿，供开发执行与开发者文档目录查阅使用。
> 状态：本计划已于 2026-04-18 执行完成。下文复选框与步骤描述保留为历史执行记录，不再代表“待办”。
> 执行完成后的现状，请以 `开发者文档/布局与组件开发文档.md`、`开发者文档/答题与批注组件.md`、`开发者文档/沉浸式逃逸组件.md` 为准；另外，后续又补充了一次 `assets/quiz-annotation-runtime.js` 的撤销/重做恢复修正，用于保持批注气泡头部结构一致。

> **面向代理执行者：** 必须配合 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务逐项执行。以下步骤使用复选框 `- [ ]` 进行追踪。

**目标：** 在不改变运行时行为的前提下，将答题与批注 CSS 以及沉浸式组件 CSS 从 `assets/zones/zone2-content.css` 中拆分出去。

**架构原则：** `zone2-content.css` 只保留 Zone 2 通用布局与通用组件；完整答题视觉系统迁移到 `zone2-quiz-annotation.css`；`title-hero` 迁移到 `zone2-immersive-components.css`。公共选择器保持不变，主题归属保持不变，HTML 中仍然让 `editor.css` 作为最后加载的样式表。

**技术栈：** 原生 CSS、HTML `link` 标签、仓库 Markdown 文档、现有浏览器运行时（`quiz-annotation-runtime.js`）

**设计说明：** `docs/superpowers/specs/2026-04-18-zone2-css-architecture-design.md`

---

## 文件结构

| 文件 | 职责 |
|------|----------------|
| `assets/zones/zone2-content.css` | 仅保留 Zone 2 通用布局与通用组件 |
| `assets/zones/zone2-immersive-components.css` | `title-hero` 与未来非答题类沉浸式组件 |
| `assets/zones/zone2-quiz-annotation.css` | 完整答题与批注视觉系统，包含答题组件专属编辑态处理 |
| `assets/editor.css` | 仅保留通用编辑器样式；不再承担答题组件结构归属 |
| `高考英语阅读实战.html` | 主仓库页面；必须加载新的 Zone 2 CSS 文件 |
| `七选五理论论述.html` | 仓库页面；必须加载新的 Zone 2 CSS 文件 |
| `assets/quiz-annotation-demo.html` | 组件 Demo；必须加载新的 Zone 2 CSS 文件 |
| `开发者文档/答题与批注组件.md` | 必须改成新的答题 CSS 归属描述 |
| `开发者文档/布局与组件开发文档.md` | 必须改成新的 Zone 2 样式架构描述 |

---

### 任务 1：创建新的 Zone 2 CSS 模块文件

**涉及文件：**
- 新建：`assets/zones/zone2-immersive-components.css`
- 新建：`assets/zones/zone2-quiz-annotation.css`

- [ ] **步骤 1：创建带专用头部注释的 `zone2-immersive-components.css`**

创建 `assets/zones/zone2-immersive-components.css`，文件头如下：

```css
/* ===========================================
   ZONE 2: 沉浸式组件 (Immersive Components)
   负责会独立占据视觉舞台的 Zone 2 组件结构。

   当前包含：
   - 总封面组件 (.title-hero)

   未来预留：
   - 章节封面组件
   - 封底鸡汤页组件
   - 封底二维码页组件

   注意：
   - 本文件不拥有 layout-title 等布局规则
   - 主题配色覆写继续放在 themes/*.css
   =========================================== */
```

- [ ] **步骤 2：把完整的 `title-hero` 代码块从 `zone2-content.css` 挪到新文件**

将当前位于 `assets/zones/zone2-content.css` 中、覆盖以下选择器的连续代码块原样迁移到 `assets/zones/zone2-immersive-components.css`：

- `.title-hero`
- `.title-hero-subject`
- `.title-hero-heading`
- `.title-hero-divider`
- `.title-hero-author`

迁移后的结构应保持如下形态：

```css
.title-hero { ... }
.title-hero-subject { ... }
.title-hero-heading { ... }
.title-hero-divider { ... }
.title-hero-author { ... }
```

- [ ] **步骤 3：创建带专用头部注释的 `zone2-quiz-annotation.css`**

创建 `assets/zones/zone2-quiz-annotation.css`，文件头如下：

```css
/* ===========================================
   ZONE 2: 答题与批注组件 (Quiz Annotation)
   负责 .quiz-annotation 及全部 .qa-* 视觉样式。

   包含：
   - 沉浸式逃逸规则
   - 三栏布局
   - 正文、批注、答题区
   - 判分反馈、连线槽位、批注气泡、连线与拖拽
   - quiz 专属编辑模式补丁
   - 无障碍与 reduced-motion 补丁
   =========================================== */
```

- [ ] **步骤 4：在裁剪源文件前，先把完整答题组件 CSS 块复制到新文件**

把 `assets/zones/zone2-content.css` 中从“组件 14: 答题与批注 (.quiz-annotation)”注释开始的整段连续代码，复制到 `assets/zones/zone2-quiz-annotation.css` 中。

复制过去的内容必须完整包含以下类别，且保持不改名：

- `.slide:has(.quiz-annotation) ...` 这类沉浸式逃逸规则
- `.quiz-annotation`、`.qa-body`、`.qa-passage`、`.qa-notes-panel`、`.qa-answer-panel`
- 判分相关选择器，例如 `.qa-answer-slot`、`.qa-slot-*`、`.qa-option.result-*`
- 批注相关选择器，例如 `.qa-note-bubble`、`.qa-note-header`、`.qa-note-actions`
- 连线相关选择器，例如 `.qa-connector-canvas`、`.qa-connector-line`、`.qa-edge-arrow`
- 支撑性选择器，例如 `.qa-divider-btn`、隔离规则、隐藏滚动条规则
- reduced-motion 代码块中属于答题组件的那一部分

迁移过程中不要重命名任何选择器。

- [ ] **步骤 5：验证两个新文件都已创建，且包含预期锚点选择器**

运行：

```powershell
rg -n "title-hero|quiz-annotation|\.qa-" assets/zones/zone2-immersive-components.css assets/zones/zone2-quiz-annotation.css
```

期望结果：

- `zone2-immersive-components.css` 能搜到 `title-hero` 相关选择器。
- `zone2-quiz-annotation.css` 能搜到 `.quiz-annotation` 与 `.qa-*` 相关选择器。

---

### 任务 2：将 `zone2-content.css` 精简为纯通用 Zone 2 归属

**涉及文件：**
- 修改：`assets/zones/zone2-content.css`

- [ ] **步骤 1：从 `zone2-content.css` 中删除已迁出的 `title-hero` 代码块**

删除从“组件 13: 封面标题组 (.title-hero)”注释开始，到 `.title-hero-author` 结束的组件块。

删除后不要留下任何仍然生效的重复选择器。

- [ ] **步骤 2：从 `zone2-content.css` 中删除已迁出的答题组件代码块**

删除从“组件 14: 答题与批注 (.quiz-annotation)”注释开始、一直覆盖到 Zone 2 响应式/无障碍区段的整段连续答题组件样式。

原位置最多只留一条简短指向注释，例如：

```css
/* quiz-annotation 样式已迁移到 zone2-quiz-annotation.css */
```

- [ ] **步骤 3：更新文件头部注释，让职责清单与新归属一致**

修改 `assets/zones/zone2-content.css` 顶部注释，确保它不再宣称自己负责：

- 总封面组件结构
- 答题与批注组件

可替换为类似如下的表述：

```css
/*
   ZONE 2: 内容区 (Content Area)
   布局系统 + 通用组件集合。

   不包含：
   - 沉浸式组件（见 zone2-immersive-components.css）
   - 答题与批注组件（见 zone2-quiz-annotation.css）
*/
```

- [ ] **步骤 4：验证 `zone2-content.css` 不再拥有真实生效的答题或 `title-hero` 选择器**

运行：

```powershell
rg -n "^\.title-hero|^\.quiz-annotation|^\.qa-" assets/zones/zone2-content.css
```

期望结果：

- 没有真实生效的选择器匹配
- 纯文本注释提示可以保留

---

### 任务 3：将答题组件专属编辑态 CSS 从 `editor.css` 中迁出

**涉及文件：**
- 修改：`assets/editor.css`
- 修改：`assets/zones/zone2-quiz-annotation.css`

- [ ] **步骤 1：把答题组件编辑态的 overflow/padding 修正迁移到新答题文件**

将 `assets/editor.css` 中如下代码块：

```css
/* 答题与批注组件专用的溢出防裁切方案 
   因为三栏内部带有 overflow-y: auto 需要保持滚动，不能轻易 visible，
   所以在编辑模式下给内部增加足够的上内边距，让 top: -32px 的控件有合法的视觉空间 */
.editor-mode .quiz-annotation .qa-passage,
.editor-mode .quiz-annotation .qa-answer-panel {
    padding-top: 40px !important;
}
```

插入到 `assets/zones/zone2-quiz-annotation.css` 中靠近现有答题组件编辑态选择器的位置。

- [ ] **步骤 2：从 `assets/editor.css` 中删除已经迁出的代码块**

迁出之后，`assets/editor.css` 只保留编辑器全局关切点，不再承载答题组件结构归属。

- [ ] **步骤 3：验证这段修正现在只存在于答题组件 CSS 模块**

运行：

```powershell
rg -n "padding-top: 40px !important|\.editor-mode \.quiz-annotation \.qa-passage|\.editor-mode \.quiz-annotation \.qa-answer-panel" assets/editor.css assets/zones/zone2-quiz-annotation.css
```

期望结果：

- 匹配只出现在 `assets/zones/zone2-quiz-annotation.css`

---

### 任务 4：更新 HTML 文件，加载新的 CSS 模块

**涉及文件：**
- 修改：`高考英语阅读实战.html`
- 修改：`七选五理论论述.html`
- 修改：`assets/quiz-annotation-demo.html`

- [ ] **步骤 1：更新仓库 HTML 页面，在 `zone2-content.css` 后插入新的 Zone 2 CSS 文件**

在两个仓库 HTML 页面中，把以下样式引用组：

```html
<link rel="stylesheet" href="./assets/zones/zone2-content.css">
<link rel="stylesheet" href="./assets/zones/zone3-summary.css">
<link rel="stylesheet" href="./assets/editor.css">
```

改成：

```html
<link rel="stylesheet" href="./assets/zones/zone2-content.css">
<link rel="stylesheet" href="./assets/zones/zone2-immersive-components.css">
<link rel="stylesheet" href="./assets/zones/zone2-quiz-annotation.css">
<link rel="stylesheet" href="./assets/zones/zone3-summary.css">
<link rel="stylesheet" href="./assets/editor.css">
```

- [ ] **步骤 2：更新组件 Demo HTML，加入相对路径下的 Zone 2 模块**

在 `assets/quiz-annotation-demo.html` 中，把：

```html
<link rel="stylesheet" href="zones/zone2-content.css">
```

改成：

```html
<link rel="stylesheet" href="zones/zone2-content.css">
<link rel="stylesheet" href="zones/zone2-immersive-components.css">
<link rel="stylesheet" href="zones/zone2-quiz-annotation.css">
```

- [ ] **步骤 3：本次重构不要修改仓库外的临时文件**

本次任务不要改这些文件：

- `d:/Projects/Intermediate Products/layout-test.html`
- `d:/Projects/Intermediate Products` 下的其他临时产物

如有需要，后续可以手动更新，但它们不是本仓库的源文件。

- [ ] **步骤 4：验证所有仓库 HTML 文件都已引用新模块**

运行：

```powershell
rg -n "zone2-immersive-components.css|zone2-quiz-annotation.css" 高考英语阅读实战.html 七选五理论论述.html assets/quiz-annotation-demo.html
```

期望结果：

- 三个文件都能搜到两条新样式引用

---

### 任务 5：更新架构文档，使其与新的文件归属一致

**涉及文件：**
- 修改：`开发者文档/答题与批注组件.md`
- 修改：`开发者文档/布局与组件开发文档.md`

- [ ] **步骤 1：更新 `开发者文档/答题与批注组件.md`，移除“必须写在 `zone2-content.css`”的旧规则**

将类似这样的说法：

```md
- 属于 Zone 2 组件体系，写在 `zone2-content.css` 中，不新建 Zone 文件
```

替换为：

```md
- 属于 Zone 2 组件体系，CSS 结构独立维护在 `assets/zones/zone2-quiz-annotation.css`
- 运行时逻辑独立维护在 `assets/quiz-annotation-runtime.js`
```

- [ ] **步骤 2：更新同一文档中的“新增文件清单”部分**

将 CSS 条目从：

```md
| CSS | 追加 | `assets/zones/zone2-content.css` | 在文件末尾追加答题与批注组件的全部样式 |
```

改成：

```md
| CSS | 独立 | `assets/zones/zone2-quiz-annotation.css` | 答题与批注组件的全部样式独立维护 |
```

- [ ] **步骤 3：更新 `开发者文档/布局与组件开发文档.md`，明确 Zone 2 已拆成多个 CSS 模块**

调整其架构表或架构图，避免继续暗示“所有 Zone 2 结构都在同一个文件里”。

至少要明确区分：

- `zone2-content.css` → Zone 2 通用布局 + 通用组件
- `zone2-immersive-components.css` → 沉浸式组件结构
- `zone2-quiz-annotation.css` → 答题与批注系统

- [ ] **步骤 4：验证文档中不再残留过时归属说法**

运行：

```powershell
rg -n "写在 `zone2-content.css` 中|在文件末尾追加答题与批注组件的全部样式|zone2-content.css.*12 个纯组件" 开发者文档/答题与批注组件.md 开发者文档/布局与组件开发文档.md
```

期望结果：

- 不再有过时的归属说法

---

### 任务 6：执行静态验证与架构完整性冒烟检查

**验证文件：**
- `assets/zones/zone2-content.css`
- `assets/zones/zone2-immersive-components.css`
- `assets/zones/zone2-quiz-annotation.css`
- `assets/editor.css`
- `高考英语阅读实战.html`
- `七选五理论论述.html`
- `assets/quiz-annotation-demo.html`
- `开发者文档/答题与批注组件.md`
- `开发者文档/布局与组件开发文档.md`

- [ ] **步骤 1：对被修改的 CSS 文件执行 Problems 或静态检查**

使用 Problems 面板或仓库现有工具，确认以下文件没有 CSS 语法错误：

- `assets/zones/zone2-content.css`
- `assets/zones/zone2-immersive-components.css`
- `assets/zones/zone2-quiz-annotation.css`
- `assets/editor.css`

- [ ] **步骤 2：使用 ripgrep 校验归属边界**

运行：

```powershell
rg -n "^\.title-hero|^\.quiz-annotation|^\.qa-" assets/zones/zone2-content.css assets/zones/zone2-immersive-components.css assets/zones/zone2-quiz-annotation.css
```

期望结果：

- `zone2-content.css` 中没有真实生效的 `title-hero` 或答题组件选择器
- `zone2-immersive-components.css` 负责 `title-hero`
- `zone2-quiz-annotation.css` 负责答题组件选择器

- [ ] **步骤 3：对主演示页面做一次冒烟检查**

打开 `高考英语阅读实战.html`，确认：

- 封面页仍然正确渲染 `title-hero`
- 答题页面仍然正确渲染答题组件
- 没有出现缺样式或明显未着样式的控件
- 编辑模式仍然保留答题区域顶部 padding 修正

- [ ] **步骤 4：对组件 Demo 做一次冒烟检查**

打开 `assets/quiz-annotation-demo.html`，确认：

- 答题组件仍然完整渲染
- 批注面板与答题面板仍然带有正确样式
- 没有因为路径或加载顺序错误而丢失选择器

- [ ] **步骤 5：提交**

```bash
git add assets/zones/zone2-content.css assets/zones/zone2-immersive-components.css assets/zones/zone2-quiz-annotation.css assets/editor.css 高考英语阅读实战.html 七选五理论论述.html assets/quiz-annotation-demo.html 开发者文档/答题与批注组件.md 开发者文档/布局与组件开发文档.md
git commit -m "refactor: split zone2 quiz and immersive css modules"
```

---

## 自检清单

- 设计说明覆盖范围：
  - 答题 CSS 已拆出
  - 沉浸式组件 CSS 已拆出
  - editor 耦合已解除
  - HTML 引用已更新
  - 开发文档已更新
- 占位词检查：
  - 没有 TBD/TODO 标记
  - 没有“类似前一任务”这种偷懒式写法
- 边界一致性：
  - `zone2-content.css` 保持通用化
  - `zone2-immersive-components.css` 负责 `title-hero`
  - `zone2-quiz-annotation.css` 负责 `.quiz-annotation` / `.qa-*`

## 执行交接

计划已经保存到 `docs/superpowers/plans/2026-04-18-zone2-css-architecture.md`。后续执行有两种方式：

**1. 子代理驱动执行（推荐）** - 每个任务派发一个全新子代理，中间穿插复核，迭代更快

**2. 当前会话内联执行** - 在当前会话里按执行计划分批推进，并在关键节点做检查

**采用哪一种方式？**
