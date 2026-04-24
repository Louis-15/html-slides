# 普通页面隐藏型富文本标注全局化计划文档

> 当前阶段：计划文档（仅规划，不含实现）
>
> 计划日期：2026-04-24
>
> 需求来源：开发者文档/富文本步进功能的全局化需求.md、开发者文档/答题与批注组件.md、开发者文档/编辑系统开发文档_v3.4.md，以及本轮已锁定的需求边界
>
> 推荐技术路线：方案 B，共享协议型
>
> 建议交接对象：主控 Agent 先安排 M0 结构性前置核查，再交实现 Agent 按“当前切片 failing test -> 确认失败 -> 最小实现 -> 当前 focused tests -> 审查_Debug_验证 Agent 做阶段验证”的顺序推进
>
> 仍待主控 Agent 决策的问题：无。本计划已把“稳定标识 / data-edit-id 恢复是否稳”列为强制前置 gate；它会决定实现顺序，但不改变需求方向。

## 1. 项目背景

html-slides 目前已经存在两条与本次需求直接相关的成熟能力，但它们还没有在“普通页面文本”层面被统一打通：

1. `assets/quiz-annotation-runtime.js` 已经具备局部富文本片段的完整作者态与放映态协议，包括：
   - `data-fragment-step="true"`、`data-fragment-group`、`data-fragment-format` 等片段协议；
   - 颜色、高光、删除线、顶标、清除格式五类片段格式；
   - 放映 / 涂鸦模式下默认隐藏，右键即时揭示，左右键二级步进；
   - `qa-fragment-visible`、`data-fragment-manual-reveal` 这类只存在于运行时的瞬时状态；
   - 编辑模式下基于 `selectionchange + pointerup` 的浮动工具条刷新策略。
2. `assets/editor-core.js`、`assets/editor-rich-text.js`、`assets/editor-persistence.js` 已经构成普通正文编辑底座：
   - 顶部富文本工具栏对标题栏、正文、卡片、表格、总结区等大量文本容器生效；
   - `EDITABLE_SELECTOR` 已经覆盖了本次需求要求纳入的绝大多数正文型文本；
   - `PersistenceLayer.saveElement()` / `restoreAllElements()` 已经承担普通富文本的 localStorage 与导出链路；
   - `stripTransientEditableHTML()` 已经会剥离 `qa-fragment-visible`、`data-fragment-manual-reveal` 这类瞬时 reveal 状态。

当前缺口主要有四个：

1. 普通页面文本没有“隐藏后再揭示”的宿主层，左右键与右键 reveal 仍只服务于 `quiz-annotation`。
2. `AnnotationStore` 的数据模型虽然注释层面已允许“普通 data-edit-id 元素”，但实际收集 / 恢复逻辑仍只覆盖 `quiz-annotation` 内部。
3. 普通页面作者态没有与顶部工具栏区分语义的“隐藏型标注”浮动工具条。
4. `data-edit-id` 的稳定性存在现实风险：`editor-core.js` 仍会在首次进入编辑模式后为缺失标识的元素临时补 `_auto_...`，而 `PersistenceLayer.restoreAllElements()` 发生在这一步之前。对于需要跨次恢复的隐藏型标注，这必须先核清，否则普通页面根块可能无法稳定定位。

因此，本次工作不应做“大一统富文本重构”，而应采用“共享片段协议 + 页级普通文本宿主 + AnnotationStore 增量扩展”的收敛路线：复用现有成熟协议，避免动到 `quiz-annotation` 的三栏批注语义，同时把普通页面文本的隐藏标注接入现有编辑、放映、涂鸦和本地持久化链路。

## 2. 项目目标

1. 将 `quiz-annotation` 内部已有的“隐藏后再揭示”富文本片段能力推广到普通页面文本。
2. 保持顶部富文本工具栏的普通格式行为不变：由顶部工具栏添加的普通富文本，在放映模式下直接显示。
3. 新增一个仅用于普通页面正文文本的“隐藏型标注”浮动工具条，显式标注语义差异，并只复用现有五种片段格式：文字颜色、背景高光、删除线、顶标、清除格式。
4. 在放映模式和涂鸦模式下，让普通页面隐藏型标注默认隐藏，并支持：
   - 鼠标右键即时揭示；
   - 键盘左右键按整页普通文本 DOM 顺序步进。
   - 鼠标悬浮时显示橙色高光提示，提醒教师该处存在隐藏型标注。
5. 当页面中存在 `quiz-annotation` 时，整页禁用普通文本隐藏型标注逻辑，避免左右键、右键和 hover 提示与 quiz 内部规则冲突。
6. 复用 `AnnotationStore` 与同一个 `.annotations.js` 侧车文件持久化普通页面隐藏型标注，同时不破坏顶部普通富文本既有的 localStorage / 导出链路。
7. 将 `data-edit-id` 稳定性核查作为实现阶段的结构性前置 gate；该项通过后，再按 Superpowers 的 TDD 流程进入对应模块的编码切片。

## 3. 非目标

