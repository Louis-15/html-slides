# Layout System — 教学课件画布分区与布局参考

This file defines the slide canvas structure and layout modes for teaching courseware. **Read this file during Phase 3 (Layout Planning) before generating any HTML.**

For component styling and interaction patterns, see [component-templates.md](component-templates.md).
For visual CSS implementation, see `../assets/zones/zone2-layout.css`.
布局系统的开发者文档见 `开发者文档/布局与组件开发文档.md`。

---

## Canvas Structure (画布分区模型)

Every teaching courseware slide is divided into **three physically separated zones**. The header and content area are always present; the summary component is optional (AI decides per-slide).

```html
<div class="slide active" data-slide="0">

  <!-- === ZONE 1: HEADER BAR (标题栏) === -->
  <!-- 固定两行，不参与内容区布局 -->
  <!-- 面包屑行：序号 本节名称 / 知识点名 -->
  <!-- 标题行：本页具体内容（一个知识点可能分多页） -->
  <div class="slide-header">
    <div class="header-module"><!-- 面包屑行 --></div>
    <div class="header-title"><!-- 本页标题 --></div>
  </div>

  <!-- === ZONE 2: CONTENT AREA (内容区) === -->
  <!-- AI chooses a layout-* class to control column/row structure -->
  <div class="slide-content layout-single">
    <!-- Content fills into layout slots -->
  </div>

  <!-- === ZONE 3: SUMMARY COMPONENT (总结组件, OPTIONAL) === -->
  <!-- AI decides whether to include this per-slide -->
  <!-- 不要在此处生成 onclick 处理器，runtime 通过 step-through.js 统一管理焦点与展开 -->
  <button class="summary-trigger">
    📋 本页总结
  </button>
  <div class="summary-panel">
    <div class="summary-content">
      <h3>📌 本页要点</h3>
      <ul>
        <li data-edit-id="[UNIQUE_ID]">[总结要点1]</li>
        <li data-edit-id="[UNIQUE_ID]">[总结要点2]</li>
      </ul>
    </div>
  </div>

  <!-- [data-edit-id] 属性说明：编辑器持久化的核心标识。所有用户可编辑的文本块都必须标记 data-edit-id。
       编辑模式下用户修改的 innerHTML 会通过此 ID 保存到 localStorage，导出 HTML 时以白名单模式覆写到 __BASELINE__ 快照。
       不要标记运行时动态生成的元素（如翻转状态、面板显隐）。 -->

  <!-- === SPEAKER NOTES (必须) === -->
  <script type="application/json" class="slide-notes">
  {"title":"[TITLE]","script":"[PRESENTER_SCRIPT]","notes":["[NOTE_1]","[NOTE_2]"]}
  </script>

</div>
```

### Zone Rules

| Zone | Required | Participates in Layout | Notes |
|------|----------|----------------------|-------|
| Header Bar | 一般内容页 Yes / 沉浸页 No | No — always spans full width at top | 面包屑行：序号+本节名称/知识点名；标题行：本页具体内容。
  **沉浸式逃逸**：当 slide 包含 `.quiz-annotation` 或使用 `layout-title` 封面页时，`:has()` CSS 规则自动隐藏 Header Bar，
  Zone 2 获得全页高度 |
| Content Area | Yes | Yes — uses `layout-*` classes | AI chooses layout mode; all content goes here |
| Summary Component | No — AI decides | No — floats at bottom | Button triggers a panel overlay |
| Speaker Notes | Yes | No — hidden JSON block | Must be the last child element |

> **Interaction note (2026-04-25)**: The summary button is now runtime-managed. Do not generate inline `onclick` handlers for `.summary-trigger`; the navigation/step-through runtime (`navigation.js` + `step-through.js`) owns the focus-first / open-second behavior, panel visibility, and audio cues.
>
> **Runtime note (2026-05-01)**: The original `slides-runtime.js` has been split into 5 independent modules: `navigation.js` (翻页/UI/粒子), `keyboard.js` (键盘控制), `step-through.js` (步进队列), `chart-integration.js` (Chart.js 生命周期), `speaker-notes.js` (讲者备注). All 5 must be loaded in order.

---

## Layout Modes (8 种布局模式 + 2 变体)

The content area uses a `layout-*` CSS class to control how space is divided. Layout is **pure spatial partitioning** — it only determines how columns/rows are arranged, not what goes inside them.

### How to read layout templates

