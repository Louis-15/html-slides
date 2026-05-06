# 答题与批注组件代码拆分 — 设计文档

> **状态**：已确认  
> **日期**：2026-05-06  
> **目标**：将 `quiz-annotation-runtime.js`（~4800 行）和 `zone2-quiz-annotation.css`（~1500 行）按功能模块拆分为多个小文件，零行为变更。

---

## 1. 动机

`quiz-annotation-runtime.js` 已达 ~4800 行，包含约 18 个功能区块。日常维护（定位问题、修复 bug）耗时过长。CSS 文件同样需要按视觉区块拆分。

## 2. 设计原则

1. **零行为变更**：拆分后运行效果与拆分前完全一致
2. **共享命名空间**：所有 JS 子模块挂载到 `window.QA`，通过 IIFE 隔离内部变量
3. **显式依赖顺序**：入口文件按依赖顺序加载子模块
4. **向后兼容**：保留 `quiz-annotation-runtime.js` 作为聚合入口，HTML 文件中 `<script src>` 无需改动
5. **TDD 驱动**：每个模块拆分前后都必须通过自动化测试验证

## 3. JS 模块拆分

### 3.1 目录结构

```
assets/zones/zone2-quiz-annotation/     ← 新建目录（子模块 + CSS）
├── core.js                        # 工具函数、全局状态
├── fragments.js                   # 片段二级步进
├── persistence.js                 # 持久化 + onExportClean 钩子
├── panel.js                       # 面板展开/收起 + 分割线按钮
├── stepping.js                    # 步进策略注册
├── activation.js                  # 激活/降噪/追视
├── connectors.js                  # SVG 贝塞尔连线
├── dragdrop.js                    # 拖拽排序 + recalcStepNumbers
├── quiz-base.js                   # 答题共享层
├── quiz-single.js                 # ★ 阅读单选
├── quiz-matching.js               # ★ 阅读七选五
├── quiz-blank.js                  # ★ 阅读填空
├── note-interactions.js           # 气泡交互按钮 + 孤儿重建
├── linking.js                     # 关联模式
├── toolbar.js                     # 浮动工具条 + 批注创建
├── header.js                      # 栏头、气泡迁移
├── init.js                        # autoInit、页面切换监听
├── zone2-quiz-annotation.css      # CSS 聚合入口（@import 子文件）
├── layout.css                     # ... (14 个 CSS 子文件)
└── a11y.css                       # 响应式与无障碍

assets/quiz-annotation-runtime.js       ← [修改] 替换为聚合入口（同步 XHR + eval）
```

### 3.2 命名空间约定

所有子模块通过 `window.QA` 暴露 API：

```javascript
// core.js 示例
(function () {
  'use strict';
  var QA = window.QA = window.QA || {};

  QA.getActiveQA = function () { ... };
  QA.getSortedBubbles = function (qa) { ... };
  QA.isEditorMode = function () { ... };
  // ...
})();
```

每个子模块在文件顶部声明依赖：`var Core = window.QA;`

### 3.3 入口文件职责

`assets/quiz-annotation-runtime.js`（不在此目录中）只做三件事：
1. 使用**同步 XHR + eval**按依赖顺序加载 `zones/zone2-quiz-annotation/` 下的所有子模块
2. 暴露 `window.initQuizAnnotation` 和 `window.stripDynamicQAElements`（保持旧 API）
3. 调用 `autoInit()`

#### quiz-base.js — 答题系统共享层（~200 行）

**职责**：四种题型共用的初始化、提交、状态管理。每个题型专属文件只处理自己题型特有的交互和渲染。

提取的函数：
- `inferReadingType(qa)` / `syncReadingTypePill(qa)` — 题型推断
- `initQuizSystem(qa)` — 统一初始化入口（检测题型 → 分派到专属模块）
- `submitQuiz(qa)` — 统一提交入口
- `resetQuizSubmissionState(qa)` — 回到未提交
- `getCorrectOptionIds()` / `setChoiceCorrectAnswers()` — 选择题答案管理
- `createAnswerKeyChip()` / `updateAnswerKeyChipSelection()` — 编辑态答案芯片

#### quiz-single.js — 阅读单选（~80 行）

**职责**：`single` / `multi` 两种选择题型的选项点选、提交判分、编辑态答案编辑。

提取的函数：
- `syncChoiceAnswerKeyEditors(qa)` — 编辑态正确答案芯片
- `clearSelectionQuestionResults(qa)` / `renderSelectionQuestionResults(qa)` — 判分渲染
- `clearQuestionUnansweredState()` / `ensureQuestionResultFeedback()` — 未作答提示

#### quiz-matching.js — 阅读七选五（~280 行）

**职责**：拖拽配对的七选五题型。右栏槽位生成、选项拖拽、正文空位联动、判分。

提取的函数：
- `syncMatchingOptionDragState(qa)` — 拖拽权限控制
- `syncMatchingAnswerUI(qa, options)` — 右栏槽位动态生成 + 拖拽绑定
- `ensureMatchingPassageSlotStructure()` / `renderMatchingPassageSlot()` — 正文空位渲染
- `setMatchingAnswerSlotValue()` / `renderMatchingAnswerResults()` — 答案设置与判分
- `unlockMatchingSubmissionState()` / `clearMatchingAnswerByBlankId()` / `resetMatchingQuestionState()` — 状态管理
- `syncSlotToPassage()` / `clearPassageSlot()` — 右栏↔正文同步

#### quiz-blank.js — 阅读填空（~120 行）

**职责**：语法填空题型。右栏输入框、编辑态正确答案修改、判分。