1. 不改写 `quiz-annotation` 组件的既有编辑方式、显示方式、步进方式、连线系统、中栏批注面板或提交流程。
2. 不把普通页面隐藏型标注与顶部普通富文本合并成同一套作者态入口；两者必须保留不同语义和不同 UI。
3. 不允许跨多个 `data-edit-id` 根块创建隐藏型标注；跨根块包裹选区直接视为非法选区。
4. 不在本轮做“所有富文本能力的大一统抽象层”或重写整个编辑器。
5. 不为普通页面隐藏型标注引入第二个 sidecar 文件，也不引入新的独立存储协议。
6. 不在页面存在 `quiz-annotation` 时做“局部放行”；本轮要求是整页禁用普通文本隐藏标注逻辑。
7. 不把按钮、控件、浮层、组件专属作者态入口纳入隐藏型标注的编辑或步进范围。
8. 不在本轮实现未来新版例题组件的提交后激活逻辑；本计划只保证本次共享协议设计不会阻塞后续接入。

## 4. 用户需求说明

| 需求维度 | 已确认边界 | 计划中的落地解释 |
| --- | --- | --- |
| 能力推广范围 | 将 quiz 内部隐藏型富文本推广到普通页面文本 | 只覆盖普通正文型 `data-edit-id` 根块，不改动 quiz 内部原能力 |
| 顶栏富文本 | 继续放映时直接显示 | 顶部工具栏行为保持原链路，不转入隐藏协议 |
| 隐藏型标注入口 | 选中文本后通过浮动工具条添加 | 新增普通页面专用浮动工具条，显式出现“隐藏型标注”字样 |
| 默认显示规则 | 放映模式 / 涂鸦模式默认隐藏 | 编辑模式下完整显示作者格式，放映 / 涂鸦态只保留基础文本 |
| 即时揭示 | 右键直接显示富文本标注 | 对普通页面新宿主新增右键 reveal；quiz 页整页禁用该逻辑 |
| 左右键步进 | 普通页面按整页普通文本 DOM 顺序步进 | 以当前 slide 中普通 `data-edit-id` 根块的 DOM 顺序 + 根块内片段组顺序作为唯一权威 |
| quiz 冲突处理 | 页面内只要有 quiz-annotation，就禁用普通文本隐藏标注逻辑 | 不仅禁用左右键步进，也同时禁用右键 reveal 与悬浮橙色提示 |
| quiz 既有功能 | 保持不变 | 共享协议只抽低耦合片段逻辑，不改变 quiz 的作者态与运行时行为 |
| 首版格式集合 | 只复用 quiz 现有五种片段格式 | 不新增额外格式按钮，不扩展颜色集以外的新富文本能力 |
| 覆盖文本范围 | 标题栏、正文、卡片、表格、总结区等正文型文本 | 以现有编辑器可编辑正文集合为基线，排除按钮、控件与组件专属作者态入口 |
| 本地持久化 | 隐藏型标注复用 AnnotationStore 与 `.annotations.js` | AnnotationStore 增量扩展到普通页面根块；顶栏普通富文本仍走 PersistenceLayer |
| UI 语义 | 与顶部普通富文本刻意区分 | 浮动工具条文案直接写“隐藏型标注”，视觉不与顶栏普通排版按钮混淆 |
| 工程路线 | 方案 B，共享协议型 | 抽片段协议、公用 reveal 状态、公用清洗逻辑；不做大重构 |
| 强约束 1 | 只允许单个 `data-edit-id` 根块内部选区 | 工具条显示、片段创建、清除格式都要先校验选区的 start/end root 一致 |
| 强约束 2 | quiz 页要一起关闭普通文本的步进 / 右键 / hover | slides-runtime 分发与页面宿主事件都要统一早退 |
| 强约束 3 | 正式实现前先核查稳定标识 | 作为编码前的硬 gate，不通过则先补标识稳定性任务 |
| 中文注释 | 对运行时分发、持久化扩展、特殊组件隔离、选区限制、兼容性分支要求高 | 计划中将这些位置列为必须补详细中文注释的代码段 |

## 5. 技术路线概述

### 5.1 推荐路线

采用“共享片段协议 + 页级普通文本宿主 + AnnotationStore 增量扩展”的最小闭环路线：

1. 新增一个轻量共享协议文件，建议命名为 `assets/annotation-fragment-protocol.js`。
   - 职责只限于片段协议本身：格式归一化、片段分组、显隐状态同步、即时 reveal、瞬时状态清洗。
   - 不承载 quiz 三栏布局、批注气泡、连线或特定组件 UI。
2. 新增普通页面宿主文件，建议命名为 `assets/page-richtext-annotation-runtime.js`。
   - 负责普通页面隐藏型标注的 hover / 右键 / 左右键步进 / 涂鸦态透传 / slide 级状态缓存；
   - 不通过 `data-steppable` 把自己塞进一级交互队列，而是作为 `slides-runtime.js` 的普通页面二级步进 fallback 宿主；
   - 这样可以保证普通页面左右键无需先用上下键“聚焦组件”才能工作，同时又不抢占已有组件的二级步进。
3. 扩展 `assets/slides-runtime.js` 的 `stepFragment(direction)` 分发逻辑：
   - 先尝试当前一级焦点组件的 `strategy.stepFragment()`；
   - 如果当前 slide 不含 `quiz-annotation`，且当前组件没有消耗这次左右键，再 fallback 给普通页面宿主；
   - 如果当前 slide 含有 `quiz-annotation`，则完全不调用普通页面宿主。
