# 答题与批注组件代码拆分实施计划

> **项目根目录**：`d:\Projects\html-slides`
> **校验脚本**：`scripts/verify-split.js`（已创建，可直接使用）

## 概述

将 `quiz-annotation-runtime.js`（~4125 行）和 `zone2-quiz-annotation.css`（~1684 行）按功能模块拆分为多个小文件，零行为变更。

## 架构原则

1. **平级引用**：拆分后的文件全部直接引用，不设聚合入口文件（无 XHR + eval、无 @import）
2. **共享命名空间**：所有 JS 子模块通过 `window.QA` 共享状态
3. **严格加载顺序**：按依赖拓扑排列 `<script>` 顺序
4. **半自动校验**：使用 `scripts/verify-split.js` 校验拆分完整性

## 目录结构

```
assets/runtime/
  zone2-quiz-annotation/           ← 新建文件夹，放 17 个 JS 子模块
    quiz-core.js                   工具函数、全局状态
    quiz-constants.js              常量与选择器
    quiz-fragments.js              片段二级步进
    quiz-persistence.js            持久化与删除管理
    quiz-connectors.js             SVG 连线与涂鸦穿透
    quiz-panel.js                  面板展开收起与分割线按钮
    quiz-dragdrop.js               拖拽排序与序号同步
    quiz-header.js                 栏头与气泡迁移
    quiz-linking.js                关联模式
    quiz-activation.js             气泡激活与降噪
    quiz-stepping.js               步进策略注册
    quiz-base.js                   答题共享层
    quiz-single.js                 阅读单选与多选
    quiz-matching.js               阅读七选五
    quiz-blank.js                  阅读填空
    quiz-note-interactions.js      气泡操作按钮与删除
    quiz-toolbar.js                浮动工具条与批注创建
    quiz-init.js                   初始化总控（最后加载）

assets/zones/
  zone2-quiz-annotation/           ← 新建文件夹，放 13 个 CSS 子文件
    quiz-layout.css                沉浸式逃逸与三栏 Grid 布局
    quiz-passage.css               左栏正文与题型胶囊
    quiz-notes-panel.css           中栏批注面板
    quiz-answer-panel.css          右栏答题区与判分反馈
    quiz-anchors-bubbles.css       原文锚点与批注气泡
    quiz-connectors.css            SVG 连线
    quiz-dragdrop.css              拖拽占位符
    quiz-isolation.css             答题隔离规则
    quiz-linking.css               关联模式呼吸高亮
    quiz-scrollbar.css             隐形滚动条
    quiz-editor-toolbar.css        浮动工具条
    quiz-responsive.css            响应式与无障碍
    quiz-editor-mode.css           编辑模式补丁
```

## 旧文件的保留与最终删除

```bash
assets/runtime/quiz-annotation-runtime.js     ← 拆分完成后删除
assets/zones/zone2-quiz-annotation.css         ← 拆分完成后删除
```

> **关键原则（重要）**：
>
> 1. **复制而非搬移**：创建新文件时从旧文件**复制**代码，旧文件始终保持完整。这样校验脚本可以全程以完整旧文件为基准进行比对。
> 2. **加载不冲突**：拆分过程中 HTML 仍然引用旧的单文件，新文件尚未加入 HTML，所以不存在函数重复定义问题。
> 3. **分批替换**：JS 全部拆完后，一次性将 HTML 中旧文件的引用替换为 18 个新文件。旧文件只在这之后才从磁盘删除。
> 4. **旧文件在阶段 7（全部验证通过后）才彻底删除**。在此之前旧文件始终保留在仓库中。

## JS 模块依赖拓扑

```
层级1（无依赖）
  quiz-core.js  ───→  quiz-constants.js

层级2（仅依赖层级1）
  quiz-fragments.js   quiz-persistence.js
  quiz-connectors.js  quiz-panel.js

层级3（依赖层级1-2）
  quiz-dragdrop.js    quiz-header.js
  quiz-linking.js     quiz-activation.js
  quiz-stepping.js

层级4（答题系统）
  quiz-base.js ──→  quiz-single.js
                ├─→ quiz-matching.js
                └─→ quiz-blank.js

层级5（交互 UI）
  quiz-note-interactions.js
  quiz-toolbar.js

层级6（初始化，最后加载）
  quiz-init.js
```

## 执行步骤

### 阶段 0：校验脚本

