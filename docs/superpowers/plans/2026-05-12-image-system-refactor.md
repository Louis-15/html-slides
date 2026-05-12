# 图片系统重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 将 html-slides 的图片系统重构为"图片卡片 + 组件内简单图片框"双层架构，图片引用由 Base64 改为外挂相对路径，并纳入持久化机制。

**架构：**
- **类型A（图片卡片 `.image-card`）**：Skill 原生生成，独占布局一栏，CSS/运行时独立成文件，编辑态提供"插入/替换图片"按钮
- **类型B（简单图片框 `.simple-image-box`）**：用户通过工具栏插入，在组件内流式混排，保留缩放功能，拖动改为上下排序
- **图片存储**：统一使用 `images/xxx.png` 相对路径，用户提前将图片放入 `课件/<课件名>/images/` 目录

**Tech Stack:** 纯原生 HTML/CSS/JS，与现有 editor/PersistenceLayer 体系对接

---

## 文件结构总览

### 新建文件

| 文件 | 职责 |
|------|------|
| `assets/zones/zone2-image-card.css` | 图片卡片样式（从 zone2-components.css 拆出 + 空态占位 + 编辑按钮） |
| `assets/runtime/image-card-runtime.js` | 图片卡片编辑态交互（注入插入/替换按钮、清空按钮、文件选择器、空态↔有图切换） |

### 修改 / 重命名 / 删除文件

| 文件 | 操作 | 内容 |
|------|------|------|
| `assets/editor/editor-text-manager.js` | **重命名→删除** | 改名为 `editor-inline-boxes.js`，下文 Task 4 详述 |
| `assets/editor/editor-images.js` | **删除** | 功能全部合并入 `editor-inline-boxes.js` |
| `assets/zones/zone2-components.css` | 修改 | 移除 `.image-card` 及其变体、`.image-fullbleed`、`.image-overlay` |
| `assets/editor/editor-core.js` | 修改 | 工具栏"插入图片"→改为"插入简单图片框"；移除 URL 输入+大图压缩逻辑 |
| `assets/editor/editor-persistence.js` | 修改 | `loadCustomBoxes` 中的图片框恢复适配新路径 |
| `references/component-templates.md` | 修改 | 更新 `.image-block` → `.image-card`（模板 + 交互合同说明 + 旧历史注释） |
| `references/layout-system.md` | 修改 | 更新两处 `.image-block` 示例类名为 `.image-card` |
| `references/html-template.md` | 修改 | 加载顺序 + 文件清单 + 删除 `ImageManager` 说明 |
| `SKILL.md` | 修改 | 加载顺序 + 文件清单更新 |
| `assets/editor/editor-core.js` | 修改 | 文件头依赖注释 + 工具栏改造 + 初始化代码 |
| `assets/editor/editor-persistence.js` | 修改 | `loadCustomBoxes` 中的图片框恢复适配新路径 |
| `testing/tests/editor-stable-id.test.js` | 修改 | 删除 `window.ImageManager` mock，改为 `BoxManager` |
| `testing/tests/slides-runtime.test.js` | 修改 | 更新 `image-block` → `image-card` 测试类名 |
| `课件/组件展示全览/组件展示全览.html` | 修改 | 加载顺序更新（`editor-images.js` → `editor-inline-boxes.js`） |
| `课件/qa-test-all-types/qa-test-all-types.html` | 修改 | 同上 |

---

## Task 1：新建 `zone2-image-card.css`

**Files:**
- Create: `assets/zones/zone2-image-card.css`
- Reference: `assets/zones/zone2-components.css:766-830`

- [ ] **Step 1: 从 zone2-components.css 提取 .image-card 样式**

从 `assets/zones/zone2-components.css` 中提取以下代码段（`/* ====== 组件 11: 图片卡片 (.image-card) ====== */` 注释块起，到 `.image-overlay` 结束，约 65 行），写入新文件。

- [ ] **Step 2: 新增空态占位样式**

```css
/* ====== 图片卡片空态（无图时保留布局位置） ====== */
.image-card.is-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  border: 2px dashed var(--border);
  border-radius: 12px;
  background: var(--bg-card);
  cursor: default;
  width: 100%;
  padding: 0;
  margin: 0;
}

.image-card.is-empty .image-placeholder-icon {
  font-size: 32px;
  opacity: 0.3;
  margin-bottom: 4px;
}

.image-card.is-empty .image-placeholder-text {
  font-size: 13px;
  color: var(--text-dim);
  opacity: 0.5;
}
```

- [ ] **Step 3: 新增编辑态按钮样式**

