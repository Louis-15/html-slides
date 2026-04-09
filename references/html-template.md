# HTML Teaching Courseware Template

Reference architecture for generating teaching courseware slides. **All generated courseware must follow this structure.** This ensures every generated file passes the spec validator.

For slide canvas structure (header bar + content area + summary component) and layout modes, see [layout-system.md](layout-system.md).

## Output Format Spec (Mandatory)

Every generated HTML file **must** comply with these rules:

1. Has `<div class="deck" id="deck">` wrapping all slides
2. Slides are `<div class="slide">` elements (not `<section>`)
3. First slide has `class="slide active"`
4. All slides have `data-slide="N"` with sequential numbering from 0
5. Global `function goTo()`, `function next()`, `function prev()` via external `slides-runtime.js`
6. All CSS via external `<link>` references to `./assets/` files (except font CDN imports and small per-presentation `:root` overrides inline)
7. All JS via external `<script src>` references to `./assets/` files (except CDN libraries and small per-presentation custom scripts inline)
8. Has `<meta name="generator" content="html-slides v1.0.0">` in `<head>`

## Base HTML Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="generator" content="html-slides v1.0.0">
    <title>Courseware Title</title>

    <!-- Fonts: use Fontshare or Google Fonts — never system fonts -->
    <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=...">

    <!-- Chart.js: Include ONLY if presentation uses Chart components -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.8/dist/chart.umd.min.js"></script>

    <!-- CSS: All via external <link> references -->
    <link rel="stylesheet" href="./assets/viewport-base.css">
    <link rel="stylesheet" href="./assets/themes/[teaching-theme].css"> <!-- teaching theme -->
    <link rel="stylesheet" href="./assets/components.css">
    <link rel="stylesheet" href="./assets/editor.css"> <!-- always included -->
    <link rel="stylesheet" href="./assets/slide-animations.css"> <!-- custom animations -->

    <style>
        /* Only per-presentation :root variable overrides stay inline */
        :root {
            --accent: #00ffcc;
            --font-display: 'Clash Display', sans-serif;
            --font-body: 'Satoshi', sans-serif;
        }
    </style>
</head>
<body>
    <!-- Chrome elements (optional) -->
    <div class="progress-bar" id="progress"></div>
    <div class="slide-counter" id="counter"></div>
    <div class="slide-nav" id="slideNav"></div>

    <!-- Slide container (REQUIRED) -->
    <div class="deck" id="deck">

        <!-- === SLIDE 0: Title Slide === -->
        <div class="slide active" data-slide="0">
            <!-- Title slide uses layout-single, no header bar -->
            <div class="slide-content layout-single">
                <h1 class="anim-2">Courseware Title</h1>
                <p class="subtitle anim-3">Author / Date</p>
            </div>
            <script type="application/json" class="slide-notes">
            {"title":"Title","script":"...","notes":["..."]}
            </script>
        </div>

        <!-- === SLIDE 1: Content Slide (Three-Zone Canvas) === -->
        <div class="slide" data-slide="1">
            <!-- ZONE 1: Header Bar (fixed two lines) -->
            <div class="slide-header">
                <div class="header-module">[教学模块名称]</div>
                <div class="header-title">[当前知识点名称]</div>
            </div>

            <!-- ZONE 2: Content Area (AI chooses layout mode) -->
            <div class="slide-content layout-2col">
                <div class="col">
                    <p data-edit-id="s1-body">Left column content...</p>
                </div>
                <div class="col">
                    <img src="assets/diagram.png" alt="说明图" style="width:100%;height:100%;object-fit:contain;">
                </div>
            </div>

            <!-- ZONE 3: Summary Component (optional, AI decides) -->
            <button class="summary-trigger" onclick="this.closest('.slide').querySelector('.summary-panel').classList.toggle('visible')">
                📋 本页总结
            </button>
            <div class="summary-panel">
                <div class="summary-content">
                    <h3>📌 本页要点</h3>
                    <ul>
                        <li>要点 1</li>
                        <li>要点 2</li>
                    </ul>
                </div>
            </div>

            <script type="application/json" class="slide-notes">
            {"title":"Knowledge Point","script":"...","notes":["..."]}
            </script>
        </div>

        <!-- More slides... -->
    </div>

    <!-- JS: All via external <script src> references -->
    <script src="./assets/slides-runtime.js"></script>

    <!-- Editor modules (always included): strict dependency order -->
    <script src="./assets/editor-utils.js"></script>
    <script src="./assets/editor-persistence.js"></script>
    <script src="./assets/editor-history.js"></script>
    <script src="./assets/editor-box-manager.js"></script>
    <script src="./assets/editor-rich-text.js"></script>
    <script src="./assets/editor-core.js"></script>
    <script src="./assets/doodle-runtime.js"></script>

    <script>
        /* Only per-presentation custom JS stays inline
           (e.g., Chart.js config, custom interactions) */
    </script>
