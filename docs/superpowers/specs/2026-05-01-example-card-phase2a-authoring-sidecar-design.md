# 例题组件第二阶段 2A 设计文档

> 当前阶段：设计文档（阶段二 2A，聚焦作者态富文本标注、提交后 reveal 与 sidecar 持久化）
>
> 设计日期：2026-05-01
>
> 需求来源：当前会话中对第二阶段范围的重新收敛、既有首版设计文档、用户对“多题独立 DOM / 独立 editId”路线的确认
>
> 已锁定结构前提：未来一个 `.example-card` 可以承载多道题，但每道题必须拥有独立 DOM 子树与独立 `data-edit-id`；界面层只负责切换当前显示题目，不允许复用同一批文本节点去轮播灌入不同题目内容

## 1. 设计目标

在 html-slides 现有 example-card 首版能力之上，补齐第二阶段 2A 的第一条闭环：

1. 作者态可在例题组件内部继续使用现有隐藏型富文本标注能力，而不是另起一套工具条协议。
2. 作者写入的隐藏型标注可以进入现有 `.annotations.js` sidecar 链路，刷新页面后不丢失。
3. 学生态下，例题组件内部的隐藏型标注必须遵守“提交前不可 reveal、提交后才开放 reveal”的门禁，而不是像普通页面文本那样一进入放映态就可参与 reveal。
4. 本轮设计要为未来的“一个组件多道题”预留稳定结构，但不提前把多题运行时状态硬塞进当前 sidecar schema。

本阶段追求的不是一次做完第二阶段全部能力，而是先把“authoring -> 保存 -> 刷新恢复 -> 提交后 reveal”这条主链打通，让后续的内部翻题、卡片级状态持久化、全局步进协同都建立在稳定文本协议之上。

## 2. 决策摘要

1. 第二阶段拆为分包推进，本设计文档只覆盖 2A：作者态富文本标注、提交后 reveal、sidecar 持久化。
2. 未来多题 example-card 明确采用“每题独立 DOM / 独立 editId，只切换显示状态”的结构路线，不采用“单壳体复用同一批文本节点灌不同题目内容”的路线。
3. 例题组件内部的题干、选项文本、解析文本继续复用现有 ordinary `elements[editId] = innerHTML` 持久化协议，不发明 example-card 专属文本 sidecar schema。
4. 本轮不持久化卡片级运行时状态，例如当前题号、每题已选答案、每题提交状态、每题解析展开状态；这些属于后续 cardState 层的职责，而不是文本持久化层的职责。
5. 例题组件内部的隐藏型标注作者态入口继续复用现有 `editor-rich-text.js` 与普通页面隐藏型标注协议，不新增 example-card 专属浮动工具条。
6. 例题组件内部的 reveal 资格必须增加“提交门禁”：提交前，即使存在 authored fragment，也不能在学生态被 hover、右键或键盘 reveal；提交后，仅当前显示题目的 fragment 才获得 reveal 资格。
7. 本轮不做与普通页面 / quiz 页的一级、二级步进协同；这部分放到后续阶段处理，避免当前设计同时修改全局步进分发与卡片内部状态机。
8. 编辑模式下 example-card 选项文本必须可编辑，并且编辑模式下的点击不得触发学生态作答逻辑。

## 3. 当前代码库现状与可复用边界

### 3.1 已存在且可直接复用的能力

1. `assets/editor-rich-text.js` 已经提供普通页面隐藏型标注的作者态能力：
   - 选区限制在同一个 `data-edit-id` 根块内部；
   - 支持颜色、高光、删除线、顶标、清除格式；
   - 创建或清除隐藏型标注后，会同时触发 `PersistenceLayer.saveElement(root)` 与 `AnnotationStore.scheduleSave()`。
2. `assets/annotation-store.js` 已经支持 ordinary `elements[editId] = innerHTML` 这条 sidecar schema，并且普通页面 fragment 已有瞬时状态清理逻辑。
3. `assets/page-richtext-annotation-runtime.js` 已经具备普通页面隐藏型标注的放映态 reveal / rollback / 右键即时 reveal 底座。
4. `assets/example-card-runtime.js` 已经具备卡片级作答状态、提交门禁、解析展开、答案键修改与结果渲染等首版主能力。
5. 当前真实课件入口 `七选五理论论述.html` 已经为 example-card 的题干、选项、解析提供稳定 `data-edit-id`，说明文本根块本身并不缺身份标识。

