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

## Components

### 1. Title Slide

The opening slide with large hero text, rainbow gradient title, glow blobs, and a rainbow divider line. **This component is an exception** — it uses `layout-single` and fills the entire content area.

```html
<div class="glow-blob glow-blue" style="top:-100px;left:-100px;"></div>
<div class="glow-blob glow-purple" style="bottom:-120px;right:-80px;"></div>
<p class="slide-tag anim-1">[TAG_LINE]</p>
<h1 class="anim-2">[TITLE_LINE_1]<br>[TITLE_LINE_2]<br><span class="rainbow-text">[HIGHLIGHT_WORD]</span> [TITLE_LINE_3]</h1>
<p class="subtitle anim-3">[SUBTITLE_TEXT]</p>
<div class="rainbow-line anim-4"></div>
<p class="subtitle anim-5" style="font-size:14px;margin-top:8px;">by <strong>[AUTHOR]</strong></p>
```

**When to use**: Always the first slide. Sets the topic and tone. Place in `layout-single`.

### 2. Statement

A bold statement with large text, optional glow blob background, and a subtitle below.

```html
<div class="glow-blob glow-purple" style="top:50%;left:50%;transform:translate(-50%,-50%);"></div>
<h1 class="anim-2" style="font-size:clamp(32px,4.5vw,56px);">[STATEMENT_TEXT]<br><span class="highlight-[COLOR]">[HIGHLIGHTED_PHRASE]</span></h1>
<div class="rainbow-line anim-3"></div>
<p class="subtitle anim-4">[SUPPORTING_TEXT]</p>
```

**When to use**: Hook slides, problem statements, key takeaways, dramatic reveals. Place in `layout-single`.

### 3. Flip Cards (2x2 Grid)

Four interactive cards in a 2x2 grid. Each card flips on click to reveal a detail on the back.

**CRITICAL**: The `bounce-N` animation class goes on the `.flip-bounce-wrap` wrapper, NOT on the `.flip-card` itself.

```html
<p class="subtitle" style="font-size:15px;">Click cards to flip &amp; reveal details</p>
<div class="flip-grid anim-3">
  <div class="flip-bounce-wrap bounce-1">
    <div class="flip-card">
      <div class="flip-front border-[COLOR]">
        <div class="flip-icon">[EMOJI]</div>
        <div class="flip-title">[CARD_TITLE]</div>
        <div class="flip-subtitle highlight-[COLOR]">[CARD_SUBTITLE]</div>
        <button class="card-action-btn" onclick="event.stopPropagation(); this.closest('.flip-card').classList.toggle('flipped')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg></button>
      </div>
      <div class="flip-back">
        <div class="flip-icon-big">[EMOJI]</div>
        <div class="flip-detail">[BACK_TEXT with <strong>bold keywords</strong>]</div>
        <button class="card-action-btn" onclick="event.stopPropagation(); this.closest('.flip-card').classList.toggle('flipped')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg></button>
      </div>
    </div>
  </div>
  <!-- Repeat for bounce-2, bounce-3, bounce-4 -->
</div>
```

**Border color options**: `border-orange`, `border-yellow`, `border-red`
**When to use**: 4 related concepts, problems, features, or comparisons. Can fill `layout-single` or one slot of a multi-column layout.

### 4. VS / Comparison Cards

Two side-by-side cards with a pulsing "+" connector between them.

```html
<div class="vs-container anim-3">
  <div class="vs-card card-left slide-l">
    <div class="vs-label-top highlight-purple">[LEFT_LABEL]</div>
    <div class="vs-name highlight-purple">[LEFT_NAME]</div>
    <div class="vs-desc">[LEFT_DESC]</div>
    <div class="vs-badge">[LEFT_BADGE]</div>
  </div>
  <div class="vs-plus anim-3">+</div>
  <div class="vs-card card-right slide-r">
    <div class="vs-label-top highlight-blue">[RIGHT_LABEL]</div>
    <div class="vs-name gradient-text">[RIGHT_NAME]</div>
    <div class="vs-desc">[RIGHT_DESC]</div>
    <div class="vs-badge">[RIGHT_BADGE]</div>
  </div>
</div>
```

**When to use**: Comparing two technologies, approaches, or before/after states. Best in `layout-single`.

### 5. Architecture Flow

Three boxes connected by arrows in a horizontal flow.

