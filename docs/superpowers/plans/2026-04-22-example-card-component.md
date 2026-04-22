# Zone 2 例题组件计划文档

> 当前阶段：计划文档（仅规划，不含实现）
> 
> 计划日期：2026-04-22
> 
> 需求来源：`开发者文档/例题组件需求文档.md`
> 
> 推荐组件命名：`example-card`
> 
> 建议交接对象：主控 Agent 在确认残余风险后，按“基线窄测试 -> 新增 failing tests -> 实现 -> review”顺序推进。

> 术语约定：本文对新组件统一使用“富文本标注”这一称呼；只有在引用既有 `quiz-annotation` 组件、文件名或历史文档时，才保留“批注”旧称。

## 1. 项目背景

html-slides 当前的 Zone 2 已经形成“布局层与组件层物理解耦”的体系：布局由 `assets/zones/zone2-content.css` 的插槽与网格负责，组件应尽量以可嵌入任意布局插槽的独立单元存在，而不是再回到“一个组件自带一整页结构”的旧模式。

现有 `quiz-annotation` 组件虽然已经具备答题判分、提交后解锁批注、锚点 hover/右键、二级步进、编辑态浮条、音效适配、自动保存等能力，但它的定位是“独占整页的三栏重交互组件”，文档和运行时都明确绑定了 `layout-single`、沉浸式逃逸、中栏批注面板、连线与批注气泡。这与本次需求“新的独立 Zone 2 例题组件，可放进任意布局插槽，保留 collapse-card 的折叠/展开语义，但不把整个 quiz-annotation 塞进 collapse-card”存在明显边界差异。

同时，当前运行时已经提供了本次规划所需的几个关键基础设施：

- `assets/slides-runtime.js` 已有 `data-steppable`、`StepStrategies`、`registerStepStrategy()`、`stepForward()`、`stepBackward()`、`stepFragment()`，并且一级步进为 ↑↓，二级步进为 ←→。
- `assets/audio-runtime.js` 已有“全局 cue + 组件适配层”架构，但当前 cue 表中还没有 `correct.mp3` / `wrong.mp3` 对应的全局提示声。
- `assets/quiz-annotation-runtime.js` 已有“提交后再允许片段发现”“锚点 hover/右键”“编辑模式工具条”“片段分组与二级步进”的成熟实现，可作为复用或按边界抽取的来源。
- `testing/package.json` 与现有 jsdom 测试已经证明仓库适合先做窄基线验证，再以 TDD 方式为新组件补 focused failing tests。

因此，本计划采用“独立组件 + 专属 CSS/运行时/音频适配层 + 精准复用现有能力”的路线，而不是把 `quiz-annotation` 的整套布局和重交互机制直接嵌入新组件。

## 2. 项目目标

1. 新增一个独立的 Zone 2 例题组件，能够放入任意布局插槽，而不是绑定 `layout-single` 或整页沉浸式结构。
2. 保留 `collapse-card` 的折叠/展开交互语义：前半部分承载题干与作答区，展开后的下半部分承载解析区。
3. 组件支持 V1 题型范围内的基础答题能力：单选、多选，以及“提交后直接显示正确答案”的填空型展示。
4. 提交答案后完成判分结果呈现、播放正确/错误音效，并解锁题干/原文与选项文本范围内的富文本标注能力。
5. 与现有步进系统兼容：↑↓ 只负责组件一级步进与组件间切换，←→ 只负责当前焦点例题组件内部的富文本标注片段步进，不能串扰其他组件。
6. 在编辑模式下，尽量复用现有富文本工具条与选区机制，但严格控制与 `quiz-annotation` 整体结构的耦合。
7. 为后续实现预先定义清晰的验证闭环：正式改代码前先跑基线窄测试，再通过 TDD 写 focused failing tests，再写实现。

## 3. 非目标

1. 不复用 `quiz-annotation` 的三栏布局、中栏批注面板、SVG 连线、沉浸式逃逸与整页独占结构。
2. V1 不把富文本标注范围扩展到解析区；解析区只承担折叠后的讲解展示。
3. V1 不新增新的全局步进模型，也不改写 `slides-runtime.js` 的一级/二级步进语义。
4. V1 不新增第二套与 `AnnotationStore` 平行的持久化协议；本地持久化应直接复用与 `quiz-annotation` 一致的 `.annotations.js` 侧车方案，保证课件被反复打开时仍能恢复标注修改。
5. V1 不覆盖 `quiz-annotation` 现有的右侧答题面板、批注气泡拖拽、左右双端点连线等重交互特性。
6. V1 不追求一次性抽象出完整的“通用富文本标注引擎”；只有在实现期出现明确重复、且测试可以稳定覆盖时，才允许做小范围共享抽取。