### 3.2 当前真实缺口

1. example-card 内 authored fragment 虽可被写入 DOM，但用户观察到刷新后丢失，说明“写入 DOM”与“落到 sidecar 并在 reload 时恢复”之间的闭环还不稳定。
2. `page-richtext-annotation-runtime.js` 当前按普通页面文本处理 reveal 资格，并不知道 example-card 的“提交前不可 reveal”业务门禁。
3. example-card 当前仍是单题结构，尚未建立未来多题独立 DOM 的明确契约。
4. 编辑模式下 example-card 的选项文本目前不能正常编辑；根因不是 `data-edit-id` 缺失，而是选项文本位于 `button.qa-option` 内，现有编辑候选过滤和作答点击逻辑没有对 example-card 做正确分流。

### 3.3 本轮刻意不复用的部分

1. 不复用 `quiz-annotation-runtime.js` 的整题提交后批注浮现状态机。
2. 不把 example-card 强行接入普通页面全局二级步进队列。
3. 不在本轮引入 example-card 专属 `exampleCards[]` sidecar schema。
4. 不在本轮持久化答题过程状态或翻题过程状态。

## 4. 范围定义

### 4.1 本轮范围内

1. 锁定未来多题 example-card 的结构前提：每道题独立 DOM、独立 editId、仅切换显示状态。
2. 让 example-card 内部的题干、选项文本、解析文本能够稳定承接现有隐藏型富文本标注作者态与 sidecar 持久化链路。
3. 为 example-card 增加“提交后 reveal”门禁，使 authored fragment 在学生态提交前不可 reveal，提交后才开放。
4. 修复编辑模式下 example-card 选项文本不可编辑的问题，并保证编辑模式下点击选项不会触发学生态选项选择。
5. 建立与未来多题结构兼容的 DOM / 状态 / 持久化边界，为后续内部翻题和 cardState 扩展留口。

### 4.2 本轮范围外

1. 组件内部翻题 UI 与当前题目索引状态管理。
2. 每题作答状态、当前题号、解析展开状态等 cardState 的持久化。
3. 与普通页面或 quiz 页的一级 / 二级步进协同。
4. 多题情况下的分页按钮、页码指示器、动画切题。
5. 更复杂的讲评交互，例如组件级锚点联动、卡片内部 hover 导航、局部右键 reveal 菜单定制。

## 5. 结构前提：多题 example-card 的唯一允许路线

### 5.1 允许的结构路线

未来多题 example-card 必须遵守以下结构原则：

1. 一个 `.example-card` 可以包含多个题目容器，例如 `.example-card__question`。
2. 每个题目容器都拥有完整独立的子树：
   - 题干根块；
   - 选项列表；
   - 解析区；
   - 本题自己的作者态答案配置区（如适用）。
3. 每个题目容器内部所有可编辑文本都拥有稳定且唯一的 `data-edit-id`。
4. 界面层只负责切换哪个题目容器处于“当前显示态”，而不是把第 2 题的内容灌进第 1 题的 DOM 节点。

### 5.2 禁止的结构路线

以下方案明确禁止：

1. 只有一套题干、四个选项和一个解析容器，然后用 JS 在切题时替换文案。
2. 同一个 `lesson-example-option-a` 在题 1 和题 2 之间反复改写文本内容。
3. 通过临时映射表把“当前题目身份”附着到同一批通用 DOM 槽位上。

禁止原因是：

1. `elements[editId] = innerHTML` 的 sidecar 协议要求一个 `editId` 长期指向同一块 authored 内容。
2. 隐藏型标注的 authored fragment 也是按 `editId` 根块归属；一旦同一根块代表不同题目内容，fragment 归属就会串题。
3. 未来即便要新增 cardState，也应该是“在稳定文本根块之上新增卡片级状态”，而不是让文本身份本身漂移。

## 6. DOM 契约

### 6.1 单题与多题统一外形

单题是多题结构的退化态。本轮虽然仍可能先以单题页面接入，但 DOM 契约应按未来多题兼容形式定义。

建议契约如下：

