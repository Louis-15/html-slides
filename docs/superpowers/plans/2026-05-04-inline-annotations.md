# 标注数据内联到 HTML 文件 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除 `.annotations.js` 外挂文件，所有幻灯片内容（原始生成 + 用户修改 + 富文本标注）都内联在 HTML 文件各自的 DOM 位置中。提供"存档/读档"机制：日常编辑自动存 localStorage 草稿，点"保存"固化到 HTML 文件，点"读取"从 HTML 文件恢复。

**Architecture:** localStorage 仍是草稿缓存（行为不变），新增两个功能：(1) 保存 — 用 File System Access API 将当前 DOM 序列化覆盖写入 `.html` 文件；(2) 读取 — 清除 localStorage 草稿后刷新页面，让 HTML 文件内容生效。annotation-store.js 移除 sidecar 文件读写，保留向下兼容（加载旧 `.annotations.js` 一次后即转为纯 DOM 模式）。

**Tech Stack:** 纯前端 JavaScript，File System Access API，localStorage

---

## 文件结构

| 文件 | 改动类型 | 职责 |
|------|----------|------|
| `assets/editor-persistence.js` | 修改 | 新增 `saveToHTMLFile()` 保存 + `loadFromHTMLFile()` 读取 + File System Access 句柄管理 |
| `assets/annotation-store.js` | 修改 | 移除 sidecar 读写，保留向下兼容加载，简化调度逻辑 |
| `assets/editor-core.js` | 修改 | 左上角新增保存/读取圆形按钮 + 注入 HTML + 绑定事件 |
| `assets/editor.css` | 修改 | 保存/读取按钮样式（圆形、隐藏、悬浮显示） |

---

## 存档/读档机制

| 操作 | 触发 | 做什么 | 类比 |
|------|------|--------|------|
| 编辑 | 自动 | 每次改动 → localStorage | 玩游戏 |
| 💾 保存 | 点按钮 / Ctrl+S | DOM → 写入 HTML 文件 | 存档 |
| 📂 读取 | 点按钮 | 清 localStorage → 刷新页面 → HTML 文件生效 | 读档 |
| ↩ 撤销 | Ctrl+Z | 回退到内存中的上一步快照 | 回溯几步 |

---

## 向下兼容策略

打开旧课件（有 `.annotations.js` 但 HTML 里无内联标注）时：

1. annotation-store 检测到旧 sidecar 存在 → 加载并应用到 DOM
2. 用户点保存 → 完整 DOM（含刚加载的标注数据）写入 HTML 文件
3. 此后该课件转为新模式，不再依赖外挂文件

---

### Task 1: 去掉例题组件的 `<template>` 套壳

**问题：** 当前例题组件的内容放在 `<template>` 标签里，运行时 JS 克隆一份到 host div 使用。这导致编辑后的内容只在宿主 div 里，模板保持原始版本——保存时模板不更新，读档后修改丢失。

**方案：** 例题内容不再套 `<template>` 壳，直接放在宿主 div 里，跟答题批注组件的内容一样。runtime 不需要改动（`initAll()` 本来就会扫描 DOM 里所有 `.example-card`）。

**Files:**
- Modify: `七选五理论论述.html`（现有示例课件，更新为新写法）
- Modify: `references/html-template.md`（更新模板参考，让 skill 生成新格式）

- [ ] **Step 1: 更新 `七选五理论论述.html` — 去掉 template，内容直接放 host 里**

找到 slide 11（第 528 行起），做以下改动：

**删除** `<template id="exampleCardPlaygroundTemplate">` 标签（第 538 行），但保留其中 `<section class="example-card">...</section>` 的内容。

**删除** `</template>` 闭合标签（第 721 行）。

将 `<section class="example-card">...</section>` 直接放入宿主 div：
```html
<div class="example-card-playground__host" id="exampleCardPlaygroundHost">
    <section class="example-card" ...>
        <!-- 原本 template 内的全部内容 -->
    </section>
</div>
```

**删除** 内联 JS 中的 `buildFreshCard()` 函数（第 747-762 行），简化 `initLessonExampleCardPlayground`：

