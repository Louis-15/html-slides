# 答题与批注组件 — 模块拆分总览

> **写给 AI 智能体的工程地图。** 在修改任何文件之前，先扫一遍本文档——它告诉你每个文件管什么、依赖谁、被谁依赖、以及改动一个模块可能波及的范围。

---

## 1. 组件定位

`.quiz-annotation` 是 html-slides 的第 14 个 Zone 2 组件，独占整页，融合**答题**（选择/七选五/填空/判分）和**批注**（锚点/角标/气泡/连线/步进/拖拽/关联）两大功能。

```
┌──────────────────────────────────────────────────┐
│  Zone 1 Header (标题栏) — 沉浸式逃逸时隐藏       │
├─────────────┬──────────┬─────────────────────────┤
│ ① qa-passage │② qa-notes│ ③ qa-answer-panel      │
│   正文/填空   │  批注气泡  │  选项/槽位/提交        │
│   始终可见   │  默认隐藏  │  有答题时可见          │
├─────────────┴──────────┴─────────────────────────┤
│  SVG 连线层 (qa-connector-canvas)                 │
└──────────────────────────────────────────────────┘
```

---

## 2. 目录总览

> **关键结构说明**：此目录仅包含子模块。聚合入口是 `assets/quiz-annotation-runtime.js`（在此目录之外），它通过同步 XHR + eval 按依赖顺序加载此目录下的所有 JS 子模块。HTML 课件只需 `<script src="./assets/quiz-annotation-runtime.js">`，无需逐个引用子模块。

```
assets/
├── quiz-annotation-runtime.js          ← ★ 聚合入口（在此目录外）
├── quiz-annotation-audio.js            ← 独立文件
├── annotation-store.js                 ← 30 行兼容存根
└── zones/zone2-quiz-annotation/        ← 子模块目录
    ├── ★ README.md                     ← 你正在看的这份文档
    ├── core.js                         ← [无依赖] 工具函数、全局常量
    ├── fragments.js                    ← [→ core] 片段二级步进
    ├── persistence.js                  ← [→ core] 持久化 + onExportClean
    ├── panel.js                        ← [→ core] 面板展开/收起
    ├── activation.js                   ← [→ core,conn,frag] 激活/降噪
    ├── connectors.js                   ← [→ core] SVG 连线
    ├── stepping.js                     ← [→ core,act] 步进策略
    ├── dragdrop.js                     ← [→ core] 拖拽排序
    ├── quiz-base.js                    ← [→ core,pers] 答题共享层
    ├── quiz-single.js                  ← [→ core,base] ★ 阅读单选
    ├── quiz-matching.js                ← [→ core,base] ★ 阅读七选五
    ├── quiz-blank.js                   ← [→ core,base] ★ 阅读填空
    ├── linking.js                      ← [→ core] 关联模式
    ├── header.js                       ← [→ core] 栏头 + 迁移
    ├── note-interactions.js            ← [→ ...] 气泡交互 + 孤儿重建
    ├── toolbar.js                      ← [→ ...] 浮动工具条
    ├── init.js                         ← [→ 以上全部] 初始化编排
    ├── layout.css                      ← 14.0-14.4
    ├── ...                             ← 其余 CSS 子文件
    └── a11y.css                        ← 14.16
```

> **CSS 聚合入口路径说明**：`zone2-quiz-annotation.css` 聚合入口位于旧路径 `assets/zones/zone2-quiz-annotation.css`（在此目录**之外**），通过 `@import './zone2-quiz-annotation/layout.css'` 等相对路径引入本目录下的子文件。HTML 课件中 `<link href="./assets/zones/zone2-quiz-annotation.css">` 路径不变。

独立文件（不在此目录中）：

| 文件 | 位置 | 说明 |
|------|------|------|
| `quiz-annotation-runtime.js` | `assets/` | 聚合入口，同步 XHR + eval 加载子模块 |
| `quiz-annotation-audio.js` | `assets/` | 音效适配层，独立不合并 |
| `annotation-store.js` | `assets/` | 30 行兼容存根 |

---

## 3. JS 模块 — 逐个详解

### 3.1 模块契约速查表

