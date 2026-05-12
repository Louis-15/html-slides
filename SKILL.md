---
name: html-slides
metadata:
  version: "1.0.0"
  author: danzhu
description: Generate interactive HTML teaching courseware from lesson materials. Supports layout-driven slide generation with interactive components (flip cards, charts, tables, code blocks, expandable cards, quiz-annotation, example-card, and more). Use this skill when the user wants to create teaching slides, courseware, or educational presentations as HTML. Also trigger when the user invokes /html-slides or mentions creating teaching courseware.
---

# Teaching Courseware Generator

Create zero-dependency, interactive HTML teaching courseware that runs entirely in the browser. Designed for educators — simple input, rich output.

## Agent Compatibility

This skill is optimized for **Claude Code** and uses `AskUserQuestion` for interactive prompts. If `AskUserQuestion` is not available (Gemini CLI, GitHub Copilot, OpenAI Codex, or other agents), ask the same questions as plain text in the conversation and wait for the user to respond before proceeding.

## Core Principles

1. **Zero Dependencies** — Single HTML files with external CSS/JS in `./assets/`. No npm, no build tools.
2. **Full-Text Preservation** — Every word from the teaching materials must appear in the courseware. No summarizing, no omitting, no compressing.
3. **Content-Driven Layout** — The content decides the layout. Analyze what each slide is communicating, then choose the best layout mode.
4. **Always Editable** — Every courseware includes browser-based editing capabilities. Teachers can modify text, add annotations, and customize content directly.
5. **Single Theme** — All courseware uses the teaching theme. No theme selection needed.

## Design Aesthetics

Focus on:
- Typography: Choose fonts that are beautiful and readable. Prioritize readability for educational content — students and teachers need to read comfortably from a distance.
- Color & Theme: Use the teaching theme's CSS variables for consistency.
- Motion: Use animations sparingly and purposefully. Educational content needs clarity, not distraction.
- Surface Material: The XDF Green theme uses **Glassmorphism** (frosted glass) for all card surfaces — semi-transparent white (`rgba(255,255,255,0.25)`) combined with `backdrop-filter: blur(24px)`. This allows the slide's dual-color ambient glow (brand green top-left + academic blue bottom-right) to naturally diffuse through card surfaces. Never use opaque card backgrounds in this theme.
- Hover Interaction: All card-type components share a unified hover effect: `translateY(-2px) scale(1.02)` with shadow lift. No background color changes on hover.

> **CSS GOTCHA**: Always use `background-color` (not the `background` shorthand) when defining card backgrounds. The `background` shorthand resets `background-image` to `none`, which destroys theme-injected glow and glassmorphism effects.

---

## Viewport & Content Rules

### Canvas Behavior

- Every `.slide` uses the teaching theme's canvas sizing
- Canvas height adjusts dynamically based on content (editing can expand it via line breaks)
- Font sizes and spacing should use `clamp(min, preferred, max)` for responsive scaling
- Include `prefers-reduced-motion` support

### Content Density Rules (Teaching Courseware)

These rules **replace** the old fixed content limits:

1. **No fixed content cap** — There is no "max N items per slide" rule
2. **Full-text preservation** — AI must include every word from the teaching materials. Never summarize or compress the source content
3. **Smart pagination based on available space** — When content exceeds the content area's available height (after subtracting the header bar), split into the next slide. Continue the same header-module/header-title on the continuation slide
4. **Dynamic canvas height** — The canvas height adjusts dynamically based on content in edit mode. This behavior is preserved

---

## Phase 0: Detect Mode

Determine what the user wants:

- **Mode A: New Courseware** — Create from scratch. Go to Phase 1.
- **Mode B: PPT Conversion** — Convert a .pptx file. Go to Phase 4.
- **Mode C: Enhancement** — Improve an existing HTML courseware. Read it, understand it, enhance. **Follow Mode C modification rules below.**
- **Mode D: HTML Conversion** — Convert any HTML file into teaching courseware format. Go to Phase 5.

