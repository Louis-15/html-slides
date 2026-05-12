# 图片框改造：空占位符 + 换图按钮 + 本地 images/ 目录管理

> **项目根目录**：`d:\Projects\html-slides`
> **课件根目录示例**：`d:\Projects\html-slides\课件\七选五\`

## 概述

对 `.image-block` 组件和编辑器插入图片功能进行改造，实现三个目标：

1. **空占位符支持**——skill 生成的图片框可以不带图片，保留布局位置让用户后续填充
2. **编辑模式换图按钮**——右下角一键替换已有图片
3. **本地 images/ 目录管理**——用户授权的课件目录下自动维护 `images/` 子文件夹，统一存放课件用到的所有图片

## 设计原则

- **目录授权统一管理**：HTML 文件所在课件的目录，由 `showDirectoryPicker()` 一次性授权，句柄存入 IndexedDB。（不与 HTML 共存于一体的独立课件目录授权方案）
- **只需授权一次**：首次插入图片时调目录选择器，后续自动复用。
- **单向引用**：所有图片引用路径统一为 `./images/xxx.png`，不混合 base64 和外部 URL。
- **路径兜底**：如果 `images/` 目录句柄不可用（浏览器不支持或用户未授权），不阻止编辑，图片保留原引用方式不变。
- **无 base64 嵌入**：不把图片编码到 HTML 中，用户选择此方案即表示接受维护独立图片文件。

## 涉及文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `references/component-templates.md` | 修改 | 图片块模板支持空占位符结构 |
| `references/layout-system.md` | 修改 | 布局示例允许占位符图片块 |
| `assets/zones/zone2-components.css` | 修改 | 新增 `.image-block` 空态样式 |
| `assets/editor/editor-image.js` | **新建** | ImageManager（目录管理+文件读写）+ ImagePicker（文件选择+URL下载+DOM更新） |
| `assets/editor/editor-core.js` | 修改 | 顶部工具栏插入图片逻辑适配 ImageManager |
| `assets/editor/editor-box-manager.js` | 修改 | `_injectControls()` 注入换图按钮 |
| `assets/editor/editor.css` | 修改 | 换图按钮样式 |
| `references/html-template.md` | 修改 | 新增 `editor-image.js` 加载顺序说明 |
| `SKILL.md` | 修改 | 生成说明：图片路径约定与空占位符 |
| `docs/superpowers/specs/image-block-spec.md` | 新建 | 本计划的详细技术规格 |

## 执行步骤

### 步骤 1：定义空占位符 HTML 结构（2 个模板文件）

#### references/component-templates.md

更新第 11 号组件的生成规则：允许不带 `<img>` 的子元素。

当前模板：
```html
<div class="image-block">
  <img src="assets/[IMAGE_FILE]" alt="[ALT_TEXT]" class="slide-image">
</div>
```

改为：AI 生成时根据是否有现成图片决定输出哪种。

**有图片时**（现有行为不变）：
```html
<div class="image-block" data-has-image="true">
  <img src="./images/diagram.png" alt="说明图" class="slide-image">
</div>
```

**无图片时（占位符）**：
```html
<div class="image-block" data-has-image="false">
  <div class="image-placeholder">
    <span class="image-placeholder-icon">📷</span>
    <span class="image-placeholder-text">此处插入图片</span>
  </div>
</div>
```

> **Skill 生成规则**：即使没有图片，占位符 `.image-block` 仍然占据布局插槽的完整空间，保持页面的排版骨架不变。

#### references/layout-system.md

更新布局示例，在图片填充布局插槽的示例中注明占位符图片块的用法。不需要改布局结构本身。

---

### 步骤 2：CSS 空态样式（zone2-components.css）

在现有 `.image-block` 样式后追加。

```css
/* ====== 图片块空态占位符 ====== */
.image-block[data-has-image="false"] {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  border: 2px dashed var(--border, rgba(255,255,255,0.15));
  border-radius: 12px;
  background: rgba(255,255,255,0.03);
  cursor: default;
  transition: border-color 0.3s ease, background 0.3s ease;
}

.image-block[data-has-image="false"]:hover {
  border-color: var(--border-hover, rgba(255,255,255,0.3));
  background: rgba(255,255,255,0.06);
}

.image-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  opacity: 0.5;
  user-select: none;
  pointer-events: none;
}

.image-placeholder-icon {
  font-size: 2.5rem;
  line-height: 1;
}