- [x] **Step 0.1**: 创建 `scripts/verify-split.js` ✅ **已完成**
  - 校验脚本已就绪，位于 `d:\Projects\html-slides\scripts\verify-split.js`
  - 功能：比对原文件与新文件的函数定义、行数守恒、自执行代码迁移
  - 用法示例：
    ```bash
    # 在项目根目录执行：
    node scripts/verify-split.js \
      --original assets/runtime/quiz-annotation-runtime.js \
      --parts quiz-core,quiz-constants,...,quiz-init \
      --outdir assets/runtime/zone2-quiz-annotation
    ```

## JS 文件编写模板

每个拆分后的 JS 文件使用统一模板，通过 `window.QA` 共享状态：

```javascript
/* ===========================================
   quiz-xxx.js
   答题与批注组件 — [模块说明]
   依赖：quiz-core.js（通过 window.QA 访问）
   =========================================== */

(function () {
  'use strict';
  var QA = window.QA = window.QA || {};

  /* === 模块级变量 === */
  var internalVar = null;   // 仅本模块可见

  /* === 公开函数 === */
  QA.functionName = function (param1, param2) {
    // 实现...
  };

  /* === 私有函数（仅本模块内部调用） === */
  function privateHelper() {
    // 跨模块调用的函数挂到 QA，仅内部用的保留 function
  }

})();
```

## 完整的 JS `<script>` 加载顺序（可直接复制到 HTML）

以下按依赖拓扑排列，必须严格保持此顺序：

```html
<!-- 层级1：无依赖 -->
<script src="./assets/runtime/zone2-quiz-annotation/quiz-core.js"></script>
<script src="./assets/runtime/zone2-quiz-annotation/quiz-constants.js"></script>

<!-- 层级2：依赖层级1 -->
<script src="./assets/runtime/zone2-quiz-annotation/quiz-fragments.js"></script>
<script src="./assets/runtime/zone2-quiz-annotation/quiz-persistence.js"></script>
<script src="./assets/runtime/zone2-quiz-annotation/quiz-connectors.js"></script>
<script src="./assets/runtime/zone2-quiz-annotation/quiz-panel.js"></script>

<!-- 层级3：依赖层级1-2 -->
<script src="./assets/runtime/zone2-quiz-annotation/quiz-dragdrop.js"></script>
<script src="./assets/runtime/zone2-quiz-annotation/quiz-header.js"></script>
<script src="./assets/runtime/zone2-quiz-annotation/quiz-linking.js"></script>
<script src="./assets/runtime/zone2-quiz-annotation/quiz-activation.js"></script>
<script src="./assets/runtime/zone2-quiz-annotation/quiz-stepping.js"></script>

<!-- 层级4：答题系统 -->
<script src="./assets/runtime/zone2-quiz-annotation/quiz-base.js"></script>
<script src="./assets/runtime/zone2-quiz-annotation/quiz-single.js"></script>
<script src="./assets/runtime/zone2-quiz-annotation/quiz-matching.js"></script>
<script src="./assets/runtime/zone2-quiz-annotation/quiz-blank.js"></script>

<!-- 层级5：交互 UI -->
<script src="./assets/runtime/zone2-quiz-annotation/quiz-note-interactions.js"></script>
<script src="./assets/runtime/zone2-quiz-annotation/quiz-toolbar.js"></script>

<!-- 层级6：初始化总控（必须最后加载） -->
<script src="./assets/runtime/zone2-quiz-annotation/quiz-init.js"></script>
```

### 阶段 1：JS 拆分

每个子步骤遵循：
1. 创建新文件 → 从原文件**复制**对应函数 + **模块级变量** → 调整为 `window.QA.xxx = function()` 模式
2. 运行校验脚本确认当前步无遗漏（旧文件始终保持完整）

> **注意模块级变量的搬运**：除函数外，每个模块还有自己的内部变量（如 `annotationStepIndex`、`draggedBubble`、`noteFragmentState`、`linkingState` 等），这些变量同样需要搬到新文件。如果遗漏，运行时会出现 `xxx is not defined` 错误。本计划在每步清单中列出了所有模块级变量，搬运时请逐一确认。