```javascript
(function initLessonExampleCardPlayground() {
    try {
        if (!window.ExampleCardRuntime) {
            throw new Error('ExampleCardRuntime 未加载');
        }
        var card = document.querySelector('#exampleCardPlaygroundHost .example-card');
        if (!card) {
            throw new Error('例题组件没有找到');
        }
        window.ExampleCardRuntime.initCard(card);
    } catch (error) {
        console.error(error);
    }
})();
```

- [ ] **Step 2: 更新 `references/html-template.md`**

在文档中说明例题组件的新写法。找到合适位置（JS reference 部分之后），添加示例：

```html
<!-- 例题组件：直接放在宿主 div 里，不使用 <template> -->
<div class="slide-content layout-single example-card-playground">
    <div class="example-card-playground__host">
        <section class="example-card" data-question-type="single" data-card-id="...">
            <!-- 题目内容、选项、解析等 -->
        </section>
    </div>
</div>

<script>
    // 初始化例题组件（简洁版，不再从 template 克隆）
    (function() {
        var card = document.querySelector('#exampleCardPlaygroundHost .example-card');
        if (card && window.ExampleCardRuntime) {
            window.ExampleCardRuntime.initCard(card);
        }
    })();
</script>
```

- [ ] **Step 3: 更新 `editor-persistence.js` 的计划 — 不再需要模板同步**

确认 Task 3（原 Task 2）的 `_prepareCleanHTML()` 中**不需要**添加模板同步逻辑。例题内容和答案直接是 DOM 的一部分，保存时自然带上。

---

### Task 2: annotation-store.js — 移除 sidecar 读写，保留向下兼容

**Files:**
- Modify: `assets/annotation-store.js`

- [ ] **Step 1: 移除 `_getDataFilename()`，不再推导 sidecar 文件名**

删除整个函数 `_getDataFilename`（第 31-35 行）。

- [ ] **Step 2: 移除 IndexedDB 文件句柄存储（不再需要记住 sidecar 句柄）**

删除以下私有函数和常量（约第 38-74 行）：
- `DB_NAME`、`DB_VERSION`、`STORE_NAME`
- `_openDB()`
- `_getHandleKey()`
- `_getStoredHandle()`
- `_storeHandle()`

- [ ] **Step 3: 移除 sidecar 文件写入逻辑**

删除（约第 198-248 行）：
- `_pickNewFile()`
- `_requestWritePermission()`
- `_ensureWriteAccess()`
- `_writeToFileNow()`
- `_writeToFile()`
- `_flushPendingSave()`

- [ ] **Step 4: 简化 `scheduleSave()`、`saveNow()`、`authorizeAndSave()` 为存根**

将这三个公开方法改为空操作或仅输出日志，因为标注数据已通过 `PersistenceLayer.saveElement()` 存入 localStorage，不再需要独立写文件。

```javascript
scheduleSave: function () {
    // 标注内容已通过 editor-persistence 的 input 监听器自动存入 localStorage。
    // 最终保存由 editor-persistence.saveToHTMLFile() 统一完成。
},
saveNow: function () { return Promise.resolve(false); },
authorizeAndSave: function () { return Promise.resolve(false); },
```

- [ ] **Step 5: 简化 `_init()` — 只保留向下兼容的 sidecar 加载**

重写 `_init()`：
1. 尝试加载旧 `.annotations.js`（如果存在）
2. 如果加载到数据，应用并标记"已迁移"
3. 不再尝试恢复文件句柄
4. 不再安装首次手势授权

```javascript
function _init() {
    _installExitFlushHook();
    _loadDataFile().then(function (data) {
        if (data) {
            _initData = data;
            return _applyDataWhenStableIdsReady(data);
        }
        return null;
    }).then(function () {
        _readyResolve(!!_initData);
    }).catch(function () {
        _readyResolve(false);
    });
}
```

- [ ] **Step 6: 验证 — 旧课件仍能加载 sidecar 数据**

用 `七选五理论论述.html` + 其 `.annotations.js` 测试：打开后普通页面的隐藏型 fragment 标注应正常显示。

运行：在浏览器打开 HTML，检查幻灯片 1 的卡片描述是否带富文本标注（彩色文字、删除线等）。

---

### Task 3: editor-persistence.js — 新增"保存到 HTML 文件"功能

**Files:**
- Modify: `assets/editor-persistence.js`

- [ ] **Step 1: 新增 File System Access 句柄管理私有变量**