Each layout template below shows the HTML structure with **slot markers** (`[SLOT-*]`). When generating, replace each slot with actual content — text, images, or components from `component-templates.md`.

**Filling rules:**
- **Image in a slot** → image can fill the entire slot naturally (`width: 100%; height: 100%; object-fit: cover/contain`)
- **Component in a slot** → component's own padding/margin parameters control breathing room
- **Text in a slot** → wrap in appropriate semantic elements (`<p>`, `<ul>`, etc.) with `data-edit-id="[UNIQUE_ID]"` for editor persistence
- **data-edit-id**: All user-editable text blocks must carry this attribute (e.g. stem text, option text, analysis text). The editor uses it to save/restore content via localStorage. See [本地化保存、读取系统](../%E5%BC%80%E5%8F%91%E8%80%85%E6%96%87%E6%A1%A3/%E6%9C%AC%E5%9C%B0%E5%8C%96%E4%BF%9D%E5%AD%98%E3%80%81%E8%AF%BB%E5%8F%96%E7%B3%BB%E7%BB%9F.md) for details.

---

### 0. `layout-title` — 封面页

全页居中布局，用于总封面和章节封面。搭配 `.title-hero` 组件使用。

```html
<div class="slide-content layout-title">
  <div class="title-hero">
    <p class="title-hero-subject anim-1">[SUBJECT_NAME]</p>
    <h1 class="title-hero-heading anim-2">[COURSEWARE_TITLE]</h1>
    <div class="title-hero-divider anim-3"></div>
    <p class="title-hero-author anim-4">讲师：[TEACHER_NAME]</p>
  </div>
</div>
```

**When to use**: 总封面、章节分隔页、结束页。布局只管居中，封面样式全部由 `.title-hero` 组件 + 主题层控制。

> **Note**: `layout-title` 页没有 Zone 1 标题栏（`.slide-header`），Zone 2 直接占据全页高度。
> 这是沉浸式逃逸的一种特殊形式，无需额外触发条件。

---


### 1. `layout-single` — 单列全宽

Full-width single column. All content flows vertically.

```html
<div class="slide-content layout-single">
  [SLOT-MAIN: full-width content — text, component, or image]
</div>
```

**When to use**: Large text blocks, single large component, full-width image, reading passages.

---

### 2. `layout-2col` — 等宽双栏 (50% - 50%)

Two equal-width columns side by side. 间距 32px。

```html
<div class="slide-content layout-2col">
  <div class="col">
    [SLOT-LEFT: left column content]
  </div>
  <div class="col">
    [SLOT-RIGHT: right column content]
  </div>
</div>
```

**When to use**: Image + text side-by-side, two parallel concepts, bilingual text comparison.

---

### 2v. `layout-2col.compare` — 等宽双栏对比变体

在等宽双栏基础上，自动在两栏中间插入一个“VS”圆圈标记。使用 `::after` 伪元素实现，不占用 DOM 位置。

```html
<div class="slide-content layout-2col compare">
  <div class="col">
    [SLOT-LEFT: left column content]
  </div>
  <div class="col">
    [SLOT-RIGHT: right column content]
  </div>
</div>
```

**When to use**: 两种方案对比、前后对比、正反方观对比。只需在 `layout-2col` 上追加 `.compare` 类即可。

---

### 3. `layout-2col-wide-left` — 左宽右窄 (65% - 35%)

Left column takes more space; right column is auxiliary.

```html
<div class="slide-content layout-2col-wide-left">
  <div class="col col-wide">
    [SLOT-LEFT: primary content (65%)]
  </div>
  <div class="col col-narrow">
    [SLOT-RIGHT: auxiliary content (35%)]
  </div>
</div>
```

**When to use**: Main text/passage on left + vocabulary/notes on right, primary content with sidebar annotation.

---

### 4. `layout-2col-wide-right` — 左窄右宽 (35% - 65%)

Right column takes more space; left column is auxiliary.

```html
<div class="slide-content layout-2col-wide-right">
  <div class="col col-narrow">
    [SLOT-LEFT: auxiliary content (35%)]
  </div>
  <div class="col col-wide">
    [SLOT-RIGHT: primary content (65%)]
  </div>
</div>
```

**When to use**: Sidebar labels/icons on left + main visual/text on right.

---

### 5. `layout-3col` — 三栏等宽 (33% - 33% - 33%)

Three equal-width columns. 间距 24px（略小于双栏的 32px，避免三栏时横向空间不足）。