## 4. 用户需求说明

| 需求维度 | 已确认需求 | 计划中的落地解释 |
| --- | --- | --- |
| 组件定位 | 新的独立 Zone 2 例题组件 | 使用独立根类 `.example-card`，独立 CSS/JS，不嵌入 `quiz-annotation` 外壳 |
| 结构语义 | 保留 collapse-card 的折叠/展开语义 | 题干与作答区常驻，解析区通过专属展开按钮控制，可随时打开 |
| 布局能力 | 可放进任意布局插槽 | 组件宽度、外边距、滚动边界遵守 Zone 2 纯组件约定，不依赖整页布局 |
| 判分行为 | 提交答案负责判分、播放音效、解锁富文本标注能力 | 提交触发统一状态机：判分 -> 反馈 UI -> 调用音频适配层 -> 打开富文本标注交互 |
| 富文本标注范围 | 题干/原文 + 选项文本；当前不覆盖解析区 | 只扫描 `.example-card` 内题干与选项区域的 `.example-anchor` |
| 一级步进 | ↑↓ 处理组件之间切换/组件互动 | 新组件通过 `data-steppable="example-card"` 接入一级步进；不改变全局热键定义 |
| 二级步进 | ←→ 只控制当前焦点组件内部富文本标注步进 | 片段 reveal 状态按组件实例隔离，不能跨卡片共享索引 |
| 编辑模式 | 选中文本自动弹出富文本工具条 | 复用现有编辑选区/工具条机制，但工具条作用域限定在例题组件内部 |
| 音效 | 必须使用 `sound/correct.mp3` 与 `sound/wrong.mp3` | 通过 `audio-runtime.js` 新增全局 cue，再由 `example-card-audio.js` 做语义适配 |
| 本地持久化 | 富文本标注需要本地保存，且课件复用后再次打开不能丢失修改 | 直接复用 `AnnotationStore` / `.annotations.js` 侧车方案，并把例题组件的标注与答案配置纳入同一恢复链路 |
| 标注形态 | 只有标注，没有完整批注面板，也没有连线 | 标注内容紧跟所标注的文字主体出现，只保留锚点、hover/右键与片段步进 |
| V1 操作 | 组件内提供重做/重置按钮 | 重置清空作答结果、判分状态与片段 reveal 状态，但不破坏作者已写好的富文本标注结构 |

## 5. 技术路线概述

### 5.1 推荐路线

采用“独立组件结构 + 专属运行时 + 专属音频适配层 + 精准复用现有能力”的路线：

1. 新建 `assets/zones/zone2-example-card.css` 负责例题组件的结构与视觉样式。
2. 新建 `assets/example-card-runtime.js` 负责组件状态机、题型判分、提交后解锁富文本标注、一级/二级步进接入、展开/重置交互。
3. 新建 `assets/example-card-audio.js` 负责把“答对/答错/重置”等组件语义映射到 `AudioRuntime` 的全局 cue。
4. 修改 `assets/audio-runtime.js`，新增面向答题结果的全局 cue，使用仓库现有 `sound/correct.mp3` 与 `sound/wrong.mp3`，而不是在组件运行时里硬编码媒体路径。
5. 复用 `assets/annotation-store.js` 的 sidecar 持久化协议，让例题组件的标注内容与答案配置能够和 `quiz-annotation` 一样跨次打开恢复。
6. 只在必要处修改 `assets/slides-runtime.js`，使其能稳定识别 `.example-card` 并把一级/二级步进分层交给新策略。

### 5.2 视觉复用边界

视觉层优先复用现有 `quiz-annotation` 的成熟 token 与轻量选择器，而不是复制其整页布局：

- 选项区域优先沿用 `.qa-option`、`.qa-status-dot`、`.qa-option-label`、`.qa-option-text` 的视觉语言。
- 提交按钮应复用 `.qa-submit-btn` 的品牌色、阴影和反馈节奏，但形态改为与 `.collapse-action-btn` 同源的圆形按钮，固定在卡片右下角，并与解析展开按钮并列；重置按钮在已提交态进入同一按钮组。
- 富文本标注锚点统一为 `.example-anchor`，hover 高亮必须继续使用 `--brand-secondary` 与 `--brand-secondary-rgb`。
- 解析区与组件壳层仍应保持 `collapse-card` 风格的折叠语义，但样式文件独立，避免把大量新选择器堆进 `zone2-quiz-annotation.css`。