| 模块 | 加载序号 | 依赖 | 暴露的关键 API（window.QA.xxx） | 对应的 CSS 区块 | 题型专属 |
|------|----------|------|-------------------------------|-----------------|----------|
| **core.js** | 01 | 无 | `getActiveQA`, `getSortedBubbles`, `getAnchorByLink`, `getAnswerAnchorByLink`, `getBubbleByLink`, `isEditorMode`, `isDoodleMode`, `READING_TYPE_LABELS`, `normalizeBubbleEndpointState` | — | 共用 |
| **fragments.js** | 02 | core | `getNoteFragmentEntries`, `syncNoteFragments`, `revealNextNoteFragment`, `hidePreviousNoteFragment`, `getFragmentOwnerLinkId` | fragments.css | 共用 |
| **persistence.js** | 03 | core | `persistAnchorChange`, `persistQuizAuthoringChange`, `scheduleAnnotationSave` | — | 共用 |
| **panel.js** | 04 | core | `toggleNotesPanel`, `initDividerButton`, `updateDividerPositions` | divider-btn.css | 共用 |
| **activation.js** | 05 | core, connectors, fragments | `activateNote`, `deactivateNote`, `clearAllActive`, `expandAllBubbles`, `hideAllBubbles` | anchors-bubbles.css | 共用 |
| **connectors.js** | 06 | core | `ensureCanvas`, `drawHoverConnectors`, `clearHoverConnectors`, `clearStepConnectors`, `createLeftConnectorLine`, `createRightConnectorLine` | connectors.css | 共用 |
| **stepping.js** | 07 | core, activation | （注册 `annotation` 步进策略到 `window.registerStepStrategy`） | — | 共用 |
| **dragdrop.js** | 08 | core | `initDragAndDrop`, `recalcStepNumbers` | dragdrop.css | 共用 |
| **quiz-base.js** | 09 | core, persistence | `initQuizSystem`, `submitQuiz`, `resetQuizSubmissionState`, `inferReadingType`, `syncReadingTypePill` | answer-panel.css | 共用 |
| **quiz-single.js** | 10 | core, quiz-base | `syncChoiceAnswerKeyEditors`, `renderSelectionQuestionResults`, `clearSelectionQuestionResults` | answer-panel.css | ★ 单选 |
| **quiz-matching.js** | 11 | core, quiz-base | `syncMatchingAnswerUI`, `renderMatchingAnswerResults`, `syncMatchingOptionDragState`, `resetMatchingQuestionState` | answer-panel.css | ★ 七选五 |
| **quiz-blank.js** | 12 | core, quiz-base | `syncBlankAnswerUI`, `renderBlankAnswerResults`, `normalizeBlankAnswer` | answer-panel.css | ★ 填空 |
| **linking.js** | 13 | core | `enterLinkingMode`, `exitLinkingMode`, `createLinkAssociation` | linking-mode.css | 共用 |
| **header.js** | 14 | core | `initNotesHeader`, `migrateLegacyBubbles` | notes-panel.css | 共用 |
| **note-interactions.js** | 15 | core, persistence, dragdrop, connectors, linking, header | `initNoteInteractions`, `deleteNote`, `rebuildOrphanBubbles` | anchors-bubbles.css | 共用 |
| **toolbar.js** | 16 | core, persistence, note-interactions, linking | `initAnnotationToolbar`, `createAnnotation` | editor-toolbar.css | 共用 |
| **init.js** | 17 | 以上全部 | `initQuizAnnotation` (挂 window), `stripDynamicQAElements` (挂 window), `autoInit` | layout.css, scrollbar.css, a11y.css | 共用 |

---

### 3.2 模块详细说明

#### core.js — 工具函数与全局状态（~200 行）

**职责**：所有模块共享的零依赖底层。不操作 DOM 之外的任何副作用。

**关键数据结构**：

```
READING_TYPE_LABELS = { single: '阅读单选', matching: '阅读七选五', blank: '阅读填空', analysis: '文章解析' }
```

**关键函数分组**：