- [ ] **Step 1.1**: 创建 `quiz-core.js`
  - 搬运：`getActiveQA`、`getSortedBubbles`、`getNotesBubbleContainer`、`getOrderedPassageLinkIds`、`syncBubbleOrderToPassageAnchors`、`getAnchorByLink`、`getAnswerAnchorByLink`、`getAnswerAnchorsByLink`、`getBubbleByLink`、`normalizeBubbleEndpointState`、`normalizeAllBubbleEndpointStates`
  - 搬运：`readStoredEditableHTML`、`getAnnotationStoreElementHTML`、`clearStoredEditableHTML`、`hydrateDynamicNoteContent`
  - 搬运：`isEditorMode`、`isDoodleMode`、`isDoodleDrawingActive`、`shouldSuppressFragmentDiscovery`、`shouldLockKeyboardAnnotationStepping`
  - 搬运：`getActiveDoodleLayer`、`getElementBehindDoodleLayer`、`resolveDoodlePassthroughTarget`
  - 搬运：`normalizeStrikethroughColor`、`normalizeStrikethroughThickness`、`arrangeAdjacentBadges`

- [ ] **Step 1.2**: 创建 `quiz-constants.js`
  - 搬运：`READING_TYPE_LABELS`、`DOODLE_PASSTHROUGH_BUTTON_SELECTOR`、模块级变量

- [ ] **Step 1.3**: 创建 `quiz-fragments.js`
  - 搬运：片段相关所有函数（`getFragmentOwnerLinkId`、`getNoteFragmentEntries`、`syncNoteFragments`、`revealNextNoteFragment`、`hidePreviousNoteFragment`、`getFragmentIdentityKey`、`getFragmentTargetsForBubble`、`getNoteFragmentState`、`getNoteFragments`、`resetNoteFragments` 等约 20 个函数）
  - 搬运：`noteFragmentState`、`fragmentIdentityKeys`、`fragmentIdentitySeed`、`fragmentGroupSeed` 等模块级变量

- [ ] **Step 1.4**: 创建 `quiz-persistence.js`
  - 搬运：`persistAnchorChange`、`persistQuizAuthoringChange`、`scheduleAnnotationSave`、`canUseAnnotationStoreWriteAPI`、`recordHistorySnapshot`、`getDeletedNoteIds`、`addDeletedNoteId`、`parseNoteNumericId`、`getNextNoteLinkId`、`purgeDeletedNotes`
  - 搬运：AnnotationStore 授权相关函数（`hasAnnotationStoreWriteAccess`、`hideAnnotationStoreStatus`、`showAnnotationStoreStatus`、`syncAnnotationStoreStatus`、`requestAnnotationStoreAuthorization`、`installAnnotationStoreFirstGestureAuth`）

- [ ] **Step 1.5**: 创建 `quiz-connectors.js`
  - 搬运：`ensureCanvas`、`drawStepConnectors`、`clearStepConnectors`、`drawHoverConnectors`、`clearHoverConnectors`、`checkVisibility`、`createLeftConnectorLine`、`createRightConnectorLine`、`drawEdgeArrow`
  - 搬运：`syncDoodlePassthroughCursor`、`setActiveDoodleProxyAnchor`、`clearDoodleProxyAnchor`、`bindDoodleModePassthrough`
  - 搬运：`activeDoodleProxyAnchor`、`doodlePassthroughBound` 等变量

- [ ] **Step 1.6**: 创建 `quiz-panel.js`
  - 搬运：`toggleNotesPanel`、`updateDividerPositions`、`initDividerButton`、`updateDividerButtonHoverState`、`hideDividerButton`、`expandAllBubbles`、`hideAllBubbles`、`replayNoteActivationAnimation`

- [ ] **Step 1.7**: 创建 `quiz-dragdrop.js`
  - 搬运：`initDragAndDrop`、`bindDragEvents`、`getDragAfterElement`、`cleanupDragArtifacts`、`recalcStepNumbers`
  - 搬运：`draggedBubble` 变量

- [ ] **Step 1.8**: 创建 `quiz-header.js`
  - 搬运：`initNotesHeader`、`migrateLegacyBubbles`、`rebuildOrphanBubbles`、`_initStoreUI`

- [ ] **Step 1.9**: 创建 `quiz-linking.js`
  - 搬运：`enterLinkingMode`、`exitLinkingMode`、`linkingEscHandler`、`ensureQAToolbarOwnerId`
  - 搬运：`linkingState`、`qaSelectionPointerActive`、`qaSelectionPointerOwner`、`qaToolbarOwnerSeq` 等变量

- [ ] **Step 1.10**: 创建 `quiz-activation.js`
  - 搬运：`activateNote`、`deactivateNote`、`clearAllActive`、`scrollIntoViewSmooth`
  - 搬运：`playBubbleFocusSound`、`playFragmentStepSound`、`playFragmentHoverSound`
  - 搬运：`anchorHasAuthoredFragments`、`canTriggerFragmentDiscovery`、`getFragmentPlainText`