</body>
</html>
```

## Required JavaScript Features

Every presentation must include these **global functions**:

1. **`goTo(index)`** — Navigate to slide at index. Toggle `.active` class.
2. **`next()`** — Go to next slide.
3. **`prev()`** — Go to previous slide.

These must be plain functions on `window`, not inside an IIFE, class, or module.

Input bindings required:
- Keyboard: Arrow keys, Space, PageUp/PageDown, Home, End
- Touch: Swipe left/right (50px threshold)
- Mouse wheel: With 600ms cooldown

Optional enhancements (match to chosen style):
- Custom cursor with trail
- Particle system background (canvas)
- Parallax effects
- 3D tilt on hover
- Magnetic buttons
- Counter animations

## Inline Editing Implementation (Always ON)

**Inline editing is always enabled for teaching courseware.** No opt-out.

The editing system is powered by external asset files — **all via `<link>` and `<script src>` references, never inline:**

### 1. CSS Reference

Reference `editor.css` via `<link>`, **after** the theme CSS:
```html
<link rel="stylesheet" href="./assets/editor.css">
```

### 2. Toolbar HTML (Dynamic Injection)

**The toolbar HTML is NOT in the template.** It is dynamically injected by `editor-core.js` at runtime. No toolbar HTML needs to be written in the presentation file.

### 3. Editable Elements

Every text element that should be editable MUST have a unique `data-edit-id` attribute:
```html
<h2 data-edit-id="s1-title">Slide Title</h2>
<p data-edit-id="s1-body">Body text</p>
```
**Naming:** `s{slideNumber}-{type}{index}` (e.g., `s3-l2` for slide 3, list item 2).

All elements get **unified drag/delete controls** (📍✖) via `BoxManager._injectControls()` at runtime. No separate CSS wrappers needed for native elements.

### 4. JS Reference (6 Modular Files)

Reference 6 editor JS files at the **end of `<body>`**, AFTER `slides-runtime.js`, in **strict dependency order**:
```html
<script src="./assets/editor-utils.js"></script>
<script src="./assets/editor-persistence.js"></script>
<script src="./assets/editor-history.js"></script>
<script src="./assets/editor-box-manager.js"></script>
<script src="./assets/editor-rich-text.js"></script>
<script src="./assets/editor-core.js"></script>
<script src="./assets/doodle-runtime.js"></script>
```

> **WARNING:** Loading order is critical. `editor-utils.js` must be first (base utilities), `editor-core.js` must be last (orchestrates all others).

### 5. Plugin Hook System (for future extensions)

The runtime exposes `window.EditorHooks` for future modules (drawing, recording, etc.):
```javascript
// 涂鸦模块注册示例
EditorHooks.register('onEditModeEnter', function() { showDrawingToolbar(); });
EditorHooks.register('onEditModeExit', function() { hideDrawingToolbar(); });
EditorHooks.register('onExportClean', function(clonedDoc) {
    // 将 canvas 涂鸦转为 img 标签
    clonedDoc.querySelectorAll('.draw-canvas').forEach(c => { /* ... */ });
});
```

### 6. Feature Summary

| Feature | Shortcut | Notes |
|---------|----------|-------|
| Toggle edit mode | `E` key / top-left | Hotzone hover reveals button |
| Bold / Italic / Underline / Strikethrough | Toolbar | Strikethrough renders in red |
| Font family | Toolbar dropdown | 8 presets (Inter, Arial, 微软雅黑…) |
| Font size ±2px | A+ / A- | Smart: selection → partial, no selection → whole box |
| Text / Highlight color | Palette dropdowns | 12 colors each |
| Ruby annotation | 📚 顶标 | Requires text selection |
| Add text box | + 文本框 | Absolute positioned, draggable |
| Drag any element | 📍 handle | Unified PointerEvent engine |
| Delete/hide any element | ✖ button | Confirm dialog |
| Undo / Redo | Ctrl+Z / Ctrl+Y | Per-slide, max 50 steps |
| Export clean HTML | Ctrl+S | Always active |
| **Space key** | Normal typing | **No longer triggers page navigation in edit mode** |


## Image Pipeline (Skip If No Images)

If user chose "No images" in Phase 1, skip this entirely. If images were provided, process them before generating HTML.

**Dependency:** `pip install Pillow`

### Image Processing

```python
from PIL import Image, ImageDraw