| 分组 | 函数 | 说明 |
|------|------|------|
| 组件定位 | `getActiveQA()` | 返回当前活跃 slide 内的 `.quiz-annotation` |
| 气泡操作 | `getSortedBubbles(qa)`, `getNotesBubbleContainer(qa)` | 获取排序后的气泡列表 / 气泡容器 |
| 锚点查找 | `getAnchorByLink(qa, linkId)`, `getAnswerAnchorByLink(qa, linkId)`, `getAnswerAnchorsByLink(qa, linkId)`, `getBubbleByLink(qa, linkId)` | 通过 `linkId` 查找左栏/右栏/中栏对应元素 |
| 排序 | `getOrderedPassageLinkIds(qa)`, `syncBubbleOrderToPassageAnchors(qa)` | 按左栏正文 DOM 顺序拉齐气泡 |
| 端点状态 | `normalizeBubbleEndpointState(qa, bubble)`, `normalizeAllBubbleEndpointStates(qa)` | 将 `data-link` / `data-link-answer` 统一到"一个 linkId 两个端点"模型 |
| 模式判断 | `isEditorMode()`, `isDoodleMode()`, `isDoodleDrawingActive()`, `shouldSuppressFragmentDiscovery()`, `shouldLockKeyboardAnnotationStepping()` | 编辑/涂鸦/出题隔离三个维度的模式门 |

**AI 使用提示**：
- 如果需要知道"当前批注有左端点还是右端点"，直接用 `normalizeBubbleEndpointState(qa, bubble)`，它返回 `{ linkId, hasLeft, hasRight }`。
- 模式判断全部通过 CSS class 检测（`editor-mode` / `doodle-mode` / `submitted`），不维护内部状态变量。


#### fragments.js — 片段二级步进（~120 行）

**职责**：管理批注锚点内部的富文本片段（颜色/高光/删除线/顶标）的"隐藏→逐步揭示"。

**关键数据结构**：

```
noteFragmentState = WeakMap<bubble, { cursor, visible: Set<index> }>
fragmentIdentityKeys = WeakMap<fragment, key>
```

**关键函数**：

| 函数 | 说明 |
|------|------|
| `getNoteFragmentEntries(bubble)` | 收集气泡关联的所有锚点内的 `[data-fragment-step="true"]` 片段，按 `data-fragment-group` 去重 |
| `syncNoteFragments(bubble)` | 根据编辑模式（全部可见）或步进状态（部分可见）同步片段可见性 |
| `revealNextNoteFragment(qa)` | 前进→：揭示下一组片段 |
| `hidePreviousNoteFragment(qa)` | 后退←：隐藏上一组片段 |
| `resetNoteFragments(bubble)` | 重置：光标回到 -1，清空 visible 集合 |
| `getFragmentTargetsForBubble(bubble)` | 收集气泡关联的所有锚点元素（左栏 + 右栏的 answer-anchor） |

**AI 使用提示**：
- 片段的"组"由 `data-fragment-group` 决定。同一组内的多个 `<span>` 在同一步揭示。
- 编辑模式下 `forceVisible = true`，所有片段直接可见。
- 新建片段时调用 `persistQuizAuthoringChange({ immediate: true })`，不要只走 debounce。


#### persistence.js — 持久化层（~200 行）

**职责**：锚点结构变更后的 localStorage 落盘 + 保存时的 `onExportClean` 钩子。

**关键函数**：

| 函数 | 说明 |
|------|------|
| `persistAnchorChange(anchor, options)` | 锚点增删改后调用。`options.immediate` 控制是否立即落盘 |
| `persistQuizAuthoringChange(options)` | 答题作者态变更（改正确答案、加片段格式等）后调用 |
| `scheduleAnnotationSave()` | debounce 的存档调度（低优先级，日常输入用） |

**`onExportClean` 钩子（三步骤）**：

1. **物理删除已删批注**：从 clone 中移除 `text-anchor`、`answer-anchor`、`qa-note-bubble`，**先删角标再解包**（防止角标泄漏到父节点）
2. **注入动态气泡**：将实时 DOM 中存在但 BASELINE clone 中不存在的气泡克隆后注入
3. **同步 data-link-answer**：检测取消右侧关联的情况，同步气泡属性 + **物理删除 clone 中的 answer-anchor（含角标）**

**⚠ 已知陷阱**：解包 anchor 时必须 `badge.remove()` 先于 `parent.insertBefore(anchor.firstChild, anchor)`，否则角标会泄漏到父节点并随 HTML 写入文件。


#### panel.js — 面板开关（~80 行）

**职责**：批注面板的展开/收起与分割线悬浮按钮。

**关键函数**：

| 函数 | 说明 |
|------|------|
| `toggleNotesPanel(qa)` | 切换 `.notes-active` 类。展开时更新分割线位置、同步面板模式；收起时清空激活状态 |
| `initDividerButton(qa)` | 在 `.qa-body` 内创建分割线悬浮 📝 按钮，绑定 mousemove/click |
| `updateDividerPositions(qa)` | 计算 `--divider-1-left` / `--divider-2-left` CSS 变量 |
| `updateDividerButtonHoverState(qa, clientX, clientY)` | 鼠标在分割线 ±20px 内时显示悬浮按钮 |