4. 在 `assets/editor-rich-text.js` 与 `assets/editor.css` 中新增普通页面隐藏型标注作者态入口：
   - 继续复用现有 `savedRange`、`selectionchange`、`pointerup` 的基本编辑手法；
   - 但普通页面浮动工具条必须与 quiz 内部工具条隔离，且文案上明确标注“隐藏型标注”；
   - 创建片段后，同时触发 `PersistenceLayer.saveElement(root)` 与 `AnnotationStore.scheduleSave()`，保持 localStorage 与 sidecar 一致。
5. 扩展 `assets/annotation-store.js`：
   - 继续使用现有 `elements[editId] = innerHTML` 的 schema；
   - 对普通页面仅收集“含隐藏型标注片段的普通 `data-edit-id` 根块”；
   - 不创建第二套 sidecar schema；
   - 同时继续复用清理 `qa-fragment-visible`、`data-fragment-manual-reveal` 的现有策略。

### 5.2 为什么不选“大一统重构”

不推荐在本轮把普通页面与 quiz 内部富文本全部并到同一超级运行时，原因如下：

1. `quiz-annotation-runtime.js` 当前已经同时承担批注面板、拖拽排序、提交流程、答题隔离、音效和两套工具条，边界天然较重。
2. 普通页面需求没有批注面板、没有连线、没有左右端点，也没有提交后才可见的门槛；强行统一会放大回归风险。
3. 现有 repo 中部分普通 deck 并未加载 `annotation-store.js` 或 `quiz-annotation-runtime.js`；若把一切都并进 quiz 运行时，反而会抬高无 quiz deck 的接入成本。

### 5.3 实现阶段的前置核查项

进入正式编码切片前，必须先完成以下结构性核查：

1. 对覆盖范围内的普通正文型可编辑节点做 `data-edit-id` 普查，确认以下类型是否在源 HTML 中已有稳定标识：
   - 标题栏；
   - 普通正文段落；
   - 卡片与翻转卡片文案；
   - 表格单元格；
   - 总结区内容。
2. 如果发现某一类节点仍严重依赖 `editor-core.js` 在进入编辑模式后临时生成 `_auto_...` 标识，则必须先拆出一个“稳定标识补齐”子任务，再开始隐藏型标注编码。
3. 核查 quiz-free deck 的公共脚本加载情况。当前像 `七选五理论论述.html` 这类页面未加载 `annotation-store.js`，后续必须补齐普通页面所需脚本。
4. 前置核查通过条件：
   - 普通页面隐藏型标注涉及的 `data-edit-id` 能稳定恢复；
   - 目标 deck 已具备宿主脚本可插入位置；
   - 已明确首个实现切片要从哪组 focused tests 进入 TDD 循环。

## 6. 模块拆分

| 模块 | 主要职责 | 主要文件 | 串并行关系 |
| --- | --- | --- | --- |
| M0 基线与稳定标识核查 | 普查 `data-edit-id`、确认脚本入口、锁定首个 TDD 切片 | `assets/editor-core.js`、`assets/editor-persistence.js`、代表性 deck HTML | 必须最先完成 |
| M1 共享片段协议层 | 抽离片段格式、分组、显隐、即时 reveal、瞬时状态清洗 | 新增 `assets/annotation-fragment-protocol.js`，修改 `assets/quiz-annotation-runtime.js` | 串行，M2/M3/M4 依赖它 |
| M2 页级普通文本宿主 | slide 级片段扫描、DOM 顺序步进、右键 reveal、hover 提示、涂鸦态透传、quiz 页禁用 | 新增 `assets/page-richtext-annotation-runtime.js`，修改 `assets/slides-runtime.js` | 依赖 M1；与 M5 可部分并行 |
| M3 作者态隐藏型标注工具条 | 普通页面选区限制、浮动工具条、格式创建 / 清除、与顶部富文本分流 | `assets/editor-rich-text.js`、`assets/editor.css`，必要时 `assets/editor-core.js` | 依赖 M1；与 M2 紧耦合，建议串行 |
| M4 持久化与恢复扩展 | AnnotationStore 收集 / 恢复普通根块，保持 localStorage 与 sidecar 一致，导出继续剥离瞬时 reveal | `assets/annotation-store.js`、`assets/editor-persistence.js` | 依赖 M2/M3 |
| M5 样式与 deck 接入 | 普通页面片段隐藏态 / 揭示态样式、hover 橙色提示、普通 deck 补齐脚本加载 | `assets/components.css`、代表性 deck HTML | 依赖 M1；与 M2 可部分并行 |
| M6 测试与人工验证 | 新增 focused tests、跑回归、提供手工体验入口与 askQuestions 闸口 | `testing/tests/*.test.js`、`d:/Projects/Intermediate Products/*` | 贯穿全程；M4 完成后必须跑完整验证 |

## 7. 每个模块的实现思路

### 7.1 M0 基线与稳定标识核查

执行目标不是改功能，而是先确认普通页面宿主是否有稳定定位基础。

建议检查顺序：

1. 先用代表性 quiz-free deck 验证当前正文型节点的 `data-edit-id` 覆盖情况，优先选择：
   - `七选五理论论述.html`：覆盖标题栏、卡片、正文、总结区；
   - 如无法覆盖表格，补一个临时 smoke deck 到 `d:/Projects/Intermediate Products`。
2. 再用 `高考英语阅读实战.html` 验证 quiz 页上的普通区域是否存在未预期的 `data-edit-id` 争夺点。
3. 如果稳定标识不足，先把“补稳定 id”当成实现前的独立前置修复，而不是在隐藏型标注编码过程中顺手带过。

这一模块完成标准：

