# Zone 2 CSS Architecture Refactor — Design Spec

## Goal

Restructure the Zone 2 stylesheet architecture so that the quiz-annotation system and immersive components no longer live inside a single monolithic `assets/zones/zone2-content.css` file. The refactor must preserve behavior, preserve public class names, and prepare the repo for future immersive components without developing those future components in this round.

## Decision Summary

This refactor adopts a **three-file Zone 2 CSS structure**:

1. `assets/zones/zone2-content.css`
   - Keeps Zone 2 generic layout modes and generic components.
   - Stops owning quiz-annotation and title-hero component structure.

2. `assets/zones/zone2-quiz-annotation.css`
   - Owns the entire `.quiz-annotation` / `.qa-*` visual system.
   - Also owns quiz-annotation-specific editor-mode CSS currently mixed into `assets/editor.css`.

3. `assets/zones/zone2-immersive-components.css`
   - Owns `title-hero` today.
   - Becomes the future home for other non-quiz immersive Zone 2 components such as chapter covers, closing quote pages, and QR-code endings.

The user-selected boundary is **Scheme A**: keep `layout-title` and other layout rules in `zone2-content.css`; only component styles and immersive overrides move.

## Current State

### Existing coupling

- `assets/zones/zone2-content.css`
  - Contains Zone 2 layout rules.
  - Contains generic component rules.
  - Contains `title-hero` cover component rules.
  - Contains the entire quiz-annotation CSS system, including immersive override, three-column layout, grading states, notes UI, connectors, divider button, and reduced-motion overrides.

- `assets/editor.css`
  - Contains a quiz-annotation-specific editing workaround:
    - `.editor-mode .quiz-annotation .qa-passage`
    - `.editor-mode .quiz-annotation .qa-answer-panel`

- `assets/themes/xindongfang-green.css`
  - Contains theme-only overrides for `.title-hero-heading` and `.title-hero-divider`.
  - This is the correct layer and should remain untouched structurally.

- HTML files currently load only `zone2-content.css` for Zone 2 structure:
  - `高考英语阅读实战.html`
  - `七选五理论论述.html`
  - `assets/quiz-annotation-demo.html`

### Documentation mismatch already exists

The repo documentation currently describes quiz-annotation as intentionally living in `zone2-content.css`. After this refactor, at least these docs become stale unless updated:

- `开发者文档/答题与批注组件.md`
- `开发者文档/布局与组件开发文档.md`

## Scope

### In scope

- Split quiz-annotation CSS into a dedicated `zone2-quiz-annotation.css` file.
- Split `title-hero` into a dedicated `zone2-immersive-components.css` file.
- Move quiz-annotation-specific editor-mode CSS out of `assets/editor.css` into the dedicated quiz CSS module.
- Update repo HTML files that currently depend on `zone2-content.css` alone.
- Update developer docs that now document the wrong CSS ownership.
- Keep runtime JavaScript unchanged unless a stylesheet move requires selector or load-order repair.

### Out of scope

- Developing new immersive components.
- Renaming public classes such as `.quiz-annotation`, `.qa-*`, `.title-hero*`.
- Refactoring `assets/quiz-annotation-runtime.js`.
- Refactoring theme files beyond keeping existing `.title-hero` theme overrides working.
- Updating temporary files under `d:/Projects/Intermediate Products`.

## Target Architecture

### 1. `assets/zones/zone2-content.css`

Responsibility after refactor:

- Zone 2 layout modes
- Generic layout slot rules
- Generic Zone 2 components
- Generic auto-stagger animation rules

Responsibility removed:

- `title-hero` component block
- All `.quiz-annotation` / `.qa-*` blocks
- Quiz-specific reduced-motion entries
- Quiz-specific immersive override rules

The top-of-file inventory comments must be updated so the file description matches reality after extraction.

### 2. `assets/zones/zone2-immersive-components.css`

Responsibility:

- `title-hero`
- `title-hero-subject`
- `title-hero-heading`
- `title-hero-divider`
- `title-hero-author`

Design rule:

- This file is for **immersive Zone 2 components other than quiz-annotation**.
- It may later grow to include chapter-cover, closing-quote, and QR-ending components.
- It does **not** take ownership of `layout-title`; the layout rule remains in `zone2-content.css`.

### 3. `assets/zones/zone2-quiz-annotation.css`

Responsibility:

- The entire contiguous quiz-annotation block currently beginning at the comment `组件 14: 答题与批注 (.quiz-annotation)` in `zone2-content.css`
- Quiz-specific immersive override:
  - `.slide:has(.quiz-annotation) .slide-header`
  - `.slide:has(.quiz-annotation) .slide-content`
- Quiz internal layouts and states
- Quiz grading states
- Notes panel and bubble styling
- Connectors, drag placeholder, divider button, isolation rules
- Quiz-specific reduced-motion entries
- Quiz-specific editor-mode overflow/padding compensation currently in `assets/editor.css`

This file becomes the single CSS source of truth for the quiz component.

### 4. Theme files

`assets/themes/xindongfang-green.css` remains responsible for theme appearance only. Existing `.title-hero` gradient and divider overrides stay there so moving the structure out of `zone2-content.css` does not change theme layering.

## File Ownership Matrix

| Concern | File After Refactor |
|------|------|
| Zone 2 layouts (`layout-single`, `layout-title`, `layout-2col`, etc.) | `assets/zones/zone2-content.css` |
| Generic Zone 2 components (`.card`, `.flip-card`, `.table-wrap`, etc.) | `assets/zones/zone2-content.css` |
| Cover/title component structure (`.title-hero*`) | `assets/zones/zone2-immersive-components.css` |
| Quiz immersive override and full quiz UI (`.quiz-annotation`, `.qa-*`) | `assets/zones/zone2-quiz-annotation.css` |
| Quiz editor-mode special handling | `assets/zones/zone2-quiz-annotation.css` |
| Theme look for title hero | `assets/themes/xindongfang-green.css` |
| Quiz runtime logic | `assets/quiz-annotation-runtime.js` |

## HTML Load Order

The target CSS order for repo HTML files is:

1. `viewport-base.css`
2. `themes/xindongfang-green.css`
3. `components.css`
4. `zones/zone1-header.css`
5. `zones/zone2-content.css`
6. `zones/zone2-immersive-components.css`
7. `zones/zone2-quiz-annotation.css`
8. `zones/zone3-summary.css`
9. `editor.css`

Reasoning:

- Theme variables load before structure.
- Generic Zone 2 styles load before specialized Zone 2 modules.
- Specialized modules remain logically grouped with Zone 2 files.
- `editor.css` stays last so existing editor-layer precedence is preserved.

## Documentation Changes Required

### `开发者文档/答题与批注组件.md`

Must be updated from:

- “写在 `zone2-content.css` 中，不新建 Zone 文件”

To:

- quiz-annotation CSS now lives in `assets/zones/zone2-quiz-annotation.css`
- runtime JS remains `assets/quiz-annotation-runtime.js`

The “新增文件清单” section must also be corrected.

### `开发者文档/布局与组件开发文档.md`

Must be updated so the architecture diagram and file ownership table no longer imply that all Zone 2 component structure lives in `zone2-content.css`.

## Migration Strategy

1. Create the two new CSS files first.
2. Copy styles into the new files without renaming selectors.
3. Trim `zone2-content.css` only after the extracted files exist.
4. Move quiz-specific editor CSS into the new quiz CSS file.
5. Update HTML references.
6. Update docs.
7. Run static verification.

This order minimizes the chance of temporary broken imports during development.

## Validation Requirements

The implementation is successful only if all of the following are true:

- `zone2-content.css` no longer owns live `.quiz-annotation`, `.qa-*`, or `.title-hero*` selectors.
- `zone2-quiz-annotation.css` contains the full quiz visual system, including editor-mode special cases.
- `zone2-immersive-components.css` owns `title-hero` structure.
- Repo HTML files load the new CSS files in the agreed order.
- Existing quiz pages and cover pages render unchanged in normal mode.
- Existing editor mode behavior for quiz pages remains unchanged.
- Developer docs no longer describe the old monolithic CSS ownership.

## Risks And Mitigations

### Risk 1: Selector precedence changes after file split

Mitigation:

- Keep selector names unchanged.
- Use the agreed load order.
- Preserve `editor.css` as the final stylesheet.

### Risk 2: Demo file diverges from repo pages

Mitigation:

- Include `assets/quiz-annotation-demo.html` in the refactor scope.
- Use its relative `zones/...` paths consistently.

### Risk 3: Documentation becomes more wrong after refactor

Mitigation:

- Treat doc updates as required scope, not optional cleanup.

## Non-Goals Reminder

This round is an architecture regroup only. No new component behavior, no new immersive components, and no JS runtime redesign should be bundled into the refactor.