#### activation.js — 批注激活与降噪（~120 行）

**职责**：激活单个批注（气泡 + 左锚点 + 右锚点联动高亮），以及全局降噪。

**关键函数**：

| 函数 | 说明 |
|------|------|
| `activateNote(qa, bubble)` | 激活一个气泡：设置 `note-active`、联动左右锚点、画连线、三栏追视 |
| `deactivateNote(qa, bubble)` | 取消激活一个气泡 |
| `clearAllActive(qa, preserveExpanded, resetFragments)` | 清除所有激活状态。`preserveExpanded=true` 保留"展开但不激活" |
| `expandAllBubbles(qa)` | 编辑模式专用：所有气泡展开但无激活态 |
| `hideAllBubbles(qa)` | 放映模式专用：所有气泡折叠、清除激活、清空片段步进 |

**激活时的联动效果**：
- 气泡 `note-active` + `note-expanded`
- 左栏 `text-anchor.anchor-active`（极光渐变下划线 + 角标极光动画）
- 右栏 `answer-anchor.anchor-active`
- `qa.has-active-note`（触发降噪——其他气泡半透明）
- SVG 连线绘制（步进线 + hover 线独立管理）
- 三栏 `scrollIntoView({ behavior: 'smooth', block: 'center' })`


#### connectors.js — SVG 贝塞尔连线（~180 行）

**职责**：左栏锚点 ↔ 中栏气泡 ↔ 右栏锚点之间的贝塞尔曲线连线。分为步进连线（持久）和 Hover 连线（临时）。

**关键函数**：

| 函数 | 说明 |
|------|------|
| `ensureCanvas(qa)` | 确保 `.qa-connector-canvas` 存在 |
| `createLeftConnectorLine(qa, linkId, className)` | 左栏锚点 → 气泡序号 贝塞尔 path |
| `createRightConnectorLine(qa, linkId, className)` | 气泡序号 → 右栏锚点 贝塞尔 path |
| `drawHoverConnectors(qa, bubble)` | 鼠标悬浮时画双向临时连线 |
| `clearHoverConnectors(qa)` | 清除类名含 `connector-hover` 的线条 |
| `clearStepConnectors(qa)` | 清除类名含 `connector-step` 的线条 |

**边缘钉定**：锚点滚出可见区域时连线端点钉定在栏边缘，并画箭头（↑/↓），点击箭头重新追视。


#### stepping.js — 步进策略（~60 行）

**职责**：注册 `annotation` 策略到 `window.registerStepStrategy`，使 ←→ 键可以逐条展开/收起批注。

**策略接口**：

```
{ canStepTopLevelForward, canStepTopLevelBackward, forwardTopLevel, backwardTopLevel, stepFragment, hasNextStep, hasPrevStep }
```

**`annotationStepIndex`** 是全局变量（-1 = 无激活），在页面切换时重置。

**答题隔离**：`shouldLockKeyboardAnnotationStepping(qa)` 返回 true 时，键盘步进被锁定（未提交前不让批注干扰作答）。


#### dragdrop.js — 拖拽排序（~120 行）

**职责**：批注气泡的 HTML5 原生拖拽重排序。拖拽完成后调用 `recalcStepNumbers` 重算全局序号。

**关键函数**：

| 函数 | 说明 |
|------|------|
| `initDragAndDrop(qa)` | 为气泡绑定 dragstart/dragend，容器绑定 dragover |
| `recalcStepNumbers(qa)` | 先 `syncBubbleOrderToPassageAnchors` 拉齐正文顺序，再从上到下重算 `data-step`，同步更新左栏/右栏角标 |
| `getDragAfterElement(container, y)` | 计算拖拽插入位置 |

**拖拽入口**：按住气泡头部（`.qa-note-header`）才能拖拽，点击操作按钮区域不触发拖拽。


#### quiz-base.js — 答题共享层（~200 行）

**职责**：所有题型复用的初始化入口、提交判分、状态管理。不包含任何题型特有的交互逻辑。

**关键函数**：