```css
/* ====== 图片卡片编辑按钮 ====== */
.image-card .image-actions {
  position: absolute;
  bottom: 8px;
  right: 8px;
  display: none;
  gap: 4px;
  z-index: 10;
}

.editor-mode .image-card .image-actions {
  display: flex;
}

.image-card .image-card-replace-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.image-card .image-card-replace-btn:hover {
  border-color: var(--accent-blue);
  color: var(--accent-blue);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.image-card .image-card-clear-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.image-card .image-card-clear-btn:hover {
  border-color: var(--accent-red);
  color: var(--accent-red);
  transform: translateY(-1px);
}
```

- [ ] **Step 4: 调整 .image-card 自身样式支持 `position:relative`**

在 `.image-card` 基础样式中添加 `position: relative;`，使按钮的 `position: absolute` 能正确定位。

---

## Task 2：修改 `zone2-components.css`

**Files:**
- Modify: `assets/zones/zone2-components.css`（删除第 766~830 行）

- [ ] **Step 1: 删除 .image-card / .image-fullbleed / .image-overlay 代码块**

从文件末尾附近删除以下内容：
- `/* ====== 组件 11: 图片卡片 (.image-card) ====== */` 注释
- `.image-card` 及其全部子选择器（含 `.image-card.step-active .slide-image` 第 788 行）
- `.image-fullbleed` 及其子选择器
- `.image-overlay` 及其子选择器
- 代码块结尾后多余的空白行

确认删除后 `zone2-components.css` 约 830 行。

---

## Task 3：新建 `image-card-runtime.js`

**Files:**
- Create: `assets/runtime/image-card-runtime.js`

- [ ] **Step 1: 编写 ImageCardRuntime IIFE 骨架**

```javascript
/* ===========================================
   image-card-runtime.JS
   HTML-Slides — 图片卡片编辑态运行时
   负责：空态↔有图切换、插入/替换图片按钮、文件选择器
   依赖：editor-utils.js, PersistenceLayer
   暴露：window.ImageCardRuntime
   =========================================== */

(function () {
  "use strict";

  var utils = window._editorUtils;
  var storageKey = utils.storageKey;

  var ImageCardRuntime = {

    /** 初始化：为所有 .image-card 注入编辑控件 */
    init: function () {
      var self = this;
      document.querySelectorAll('.image-card').forEach(function (block) {
        if (block._imageCardInitialized) return;
        block._imageCardInitialized = true;
        self._ensureStructure(block);
        self._injectControls(block);
      });
    },

    /** 确保 .image-card 内部结构完整（图片框/占位符/操作层） */
    _ensureStructure: function (block) {
      // 已初始化过则跳过
      if (block.querySelector('.image-actions')) return;

      // 创建操作按钮容器（始终存在，编辑态才显示）
      var actions = document.createElement('div');
      actions.className = 'image-actions';

      // 🖼️ 插入/替换图片按钮
      var replaceBtn = document.createElement('button');
      replaceBtn.className = 'image-card-replace-btn';
      replaceBtn.title = '插入/替换图片';
      replaceBtn.innerHTML = '🖼️';
      replaceBtn.setAttribute('contenteditable', 'false');

      // 🗑️ 清空图片按钮（保留框，与简单图片框的 ✖ 不同）
      var clearBtn = document.createElement('button');
      clearBtn.className = 'image-card-clear-btn';
      clearBtn.title = '清空图片（保留框）';
      clearBtn.innerHTML = '🗑️';
      clearBtn.setAttribute('contenteditable', 'false');

      actions.appendChild(replaceBtn);
      actions.appendChild(clearBtn);
      block.appendChild(actions);

      // 绑定替换按钮
      this._bindReplace(replaceBtn, block);
      this._bindClear(clearBtn, block);

      // 空态检测：如果没有 <img> 或 src 为空，打上 is-empty 标记
      this._syncEmptyState(block);
    },

    /** 同步空态标记 */
    _syncEmptyState: function (block) {
      var img = block.querySelector('.slide-image');
      var isEmpty = !img || !img.getAttribute('src') || img.getAttribute('src') === '';
      block.classList.toggle('is-empty', isEmpty);
    },

    /** 绑定替换按钮：文件选择器 → 写 src */
    _bindReplace: function (btn, block) {
      var self = this;
      // 创建隐藏的 file input
      var fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.style.display = 'none';
      document.body.appendChild(fileInput);

      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!window.editorCore || !window.editorCore.isActive) return;
        fileInput.click();
      });

      fileInput.addEventListener('change', function (e) {
        var file = e.target.files[0];
        if (!file) return;
        self._applyImageFile(file, block);
        fileInput.value = ''; // 重置，允许选同一文件
      });
    },

    /** 将文件路径写入图片框 */
    _applyImageFile: function (file, block) {
      var img = block.querySelector('.slide-image');
      if (!img) {
        // 如果没有 img 元素，创建一个
        img = document.createElement('img');
        img.className = 'slide-image';
        img.alt = '';
        // 插入到 .image-actions 之前
        var actions = block.querySelector('.image-actions');
        block.insertBefore(img, actions);
      }

      // 构建相对于 HTML 文件的路径：images/<文件名>
      var fileName = file.name;
      // 校验：文件必须有扩展名，否则提示用户
      if (!fileName || fileName.indexOf('.') === -1) {
        alert('选择的文件没有扩展名，请确认文件格式。');
        return;
      }
      var relativePath = 'images/' + fileName;

      img.setAttribute('src', relativePath);
      img.setAttribute('data-edit-id', img.getAttribute('data-edit-id') || ('img-' + Date.now()));

      this._syncEmptyState(block);

      // 保存到 localStorage
      if (window.PersistenceLayer) {
        window.PersistenceLayer.saveElement(img);
      }

      // 记录历史
      if (window.historyMgr) {
        window.historyMgr.recordState(true);
      }
    },

    /** 绑定清空按钮：清空 src，保留框 */
    _bindClear: function (btn, block) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!window.editorCore || !window.editorCore.isActive) return;
        var img = block.querySelector('.slide-image');
        if (img) {
          img.removeAttribute('src');
          img.style.display = 'none';
        }
        // 切换回空态
        block.classList.add('is-empty');

        // 更新 localStorage
        if (window.PersistenceLayer) {
          var editId = img && img.getAttribute('data-edit-id');
          if (editId) {
            try {
              localStorage.removeItem(storageKey('e:' + editId));
            } catch (e) {}
          }
        }
        if (window.historyMgr) {
          window.historyMgr.recordState(true);
        }
      });
    },

    /** DOM 恢复后重新绑定事件 */
    rehydrateSlide: function (slideEl) {
      if (!slideEl) return;
      var self = this;
      slideEl.querySelectorAll('.image-card').forEach(function (block) {
        block._imageCardInitialized = false;
        self._ensureStructure(block);
      });
    },
  };

  window.ImageCardRuntime = ImageCardRuntime;
})();
```