```html
<div class="slide-content layout-3col">
  <div class="col">
    [SLOT-1: first column]
  </div>
  <div class="col">
    [SLOT-2: second column]
  </div>
  <div class="col">
    [SLOT-3: third column]
  </div>
</div>
```

**When to use**: Three parallel concepts, three-step process, triple comparison.

---

### 5v. `layout-3col.compare` — 三栏等宽对比变体

在三栏等宽的基础上，自动在 col1↔col2 和 col2↔col3 之间插入两个 VS 圆圈标记。使用 `::before` + `::after` 两个伪元素分别定位到两个间隔处，不占用 DOM 位置。

```html
<div class="slide-content layout-3col compare">
  <div class="col">
    [SLOT-1: first column]
  </div>
  <div class="col">
    [SLOT-2: second column]
  </div>
  <div class="col">
    [SLOT-3: third column]
  </div>
</div>
```

**When to use**: Three-way comparison, A/B/C concept contrast, three parallel items that need side-by-side comparison. Just add `.compare` class to `layout-3col`.

---

### 6. `layout-2row` — 上下双行

Two rows stacked vertically, each taking roughly equal height.

```html
<div class="slide-content layout-2row">
  <div class="row">
    [SLOT-TOP: top row content]
  </div>
  <div class="row">
    [SLOT-BOTTOM: bottom row content]
  </div>
</div>
```

**When to use**: Sequential steps (step 1 above, step 2 below), before/after comparison.

---

### 7. `layout-grid-2x2` — 两行两列四格

A 2×2 grid creating four equal slots.

```html
<div class="slide-content layout-grid-2x2">
  <div class="cell">
    [SLOT-1: top-left]
  </div>
  <div class="cell">
    [SLOT-2: top-right]
  </div>
  <div class="cell">
    [SLOT-3: bottom-left]
  </div>
  <div class="cell">
    [SLOT-4: bottom-right]
  </div>
</div>
```

**When to use**: Four related concepts, 2×2 matrix, four vocabulary cards.

> **Dynamic row height**: `layout-grid-2x2` 不设 `grid-template-rows`，行高由内容动态决定。
> 这避免了折叠卡片展开时被等高行截断或产生大量空白的问题。

---

## Auto-staggering Animations (自动阶梯进场动画)

当幻灯片被激活时，内容区的各布局插槽会自动按顺序滑入，形成阶梯式入场效果。
此动画在 `zone2-layout.css` 中通过 CSS `@keyframes` 实现，JS 只负责拨动 `.active` 开关。

```css
@keyframes slotFadeInUp {
  0% { opacity: 0; transform: translateY(24px); }
  100% { opacity: 1; transform: translateY(0); }
}
```

动画延迟从 0.35s 起步，每组递增 0.1s：

| 插槽序号 | 动画延迟 |
|---------|---------|
| 第 1 个 | 0.35s |
| 第 2 个 | 0.45s |
| 第 3 个 | 0.55s |
| 第 4 个 | 0.65s |
| 第 5 个 | 0.75s |
| 第 6 个 | 0.85s |

**生效范围**：所有布局模式的直接子插槽（`.col` / `.cell` / `.row` / 或 `layout-single` 的直接子元素）。

> **注意**：进入编辑模式时，运行时通过 `animation-play-state: paused` + Web Animations API `finish()` 冻结所有动画，
> 避免因 DOM 操作触发的入场动画重播。参见 [放映与动效系统开发文档](../%E5%BC%80%E5%8F%91%E8%80%85%E6%96%87%E6%A1%A3/%E6%94%BE%E6%98%A0%E4%B8%8E%E5%8A%A8%E6%95%88%E7%B3%BB%E7%BB%9F%E5%BC%80%E5%8F%91%E6%96%87%E6%A1%A3.md)。

---

## AI Layout Decision Guide (AI 布局决策指引)

When planning a slide's layout (Phase 3), follow this decision process:

### Step 0: Detect title/immersive slides

If this is the **first slide** (封面), **chapter divider**, or **ending page** → use `layout-title`.
If this slide uses `.quiz-annotation` (答题与批注组件) → use `layout-single` (quiz 独占整页，无需手动选择布局)。

### Step 1: Count the content blocks

How many distinct content blocks does this slide need?

| Count | Recommended layouts |
|-------|-------------------|
| 0 (封面/结尾) | `layout-title` |
| 1 large block | `layout-single` |
| 2 blocks | `layout-2col`, `layout-2col-wide-left`, or `layout-2col-wide-right` |
| 3 blocks | `layout-3col` (或 `layout-3col.compare` 如需三向对比) |
| 4 blocks | `layout-grid-2x2` |
| 2 sequential blocks | `layout-2row` |

