# Zone 2 CSS Architecture Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split quiz-annotation CSS and immersive component CSS out of `assets/zones/zone2-content.css` without changing runtime behavior.

**Architecture:** Keep generic Zone 2 layouts and generic components in `zone2-content.css`, move the entire quiz visual system into `zone2-quiz-annotation.css`, and move `title-hero` into `zone2-immersive-components.css`. Preserve public selectors, preserve theme ownership, and keep `editor.css` as the final stylesheet in HTML load order.

**Tech Stack:** Plain CSS, HTML link tags, repo Markdown docs, existing browser runtime (`quiz-annotation-runtime.js`)

**Spec:** `docs/superpowers/specs/2026-04-18-zone2-css-architecture-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `assets/zones/zone2-content.css` | Generic Zone 2 layouts and generic components only |
| `assets/zones/zone2-immersive-components.css` | `title-hero` and future non-quiz immersive components |
| `assets/zones/zone2-quiz-annotation.css` | Entire quiz-annotation visual system, including quiz editor-mode special cases |
| `assets/editor.css` | Generic editor styles only; no quiz-specific structural ownership |
| `高考英语阅读实战.html` | Main repo page; must load the new Zone 2 CSS files |
| `七选五理论论述.html` | Repo page; must load the new Zone 2 CSS files |
| `assets/quiz-annotation-demo.html` | Component demo; must load the new Zone 2 CSS files |
| `开发者文档/答题与批注组件.md` | Must reflect the new quiz CSS ownership |
| `开发者文档/布局与组件开发文档.md` | Must reflect the new Zone 2 stylesheet architecture |

---

### Task 1: Create the new Zone 2 CSS module files

**Files:**
- Create: `assets/zones/zone2-immersive-components.css`
- Create: `assets/zones/zone2-quiz-annotation.css`

- [ ] **Step 1: Create `zone2-immersive-components.css` with a dedicated header**

Create `assets/zones/zone2-immersive-components.css` with this header:

```css
/* ===========================================
   ZONE 2: 沉浸式组件 (Immersive Components)
   负责会独立占据视觉舞台的 Zone 2 组件结构。

   当前包含：
   - 总封面组件 (.title-hero)

   未来预留：
   - 章节封面组件
   - 封底鸡汤页组件
   - 封底二维码页组件

   注意：
   - 本文件不拥有 layout-title 等布局规则
   - 主题配色覆写继续放在 themes/*.css
   =========================================== */
```

- [ ] **Step 2: Move the full `title-hero` block from `zone2-content.css` into the new immersive file**

Move the contiguous block currently covering these selectors from `assets/zones/zone2-content.css` into `assets/zones/zone2-immersive-components.css` unchanged:

- `.title-hero`
- `.title-hero-subject`
- `.title-hero-heading`
- `.title-hero-divider`
- `.title-hero-author`

The moved code should still look like this structurally:

```css
.title-hero { ... }
.title-hero-subject { ... }
.title-hero-heading { ... }
.title-hero-divider { ... }
.title-hero-author { ... }
```

- [ ] **Step 3: Create `zone2-quiz-annotation.css` with a dedicated header**

Create `assets/zones/zone2-quiz-annotation.css` with this header:

```css
/* ===========================================
   ZONE 2: 答题与批注组件 (Quiz Annotation)
   负责 .quiz-annotation 及全部 .qa-* 视觉样式。

   包含：
   - 沉浸式逃逸规则
   - 三栏布局
   - 正文、批注、答题区
   - 判分反馈、连线槽位、批注气泡、连线与拖拽
   - quiz 专属编辑模式补丁
   - 无障碍与 reduced-motion 补丁
   =========================================== */