在文件顶部 `PersistenceLayer` 定义之前添加：

```javascript
var _htmlFileHandle = null;
var _htmlWriteChain = Promise.resolve();
```

- [ ] **Step 2: 新增 `getHTMLFilename()` 私有函数**

```javascript
function _getHTMLFilename() {
    var path = decodeURIComponent(location.pathname);
    return path.substring(path.lastIndexOf('/') + 1);
}
```

- [ ] **Step 3: 新增 `_prepareCleanHTML()` — 生成待保存的干净 HTML**

复用现有 `exportCleanHTML()` 的清洗逻辑，但不触发下载，改为返回字符串。

```javascript
function _prepareCleanHTML() {
    var clone = document.documentElement.cloneNode(true);

    // 移除编辑器 UI（工具栏、热区、切换按钮等）
    clone.querySelectorAll([
        '.rich-toolbar',
        '.edit-toggle',
        '.edit-hotzone',
        '.box-controls',
        '.rs-handle',
        '.floating-controls',
        '.overlay-ctrl',
        '.qa-annotation-toolbar',
        '.qa-note-fragment-toolbar',
        '.page-richtext-fragment-toolbar',
        '#doodleToolbar',
        '#doodleToggleBtn',
        '#doodleLaserPointer'
    ].join(',')).forEach(function (el) { el.remove(); });

    // 剥离 native-edit-wrap 壳
    clone.querySelectorAll('.native-edit-wrap').forEach(function (wrap) {
        while (wrap.firstChild) wrap.parentNode.insertBefore(wrap.firstChild, wrap);
        wrap.remove();
    });

    // 清除 transient class 和属性
    clone.querySelectorAll('.qa-fragment-visible').forEach(function (el) {
        el.classList.remove('qa-fragment-visible');
    });
    clone.querySelectorAll('[data-fragment-manual-reveal]').forEach(function (el) {
        el.removeAttribute('data-fragment-manual-reveal');
    });

    // 移除编辑模式 class
    var body = clone.querySelector('body');
    if (body) {
        body.classList.remove('editor-mode');
        body.classList.remove('doodle-mode');
    }
    var html = clone.querySelector('html');
    if (html) {
        html.classList.remove('editor-mode');
    }

    // 确保所有自动生成的 data-edit-id 固化为确定性 ID
    // （already handled: ensureStableEditableIds runs before save）

    // 物理删除已删除批注的锚点节点（不再依赖 deletedNotes 墓碑列表）
    _removeDeletedAnnotationNodes(clone);

    // 触发导出清洗钩子
    if (window.EditorHooks) {
        window.EditorHooks.fire('onExportClean', clone);
    }

    return '<!DOCTYPE html>\n' + clone.outerHTML;
}
```

- [ ] **Step 4: 新增 `_removeDeletedAnnotationNodes(clone)` — 物理删除已删批注节点**

```javascript
function _removeDeletedAnnotationNodes(clone) {
    // 从原始 DOM 收集 deletedNotes（各 quiz-annotation 上可能有）
    var allDeleted = [];
    document.querySelectorAll('.quiz-annotation').forEach(function (qa) {
        var raw = qa.dataset.deletedNotes;
        if (raw) {
            try {
                JSON.parse(raw).forEach(function (id) {
                    if (allDeleted.indexOf(id) === -1) allDeleted.push(id);
                });
            } catch (e) { }
        }
    });

    if (allDeleted.length === 0) return;

    allDeleted.forEach(function (linkId) {
        // 移除 text-anchor
        clone.querySelectorAll('.text-anchor[data-link="' + linkId + '"]').forEach(function (anchor) {
            var parent = anchor.parentNode;
            while (anchor.firstChild) parent.insertBefore(anchor.firstChild, anchor);
            parent.removeChild(anchor);
        });
        // 移除 answer-anchor
        clone.querySelectorAll('.answer-anchor[data-link-answer="' + linkId + '"], .answer-anchor[data-link="' + linkId + '"]').forEach(function (anchor) {
            var parent = anchor.parentNode;
            while (anchor.firstChild) parent.insertBefore(anchor.firstChild, anchor);
            parent.removeChild(anchor);
        });
    });
}
```

- [ ] **Step 5: 新增 `saveToHTMLFile()` 公开方法**

