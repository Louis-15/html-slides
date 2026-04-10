# Layout System — 教学课件画布分区与布局参考

This file defines the slide canvas structure and layout modes for teaching courseware. **Read this file during Phase 3 (Layout Planning) before generating any HTML.**

For component styling and interaction patterns, see [component-templates.md](component-templates.md).
For visual CSS implementation, see `../assets/components.css`.

---

## Canvas Structure (画布分区模型)

Every teaching courseware slide is divided into **three physically separated zones**. The header and content area are always present; the summary component is optional (AI decides per-slide).

```html
<div class="slide active" data-slide="0">

  <!-- === ZONE 1: HEADER BAR (标题栏) === -->
  <!-- Fixed two-line header, does NOT participate in content layout -->
  <div class="slide-header">
    <div class="header-module">[教学模块名称]</div>
    <div class="header-title">[当前知识点名称]</div>
  </div>

  <!-- === ZONE 2: CONTENT AREA (内容区) === -->
  <!-- AI chooses a layout-* class to control column/row structure -->
  <div class="slide-content layout-single">
    <!-- Content fills into layout slots -->
  </div>

  <!-- === ZONE 3: SUMMARY COMPONENT (总结组件, OPTIONAL) === -->
  <!-- AI decides whether to include this per-slide -->
  <button class="summary-trigger" onclick="this.closest('.slide').querySelector('.summary-panel').classList.toggle('visible')">
    📋 本页总结
  </button>
  <div class="summary-panel">
    <div class="summary-content">
      <h3>📌 本页要点</h3>
      <ul>
        <li>[总结要点1]</li>
        <li>[总结要点2]</li>
      </ul>
    </div>
  </div>

  <!-- === SPEAKER NOTES (必须) === -->
  <script type="application/json" class="slide-notes">
  {"title":"[TITLE]","script":"[PRESENTER_SCRIPT]","notes":["[NOTE_1]","[NOTE_2]"]}
  </script>

</div>
```

### Zone Rules

| Zone | Required | Participates in Layout | Notes |
|------|----------|----------------------|-------|
| Header Bar | Yes | No — always spans full width at top | Fixed two lines: module name + topic name |
| Content Area | Yes | Yes — uses `layout-*` classes | AI chooses layout mode; all content goes here |
| Summary Component | No — AI decides | No — floats at bottom | Button triggers a panel overlay |
| Speaker Notes | Yes | No — hidden JSON block | Must be the last child element |

---

## Layout Modes (8 种布局模式 + 1 变体)

The content area uses a `layout-*` CSS class to control how space is divided. Layout is **pure spatial partitioning** — it only determines how columns/rows are arranged, not what goes inside them.

### How to read layout templates

Each layout template below shows the HTML structure with **slot markers** (`[SLOT-*]`). When generating, replace each slot with actual content — text, images, or components from `component-templates.md`.

**Filling rules:**
- **Image in a slot** → image can fill the entire slot naturally (`width: 100%; height: 100%; object-fit: cover/contain`)
- **Component in a slot** → component's own padding/margin parameters control breathing room
- **Text in a slot** → wrap in appropriate semantic elements (`<p>`, `<ul>`, etc.)

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

Two equal-width columns side by side.

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

在等宽双栏基础上，自动在两栏中间插入一个“VS”圆圈标记。

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

Three equal-width columns.

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

---

## AI Layout Decision Guide (AI 布局决策指引)

When planning a slide's layout (Phase 3), follow this decision process:

### Step 1: Count the content blocks

How many distinct content blocks does this slide need?

| Count | Recommended layouts |
|-------|-------------------|
| 1 large block | `layout-single` |
| 2 blocks | `layout-2col`, `layout-2col-wide-left`, or `layout-2col-wide-right` |
| 3 blocks | `layout-3col` |
| 4 blocks | `layout-grid-2x2` |
| 2 sequential blocks | `layout-2row` |

### Step 2: Check content asymmetry

If you have 2 blocks but they're unequal in importance:
- Primary content is text-heavy → put it in the **wide** column
- Primary content is a large image → consider equal columns (`layout-2col`) so the image gets decent space
- One block is clearly auxiliary (notes, labels, small icons) → use `layout-2col-wide-left` or `layout-2col-wide-right`

### Step 3: Default to `layout-single`

If the content doesn't clearly fit a multi-column layout, **default to `layout-single`**. It's always safe, always readable. Don't force multi-column for the sake of visual variety.

---

## Content Density Rules (内容密度规则)

These rules **replace** the old fixed content limits from `presentation-layer.md`:

1. **No fixed content cap** — There is no "max N items per slide" rule. The content area can hold as much as fits.
2. **Full-text preservation** — AI must include every word from the teaching materials. No summarizing, no omitting, no compressing.
3. **Smart pagination based on available space** — When content exceeds the content area's available height (after subtracting the header bar), split into the next slide. Continue the same header-module/header-title on the continuation slide.
4. **Dynamic canvas height** — The canvas height currently adjusts dynamically based on content (e.g., adding line breaks in edit mode expands the canvas). This behavior is preserved.

---

## Integration with Components

组件来自 `component-templates.md`，放置在布局插槽内。布局系统决定空间分配，组件决定交互和内部结构。

**示例 — 翻转卡片在双栏布局中：**

```html
<div class="slide-content layout-2col">
  <div class="col">
    <!-- 左栏：课文内容 -->
    <p>古老的废墟藏着秘密…</p>
  </div>
  <div class="col">
    <!-- 右栏：翻转卡片组件（独立使用，无需包装器） -->
    <div class="flip-card">
      <div class="flip-front">
        <div class="flip-icon">💡</div>
        <div class="flip-title">卡片标题</div>
        <div class="flip-subtitle">点击翻转查看</div>
        <button class="flip-action-btn" onclick="this.closest('.flip-card').classList.toggle('flipped')">↻</button>
      </div>
      <div class="flip-back">
        <div class="flip-detail">卡片背面内容</div>
        <button class="flip-action-btn" onclick="this.closest('.flip-card').classList.toggle('flipped')">↻</button>
      </div>
    </div>
  </div>
</div>
```

**示例 — 全宽图片填充单列布局：**

```html
<div class="slide-content layout-single">
  <div class="image-block">
    <img src="assets/diagram.png" alt="语法结构图" class="slide-image">
  </div>
</div>
```

**示例 — 图片填充双栏布局的一个插槽：**

```html
<div class="slide-content layout-2col">
  <div class="col">
    <div class="content-block">
      <p class="text">课文分析要点…</p>
    </div>
  </div>
  <div class="col">
    <!-- 图片自然充满栏位 -->
    <div class="image-block">
      <img src="assets/scene.jpg" alt="课文插图" class="slide-image">
    </div>
  </div>
</div>
```