```html
<div class="arch-flow anim-3">
  <div class="arch-box box-blue bounce-1">
    <div class="arch-icon">[EMOJI]</div>
    <div class="arch-label text-blue">[BOX_1_NAME]</div>
    <div class="arch-role">[BOX_1_ROLE]</div>
    <div class="arch-detail">[BOX_1_DETAIL]</div>
  </div>
  <div class="arch-arrow anim-3">
    <span>[ARROW_1_LABEL]</span>
    <div class="arrow-line"></div>
  </div>
  <div class="arch-box box-yellow bounce-2">
    <div class="arch-icon">[EMOJI]</div>
    <div class="arch-label text-yellow">[BOX_2_NAME]</div>
    <div class="arch-role">[BOX_2_ROLE]</div>
    <div class="arch-detail">[BOX_2_DETAIL]</div>
  </div>
  <div class="arch-arrow anim-3">
    <span>[ARROW_2_LABEL]</span>
    <div class="arrow-line"></div>
  </div>
  <div class="arch-box box-green bounce-3">
    <div class="arch-icon">[EMOJI]</div>
    <div class="arch-label text-green">[BOX_3_NAME]</div>
    <div class="arch-role">[BOX_3_ROLE]</div>
    <div class="arch-detail">[BOX_3_DETAIL]</div>
  </div>
</div>
```

**Box color options**: `box-blue`/`text-blue`, `box-yellow`/`text-yellow`, `box-green`/`text-green`
**When to use**: System architecture, data pipelines, any 3-step process. Best in `layout-single`.

### 6. Code Block

macOS-style terminal window with syntax highlighting (One Dark Pro).

```html
<div class="code-window anim-3">
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

### 7. Auth Flip Compare

Two large flippable cards with a "vs" label. Good vs bad / before vs after.

**CRITICAL**: The `slide-l`/`slide-r` animation class goes on the `.auth-flip-wrap` wrapper, NOT on the `.auth-flip` itself.

```html
<p class="subtitle" style="font-size:14px;">Click to flip and compare</p>
<div class="auth-compare anim-3">
  <div class="auth-flip-wrap slide-l">
    <div class="auth-flip">
      <div class="auth-front bad">
        <div class="auth-icon">[BAD_EMOJI]</div>
        <div class="auth-name">[BAD_NAME]</div>
        <div class="auth-status">&#10060;</div>
        <div class="auth-desc">[BAD_SHORT_DESC]</div>
        <button class="card-action-btn" onclick="event.stopPropagation(); this.closest('.auth-flip').classList.toggle('flipped')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg></button>
      </div>
      <div class="auth-back">
        <div class="auth-icon">[BAD_EMOJI]</div>
        <div class="auth-name">[BAD_DETAIL_NAME]</div>
        <div class="flip-detail" style="font-size:13px;color:var(--text-muted);margin-top:8px;">[BAD_DETAIL_TEXT]<br><strong style="color:var(--accent-red);">[BAD_CONCLUSION]</strong></div>
        <button class="card-action-btn" onclick="event.stopPropagation(); this.closest('.auth-flip').classList.toggle('flipped')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg></button>
      </div>
    </div>
  </div>
  <div class="auth-vs">vs</div>
  <div class="auth-flip-wrap slide-r">
    <div class="auth-flip">
      <div class="auth-front good">
        <div class="auth-icon">[GOOD_EMOJI]</div>
        <div class="auth-name">[GOOD_NAME]</div>
        <div class="auth-status">&#10004;&#65039;</div>
        <div class="auth-desc">[GOOD_SHORT_DESC]</div>
        <button class="card-action-btn" onclick="event.stopPropagation(); this.closest('.auth-flip').classList.toggle('flipped')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg></button>
      </div>
      <div class="auth-back">
        <div class="auth-icon">[GOOD_EMOJI]</div>
        <div class="auth-name">[GOOD_DETAIL_NAME]</div>
        <div class="flip-detail" style="font-size:13px;color:var(--text-muted);margin-top:8px;">[GOOD_DETAIL_TEXT]<br><strong style="color:var(--accent-green);">[GOOD_CONCLUSION]</strong></div>
        <button class="card-action-btn" onclick="event.stopPropagation(); this.closest('.auth-flip').classList.toggle('flipped')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg></button>
      </div>
    </div>
  </div>