这是"保存"按钮调用的主入口：

```javascript
saveToHTMLFile: function () {
    var cleanHTML = _prepareCleanHTML();

    // 如果已有句柄和权限，直接写
    if (_htmlFileHandle) {
        return _htmlFileHandle.queryPermission({ mode: 'readwrite' }).then(function (perm) {
            if (perm === 'granted') {
                return _writeHTMLToFile(cleanHTML);
            }
            return _requestHTMLFileAccess().then(function (ok) {
                return ok ? _writeHTMLToFile(cleanHTML) : false;
            });
        });
    }

    return _requestHTMLFileAccess().then(function (ok) {
        return ok ? _writeHTMLToFile(cleanHTML) : false;
    });
},
```

- [ ] **Step 6: 新增 `_requestHTMLFileAccess()` — 请求 HTML 文件写入权限**

```javascript
function _requestHTMLFileAccess() {
    if (!window.showSaveFilePicker) {
        alert('当前浏览器不支持文件写入。请使用 Chrome 或 Edge 打开此课件。');
        return Promise.resolve(false);
    }
    return window.showSaveFilePicker({
        suggestedName: _getHTMLFilename(),
        types: [{
            description: 'HTML 课件',
            accept: { 'text/html': ['.html'] }
        }]
    }).then(function (handle) {
        _htmlFileHandle = handle;
        return true;
    }).catch(function (e) {
        if (e.name !== 'AbortError') console.warn('保存失败:', e);
        return false;
    });
}
```

- [ ] **Step 7: 新增 `_writeHTMLToFile(html)` — 实际写入文件**

```javascript
function _writeHTMLToFile(html) {
    if (!_htmlFileHandle) return Promise.resolve(false);
    // 串行化写入，防止并发截断
    var task = _htmlWriteChain.catch(function () { return false; }).then(function () {
        return _htmlFileHandle.createWritable().then(function (writable) {
            return writable.write(html).then(function () { return writable.close(); });
        });
    });
    _htmlWriteChain = task.catch(function () { return false; });
    return task;
}
```

- [ ] **Step 8: 新增 `loadFromHTMLFile()` 公开方法 — "读取存档"**

清除所有 localStorage 草稿，然后刷新页面。浏览器会重新加载 HTML 文件（里面是上次保存的内容），实现"读档"。

```javascript
loadFromHTMLFile: function () {
    // 清除当前课件的所有 localStorage 草稿
    var prefix = utils.storageKey('');
    var keysToRemove = [];
    for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.indexOf(prefix) === 0) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(function (key) { localStorage.removeItem(key); });

    // 刷新页面，HTML 文件中的内容成为唯一数据源
    location.reload();
},
```

- [ ] **Step 9: 暴露 `saveToHTMLFile` 和 `loadFromHTMLFile` 到全局**

在 `window.PersistenceLayer` 对象中添加两个属性。

---

### Task 4: editor-core.js — 左上角新增保存/读取圆形按钮

**Files:**
- Modify: `assets/editor-core.js`

**设计说明:** 保存和读取按钮不放在顶部富文本工具栏里，而是作为两个独立的圆形按钮，放在左上角现有编辑按钮的右边。平时隐藏，鼠标悬浮到热区时一起显示。样式和交互与编辑按钮保持一致。

- [ ] **Step 1: 在 HTML 注入函数中添加保存和读取按钮**

在 `_injectEditorUI()` 函数中，`editToggle` 按钮（第 33-38 行）注入之后，添加：

```javascript
// 保存按钮
var saveToggle = document.createElement('button');
saveToggle.className = 'edit-toggle save-toggle';
saveToggle.id = 'saveToggle';
saveToggle.title = '保存到 HTML 文件 (Ctrl+S)';
saveToggle.style.left = '75px'; // 编辑按钮在 20px，这个偏移 55px
saveToggle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg>';
document.body.insertBefore(saveToggle, editToggle.nextSibling);

// 读取按钮
var loadToggle = document.createElement('button');
loadToggle.className = 'edit-toggle load-toggle';
loadToggle.id = 'loadToggle';
loadToggle.title = '从 HTML 文件读取存档';
loadToggle.style.left = '130px'; // 再偏移 55px
loadToggle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>';
document.body.insertBefore(loadToggle, saveToggle.nextSibling);
```