- [ ] **Step 1.11**: 创建 `quiz-stepping.js`
  - 搬运：`annotationStepIndex` 变量
  - 搬运：`registerStepStrategy('annotation', ...)` 完整策略对象

- [ ] **Step 1.12**: 创建 `quiz-base.js`
  - 搬运：`inferReadingType`、`syncReadingTypePill`、`initQuizSystem`、`submitQuiz`、`resetQuizSubmissionState`
  - 搬运：`getCorrectOptionIds`、`setChoiceCorrectAnswers`、`createAnswerKeyChip`、`updateAnswerKeyChipSelection`
  - 搬运：`syncMatchingOptionDragState`、`normalizeBlankAnswer`

- [ ] **Step 1.13**: 创建 `quiz-single.js`
  - 搬运：`syncChoiceAnswerKeyEditors`、`clearSelectionQuestionResults`、`renderSelectionQuestionResults`、`clearQuestionUnansweredState`、`ensureQuestionResultFeedback`

- [ ] **Step 1.14**: 创建 `quiz-matching.js`
  - 搬运：`syncMatchingAnswerUI`、`ensureMatchingPassageSlotStructure`、`renderMatchingPassageSlot`、`setMatchingAnswerSlotValue`、`renderMatchingAnswerResults`、`unlockMatchingSubmissionState`、`clearMatchingAnswerByBlankId`、`resetMatchingQuestionState`、`syncSlotToPassage`、`clearPassageSlot`

- [ ] **Step 1.15**: 创建 `quiz-blank.js`
  - 搬运：`clearBlankAnswerResults`、`syncBlankAnswerUI`、`renderBlankAnswerResults`

- [ ] **Step 1.16**: 创建 `quiz-note-interactions.js`
  - 搬运：`initNoteInteractions` 内部全部回调
  - 搬运：`deleteNote`、`removeAnchorWrap`
  - 搬运：`trimAnchorWhitespaces`、`ensureAnchorTextVisualLayer`、`trimBlankSlotWhitespaces`
  - 搬运：`syncNotesPanelForCurrentMode`、`syncAllNotesPanelsForCurrentMode`（纯编排）
  - 搬运：`updateProgressCounter`、`getNoteFragmentToolbar`、`getAnnotationToolbar`

- [ ] **Step 1.17**: 创建 `quiz-toolbar.js`
  - 搬运：`initAnnotationToolbar`、`updateSelectionToolbars`、`hideQASelectionToolbars`
  - 搬运：`createAnnotation`、`createLinkAssociation`
  - 搬运：`applyNoteFragmentFormat`、`clearNoteFragmentFormat`
  - 搬运：`bindFloatingToolbarButtons`、`openAnchorToolbarDropdown`、`clearToolbarDropdownMenus`、`positionAnchorToolbarBesideSelection`、`positionFloatingToolbar`
  - 搬运：工具栏相关 DOM 创建和所有下拉调色板逻辑
  - 搬运：`REMOVE_FORMAT_TOOL_ICON` SVG 字符串常量（在 quiz-annotation-runtime.js 中约 632 行）
  - 搬运：`getSelectionRootNode`、`getNodeDepth`、`selectionIntersectsNode`、`unwrapFragmentNode`（编辑器下划线处理工具）

- [ ] **Step 1.18**: 创建 `quiz-init.js`
  - 搬运：`initQuizAnnotation`、`stripDynamicElements`、`autoInit`
  - 搬运：`syncNotesPanelForCurrentMode`、`bindEditorModeSync`（注册 EditorHooks）
  - 搬运：页面切换监听（`window.addSlideChangeListener`）
  - **暴露旧 API**：`window.initQuizAnnotation = ...`、`window.stripDynamicQAElements = ...`

- [ ] **Step 1.19**: 运行 `scripts/verify-split.js` 校验 JS 拆分完整性，修补遗漏

### 阶段 2：CSS 拆分

CSS 原文件内部有固定顺序（14.0 → 14.16），拆成 13 个文件后 **`<link>` 必须保持相同顺序**，否则后面的样式会错误覆盖前面的。

每个子步骤：创建文件 → 从原 CSS 复制对应区块。旧 CSS 文件始终保持完整。

CSS 引用顺序（也是加载顺序）：