- [ ] **Step 2: 在 editor-core.js 初始化完成后自动调用 ImageCardRuntime.init()**

在 `editor-core.js` 末尾的初始化引导区中添加：

```javascript
  if (typeof ImageCardRuntime !== 'undefined') {
    ImageCardRuntime.init();
  }
```

---

## Task 4：合并 `editor-text-manager.js` + `editor-images.js` → `editor-inline-boxes.js`

**Files:**
- Rename: `assets/editor/editor-text-manager.js` → `assets/editor/editor-inline-boxes.js`
- Delete: `assets/editor/editor-images.js`（功能并入新文件）

**说明：** 文本框和简单图片框共享 `📍✖` 控件条、排序拖拽、`rehydrateSlide` 等逻辑，不再分两个文件维护。`editor-inline-boxes.js` 统一管理两者，`editor-images.js` 删除。

- [ ] **Step 1: 重命名文件**

```bash
Rename-Item "assets/editor/editor-text-manager.js" "editor-inline-boxes.js"
```

- [ ] **Step 2: 将 editor-images.js 中的简单图片框代码合并进来**

从 `editor-images.js` 中合并以下内容到 `editor-inline-boxes.js`：

1. **`ImageManager` 对象 → 合并到 `BoxManager`**
   - 原 `ImageManager.init()` — 扫描 `img[data-edit-id]` 的逻辑保留在 `BoxManager.init()` 中
   - 原 `ImageManager._injectControls()` — IMG 分支合并到 `BoxManager._injectControls()`，加上 `el.tagName === "IMG"` 时走简单图片框路径（创建 `.simple-image-box` 包裹 → 注入控件条 → 注入八爪鱼缩放点）
   - 原 `ImageManager._bindDrag()` — **直接删除**（改为下方 Step 3 的统一排序）
   - 原 `ImageManager._bindResize()` — 保留，简单图片框需要八爪鱼缩放
   - 原 `ImageManager._bindDelete()` — IMG 分支合并到 `BoxManager._bindDelete()`
   - 原 `ImageManager._parseTranslate()` — 删除（排序模式不再使用 translate）
   - 原 `ImageManager.createImageBox()` → 改为 `BoxManager.createSimpleImageBox(id, src, targetParent)`
   - 原 `ImageManager.rehydrateSlide()` → 合并到 `BoxManager.rehydrateSlide()`

