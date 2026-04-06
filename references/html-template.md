# HTML Presentation Template

Reference architecture for generating slide presentations. **All presets must follow this structure.** This ensures every generated presentation passes the spec validator.

## Output Format Spec (Mandatory)

Every generated HTML file **must** comply with these rules:

1. Has `<div class="deck" id="deck">` wrapping all slides
2. Slides are `<div class="slide">` elements (not `<section>`)
3. First slide has `class="slide active"`
4. All slides have `data-slide="N"` with sequential numbering from 0
5. Global `function goTo()`, `function next()`, `function prev()` in `<script>`
6. All CSS inline (no external `<link rel="stylesheet">` except font imports)
7. All JS inline (no external `<script src>` except Chart.js CDN when needed)
8. Has `<meta name="generator" content="html-slides vX.Y.Z">` in `<head>`

## Base HTML Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="generator" content="html-slides v0.9.4">
    <title>Presentation Title</title>

    <!-- Fonts: use Fontshare or Google Fonts — never system fonts -->
    <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=...">

    <!-- Chart.js: Include ONLY if presentation uses Chart components -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.8/dist/chart.umd.min.js"></script>

    <style>
        /* ===========================================
           CSS CUSTOM PROPERTIES (THEME)
           Change these to change the whole look
           =========================================== */
        :root {
            /* Colors — from chosen style preset */
            --bg-primary: #0a0f1c;
            --bg-secondary: #111827;
            --text-primary: #ffffff;
            --text-secondary: #9ca3af;
            --accent: #00ffcc;
            --accent-glow: rgba(0, 255, 204, 0.3);

            /* Typography — MUST use clamp() */
            --font-display: 'Clash Display', sans-serif;
            --font-body: 'Satoshi', sans-serif;
            --title-size: clamp(2rem, 6vw, 5rem);
            --subtitle-size: clamp(0.875rem, 2vw, 1.25rem);
            --body-size: clamp(0.75rem, 1.2vw, 1rem);

            /* Spacing — MUST use clamp() */
            --slide-padding: clamp(1.5rem, 4vw, 4rem);
            --content-gap: clamp(1rem, 2vw, 2rem);

            /* Animation */
            --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
            --duration-normal: 0.6s;
        }

        /* ===========================================
           BASE STYLES (MANDATORY)
           =========================================== */
        * { margin: 0; padding: 0; box-sizing: border-box; }

        /* --- PASTE viewport-base.css CONTENTS HERE --- */
        /* viewport-base.css defines .slide layout (position, sizing, scroll-snap).
           Do NOT redefine .slide positioning or display here — it will conflict.
           Only add preset-specific visual styles below. */

        /* ===========================================
           ANIMATIONS
           Trigger via .slide.active selector
           =========================================== */
        .reveal {
            opacity: 0;
            transform: translateY(30px);
            transition: opacity var(--duration-normal) var(--ease-out-expo),
                        transform var(--duration-normal) var(--ease-out-expo);
        }

        .slide.active .reveal {
            opacity: 1;
            transform: translateY(0);
        }

        /* Stagger children for sequential reveal */
        .reveal:nth-child(1) { transition-delay: 0.1s; }
        .reveal:nth-child(2) { transition-delay: 0.2s; }
        .reveal:nth-child(3) { transition-delay: 0.3s; }
        .reveal:nth-child(4) { transition-delay: 0.4s; }

        /* ... preset-specific styles ... */
    </style>