| 函数 | 说明 |
|------|------|
| `initQuizSystem(qa)` | 统一入口：检测题型 → `.has-quiz` → 分派到 `quiz-single`/`quiz-matching`/`quiz-blank` |
| `submitQuiz(qa)` | 提交判分：`.submitted` → 禁用提交按钮 → 分派到题型专属判分渲染 |
| `resetQuizSubmissionState(qa)` | 回到未提交状态 |
| `inferReadingType(qa)` | 推断题型（`data-reading-type` 优先，其次 DOM 反推） |
| `syncReadingTypePill(qa)` | 渲染题型胶囊 `<div class="qa-reading-type-pill">` |
| `getCorrectOptionIds()` / `setChoiceCorrectAnswers()` | 选择题答案读写 |
| `createAnswerKeyChip()` / `updateAnswerKeyChipSelection()` | 编辑态答案芯片 |

#### quiz-single.js — 阅读单选（~80 行）★

**职责**：`single` / `multi` 选择题的选项点选、判分渲染、编辑态答案编辑。

**关键函数**：

| 函数 | 说明 |
|------|------|
| `syncChoiceAnswerKeyEditors(qa)` | 编辑态：在题目下注入正确答案芯片行 |
| `renderSelectionQuestionResults(qa)` | 提交后：渲染 ✓✗ 标记 + 未作答红色提示 |
| `clearSelectionQuestionResults(qa)` | 清除判分 UI（保留选中状态） |
| `clearQuestionUnansweredState()` | 清除单道题的"未作答"红色框 |
| `ensureQuestionResultFeedback()` | 创建/获取题目反馈提示 DOM |

#### quiz-matching.js — 阅读七选五（~280 行）★

**职责**：拖拽配对题型。右栏动态生成答题槽位、选项拖拽绑定、正文空位联动。

**关键函数**：

| 函数 | 说明 |
|------|------|
| `syncMatchingOptionDragState(qa)` | 控制选项 `draggable` 属性（未提交+非编辑→可拖拽） |
| `syncMatchingAnswerUI(qa, options)` | 主入口：生成右栏槽位 + 绑定拖拽 + 同步正文空位 |
| `ensureMatchingPassageSlotStructure(slot)` | 确保正文空位结构完整（`qa-blank-user` + `qa-blank-value`） |
| `renderMatchingPassageSlot(slot, showCorrect)` | 渲染正文空位中的学生答案或正确答案 |
| `setMatchingAnswerSlotValue(slot, optionId)` | 设置右栏槽位的答案值 |
| `renderMatchingAnswerResults(qa)` | 提交后：判分 ✓✗ + 正确选项浮现 |
| `unlockMatchingSubmissionState(qa)` | 提交后点击槽位重新作答 |
| `clearMatchingAnswerByBlankId(qa, blankId)` | 清空指定空位 |
| `resetMatchingQuestionState(qa)` | 重置所有连线题答案 |
| `syncSlotToPassage(qa, blankId, optionId)` | 右栏槽位 → 正文空位同步 |
| `clearPassageSlot(qa, blankId)` | 清空正文空位 |

#### quiz-blank.js — 阅读填空（~120 行）★

**职责**：语法填空题。右栏生成输入框、编辑态/学生态双轨 UI。

**关键函数**：

| 函数 | 说明 |
|------|------|
| `normalizeBlankAnswer(value)` | 答案标准化（去空格、大写） |
| `syncBlankAnswerUI(qa)` | 主入口：生成右栏输入框。编辑态→显示正确答案供修改；学生态→空白输入框 |
| `renderBlankAnswerResults(qa)` | 提交后：判分 ✓✗ + 正确答案显示 |
| `clearBlankAnswerResults(qa)` | 清除判分痕迹 |


#### linking.js — 关联模式（~60 行）

**职责**：创建批注后，通过"关联左侧/关联右侧"按钮进入的端点配对交互。

**关键函数**：

| 函数 | 说明 |
|------|------|
| `enterLinkingMode(qa, bubble, direction)` | 进入关联模式，呼吸边框 + Esc 监听 |
| `exitLinkingMode()` | 退出关联模式，清理类名和监听器 |
| `createLinkAssociation(qa, format, colorStr)` | 在目标栏选中文字 → 创建锚点 → 建立 `data-link` / `data-link-answer` 关联 |

**全局状态**：`window.linkingState = { qa, bubble, direction }`


#### header.js — 栏头与迁移（~80 行）