### 5.3 运行时复用边界

运行时只复用下列能力，不复用 `quiz-annotation` 的完整结构假设：

- 提交后再允许富文本标注片段发现与 hover/右键交互。
- 锚点内片段的二级步进与 reveal/rollback。
- 编辑模式下的选区缓存、浮条定位、片段分组。
- `AudioRuntime` 的全局 cue 调用协议。

明确不复用的部分：

- 中栏批注气泡列表。
- 左右双端点连线。
- 仅适用于单个整页组件的全局单例状态。
- `quiz-annotation` 的沉浸式逃逸、局部滚动结构与三栏 DOM 约束。

### 5.4 共享抽取策略

默认先不新增“通用富文本标注引擎”文件，避免过早抽象。如果实现阶段出现以下同时满足的情况，再考虑新增一个小型共享 helper（例如 `assets/annotation-fragment-runtime.js`）：

1. `example-card-runtime.js` 与 `quiz-annotation-runtime.js` 出现超过一个清晰、稳定、可测试的重复片段；
2. 这些重复逻辑不依赖三栏布局、批注气泡或连线；
3. 可以通过现有 jsdom 测试为抽取后的接口补齐双端回归测试。

如果达不到以上条件，宁可保留少量受控重复，也不要把整份 `quiz-annotation-runtime.js` 直接耦合进新组件。

### 5.5 本地持久化路线

这一项需要明确纳入 V1，而且要直接与 `quiz-annotation` 对齐：

1. 例题组件的题干、选项文本、富文本标注结构与答案配置都应纳入 `AnnotationStore` 的收集与恢复范围，而不是只依赖 localStorage 草稿。
2. 继续复用现有 `.annotations.js` 侧车协议，以及 `file://` 脚本注入恢复、HTTP(S) sandbox iframe 恢复这两条成熟链路，不再额外发明第二套持久化机制。
3. 新组件运行时必须复用现有“清理临时放映态”的设计原则：提交态、重置后的课堂状态、fragment reveal 临时类名都不能被原样写回 sidecar。
4. `data-edit-id` 仍然有价值，但它在这里的角色应改为“帮助收集与定位需要持久化的 DOM 容器”，而不是替代 sidecar 方案本身。

## 6. 模块拆分

| 模块 | 主要职责 | 预期文件 | 串并行关系 |
| --- | --- | --- | --- |
| 组件结构契约 | 定义例题组件 DOM、状态类名、题型数据属性 | `references/component-templates.md`，新组件 HTML 片段，`assets/example-card-runtime.js` | 必须最先确定，后续模块都依赖它 |
| 视觉样式模块 | 组件壳层、题干/选项/解析区、提交态/重置态、锚点 hover 样式 | `assets/zones/zone2-example-card.css` | 在结构契约稳定后可与音频模块并行 |
| 判分与状态机模块 | 单选/多选判分、填空 reveal、提交/解锁/重置 | `assets/example-card-runtime.js` | 依赖结构契约，和测试模块串行推进 |
| 富文本标注与片段模块 | hover/右键、二级步进、编辑态浮条、片段顺序与 reveal 状态；只做紧贴文本主体的标注，不做独立批注面板 | `assets/example-card-runtime.js`，必要时小范围共享 helper | 依赖结构契约与状态机，需与步进模块协同 |
| 音频模块 | 正确/错误 cue 扩展与组件适配层 | `assets/audio-runtime.js`，`assets/example-card-audio.js` | 结构契约确定后可并行，但最终要由运行时状态机接线 |
| 步进接入模块 | `data-steppable` 自动识别、一级/二级步进边界接入 | `assets/slides-runtime.js`，`assets/example-card-runtime.js` | 必须晚于状态机与片段模块接口稳定后落地 |
| 测试与文档模块 | 基线验证、failing tests、运行时测试、文档同步 | `testing/tests/*.test.js`，相关开发文档 | 必须全程跟进；测试先于实现，文档收尾 |

## 7. 每个模块的实现思路

### 7.1 组件结构契约模块

推荐采用如下分层结构：

