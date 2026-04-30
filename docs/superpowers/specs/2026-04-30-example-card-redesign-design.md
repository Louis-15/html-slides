# 例题组件首版重开发设计文档

> 当前阶段：设计文档（已完成需求澄清与首轮方案确认）
>
> 设计日期：2026-04-30
>
> 需求来源：开发者文档/例题组件需求文档.md、用户提供的 3 张目标截图、当前会话中的范围确认
>
> 已锁定约束：本轮只实现截图对应的核心体验；解析展开后的左右宽度比例为 5:3

## 1. 设计目标

在 html-slides 中实现一个全新的例题组件，用于单栏页面内的轻量题目讲解场景。首版目标不是一次吃下所有延伸能力，而是先把“提交前选择态、提交后判分态、编辑态修改正确答案”这三类核心体验做成一个稳定、可演示、可测试的基础版本。

新组件的第一性原则是：单栏页面专用、结构清晰、状态收敛、最小复用现有成熟能力，不把 quiz-annotation 的整页运行时模型整体搬过来。

## 2. 决策摘要

1. 新组件仍命名为 `.example-card`，DOM、状态与文件职责以本文为唯一设计约束。
2. 组件只服务单栏页面，不承担“任意布局插槽通用组件”的设计目标。
3. 视觉语言定向复用答题与批注组件里已经跑通的选项卡片样式，但复用边界只到选项微结构，不复用 quiz-annotation 的整页骨架、批注面板、步进策略与 sidecar 协议。
4. 解析区默认折叠隐藏；只有提交答案后才允许展开；展开后布局切换为左侧主区、右侧解析区的 5:3 双栏。
5. 作者态新增“正确答案”答案键条，直接对应截图中的 A/B/C/D 切换体验；作者不再通过手改底层属性来维护答案。
6. 本轮明确延后页内翻题、提交后富文本标注激活、sidecar 持久化、一级/二级步进接入等高风险能力，先把核心体验做稳。

## 3. 当前代码库现状与可复用边界

### 3.1 可以复用的成熟能力

1. `assets/audio-runtime.js` 已经提供全局 cue 注册与音频播放底座，适合承接“答对 / 答错”两类最小业务音效语义。
2. `assets/editor-core.js` 与现有编辑系统已经支持基于稳定 `data-edit-id` 的普通正文编辑，因此题干、选项文案、解析文案可以继续走当前编辑链路。
3. 现有 quiz 体系里的 `.qa-option`、`.qa-option-label`、`.qa-option-text` 这组微结构已经被验证过，可作为本轮选择题视觉与编辑态的最小复用点。

### 3.2 本轮刻意不复用的部分

1. 不复用 `quiz-annotation` 的整页三栏结构。
2. 不复用 `quiz-annotation-runtime.js` 的全局单例状态机。
3. 不在本轮接入 `AnnotationStore` 的 sidecar 收集与恢复链路。

## 4. 范围定义

### 4.1 本轮范围内

1. 全新单栏例题组件的 HTML 结构、CSS 状态样式与最小运行时。
2. 选择题的核心体验：提交前选择、提交后判分、解析展开、编辑态修改正确答案。
3. 填空题的最小体验：不提供学生手动输入，提交后直接回填正确答案。
4. 正确 / 错误两类音效接线，仅服务选择题提交结果。
5. 一个可直接手动体验的独立 demo 入口，用于人工测试闸口。
6. 对应的 focused tests，至少覆盖选择、提交、判分、编辑态答案切换几条主路径。

### 4.2 本轮范围外

1. 组件内部翻页与题目状态跨页保存。
2. 提交后激活富文本标注功能。
3. 例题组件内容写入 `.annotations.js` sidecar 的本地持久化。
4. 一级 / 二级步进系统接入。
5. 解析区内的复杂编辑态工具条、锚点、片段 reveal 等课堂讲评高级能力。

## 5. DOM 结构契约

首版组件采用“单根节点 + 主区 + 解析区”的清晰结构，不引入额外中间壳层。建议 HTML 契约如下：