1. 能明确列出哪些普通文本根块已经稳定，哪些仍依赖 `_auto_...`。
2. 能明确判断是否需要改 `editor-core.js` 的 id 生成时机或导出固化策略。
3. 已明确首个实现切片的 TDD 入口，以及它依赖的最小测试文件或测试用例。

### 7.2 M1 共享片段协议层

推荐只抽“低耦合片段协议”，不抽 quiz 的组件状态机。

建议在 `assets/annotation-fragment-protocol.js` 暴露一个轻量全局对象，例如 `window.AnnotationFragmentProtocol`，职责建议控制在以下范围：

1. `normalizeFragmentPresentation(fragment)`
   - 把颜色、高光、删除线从直接样式转为 CSS 变量或数据属性；
   - 保持与 quiz 当前协议兼容，尤其是 `--qa-fragment-color`、`--qa-fragment-highlight`、`--qa-fragment-strike-color`、`--qa-fragment-strike-thickness`。
2. `collectFragmentEntries(rootOrRoots)`
   - 按 DOM 顺序收集 `[data-fragment-step="true"]`；
   - 以 `data-fragment-group` 为一组，没有 group 的单体片段按单元素组处理；
   - 返回“片段组顺序”而不是“单 span 顺序”。
3. `createFragmentState()` / `syncFragmentVisibility(state, entries)`
   - 用 `cursor + visibleSet` 表示当前 slide 或当前宿主的 reveal 状态；
   - reveal 只改 `qa-fragment-visible` 与 `data-fragment-manual-reveal` 这类瞬时标记，不改 authored 数据。
4. `revealNext(entries, state)` / `hidePrevious(entries, state)` / `revealImmediately(entryOrFragment, state)`
   - 统一左右键 reveal / rollback 与右键即时 reveal；
   - 即时 reveal 仍走同一套组级显隐逻辑，而不是另写旁路。
5. `stripTransientFragmentState(htmlOrRoot)`
   - 供 `AnnotationStore` 与 `PersistenceLayer` 共用，统一剥离 `qa-fragment-visible`、`data-fragment-manual-reveal`。

这里要刻意保持以下边界：

1. 不把 `.qa-note-bubble`、`.text-anchor`、`.answer-anchor`、连线、拖拽、notes panel 放进共享协议。
2. 普通页面允许使用新的宿主类名，例如 `.rt-hidden-fragment`，但仍复用同一套 `data-fragment-*` 属性与 `qa-fragment-visible` 运行时状态，降低持久化扩展成本。

### 7.3 M2 页级普通文本宿主

普通页面宿主建议新增 `assets/page-richtext-annotation-runtime.js`，并以“当前 slide 服务”而非“一级交互组件”的方式存在。

建议行为模型如下：

1. 宿主扫描范围：
   - 只扫描当前 active slide；
   - 只扫描普通 `data-edit-id` 根块；
   - 显式排除 `.quiz-annotation` 内部、按钮、控件、作者态浮层、组件专属入口。
2. 片段顺序：
   - 先按普通 `data-edit-id` 根块的 DOM 顺序；
   - 再按根块内片段组首次出现的 DOM 顺序；
   - 这是普通页面左右键 reveal 的唯一权威顺序。
3. 状态缓存：
   - 使用 `WeakMap<slideEl, { cursor, visible, entriesVersion }>` 保存每页 reveal 状态；
   - 翻页离开再回来时，普通页面片段 reveal 状态应按页恢复，行为上与现有步进记忆保持一致。
4. hover / 右键 / 左右键：
   - 放映 / 涂鸦模式下，鼠标 hover 到普通页面隐藏片段时展示橙色提示；
   - 右键可直接 reveal 当前片段组；
   - 左右键 reveal / rollback 走共享协议；
   - 编辑模式下不触发普通页面 reveal 逻辑。
5. quiz 页禁用规则：
   - 只要当前 slide 包含 `.quiz-annotation`，普通页面宿主整页失效；
   - 失效内容包括：左右键 fallback、右键 reveal、hover 橙色提示、涂鸦态透传 reveal；
   - 即使 quiz 外围标题栏或普通段落也存在隐藏片段，本轮也一律不生效，保持规则一致。
6. 涂鸦态兼容：
   - 需要支持 doodle 覆盖层下的右键 reveal；
   - 但普通页面宿主不能直接依赖 quiz 的 `.qa-*` 透传状态，建议在自身模块中实现中立的 `elementFromPoint` 透传分支。

和 `slides-runtime.js` 的接线建议：

1. 不为普通页面宿主新增新的一级热键，不改现有上下左右语义。
2. 仅在 `stepFragment(direction)` 中追加 fallback：当前组件没消费二级步进，且当前 slide 无 quiz 时，调用 `PageRichTextAnnotationHost.stepCurrentSlide(direction)`。
3. 这样可以避免普通页面宿主抢占 `flip-card`、`collapse-card` 等其他组件的二级能力，同时满足“普通页面左右键直接可用”的需求。

### 7.4 M3 作者态隐藏型标注工具条

普通页面的作者态入口应与 quiz 内部工具条严格区分。

建议实现要点：

1. 工具条挂载位置：
   - 继续挂到 `document.body` 顶层，避免被卡片或布局 `overflow` 裁切；
   - 样式落在 `assets/editor.css`，以普通编辑器浮层的方式存在。