2. **删除 `editor-images.js` 文件**
   ```bash
   Remove-Item "assets/editor/editor-images.js"
   ```

3. **更新文件头注释**

```javascript
/* ===========================================
   EDITOR-INLINE-BOXES.JS
   HTML-Slides 编辑器 — 文本框/简单图片框统一管理
   原名 editor-text-manager.js，与 editor-images.js 合并而来
   负责：
   - 文本框：创建、控件注入、删除
   - 简单图片框：创建、控件注入、八爪鱼缩放、删除
   - 统一排序拖拽（上下排列模式）
   图片卡片见 image-card-runtime.js
   依赖：editor-utils.js (window._editorUtils)
   运行时依赖：window.PersistenceLayer, window.editorCore, window.historyMgr
   暴露：window.BoxManager
   =========================================== */
```

- [ ] **Step 3: 统一 `_bindDrag` 为上下排序模式（文本框 + 简单图片框共用）**

```javascript
    /** 绑定上下排序拖拽逻辑（文本框和简单图片框共用） */
    _bindDrag: function (handle, el, wrap) {
      var dragState = null;

      handle.addEventListener('pointerdown', function (e) {
        if (!window.editorCore || !window.editorCore.isActive) return;
        e.preventDefault();
        e.stopPropagation();
        handle.setPointerCapture(e.pointerId);

        var parent = (wrap || el).parentNode;
        var siblings = Array.from(parent.children).filter(function (child) {
          return child.classList.contains('simple-image-box') ||
                 child.classList.contains('native-edit-wrap') ||
                 child.classList.contains('editable-wrap');
        });
        var currentIndex = siblings.indexOf(wrap || el);
        if (currentIndex < 0) return;

        // 给所有同级框打上排序高亮
        siblings.forEach(function (s) { s.classList.add('sort-highlight'); });

        dragState = {
          parent: parent,
          siblings: siblings,
          currentIndex: currentIndex,
          startY: e.clientY,
          target: wrap || el
        };
      });

      handle.addEventListener('pointermove', function (e) {
        if (!dragState) return;
        e.preventDefault();

        var siblings = dragState.siblings;
        var current = dragState.target;
        var currentRect = current.getBoundingClientRect();
        var currentCenterY = currentRect.top + currentRect.height / 2;

        // 遍历同级框，检查鼠标是否越过了某个框的中线
        for (var i = 0; i < siblings.length; i++) {
          if (siblings[i] === current) continue;
          var rect = siblings[i].getBoundingClientRect();
          var centerY = rect.top + rect.height / 2;

          // 鼠标越过中线且方向正确时执行交换
          if (e.clientY < centerY && currentCenterY > rect.bottom - 5 && i < dragState.currentIndex) {
            // 向上插入到该框之前
            dragState.parent.insertBefore(current, siblings[i]);
            dragState.currentIndex = i;
            currentCenterY = current.getBoundingClientRect().top + current.getBoundingClientRect().height / 2;
          } else if (e.clientY > centerY && currentCenterY < rect.top + 5 && i > dragState.currentIndex) {
            // 向下插入到该框之后
            if (siblings[i + 1]) {
              dragState.parent.insertBefore(current, siblings[i + 1]);
            } else {
              dragState.parent.appendChild(current);
            }
            dragState.currentIndex = i;
            currentCenterY = current.getBoundingClientRect().top + current.getBoundingClientRect().height / 2;
          }
        }
      });

      handle.addEventListener('pointerup', function () {
        if (!dragState) return;
        // 移除排序高亮
        dragState.siblings.forEach(function (s) { s.classList.remove('sort-highlight'); });

        // 如果排序发生了变化，保存状态
        window.PersistenceLayer.saveCustomBoxes();
        window.historyMgr.recordState(true);
        dragState = null;
      });
    },
```

> **实现说明：** 排序模式原理：`pointerdown` 时收集所有同级可排序框，打上 `sort-highlight` 类；`pointermove` 时计算鼠标 Y 轴与各框中心点的交叉关系，当鼠标越过某个框的中线时，用 `insertBefore` 交换位置。`pointerup` 时移除高亮并保存。

- [ ] **Step 4: 更新 `_injectControls` 适配简单图片框**

在 `BoxManager._injectControls` 中对 `el.tagName === "IMG"` 走简单图片框路径：