```html
<section class="example-card" data-question-type="single" data-card-id="q24">
  <div class="example-card__main">
    <div class="example-card__editor-answer-key" data-editor-only="true" aria-label="正确答案编辑区">
      <span class="example-card__editor-label">正确答案</span>
      <button type="button" class="example-card__answer-key is-active" data-answer-value="A">A</button>
      <button type="button" class="example-card__answer-key" data-answer-value="B">B</button>
      <button type="button" class="example-card__answer-key" data-answer-value="C">C</button>
      <button type="button" class="example-card__answer-key" data-answer-value="D">D</button>
    </div>

    <div class="example-card__stem" data-edit-id="q24-stem">
      24. What was John's original intention for his backyard?
    </div>

    <div class="example-card__answers">
      <button type="button" class="qa-option example-card__option" data-option-value="A">
        <span class="qa-option-label">A</span>
        <span class="qa-option-text" data-edit-id="q24-option-a">To build a wildlife sanctuary.</span>
      </button>
      <button type="button" class="qa-option example-card__option" data-option-value="B" data-correct="true">
        <span class="qa-option-label">B</span>
        <span class="qa-option-text" data-edit-id="q24-option-b">To grow some vegetables.</span>
      </button>
      <button type="button" class="qa-option example-card__option" data-option-value="C">
        <span class="qa-option-label">C</span>
        <span class="qa-option-text" data-edit-id="q24-option-c">To attract migratory birds.</span>
      </button>
      <button type="button" class="qa-option example-card__option" data-option-value="D">
        <span class="qa-option-label">D</span>
        <span class="qa-option-text" data-edit-id="q24-option-d">To inspire his neighbors.</span>
      </button>
    </div>

    <div class="example-card__actions">
      <button type="button" class="example-card__analysis-toggle" disabled>查看解析</button>
      <button type="button" class="example-card__submit-btn">提交答案</button>
    </div>
  </div>

  <aside class="example-card__analysis" hidden>
    <div class="example-card__analysis-body" data-edit-id="q24-analysis">
      John's original plan was simply to grow vegetables.
    </div>
  </aside>
</section>
```

### 5.1 结构规则

1. `.example-card__main` 是默认唯一可见主体；未展开解析前它占满组件宽度。
2. `.example-card__analysis` 默认隐藏；只有在“已提交”条件满足后，点击解析按钮才可展开。
3. 选择题仍沿用 `.qa-option` 微结构，降低样式与编辑系统接入成本，但所有状态类必须收敛在 `.example-card` 根作用域下解释。
4. 编辑态答案键条默认只服务选择题；填空题不显示 A/B/C/D，而是在空位宿主上直接编辑正确答案文本。
5. 题干、选项文本、解析文本必须拥有稳定 `data-edit-id`，避免未来演化到持久化时再次返工 DOM 标识。

## 6. 视觉与布局契约

### 6.1 默认态

1. 组件以单栏卡片形式呈现，题干在上，选项列表在下，操作区固定在主体右下角收口。
2. 选项默认态沿用当前 quiz 组件已经稳定的玻璃卡片 / 浅色描边 / 圆角标签视觉，不另起全新语言。
3. 用户点击选项后，只进入“已选择”高亮态，不提前暴露正确答案或解析。

### 6.2 提交后

1. 若用户选择正确，命中的选项进入绿色确认态。
2. 若用户选择错误，正确选项进入绿色确认态，用户误选项进入红色错误态，其余选项保持静置态。
3. 提交后才解锁解析按钮；解析展开后，组件切换为左 5 右 3 的双栏布局。
4. 解析按钮视觉直接借用答题与批注组件中“展开批注栏按钮”的语义风格，减少新按钮样式发散。

### 6.3 编辑态

1. 编辑态顶部出现“正确答案”答案键条，视觉效果以第三张截图为唯一对齐目标。
2. 当前正确答案键使用绿色激活态，非正确项保持浅色静置态。
3. 编辑态仍允许直接编辑题干、选项文案、解析内容；但学生态绝不显示答案键条。

## 7. 状态模型与运行时职责

本轮运行时采用“每张卡片一个实例”的轻量模型，建议用 `WeakMap<HTMLElement, State>` 管理。每个实例至少维护以下字段：

```js
{
  questionType: 'single' | 'multiple' | 'blank',
  selectedValues: string[],
  correctValues: string[],
  submitted: boolean,
  isCorrect: boolean | null,
  analysisExpanded: boolean
}
```

### 7.1 运行时边界

1. `example-card-runtime.js` 只负责组件内部状态，不负责整页步进、sidecar 持久化或 quiz 级高级批注协议。
2. 提交动作以当前 DOM 上的 `data-correct` / `data-answer-value` 为权威源；编辑态答案键只需要把 DOM 权威值改对，再触发一次本地重渲染。
3. 选择题提交后冻结选项交互，防止学生态在判分后继续改选项导致视图不一致。
4. 填空题提交只执行“回填正确答案”这件事，不在本轮引入“对 / 错”判定和音效分支。