- 根元素：`.example-card`
- 前半部分：`.example-card__main`，承载题干、选项/填空、操作栏
- 后半部分：`.example-card__analysis`，承载解析内容，默认折叠
- 操作栏：右下角圆形按钮组，至少包含提交按钮与展开/收起解析按钮；重置按钮在已提交态进入同一按钮组
- 富文本标注容器：题干与选项文本中统一使用 `.example-anchor` 作为片段锚点容器

建议的状态类：

- `.is-expanded`：解析区展开
- `.is-submitted`：已提交
- `.is-correct` / `.is-incorrect`：判分结果
- `.richtext-unlocked`：富文本标注能力已解锁
- `.is-step-active`：当前一级步进聚焦到该组件

建议在题型层面预留 `data-question-type="single|multiple|blank"`。单选/多选复用 `qa-option` 体系，填空型使用专属 blank slot 标记正确答案来源，但仍纳入统一提交/重置状态机。

### 7.2 视觉样式模块

`zone2-example-card.css` 应遵守“可嵌入任意布局插槽”的纯组件规则：

1. 组件本身只负责内部排版与状态样式，不定义宿主级 grid/flex 布局。
2. 根元素宽度与间距遵守现有 Zone 2 通用组件约定，避免和插槽布局冲突。
3. 前半部分延续答题交互的视觉识别度，后半部分延续 collapse-card 的折叠语义。
4. 提交按钮与折叠按钮在右下角以圆形按钮组呈现，视觉上保持同源但语义不同：一个负责提交结果，一个负责展开解析。
5. 提交前不显示富文本 hover 高亮；提交后才允许 `.example-anchor` 呈现品牌第二色高亮。
6. 解析区与富文本标注区视觉上要明确分层，避免学生误把“解析展开”理解成“富文本标注已解锁”。

如果需要从 `zone2-quiz-annotation.css` 复制少量样式，必须在新文件中重新按 `.example-card` 根作用域封装，避免直接复用过深的 `.quiz-annotation ...` 级联路径造成样式串扰。

### 7.3 判分与状态机模块

`example-card-runtime.js` 需要维护一个组件级状态机，而不是沿用 `quiz-annotation` 当前那种假定“每页只有一个重量级组件”的全局单例写法。推荐使用 `WeakMap<HTMLElement, State>` 维护每个组件实例的状态，至少包含：

- 当前题型
- 当前选中答案 / 已 reveal 的 blank 内容
- 是否已提交
- 判分结果
- 是否已解锁富文本标注
- 当前片段游标
- 当前是否为一级步进焦点

提交逻辑建议统一走一条入口：

1. 读取当前组件的作答状态。
2. 按题型执行判分或 reveal。
3. 写入 `.is-submitted`、`.is-correct` / `.is-incorrect`、`.richtext-unlocked`。
4. 调用 `ExampleCardAudio` 播放结果 cue。
5. 解锁富文本标注锚点 hover/右键与二级步进。

重置逻辑建议只回滚“课堂交互态”，不破坏作者已写好的结构性标注：

- 清空学生选择与 blank reveal 结果。
- 去掉提交结果类名。
- 清空当前组件内部的 fragment reveal 状态与光标。
- 重新锁定富文本标注能力。
- 不删除作者已配置的 `.example-anchor` 与片段标记。

### 7.4 富文本标注与片段模块

例题组件的富文本标注模型建议采用“只有锚点，没有中栏批注气泡”的轻量方案：

1. 题干/原文与选项文本统一使用 `.example-anchor`。
2. 锚点内部继续允许 `data-fragment-step="true"` 片段分组。
3. 如果实现期确实需要区分“题干锚点”和“选项锚点”，优先用 `data-anchor-scope` 之类的轻量属性，而不是重新拆回两套类名体系。
4. 片段顺序以“当前组件内部 DOM 顺序”为唯一权威，不扫描其他组件，更不扫描解析区。
5. 标注内容的呈现应紧贴对应文字主体本身，不额外生成中栏批注列表、悬浮批注面板或 SVG 连线。

hover、右键与二级步进都必须受 `richtext-unlocked` 约束：

- 未提交：hover 不能高亮、右键不能 reveal、←→ 不能推进片段。
- 已提交：hover 可以临时高亮可揭示片段，右键可做临时 reveal，←→ 只影响当前一级焦点组件内部的片段。

编辑模式下的实现建议：