```

- [ ] **Step 4: Copy the full quiz-annotation CSS block into the new quiz file before trimming the source file**

Copy the entire contiguous block that begins at the comment for “组件 14: 答题与批注 (.quiz-annotation)” in `assets/zones/zone2-content.css` into `assets/zones/zone2-quiz-annotation.css`.

This copied block must include all of the following categories unchanged:

- `.slide:has(.quiz-annotation) ...` immersive override rules
- `.quiz-annotation`, `.qa-body`, `.qa-passage`, `.qa-notes-panel`, `.qa-answer-panel`
- grading selectors such as `.qa-answer-slot`, `.qa-slot-*`, `.qa-option.result-*`
- notes selectors such as `.qa-note-bubble`, `.qa-note-header`, `.qa-note-actions`
- connector selectors such as `.qa-connector-canvas`, `.qa-connector-line`, `.qa-edge-arrow`
- support selectors such as `.qa-divider-btn`, isolation rules, hidden scrollbars
- the quiz-specific portion of the reduced-motion block

Do not rename selectors during the move.

- [ ] **Step 5: Verify both new files exist and contain the expected anchor selectors**

Run:

```powershell
rg -n "title-hero|quiz-annotation|\.qa-" assets/zones/zone2-immersive-components.css assets/zones/zone2-quiz-annotation.css
```

Expected:

- `zone2-immersive-components.css` shows `title-hero` selectors.
- `zone2-quiz-annotation.css` shows `.quiz-annotation` and `.qa-*` selectors.

---

### Task 2: Trim `zone2-content.css` down to generic Zone 2 ownership

**Files:**
- Modify: `assets/zones/zone2-content.css`

- [ ] **Step 1: Remove the moved `title-hero` block from `zone2-content.css`**

Delete the component block that starts with the “组件 13: 封面标题组 (.title-hero)” comment and ends after `.title-hero-author`.

After deletion, do not leave live duplicate selectors behind.

- [ ] **Step 2: Remove the moved quiz-annotation block from `zone2-content.css`**

Delete the contiguous block that starts with the “组件 14: 答题与批注 (.quiz-annotation)” comment and includes the live quiz selectors through the Zone 2 responsive/a11y section.

Leave behind, at most, a short comment pointer like this:

```css
/* quiz-annotation 样式已迁移到 zone2-quiz-annotation.css */
```

- [ ] **Step 3: Update the file header comments so the inventory matches the new ownership**

Revise the top comment in `assets/zones/zone2-content.css` so it no longer claims that this file owns:

- the total cover component structure
- the quiz-annotation component

Replace that inventory with wording that makes the file sound generic, for example:

```css
/*
   ZONE 2: 内容区 (Content Area)
   布局系统 + 通用组件集合。

   不包含：
   - 沉浸式组件（见 zone2-immersive-components.css）
   - 答题与批注组件（见 zone2-quiz-annotation.css）
*/
```

- [ ] **Step 4: Verify `zone2-content.css` no longer owns live quiz or title-hero selectors**

Run:

```powershell
rg -n "^\.title-hero|^\.quiz-annotation|^\.qa-" assets/zones/zone2-content.css
```

Expected:

- no live selector matches
- comments are acceptable if they are plain text pointers only

---

### Task 3: Move quiz-specific editor-mode CSS out of `editor.css`

**Files:**
- Modify: `assets/editor.css`
- Modify: `assets/zones/zone2-quiz-annotation.css`

- [ ] **Step 1: Move the quiz editor-mode overflow/padding workaround into the new quiz file**

Take this block from `assets/editor.css`:

```css
/* 答题与批注组件专用的溢出防裁切方案 
   因为三栏内部带有 overflow-y: auto 需要保持滚动，不能轻易 visible，
   所以在编辑模式下给内部增加足够的上内边距，让 top: -32px 的控件有合法的视觉空间 */