.image-placeholder-text {
  font-size: 0.9rem;
  color: var(--text-muted);
}

/* 编辑模式下空图片框的换图按钮始终显示（右下角浮动按钮由 JS 注入） */
.editor-mode .image-block[data-has-image="false"] {
  border-style: solid;
  border-color: var(--editor-accent, #58a6ff);
  background: rgba(88, 166, 255, 0.04);
}
```

---

### 步骤 3：新建 editor-image.js — ImageManager + ImagePicker

新建 `assets/editor/editor-image.js`，包含两个全局模块。

**加载顺序**（在 `html-template.md` 中更新）：放在 `editor-utils.js` 之后、`editor-persistence.js` 之前。

```
editor/editor-utils.js            ← 已有
editor/editor-image.js            ← 新增（~180-220行）：图片文件管理 + 图片拾取
editor/editor-persistence.js      ← 已有
editor/editor-history.js          ← 已有
editor/editor-box-manager.js      ← 已有
editor/editor-rich-text.js        ← 已有
editor/editor-core.js             ← 已有
```

#### ImageManager：目录管理器

```javascript
/**
 * 图片目录管理器
 * 职责：管理课件 images/ 子目录的文件读写操作
 * API：saveImage(fileName, dataUrl) → Promise<string>
 */
window.ImageManager = {
  _dirHandle: null,       // FileSystemDirectoryHandle
  _dirHandleKey: null,    // IndexedDB key

  init: function() {
    var utils = window._editorUtils;
    if (!utils) return;
    this._dirHandleKey = 'imgdir:' + utils.storageKey('');
    if (!window.indexedDB) return;
    try {
      var req = indexedDB.open('hslides-fs-handle', 1);
      req.onsuccess = function() {
        var tx = req.result.transaction('handles', 'readonly');
        var getReq = tx.objectStore('handles').get(this._dirHandleKey);
        var self = this;
        getReq.onsuccess = function() {
          if (getReq.result) self._dirHandle = getReq.result;
        };
      }.bind(this);
    } catch (e) {}
  },

  ensureDir: function() {
    if (this._dirHandle) return Promise.resolve(this._dirHandle);
    return this._requestDir();
  },

  _requestDir: function() {
    if (!window.showDirectoryPicker) return Promise.resolve(null);
    var self = this;
    return window.showDirectoryPicker({
      id: 'hslides-courseware-dir',
      mode: 'readwrite'
    }).then(function(rootHandle) {
      return rootHandle.getDirectoryHandle('images', { create: true }).then(function(imagesDir) {
        self._dirHandle = imagesDir;
        self._persistDirHandle(imagesDir);
        return imagesDir;
      });
    }).catch(function(e) {
      if (e.name !== 'AbortError') console.warn('[ImageManager] 获取目录授权失败:', e);
      return null;
    });
  },

  saveImage: function(fileName, dataUrl) {
    var self = this;
    return this.ensureDir().then(function(dirHandle) {
      if (!dirHandle) return dataUrl; // 降级
      var ext = fileName.split('.').pop().toLowerCase() || 'png';
      var safeName = 'img-' + Date.now() + '.' + ext;
      return self._dataUrlToBlob(dataUrl).then(function(blob) {
        return dirHandle.getFileHandle(safeName, { create: true }).then(function(fileHandle) {
          return fileHandle.createWritable().then(function(writable) {
            return writable.write(blob).then(function() { return writable.close(); })
              .then(function() { return './images/' + safeName; });
          });
        });
      });
    });
  },

  _dataUrlToBlob: function(dataUrl) {
    return fetch(dataUrl).then(function(res) { return res.blob(); });
  },

  _persistDirHandle: function(handle) {
    if (!window.indexedDB) return;
    try {
      var req = indexedDB.open('hslides-fs-handle', 1);
      req.onsuccess = function() {
        var tx = req.result.transaction('handles', 'readwrite');
        tx.objectStore('handles').put(handle, this._dirHandleKey);
      }.bind(this);
    } catch (e) {}
  }
};

// 模块加载时自动初始化
ImageManager.init();
```

#### ImagePicker：图片拾取器

```javascript
/**
 * 图片拾取器
 * 职责：打开文件选择器 → 把图片复制到 images/ 目录 → 更新图片框
 */
window.ImagePicker = {
  pickForBlock: function(imageBlock) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', function(e) {
      var file = e.target.files[0];
      if (!file) return;
      ImagePicker._processFile(file, imageBlock);
    });
    input.click();
  },

  _processFile: function(file, imageBlock) {
    var reader = new FileReader();
    reader.onload = function(evt) {
      var dataUrl = evt.target.result;
      ImageManager.saveImage(file.name, dataUrl).then(function(savedPath) {
        ImagePicker._updateBlock(imageBlock, savedPath);
      });
    };
    reader.readAsDataURL(file);
  },

  _updateBlock: function(imageBlock, src) {
    var existingImg = imageBlock.querySelector('img.slide-image');
    if (existingImg) {
      existingImg.setAttribute('src', src);
    } else {
      var placeholder = imageBlock.querySelector('.image-placeholder');
      if (placeholder) placeholder.remove();
      var img = document.createElement('img');
      img.className = 'slide-image';
      img.setAttribute('src', src);
      img.setAttribute('alt', '');
      img.setAttribute('data-edit-id', 'img-' + Date.now());
      imageBlock.appendChild(img);
    }
    imageBlock.setAttribute('data-has-image', 'true');
    if (window.PersistenceLayer) window.PersistenceLayer.saveCustomBoxes();
  }
};
```

---

### 步骤 4：editor-box-manager.js — 注入换图按钮

在 `_injectControls()` 中，当目标元素是 `.image-block` 内的 `img.slide-image` 或目标本身是 `.image-block[data-has-image="false"]` 时，额外注入右下角的换图按钮。同时把 `custom-box.image-box`（浮动图片框）也纳入：

```javascript
// 在 _injectControls 中检测图片框
var wrap = el.closest('.editable-wrap');
var isImageBlock = el.closest('.image-block') ||
                   (wrap && wrap.classList.contains('image-box'));