### Mode C: Modification Rules

When modifying existing courseware, make **minimal changes** — only touch what the user asked about.

**Editing slides:**
- Read the existing HTML file first
- Modify only the requested slide(s), keep everything else intact
- If adding/removing slides, renumber all `data-slide` attributes sequentially from 0
- If changing a component type, use the template from component-templates.md
- Update the inline `<script class="slide-notes">` block to match any content changes

**After ANY modification, verify all 8 spec rules:**
1. `<div class="deck" id="deck">` exists
2. All slides are `<div class="slide">` with sequential `data-slide="0"` through `data-slide="N"`
3. First slide has `class="slide active"`, no other slide has `active`
4. Global `goTo()`, `next()`, `prev()` functions exist
5. All CSS via external `<link>` references to `./assets/` files (except font CDN imports and small per-presentation `:root` overrides which stay inline)
6. All JS via external `<script src>` references to `./assets/` files (except CDN libraries and small per-presentation custom scripts which stay inline)
7. No broken numbering gaps after insertions or deletions
8. `<meta name="generator" content="html-slides v1.0.0">` exists in `<head>`
9. Before ALL external `<script>` tags, include `<script>window.__BASELINE__=document.documentElement.cloneNode(true)</script>` — this captures a clean DOM snapshot (no runtime JS has run yet). The save-to-HTML feature uses this as the baseline structure; at save time it appends the external `<script>` tags back from the live DOM.

**If any rule fails after editing, fix it before saving.**

---

## Phase 1: Collect Information

**Ask ALL questions in a single AskUserQuestion call:**

**Question 1 — Content** (header: "教学内容"):
请提供本课的讲义、教案或教学文本内容。Options: 内容已准备好 / 只有大纲 / 只有主题

**Question 2 — Images** (header: "配图"):
是否有需要插入的图片？Options:
- "没有图片" — 仅使用文字和组件
- "有图片" — 请提供图片文件的路径

If user has content ready, ask them to share it.