```javascript
      // 图片元素：创建简单图片框包裹
      if (el.tagName === "IMG") {
        if (el.closest('.simple-image-box')) return;
        var imgWrap = document.createElement('div');
        imgWrap.className = 'simple-image-box editable-wrap';
        imgWrap.style.display = 'inline-block';
        imgWrap.style.verticalAlign = 'top';
        el.parentNode.insertBefore(imgWrap, el);
        imgWrap.appendChild(el);
        wrap = imgWrap;
        // 注入八爪鱼缩放点（简单图片框需要）
        this._injectResizeHandles(imgWrap);
      }
```

八爪鱼缩放注入抽取为独立方法：

```javascript
    /** 注入八爪鱼缩放点 */
    _injectResizeHandles: function (target) {
      if (!target || target.querySelector('.rs-se')) return;
      var corners = ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'];
      var self = this;
      corners.forEach(function (dir) {
        var r = document.createElement('div');
        r.className = 'rs-handle rs-' + dir;
        r.setAttribute('data-dir', dir);
        r.setAttribute('contenteditable', 'false');
        target.appendChild(r);
        self._bindResize(r, target);
      });
      target.style.resize = 'none';
    },
```

- [ ] **Step 5: 添加 `createSimpleImageBox` 方法**

```javascript
    /** 创建简单图片框（流式布局，放入组件内部） */
    createSimpleImageBox: function (id, src, targetParent) {
      if (!targetParent) return null;
      var wrap = document.createElement('div');
      wrap.className = 'simple-image-box editable-wrap';
      wrap.style.display = 'inline-block';
      wrap.style.verticalAlign = 'top';

      var img = document.createElement('img');
      img.setAttribute('data-edit-id', id);
      img.className = 'simple-image';
      if (src) img.setAttribute('src', src);
      img.style.maxWidth = '100%';
      img.style.display = 'block';

      wrap.appendChild(img);
      targetParent.appendChild(wrap);
      this._injectControls(img);
      return wrap;
    },
```

- [ ] **Step 6: 为 `_bindDelete` 添加 IMG 图片框删除分支**

在 `BoxManager._bindDelete` 中原有判断基础上，增加对 `.simple-image-box` 的处理：

```javascript
    /** 绑定删除/隐藏逻辑 — 文本框/简单图片框共用 */
    _bindDelete: function (btn, el, wrap) {
      btn.addEventListener('click', function () {
        if (!window.editorCore || !window.editorCore.isActive) return;
        var isCustom = wrap && wrap.classList.contains('custom-box');
        var isSimpleImage = el.tagName === 'IMG' && wrap && wrap.classList.contains('simple-image-box');
        var msg = isSimpleImage
          ? '确定要删除这个图片框吗？'
          : isCustom
            ? '确定要删除这个文本框吗？'
            : '确定要隐藏此元素吗？';
        if (!confirm(msg)) return;

        if (isCustom || isSimpleImage) {
          var id = el.getAttribute('data-edit-id');
          (wrap || el).remove();
          try { localStorage.removeItem(storageKey('e:' + id)); } catch (e) {}
          window.PersistenceLayer.saveCustomBoxes();
        } else {
          el.style.display = 'none';
          window.PersistenceLayer.saveNativeMods();
        }
        window.historyMgr.recordState(true);
      });
    },
```

- [ ] **Step 7: 更新 `rehydrateSlide` 适配简单图片框**

```javascript
    /** DOM 恢复后重新绑定事件 — 文本框 + 简单图片框共用 */
    rehydrateSlide: function (slideEl) {
      if (!slideEl) return;
      var self = this;
      slideEl.querySelectorAll('[data-edit-id]').forEach(function (el) {
        self._injectControls(el);
      });
    },
```

- [ ] **Step 8: 更新 `BoxManager.init()` — 同时扫描 IMG 元素**

```javascript
    init: function () {
      var self = this;
      document.querySelectorAll('[data-edit-id]').forEach(function (el) {
        if (el.hasAttribute('data-edit-id-auto')) return;
        self._injectControls(el);
      });
    },
```

不再按 `el.tagName === "IMG"` 跳过，因为 `_injectControls` 内部会区分处理。

- [ ] **Step 9: 删除 `editor-images.js` 并确保 `ImageManager` 引用跑路前清理**

```bash
Remove-Item "d:\Projects\html-slides\assets\editor\editor-images.js"
```

检查 `editor-core.js` 和 `editor-persistence.js` 中所有对 `ImageManager` 的引用，改为 `BoxManager`（简单图片框已合并）或 `ImageCardRuntime`（图片卡片已独立）。