2. 工具条文案与按钮：
   - 工具条需要直接出现“隐藏型标注”文字提示；
   - 首版只提供五种既有格式：文字颜色、背景高光、删除线、顶标、清除格式；
   - 不复制顶部工具栏的全部按钮。
3. 选区限制：
   - 必须同时检查 `range.startContainer` 与 `range.endContainer` 所属的最近 `data-edit-id` 根块；
   - 只有两者相同，且该根块不在 quiz 内部、不是按钮控件、不是组件专属作者态入口时，才显示工具条；
   - 若跨根块、跨组件边界、选区折叠、或选区在 quiz 作者态区域内，立即隐藏工具条。
4. 创建片段策略：
   - 直接在普通文本内插入新的 `.rt-hidden-fragment[data-fragment-step="true"]` 包裹；
   - 复用共享协议生成 `data-fragment-group` 与 `data-fragment-format`；
   - 颜色 / 高光 / 删除线 / 顶标的 authored 值仍沿用 quiz 现有的 CSS 变量存储方式。
5. 清除格式策略：
   - 只解包选区覆盖到的隐藏片段，不波及根块内其他普通富文本；
   - 清除后要同步重置该 slide 的 reveal 状态缓存。
6. 持久化触发：
   - 每次对普通页面隐藏片段做新增 / 清除 / 顶标修改后，同时调用：
     - `PersistenceLayer.saveElement(root)`，保持顶部普通富文本原链路仍然有最新 root HTML；
     - `AnnotationStore.scheduleSave()`，把含隐藏片段的根块写入 `.annotations.js`。

这里要特别注意：顶部普通富文本与隐藏型标注可以存在于同一个 `data-edit-id` 根块中。首版不引入“文本补丁协议”，而是接受“同根块整块镜像 + 双写同步”的策略，以保持实现复杂度可控。

### 7.5 M4 持久化与恢复扩展

`AnnotationStore` 的扩展目标不是重写 schema，而是把普通页面含隐藏片段的根块接入现有 `elements` 映射。

建议数据与流程如下：

1. 数据结构：
   - 继续使用 `data.elements[editId] = innerHTML`；
   - quiz 内部和普通页面都复用同一字段；
   - 只对“包含隐藏型标注片段的普通根块”收集 sidecar，避免无意义扩大 `.annotations.js`。
2. 收集逻辑：
   - `assets/annotation-store.js` 在现有 `.quiz-annotation` 收集流程之外，新增一段普通页面扫描：
     - 只扫不在 `.quiz-annotation` 内的 `[data-edit-id]`；
     - 只收含 `[data-fragment-step="true"]` 的根块；
     - 若该根块所在 slide 含有 `.quiz-annotation`，本轮直接跳过。
3. 恢复逻辑：
   - 继续通过 `editId` 回填 `innerHTML`；
   - 普通页面宿主初始化时再基于共享协议同步 reveal 隐藏态；
   - 保证最终落地的是“作者态结构 + 运行时默认隐藏”的组合，而不是把 reveal 后的视觉状态写回去。
4. 与 `PersistenceLayer` 的关系：
   - 普通隐藏片段变更后必须双写 localStorage 与 sidecar，防止两条链路互相覆盖；
   - 实现时可让普通页面宿主在 sidecar 恢复后再次调用一次 `PersistenceLayer.saveElement(root)` 或在同一事务中同步最新 HTML，避免“localStorage 比 sidecar 更旧”时产生回滚。
5. 导出清洗：
   - `editor-persistence.js` 当前已经会剥离 `qa-fragment-visible` 与 `data-fragment-manual-reveal`；
   - 这里只需要确认并补注释，说明它现在同时覆盖 quiz 与普通页面隐藏片段；
   - 不应在导出时删除 authored 的 `data-fragment-step`、`data-fragment-group`、`data-fragment-format`。

### 7.6 M5 样式与 deck 接入

样式建议尽量复用当前公共样式入口，而不是再开一张新的全局 CSS：

1. `assets/components.css`
   - 承载普通页面隐藏片段在放映 / 涂鸦模式下的默认隐藏态与 reveal 态；
   - 承载 hover 橙色提示；
   - 复用 quiz 当前的隐藏 / reveal 视觉协议：
     - 默认态清空颜色、高光、删除线、顶标；
     - `qa-fragment-visible` 或 editor-mode 下恢复 authored 样式。
2. `assets/editor.css`
   - 承载普通页面“隐藏型标注”浮动工具条样式；
   - 必须与顶部普通富文本工具栏视觉区分，避免用户误解为“又一份顶部排版按钮”。
3. deck HTML 接入
   - 代表性 quiz-free deck 当前未加载 `annotation-store.js`，后续至少要补齐：
     - `assets/annotation-store.js`
     - `assets/annotation-fragment-protocol.js`
     - `assets/page-richtext-annotation-runtime.js`
   - quiz deck 还需要把共享协议文件插入到 `quiz-annotation-runtime.js` 之前，以便 quiz 内部也能复用。

推荐脚本顺序示意如下：

1. `assets/slides-runtime.js`
2. `assets/audio-runtime.js`
3. `assets/annotation-store.js`
4. `assets/annotation-fragment-protocol.js`
5. `assets/quiz-annotation-audio.js`（如页面需要）
6. `assets/quiz-annotation-runtime.js`（如页面需要）
7. `assets/editor-utils.js`
8. `assets/editor-persistence.js`
9. `assets/editor-history.js`
10. `assets/editor-box-manager.js`
11. `assets/editor-rich-text.js`
12. `assets/editor-core.js`
13. `assets/page-richtext-annotation-runtime.js`
14. `assets/doodle-runtime.js`