- [ ] **Step 2: 更新热区交互 — 三个按钮一起显示/隐藏**

找到热区交互代码（约第 254-283 行），将已有的 mouseenter/mouseleave 逻辑扩展为同时控制三个按钮。

修改 `hotzone.addEventListener('mouseenter', ...)` 部分：

```javascript
hotzone.addEventListener('mouseenter', function () {
    clearTimeout(hideTimeout);
    editToggle.classList.add('show');
    if (saveToggle) saveToggle.classList.add('show');
    if (loadToggle) loadToggle.classList.add('show');
});
hotzone.addEventListener('mouseleave', function () {
    hideTimeout = setTimeout(function () {
        if (!editorCore.isActive) {
            editToggle.classList.remove('show');
            if (saveToggle) saveToggle.classList.remove('show');
            if (loadToggle) loadToggle.classList.remove('show');
        }
    }, 400);
});
```

同时更新 `editToggle` 的 mouseenter/mouseleave 监听器，让保存和读取按钮也能保持显示：

```javascript
[saveToggle, loadToggle].forEach(function (btn) {
    if (!btn) return;
    btn.addEventListener('mouseenter', function () {
        clearTimeout(hideTimeout);
    });
    btn.addEventListener('mouseleave', function () {
        hideTimeout = setTimeout(function () {
            if (!editorCore.isActive) {
                editToggle.classList.remove('show');
                if (saveToggle) saveToggle.classList.remove('show');
                if (loadToggle) loadToggle.classList.remove('show');
            }
        }, 400);
    });
});
```

- [ ] **Step 3: 绑定保存按钮点击事件**

```javascript
if (saveToggle) {
    saveToggle.addEventListener('click', function (e) {
        e.stopPropagation();
        if (window.PersistenceLayer && typeof window.PersistenceLayer.saveToHTMLFile === 'function') {
            window.PersistenceLayer.saveToHTMLFile().then(function (ok) {
                if (ok) {
                    saveToggle.style.background = 'var(--accent-green, #3fb950)';
                    saveToggle.style.borderColor = 'var(--accent-green, #3fb950)';
                    saveToggle.style.color = '#fff';
                    setTimeout(function () {
                        saveToggle.style.background = '';
                        saveToggle.style.borderColor = '';
                        saveToggle.style.color = '';
                    }, 1500);
                }
            });
        }
    });
}
```

- [ ] **Step 4: 绑定读取按钮点击事件（需确认）**

读取会清除草稿并刷新，需要用户确认：

```javascript
if (loadToggle) {
    loadToggle.addEventListener('click', function (e) {
        e.stopPropagation();
        if (confirm('读取存档将放弃当前未保存的修改，并刷新页面。确定继续？')) {
            if (window.PersistenceLayer && typeof window.PersistenceLayer.loadFromHTMLFile === 'function') {
                window.PersistenceLayer.loadFromHTMLFile();
            }
        }
    });
}
```

- [ ] **Step 5: 修改 Ctrl+S 快捷键行为**

找到第 338-340 行的 Ctrl+S 处理代码：
```javascript
if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
    e.preventDefault();
    PersistenceLayer.exportCleanHTML();
}
```

改为：
```javascript
if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
    e.preventDefault();
    if (window.PersistenceLayer && typeof window.PersistenceLayer.saveToHTMLFile === 'function') {
        window.PersistenceLayer.saveToHTMLFile();
    } else {
        PersistenceLayer.exportCleanHTML();
    }
}
```

---

### Task 5: editor.css — 保存/读取按钮样式

**Files:**
- Modify: `assets/editor.css`

- [ ] **Step 1: 保存和读取按钮复用编辑按钮样式**

现有 `.edit-toggle` 样式（第 47-80 行）已经定义了圆形按钮的基本外观。保存和读取按钮天然继承 `.edit-toggle` 样式，无需额外 CSS。

但需要确保三个按钮的 `left` 定位从 JS 注入（已在 Task 4 Step 1 中通过 inline style 设置），不会互相覆盖。

- [ ] **Step 2: 确保编辑按钮进入编辑态时不会隐藏兄弟按钮**

当编辑按钮变红（`.edit-toggle.active`）时，保存和读取按钮应保持可见。修改第 70-74 行：

