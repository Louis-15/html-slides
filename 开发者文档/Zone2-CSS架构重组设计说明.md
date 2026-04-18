# Zone 2 CSS 架构重组设计说明

> 来源：`docs/superpowers/specs/2026-04-18-zone2-css-architecture-design.md`
> 说明：本文件为中文译稿，供开发者文档目录查阅与后续维护使用。
> 状态：历史设计快照。下文“当前状态”“当前耦合”等描述，记录的是本次重构执行前的仓库状态，不代表当前代码现状。
> 当前实现请以 `开发者文档/布局与组件开发文档.md`、`开发者文档/答题与批注组件.md`、`开发者文档/沉浸式逃逸组件.md` 为准。

## 目标

重组 Zone 2 的样式表架构，使答题与批注系统以及沉浸式组件不再继续混放在单一的 `assets/zones/zone2-content.css` 大文件中。本次重构必须保证行为不变、公共类名不变，并为未来继续扩展沉浸式组件预留清晰空间；但本轮不会顺带开发那些未来组件。

## 方案摘要

本次重构采用“三文件 Zone 2 CSS 结构”：

1. `assets/zones/zone2-content.css`
   - 保留 Zone 2 的通用布局模式与通用组件。
   - 不再负责答题与批注组件和 `title-hero` 的组件结构样式。

2. `assets/zones/zone2-quiz-annotation.css`
   - 负责完整的 `.quiz-annotation` / `.qa-*` 视觉系统。
   - 同时接管当前混在 `assets/editor.css` 里的答题与批注组件专属编辑模式 CSS。

3. `assets/zones/zone2-immersive-components.css`
   - 当前负责 `title-hero`。
   - 未来作为其他非答题类 Zone 2 沉浸式组件的归属文件，例如章节封面、结尾金句页、二维码结尾页等。

用户已经选定的拆分边界为“方案 A”：`layout-title` 及其他布局规则继续留在 `zone2-content.css` 中，只迁移组件样式与沉浸式逃逸相关样式。

## 重构前状态

### 当前存在的耦合

- `assets/zones/zone2-content.css`
  - 包含 Zone 2 布局规则。
  - 包含通用组件规则。
  - 包含 `title-hero` 总封面组件规则。
  - 包含整套答题与批注 CSS 系统，其中包括沉浸式逃逸、三栏布局、判分状态、批注 UI、连线系统、分隔按钮以及 reduced-motion 覆盖。

- `assets/editor.css`
  - 含有一段只服务于答题与批注组件的编辑态修正：
    - `.editor-mode .quiz-annotation .qa-passage`
    - `.editor-mode .quiz-annotation .qa-answer-panel`

- `assets/themes/xindongfang-green.css`
  - 含有 `.title-hero-heading` 和 `.title-hero-divider` 的主题级覆写。
  - 这部分分层目前是正确的，结构上不应移动。

- 当前 HTML 文件在 Zone 2 结构层面只加载了 `zone2-content.css`：
  - `高考英语阅读实战.html`
  - `七选五理论论述.html`
  - `assets/quiz-annotation-demo.html`

### 当前文档与实际实现已经存在偏差

仓库里的开发文档目前仍然把答题与批注组件描述为“故意放在 `zone2-content.css` 里”。一旦本次重构完成，至少以下文档会立刻过时，必须同步更新：

- `开发者文档/答题与批注组件.md`
- `开发者文档/布局与组件开发文档.md`

## 范围

### 本次范围内

- 将答题与批注 CSS 拆到独立的 `zone2-quiz-annotation.css`。
- 将 `title-hero` 拆到独立的 `zone2-immersive-components.css`。
- 将答题与批注组件专属的编辑模式 CSS 从 `assets/editor.css` 挪到答题组件专用 CSS 模块。
- 更新当前只依赖 `zone2-content.css` 的仓库 HTML 文件。
- 更新已经描述错误 CSS 归属关系的开发文档。
- 除非样式迁移会逼迫 JS 选择器或加载顺序做修正，否则运行时 JavaScript 保持不动。

### 本次范围外

- 开发新的沉浸式组件。
- 重命名公共类名，例如 `.quiz-annotation`、`.qa-*`、`.title-hero*`。
- 重构 `assets/quiz-annotation-runtime.js`。
- 重构主题文件；只要现有 `.title-hero` 主题覆写能继续工作即可。
- 更新 `d:/Projects/Intermediate Products` 下的临时文件。

## 目标架构

### 1. `assets/zones/zone2-content.css`

重构后职责：

- Zone 2 布局模式
- 通用布局插槽规则
- Zone 2 通用组件
- 通用自动错峰动画规则

迁出后的内容：

- `title-hero` 组件块
- 所有 `.quiz-annotation` / `.qa-*` 代码块
- 答题组件专属的 reduced-motion 条目
- 答题组件专属的沉浸式逃逸规则

文件头部的职责清单注释必须同步更新，确保提取后仍然准确反映该文件的真实归属范围。

### 2. `assets/zones/zone2-immersive-components.css`

职责：

- `title-hero`
- `title-hero-subject`
- `title-hero-heading`
- `title-hero-divider`
- `title-hero-author`

设计规则：