```
1. quiz-layout.css             14.0-14.4  沉浸式逃逸、三栏 Grid
2. quiz-passage.css            14.4       左栏正文、题型胶囊、空位槽
3. quiz-notes-panel.css        14.5       中栏批注面板、栏头
4. quiz-answer-panel.css       14.6       右栏答题区、判分
5. quiz-anchors-bubbles.css    14.7-14.8  锚点、角标、气泡
6. quiz-connectors.css         14.9       SVG 连线
7. quiz-dragdrop.css           14.10      拖拽占位符
8. quiz-isolation.css          14.12      答题隔离规则
9. quiz-linking.css            14.13      关联模式
10. quiz-scrollbar.css         14.14      隐形滚动条
11. quiz-editor-toolbar.css    14.15      浮动工具条、富文本片段
12. quiz-responsive.css        14.16      响应式、无障碍
13. quiz-editor-mode.css       （末尾补丁）编辑模式专用覆盖
```

- [ ] **Step 2.1**: 创建 `quiz-layout.css`
  - 搬运：14.0 沉浸式逃逸、14.1 组件根容器、14.2 三栏 Grid、14.3 分割线、14.4 左栏正文基础
- [ ] **Step 2.2**: 创建 `quiz-passage.css`
  - 搬运：14.4 中左栏正文完整样式、题型胶囊、空位槽
- [ ] **Step 2.3**: 创建 `quiz-notes-panel.css`
  - 搬运：14.5 批注面板、栏头、列表区域
- [ ] **Step 2.4**: 创建 `quiz-answer-panel.css`
  - 搬运：14.6 完整右栏样式（标题、选项、槽位、判分反馈、提交按钮、芯片、连线题槽位、填空槽位）
- [ ] **Step 2.5**: 创建 `quiz-anchors-bubbles.css`
  - 搬运：14.7-14.8 原文锚点、角标、批注气泡（含激活态、极光动效）
- [ ] **Step 2.6**: 创建 `quiz-connectors.css`
  - 搬运：14.9 SVG 连线
- [ ] **Step 2.7**: 创建 `quiz-dragdrop.css`
  - 搬运：14.10 拖拽占位符
- [ ] **Step 2.8**: 创建 `quiz-isolation.css`
  - 搬运：14.12 答题隔离规则
- [ ] **Step 2.9**: 创建 `quiz-linking.css`
  - 搬运：14.13 关联模式呼吸高亮
- [ ] **Step 2.10**: 创建 `quiz-scrollbar.css`
  - 搬运：14.14 隐形滚动条
- [ ] **Step 2.11**: 创建 `quiz-editor-toolbar.css`
  - 搬运：14.15 浮动工具条、富文本片段
- [ ] **Step 2.12**: 创建 `quiz-responsive.css`
  - 搬运：14.16 响应式与无障碍
- [ ] **Step 2.13**: 创建 `quiz-editor-mode.css`
  - 搬运：编辑模式专属补丁（光标覆盖、气泡展开、答案键显示等）

### 中间验证

- [ ] **Step 2.14**: 所有 CSS 文件创建完毕 + 所有 JS 文件创建完毕后，运行校验脚本：
  ```bash
  cd d:\Projects\html-slides
  node scripts/verify-split.js \
    --original assets/runtime/quiz-annotation-runtime.js \
    --parts quiz-core,quiz-constants,quiz-fragments,quiz-persistence,quiz-connectors,quiz-panel,quiz-dragdrop,quiz-header,quiz-linking,quiz-activation,quiz-stepping,quiz-base,quiz-single,quiz-matching,quiz-blank,quiz-note-interactions,quiz-toolbar,quiz-init \
    --outdir assets/runtime/zone2-quiz-annotation

  node scripts/verify-split.js \
    --original assets/zones/zone2-quiz-annotation.css \
    --parts quiz-layout,quiz-passage,quiz-notes-panel,quiz-answer-panel,quiz-anchors-bubbles,quiz-connectors,quiz-dragdrop,quiz-isolation,quiz-linking,quiz-scrollbar,quiz-editor-toolbar,quiz-responsive,quiz-editor-mode \
    --outdir assets/zones/zone2-quiz-annotation
  ```
  - 预期：全部 4 项校验通过（行数守恒、函数完整性、无重复定义、自执行代码迁移）

## 完整的 CSS `<link>` 加载顺序（可直接复制到 HTML）