1. 复用 `editor-rich-text.js` / `editor-core.js` 现有选区缓存与格式操作能力。
2. 复用 `quiz-annotation` 已经验证过的“工具条挂到 `document.body` 顶层宿主，避免 overflow 裁切”的策略；推荐整个页面共享一个高图层工具条宿主，而不是每个组件各挂一套局部浮层。
3. 只允许在 `.example-card__main` 范围内建立或编辑富文本标注锚点与片段；解析区暂不纳入。
4. 题干与选项文本容器应放入 `data-edit-id` 范围内，方便 `AnnotationStore` 收集与恢复对应 DOM 片段。
5. 直接接入 `AnnotationStore` / `.annotations.js` 侧车链路，而不是只依赖 localStorage 草稿；实现时要明确哪些类名与属性属于临时放映态，保存前必须剥离。

### 7.5 音频模块

推荐在 `audio-runtime.js` 新增两个全局 cue，命名尽量保持可复用，而不是绑死在单一组件名上：

- `answer-correct` -> `sound/correct.mp3`
- `answer-wrong` -> `sound/wrong.mp3`

推荐在 `example-card-audio.js` 中再包一层组件语义接口，例如：

- `playSubmitResult({ isCorrect })`
- `playReset()`（可选，V1 不强制）

这样一来，组件运行时只关心“当前结果语义”，不关心具体音频资源路径；未来如果别的答题组件也需要结果音效，可以直接复用相同的全局 cue。

### 7.6 步进接入模块

步进接入建议遵守“一级步进负责组件焦点与提交后解析展开，二级步进负责组件内部片段”的清晰分层：

1. 在 `slides-runtime.js` 中为 `.example-card` 增加自动打标，统一设置 `data-steppable="example-card"`。
2. 在 `example-card-runtime.js` 中注册 `registerStepStrategy('example-card', strategy)`。
3. 未提交前，`forwardTopLevel()` / `backwardTopLevel()` 不能通过 ↑↓ 提前展开解析；这时一级步进只负责把焦点落到当前例题组件。
4. 已提交后，`forwardTopLevel()` / `backwardTopLevel()` 才允许把解析区纳入一级步进：推荐正向展开、反向收起，并且这部分状态只作用于当前组件。
5. `stepFragment()` 只处理当前焦点组件内部、已解锁的锚点片段 reveal/rollback。
6. 组件运行时在用户点击提交、重置、展开解析或选项时，可主动调用 `window.activateInteractionStepForElement(root)`，确保当前交互不会把一级焦点留在别的组件上。

之所以要把“解析展开/收起”延后到提交之后再接入一级步进，是因为课堂流程上必须先完成作答，再允许用 ↑↓ 快捷揭示解析。实现时需要用详细中文注释写清：提交前为什么禁止用一级步进展开解析，提交后又为什么允许把解析展开/收起纳入当前组件的一层状态。

### 7.7 测试与文档模块

测试上建议新增 `testing/tests/example-card-runtime.test.js` 作为主测试文件，并对以下现有测试做针对性增量：

- `testing/tests/audio-runtime.test.js`：验证 `answer-correct` / `answer-wrong` cue 定义与播放路径。
- `testing/tests/slides-runtime.test.js`：验证 `.example-card` 自动接入步进队列、一级/二级步进边界不串扰。
- `testing/tests/annotation-store.test.js`：补 sidecar 收集与恢复测试，验证例题组件的标注 DOM、答案配置与临时放映态剥离规则。

文档上至少同步以下位置：

- `references/component-templates.md`：新增组件模板与插槽示例。
- `开发者文档/布局与组件开发文档.md`：登记新的 Zone 2 组件与插槽约束。
- 如实现期抽取了通用富文本标注 helper，再补充到相应开发文档，明确它与 `quiz-annotation`、`example-card` 的归属关系。

## 8. 关键代码设计点

### 8.1 建议的数据与 DOM 契约

建议采用如下约定，保持结构可读、测试可控、后续扩展也容易：

```html
<div class="example-card" data-question-type="single">
  <div class="example-card__main">
    <div class="example-card__stem">
      <span class="example-anchor" data-anchor-id="ex-01">...</span>
    </div>
    <div class="example-card__answers">
      <div class="qa-option" data-option="A" data-correct="true">
        <span class="qa-option-label">A</span>
        <span class="qa-option-text"><span class="example-anchor" data-anchor-id="ex-02">...</span></span>
      </div>
    </div>
    <div class="example-card__actions">...</div>
  </div>
  <div class="example-card__analysis">...</div>
</div>
```

其中：