**If images were provided:**
1. **View each image** — Use the Read tool to examine the image
2. **Evaluate** — For each: what it shows, usable or not (with reason), dominant colors
3. **Plan placement** — Match images to slides. Note which layout slot each image should fill.
4. **Copy to assets/** — Place images in an `assets/` folder next to the HTML file. Use relative `src="assets/..."` paths.

Then go to Phase 2.

---

## Phase 2: Content Analysis

Before writing any HTML, analyze the teaching content and plan each slide.

### Step 2.1: Structure Analysis

1. **Identify teaching modules** — Group the content into logical teaching modules (chapters, units, topics)
2. **Identify knowledge points** — Within each module, identify individual knowledge points
3. **Plan slide breakdown** — Each knowledge point may become one or more slides depending on content volume

### Step 2.2: Per-Slide Planning

For each slide, determine:

1. **Module name** — Which teaching module does this slide belong to? (goes into `.header-module`)
2. **Knowledge point** — What specific topic is this slide covering? (goes into `.header-title`)
3. **Content elements** — What text, images, or interactive elements go on this slide?
4. **Layout mode** — Which of the 8+1 layout modes best fits this content? (see Phase 3)
5. **Components** — Does the content call for any interactive components? (flip cards, tables, charts, etc.)
6. **Summary** — Does this slide need a summary panel? (AI decides per-slide)

**Full-text integrity check**: After planning, verify that every word from the source materials has been assigned to a slide. Nothing may be omitted.

**This analysis is internal — do not present the plan to the user.**

---

## Phase 3: Layout Planning

Read [layout-system.md](references/layout-system.md) for the complete layout reference.

### Step 3.1: Canvas Structure

Every teaching courseware slide uses the three-zone canvas model:

```html
<div class="slide" data-slide="[N]">
  <!-- ZONE 1: Header Bar -->
  <div class="slide-header">
    <div class="header-module">[序号.节号 本节名称]</div>
    <div class="header-title">[本页知识点名称 — 具体到本页内容]</div>
  </div>

  <!-- ZONE 2: Content Area with layout mode -->
  <div class="slide-content layout-[MODE]">
    <!-- Content fills into layout slots -->
  </div>

  <!-- ZONE 3: Summary Component (optional) -->
  <!-- Include only when this slide has key takeaways worth summarizing -->

  <!-- Speaker Notes (mandatory) -->
  <script type="application/json" class="slide-notes">
  {"title":"[TITLE]","script":"[PRESENTER_SCRIPT]","notes":["[NOTE_1]","[NOTE_2]"]}
  </script>
</div>
```

### Step 3.2: Choose Layout Mode

For each slide, select from the 8 layout modes (+1 variant) based on content:

| Layout | When to use |
|--------|-------------|
| `layout-title` | Cover slides, chapter dividers — centered vertically and horizontally |
| `layout-single` | Large text blocks, single component, full-width image, reading passages |
| `layout-2col` | Image + text side-by-side, two parallel concepts, bilingual comparison |
| `layout-2col.compare` | Same as 2col but with an automatic "VS" circle between columns (variant, add `.compare` class) |
| `layout-2col-wide-left` | Main text/passage + auxiliary notes |
| `layout-2col-wide-right` | Labels/icons + main visual/text |
| `layout-3col` | Three parallel concepts, three-step process |
| `layout-3col.compare` | Same as 3col but with automatic "VS" circles between each column pair (variant, add `.compare` class) |
| `layout-2row` | Sequential steps, before/after |
| `layout-grid-2x2` | Four related concepts, 2×2 matrix |

**Default to `layout-single`** if the content doesn't clearly fit a multi-column layout.

### Step 3.3: Decide Summary Component

Include the summary panel when:
- The slide covers key takeaways worth reviewing
- The knowledge point has core concepts that should be explicitly summarized

Do NOT include summary for:
- Title slides
- Exercise/practice pages
- Transition slides
- Slides with very little content

---

## Phase 4: Generate Courseware

### Supporting Files

**Before generating, read these supporting files:**

- [layout-system.md](references/layout-system.md) — Canvas structure and 8+1 layout modes
- [component-templates.md](references/component-templates.md) — Component style reference for interactive elements
- [html-template.md](references/html-template.md) — HTML architecture and JS features
- [components.css](assets/components.css) — Shared component CSS (reference via `<link href="./assets/components.css">`)
- Theme CSS from `assets/themes/` — teaching theme (reference via `<link>`, BEFORE components.css)
- Zone CSS from `assets/zones/` — reference in standard order: `zone1-header.css → zone2-layout.css → zone2-components.css → zone2-immersive-components.css → zone2-quiz-annotation/quiz-layout.css → zone2-quiz-annotation/quiz-passage.css → zone2-quiz-annotation/quiz-notes-panel.css → zone2-quiz-annotation/quiz-answer-panel.css → zone2-quiz-annotation/quiz-anchors-bubbles.css → zone2-quiz-annotation/quiz-connectors.css → zone2-quiz-annotation/quiz-dragdrop.css → zone2-quiz-annotation/quiz-isolation.css → zone2-quiz-annotation/quiz-linking.css → zone2-quiz-annotation/quiz-scrollbar.css → zone2-quiz-annotation/quiz-editor-toolbar.css → zone2-quiz-annotation/quiz-responsive.css → zone2-quiz-annotation/quiz-editor-mode.css → zone2-example-card.css → zone3-summary.css`
- [navigation.js](assets/runtime/navigation.js) + [keyboard.js](assets/runtime/keyboard.js) + [step-through.js](assets/runtime/step-through.js) + [chart-integration.js](assets/runtime/chart-integration.js) + [speaker-notes.js](assets/runtime/speaker-notes.js) — 导航核心、键盘控制、交互步进、Chart.js 集成、讲者备注（按顺序引用）
- [audio-runtime.js](assets/audio/audio-runtime.js) — Global audio cue bus; reference after `slides-runtime.js` for page-turn / focus / interaction cues
- If any slide contains `.quiz-annotation`, also reference `quiz-annotation-audio.js → quiz-core.js → quiz-constants.js → quiz-fragments.js → quiz-persistence.js → quiz-connectors.js → quiz-panel.js → quiz-header.js → quiz-linking.js → quiz-activation.js → quiz-stepping.js → quiz-base.js → quiz-single.js → quiz-matching.js → quiz-blank.js → quiz-note-interactions.js → quiz-toolbar.js → quiz-init.js` after `audio-runtime.js` and before the editor modules.
- If any slide contains `.example-card`, also reference `example-card-audio.js → example-card-runtime.js`; `example-card-core.js → example-card-authoring.js → example-card-student.js` must be loaded after `editor/editor-core.js → page-richtext-annotation-runtime.js → doodle-runtime.js`
- Before ALL runtime `<script>` tags, include `<script>window.__BASELINE__=document.documentElement.cloneNode(true)</script>` for the clean save baseline. 详见 [本地化保存、读取系统](开发者文档/本地化保存、读取系统.md)
- [page-richtext-annotation-runtime.js](assets/runtime/page-richtext-annotation-runtime.js) — Ordinary-page hidden rich-text runtime; reference after `editor/editor-core.js` and before `doodle-runtime.js`
- [libraries.md](references/libraries.md) — CDN libraries for diagrams and charts (use when content needs them)
- If any slides use **Chart** components, add Chart.js CDN in `<head>`: `<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.8/dist/chart.umd.min.js"></script>`

**Key requirements:**
- HTML file with all CSS/JS as external `<link>`/`<script>` references to `./assets/`
- CSS loading order follows `viewport-base.css → theme → components.css → zone1-header.css → zone2-layout.css → zone2-components.css → zone2-immersive-components.css → zone2-quiz-annotation/quiz-layout.css → zone2-quiz-annotation/quiz-passage.css → zone2-quiz-annotation/quiz-notes-panel.css → zone2-quiz-annotation/quiz-answer-panel.css → zone2-quiz-annotation/quiz-anchors-bubbles.css → zone2-quiz-annotation/quiz-connectors.css → zone2-quiz-annotation/quiz-dragdrop.css → zone2-quiz-annotation/quiz-isolation.css → zone2-quiz-annotation/quiz-linking.css → zone2-quiz-annotation/quiz-scrollbar.css → zone2-quiz-annotation/quiz-editor-toolbar.css → zone2-quiz-annotation/quiz-responsive.css → zone2-quiz-annotation/quiz-editor-mode.css → zone2-example-card.css → zone3-summary.css → editor/editor.css`
- **Toolbar HTML is NOT in the template** — it is dynamically injected by `editor/editor-core.js` at runtime
- Reference the teaching theme CSS + components.css via `<link>`, and navigation.js via `<script>` (the first of the 5 runtime modules)
- Custom animations for this courseware → write to a separate `./assets/slide-animations.css` file and reference via `<link>`
- Per-courseware `:root` variable overrides may stay inline in a small `<style>` block
- Use fonts from Fontshare or Google Fonts — never system fonts
- Add detailed comments explaining each section
- Every section needs a clear `/* === SECTION NAME === */` comment block
- **Always generate speaker notes** — see Speaker Notes below
- Always load runtime scripts in this order: `navigation.js → keyboard.js → step-through.js → chart-integration.js → speaker-notes.js → audio-runtime.js → [quiz-annotation-audio.js → zone2-quiz-annotation/quiz-core.js → zone2-quiz-annotation/quiz-constants.js → zone2-quiz-annotation/quiz-fragments.js → zone2-quiz-annotation/quiz-persistence.js → zone2-quiz-annotation/quiz-connectors.js → zone2-quiz-annotation/quiz-panel.js → zone2-quiz-annotation/quiz-header.js → zone2-quiz-annotation/quiz-linking.js → zone2-quiz-annotation/quiz-activation.js → zone2-quiz-annotation/quiz-stepping.js → zone2-quiz-annotation/quiz-base.js → zone2-quiz-annotation/quiz-single.js → zone2-quiz-annotation/quiz-matching.js → zone2-quiz-annotation/quiz-blank.js → zone2-quiz-annotation/quiz-note-interactions.js → zone2-quiz-annotation/quiz-toolbar.js → zone2-quiz-annotation/quiz-init.js if needed] → editor/editor-utils.js → editor/editor-persistence.js → editor/editor-history.js → editor/editor-box-manager.js → editor/editor-images.js → editor/editor-rich-text.js → editor/editor-core.js → page-richtext-annotation-runtime.js → doodle-runtime.js → [example-card-audio.js → example-card-core.js → example-card-authoring.js → example-card-student.js if needed]`
- On ordinary pages, `ArrowUp/ArrowDown` own top-level focus and page turns; `ArrowLeft/ArrowRight` only step fragments inside the currently focused host. Do not generate inline `onclick` handlers to manage `.flip-card`, `.collapse-card`, or `.summary-trigger` state.
- On slides that contain `.example-card`, `ArrowUp/ArrowDown` are reserved for previous-question / next-question inside the active card, and `ArrowLeft/ArrowRight` must stay pinned to the active `.example-card__main` host.
- **Example-card content is placed directly in the slide DOM** (not inside `<template>`). The `.example-card` element is a child of the host div. The runtime's `initAll()` auto-discovers and initializes it — no manual `initCard()` call is needed in inline scripts.

### Speaker Notes (Mandatory)

Speaker notes are **embedded inline** in each slide as a hidden JSON block. They are displayed in the browser's developer console when navigating slides.

Every slide must include a `<script type="application/json" class="slide-notes">` block as its last child:

```html
<div class="slide" data-slide="0">
  <!-- visible slide content -->
  <script type="application/json" class="slide-notes">
  {"title":"Introduction","script":"This lesson covers the basics of present tense...","notes":["Key grammar rules","Common examples","Practice exercises"]}
  </script>