**职责**：动态创建 `.qa-notes-header`（进度指示器 + 折叠按钮），以及旧 HTML 气泡结构 → 新 header 结构迁移。

**关键函数**：

| 函数 | 说明 |
|------|------|
| `initNotesHeader(qa)` | 创建栏头（📝 批注 N/M + 折叠按钮），迁移已有气泡到 `.qa-notes-list` |
| `migrateLegacyBubbles(qa)` | 旧气泡（无 `.qa-note-header`）→ 自动包裹 header 结构 |


#### note-interactions.js — 气泡交互（~300 行）

**职责**：批注气泡上所有操作按钮的事件绑定，以及刷新后的孤儿锚点自动重建。

**绑定的按钮类型**：

| 选择器 | 行为 |
|--------|------|
| `.action-unlink-left` | 取消左侧关联：移除 `text-anchor`（先删角标再解包）→ 重算序号 |
| `.action-unlink-right` | 取消右侧关联：移除 `answer-anchor` → 清除 `data-link-answer` → 重算序号 |
| `.action-select-left` | 选中左侧原文 → 创建 Selection range |
| `.action-select-right` | 选中右侧原文 → 创建 Selection range |
| `.action-delete` | 删除整条批注 → `confirm()` → 清除三栏 + localStorage + 墓碑 |
| `.action-link-left` / `.action-link-right` | 进入关联模式 |

**`rebuildOrphanBubbles(qa)`**：扫描所有锚点 → 收集 linkId → 对缺失气泡的锚点自动创建空气泡并从 localStorage 恢复内容。


#### toolbar.js — 浮动工具条（~350 行）

**职责**：编辑模式下，选中文字后弹出的下划线调色面板（`.qa-annotation-toolbar`）和富文本片段工具条（`.qa-note-fragment-toolbar`）。

**关键函数**：

| 函数 | 说明 |
|------|------|
| `initAnnotationToolbar(qa)` | 创建两个浮动工具条 DOM + 绑定调色板事件 + 注册全局 selectionchange/pointerdown |
| `createAnnotation(qa, format, colorStr)` | 新建批注：包裹锚点 → 创建角标 → 创建空气泡 → 聚焦编辑 |
| `createLinkAssociation(qa, format, colorStr)` | 关联模式下的锚点创建 |
| `updateSelectionToolbars(qa)` | 根据选区位置/内容决定显示哪个工具条 |
| `applyNoteFragmentFormat(formatType, value)` | 给锚点内选区添加富文本片段格式 |

**选取机制**：不在 `selectionchange` 时弹出（太频繁），统一等到 `pointerup` 后通过 `qaSelectionPointerActive` / `qaSelectionPointerOwner` 状态机刷新。


#### init.js — 初始化编排（~120 行）

**职责**：`initQuizAnnotation(qa)` 主入口，按正确顺序调用所有子模块的初始化函数。

**初始化顺序**：
1. `purgeDeletedNotes(qa)` — 清理墓碑
2. `migrateLegacyBubbles(qa)` — 迁移旧结构
3. `initNotesHeader(qa)` — 栏头
4. `rebuildOrphanBubbles(qa)` — 孤儿重建
5. `normalizeAllBubbleEndpointStates(qa)` — 统一端点模型
6. `recalcStepNumbers(qa)` — 重算序号
7. `initNoteInteractions(qa)` — 按钮事件
8. `initDragAndDrop(qa)` — 拖拽
9. `initQuizSystem(qa)` — 答题（内部按题型分派到 quiz-single/matching/blank）
10. `initAnnotationToolbar(qa)` — 工具条
11. `initDividerButton(qa)` — 分割线按钮
12. `syncNotesPanelForCurrentMode(qa)` — 面板模式同步

**对外暴露**：
- `window.initQuizAnnotation(qa)` — 初始化单个 QA 组件（编辑器引擎撤消/重做后调用）
- `window.stripDynamicQAElements(qa)` — 撤消恢复前剥离所有运行时动态节点

---

## 4. 依赖关系图（有向无环）