- [ ] **Step 10: 更新 `editor-core.js` 文件头依赖注释**

```javascript
/* ===========================================
   EDITOR-CORE.JS
   HTML-Slides 编辑器 — 编辑模式总控 + 初始化引导 + 工具栏HTML注入
   依赖：editor-utils.js, editor-persistence.js, editor-history.js,
         editor-inline-boxes.js, editor-rich-text.js
   暴露：window.editorCore, window.historyMgr, window.richToolbar, window.boxManager
   =========================================== */
```

---

## Task 5：更新 `editor-core.js` — 改造工具栏图片按钮

**Files:**
- Modify: `assets/editor/editor-core.js`

- [ ] **Step 1: 替换工具栏中"插入图片"下拉菜单为"插入简单图片框"按钮**

将以下 HTML：

```javascript
'<div class="rt-dropdown" title="插入图片">' +
'<button class="rt-btn" id="imageToggle">...' +
'<div class="rt-dropdown-menu" id="imageDropdown" style="width: 260px;">' +
'<div class="rt-input-group">' +
'<input type="url" id="imageUrlInput" placeholder="输入图片 URL">' +
'<button class="rt-input-btn" id="applyImageBtn">插入网络图片</button>' +
'<div style="text-align:center;font-size:12px;color:var(--editor-text-muted);margin:4px 0;">或</div>' +
'<input type="file" id="imageFileInput" accept="image/*" style="display:none;">' +
'<button class="rt-input-btn secondary" id="triggerImageFileBtn">📂 浏览本地图片...</button>' +
'</div>' +
'</div>' +
'</div>' +
```

替换为：

```javascript
'<button class="rt-btn" id="addSimpleImageBtn" title="插入简单图片框">' +
'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>' +
'</button>' +
```

- [ ] **Step 2: 移除旧的图片事件绑定代码**

删除以下事件绑定代码块：
- `imageToggle` 的 pointerdown 监听（约第 629-633 行）
- `applyImageBtn` 的 click 监听（约第 638-662 行）
- `triggerImageFileBtn` / `imageFileInput` 的 click/change 监听（约第 664-712 行）

- [ ] **Step 3: 添加"插入简单图片框"事件绑定**

```javascript
  // 插入简单图片框按钮
  var addSimpleImageBtn = document.getElementById('addSimpleImageBtn');
  if (addSimpleImageBtn) {
    addSimpleImageBtn.addEventListener('click', function () {
      var slides = getAllSlides();
      var cs = slides[getCurrentSlideIndex()];
      if (!cs) return;

      // 找到当前焦点所在的一级宿主组件
      var focusedEl = typeof window.__slideRuntime__ !== 'undefined' &&
        typeof window.__slideRuntime__.getFocusedInteractionElement === 'function'
        ? window.__slideRuntime__.getFocusedInteractionElement() : null;

      var targetParent = focusedEl || cs.querySelector('.slide-content') || cs;

      // 简单图片框已合并到 BoxManager
      if (typeof BoxManager !== 'undefined') {
        BoxManager.createSimpleImageBox(
          'simple-img-' + Date.now(),
          null,  // src = null（空框，用户后续通过文件选择器填充）
          targetParent
        );
        PersistenceLayer.saveCustomBoxes();
        historyMgr.recordState(true);
      }
    });
  }
```

- [ ] **Step 4: 更新初始化代码**

```javascript
  // 初始化内联框管理器（文本框 + 简单图片框）
  BoxManager.init();
  window.boxManager = BoxManager;

  // 初始化图片卡片运行时
  if (typeof ImageCardRuntime !== 'undefined') {
    ImageCardRuntime.init();
  }
```

---

## Task 6：更新 `editor-persistence.js`

**Files:**
- Modify: `assets/editor/editor-persistence.js`

- [ ] **Step 1: `loadCustomBoxes` 中简单图片框恢复适配**

当前 `loadCustomBoxes` 对 `db.type === 'image'` 调用。由于简单图片框已合并到 `BoxManager.createSimpleImageBox`，需要调整：

```javascript
if (db.type === 'image') {
    var ts = slides[db.si];
    if (ts) {
        var targetParent = ts.querySelector('.slide-content') || ts;
        window.BoxManager.createSimpleImageBox(db.id, db.c, targetParent);
    }
}
```

- [ ] **Step 2: 确保 `exportCleanHTML` 钩子中剔除编辑态按钮**

在 `PersistenceLayer.exportCleanHTML` 的清洗逻辑中，添加 `.image-actions` 的清除（使保存的 HTML 不含编辑按钮）：