- 新组件统一使用 `.example-anchor`，避免再区分正文锚点与选项锚点两套类名。
- 如需复用现有 helper，可在运行时内部做轻量适配，但不建议把 `data-link` / `data-link-answer` 继续暴露为新组件的主要 DOM 契约。
- 根元素状态只通过类名表达，不建议把复杂状态写成难维护的层层 `data-*` 布尔值。

### 8.2 多实例隔离

这是本次实现的核心设计点之一。与 `quiz-annotation` “通常一页一个大组件”的前提不同，例题组件可以在同一页出现多个，也可以与 collapse-card、flip-card、summary 等组件混排。因此：

1. 不能使用全局单例索引记录当前例题组件的 fragment 游标。
2. 不能用无作用域的 `document.querySelector('.example-card')` 读取状态。
3. 任何 hover/右键/←→ reveal 操作都必须先定位“当前一级焦点组件”，再只扫描该组件内部的 `.example-anchor`。

推荐所有实例态都落在 `WeakMap` 中，键为组件根元素。

### 8.3 提交、解锁、重置三段式状态机

需要显式区分三个阶段：

1. 未提交：可作答、可展开解析、不可用富文本标注，且 ↑↓ 不能提前展开解析。
2. 已提交：结果已确定、已播放音效、富文本标注已解锁，此时一级步进才允许展开/收起解析。
3. 已重置：回到未提交，但保留作者态的富文本标注结构与解析内容。

这三段式状态机必须写详细中文注释，尤其要说明“为什么解析按钮可随时使用，但提交前不能被 ↑↓ 一级步进提前揭示”“为什么富文本标注只能提交后解锁”“为什么重置要清 reveal 状态但不能删作者态锚点”。

### 8.4 一级/二级步进边界

`slides-runtime.js` 当前已经把 ↑↓ 与 ←→ 的职责分清。本次实现的代码注释必须明确写清：

- ↑↓ 在提交前只切换组件焦点；提交后才允许对当前组件执行解析展开/收起。
- ←→ 只在当前焦点组件且已解锁富文本标注时，推进/回退片段 reveal。
- 解析区展开不是二级步进的一部分，但在提交后会成为一级步进的组件内状态。

这部分中文注释必须解释“为什么提交前不能把展开解析算作一级步进、提交后为什么又允许”，否则后续维护者很容易为了“看起来顺手”重新把状态机搅乱。

### 8.5 编辑态浮条边界

编辑态相关逻辑至少要补充以下中文注释重点：

1. 工具条为什么挂到 `document.body` 而不是组件内部。
2. 选区缓存如何避免点击浮条后 Selection 丢失。
3. 为什么只允许在题干/选项区域建立富文本标注片段，不覆盖解析区。
4. 片段分组与 reveal 顺序为何要以组件内部 DOM 顺序为准。

## 9. 受影响的文件/目录

### 9.1 计划内新增文件

- `assets/zones/zone2-example-card.css`
- `assets/example-card-runtime.js`
- `assets/example-card-audio.js`
- `testing/tests/example-card-runtime.test.js`

### 9.2 计划内修改文件

- `assets/slides-runtime.js`：为新组件增加自动打标或最小接入点。
- `assets/audio-runtime.js`：新增正确/错误全局 cue。
- `testing/tests/audio-runtime.test.js`：补 cue 定义与播放测试。
- `testing/tests/slides-runtime.test.js`：补自动打标与步进边界测试。
- `references/component-templates.md`：新增组件模板。
- `开发者文档/布局与组件开发文档.md`：登记新组件与插槽限制。
- `七选五理论论述.html`：最终联调与人工验收时，新增一页例题组件进行真实课件验证。

### 9.3 计划中默认不应直接修改的文件

- `assets/quiz-annotation-runtime.js`
- `assets/zones/zone2-quiz-annotation.css`

只有在实现中出现“明确可复用、且测试能覆盖的共性逻辑”时，才允许对以上文件做受控抽取；否则应保持边界稳定，避免新组件反向污染旧组件。

### 9.4 计划中通常无需重写、但需要显式复用其能力的文件

- `assets/annotation-store.js`
- `assets/editor-persistence.js`
- `assets/editor-core.js`

按当前推荐路线，应优先复用 `annotation-store.js` 的 sidecar 收集与恢复能力，并只在例题组件确实缺少收集入口时做最小修改。`editor-core.js` 与 `editor-persistence.js` 仍然是编辑态和导出清洗的重要边界，但不应再承担“替代 sidecar 持久化”的职责。