普通页面宿主放在 `editor-core.js` 之后的原因是：它需要复用编辑器已暴露的全局对象，但不应反过来成为编辑器初始化的前置依赖。

### 7.7 M6 测试与人工验证

这一模块既包含自动化测试，也包含人工测试闸口。

这里统一遵循 Superpowers 的 TDD 流程：围绕“当前模块 / 当前切片”先写 failing test，确认失败，再写最小实现并回跑当前 focused tests；不再额外叠加一层独立的“改代码前最小验证”脚本要求。M0 的职责仅限于结构性核查，不承担实现前的全量测试闸口。

自动化测试建议：

1. 新增 `testing/tests/page-richtext-annotation-runtime.test.js`
   - 覆盖普通页面 DOM 顺序步进；
   - 覆盖右键即时 reveal；
   - 覆盖 quiz 页整页禁用；
   - 覆盖涂鸦态透传；
   - 覆盖跨根块选区拒绝创建。
2. 扩展 `testing/tests/slides-runtime.test.js`
   - 验证 `stepFragment()` 在 quiz-free slide 上会 fallback 到普通页面宿主；
   - 验证 slide 含 quiz 时不会 fallback 到普通页面宿主。
3. 扩展 `testing/tests/annotation-store.test.js`
   - 验证普通页面含隐藏片段的根块会被收集到 sidecar；
   - 验证 file:// / http(s) 恢复路径不受影响；
   - 验证瞬时 reveal 状态不会落盘。
4. 扩展 `testing/tests/quiz-annotation-runtime.test.js`
   - 验证 quiz 内部现有 reveal / toolbar / contextmenu 行为未回归；
   - 如果抽取共享协议，补充“quiz 旧 DOM 结构仍可正常工作”的回归断言。

人工测试建议：

1. Gate A：普通页面宿主 + 作者态入口完成后，先暂停后续功能，给用户一个 quiz-free 可体验入口。
   - 优先入口：`七选五理论论述.html`；
   - 如果该 deck 无法覆盖表格或总结区，再补一个临时 smoke deck 到 `d:/Projects/Intermediate Products/global-richtext-stepping-smoke.html`。
2. Gate B：持久化与 quiz 冲突隔离完成后，再给用户一个 mixed/quiz 可体验入口。
   - 入口：`高考英语阅读实战.html`，重点看“有 quiz 的页面整页禁用普通隐藏标注规则”。

两次人工测试闸口都必须使用同一组固定 askQuestions 选项顺序：

1. 继续按计划实现下一个模块 / 阶段
2. 先做本阶段的 review / debug / verification
3. 先让我手动测试这个功能 / 请先给我可体验实例
4. 本功能讨论结束，继续下一个功能 / 阶段
5. 结束对话 / 本轮到此为止
6. 其他 / 自定义补充（请直接输入）

## 8. 关键代码设计点

1. 二级步进分发必须使用“当前组件优先，普通页面宿主 fallback”的模式，而不是把普通页面宿主也塞进一级步进队列。
2. 普通页面隐藏型标注不新增外层 anchor 容器，直接以 `.rt-hidden-fragment[data-fragment-step="true"]` 作为 hover / 右键 / reveal 目标，减少普通文本结构入侵。
3. reveal 顺序必须按“slide 内普通 `data-edit-id` 根块 DOM 顺序 + 根块内片段组顺序”计算，不能依赖用户编辑顺序或 sidecar 写入顺序。
4. `data-fragment-group` 必须继续作为“一次 reveal 一整组格式”的唯一标识；多层叠加样式仍应被视作一次 reveal。
5. 普通页面与 quiz 共享 `data-fragment-*` 协议和 `qa-fragment-visible` 临时状态，但宿主类名与工具条语义必须区分，避免 UI 混淆。
6. 普通页面隐藏片段变更后必须双写 `PersistenceLayer` 与 `AnnotationStore`，否则两条恢复链路会出现先后覆盖。
7. 任何跨 `data-edit-id` 根块的选区都必须被拒绝，且拒绝逻辑必须发生在显示工具条之前，而不是等写 DOM 时再失败。
8. quiz 页整页禁用必须放在最外层分发处，而不是仅在右键或 hover 某一个分支里局部处理，否则会出现规则不一致。

### 8.1 必须补详细中文注释的代码段

以下位置必须补充详细中文注释，不能只写字面行为：

1. `slides-runtime.js` 中普通页面宿主 fallback 与 quiz 页早退分支：
   - 要说明为什么普通页面宿主不进入一级交互队列；
   - 要说明为什么 quiz 页要整页禁用普通宿主。
2. `annotation-fragment-protocol.js` 中片段分组、`qa-fragment-visible` / `data-fragment-manual-reveal` 的职责边界：
   - 要说明 authored 状态和运行时瞬时状态为什么分离；
   - 要说明多格式叠加为何按 group 一次 reveal。
3. `page-richtext-annotation-runtime.js` 中普通页面 DOM 顺序扫描、涂鸦态透传、slide 级状态缓存：
   - 要说明为什么顺序权威是 DOM，而不是用户点击顺序；
   - 要说明 doodle 透传为什么要做兼容分支。