if (isImageBlock && !el.closest('.image-block, .image-box').querySelector('.image-pick-btn')) {
  var container = el.closest('.image-block') || (wrap && wrap.classList.contains('image-box') ? wrap : null);
  if (!container) container = el;
  var pickBtn = document.createElement('button');
  pickBtn.className = 'image-pick-btn';
  pickBtn.title = '更换图片';
  pickBtn.innerHTML = '📷';
  pickBtn.setAttribute('contenteditable', 'false');
  pickBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    ImagePicker.pickForBlock(container);
  });
  container.appendChild(pickBtn);
}
```

---

### 步骤 5：顶部工具栏插入图片适配（editor-core.js）

1. **本地文件上传**分支：
   - 当前：`FileReader.readAsDataURL()` → `BoxManager.createImageBox(..., b64, ...)`
   - 改为：`FileReader.readAsDataURL()` → `ImageManager.saveImage()` → 用返回的 `./images/xxx` 路径调用 `BoxManager.createImageBox()`

2. **URL 网络图片**分支：
   - 当前：`<img>` 直接引用 URL
   - 改为：fetch 图片 → 转 Blob → `ImageManager.saveImage()` → 本地路径引用
   - 这样即使源头删除，课件图片仍然存在

3. **当 `ImageManager` 不可用时**（目录未授权/浏览器不支持）：
   - 保持现有行为不变（base64 或 URL），不阻塞用户操作

#### 工具栏插入图片的改动点

对顶部工具栏中「插入图片」下拉面板的两个入口都需要修改：

**入口 1 — 本地文件上传**（`imageFileInput` 的 `change` 事件，约第 660 行附近）：

当前：
```javascript
// 旧：直接 base64 创建
var b64 = canvas.toDataURL(...);
BoxManager.createImageBox("img-" + Date.now(), "center", "center", null, null, b64, cs);
```

改为：
```javascript
// 新：尝试保存到 images/ 目录
var b64 = canvas.toDataURL(...);
ImageManager.saveImage(file.name, b64).then(function(savedPath) {
  // savedPath = './images/xxx.png' 或兜底保留 b64
  BoxManager.createImageBox("img-" + Date.now(), "center", "center", null, null, savedPath, cs);
  PersistenceLayer.saveCustomBoxes();
  historyMgr.recordState(true);
});
```

**入口 2 — 网络图片 URL**（`applyImageBtn` 的点击事件，约第 630 行附近）：

当前逻辑走到这里时已有 URL，改为先尝试下载到本地：

```javascript
var url = imageUrlInput.value.trim();
if (!url) return;