### 9.5 参考但不需要新增资源的目录

- `sound/`：`correct.mp3` 与 `wrong.mp3` 已存在，无需新增媒体文件。
- `testing/`：现有测试命令与 jsdom 基础设施可直接复用。

## 10. 风险点与注意事项

1. **AnnotationStore 接入范围必须一次定义清楚。** 如果只保存标注 DOM 而漏掉答案配置、提交锁定边界或重置后应剥离的临时类名，课件二次打开时会恢复成不完整状态。
2. **同页多实例状态串扰风险高。** 如果沿用全局变量式实现，两个例题组件在同一页会互相污染焦点、提交态或 fragment 游标。
3. **提交前后的一级步进语义容易写乱。** 当前规则已经改成“提交前 ↑↓ 不能提前揭示解析，提交后才允许用一级步进展开/收起”，如果实现时没有把这条规则写进状态机和测试，课堂流程会被直接破坏。
4. **编辑态工具条容易被布局裁切。** 组件可放进任意布局插槽，若工具条仍挂在组件内部，双栏/四宫格场景下很容易被 overflow 裁切。
5. **直接搬运 quiz CSS/JS 的代价很高。** 一旦把 `.quiz-annotation` 的多层级选择器或三栏运行时假设引入新组件，后续维护成本会迅速反噬。
6. **音频 cue 命名如果过于组件私有，会阻碍后续复用。** 因此更建议在 `audio-runtime.js` 用通用结果语义命名，再由组件适配层做翻译。
7. **标注必须继续保持“轻量且贴文”。** 用户已经明确这个组件没有完整批注，只有紧跟文字主体的标注；一旦实现期又引入独立批注面板或连线，就会重新跨进 `quiz-annotation` 的重量级边界。
8. **文档与模板不同步会造成后续 AI 生成 HTML 失真。** 新组件完成后，模板文档必须同步，否则后续生成器可能继续产出旧式结构。
9. **复杂逻辑中文注释不能省略。** 尤其是状态机、步进边界、选区恢复、片段顺序、本地持久化边界、重置回滚和填空 reveal 路径，若没有中文注释，后续维护成本会明显上升。

## 11. 验收标准

1. 新组件可以出现在 `layout-single`、`layout-2col`、`layout-grid-2x2` 等插槽中，不触发 `quiz-annotation` 式的整页沉浸逃逸，也不破坏布局。
2. 组件前半部分能完成单选/多选作答；提交后能给出明确结果态，并调用基于全局 cue 的正确/错误音效。
3. 解析区可以通过显式按钮在未提交和已提交两种状态下随时展开/收起；但一级步进只有在提交答案之后，才允许用 ↑↓ 对当前组件执行展开/收起。
4. 提交前，题干/选项中的富文本标注片段不能被 hover、右键或 ←→ 提前揭示；提交后，这些能力只在当前组件内生效。
5. 同一页存在多个例题组件时，↑↓ 只在组件级切换焦点，←→ 只控制当前焦点组件内部的片段 reveal，不影响其他例题组件或其他类型组件。
6. 重置按钮可以把组件恢复到未提交状态，并清空当前课堂交互态，但不会删除作者已制作的富文本标注锚点与片段结构。
7. 富文本标注的本地修改与答案配置可以通过 `.annotations.js` 侧车链路恢复，不会因为刷新或重新打开课件而丢失，也不会把临时 reveal 状态写回正式内容。
8. 新增或修改的复杂逻辑都补充了足够的中文注释，能解释实现原因、输入输出约束和易错边界。
9. 新增 focused tests 通过；被影响的窄测试仍保持通过。

## 12. 建议的测试与验证方式（含改代码前的最小验证）

### 12.1 改代码前的最小验证（必须先做）

在 `d:/Projects/html-slides/testing` 下先运行现有窄测试，确认当前步进、富文本标注底座、音效基础设施与 sidecar 持久化基线稳定：

```powershell
node --test tests/slides-runtime.test.js tests/quiz-annotation-runtime.test.js tests/audio-runtime.test.js tests/annotation-store.test.js
```

只有基线稳定后，才允许开始写新组件的 failing tests。这里的目的不是“跑全仓”，而是先确认本次实现依赖的三条底座没有先天回归。

### 12.2 TDD 入口（先红后绿）

建议先新增 `testing/tests/example-card-runtime.test.js`，用 jsdom 写 focused failing tests，最少覆盖以下场景：