</head>
<body>
    <!-- Chrome elements (optional) -->
    <div class="progress-bar" id="progress"></div>
    <div class="slide-counter" id="counter"></div>
    <div class="slide-nav" id="slideNav"></div>

    <!-- Slide container (REQUIRED) -->
    <div class="deck" id="deck">
        <div class="slide active" data-slide="0">
            <h1 class="reveal">Presentation Title</h1>
            <p class="reveal">Subtitle or author</p>
        </div>

        <div class="slide" data-slide="1">
            <h2 class="reveal">Slide Title</h2>
            <p class="reveal">Content...</p>
        </div>

        <!-- More slides... -->
    </div>

    <script>
        /* ===========================================
           NAVIGATION (REQUIRED — global functions)
           =========================================== */
        var slides = document.querySelectorAll('.slide');
        var current = 0;
        var total = slides.length;

        function goTo(index) {
            if (index < 0 || index >= total || index === current) return;
            current = index;
            slides.forEach(function(s, i) {
                s.classList.toggle('active', i === current);
            });
            slides[current].scrollIntoView({ behavior: 'smooth' });
            updateUI();
            showSpeakerNotes(current);
        }

        function next() { goTo(current + 1); }
        function prev() { goTo(current - 1); }

        function updateUI() {
            // Progress bar
            var progress = document.getElementById('progress');
            if (progress) progress.style.width = ((current + 1) / total * 100) + '%';

            // Slide counter
            var counter = document.getElementById('counter');
            if (counter) counter.textContent = (current + 1) + ' / ' + total;

            // Nav dots
            document.querySelectorAll('.slide-nav-dot').forEach(function(d, i) {
                d.classList.toggle('active', i === current);
            });
        }

        // Keyboard navigation
        document.addEventListener('keydown', function(e) {
            if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); next(); }
            if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
            if (e.key === 'Home') { e.preventDefault(); goTo(0); }
            if (e.key === 'End') { e.preventDefault(); goTo(total - 1); }
        });

        // Touch/swipe navigation
        var touchStart = 0;
        document.addEventListener('touchstart', function(e) { touchStart = e.touches[0].clientX; });
        document.addEventListener('touchend', function(e) {
            var diff = touchStart - e.changedTouches[0].clientX;
            if (Math.abs(diff) > 50) { diff > 0 ? next() : prev(); }
        });

        // Mouse wheel navigation
        var wheelCD = false;
        document.addEventListener('wheel', function(e) {
            if (wheelCD) return; wheelCD = true;
            setTimeout(function() { wheelCD = false; }, 600);
            if (e.deltaY > 0 || e.deltaX > 0) next(); else prev();
        }, {passive: true});

        // Nav dots (generate)
        var slideNav = document.getElementById('slideNav');
        if (slideNav) {
            slides.forEach(function(_, i) {
                var dot = document.createElement('div');
                dot.className = 'slide-nav-dot' + (i === 0 ? ' active' : '');
                dot.addEventListener('click', function() { goTo(i); });
                slideNav.appendChild(dot);
            });
        }

        updateUI();

        /* ===========================================
           SPEAKER NOTES (Console)
           =========================================== */
        function showSpeakerNotes(index) {
            var slide = slides[index];
            var notesEl = slide.querySelector('script.slide-notes') || slide.querySelector('[class="slide-notes"]');
            console.clear();
            if (notesEl) {
                try {
                    var n = JSON.parse(notesEl.textContent);
                    var title = n.title || 'Slide ' + (index + 1);
                    console.group('%c\ud83d\udccb Slide ' + (index+1) + '/' + total + ': ' + title,
                        'font-size:16px;font-weight:bold;color:#58a6ff;');
                    if (n.script) console.log('%c' + n.script, 'font-size:14px;color:#e6edf3;line-height:1.6;padding:4px 0;');
                    if (n.notes && n.notes.length) {
                        console.log('%cKey points:', 'font-size:11px;color:#6e7681;margin-top:4px;');
                        n.notes.forEach(function(note) { console.log('%c  \u2022 ' + note, 'font-size:12px;color:#8b949e;'); });
                    }
                    console.groupEnd();
                } catch(e) {}
            } else {
                console.group('%c\ud83d\udccb Slide ' + (index+1) + '/' + total,
                    'font-size:16px;font-weight:bold;color:#58a6ff;');
                console.log('%cNo speaker notes for this slide.', 'font-size:12px;color:#6e7681;');
                console.groupEnd();
            }
            console.log('%c\ud83d\udca1 htmlslides.com \u2014 presenter app for a richer experience',
                'font-size:10px;color:#3fb950;');
            console.log('%c\u270f\ufe0f  Want to update the notes? See htmlslides.com/blog/update-inline-notes.html',
                'font-size:10px;color:#8b949e;');
        }
        setTimeout(function() { showSpeakerNotes(0); }, 500);

        /* ===========================================
           OPTIONAL ENHANCEMENTS
           Match to chosen style preset
           =========================================== */
        // - Particle system background (canvas)
        // - Custom cursor with trail
        // - Parallax effects
        // - 3D tilt on hover
        // - Magnetic buttons
        // - Counter animations
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

## Inline Editing Implementation (Default ON for Teaching)

**For teaching courseware, inline editing is enabled by default.** For other use cases, it can be opted out in Phase 1.

The editing system is powered by two dedicated asset files:
- **`editor.css`** — All editing UI styles (toolbar, outlines, controls, palettes, dark/light theme)
- **`editor-runtime.js`** — 5 modular components + plugin hook system

### 1. CSS Reference

Include `editor.css` content inside the `<style>` tag, **after** the theme CSS:
```html
<style>
    /* ... theme CSS (dark-interactive.css / viewport-base.css) ... */
    /* === EDITOR CSS (from assets/editor.css) === */
    /* Copy entire contents of assets/editor.css here */
</style>
```

### 2. HTML Skeleton

Place these elements **at the top of `<body>`**, before any slides:

```html
<!-- 编辑模式热区 & 开关按钮 -->
<div class="edit-hotzone"></div>
<button class="edit-toggle" id="editToggle" title="编辑模式 (按E键)">✏️</button>

<!-- 富文本工具栏 -->
<div class="rich-toolbar" id="richToolbar">
    <!-- 撤销/重做 -->
    <button class="rt-btn wide" id="undobtn" title="撤销 (Ctrl+Z)" style="opacity:0.4;">
        <svg viewBox="0 0 24 24"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
    </button>
    <button class="rt-btn wide" id="redobtn" title="重做 (Ctrl+Y)" style="opacity:0.4;">
        <svg viewBox="0 0 24 24"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/></svg>
    </button>
    <div class="rt-divider"></div>

    <!-- 格式化 -->
    <button class="rt-btn" data-cmd="bold" title="加粗"><b>B</b></button>
    <button class="rt-btn" data-cmd="italic" title="斜体"><i>I</i></button>
    <div class="rt-dropdown" title="下划线（可选颜色）">
        <button class="rt-btn" id="ulColorToggle"><span style="text-decoration:underline;text-decoration-color:#3498db;font-weight:bold;">U</span></button>
        <div class="rt-dropdown-menu" id="ulColorDropdown"><div class="palette-grid ul-colors"></div></div>
    </div>
    <button class="rt-btn" data-cmd="strikethrough" title="删除线"><s>S</s></button>
    <div class="rt-divider"></div>

    <!-- 字体 -->
    <div class="rt-dropdown" title="字体">
        <button class="rt-btn wide" id="fontToggle">字体</button>
        <div class="rt-dropdown-menu font-menu" id="fontDropdown"></div>
    </div>

    <!-- 字号 -->
    <button class="rt-btn wide" id="fontSizeUp" title="增大字号">A+</button>
    <button class="rt-btn wide" id="fontSizeDown" title="缩小字号">A-</button>
    <div class="rt-divider"></div>

    <!-- 颜色 -->
    <div class="rt-dropdown" title="文字颜色">
        <button class="rt-btn" id="colorToggle">
            <span style="font-weight:bold;color:#e74c3c;border-bottom:3px solid #e74c3c;">A</span>
        </button>
        <div class="rt-dropdown-menu" id="colorDropdown"><div class="palette-grid text-colors"></div></div>
    </div>
    <div class="rt-dropdown" title="背景高亮">
        <button class="rt-btn" id="bgToggle"><span>🖌️</span></button>
        <div class="rt-dropdown-menu" id="bgDropdown"><div class="palette-grid bg-colors"></div></div>
    </div>
    <div class="rt-divider"></div>

    <!-- 清除格式 -->
    <button class="rt-btn" data-cmd="removeFormat" title="清除格式">🆑</button>
    <div class="rt-divider"></div>

    <!-- 顶标 & 超链接 & 图片 & 文本框 -->
    <button class="rt-btn wide" id="rubyBtn" title="为选中文字添加顶部批注">📚 顶标</button>
    <div class="rt-dropdown" title="插入超链接">
        <button class="rt-btn" id="linkToggle">🔗</button>
        <div class="rt-dropdown-menu" id="linkDropdown" style="width: 260px;">
            <div class="rt-input-group">
                <input type="url" id="linkUrlInput" placeholder="输入链接 (https://...)">
                <div class="btn-row">
                    <button class="rt-input-btn" id="applyLinkBtn">确定</button>
                    <button class="rt-input-btn danger" id="removeLinkBtn">✕ 清除</button>
                </div>
            </div>
        </div>
    </div>
    <div class="rt-dropdown" title="插入图片">
        <button class="rt-btn" id="imageToggle">🖼️</button>
        <div class="rt-dropdown-menu" id="imageDropdown" style="width: 260px;">
            <div class="rt-input-group">
                <input type="url" id="imageUrlInput" placeholder="输入图片 URL">
                <button class="rt-input-btn" id="applyImageBtn">插入网络图片</button>
                <div style="text-align:center;font-size:12px;color:var(--editor-text-muted);margin:4px 0;">或</div>
                <input type="file" id="imageFileInput" accept="image/*" style="display:none;">
                <button class="rt-input-btn secondary" id="triggerImageFileBtn">📂 浏览本地图片...</button>
            </div>
        </div>
    </div>
    <button class="rt-btn wide" id="addTextBoxBtn" title="在当前页添加新文本框">+ 文本框</button>
</div>
```

### 3. Editable Elements

Every text element that should be editable MUST have a unique `data-edit-id` attribute:
```html
<h2 data-edit-id="s1-title">Slide Title</h2>
<p data-edit-id="s1-body">Body text</p>
```
**Naming:** `s{slideNumber}-{type}{index}` (e.g., `s3-l2` for slide 3, list item 2).

All elements get **unified drag/delete controls** (📍✖) via `BoxManager._injectControls()` at runtime. No separate CSS wrappers needed for native elements.

### 4. JS Reference

Include `editor-runtime.js` content at the **end of `<body>`**, AFTER the slide controller:
```html
<script>
    /* ... SlidePresentation controller ... */
    /* === EDITOR RUNTIME (from assets/editor-runtime.js) === */
</script>
```

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

Single presentations:
```
presentation.html              # Self-contained, all CSS/JS/speaker notes inline
assets/                        # Images only, if any
```

Multiple presentations in one project:
```
[name].html
[name]-assets/
```