```css
.edit-toggle.show,
.edit-toggle.active {
    opacity: 1;
    pointer-events: auto;
}
```

已经是正确的（`.active` 类只加在编辑按钮上，保存和读取按钮通过热区 `.show` 控制）。

- [ ] **Step 3: 可选 — 保存/读取按钮的颜色区分**

可给两个按钮加微妙的颜色区分（保存蓝、读取绿）：

```css
.save-toggle svg {
    color: var(--editor-accent);
}
.load-toggle svg {
    color: var(--accent-green, #3fb950);
}
```

追加到 `editor.css` 末尾。

---

### Task 6: SKILL.md — 更新文档

**Files:**
- Modify: `SKILL.md`

- [ ] **Step 1: 更新 Phase 7 的编辑说明**

找到 Phase 7（第 321-328 行），将"Ctrl+S to export clean HTML"改为"Ctrl+S to save to HTML file"。

```markdown
   - Editing: Hover top-left corner or press E to enter edit mode, click any text to edit, Ctrl+S to save changes to the HTML file, or click the save/load buttons near the edit toggle
```

- [ ] **Step 2: 更新 Phase 4 中 annotation-store 的说明**

找到第 372-373 行关于 `annotation-store.js` 的引用说明，更新为说明新旧课件兼容性：

```markdown
- [annotation-store.js](assets/annotation-store.js) — Legacy sidecar loader for backward compatibility with older courseware; new courseware embeds all annotation data directly in HTML elements
```

- [ ] **Step 3: 更新 Phase 4 中关于例题组件 `<template>` 的说明**

在合适位置说明例题组件不再需要 `<template>` 套壳：

```markdown
- Example-card content is placed directly in the slide DOM (not inside `<template>`). The runtime auto-discovers `.example-card` elements and initializes them.
```

---

### Task 7: 集成测试

**Files:**
- Test: 浏览器手动测试

- [ ] **Step 1: 新建课件测试**

用当前 skill 生成一个新的简单课件（2-3 页），确认：
1. 生成的 HTML 文件不产生 `.annotations.js`
2. 例题组件（如有）直接放在 DOM 中，不使用 `<template>`
3. 进入编辑模式 → 修改文字 → 退出 → 刷新 → 修改保留（localStorage）
4. 进入编辑模式 → 添加富文本标注（颜色、删除线） → 点💾保存 → 刷新 → 标注保留
5. 点保存后 HTML 文件中对应元素包含富文本标注的 `<span>` 标签

- [ ] **Step 2: 例题组件答案保存测试**

1. 进入编辑模式 → 修改例题组件的正确答案 → 💾保存
2. 查看保存后的 HTML 文件：`data-correct="true"` 在对应选项上
3. 📂读取 → 刷新 → 正确答案显示正确

- [ ] **Step 3: 存档/读档流程测试**

1. 修改多处内容 → 💾保存 → 再修改一处 → 📂读取 → 确认 → 页面刷新 → 看到的是保存时的版本（最后一次修改消失）
2. 修改内容 → 不保存 → 📂读取 → 刷新 → 看到的是上次保存的版本
3. 📂读取时点取消 → 不刷新，继续当前状态

- [ ] **Step 4: 旧课件兼容测试**

用 `七选五理论论述.html` 测试：
1. 打开 → 标注内容正常显示（从旧 `.annotations.js` 加载）
2. 点💾保存 → 刷新（不必再加载 `.annotations.js`）→ 标注内容正常显示
3. 检查保存后的 HTML 文件：原有的 `data-edit-id` 元素中应包含完整富文本标注

- [ ] **Step 5: 撤销重做测试**

1. 进入编辑模式 → 修改文字 → 改第二次 → Ctrl+Z → 回到第一次修改
2. Ctrl+Shift+Z → 恢复第二次修改
3. 点💾保存 → 确认保存的是最终版

- [ ] **Step 6: UI 测试**

1. 左上角三个圆形按钮（✏️ 编辑 / 💾 保存 / 📂 读取）排列整齐
2. 鼠标不悬浮时三个按钮都隐藏
3. 鼠标移到左上角热区时三个按钮同时淡入显示
4. 鼠标移走后三个按钮同时淡出隐藏
5. 点💾保存后按钮短暂变绿表示成功
```