```
                    core ───────────────────────────────────────────────────────┐
                     │                                                          │
          ┌──────────┼──────────┬──────────┬─────────┬──────────┬──────────┐   │
          │          │          │          │         │          │          │   │
       fragments  panel    connectors   dragdrop   linking   header  quiz-base  │
          │          │          │          │         │          │      │   │    │
          │          │          │          └────┬────┘          │  ┌───┼───┼───┘    │
          │          │          │               │               │  │   │   │        │
          └────┬─────┘          │               │               │  │   │   │        │
               │                │               │               │  │   │   │        │
          activation ◄──────────┘               │               │  │   │   │        │
               │                                │               │  │   │   │        │
               └────────────┬───────────────────┘               │  │   │   │        │
                            │                                   │  │   │   │        │
                        stepping                               │  │   │   │        │
                            │                                   │  │   │   │        │
              ┌─────────────┼──────────────────────────┐        │  │   │   │        │
              │             │                          │        │  │   │   │        │
         persistence  note-interactions ◄──────────────┴────────┘  │   │   │        │
              │             │                                       │   │   │        │
              │             │                 ┌─────────────────────┘   │   │        │
              └──────┬──────┘                 │                         │   │        │
                     │                        │                         │   │        │
                   toolbar ◄──────────────────┘                         │   │        │
                     │                                                  │   │        │
                     │          ┌───────────────────────────────────────┘   │        │
                     │          │                                           │        │
               ┌─────┴──────────┴───────────────────────────────────────────┴────────┘
               │
              init ◄────────┘  (依赖以上全部模块)

★ 题型专属加载链：core → quiz-base → quiz-single / quiz-matching / quiz-blank
   三种题型文件互不依赖，可独立阅读和修改。
```

**箭头方向** = "被谁依赖"，例如 `core ← fragments` 表示 fragments 依赖 core。

**循环依赖检查**：图中无环。最深层级为 4（core → connectors/activation/fragments → note-interactions → toolbar → init）。

---

## 5. 关键数据约定

### 5.1 批注关联模型

```
一个 linkId = "note-03"
  ├── 左端点: .text-anchor[data-link="note-03"]
  ├── 右端点: .answer-anchor[data-link-answer="note-03"]
  └── 气泡:   .qa-note-bubble[data-link="note-03"]
               └── .qa-note-content[data-edit-id="s1-note-03"]
```

- `data-link` 是主键，永不改变
- `data-link-answer` 是派生字段（`normalizeBubbleEndpointState` 自动维护）
- `data-step` 是序号，由 `recalcStepNumbers` 统一重算

### 5.2 角标与序号

```
角标存在于三处：
  ├── 左栏 <sup class="note-badge">3</sup>（在 .text-anchor 内）
  ├── 右栏 <sup class="note-badge">3</sup>（在 .answer-anchor 内）
  └── 中栏 <span class="qa-note-step">3</span>（在 .qa-note-header 内）

三者通过 recalcStepNumbers() 保持同步。
序号规则：左栏正文 DOM 顺序优先 → 右侧-only 批注排在后面。
```

### 5.3 持久化层

```
编辑内容: [data-edit-id] 元素的 innerHTML → localStorage(key: 'e:<id>')
删除墓碑: qa.dataset.deletedNotes → localStorage(key: 'deleted:<slideIdx>')
保存文件: __BASELINE__ clone + localStorage 覆盖 → File System Access API → .html
```

---

## 6. CSS 区块速查

| CSS 文件 | 对应的 DOM 根选择器 | 关键状态类 |
|----------|---------------------|-----------|
| layout.css | `.slide`, `.quiz-annotation`, `.qa-body` | `.has-quiz`, `.notes-active` |
| notes-panel.css | `.qa-notes-panel`, `.qa-notes-header`, `.qa-notes-list` | — |
| answer-panel.css | `.qa-answer-panel`, `.qa-option`, `.qa-answer-slot` | `.selected`, `.result-correct`, `.result-incorrect`, `.submitted` |
| anchors-bubbles.css | `.text-anchor`, `.answer-anchor`, `.qa-note-bubble` | `.anchor-active`, `.note-active`, `.note-expanded` |
| connectors.css | `.qa-connector-canvas`, `.qa-connector-line` | `.connector-step`, `.connector-hover` |
| quiz-isolation.css | `.quiz-annotation.has-quiz` | `:not(.submitted)` |
| linking-mode.css | `.quiz-annotation` | `.linking-left`, `.linking-right` |
| editor-toolbar.css | `.qa-annotation-toolbar`, `.qa-note-fragment-toolbar` | `.visible` |
| fragments.css | `[data-fragment-step="true"]` | `.qa-fragment-visible` |

---

## 7. AI 操作指南

### 7.1 在哪个文件修改什么？