// ★ 新增：尝试下载网络图片到本地 images/ 目录
ImageManager.ensureDir().then(function(dirHandle) {
  if (!dirHandle) {
    // 无目录权限，使用原 URL（保持现有行为不变）
    BoxManager.createImageBox("img-" + Date.now(), "center", "center", null, null, url, cs);
    PersistenceLayer.saveCustomBoxes();
    historyMgr.recordState(true);
    return;
  }
  // 下载并保存
  fetch(url).then(function(res) {
    if (!res.ok) throw new Error('fetch failed');
    return res.blob();
  }).then(function(blob) {
    var ext = (url.split('.').pop() || 'png').split('?')[0];
    var safeName = 'img-' + Date.now() + '.' + ext;
    return dirHandle.getFileHandle(safeName, { create: true }).then(function(fh) {
      return fh.createWritable().then(function(w) {
        return w.write(blob).then(function() { return w.close(); }).then(function() {
          return './images/' + safeName;
        });
      });
    });
  }).then(function(localPath) {
    BoxManager.createImageBox('img-' + Date.now(), 'center', 'center', null, null, localPath, cs);
    PersistenceLayer.saveCustomBoxes();
    historyMgr.recordState(true);
  }).catch(function() {
    // 下载失败，兜底使用原 URL
    BoxManager.createImageBox('img-' + Date.now(), 'center', 'center', null, null, url, cs);
    PersistenceLayer.saveCustomBoxes();
    historyMgr.recordState(true);
  });
});
```

---

### 步骤 6：Ctrl+S 导出时的图片路径安全（只确认，不改动）

当前 `exportCleanHTML()` 中已有对 `<img src>` 的路径归一化逻辑：

```javascript
// 现有代码（约第 496 行），只改写了包含 'assets/' 的路径
clone.querySelectorAll('link[rel="stylesheet"], script[src], img[src]').forEach(function(el) {
  if (el.hasAttribute('src') && el.getAttribute('src').indexOf('assets/') !== -1) {
    var s = el.getAttribute('src');
    el.setAttribute('src', './assets/' + s.split('assets/')[1]);
  }
});
```

`./images/` 路径不包含 `assets/`，所以这段代码**不会触碰它**，天然安全。

**无需修改任何代码。** 只需在实施后手动验证：
1. 在课件中插入一张图片（路径 `./images/xxx.png`）
2. Ctrl+S 保存
3. 检查保存后 HTML 文件中图片路径未被改写

---

### 步骤 7：编辑器换图按钮样式（editor.css）

```css
/* ====== 图片框换图按钮 ====== */
.image-pick-btn {
  position: absolute;
  right: 8px;
  bottom: 8px;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
  color: #fff;
  font-size: 16px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s ease, transform 0.2s ease;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.image-block:hover .image-pick-btn,
.image-block.step-active .image-pick-btn {
  opacity: 1;
}

.image-pick-btn:hover {
  transform: scale(1.15);
  background: rgba(0, 0, 0, 0.7);
}

/* 空占位符图片框的换图按钮一直可见 */
.image-block[data-has-image="false"] .image-pick-btn {
  opacity: 1;
  background: var(--editor-accent, #58a6ff);
}
```

---

### 步骤 8：文档更新

#### SKILL.md

在 Phase 4 的生成说明中增加：

```
- 图片块 `.image-block` 支持空占位符（`data-has-image="false"`），无图片时保留布局插槽位置
- 图片路径统一使用 `./images/xxx.png`，用户可通过编辑器自动管理 images 目录
```

#### references/html-template.md

在编辑器模块加载顺序中，新增 `editor-image.js`：

```html
<!-- Editor modules: strict dependency order -->
<script src="./assets/editor/editor-utils.js"></script>
<script src="./assets/editor/editor-image.js"></script>    <!-- ★ 新增：图片文件管理与拾取 -->
<script src="./assets/editor/editor-persistence.js"></script>
<script src="./assets/editor/editor-history.js"></script>
<script src="./assets/editor/editor-box-manager.js"></script>
<script src="./assets/editor/editor-rich-text.js"></script>
<script src="./assets/editor/editor-core.js"></script>
```

---

### 步骤 9：创建技术规格文档

在 `docs/superpowers/specs/` 目录下创建 `image-block-spec.md`，记录本计划涉及的技术合同、API 定义和注意事项。

---

## 执行顺序总结

| 序号 | 步骤 | 预计文件数 | 关键风险 |
|------|------|-----------|----------|
| 1 | 模板文件更新 | 2 | 无，纯文档 |
| 2 | CSS 空态样式 | 1 | 无，纯样式追加 |
| 3 | 新建 editor-image.js（ImageManager + ImagePicker） | 1 | IndexedDB 键名不能与现有冲突 |
| 4 | editor-box-manager.js 注入换图按钮 | 1 | 需确保 `_injectControls` 兼容 |
| 5 | 顶部工具栏插入图片适配 | 1 (`editor-core.js`) | 网络图片下载失败处理 |
| 6 | Ctrl+S 图片路径安全验证 | 1 (`editor-persistence.js`) | 只需验证，几乎不改 |
| 7 | 换图按钮样式 | 1 (`editor.css`) | 无 |
| 8 | SKILL.md + html-template.md 说明 | 2 | 无 |
| 9 | 技术规格文档 | 1 | 无 |
| 9 | BoxManager.createImageBox 适配 | 1 (`editor-box-manager.js`) | 无 |
| 10 | SKILL.md 说明 | 1 | 无 |
| 11 | 技术规格文档 | 1 | 无 |

## 验证方法

1. **单元测试**：`testing/tests/` 下新增 `image-block.test.js`，覆盖：
   - 空占位符 `.image-block[data-has-image="false"]` 渲染为占位符 DOM 结构
   - `ImagePicker._updateBlock()` 将占位符替换为真实图片
   - `ImagePicker._updateBlock()` 替换已有图片的 src
   - `ImageManager.saveImage()` 在目录句柄可用时返回 `./images/xxx` 路径
   - `ImageManager.saveImage()` 在目录句柄不可用时降级返回原 dataUrl
2. **手动验证**：
   - 用 skill 生成一个含空图片框的课件，确认布局正常、显示虚线占位符
   - 进入编辑模式，确认空图片框显示占位符样式且换图按钮一直可见
   - 单击换图按钮 → 授权课件目录 → 确认图片写入 `images/` 并显示
   - 对有图片的 `.image-block` hover，确认换图按钮浮现
   - 顶部工具栏「插入图片」→ 本地文件 → 确认写入 `images/` 并显示
   - 顶部工具栏「插入图片」→ 网络 URL → 确认下载到 `images/`（断开网络后仍可显示）
   - Ctrl+S 保存，检查 HTML 中图片路径为 `./images/xxx.png` 未被改写
   - 刷新页面，确认图片仍然正常显示
3. **已有测试不受影响**：
   - 运行 `node --test tests/quiz-annotation-runtime.test.js` 确认无回归
   - 运行 `node --test tests/slides-runtime.test.js` 确认焦点队列正常

---

> **注**：本计划中的 `ImageManager` 和 `ImagePicker` 是全新的模块，不与任何现有模块冲突。所有新增功能在生产环境中以「可用则用、不可用则降级」的渐进增强原则工作。

---

## 注意事项与边界情况

### CORS 限制
下载网络图片时使用 `fetch()`，如果图片服务器不允许跨域请求（无 `Access-Control-Allow-Origin` 头），`fetch` 会失败，自动降级为直接引用原 URL。这是浏览器的安全限制，无法绕过。

### 遗留 `.image-block` 兼容
现有课件中的 `.image-block` 不带 `data-has-image` 属性。CSS 选择器 `.image-block[data-has-image="false"]` 不会匹配它们，所以遗留图片框保持现有外观不变。

### 换图后编辑器的联动
换图操作完成时应调用 `PersistenceLayer.saveCustomBoxes()` 和 `historyMgr.recordState(true)`，确保：
- 刷新后图片路径恢复正确
- Ctrl+Z 撤销能回到换图前的状态

### `ImagePicker._processFile` 降级路径
当 `ImageManager.saveImage()` 因目录句柄不可用而返回原始 dataUrl 时，`<img src="data:image/...">` 会在 HTML 中保留。这是可接受的行为——dataUrl 本身可离线显示，只是不符合「独立 images 文件夹」的理想状态。

### 后续可能的扩展方向
- **图片框清除**：右键菜单或按钮将图片框重置为空占位符
- **图片重命名**：`images/` 中积累大量 `img-1700000000.png` 风格的文件名，未来可提供重命名功能
- **跨课件图片复用**：从其他课件的 `images/` 目录选择图片
