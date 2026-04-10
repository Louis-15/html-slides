# Component Style Reference

Pre-built, copy-ready HTML/CSS patterns for common slide elements. These provide **consistent styling** — not a menu to pick from.

## How This File Relates to Layout

> **IMPORTANT**: Components in this file are **no longer full-page templates**. They are standalone interaction units designed to be placed **inside layout slots** defined by [layout-system.md](layout-system.md).
>
> The slide's overall structure (header bar + content area + optional summary) is determined by `layout-system.md`. This file only provides the **internal HTML structure** of each component.

### Before (old approach — component = entire page)
```html
<div class="slide" data-slide="[N]">
  <p class="slide-tag">[TAG]</p>
  <h2>[HEADING]</h2>
  <!-- component code -->
  <script class="slide-notes">...</script>
</div>
```

### After (new approach — component fills a layout slot)
```html
<!-- layout-system.md defines the page structure: -->
<div class="slide" data-slide="[N]">
  <div class="slide-header">...</div>
  <div class="slide-content layout-2col">
    <div class="col">
      <!-- COMPONENT GOES HERE — just the component, nothing else -->
    </div>
    <div class="col">...</div>
  </div>
</div>
```

---

## Speaker Notes

Speaker notes are part of the **slide structure**, not the component. They go inside `<div class="slide">` as the last child element, **outside** the content area. See [layout-system.md](layout-system.md) for placement.

```html
<script type="application/json" class="slide-notes">
{"title":"[SLIDE_HEADING]","script":"[PRESENTER_SCRIPT]","notes":["[NOTE_1]","[NOTE_2]"]}
</script>
```

---

## Components (12 Core + 1 Summary)

All 12 content components are defined in `zones/zone2-content.css`. They are **standalone units** — no wrapper containers needed. Place them directly inside layout slots (`.col`, `.cell`, `.row`, or directly in `.slide-content`).

### 1. Card / 普通卡片 (`.card`)

Basic card container. All card-type components share a unified hover interaction: `translateY(-2px) scale(1.02)` with subtle shadow lift — no background color change on hover. Card surfaces use Glassmorphism (frosted glass): semi-transparent white + `backdrop-filter: blur(24px)`, allowing the slide's ambient glow to show through. Supports icon + title + description, or problem/fix label variants.

```html
<div class="card">
  <div class="card-icon">[EMOJI]</div>
  <div class="card-title">[TITLE]</div>
  <div class="card-desc">[DESCRIPTION]</div>
</div>
```

**Problem/Fix variant:**
```html
<div class="card">
  <div class="card-label problem-label">⚠ PROBLEM</div>
  <div class="card-text">[PROBLEM_TEXT]</div>
</div>
<div class="card">
  <div class="card-label fix-label">✓ FIX</div>
  <div class="card-text">[FIX_TEXT with <span class="card-cmd">/command</span> highlights]</div>
</div>
```

**When to use**: General purpose content cards, problem/solution pairs. Works in any layout slot.

### 2. Flip Card / 翻转卡片 (`.flip-card`)

Front/back card that flips 180° on button click. **No wrapper needed** — each `.flip-card` is used independently.

```html
<div class="flip-card">
  <div class="flip-front">
    <div class="flip-icon">[EMOJI]</div>
    <div class="flip-title">[FRONT_TITLE]</div>
    <div class="flip-subtitle">[FRONT_SUBTITLE]</div>
    <button class="flip-action-btn" onclick="this.closest('.flip-card').classList.toggle('flipped')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg></button>
  </div>
  <div class="flip-back">
    <div class="flip-icon-big">[EMOJI]</div>
    <div class="flip-detail">[BACK_TEXT with <strong>bold keywords</strong>]</div>
    <button class="flip-action-btn" onclick="this.closest('.flip-card').classList.toggle('flipped')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg></button>
  </div>
</div>
```

> **IMPORTANT**: The old `.flip-grid`, `.flip-bounce-wrap`, and `.card-action-btn` are **deleted**. Use `.flip-action-btn` on a `<button>` element. Each flip card stands alone — place multiple in a `layout-grid-2x2` or `layout-3col` using `.cell` / `.col` slots.

**When to use**: Concept reveals, vocabulary, problem → solution reveals. Place in `layout-grid-2x2` for 4 cards or `layout-3col` for 3 cards.

### 3. Collapse Card / 折叠卡片 (`.collapse-card`)

Card that expands on button click to reveal hidden content. Shares base styles with `.card`.

```html
<div class="collapse-card">
  <div class="card-title">[TITLE]</div>
  <div class="card-desc">[SHORT_DESC]</div>
  <div class="card-expand">
    <div class="card-expand-inner">[EXPANDED_DETAIL with <code>code_terms</code>]</div>
  </div>
  <button class="collapse-action-btn" onclick="this.closest('.collapse-card').classList.toggle('expanded')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></button>
</div>
```