</div>
```

**When to use**: Before/after comparisons, good vs bad practices, old vs new approaches. Best in `layout-single`.

### 8. Stats Cards

Three large number displays in a row with bounce animation.

```html
<div class="stats-row">
  <div class="stat-card pop-1">
    <div class="stat-number blue">[NUMBER_1]<span style="font-size:0.45em;">[UNIT]</span></div>
    <div class="stat-label">[LABEL_1]</div>
    <div class="stat-desc">[DESC_1]</div>
  </div>
  <div class="stat-card pop-2">
    <div class="stat-number green">[NUMBER_2]<span style="font-size:0.45em;">[UNIT]</span></div>
    <div class="stat-label">[LABEL_2]</div>
    <div class="stat-desc">[DESC_2]</div>
  </div>
  <div class="stat-card pop-3">
    <div class="stat-number orange">[NUMBER_3]<span style="font-size:0.45em;">[UNIT]</span></div>
    <div class="stat-label">[LABEL_3]</div>
    <div class="stat-desc">[DESC_3]</div>
  </div>
</div>
```

**Number color options**: `blue`, `green`, `orange`
**When to use**: Performance metrics, survey results, key statistics.

### 9. Expandable Cards (2x2 Grid)

Four cards that expand on click to reveal hidden content.

```html
<p class="subtitle" style="font-size:15px;">Click any card to expand details</p>
<div class="use-case-grid anim-3">
  <div class="card-v2 glow-orange bounce-1">
    <div class="card-icon">[EMOJI]</div>
    <div class="card-title">[CARD_1_TITLE]</div>
    <div class="card-desc">[CARD_1_DESC]</div>
    <div class="card-expand"><div class="card-expand-inner">[CARD_1_EXPANDED with <code>code_terms</code>]</div></div>
    <button class="card-action-btn" onclick="event.stopPropagation(); this.closest('.card-v2').classList.toggle('expanded')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button>
  </div>
  <div class="card-v2 glow-blue bounce-2">
    <!-- same structure -->
  </div>
  <div class="card-v2 glow-purple bounce-3">
    <!-- same structure -->
  </div>
  <div class="card-v2 glow-green bounce-4">
    <!-- same structure -->
  </div>
</div>
```

**Glow color options**: `glow-orange`, `glow-blue`, `glow-purple`, `glow-green`
**When to use**: Use cases, features, benefits — anything where 4 items each need short + detailed views.

### 10. Status Timeline

Vertical list of items with colored status dots that stagger-animate in.

```html
<div class="status-timeline">
  <div class="status-item stag-1"><div class="status-dot green"></div><div class="status-text"><strong>[ITEM_1]</strong> &mdash; [TEXT_1]</div></div>
  <div class="status-item stag-2"><div class="status-dot yellow"></div><div class="status-text"><strong>[ITEM_2]</strong> &mdash; [TEXT_2]</div></div>
  <div class="status-item stag-3"><div class="status-dot orange"></div><div class="status-text"><strong>[ITEM_3]</strong> &mdash; [TEXT_3]</div></div>
  <div class="status-item stag-4"><div class="status-dot red"></div><div class="status-text"><strong>[ITEM_4]</strong> &mdash; [TEXT_4]</div></div>
</div>
```

**Dot colors**: `green` (done), `yellow` (in progress), `orange` (warning), `red` (blocked)
**Can have 3-6 items** using `stag-1` through `stag-5`.
**When to use**: Timelines, status reports, checklists, roadmaps.

### 11. CTA Box

A call-to-action with resources list in a gradient-bordered box.

```html
<h2 class="anim-1" style="font-size:clamp(28px,3.5vw,44px);">[CTA_HEADLINE with <span class="gradient-text">gradient highlight</span>]</h2>
<p class="subtitle anim-2 mt-16">[CTA_SUBTITLE]</p>
<div class="cta-box anim-3">
  <p style="font-size:16px;font-weight:600;color:var(--text-muted);">[BOX_TITLE]</p>
  <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px;font-size:14px;text-align:left;">
    <div style="display:flex;gap:8px;align-items:center;"><span style="color:var(--accent-blue);">&#9679;</span><span>[RESOURCE_1]</span></div>
    <div style="display:flex;gap:8px;align-items:center;"><span style="color:var(--accent-green);">&#9679;</span><span>[RESOURCE_2]</span></div>
    <div style="display:flex;gap:8px;align-items:center;"><span style="color:var(--accent-purple);">&#9679;</span><span>[RESOURCE_3]</span></div>
    <div style="display:flex;gap:8px;align-items:center;"><span style="color:var(--accent-orange);">&#9679;</span><span>[RESOURCE_4]</span></div>
  </div>