4. `editor-rich-text.js` 中单根块选区限制与工具条显隐：
   - 要说明为什么跨根块直接拒绝；
   - 要说明为什么 quiz 内部继续走组件专属作者态工具条。
5. `annotation-store.js` 与 `editor-persistence.js` 中普通页面根块的收集 / 恢复 / 瞬时状态清洗：
   - 要说明为什么普通隐藏标注采用整块镜像而不是局部 patch；
   - 要说明为什么需要双写 localStorage 与 sidecar；
   - 要说明哪些 reveal 标记不能写回文件。
6. 任何“普通页面宿主在 quiz 页禁用”的兼容性判断：
   - 要说明这是为了保持左右键、右键、hover 三条规则的一致性，而不是只为规避一次按键冲突。

## 9. 受影响的文件 / 目录（如果能判断）

### 9.1 高概率修改

1. `assets/slides-runtime.js`
2. `assets/editor-rich-text.js`
3. `assets/editor-persistence.js`
4. `assets/annotation-store.js`
5. `assets/quiz-annotation-runtime.js`
6. `assets/components.css`
7. `assets/editor.css`
8. `七选五理论论述.html`
9. `高考英语阅读实战.html`

### 9.2 视前置核查结果而定

1. `assets/editor-core.js`
   - 若普通正文型节点仍大量依赖 `_auto_...` id，则需要提前补稳定标识策略。
2. 其他未列出的 deck HTML
   - 若仓库内还有 quiz-free deck 需要支持普通隐藏型标注，则也要补脚本接入。

### 9.3 建议新增

1. `assets/annotation-fragment-protocol.js`
2. `assets/page-richtext-annotation-runtime.js`
3. `testing/tests/page-richtext-annotation-runtime.test.js`

### 9.4 允许放在中间产物目录的临时验证文件

1. `d:/Projects/Intermediate Products/global-richtext-stepping-smoke.html`
2. `d:/Projects/Intermediate Products/global-richtext-stepping-smoke.annotations.js`
3. 如需辅助排查 DOM 恢复问题，可再加一个一次性脚本，例如 `d:/Projects/Intermediate Products/check_global_richtext_step_dom.js`

## 10. 风险点与注意事项

1. `data-edit-id` 稳定性是本任务最大的根风险。如果普通正文节点仍依赖运行时临时 id，隐藏型标注的恢复将不可靠。
2. 普通页面隐藏型标注与顶部普通富文本可能共处同一个根块。若不双写 localStorage 与 sidecar，任一恢复链路都可能覆盖另一条链路的更新。
3. quiz-free deck 当前可能没有加载 `annotation-store.js`。如果实现时只改运行时、不补 deck 接入，普通页面本地持久化不会生效。
4. 普通页面宿主如果错误进入一级步进队列，会打乱现有组件的上下键焦点顺序，且用户必须先“聚焦宿主”才能左右键 reveal，这与需求不符。
5. 若只在某个分支里局部屏蔽 quiz 页普通逻辑，容易出现“左右键禁了，但右键和 hover 还在工作”的不一致回归。
6. 涂鸦模式下如果没有做 `elementFromPoint` 透传，普通隐藏片段的右键 reveal 会被 doodle 覆盖层吞掉。
7. CSS 层若直接复用 quiz 专用选择器，会把普通页面的隐藏型标注绑定到 `.text-anchor` / `.answer-anchor` 结构，导致后续维护困难。
8. 如果在实现时顺手把共享协议抽得过重，极易把 quiz 的批注气泡、连线、提交流程耦合进去，违背本轮“共享协议型”的边界。

## 11. 验收标准

1. 顶部普通富文本工具栏的行为完全保持原样，放映模式下直接显示，不受隐藏型标注影响。
2. 普通页面在编辑模式下选中单个 `data-edit-id` 根块内文本时，会出现带“隐藏型标注”文字提示的浮动工具条。
3. 普通页面在放映模式和涂鸦模式下，隐藏型标注默认隐藏，只保留基础文本可读性。
4. quiz-free 页面中，鼠标右键可以即时 reveal 普通隐藏型标注，左右键可以按整页普通文本 DOM 顺序 reveal / rollback。
5. 页面只要含有 `quiz-annotation`，普通隐藏型标注的左右键、右键、hover 提示全部失效，quiz 原能力保持原状。
6. 普通页面隐藏型标注不能跨 `data-edit-id` 根块创建；跨根块选区时不出现工具条，也不产生 DOM 修改。
7. 普通页面隐藏型标注会写入同一个 `.annotations.js` 文件，并在重新打开课件后恢复；reveal 瞬时状态不会被持久化。
8. 顶部普通富文本既有的 localStorage / 导出链路继续工作，不出现导出后丢失普通富文本的回归。
9. `quiz-annotation` 内部既有富文本标注功能、步进、右键 reveal、工具条、提交后激活逻辑均无行为回归。
10. 实现代码中已补齐计划要求的详细中文注释，尤其是分发、持久化、选区限制、兼容性分支和 quiz 隔离逻辑。

## 12. 建议的测试与验证方式（遵循 Superpowers TDD 流程）

### 12.1 实现阶段的 TDD 切入方式

实现阶段不再额外要求一轮独立的“改代码前最小验证”。进入编码前只保留 M0 的结构性核查；一旦进入具体模块，就直接按当前切片的 TDD 循环推进。

建议切入方式如下：