# Circular crop (for logos on modern/clean styles)
def crop_circle(input_path, output_path):
    img = Image.open(input_path).convert('RGBA')
    w, h = img.size
    size = min(w, h)
    left, top = (w - size) // 2, (h - size) // 2
    img = img.crop((left, top, left + size, top + size))
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size, size], fill=255)
    img.putalpha(mask)
    img.save(output_path, 'PNG')

# Resize (for oversized images that inflate HTML)
def resize_max(input_path, output_path, max_dim=1200):
    img = Image.open(input_path)
    img.thumbnail((max_dim, max_dim), Image.LANCZOS)
    img.save(output_path, quality=85)
```

| Situation | Operation |
|-----------|-----------|
| Square logo on rounded aesthetic | `crop_circle()` |
| Image > 1MB | `resize_max(max_dim=1200)` |
| Wrong aspect ratio | Manual crop with `img.crop()` |

Save processed images with `_processed` suffix. Never overwrite originals.

### Image Placement

**Use direct file paths** (not base64) — presentations are viewed locally:

```html
<img src="assets/logo_round.png" alt="Logo" class="slide-image logo">
<img src="assets/screenshot.png" alt="Screenshot" class="slide-image screenshot">
```

```css
.slide-image {
    max-width: 100%;
    max-height: min(50vh, 400px);
    object-fit: contain;
    border-radius: 8px;
}
.slide-image.screenshot {
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}
.slide-image.logo {
    max-height: min(30vh, 200px);
}
```

**Adapt border/shadow colors to match the chosen style's accent.** Never repeat the same image on multiple slides (except logos on title + closing).

**Placement patterns:** Logo centered on title slide. Screenshots in two-column layouts with text. Full-bleed images as slide backgrounds with text overlay (use sparingly).

---

## Code Quality

**Comments:** Every section needs clear comments explaining what it does and how to modify it.

**Accessibility:**
- Keyboard navigation works fully
- ARIA labels where needed
- `prefers-reduced-motion` support (included in viewport-base.css)

## File Structure

Single courseware:
```
courseware.html                # HTML with external CSS/JS references + inline speaker notes
assets/                        # CSS, JS modules, themes, images
├── viewport-base.css          # Mandatory responsive CSS
├── themes/                    # Theme CSS files
├── components.css             # Component CSS
├── editor.css                 # Editor UI CSS (always included)
├── slides-runtime.js          # Navigation JS
├── editor-utils.js            # Editor base utilities
├── editor-persistence.js      # localStorage + export
├── editor-history.js          # Undo/redo
├── editor-box-manager.js      # Text/image box management
├── editor-rich-text.js        # Rich text toolbar logic
├── editor-core.js             # Editor orchestrator + dynamic toolbar injection
├── doodle-runtime.js          # Doodle overlay
├── slide-animations.css       # Custom animations for this courseware
└── [images]                   # Any courseware images
```

Multiple courseware files sharing one project:
```
[name].html
assets/                        # Shared assets folder
```