</div>
<div class="rainbow-line anim-4 mt-24"></div>
<p class="subtitle anim-5" style="font-size:13px;margin-top:8px;">[ATTRIBUTION]</p>
```

**When to use**: Always the last slide. Resources, links, next steps. Place in `layout-single`.

### 12. Chart

Interactive Chart.js visualization that auto-themes from CSS custom properties.

**CRITICAL**: Chart.js must be loaded via CDN in `<head>`:
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.8/dist/chart.umd.min.js"></script>
```

```html
<div class="chart-container anim-3">
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
<div class="chart-container chart-square anim-3">
```

**Chart type reference:**

| Type | Use for | Container class |
|---|---|---|
| `bar` | Comparisons, rankings | `.chart-container` |
| `line` | Trends over time | `.chart-container` |
| `pie` | Parts of a whole (few slices) | `.chart-container chart-square` |
| `doughnut` | Parts of a whole (with center stat) | `.chart-container chart-square` |
| `radar` | Multi-dimensional comparison | `.chart-container chart-square` |
| `polarArea` | Circular comparison with magnitude | `.chart-container chart-square` |
| `scatter` | Correlation between two variables | `.chart-container` |
| `bubble` | Three-variable correlation | `.chart-container` |

**When to use**: Performance metrics over time, distribution breakdowns, survey results, benchmark comparisons, growth trends.

### 13. Table

A styled data table with header row and hover highlights.

```html
<div class="table-wrap anim-3">
  <table>
    <thead>
      <tr>
        <th>[COL_1]</th>
        <th>[COL_2]</th>
        <th>[COL_3]</th>
        <th>[COL_4]</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="cell-highlight">[ROW_1_COL_1]</td>
        <td>[ROW_1_COL_2]</td>
        <td>[ROW_1_COL_3]</td>
        <td>[ROW_1_COL_4]</td>
      </tr>
      <tr>
        <td class="cell-highlight">[ROW_2_COL_1]</td>
        <td>[ROW_2_COL_2]</td>
        <td>[ROW_2_COL_3]</td>
        <td>[ROW_2_COL_4]</td>
      </tr>
      <tr>
        <td class="cell-highlight">[ROW_3_COL_1]</td>
        <td>[ROW_3_COL_2]</td>
        <td>[ROW_3_COL_3]</td>
        <td>[ROW_3_COL_4]</td>
      </tr>
    </tbody>
  </table>
</div>
```

Use `cell-highlight` on the first column (or key cells) for emphasis. Use `cell-muted` for secondary values.
**When to use**: Feature comparisons, pricing tables, spec sheets, benchmark results, structured data with multiple attributes.

### 14. Image Slide

A single image with optional caption.

```html
<div class="image-frame anim-3">
  <img src="assets/[IMAGE_FILE]" alt="[ALT_TEXT]" class="slide-image">
</div>
<p class="subtitle anim-4" style="font-size:clamp(12px,1.1vw,14px);color:var(--text-dim);">[CAPTION_OR_CREDIT]</p>
```

**Variants:**

Screenshot with border:
```html
<div class="image-frame anim-3 image-screenshot">
  <img src="assets/[IMAGE_FILE]" alt="[ALT_TEXT]" class="slide-image">
</div>
```

Logo (smaller, centered):
```html
<div class="image-frame anim-3 image-logo">
  <img src="assets/[LOGO_FILE]" alt="[ALT_TEXT]" class="slide-image">
</div>
```

**Image sources:**
- User-provided files → copy to `assets/` folder, use relative path `src="assets/filename.png"`
- Never use base64 for images larger than 50KB — always use file paths

**When to use**: Product screenshots, architecture diagrams, photos, logos. When placed in a layout slot, image can fill the slot naturally.

### 15. Content Block

The default content slide: title + text. Four variants cover the most common content patterns.

#### 15a. Statement (Default)

Title + one or two paragraphs. The simplest, most common type.

```html
<div class="cb-wrap anim-3">
  <h2 class="cb-heading anim-2">[HEADING] <span class="highlight-[COLOR]">[HIGHLIGHT]</span></h2>
  <p class="cb-body anim-3">[PARAGRAPH_TEXT with <span class="cb-accent">emphasized phrases</span> for key points.]</p>
  <p class="cb-body anim-4">[OPTIONAL_SECOND_PARAGRAPH]</p>
</div>
```