提取的函数：
- `normalizeBlankAnswer(value)` — 答案标准化
- `clearBlankAnswerResults(qa)` / `renderBlankAnswerResults(qa)` — 判分渲染
- `syncBlankAnswerUI(qa)` — 右栏输入框动态生成 + 编辑态/学生态分流

> **文章解析（analysis）**：无独立模块。它没有答题内容（右栏不存在），`initQuizSystem` 检测到 `analysis` 类型后跳过答题初始化，只保留批注功能。

### 3.5 依赖拓扑（加载顺序）

```
core.js              (无依赖)
fragments.js         → core
persistence.js       → core
panel.js             → core
activation.js        → core, connectors, fragments
connectors.js        → core
stepping.js          → core, activation      ← 依赖 activation（策略函数调用 activateNote）
dragdrop.js          → core
linking.js           → core
header.js            → core
quiz-base.js         → core, persistence      ← 答题共享层
quiz-single.js       → core, quiz-base        ← ★ 阅读单选
quiz-matching.js     → core, quiz-base        ← ★ 阅读七选五
quiz-blank.js        → core, quiz-base        ← ★ 阅读填空
note-interactions.js → core, persistence, dragdrop, connectors, linking, header
toolbar.js           → core, persistence, note-interactions, linking
init.js              → 以上所有模块
```

## 4. CSS 模块拆分

### 4.1 目录结构

```
assets/zones/
├── zone2-quiz-annotation.css           ← [修改] 聚合入口（复用旧路径，@import 子文件）
└── zone2-quiz-annotation/              ← CSS 子文件目录
    ├── layout.css                     # 14.0-14.4
    ├── notes-panel.css                # 14.5
    ├── answer-panel.css               # 14.6
    ├── anchors-bubbles.css            # 14.7-14.8
    ├── connectors.css                 # 14.9
    ├── dragdrop.css                   # 14.10
    ├── divider-btn.css                # 14.11
    ├── quiz-isolation.css             # 14.12
    ├── linking-mode.css               # 14.13
    ├── scrollbar.css                  # 14.14
    ├── editor-toolbar.css             # 14.15
    ├── fragments.css                  # 14.15A
    └── a11y.css                       # 14.16
```

### 4.2 入口策略

`zone2-quiz-annotation.css` 聚合入口**复用旧路径** `assets/zones/zone2-quiz-annotation.css`，HTML 课件中 `<link href="./assets/zones/zone2-quiz-annotation.css">` **无需修改**。内部使用 `@import './zone2-quiz-annotation/layout.css'` 等相对路径引入子文件。

## 5. 测试策略

### 5.1 Node.js 自动化测试（jsdom）

位置：`testing/tests/quiz-annotation/`

- 每个子模块一个测试文件
- 使用 jsdom 模拟浏览器 DOM 环境
- 测试覆盖：工具函数正确性、核心逻辑单元、边界条件
- 运行：`node --experimental-vm-modules testing/bin/run.mjs`

### 5.2 浏览器集成测试

- 沿用 `qa-test-all-types.html`（覆盖四种题型）
- 手动验证流程：编辑 → 保存 → 读取 → 答题 → 提交 → 批注操作
- 刷新后回归检查

### 5.3 TDD 流程

每个模块拆分执行：
1. 从旧代码中提取该模块的所有函数声明和接口
2. 为每个公开函数写自动化测试
3. 用旧文件跑测试确认通过（建立基线）
4. 新建子模块文件 → 搬代码 → 用新文件跑测试
5. 回归全量测试

## 6. 向下兼容

- 旧 `assets/quiz-annotation-runtime.js` 替换为新聚合入口（同步 XHR + eval 加载所有子模块），HTML 文件中 `<script src="...quiz-annotation-runtime.js">` 无需修改
- 旧 `assets/zones/zone2-quiz-annotation.css` 替换为 CSS @import 聚合入口，`<link>` 路径不变
- `window.initQuizAnnotation`、`window.stripDynamicQAElements` API 保持不变
- `window.registerStepStrategy('annotation', ...)` 行为不变

## 7. 文档同步更新

拆分完成后，以下 MD 文档需要更新引用路径和模块说明：

| 文件 | 更新内容 |
|------|---------|
| `SKILL.md` | JS 加载说明追加"聚合入口自动加载子模块"；Supporting Files 表格新增子模块目录行 |
| `references/html-template.md` | 文件树注释更新 |
| `references/component-templates.md` | runtime stack 引用追加注释 |
| `references/presentation-layer.md` | 同上 |
| `开发者文档/答题与批注组件.md` | CSS 文件路径更新为聚合入口说明 |
| `开发者文档/本地化保存、读取系统.md` | `onExportClean` 引用从 `quiz-annotation-runtime.js` → `persistence.js` |
| `开发者文档/布局与组件开发文档.md` | CSS 文件路径更新 |
| `开发者文档/沉浸式逃逸组件.md` | 同上 |

HTML 测试页面（`qa-test-all-types.html`、`组件展示全览.html`）引用路径无需修改，但缓存版本号需更新。

## 7. 不做的

- 不改变任何函数签名或内部逻辑
- 不引入构建工具（webpack/rollup）
- 不合并 `quiz-annotation-audio.js`（独立职责，规模小）
- 不拆 `annotation-store.js`（已是 30 行兼容存根）

## 8. 风险

| 风险 | 缓解 |
|------|------|
| 模块间循环依赖 | 严格按拓扑顺序加载，init.js 最后 |
| CSS @import 性能 | file:// 下同步本地加载无影响 |
| 自动化测试覆盖率不足 | 每个模块拆分前先写测试，以旧文件验证基线 |