> **IMPORTANT**: The old `.use-case-grid`, `.card-v2`, `.glow-orange` wrappers are **deleted**. Use `.collapse-action-btn` (not `.card-action-btn`). Arrow auto-rotates on expand.

**When to use**: Knowledge points with expandable details, tips, FAQ. Place in `layout-grid-2x2` or `layout-2col`.

### 4. Code Window / 代码窗口 (`.code-window`)

macOS-style terminal window with red/yellow/green dots and syntax highlighting (One Dark Pro).

```html
<div class="code-window">
  <div class="code-titlebar">
    <div class="code-dot red"></div>
    <div class="code-dot yellow"></div>
    <div class="code-dot green"></div>
    <span class="code-filename">[FILENAME]</span>
  </div>
  <div class="code-body">
<span class="ln">1</span>[SYNTAX_HIGHLIGHTED_LINE_1]
<span class="ln">2</span>[SYNTAX_HIGHLIGHTED_LINE_2]
  </div>
</div>
```

**When to use**: Code examples, config files, API usage, CLI commands.
**See**: [Syntax Highlighting Guide](#syntax-highlighting-guide) below.

### 5. Stat Card / 数字强调卡片 (`.stat-card`)

Large gradient number + label + description. Numbers automatically use `background-clip: text` gradient.

```html
<div class="stat-card">
  <div class="stat-number">[NUMBER]<span style="font-size:0.45em;">[UNIT]</span></div>
  <div class="stat-label">[LABEL]</div>
  <div class="stat-desc">[DESC]</div>
</div>
```

> **IMPORTANT**: The old `.stats-row` wrapper is **deleted**. Place stat cards directly in layout slots. In multi-column layouts, the gradient color is auto-assigned by column position via `--context-gradient` (col 1 = green-blue, col 2 = yellow-orange, col 3 = blue-purple). You can manually override with `.blue`, `.green`, `.orange`, `.purple` classes on `.stat-number`.

**When to use**: Performance metrics, survey results, key statistics. Place in `layout-3col` or `layout-2col`.

### 6. Highlight Card / 内容强调卡片 (`.highlight-card`)

Centered emphasis card with label + large gradient title + description + badge.

```html
<div class="highlight-card">
  <div class="highlight-label">[SMALL_UPPERCASE_LABEL]</div>
  <div class="highlight-title">[LARGE_GRADIENT_TITLE]</div>
  <div class="highlight-text">[DESCRIPTION_TEXT]</div>
</div>
```

> **NOTE**: Title text uses the same `--context-gradient` auto-theming as stat cards. In multi-column layouts, each column gets a different gradient automatically. Body text (`.highlight-text`) is **left-aligned** regardless of the card's center alignment.


**When to use**: Key announcements, core concepts, resource highlights. Works in `layout-single` (centered) or `layout-3col` (three cards with different gradient colors).

### 7. Dual Bar / 双色条形图 (`.dual-bar`)

Two-tone horizontal bar for ratio comparisons.

```html
<div class="dual-bar">
  <div class="dual-bar-half left">
    <span>[LEFT_LABEL] ([PERCENTAGE]%)</span>
  </div>
  <div class="dual-bar-half right">
    <span>[RIGHT_LABEL] ([PERCENTAGE]%)</span>
  </div>
</div>
```

**When to use**: Frontend/backend ratios, progress comparisons, distribution breakdowns. Best in `layout-single`.

### 8. Timeline Card / 时间线卡片 (`.timeline-card`)

Single timeline node: colored dot + text. Stack multiple vertically using layout gap.

```html
<div class="timeline-card">
  <div class="timeline-dot green"></div>
  <div class="timeline-text"><strong>[ITEM]</strong> &mdash; [TEXT]</div>
</div>
<div class="timeline-card">
  <div class="timeline-dot yellow"></div>
  <div class="timeline-text"><strong>[ITEM]</strong> &mdash; [TEXT]</div>
</div>
<div class="timeline-card">
  <div class="timeline-dot orange"></div>
  <div class="timeline-text"><strong>[ITEM]</strong> &mdash; [TEXT]</div>
</div>
```

> **NOTE**: The old `.status-timeline`, `.status-item`, `.status-dot`, `.status-text` are **renamed** to `.timeline-card`, `.timeline-dot`, `.timeline-text`.

**Dot colors**: `green` (done), `yellow` (in progress), `orange` (warning), `red` (blocked)
**When to use**: Timelines, status reports, checklists, roadmaps. Place in `layout-single`.

### 9. Chart / 图表 (`.chart-container`)

Interactive Chart.js visualization that auto-themes from CSS custom properties.

**CRITICAL**: Chart.js must be loaded via CDN in `<head>`:
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.8/dist/chart.umd.min.js"></script>
```

```html
<div class="chart-container">
  <canvas id="chart-[N]"></canvas>
  <script type="application/json" data-chart-config="chart-[N]">
  {
    "type": "[TYPE]",
    "data": {
      "labels": ["[LABEL_1]", "[LABEL_2]", "[LABEL_3]", "[LABEL_4]"],
      "datasets": [{
        "label": "[DATASET_LABEL]",
        "data": [VALUE_1, VALUE_2, VALUE_3, VALUE_4]
      }]
    }
  }
  </script>
</div>
```

For circular charts (pie, doughnut, radar, polarArea), add `chart-square` class:
```html
<div class="chart-container chart-square">
```

| Type | Use for | Container class |
|---|---|---|
| `bar` | Comparisons, rankings | `.chart-container` |
| `line` | Trends over time | `.chart-container` |
| `pie` | Parts of a whole | `.chart-container chart-square` |
| `doughnut` | Parts of a whole (with center stat) | `.chart-container chart-square` |
| `radar` | Multi-dimensional comparison | `.chart-container chart-square` |
| `polarArea` | Circular comparison with magnitude | `.chart-container chart-square` |

**When to use**: Performance metrics, distribution breakdowns, survey results, growth trends.

### 10. Table / 表格 (`.table-wrap`)

Styled data table with header row and hover highlights.

```html
<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>[COL_1]</th>
        <th>[COL_2]</th>
        <th>[COL_3]</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="cell-highlight">[ROW_1_COL_1]</td>
        <td>[ROW_1_COL_2]</td>
        <td>[ROW_1_COL_3]</td>
      </tr>
    </tbody>
  </table>
</div>
```

Use `cell-highlight` for emphasis, `cell-muted` for secondary values.
**When to use**: Feature comparisons, pricing tables, spec sheets.

### 11. Image Block / 图片块 (`.image-block`)

Image display component. No padding, fills the slot naturally.

```html
<div class="image-block">
  <img src="assets/[IMAGE_FILE]" alt="[ALT_TEXT]" class="slide-image">
</div>
```

**Variants:** `image-screenshot` (border + shadow), `image-logo` (smaller), `image-fullbleed` (absolute positioned background).

> **NOTE**: The old `.image-frame` class is **renamed** to `.image-block`.

**When to use**: Product screenshots, architecture diagrams, photos, logos.

### 12. Content Block / 内容块 (`.content-block`)

Plain text container. Title is handled by Zone 1 header.

```html
<div class="content-block">
  <p class="text">[PARAGRAPH_TEXT with <span class="accent">emphasized phrases</span>]</p>
</div>
```

**Key Quote variant** (left border emphasis):
```html
<div class="content-block">
  <h1>[KEY_POINT_TEXT]</h1>
  <div class="cb-detail">[SUPPORTING_DETAIL]</div>
</div>
```

> **NOTE**: The old `.cb-wrap`, `.cb-heading`, `.cb-body`, `.cb-accent`, `.cb-number`, `.cb-pair`, `.cb-card`, `.cb-keyquote` are **replaced** by `.content-block`, `.text`, `.accent`, `.cb-detail`.

**When to use**: General text content, key quotes, reading passages. The fallback when no other component fits.

---

### Summary Panel / 总结浮层 (Zone 3)

A floating panel triggered by a bottom button. **NOT placed inside a layout slot** — sits directly inside `<div class="slide">`, after the content area.

```html
<button class="summary-trigger" onclick="this.closest('.slide').querySelector('.summary-panel').classList.toggle('visible')"></button>
<div class="summary-panel">
  <div class="summary-content">
    <h3>本页要点</h3>
    <ul>
      <li>[KEY_POINT_1]</li>
      <li>[KEY_POINT_2]</li>
    </ul>
  </div>
</div>
```

**When to use**: At the end of a knowledge point page when there are key takeaways worth summarizing.


---

### 13. Title Hero (封面标题组 `.title-hero`)

封面页的核心内容组件，放入 `layout-title` 布局中使用。所有颜色交给主题层控制，组件本身只管结构与字号。

```html
<div class="title-hero">
  <p class="title-hero-subject">[SUBJECT_NAME]</p>
  <h1 class="title-hero-heading">[COURSEWARE_TITLE]</h1>
  <div class="title-hero-divider"></div>
  <p class="title-hero-author">讲师：[TEACHER_NAME]</p>
</div>
```

> **NOTE**: `.title-hero-heading` 的渐变色和 `.title-hero-divider` 的渐变色均在主题文件中定义。换主题时封面颜色自动跟着变。未来新增封面风格（如极简风、图片背景风）时，只需定义 `.title-hero-minimal` 等变体类，布局层 `layout-title` 不需要改动。

**When to use**: 总封面和结束页（使用 `layout-title` 布局时）。

---

## Chrome Elements


These go directly inside `<body>`, BEFORE the `<div class="deck">`. They provide ambient particles, branding, navigation dots, progress bar, and keyboard hints.

```html
<div class="particles" id="particles"></div>

<div class="branding"><div class="branding-icon">[INITIAL]</div> [BRAND_NAME]</div>
<div class="slide-nav" id="slideNav"></div>
<div class="progress-bar" id="progress"></div>
<div class="slide-counter" id="counter"></div>
<div class="nav-hints"><span><kbd>&larr;</kbd><kbd>&rarr;</kbd> navigate</span></div>
```

---

## Syntax Highlighting Guide

For code blocks, use `<span>` classes following the One Dark Pro theme:

| Class | Color | Use for |
|---|---|---|
| `.tag` | `#e06c75` | HTML tag names, error types |
| `.attr` | `#d19a66` | Attribute names, parameter names |
| `.str` | `#98c379` | String literals (in quotes) |
| `.kw` | `#c678dd` | Keywords (`async`, `return`, `const`, `if`) |
| `.fn` | `#61afef` | Function/method names |
| `.prop` | `#e5c07b` | Object property names, variables |
| `.punc` | `#56b6c2` | Punctuation, brackets, operators |
| `.comment` | `#5c6370` | Comments (renders italic) |
| `.ln` | `#4b5263` | Line numbers (auto-styled, user-select: none) |

---

## Animation Classes Reference

| Class | Animation | Delay | Use for |
|---|---|---|---|
| `anim-1` | fadeInUp | 0.1s | First element (tag lines) |
| `anim-2` | fadeInUp | 0.25s | Headings |
| `anim-3` | bounceInSoft | 0.35s | Main content area |
| `anim-4` | fadeInUp | 0.55s | Supporting text |
| `anim-5` | fadeInUp | 0.7s | Attribution |
| `bounce-1`–`bounce-4` | bounceIn | 0.2s–0.65s | Cards in a grid |
| `slide-l` | slideInLeft | 0.3s | Left comparison card |
| `slide-r` | slideInRight | 0.3s | Right comparison card |
| `pop-1`–`pop-3` | countPop | 0.3s–0.6s | Stat numbers |
| `stag-1`–`stag-5` | bounceInSoft | 0.15s–0.55s | Timeline items |

**IMPORTANT**: Never place `bounce-N` or `slide-l`/`slide-r` directly on elements that use CSS transforms for interactivity (like flip cards). Use a wrapper element for the animation class.

---

## Color Accent Classes Reference

### Text highlights (defined in `components.css`)
- `highlight-blue` — primary accent, tech, features
- `highlight-green` — success, positive, solutions
- `highlight-orange` — warning, attention, problems
- `highlight-red` — danger, errors, failures
- `highlight-purple` — secondary accent, branding
- `highlight-yellow` — caution, in-progress
- `gradient-text` — blue-to-purple gradient (hero words)
- `rainbow-text` — full rainbow gradient (title keywords)

### Gradient text (stat-number / highlight-title)
Auto-assigned by column position in multi-column layouts via `--context-gradient`:
- Column 1: green → blue gradient (`--brand-primary` → `--accent-blue`)
- Column 2: yellow → orange gradient (`--accent-yellow` → `--accent-orange`)
- Column 3: blue → purple gradient (`--accent-blue` → `--accent-purple`)

Manual override classes on `.stat-number`: `.blue`, `.green`, `.orange`, `.purple`

### Timeline dot colors
`green` (done), `yellow` (in progress), `orange` (warning), `red` (blocked)

### Glow blobs (background, defined in `components.css`)
`glow-blue`, `glow-purple`, `glow-green`

### Ambient page glow (defined in theme CSS)
The XDF Green theme applies a dual-color diagonal radial gradient glow to every `.slide` page: brand green (top-left) + academic blue (bottom-right). Card surfaces use **Glassmorphism** (`backdrop-filter: blur`) to let this ambient glow naturally diffuse through them.

> **IMPORTANT**: When writing card CSS, always use `background-color` (not the `background` shorthand) to avoid accidentally resetting `background-image` and breaking the ambient glow or glassmorphism effect.

### Color cycling rule
Rotate through blue → purple → green → orange → yellow → red across slides. Don't use the same accent on consecutive slides.

### CSS `background` shorthand gotcha
> **CAUTION**: Never use `background: var(--bg-card)` on card components. The `background` shorthand resets `background-image` to `none`, which destroys any theme-injected glow or glassmorphism effect. Always use `background-color: var(--bg-card)` instead.