```html
<link rel="stylesheet" href="./assets/zones/zone2-quiz-annotation/quiz-layout.css">
<link rel="stylesheet" href="./assets/zones/zone2-quiz-annotation/quiz-passage.css">
<link rel="stylesheet" href="./assets/zones/zone2-quiz-annotation/quiz-notes-panel.css">
<link rel="stylesheet" href="./assets/zones/zone2-quiz-annotation/quiz-answer-panel.css">
<link rel="stylesheet" href="./assets/zones/zone2-quiz-annotation/quiz-anchors-bubbles.css">
<link rel="stylesheet" href="./assets/zones/zone2-quiz-annotation/quiz-connectors.css">
<link rel="stylesheet" href="./assets/zones/zone2-quiz-annotation/quiz-dragdrop.css">
<link rel="stylesheet" href="./assets/zones/zone2-quiz-annotation/quiz-isolation.css">
<link rel="stylesheet" href="./assets/zones/zone2-quiz-annotation/quiz-linking.css">
<link rel="stylesheet" href="./assets/zones/zone2-quiz-annotation/quiz-scrollbar.css">
<link rel="stylesheet" href="./assets/zones/zone2-quiz-annotation/quiz-editor-toolbar.css">
<link rel="stylesheet" href="./assets/zones/zone2-quiz-annotation/quiz-responsive.css">
<link rel="stylesheet" href="./assets/zones/zone2-quiz-annotation/quiz-editor-mode.css">
```

### 阶段 3：更新测试文件

- [ ] **Step 3.1**: 更新 `testing/tests/quiz-annotation-runtime.test.js`
  - JS 加载：原 `quiz-annotation-runtime.js` → 改为拼接 18 个新文件
  - 文件路径更新：`path.join(projectRoot, 'assets', 'runtime', 'zone2-quiz-annotation', 'quiz-core.js')`
- [ ] **Step 3.2**: 运行测试确认通过
  ```bash
  cd testing && node --test tests/quiz-annotation-runtime.test.js
  ```

### 阶段 4：更新 HTML 引用

> **替换策略**：删除旧文件的 `<link>` / `<script>` 引用行，替换为上述“完整加载顺序”中的对应行。
> 
> 当前 `qa-test-all-types.html` 中与 quiz 相关的旧引用：
> - CSS（1 行）：`<link rel="stylesheet" href="./assets/zones/zone2-quiz-annotation.css">`
> - JS（1 行）：`<script src="./assets/runtime/quiz-annotation-runtime.js?v=2"></script>`

- [ ] **Step 4.1**: 更新 `qa-test-all-types.html`
  - 删除旧 CSS `<link>` 行，替换为 13 行 CSS `<link>`（见上方"完整的 CSS link 加载顺序"）
  - 删除旧 JS `<script>` 行，替换为 18 行 JS `<script>`（见上方"完整的 JS script 加载顺序"）
  - 将缓存版本号 `?v=2` 更新为 `?v=3`（在 quiz-init.js 的引用上）
- [ ] **Step 4.2**: 更新 `组件展示全览.html`
  - 如果当前未引用 quiz-annotation，无需修改

### 阶段 5：更新文档引用

- [ ] **Step 5.1**: 更新 `SKILL.md`
  - JS 加载顺序更新
  - CSS 加载顺序更新
  - Supporting Files 表格更新
- [ ] **Step 5.2**: 更新 `references/html-template.md`
  - 模板中的引用示例、文件树
- [ ] **Step 5.3**: 更新 `references/component-templates.md`
  - runtime stack 引用说明
- [ ] **Step 5.4**: 更新 `references/presentation-layer.md`
  - 引用说明
- [ ] **Step 5.5**: 更新开发者文档（答题与批注、本地化保存、布局与组件、沉浸式逃逸）
  - 文件路径更新
- [ ] **Step 5.6**: 更新 `README.md`
  - 引用表格

### 阶段 6：验证

- [ ] **Step 6.1**: 运行全量自动化测试
  ```bash
  cd testing && node --test tests/*.test.js
  ```
- [ ] **Step 6.2**: 浏览器手动回归
  - 打开 `qa-test-all-types.html`
  - 验证四种题型：阅读单选、七选五、阅读填空、文章解析
  - 验证批注：点击角标、步进、拖拽排序、删除
  - 验证编辑模式：新建批注、编辑内容、取消关联
  - 验证保存/读取/刷新流程

### 阶段 7：收尾（最终删除旧文件）

> **请注意：此阶段只有在阶段 6 全部通过后才执行。在此之前两个旧文件始终保留。**

- [ ] **Step 7.1**: 删除 `assets/runtime/quiz-annotation-runtime.js`
- [ ] **Step 7.2**: 删除 `assets/zones/zone2-quiz-annotation.css`
- [ ] **Step 7.3**: 最终全量测试 + 浏览器回归通过
