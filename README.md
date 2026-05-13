# HTML Slides

[![Version](https://img.shields.io/github/v/tag/bluedusk/html-slides?label=version)](https://github.com/bluedusk/html-slides/releases) [![frontend-slides compatible](https://img.shields.io/badge/frontend--slides-v2.0.0_compatible-blue)](https://github.com/zarazhangrui/frontend-slides) [![Agent Skills](https://img.shields.io/badge/Agent_Skills-compatible-green)](https://agentskills.io) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A skill for creating stunning, animation-rich HTML presentations — from scratch, by converting PowerPoint files, or by converting any existing HTML. Works with AI coding agents (Claude Code, Gemini CLI, GitHub Copilot, OpenAI Codex).

**[htmlslides.com](https://htmlslides.com)** | **[Quick Start](QUICKSTART.md)** | **[Live Demo: Introducing HTML Slides](https://bluedusk.github.io/html-slides/introducing-html-slides.html)**

## What This Does

**HTML Slides** helps educators create interactive HTML teaching courseware without knowing CSS or JavaScript.

> **Single mode** — Say "帮我做成课件" and you get a fully editable, interactive teaching courseware with 17+ components out of the box. Designed for teaching scenarios with a single unified theme.

### Key Features

- **Zero Dependencies** — HTML files with external CSS/JS references to a shared `assets/` folder. No npm, no build tools, no frameworks.
- **Agent Skills Standard** — One install works across Claude Code, Gemini CLI, GitHub Copilot, and OpenAI Codex.
- **Rich Component Library** — 17+ components: cards, flip cards, expandable cards, code blocks, stat cards, highlight cards, dual bars, timelines, charts (via Chart.js), tables, image cards, content blocks, title hero, chapter hero, ending quotes, quiz-annotation pages, example-card walkthroughs, and more.
- **Three-Zone Canvas** — Header bar + content area (8+2 layout modes with compare variants) + optional summary panel.
- **Host-Aware Stepping & Hidden Annotations** — Ordinary components, summary panels, and authored rich-text fragments share a top-level focus model with scoped left/right fragment stepping and dedicated audio cues.
- **Teaching Interaction Contracts** — `.quiz-annotation` and `.example-card` have explicit asset stacks, editor-mode rules, and keyboard contracts, so generated courseware can safely mix reading quiz pages with lightweight worked-example cards.
- **Draft-First Workflow** — AI generates a Markdown draft for user review before producing the final HTML. Full control over layout, components, and content.
- **Full-Text Preservation** — Every word of the source material appears in the courseware. No summarizing, no omitting.
- **PPT Conversion** — Convert existing PowerPoint files to web, preserving all images and content.
- **HTML Conversion** — Convert any HTML file (reveal.js, Marp, Google Slides exports, articles, generic pages) into HTMLSlides format.
- **Glassmorphism Design** — Frosted glass card surfaces with dual-color ambient glow (brand green + academic blue).
- **Inline Editing & Local Save** — Press E to enter edit mode, click any text to modify. Save changes directly to the HTML file (File System Access API), with IndexedDB-based file handle persistence across sessions. Interactive component states auto-reset on refresh. Zero runtime state in saved files. [Dev Docs](开发者文档/本地化保存、读取系统.md)

## Installation

### Quick Install (Recommended)

```bash
curl -sSL https://raw.githubusercontent.com/bluedusk/html-slides/main/remote-install.sh | bash
```

This one command clones the repo, detects your agents, and sets up everything. **Run the same command again to update.**

### Install from cloned repo

```bash
git clone https://github.com/bluedusk/html-slides.git
cd html-slides
./install.sh
```

Interactive installer with user-level vs project-level scope choice.

### Manual Install

Pick your agent(s) below. Replace `/path/to/html-slides` with the actual path to your cloned repo.

#### Claude Code

**Via plugin marketplace (recommended):**

```bash
claude plugin marketplace add bluedusk/html-slides
claude plugin install html-slides
```

**Via skill symlink:**

```bash
# User-level (available in all projects)
ln -s /path/to/html-slides ~/.claude/skills/html-slides

# Project-level (available only in current project)
ln -s /path/to/html-slides .claude/skills/html-slides
```

#### Gemini CLI

```bash
# User-level (available in all projects)
ln -s /path/to/html-slides ~/.gemini/skills/html-slides

# Project-level (available only in current project)
ln -s /path/to/html-slides .gemini/skills/html-slides
```

#### GitHub Copilot

```bash
# Project-level only (Copilot reads .github/skills/)
ln -s /path/to/html-slides .github/skills/html-slides
```

#### OpenAI Codex

```bash
# User-level (available in all projects)
ln -s /path/to/html-slides ~/.codex/skills/html-slides

# Project-level (available only in current project)
ln -s /path/to/html-slides .codex/skills/html-slides
```

All agents also support the universal `~/.agents/skills/` path as defined by the [Agent Skills standard](https://agentskills.io/specification).

### Updating

Re-run the install command to update:

```bash
curl -sSL https://raw.githubusercontent.com/bluedusk/html-slides/main/remote-install.sh | bash
```

For Claude Code plugin specifically:

```bash
claude plugin marketplace update html-slides
claude plugin update html-slides@html-slides
```

Restart your agent after updating.

## Workflow (9-Phase Process)

HTML Slides follows a structured 9-phase workflow for generating teaching courseware:

| Phase | What happens |
|-------|-------------|
| **0** | Mode detection (New / PPT / Modify / HTML conversion) |
| **1** | Collect teaching content and images from user |
| **2** | Analyze content structure, identify modules and knowledge points |
| **3** | Plan layout per slide (8+2 layout modes) |
| **4** | Generate Markdown draft for user review and modification |
| **5** | Generate final HTML with full CSS/JS references |
| **6** | PPT conversion (optional) |
| **7** | HTML conversion (optional) |
| **8** | Delivery and user guidance |
| **9** | Share & Export (Vercel deploy / PDF export, optional) |

Phase 4 (Draft Review) is where the user has full control — AI generates a per-slide Markdown draft including all content, components, annotations, and speaker notes. The user reviews and iterates before the final HTML is produced.

### Convert a PowerPoint

> "Convert my presentation.pptx to a web slideshow"

### Convert Any HTML

> "Convert my-page.html to a presentation"

Auto-detects the source format, extracts content, and generates a spec-compliant HTMLSlides file.

| Source Format | Detection |
|---------------|-----------|
| reveal.js | `<div class="reveal">` + `<section>` |
| Marp | `<!-- marp: true -->` or `class="marpit"` |
| impress.js | `<div id="impress">` + `div.step` |
| Slidev | `class="slidev-layout"` |
| Google Slides | Google-specific nested div structure |
| Article / Blog | `<article>`, `<main>`, or heading-structured HTML |
| Generic HTML | Falls back to heading-based splitting |

## Output

Every generated presentation produces:

```
my-deck.html              ← HTML with external CSS/JS references + inline speaker notes
assets/                   ← shared CSS, JS modules, themes (ships alongside the HTML)
```

### Speaker Notes

Speaker notes are embedded inside each slide as hidden JSON. Open the browser's DevTools (F12), detach to a separate window, and notes appear in the console as you navigate — a free presenter view.

```
📋 Slide 1: Introduction
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Welcome everyone. Today we'll look at how...

  • Pause after welcome
  • Gauge audience familiarity
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 For a better presenter experience, try the HTML Slides app: htmlslides.com
```

To edit notes, ask your AI agent: `"Update the speaker notes for slide 3 to say..."`

## Architecture

This skill uses **progressive disclosure** — the main `SKILL.md` is a concise map, with supporting files loaded on-demand:

| File | Purpose | Loaded When |
|------|---------|-------------|
| `SKILL.md` | Core workflow and rules | Always (entry point) |
| `references/layout-system.md` | Canvas structure and 8+2 layout modes | Phase 3 (layout planning) |
| `references/draft-guide.md` | Draft generation guide for Phase 4 | Phase 4 (draft generation) |
| `references/component-templates.md` | 17 component templates | Phase 4-5 (draft & generation) |
| `references/html-template.md` | HTML structure and JS features | Phase 5 (generation) |
| `references/animation-patterns.md` | CSS/JS animation reference | Phase 5 (generation) |
| `assets/viewport-base.css` | Mandatory responsive CSS | Phase 5 (all modes) |
| `assets/themes/xindongfang-green.css` | Single teaching theme | Phase 5 (generation) |
| `assets/zones/zone2-immersive-components.css` | Title hero, chapter hero, ending quote | Phase 5 (generation) |
| `assets/runtime/navigation.js` + `keyboard.js` + `step-through.js` + `chart-integration.js` + `speaker-notes.js` | Navigation core, keyboard dispatch, interaction step-through, Chart.js, speaker notes | Phase 5 (always included) |
| `assets/audio/audio-runtime.js` | Global audio bus for page turns, focus, and interaction cues | Phase 5 (always included) |
| `assets/runtime/zone2-quiz-annotation/` (17 JS modules) | Quiz & annotation runtime | Phase 5 (when quiz-annotation is used) |
| `assets/runtime/image-card-runtime.js` | Image card runtime (replace/clear/lightbox) | Phase 5 (generation) |
| `assets/runtime/page-richtext-annotation-runtime.js` | Ordinary-page hidden rich-text stepping | Phase 5 (always included) |
| `assets/editor/editor-*.js` (7 modules) + `editor.css` | Editor system | Phase 5 (always included) |
| `assets/runtime/doodle-runtime.js` | Doodle overlay | Phase 5 (always included) |
| `assets/runtime/example-card-core.js` + `example-card-authoring.js` + `example-card-student.js` | Example-card runtime | Phase 5 (when example-card is used) |
| `scripts/extract-pptx.py` | PPT content extraction | Phase 6 (PPT conversion) |
| `references/conversion-patterns.md` | Framework detection patterns | Phase 7 (HTML conversion) |
| `scripts/deploy.sh` | Deploy to Vercel | Phase 9 (sharing) |
| `scripts/export-pdf.sh` | Export slides to PDF | Phase 9 (sharing) |

## Sharing Your Presentations

After creating a presentation, the skill offers two ways to share:

### Deploy to a Live URL

```bash
bash scripts/deploy.sh ./presentation.html
```

Deploys to a permanent, shareable URL via [Vercel](https://vercel.com) (free). Works on any device.

### Export to PDF

```bash
bash scripts/export-pdf.sh ./presentation.html
bash scripts/export-pdf.sh ./presentation.html --compact   # smaller file
```

Screenshots each slide and combines into a PDF. Uses [Playwright](https://playwright.dev) (auto-installs).

## Requirements

- Any agent supporting the [Agent Skills standard](https://agentskills.io)
- For PPT conversion: Python with `python-pptx` library
- For URL deployment: Node.js + Vercel account (free)
- For PDF export: Node.js (Playwright installs automatically)

## Credits

Inspired by the awesome [@zarazhangrui](https://github.com/zarazhangrui)'s [frontend-slides](https://github.com/zarazhangrui/frontend-slides).
Teaching interaction contracts by [@danzhu](https://github.com/danzhu). Component system and multi-theme support by [@bluedusk](https://github.com/bluedusk).

## License

MIT — Use it, modify it, share it.