| 你想做的事 | 修改的文件 |
|-----------|-----------|
| 加一个新工具函数 | `core.js` |
| 改气泡按钮行为 | `note-interactions.js` |
| 改激活/降噪逻辑 | `activation.js` |
| 改连线样式/行为 | `connectors.js` (JS) + `connectors.css` (CSS) |
| 改所有题型共用的提交/重置逻辑 | `quiz-base.js` |
| 改阅读单选的选项交互或判分 | `quiz-single.js` |
| 改七选五的拖拽配对或槽位 | `quiz-matching.js` |
| 改阅读填空的输入框或正确答案编辑 | `quiz-blank.js` |
| 改保存流程 | `persistence.js` |
| 加一种新的批注格式 | `toolbar.js` (按钮) + `fragments.js` (步进) + `fragments.css` (样式) |
| 改页面加载初始化顺序 | `init.js` |
| 调整三栏布局比例 | `layout.css` |
| 改批注隔离规则 | `quiz-isolation.css` |

### 7.2 AI 生成课件时的按需查阅

拆分的重要目标：**AI 生成某种题型的课件页面时，只需看对应文件**。

| 要生成的题型 | 必读文件 | 选读文件（如需批注） |
|-------------|---------|---------------------|
| **阅读单选** | `quiz-base.js` + `quiz-single.js` + `answer-panel.css` | `toolbar.js`（如需要新建批注的浮动工具条） |
| **阅读七选五** | `quiz-base.js` + `quiz-matching.js` + `answer-panel.css` | 同上 |
| **阅读填空** | `quiz-base.js` + `quiz-blank.js` + `answer-panel.css` | 同上 |
| **纯文章解析** | `core.js`（只需要 `READING_TYPE_LABELS.analysis`）+ `quiz-base.js`（`initQuizSystem` 自动处理） | `toolbar.js` + `fragments.js`（批注是解析页的核心） |
| **加批注到任何题型** | `toolbar.js` + `note-interactions.js` + `fragments.js` | — |

**关键概念**：
- 四种题型的 HTML 结构差异主要在 `qa-answer-panel`（右栏）。左栏 `qa-passage` 和批注 `qa-notes-panel` 通用。
- 题型通过 `quiz-annotation` 的 `data-reading-type` 属性声明（`single`/`matching`/`blank`/`analysis`）。
- 如果不声明，运行时会从 DOM 结构自动反推（`inferReadingType`）。

### 7.3 新增功能的标准流程

1. 确定需要改动的模块 → 查上面的速查表
2. 写测试 → `testing/tests/quiz-annotation/<module>.test.js`
3. 改代码 → 只修改对应的 `zone2-quiz-annotation/<module>.js`
4. 跑测试 → `cd testing && node --test tests/quiz-annotation/<module>.test.js`
5. 如果改了 `core.js` 的公开 API → 跑全量测试

### 7.4 常见陷阱

| 陷阱 | 描述 |
|------|------|
| 角标泄漏 | 解包 `anchor` 时必须先 `badge.remove()` 再 `parent.insertBefore(anchor.firstChild, anchor)`，否则角标会泄漏到父节点 |
| 循环依赖 | 模块间不能有循环引用。如果发现需要双向调用，把公共逻辑提到 `core.js` |
| 编辑器模式 | 很多 UI 在编辑模式下行为不同（气泡全展开、工具条可见、答题隔离失效），通过 `isEditorMode()` 区分 |
| 步进锁定 | 未提交的答题页 → `shouldLockKeyboardAnnotationStepping(qa)` 返回 true → 键盘 ←→ 不触发批注步进 |
| 撤销栈 | 结构化变更（新建/删除/关联/取消关联）后必须调 `window.historyMgr.recordState(true)`，否则 Ctrl+Z 无法撤销 |
| 音效模块引用 | `quiz-annotation-audio.js` 在 `assets/` 下独立加载，暴露 `window.QuizAnnotationAudio`。子模块通过该全局变量访问，不需要在本目录内引入 |

---

## 8. 测试

### 运行单个模块测试
```bash
cd testing && node --test tests/quiz-annotation/core.test.js
```

### 运行全部答题批注组件测试
```bash
cd testing && node --test tests/quiz-annotation/*.test.js tests/quiz-annotation-runtime.test.js
```

### 浏览器集成测试
用 `qa-test-all-types.html` 手动覆盖四种题型 + 编辑/保存/读取完整流程。