- 该文件用于承载“答题与批注组件之外”的 Zone 2 沉浸式组件。
- 未来可以继续纳入章节封面、结尾引用、二维码结束页等组件。
- 它不接管 `layout-title`；布局规则仍然留在 `zone2-content.css`。

### 3. `assets/zones/zone2-quiz-annotation.css`

职责：

- 接管当前 `zone2-content.css` 中从注释“组件 14: 答题与批注 (.quiz-annotation)”开始的整段连续样式。
- 答题组件专属沉浸式逃逸：
  - `.slide:has(.quiz-annotation) .slide-header`
  - `.slide:has(.quiz-annotation) .slide-content`
- 答题组件内部布局与状态样式
- 判分状态样式
- 批注面板与批注气泡样式
- 连线、拖拽占位、分隔按钮、隔离规则
- 答题组件专属 reduced-motion 条目
- 当前写在 `assets/editor.css` 中的答题组件专属编辑态 overflow/padding 补偿

这个文件将成为答题与批注组件唯一的 CSS 真正归属文件。

### 4. 主题文件

`assets/themes/xindongfang-green.css` 继续只负责主题外观。现有的 `.title-hero` 渐变和分隔线主题覆写保留在主题文件中，这样即便结构样式从 `zone2-content.css` 迁出，也不会破坏主题层级。

## 文件归属矩阵

| 关注点 | 重构后归属文件 |
|------|------|
| Zone 2 布局（`layout-single`、`layout-title`、`layout-2col` 等） | `assets/zones/zone2-content.css` |
| Zone 2 通用组件（`.card`、`.flip-card`、`.table-wrap` 等） | `assets/zones/zone2-content.css` |
| 总封面组件结构（`.title-hero*`） | `assets/zones/zone2-immersive-components.css` |
| 答题组件沉浸式逃逸与完整 UI（`.quiz-annotation`、`.qa-*`） | `assets/zones/zone2-quiz-annotation.css` |
| 答题组件编辑态特殊处理 | `assets/zones/zone2-quiz-annotation.css` |
| `title-hero` 的主题外观 | `assets/themes/xindongfang-green.css` |
| 答题组件运行时逻辑 | `assets/quiz-annotation-runtime.js` |

## HTML 加载顺序

仓库 HTML 页面目标 CSS 顺序如下：

1. `viewport-base.css`
2. `themes/xindongfang-green.css`
3. `components.css`
4. `zones/zone1-header.css`
5. `zones/zone2-content.css`
6. `zones/zone2-immersive-components.css`
7. `zones/zone2-quiz-annotation.css`
8. `zones/zone3-summary.css`
9. `editor.css`

原因：

- 主题变量应先于结构样式加载。
- 通用 Zone 2 样式应先于专用 Zone 2 模块加载。
- 专用模块仍然按 Zone 2 文件族群集中排列。
- `editor.css` 继续放在最后，以保留当前编辑层覆盖优先级。

## 需要同步修改的文档

### `开发者文档/答题与批注组件.md`

必须把以下旧说法：

- “写在 `zone2-content.css` 中，不新建 Zone 文件”

改成：

- 答题与批注组件 CSS 现在位于 `assets/zones/zone2-quiz-annotation.css`
- 运行时 JS 继续位于 `assets/quiz-annotation-runtime.js`

同时，“新增文件清单”一节也必须同步修正。

### `开发者文档/布局与组件开发文档.md`

必须更新其架构图与文件归属表，避免继续暗示“所有 Zone 2 组件结构都在 `zone2-content.css` 中”。

## 迁移策略

1. 先创建两个新的 CSS 文件。
2. 先把样式复制过去，过程中不改选择器名。
3. 确认新文件存在后，再精简 `zone2-content.css`。
4. 把答题组件专属编辑态 CSS 挪进新的答题组件文件。
5. 更新 HTML 引用。
6. 更新文档。
7. 运行静态验证。

这个顺序可以尽量降低开发过程中临时出现断链或样式缺失的概率。

## 验收要求

只有同时满足以下条件，才算本次实现成功：

- `zone2-content.css` 不再拥有任何真实生效的 `.quiz-annotation`、`.qa-*` 或 `.title-hero*` 选择器。
- `zone2-quiz-annotation.css` 含有完整的答题组件视觉系统，以及编辑态特殊处理。
- `zone2-immersive-components.css` 负责 `title-hero` 结构样式。
- 仓库 HTML 文件按约定顺序加载新的 CSS 文件。
- 现有答题页与封面页在普通模式下渲染不变。
- 现有答题页的编辑模式行为保持不变。
- 开发文档不再继续描述旧的单文件归属关系。

## 风险与缓解措施

### 风险 1：文件拆分后选择器优先级发生变化

缓解措施：

- 选择器名保持不变。
- 严格使用约定的加载顺序。
- 保留 `editor.css` 最后加载的规则。

### 风险 2：Demo 文件与仓库正式页面继续分叉

缓解措施：

- 把 `assets/quiz-annotation-demo.html` 明确纳入本次重构范围。
- 持续使用它自己的相对 `zones/...` 路径。

### 风险 3：代码改完以后，文档反而更不准确

缓解措施：

- 把文档更新视为本次范围内的硬性要求，而不是事后清理。

## 非目标再次确认

本轮只做架构重组。不引入新的组件行为，不开发新的沉浸式组件，也不把 JS 运行时重设计混进这次重构。