### Step 2: Check content asymmetry (双栏)

If you have 2 blocks but they're unequal in importance:
- Primary content is text-heavy → put it in the **wide** column
- Primary content is a large image → consider equal columns (`layout-2col`) so the image gets decent space
- One block is clearly auxiliary (notes, labels, small icons) → use `layout-2col-wide-left` or `layout-2col-wide-right`

### Step 3: Check if compare variant is needed

For 2 or 3 blocks that represent competing/contrasting concepts:
- 2 blocks with explicit contrast (方案A vs 方案B, 优点 vs 缺点) → add `.compare` to `layout-2col`
- 3 blocks with three-way comparison → add `.compare` to `layout-3col`

Compare 变体使用 `::after` / `::before` 伪元素自动插入 VS 圆圈标记，不占用 DOM 位置。

### Step 4: Default to `layout-single`

If the content doesn't clearly fit a multi-column layout, **default to `layout-single`**. It's always safe, always readable. Don't force multi-column for the sake of visual variety.

---

## Content Density Rules (内容密度规则)

These rules **replace** the old fixed content limits from `presentation-layer.md`:

1. **No fixed content cap** — There is no "max N items per slide" rule. The content area can hold as much as fits.
2. **Full-text preservation** — AI must include every word from the teaching materials. No summarizing, no omitting, no compressing.
3. **Smart pagination based on available space** — When content exceeds the content area's available height (after subtracting the header bar), split into the next slide. Continue the same header-module (breadcrumb) on the continuation slide, but update the header-title to reflect the new page's focus.
4. **Dynamic canvas height** — The canvas height currently adjusts dynamically based on content (e.g., adding line breaks in edit mode expands the canvas). This behavior is preserved.

---

## Integration with Components

组件来自 `component-templates.md`，放置在布局插槽内。布局系统决定空间分配，组件决定交互和内部结构。

**关键约定：**
- 组件 `width: 100%` 撑满插槽，`margin: 0` 由布局 `gap` 统管间距
- 可编辑文本必须标记 `data-edit-id`，供编辑器持久化使用
- 翻转/折叠等互动状态由 runtime（`step-through.js`）统一管理，不要生成内联 `onclick`

**示例 — 翻转卡片在双栏布局中：**

```html
<div class="slide-content layout-2col">
  <div class="col">
    <!-- 左栏：课文内容（data-edit-id 标记可编辑文本） -->
    <p data-edit-id="s2-left-text">古老的废墟藏着秘密…</p>
  </div>
  <div class="col">
    <!-- 右栏：翻转卡片组件（独立使用，无需包装器） -->
    <div class="flip-card">
      <div class="flip-front">
        <div class="flip-icon">💡</div>
        <div class="flip-title" data-edit-id="s2-card-title">卡片标题</div>
        <div class="flip-subtitle">点击翻转查看</div>
        <button class="flip-action-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
            <path d="M3 21v-5h5"/>
          </svg>
        </button>
      </div>
      <div class="flip-back">
        <div class="flip-detail" data-edit-id="s2-card-back">卡片背面详细内容</div>
        <button class="flip-action-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
            <path d="M3 21v-5h5"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
</div>
```

> **Interaction note**: Flip-card state is runtime-managed by `step-through.js`. On ordinary pages, first `ArrowDown` focuses the `.flip-card`, second `ArrowDown` flips it, and direct button clicks are intercepted by the runtime. Do not add inline `onclick` state toggles. Do not use old `.flip-grid` or `.flip-bounce-wrap` wrappers — each `.flip-card` stands alone.

**示例 — 全宽图片填充单列布局：**

```html
<div class="slide-content layout-single">
  <div class="image-card">
    <img src="images/diagram.png" alt="语法结构图" class="slide-image">
  </div>
</div>
```

**示例 — 图片填充双栏布局的一个插槽：**

```html
<div class="slide-content layout-2col">
  <div class="col">
    <div class="content-block">
      <p class="text" data-edit-id="s3-analysis">课文分析要点…</p>
    </div>
  </div>
  <div class="col">
    <!-- 图片自然充满栏位 -->
    <div class="image-card">
      <img src="images/scene.jpg" alt="课文插图" class="slide-image">
    </div>
  </div>
</div>
```