```javascript
// 在现有清洗逻辑中添加
clone.querySelectorAll('.image-actions').forEach(function (el) { el.remove(); });
```

---

## Task 7：更新组件引用 — `component-templates.md`

**Files:**
- Modify: `references/component-templates.md`

- [ ] **Step 1: 更新 `.image-card` 模板**

将旧的模板：

```html
<div class="image-card">
  <img src="assets/[IMAGE_FILE]" alt="[ALT_TEXT]" class="slide-image">
</div>
```

替换为：

```html
<!--
  data-image-slot="true" 表示这个图片框可以由用户在编辑模式下替换图片。
  当 src 为空时，运行时自动显示占位符；有图时显示图片。
  图片文件应放在 课件/<课件名>/images/ 目录下。
-->
<div class="image-card is-empty" data-image-slot="true">
  <div class="image-placeholder-icon">🖼️</div>
  <div class="image-placeholder-text">图片占位（编辑模式下点击 🖼️ 按钮替换）</div>
</div>
<!-- 有图时的结构（编辑模式下由 runtime 自动切换）：
<div class="image-card">
  <img src="images/diagram.png" alt="说明图" class="slide-image">
</div>
-->
```

---

## Task 8：加载顺序与文档更新

- [ ] **Step 1: 更新 `SKILL.md` — 文件清单追加**

在 SKILL.md 的 Supporting Files 表格末尾添加：

```markdown
| [image-card-runtime.js](assets/runtime/image-card-runtime.js) | 图片卡片运行时：替换按钮、空态切换、文件选择器 | Phase 4 (generation) |
```

在 Zone CSS 加载顺序中添加 `zone2-image-card.css`：

```
... → zone2-components.css → zone2-image-card.css → zone2-immersive-components.css → ...
```

在 JS 加载顺序中 `editor-inline-boxes.js` 之后添加 `image-card-runtime.js`：

```
... → editor-inline-boxes.js → image-card-runtime.js → editor-rich-text.js → ...
```

- [ ] **Step 2: 更新 `references/html-template.md`**

同上，在模板文件中添加 `zone2-image-card.css` 和 `image-card-runtime.js` 的加载引用。

- [ ] **Step 3: 更新 `组件展示全览.html` 和 `qa-test-all-types.html`**

在两个 HTML 文件中添加：
- CSS 区：`<link rel="stylesheet" href="../../assets/zones/zone2-image-card.css">`
- JS 区：`<script src="../../assets/runtime/image-card-runtime.js"></script>`

---

## Task 9：补充文档与测试文件更新

**说明：** 名称变更波及多个参考文档和测试文件，它们不是核心实施步骤，但漏掉会导致编译错误或测试失败。

**Files:**
- Modify: `references/component-templates.md`, `references/layout-system.md`, `references/html-template.md`
- Modify: `testing/tests/editor-stable-id.test.js`, `testing/tests/slides-runtime.test.js`

- [ ] **Step 1: 更新 `references/component-templates.md`**

三处需要修改：

① 第 53 行交互合同中的类名 `.image-block` → `.image-card`（无需改代码逻辑，只类名变更）

```markdown
> **ORDINARY PAGE INTERACTION CONTRACT (2026-04-25)**: ...Passive components such as `.card`, `.stat-card`, `.timeline-card`, `.chart-container`, `.table-wrap`, `.code-window`, `.image-card`, `.dual-bar`, and `.content-block` still participate in this top-level focus order...
```

② 第 295 行标题：`Image Block / 图片块 (`.image-block`)` → `Image Card / 图片卡片 (`.image-card`)`

③ 第 300 行模板内容已由 Task 7 Step 1 覆盖

④ 第 307 行历史备注和旧模板删除，替换为：

```markdown
> **HISTORY**: Formerly `.image-block`, renamed to `.image-card` in v1.0.0 image system refactor (2026-05-12) to distinguish from the simple `.simple-image-box` component.
```

- [ ] **Step 2: 更新 `references/layout-system.md`**

两处 `.image-block` 示例类名改为 `.image-card`：

```html
<div class="image-card">
  <img src="images/diagram.png" alt="语法结构图" class="slide-image">
</div>
```

```html
<div class="image-card">
  <img src="images/scene.jpg" alt="课文插图" class="slide-image">
</div>
```

- [ ] **Step 3: 更新 `references/html-template.md` 中的说明文字**

第 265 行的控件说明改为：

```markdown
All elements get **unified drag/delete controls** (📍✖) at runtime. Text and simple image elements via `BoxManager._injectControls()`, image-card via `ImageCardRuntime` (from `image-card-runtime.js`). No separate CSS wrappers needed for native elements.
```