.editor-mode .quiz-annotation .qa-passage,
.editor-mode .quiz-annotation .qa-answer-panel {
    padding-top: 40px !important;
}
```

Insert it into `assets/zones/zone2-quiz-annotation.css` near the existing editor-mode quiz selectors.

- [ ] **Step 2: Remove the moved block from `assets/editor.css`**

After moving the block, `assets/editor.css` should keep only editor-global concerns and no longer carry ownership of quiz structure.

- [ ] **Step 3: Verify the moved block exists only in the quiz CSS module**

Run:

```powershell
rg -n "padding-top: 40px !important|\.editor-mode \.quiz-annotation \.qa-passage|\.editor-mode \.quiz-annotation \.qa-answer-panel" assets/editor.css assets/zones/zone2-quiz-annotation.css
```

Expected:

- Matches only in `assets/zones/zone2-quiz-annotation.css`

---

### Task 4: Update HTML files to load the new CSS modules

**Files:**
- Modify: `高考英语阅读实战.html`
- Modify: `七选五理论论述.html`
- Modify: `assets/quiz-annotation-demo.html`

- [ ] **Step 1: Update repo HTML pages to insert the new Zone 2 CSS files after `zone2-content.css`**

In both repo HTML pages, change the CSS link group from:

```html
<link rel="stylesheet" href="./assets/zones/zone2-content.css">
<link rel="stylesheet" href="./assets/zones/zone3-summary.css">
<link rel="stylesheet" href="./assets/editor.css">
```

To:

```html
<link rel="stylesheet" href="./assets/zones/zone2-content.css">
<link rel="stylesheet" href="./assets/zones/zone2-immersive-components.css">
<link rel="stylesheet" href="./assets/zones/zone2-quiz-annotation.css">
<link rel="stylesheet" href="./assets/zones/zone3-summary.css">
<link rel="stylesheet" href="./assets/editor.css">
```

- [ ] **Step 2: Update the component demo HTML with the relative Zone 2 module paths**

In `assets/quiz-annotation-demo.html`, change:

```html
<link rel="stylesheet" href="zones/zone2-content.css">
```

To:

```html
<link rel="stylesheet" href="zones/zone2-content.css">
<link rel="stylesheet" href="zones/zone2-immersive-components.css">
<link rel="stylesheet" href="zones/zone2-quiz-annotation.css">
```

- [ ] **Step 3: Do not modify temporary files outside the repo in this refactor**

Do not change these files in this task:

- `d:/Projects/Intermediate Products/layout-test.html`
- other temporary outputs under `d:/Projects/Intermediate Products`

They may be updated manually later if needed, but they are not source-of-truth repo files.

- [ ] **Step 4: Verify all repo HTML files reference the new modules**

Run:

```powershell
rg -n "zone2-immersive-components.css|zone2-quiz-annotation.css" 高考英语阅读实战.html 七选五理论论述.html assets/quiz-annotation-demo.html
```

Expected:

- all three files show both new stylesheet references

---

### Task 5: Update architecture documentation to match the new file ownership

**Files:**
- Modify: `开发者文档/答题与批注组件.md`
- Modify: `开发者文档/布局与组件开发文档.md`

- [ ] **Step 1: Update `开发者文档/答题与批注组件.md` to remove the old “must stay in zone2-content.css” rule**

Replace statements like:

```md
- 属于 Zone 2 组件体系，写在 `zone2-content.css` 中，不新建 Zone 文件
```

With wording like:

```md
- 属于 Zone 2 组件体系，CSS 结构独立维护在 `assets/zones/zone2-quiz-annotation.css`
- 运行时逻辑独立维护在 `assets/quiz-annotation-runtime.js`
```

- [ ] **Step 2: Update the “新增文件清单” section in the same doc**

Change the CSS entry from:

```md
| CSS | 追加 | `assets/zones/zone2-content.css` | 在文件末尾追加答题与批注组件的全部样式 |
```

To:

```md
| CSS | 独立 | `assets/zones/zone2-quiz-annotation.css` | 答题与批注组件的全部样式独立维护 |
```

- [ ] **Step 3: Update `开发者文档/布局与组件开发文档.md` so it reflects multiple Zone 2 CSS modules**

Adjust the architecture table/diagram so it no longer implies all Zone 2 structure lives in one file.

At minimum, the doc should explicitly distinguish:

- `zone2-content.css` → generic Zone 2 layouts + generic components
- `zone2-immersive-components.css` → immersive component structures
- `zone2-quiz-annotation.css` → quiz-annotation system

- [ ] **Step 4: Verify the docs no longer contain the outdated ownership claim**

Run:

```powershell
rg -n "写在 `zone2-content.css` 中|在文件末尾追加答题与批注组件的全部样式|zone2-content.css.*12 个纯组件" 开发者文档/答题与批注组件.md 开发者文档/布局与组件开发文档.md
```

Expected:

- no outdated ownership claim remains

---

### Task 6: Run static verification and smoke-check for architectural completeness

**Files:**
- Verify: `assets/zones/zone2-content.css`
- Verify: `assets/zones/zone2-immersive-components.css`
- Verify: `assets/zones/zone2-quiz-annotation.css`
- Verify: `assets/editor.css`
- Verify: `高考英语阅读实战.html`
- Verify: `七选五理论论述.html`
- Verify: `assets/quiz-annotation-demo.html`
- Verify: `开发者文档/答题与批注组件.md`
- Verify: `开发者文档/布局与组件开发文档.md`

- [ ] **Step 1: Run editor/problem checks on the touched CSS files**

Use the Problems panel or repo tooling to confirm there are no CSS syntax errors in:

- `assets/zones/zone2-content.css`
- `assets/zones/zone2-immersive-components.css`
- `assets/zones/zone2-quiz-annotation.css`
- `assets/editor.css`

- [ ] **Step 2: Verify ownership boundaries with ripgrep**

Run:

```powershell
rg -n "^\.title-hero|^\.quiz-annotation|^\.qa-" assets/zones/zone2-content.css assets/zones/zone2-immersive-components.css assets/zones/zone2-quiz-annotation.css
```

Expected:

- `zone2-content.css` has no live `title-hero` or quiz selectors
- `zone2-immersive-components.css` owns `title-hero`
- `zone2-quiz-annotation.css` owns quiz selectors

- [ ] **Step 3: Smoke-check the main presentation page**

Open `高考英语阅读实战.html` and confirm:

- cover slide still renders `title-hero`
- quiz pages still render the quiz component
- no missing styles or obviously unstyled controls appear
- editor mode still preserves the quiz top padding workaround

- [ ] **Step 4: Smoke-check the component demo**

Open `assets/quiz-annotation-demo.html` and confirm:

- the quiz component still renders fully
- notes panel and answer panel still have styling
- no selectors were lost because of path/order mistakes

- [ ] **Step 5: Commit**

```bash
git add assets/zones/zone2-content.css assets/zones/zone2-immersive-components.css assets/zones/zone2-quiz-annotation.css assets/editor.css 高考英语阅读实战.html 七选五理论论述.html assets/quiz-annotation-demo.html 开发者文档/答题与批注组件.md 开发者文档/布局与组件开发文档.md
git commit -m "refactor: split zone2 quiz and immersive css modules"
```

---

## Self-Review Checklist

- Spec coverage:
  - quiz CSS extracted
  - immersive component CSS extracted
  - editor coupling resolved
  - HTML references updated
  - developer docs updated
- Placeholder scan:
  - no TBD/TODO markers
  - no “similar to previous task” shortcuts
- Boundary consistency:
  - `zone2-content.css` stays generic
  - `zone2-immersive-components.css` owns `title-hero`
  - `zone2-quiz-annotation.css` owns `.quiz-annotation` / `.qa-*`

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-18-zone2-css-architecture.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**