```html
<section class="example-card" data-card-id="lesson-example">
  <div class="example-card__questions">
    <article class="example-card__question is-active" data-question-id="q1">
      <div class="example-card__main">
        <div class="example-card__editor-answer-key" data-editor-only="true" aria-label="正确答案编辑区">
          ...
        </div>

        <div class="example-card__stem" data-edit-id="lesson-example-q1-stem">...</div>

        <div class="example-card__answers">
          <button type="button" class="qa-option example-card__option" data-option-value="A">
            <span class="qa-option-label">A</span>
            <span class="qa-option-text" data-edit-id="lesson-example-q1-option-a">...</span>
          </button>
          ...
        </div>
      </div>

      <aside class="example-card__analysis" hidden>
        <div class="example-card__analysis-body" data-edit-id="lesson-example-q1-analysis">...</div>
      </aside>
    </article>

    <article class="example-card__question" data-question-id="q2" hidden>
      ...
    </article>
  </div>

  <div class="example-card__footer">...</div>
</section>
```

### 6.2 本轮必须满足的 DOM 约束

1. 题干、每个选项文本、解析正文必须各自拥有稳定 `data-edit-id`。
2. 一个 `data-edit-id` 只能归属于某一道题，不能跨题复用。
3. 题目容器可以通过 `hidden`、`aria-hidden`、`is-active` 或 CSS 显隐类切换显示状态，但 inactive 题目的 DOM 必须仍然保留在文档中，保证 authored 内容与 sidecar 能稳定恢复。
4. `button.qa-option` 仍可继续作为学生态点击宿主，但内部 `.qa-option-text` 在编辑模式下必须能被识别为可编辑文本根块。

## 7. 作者态与持久化模型

### 7.1 作者态入口

本轮不新增 example-card 专属富文本工具条，而是复用现有普通页面隐藏型标注入口，原因如下：

1. example-card 的题干、选项文本、解析本质上仍是 ordinary `data-edit-id` 文本根块。
2. 当前作者已经能在这些区域创建隐藏型标注，说明作者态协议本身已经基本可达。
3. 当前真正缺的是持久化闭环与业务门禁，而不是工具条入口缺失。

### 7.2 持久化归属规则

1. 题干、选项文本、解析内 authored 的隐藏型标注，继续按最近的 `data-edit-id` 根块归属。
2. sidecar 中仍采用：

```js
elements[editId] = innerHTML
```

3. 例题组件不新增 `exampleCards[].texts`、`exampleCards[].fragments` 之类重复 schema。
4. 未来多题只是在 sidecar 中多出更多稳定的 `editId` 条目，而不是切换到另一套文本 schema。

### 7.3 本轮不保存的状态

以下内容不应进入当前文本 sidecar：

1. 当前显示到第几题；
2. 某题是否已提交；
3. 某题当前选择了哪个选项；
4. 某题解析是否展开；
5. 某题 fragment 当前 reveal 到第几步。

这些都属于运行时或未来 cardState 协议，不能污染 authored 文本持久化层。

## 8. 提交后 reveal 门禁模型

### 8.1 核心门禁

example-card 内部 authored fragment 的 reveal 资格必须满足以下规则：

1. 编辑模式下：始终可见且可编辑，不受提交状态约束。
2. 学生态、未提交时：
   - authored fragment 默认隐藏；
   - 不允许 hover 提示；
   - 不允许右键即时 reveal；
   - 不允许被普通页面步进 runtime 当作可 reveal 目标。
3. 学生态、已提交后：
   - 当前显示题目的 authored fragment 才获得 reveal 资格；
   - 非当前显示题目的 fragment 即使在 DOM 中存在，也不参与 reveal；
   - reveal 仍只改变 `qa-fragment-visible`、`data-fragment-manual-reveal` 这类瞬时状态，不回写 authored HTML。

### 8.2 为什么必须加这层门禁

1. 普通页面隐藏型标注默认是“放映态即可 reveal”；但例题组件的业务含义不同，它承担的是先作答、后讲解。
2. 如果例题组件内部 fragment 在提交前就可 reveal，会直接泄露题干提示、选项排除线索或解析重点，破坏例题流程边界。
3. 这层门禁必须由 example-card 自己掌握，不能完全交给 page-richtext runtime 的普通页默认行为。

### 8.3 与后续阶段的边界