同时删除以下两行代码引用：
- `<script src="../../assets/editor/editor-images.js"></script>`（共 2 处，第 181 和 308 行）
- 文件清单中的 `editor-images.js` 条目

替换为 `editor-inline-boxes.js`（此时 `editor-text-manager.js` 已重命名）。

- [ ] **Step 4: 更新 `testing/tests/editor-stable-id.test.js`**

删除 `window.ImageManager` mock，因为 `editor-images.js` 已删除：

```javascript
  // ❌ 删除以下代码块
  window.ImageManager = {
    init() {},
    _injectControls() {},
    createImageBox() {},
    rehydrateSlide() {},
  };
```

`BoxManager` mock 保持不变即可（它现在同时管文本框和简单图片框）。

- [ ] **Step 5: 更新 `testing/tests/slides-runtime.test.js`**

三处引用 `.image-block` 类名需改为 `.image-card`：

```javascript
// 第 670 行
<div class="image-card audit-image-card">

// 第 709 行
{ label: 'image-card', element: window.document.querySelector('.audit-image-card') },

// 第 1142 行的 step-active 选择器断言
assert.match(zone2ContentSource, /\.image-card\.step-active\s+\.slide-image[\s\S]*transform:\s*scale\(1\.01\);/, ...);
```

---

## 自审检查

### 1. 需求覆盖

| 需求 | 对应 Task |
|------|-----------|
| 类型A：图片卡片独立文件 | Task 1 (CSS) + Task 3 (JS) |
| 类型B：简单图片框保留缩放 | Task 4 |
| 类型B：拖动改为上下排序 | Task 4 Step 1 |
| 类型B：删除整个框 | Task 4（保留现有 `_bindDelete`） |
| 类型A：插入/替换图片按钮 | Task 3 Step 1 `_bindReplace` |
| 类型A：清空图片保留框 | Task 3 Step 1 `_bindClear` |
| 类型A：空态占位保留布局 | Task 1 Step 2 (`.is-empty` CSS) |
| 图片路径改为 `images/xxx.png` | Task 3 Step 1 `_applyImageFile` |
| 路径纳入 localStorage | Task 3 Step 1 `saveElement` 调用 |
| 工具栏改造 | Task 5 |
| 持久化适配 | Task 6 |
| 文档更新 | Task 7 + Task 8 + Task 9 |
| 测试文件类名同步 | Task 9 Step 4 + Step 5 |
| `references/layout-system.md` 示例同步 | Task 9 Step 2 |
| `references/html-template.md` 说明同步 | Task 9 Step 3 |
| 图片路径容错校验 | Task 3 `_applyImageFile` |
| `editor-core.js` 依赖注释同步 | Task 4 Step 10 |

### 2. 占位符检查

所有代码块都已包含具体实现代码，无 TBD/TODO 占位。

### 3. 类型/名称一致性

- `BoxManager` — 统一暴露名，管理文本框 + 简单图片框
- `ImageCardRuntime` — 图片卡片运行时
- `.image-card` — 图片卡片 CSS 类名
- `.simple-image-box` — 简单图片框 CSS 类名
- `editor-inline-boxes.js` — 文本框 + 简单图片框合并文件
- `editor-images.js` — ❌ 已删除，功能分别合并/独立
- `image-card-runtime.js` — 图片卡片（新文件）
- `zone2-image-card.css` — 图片卡片样式（新文件）

### 4. 文件引用清理清单（提醒执行时逐一核对）

| 旧引用 | 改为 |
|--------|------|
| `editor-text-manager.js` | `editor-inline-boxes.js`（重命名） |
| `editor-box-manager.js` | `editor-inline-boxes.js`（曾重命名为 text-manager） |
| `editor-images.js` | 删除，不再引用 |
| `ImageManager.createImageBox(...)` | `BoxManager.createSimpleImageBox(...)` |
| `ImageManager.init()` | `BoxManager.init()`（已包含 IMG 扫描） |
| `ImageManager.rehydrateSlide()` | `BoxManager.rehydrateSlide()`（已包含 IMG 恢复） |
| `.image-block`（CSS 类名） | `.image-card` |
| `.image-block.step-active`（CSS 选择器） | `.image-card.step-active` |
| `window.ImageManager` mock（测试文件） | 删除（`editor-images.js` 已删除） |
| `ImageManager._injectControls()`（html-template.md 说明） | `BoxManager._injectControls()` / `ImageCardRuntime` |