### 7.2 判分规则

1. 单选题：用户选中的唯一值与正确值完全一致时判定为正确。
2. 多选题：用户选择集合与正确答案集合完全相等时判定为正确。
3. 填空题：本轮不采集学生输入，提交后仅显示正确答案，不参与对错音效。

### 7.3 编辑态正确答案维护规则

1. 单选题答案键是单选切换；点击某个键后，其他键自动取消激活，同时同步更新对应选项的 `data-correct`。
2. 多选题答案键允许多选切换；界面仍复用同一条答案键，只是激活逻辑改为集合切换。
3. 填空题不使用答案键，而是直接编辑空位宿主的正确答案数据。

## 8. 文件职责划分

| 文件 | 职责 |
| --- | --- |
| `assets/zones/zone2-example-card.css` | 组件结构、默认态 / 选择态 / 判分态 / 编辑态 / 解析展开态样式 |
| `assets/example-card-runtime.js` | 组件实例初始化、选择与提交逻辑、解析展开、编辑态答案键逻辑 |
| `assets/example-card-audio.js` | 例题组件提交语义到全局 cue 的薄适配层 |
| `assets/example-card-demo.html` | 独立人工体验入口，承载单选题、错误态、编辑态演示 |
| `testing/tests/example-card-runtime.test.js` | focused runtime tests，覆盖选择、提交、判分、答案键编辑 |

### 8.1 预期最小波及面

1. 本轮优先避免修改 `slides-runtime.js`、`annotation-store.js` 这类高耦合底座文件。
2. 若编辑系统需要极小补丁，只允许围绕 `.example-card` 的可编辑宿主做最小增量，不得借机扩散成新一轮编辑器重构。
3. 音效底座原则上只新增 cue 定义，不改现有 cue 行为。

## 9. 演示与验收策略

### 9.1 自动化验证

首版 focused tests 至少覆盖以下场景：

1. 单选题在提交前可以选择选项，并正确切换选中态。
2. 单选题提交后，正确项 / 错误项状态类与按钮禁用状态符合预期。
3. 提交前解析按钮不可用，提交后可用，展开解析后组件进入 5:3 双栏态。
4. 编辑态点击答案键后，正确答案映射与界面高亮同步更新。
5. 填空题提交后会把正确答案回填到空位宿主。

测试文件放在 `testing/tests/` 下，执行方式沿用当前测试工作区约定：从 `testing` 目录运行 `node --test tests/example-card-runtime.test.js`，必要时再与相关回归测试联合执行。

### 9.2 人工验收

本轮必须提供一个可直接打开的 demo 页面，至少包含：

1. 一道提交前错误选择的单选题，用来观察截图 1 的选中态。
2. 一道提交后的单选题，用来观察截图 2 的正确 / 错误反馈态与解析展开态。
3. 同一题在编辑模式下的答案键条，用来观察截图 3 的编辑体验。

人工验收时重点核对三件事：

1. 提交前的选中态是否与目标截图的边框、底色、标签高亮语义一致。
2. 提交后的正确 / 错误态是否稳定，不会出现重复点击后状态错乱。
3. 编辑态切换正确答案后，学生态提交结果是否立刻跟着变化。

## 10. 明确延后的技术债

以下能力虽然都可能在后续版本中有价值，但本轮必须显式延后，不允许暗中混入首版：

1. 组件内部翻页与题目状态独立保存。
2. 提交后开放富文本标注与片段 reveal。
3. 例题组件内容写入 `.annotations.js` sidecar。
4. 与普通页面或 quiz 页的一级 / 二级步进协同。
5. 解析区内的更复杂互动，例如讲评批注、锚点 hover、右键 reveal 等。

## 11. 成功标准

当且仅当以下条件同时成立时，首版设计可进入实现计划与编码阶段：

1. 本文定义的 DOM、状态与样式边界成为唯一实现依据。
2. 新组件可以在单栏页面中独立运行，不依赖 quiz-annotation 的整页壳层。
3. 三张截图对应的核心视觉与交互都能在 demo 页面中真实复现。
4. 编辑态修改正确答案后，提交判分结果可立即反映最新配置。
5. 本轮新增能力可以通过 focused tests 与人工体验同时验证。