**When to use**: General title + paragraph content. The fallback when no other component fits.

#### 15b. Numbered Content

Number badge + title + text. For listicle-style slides.

```html
<div class="cb-wrap anim-3">
  <span class="cb-number anim-1">[01]</span>
  <h2 class="cb-heading anim-2">[HEADING] <span class="highlight-[COLOR]">[HIGHLIGHT]</span></h2>
  <p class="cb-body anim-3">[PARAGRAPH_TEXT]</p>
</div>
```

**When to use**: Numbered items in a series — tips, steps, rules, features.

#### 15c. Problem / Fix

Two side-by-side cards: a problem card and a fix card.

```html
<div class="cb-wrap">
  <span class="cb-number anim-1">[01]</span>
  <h2 class="cb-heading anim-2">[HEADING] <span class="highlight-[COLOR]">[HIGHLIGHT]</span></h2>
  <div class="cb-pair">
    <div class="cb-card problem bounce-1">
      <div class="cb-card-label problem-label">&#x26A0; The Problem</div>
      <p class="cb-card-text">[PROBLEM_TEXT]</p>
    </div>
    <div class="cb-card fix bounce-2">
      <div class="cb-card-label fix-label">&#x2713; The Fix</div>
      <p class="cb-card-text">[FIX_TEXT with <span class="cb-cmd">/command</span> inline highlights]</p>
    </div>
  </div>
</div>
```

**When to use**: Problem + solution pairs, before/after, challenge + approach, myth vs reality.

#### 15d. Key Point

Large emphasis text with a left accent border, plus supporting detail below.

```html
<div class="cb-wrap anim-3">
  <blockquote class="cb-keyquote anim-2">[KEY_POINT_TEXT — a bold, memorable claim or insight]</blockquote>
  <p class="cb-detail anim-3">[SUPPORTING_DETAIL — evidence, context, or explanation]</p>
</div>
```

**When to use**: A single impactful statement, key takeaway, memorable quote, or bold claim.

---

### 16. Summary Panel (总结浮层)

A floating panel triggered by a bottom button. Shows key takeaways for the current slide. This component is **optional** — AI decides whether to include it per-slide.

**This component is NOT placed inside a layout slot.** It sits directly inside `<div class="slide">`, after the content area. See [layout-system.md](layout-system.md) for placement.

```html
<!-- 底部触发按钮 -->
<button class="summary-trigger" onclick="this.closest('.slide').querySelector('.summary-panel').classList.toggle('visible')">
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>
</button>

<!-- 总结浮层面板 -->
<div class="summary-panel">
  <div class="summary-content">
    <h3>本页要点</h3>
    <ul>
      <li>[KEY_POINT_1]</li>
      <li>[KEY_POINT_2]</li>
      <li>[KEY_POINT_3]</li>
    </ul>
  </div>
</div>
```

**When to use**: At the end of a knowledge point page when there are key takeaways worth summarizing. NOT needed for: title slides, exercise pages, transition slides.

**Visual implementation**: CSS styling and animation effects are pending design (will be implemented by Gemini).

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

### Text highlights
- `highlight-blue` — primary accent, tech, features
- `highlight-green` — success, positive, solutions
- `highlight-orange` — warning, attention, problems
- `highlight-red` — danger, errors, failures
- `highlight-purple` — secondary accent, branding
- `highlight-yellow` — caution, in-progress
- `gradient-text` — blue-to-purple gradient (hero words)
- `rainbow-text` — full rainbow gradient (title keywords)

### Card borders (flip cards)
`border-orange`, `border-yellow`, `border-red`

### Card glows (expandable cards)
`glow-orange`, `glow-blue`, `glow-green`, `glow-purple`

### Architecture box colors
`box-blue`/`text-blue`, `box-yellow`/`text-yellow`, `box-green`/`text-green`

### Stat number colors
`blue`, `green`, `orange`

### Status dot colors
`green` (done), `yellow` (in progress), `orange` (warning), `red` (blocked)

### Glow blobs (background)
`glow-blue`, `glow-purple`, `glow-green`

### Color cycling rule
Rotate through blue → purple → green → orange → yellow → red across slides. Don't use the same accent on consecutive slides.