</div>
```

**Format:** Each slide-notes block contains:
- `title` — Slide heading (for console display)
- `script` — What the teacher would **say aloud** for this slide. Natural, conversational tone.
- `notes` — Bullet points summarizing the **key teaching points** of this slide.

**Script tone:** Write as if the teacher is speaking naturally to students. Example:
- GOOD: "Let's look at how we form questions in English. Remember the rule — we swap the subject and the auxiliary verb."
- BAD: "This slide uses a content block component with a two-column layout to display grammar rules."

**NEVER include:**
- Delivery instructions ("Pause here", "Slow down")
- Transition cues ("Move to next slide")
- Meta commentary ("This is the summary slide")

---

## Phase 5: PPT Conversion (Mode B)

When converting PowerPoint files:

1. **Extract content** — Run `python scripts/extract-pptx.py <input.pptx> <output_dir>` (install python-pptx if needed: `pip install python-pptx`)
2. **Confirm with user** — Present extracted slide titles, content summaries, and image counts
3. **Generate courseware** — Convert to teaching courseware format, preserving all text, images (from assets/), slide order, and speaker notes

---

## Phase 6: HTML Conversion (Mode D)

Convert existing HTML files into spec-compliant teaching courseware.

### Step 6.1: Analyze Input

Read the HTML file and classify the source. Read [conversion-patterns.md](references/conversion-patterns.md) for framework detection patterns.

| Source Type | Detection | Extraction Strategy |
|-------------|-----------|-------------------|
| reveal.js | `<div class="reveal">` + `<section>` elements | Map sections 1:1 to slides |
| Marp | `<!-- marp: true -->` or `class="marpit"` | Map Marp slides 1:1 |
| impress.js | `<div id="impress">` + `div.step` | Map steps 1:1 |
| Slidev | `class="slidev-layout"` or Slidev-specific classes | Map layouts 1:1 |
| Google Slides | Deeply nested divs with Google-specific classes | Extract text/images from structure |
| HTMLSlides (partial) | Has some but not all spec rules | Fix compliance gaps only |
| Article/Blog | `<article>`, `<main>`, or heading-structured HTML | Split at headings |
| Generic HTML | None of the above | Split at headings, analyze structure |

Run a compliance audit against the 8 spec rules. If all pass, tell the user the file is already compliant. If partially compliant, offer to fix only the failing rules.

### Step 6.2: Extract Content

**For slide frameworks:**
- Map existing slides 1:1 to courseware slides
- Extract title, body content, images, code blocks from each slide
- Preserve slide order

**For articles/blog posts/generic HTML:**
- Split content at heading boundaries (h1/h2 = new slide)
- First heading becomes the title slide
- Group related paragraphs, lists, and images under their nearest heading

### Step 6.3: Generate

Follow Phase 2 (Content Analysis) → Phase 3 (Layout Planning) → Phase 4 (Generate Courseware) using the extracted content.

---

## Phase 7: Delivery

1. **Open** — Use `open [filename].html` to launch in browser
2. **Summarize** — Tell the user:
   - File location, slide count
   - Navigation: Arrow keys, Space, scroll/swipe, click nav dots
   - Speaker notes: Open DevTools (F12), detach to separate window
   - Editing: Hover top-left corner or press E to enter edit mode, click any text to edit, Ctrl+S or click 💾 to save changes to the HTML file (弹窗提示保存成功 + 音效), 📂 to load archive (清除草稿并刷新). 详见 [本地化保存、读取系统](开发者文档/本地化保存、读取系统.md)

---

## Phase 8: Share & Export (Optional)

After delivery, ask: _"是否需要分享这个课件？我可以部署到在线 URL 或导出为 PDF。"_

Options: **部署到 URL** / **导出 PDF** / **都要** / **不用了**

If the user declines, stop here.

### 8A: Deploy to a Live URL (Vercel)

1. **Check prerequisites** — Run `npx vercel --version`. If not found, user needs Node.js first.
2. **Check login** — Run `npx vercel whoami`. If not logged in, guide through authorization.
3. **Deploy** — Run: `bash scripts/deploy.sh <path-to-courseware>`
4. **Share the URL**

### 8B: Export to PDF

1. **Run:** `bash scripts/export-pdf.sh <path-to-html> [output.pdf]`
2. **Large files:** If PDF exceeds 10MB, offer compact mode: `bash scripts/export-pdf.sh <path-to-html> [output.pdf] --compact`

---

## Supporting Files

| File | Purpose | When to Read |
|------|---------|-------------|
| [layout-system.md](references/layout-system.md) | Canvas structure: header bar + content area (8+1 layout modes) + summary component | Phase 3 (layout planning) |
| [component-templates.md](references/component-templates.md) | Component style reference — interactive elements for layout slots | Phase 4 (generation) |
| [html-template.md](references/html-template.md) | HTML structure, JS features, code quality standards | Phase 4 (generation) |
| [zones/zone1-header.css](assets/zones/zone1-header.css) | Zone 1 标题栏样式 — header bar 的固定结构 | Phase 4 (generation) |
| [zones/zone2-layout.css](assets/zones/zone2-layout.css) | Zone 2 布局系统 — 8+1 种布局模式 | Phase 4 (generation) |
| [zones/zone2-components.css](assets/zones/zone2-components.css) | Zone 2 通用组件 — 12 种卡片与内容组件 | Phase 4 (generation) |
| [zones/zone2-immersive-components.css](assets/zones/zone2-immersive-components.css) | 总封面与未来沉浸式组件结构 | Phase 4 (generation) |
| [zones/zone2-quiz-annotation/](assets/zones/zone2-quiz-annotation/)（13 个 CSS 子文件） | 答题与批注组件拆分后的视觉样式 | Phase 4 (generation) |
| [zones/zone2-example-card.css](assets/zones/zone2-example-card.css) | 例题组件专属样式 | Phase 4 (when example-card is used) |
| [zones/zone3-summary.css](assets/zones/zone3-summary.css) | Zone 3 总结面板样式 | Phase 4 (generation) |
| [components.css](assets/components.css) | Shared component CSS — reference via `<link>` | Phase 4 (generation) |
| [themes/](assets/themes/) | Theme CSS files — pick teaching theme, reference via `<link>` | Phase 4 (generation) |
| [navigation.js](assets/runtime/navigation.js) + [keyboard.js](assets/runtime/keyboard.js) + [step-through.js](assets/runtime/step-through.js) + [chart-integration.js](assets/runtime/chart-integration.js) + [speaker-notes.js](assets/runtime/speaker-notes.js) | 导航核心 + 键盘控制 + 交互步进 + Chart.js 集成 + 讲者备注 — 5 个模块按序加载 | Phase 4 (generation) |
| [audio-runtime.js](assets/audio/audio-runtime.js) | 全局音效总线；普通页和 quiz 页的焦点 / 翻页 / 互动 cue 都通过它播放 | Phase 4 (always included) |
| [audio-runtime.js](assets/audio/audio-runtime.js) | 全局音效总线；普通页和 quiz 页的焦点 / 翻页 / 互动 cue 都通过它播放 | Phase 4 (always included) |
| [quiz-annotation-audio.js](assets/audio/quiz-annotation-audio.js) | 答题与批注组件音效适配层 | Phase 4 (when quiz-annotation is used) |
| [zone2-quiz-annotation/](assets/runtime/zone2-quiz-annotation/)（17 个 JS 子模块，按依赖拓扑加载） | 答题与批注组件运行时逻辑 | Phase 4 (when quiz-annotation is used) |
| [example-card-audio.js](assets/audio/example-card-audio.js) | 例题组件音效适配层 | Phase 4 (when example-card is used) |
| [example-card-core.js](assets/runtime/example-card-core.js) + [example-card-authoring.js](assets/runtime/example-card-authoring.js) + [example-card-student.js](assets/runtime/example-card-student.js) | 例题组件运行时（核心+作者态+学生态） | Phase 4 (when example-card is used) |
| [editor/editor-*.js](assets/editor/) | 6 modular editor JS files — reference via `<script src>` in strict dependency order | Phase 4 (always included) |
| [page-richtext-annotation-runtime.js](assets/runtime/page-richtext-annotation-runtime.js) | 普通页面隐藏型富文本运行时；把 authored fragment 接到一级焦点宿主上 | Phase 4 (always included) |
| [editor/editor.css](assets/editor/editor.css) | Editor toolbar and controls CSS — reference via `<link>` | Phase 4 (always included) |
| [doodle-runtime.js](assets/runtime/doodle-runtime.js) | Doodle/annotation overlay JS — reference via `<script src>` | Phase 4 (always included) |
| [libraries.md](references/libraries.md) | CDN libraries: Mermaid.js, anime.js, Chart.js | Phase 4 (when content needs them) |
| [presentation-layer.md](references/presentation-layer.md) | Shared spec: slide structure, speaker notes, 8 validation rules | Phase 4 (reference) |
| [animation-patterns.md](references/animation-patterns.md) | CSS/JS animation snippets and effect-to-feeling guide | Phase 4 (generation) |
| [viewport-base.css](assets/viewport-base.css) | Responsive CSS — reference via `<link>` | Phase 4 (generation) |
| [scripts/extract-pptx.py](scripts/extract-pptx.py) | Python script for PPT content extraction | Phase 5 (PPT conversion) |
| [conversion-patterns.md](references/conversion-patterns.md) | Framework detection patterns and extraction rules | Phase 6 (HTML conversion) |
| [scripts/deploy.sh](scripts/deploy.sh) | Deploy courseware to Vercel for instant sharing | Phase 8 (sharing) |
| [scripts/export-pdf.sh](scripts/export-pdf.sh) | Export courseware to PDF | Phase 8 (sharing) |