1. 本轮只处理“提交后才开放 reveal 资格”。
2. 本轮不处理“开放后如何并入全局左右键步进队列”。
3. 本轮也不要求做复杂的卡片内部 reveal 导航 UI，只需要把 reveal 资格门禁和本地即时 reveal 基础链路打通。

## 9. 编辑模式下选项可编辑性的修复要求

当前问题的根因已经明确：

1. `.qa-option-text` 虽被列入编辑候选，但 example-card 的选项文本位于 `button.qa-option` 内部，现有编辑候选黑名单会把它与按钮一起过滤掉。
2. `example-card-runtime.js` 的选项点击逻辑当前只拦提交态，不拦编辑模式，因此即便文本进入可编辑候选，也会被学生态作答点击抢走。

因此本轮修复必须同时满足：

1. 编辑模式下 example-card 的 `.qa-option-text` 能被打上 `contenteditable="true"`。
2. 编辑模式下点击 example-card 选项不得触发学生态选择逻辑。
3. 这两个修复都必须限制在 example-card 范围内，不能误伤 quiz 组件既有的 `.qa-option-text` 特殊恢复链路。

## 10. 文件职责划分

| 文件 | 本轮职责 |
| --- | --- |
| `assets/example-card-runtime.js` | 增加 example-card 内 fragment reveal 资格门禁；编辑模式下短路学生态选项点击 |
| `assets/editor-utils.js` | 让 example-card 内的 `.qa-option-text` 在编辑模式下进入可编辑候选，同时不破坏 quiz 内 `.qa-option-text` 的特殊跳过逻辑 |
| `assets/page-richtext-annotation-runtime.js` | 扩展 ordinary fragment 宿主资格判断，使 example-card 内 fragment 受“当前题是否已提交、是否当前显示”约束 |
| `assets/annotation-store.js` | 核查并补强 example-card ordinary 根块的 sidecar 收集 / 恢复闭环 |
| `七选五理论论述.html` | 作为真实课件集成入口，必要时补齐多题结构兼容的 DOM 命名或状态标识 |
| `testing/tests/example-card-runtime.test.js` | 新增 example-card 编辑态选项可编辑、提交门禁下 reveal 资格、sidecar 相关 focused tests |

## 11. 验证策略

### 11.1 自动化验证

本轮 focused tests 至少覆盖：

1. 编辑模式下 example-card 选项文本会进入可编辑态。
2. 编辑模式下点击 example-card 选项不会写入 `selectedValues`。
3. authored fragment 在未提交学生态下不具备 reveal 资格。
4. 题目提交后，当前显示题目的 fragment 才开放 reveal 资格。
5. authored fragment 经过 `AnnotationStore` 收集后会落入 ordinary `elements[editId]`，刷新恢复后仍能回放。

### 11.2 人工验证

人工验收至少检查：

1. 编辑模式下，题干、选项、解析都能直接改文案。
2. 编辑模式下，在题干或选项文本上创建隐藏型标注后，刷新页面不会丢失。
3. 学生态提交前，例题组件内部 authored fragment 不会被提前 reveal。
4. 学生态提交后，当前题目的 authored fragment 才开放 reveal。

## 12. 明确延后到后续分包的内容

以下能力继续延后，不允许暗中混入 2A：

1. 内部翻题按钮、当前题索引切换与多题导航 UI。
2. cardState 的持久化，包括当前题号、每题作答结果、每题解析展开状态。
3. example-card 与普通页面 / quiz 页的一、二级步进协同。
4. 更复杂的组件内 hover 导航、锚点联动或 reveal 菜单定制。

## 13. 成功标准

当且仅当以下条件同时成立时，本设计可进入实现计划阶段：

1. 第二阶段 2A 的边界已经明确收敛为“作者态富文本标注 + 提交后 reveal + sidecar 持久化”。
2. 未来多题结构已经锁定为“每题独立 DOM / 独立 editId，只切换显示态”。
3. 当前文本持久化继续沿用 ordinary `elements[editId]` 路线，不额外发明 example-card 专属文本 schema。
4. example-card 的提交门禁与普通页面 fragment runtime 的边界已经讲清楚，不再混淆“普通页面默认可 reveal”和“例题提交后才可 reveal”两套语义。
5. 编辑模式下选项不可编辑的问题已经被列为 2A 的组成部分，而不是后续顺手修复项。