1. `.example-card` 能被加入一级步进队列，并拥有独立的 `example-card` 步进策略。
2. 未提交时，hover/右键/←→ 不会揭示富文本标注锚点片段。
3. 已提交时，hover/右键/←→ 只作用于当前一级焦点例题组件。
4. 同页两个例题组件并存时，片段游标与 reveal 状态不串扰。
5. 单选/多选提交后分别触发正确/错误结果路径。
6. 重置后，提交态与 reveal 状态清空，但作者态锚点仍保留。
7. 解析展开/收起与提交状态互不耦合。
8. 富文本标注与答案配置写入 sidecar 后，`AnnotationStore` 恢复或再次打开课件时能取回 DOM，且临时 reveal 状态不会被持久化。

同时增补以下现有测试：

- `testing/tests/audio-runtime.test.js`：验证 `answer-correct` / `answer-wrong` cue 定义与文件映射。
- `testing/tests/slides-runtime.test.js`：验证自动打标与一级/二级步进边界。

### 12.3 实现后的回归验证

实现完成后，优先回跑同一批聚焦测试：

```powershell
node --test tests/example-card-runtime.test.js tests/slides-runtime.test.js tests/audio-runtime.test.js tests/annotation-store.test.js
```

如果实现阶段做了共享抽取，必须再补跑：

```powershell
node --test tests/quiz-annotation-runtime.test.js
```

因为这能最快暴露“为了复用而误伤旧组件”的回归。

### 12.4 手工验证建议

需要手工验证时，建议分成两层：

1. 前期行为排查仍可在 `d:/Projects/Intermediate Products` 下放置临时 HTML 或验证脚本，快速观察同页多组件边界。
2. 最终联调与用户侧验收时，在 `七选五理论论述.html` 中新增一页例题组件，按真实课件路径验证。
3. 联调页至少包含：例题组件，以及与其同页或邻页的普通 `collapse-card` / `flip-card`，以便确认步进与样式不会串场。
4. 手工验证以下行为：
  - ↑↓ 是否只切换一级焦点；
  - 提交前 ↑↓ 是否不会提前揭示解析，提交后 ↑↓ 是否只控制当前例题组件的展开/收起；
  - ←→ 是否只控制当前例题组件内部富文本标注片段；
  - 提交后音效是否正确，且编辑模式静音；
  - 解析区展开是否不影响提交状态；
  - 重置后是否只回滚课堂交互态；
  - 写入 sidecar 后再次打开课件，标注与答案配置是否仍能恢复。

临时验证文件默认不进入正式仓库；但 `七选五理论论述.html` 中新增的最终联调页应视为真实验收样例来维护。

## 13. 可选子 Agent 职责与协作建议（如果合理）

### 13.1 推荐协作角色

- **计划 Agent**：当主控确认持久化边界、步进语义或共享抽取策略发生变化时，负责回写并收敛计划，不直接承担正式实现。
- **code-reviewer**：在实现完成且测试通过后，重点审查步进隔离、状态机清晰度、音效 cue 使用方式、本地持久化边界、中文注释质量与测试覆盖缺口。

### 13.2 建议的串并行方式

必须串行的部分：

1. 先确认组件结构契约、AnnotationStore 接入范围与提交后一级步进语义。
2. 先跑基线窄测试，再写 failing tests。
3. 先让 runtime 状态机与步进边界稳定，再接入音频与样式细节。

可以并行的部分（在结构契约稳定后）：

1. `zone2-example-card.css` 的样式实现。
2. `audio-runtime.js` 全局 cue 扩展与 `example-card-audio.js` 适配层。
3. 模板文档与开发文档的文字同步。

### 13.3 建议的质量门

1. **Gate 1：基线验证通过**
   现有窄测试稳定，才能开始新实现。
2. **Gate 2：failing tests 写完且确实失败**
   必须先看到红灯，再写实现。
3. **Gate 3：focused tests 转绿**
   新组件核心能力通过后，才允许继续做样式与文档收尾。
4. **Gate 4：code-reviewer 审查**
   审查重点不是格式，而是边界、回归和注释质量。

## 建议交接对象

建议交回主控 Agent，围绕 `AnnotationStore` 接入细节、提交后一级步进边界以及其余风险点继续收敛，然后按本计划进入实现与 review 阶段。本地持久化部分，当前计划已经明确改为直接复用 `AnnotationStore` / `.annotations.js` 侧车方案。