1. M0 完成后，先确定当前模块最贴近的 focused test 入口，而不是先跑一整组与当前切片无关的回归集。
2. 每一轮实现都遵循同一个最小循环：
   - 为当前行为补一个 failing test；
   - 运行该测试，确认失败原因与需求一致；
   - 写最小实现让该测试通过；
   - 只回跑当前切片关联的 focused tests，确认没有把同模块行为带坏。
3. 如果某个风险点暂时没有现成测试文件，就先补最小测试承载，再进入实现；不要先写生产代码。
4. `data-edit-id` 稳定性、脚本接入点、代表性 deck 覆盖范围这类问题仍在 M0 中核清，但它们属于结构性前置条件，不再表述为额外测试层。

### 12.2 按模块推进的 focused tests

建议按 TDD 逐步补以下测试，并且每一轮优先运行当前切片所需的最小组合：

1. `node --test tests/page-richtext-annotation-runtime.test.js`
2. `node --test tests/slides-runtime.test.js tests/page-richtext-annotation-runtime.test.js`
3. `node --test tests/annotation-store.test.js tests/page-richtext-annotation-runtime.test.js`
4. `node --test tests/quiz-annotation-runtime.test.js tests/page-richtext-annotation-runtime.test.js`

推荐顺序：

1. 先为普通页面宿主补最小 failing test；
2. 再补 `slides-runtime` 的 fallback / quiz 禁用断言；
3. 接着补 `AnnotationStore` 的普通根块收集 / 恢复断言；
4. 最后补 quiz 回归断言。

执行细则：

1. 每一轮只跑当前切片相关的最小测试组合，不要求在每个小切片之前都先跑一整组旧测试。
2. 当切片横跨两个边界文件时，可以临时组合 2 个测试文件一起跑，但不要无差别扩大到全量回归。
3. 只有在阶段收口或人工测试前，才升级到更宽的聚合验证。

### 12.3 实现后的回归验证

自动化回归：

1. `cd d:/Projects/html-slides/testing`
2. `node --test tests/annotation-store.test.js tests/slides-runtime.test.js tests/quiz-annotation-runtime.test.js tests/page-richtext-annotation-runtime.test.js`
3. `npm run validate`

执行时机约束：

1. 上述聚合回归用于阶段收口、人工测试前、以及最终完成前，不要求在每个小切片后都执行。
2. `npm run validate` 作为仓库级验证，只在阶段收尾或最终交付前跑一次即可。

人工体验回归：

1. quiz-free 入口：`七选五理论论述.html`
   - 验证标题栏、正文、卡片、总结区的隐藏型标注作者态与放映态；
   - 验证左右键顺序是否按整页 DOM 顺序；
   - 验证右键 reveal 与 hover 提示。
2. mixed / quiz 入口：`高考英语阅读实战.html`
   - 验证有 quiz 的页面普通隐藏型标注逻辑整页禁用；
   - 验证 quiz 自身左右键、右键和 hover 没有回归。
3. 涂鸦模式回归：
   - 验证普通页面宿主在 doodle 覆盖层上仍能正确右键 reveal；
   - 验证 quiz 页下普通宿主不会误触发。

## 13. 可选子 Agent 职责与协作建议

### 13.1 推荐分工

1. 主控 Agent
   - 负责执行 M0 前置 gate；
   - 决定何时进入人工测试闸口；
   - 在 Gate A / Gate B 之后决定继续实现、进入 review，还是暂停收集用户反馈。
2. 计划 Agent
   - 当前计划文档已完成；
   - 仅当稳定标识核查失败、需求边界改变，或主控 Agent 需要重排模块顺序时再介入。
3. 实现 Agent
   - 按 M1 -> M2 -> M3 -> M4 -> M5 -> M6 的顺序推进；
   - 除 M0 结构性核查外，严格按 Superpowers TDD 循环推进：先补 failing test，确认失败，再写最小实现并回跑当前 focused tests；
   - 过程中不要在 quiz 与普通页面之间做大范围重构。
4. 审查_Debug_验证 Agent
   - 在每个关键模块收口后跑对应 focused tests，并在 Gate A / Gate B 前执行聚合验证；
   - 重点审 quiz 回归、持久化漂移、跨根块选区、涂鸦态透传；
   - 在 Gate A / Gate B 前准备可体验入口与验证清单。

### 13.2 串并行建议

1. 必须串行：M0 -> M1 -> M2 -> M3 -> M4 -> M6。
2. 可部分并行：
   - M5 的 CSS 与 deck 接入可在 M1 接口稳定后，与 M2 后半段并行；
   - M6 的测试样板可在 M2 设计稳定后提前起草。
3. 不建议并行编辑的文件：
   - `assets/slides-runtime.js`
   - `assets/annotation-fragment-protocol.js`
   - `assets/page-richtext-annotation-runtime.js`
   - `assets/editor-rich-text.js`
   - `assets/annotation-store.js`

这些文件之间共享边界密集，若多 Agent 同时编辑，冲突概率高于收益。

### 13.3 阶段切换条件

1. M0 通过后，主控 Agent 才能把任务正式交给实现 Agent。
2. M3 完成且 quiz-free 入口可体验后，必须先走 Gate A askQuestions，不应直接继续后续模块。
3. M4/M5/M6 完成且 mixed / quiz 入口可体验后，必须先走 Gate B askQuestions，再决定是否进入收尾或下一个功能。
4. 全部自动化验证与人工回归通过后，再交审查_Debug_验证 Agent 做最终审查。