# HTML-Slides 核心工作流解析 (AI Agent Workflow)

> **状态**：已同步至 v1.0.0 架构  
> **最后更新**：2026-05-13  
> **适用范围**：教学课件生成模式（单一主题，教学场景专用）

本解析文档面向**系统二次开发者**，全面梳理 AI 智能体（Agent）驱动 `html-slides` 项目从"意图识别"到"组件拼装"，再到"部署发布"的完整生命周期。

---

## 开发导向建议（如果要修改该逻辑）

在阅读完整流程前，先建立修改索引：

| 修改目标 | 操作入口 |
|---------|---------|
| 调整生成规则和 AI 行为 | `SKILL.md`（核心指令集） |
| 新增/修改组件 | `references/component-templates.md` + `assets/zones/zone2-components.css` 或 `zone2-immersive-components.css` |
| 新增布局模式 | `assets/zones/zone2-layout.css` + `references/layout-system.md` |
| 新增主题 | `assets/themes/` 新建 CSS 文件，更新 `SKILL.md` 加载顺序 |
| 修改动画预设 | `references/animation-patterns.md` |
| 修改持久化/保存逻辑 | `assets/editor/editor-persistence.js` |
| 修改编辑系统 | `assets/editor/` 下 7 个模块 |
| 修改音效系统 | `assets/audio/audio-runtime.js`（cue 定义） |
| 修改导航/步进逻辑 | `assets/runtime/navigation.js` + `step-through.js` |
| 优化 PPTX 提取 | `scripts/extract-pptx.py` |
| 优化部署或导出 | `scripts/deploy.sh` / `scripts/export-pdf.sh` |

---

## 总体流程概览 (8 阶段)

```
用户输入
   │
   ▼
Phase 0: 模式检测 ───→ Mode A(新建) ─→ Phase 1 → 2 → 3 → 4 → 5 → 8 → 9
               │           Mode B(PPT转换) ─→ Phase 6 → 5 → 8 → 9
               │           Mode C(修改)    ─→ 直接改+检查规则
               │           Mode D(HTML转换) ─→ Phase 7 → 5 → 8 → 9
               │
               └── 每个阶段内的文档查阅链（见下方各节）
```



---

## Phase 0：意图识别与路由分发 (Detect Mode)

**依赖文件**：`SKILL.md`

Agent 被唤醒后，首先加载 `SKILL.md`，按以下 4 种模式路由：

| 模式 | 触发条件 | 工作流入口 |
|------|---------|-----------|
| **Mode A：新建课件** | 用户提供教学内容文本/大纲 | Phase 1（信息收集） |
| **Mode B：PPT 转换** | 用户上传 `.pptx` 文件 | Phase 6（PPT 解析） |
| **Mode C：增强修改** | 用户要求修改现有 HTML 课件 | 直接修改 + 9 条规则验证（见下方） |
| **Mode D：HTML 转换** | 用户提供其他格式 HTML 文件 | Phase 7（HTML 转换） |

### Mode C 修改规则

当用户要求修改现有课件时，Agent 必须遵循：

1. **最小改动原则** — 只动用户要求的页面
2. **改后 9 条验证规则**：
   1. `<div class="deck" id="deck">` 存在
   2. 所有幻灯片为 `<div class="slide">`，`data-slide="0"` 至 `data-slide="N"` 连续编号
   3. 第一页有 `class="slide active"`，其他页没有 `active`
   4. 全局 `goTo()`、`next()`、`prev()` 函数存在（通过外部 `navigation.js`）
   5. CSS 全部通过外部 `<link>` 引用 `../../assets/`（字体 CDN 和极小的 `:root` 覆写可内联）
   6. JS 全部通过外部 `<script src>` 引用 `../../assets/`（CDN 库和极小自定义脚本可内联）
   7. 插入/删除后编号连续无断层
   8. `<meta name="generator" content="html-slides v1.0.0">` 在 `<head>` 中
   9. **在所有 `<script>` 标签之前**，有 `<script>window.__BASELINE__=document.documentElement.cloneNode(true)</script>`

---

## Phase 1：信息收集 (Collect Information)

**依赖文件**：`SKILL.md`

Agent 通过单次 `AskUserQuestion` 收集两件事：

### 1.1 教学内容

询问用户是否有讲义、教案或教学文本。选项：
- **内容已准备好** — 用户粘贴/上传文本 → 进入 Phase 2
- **只有大纲** — 按大纲生成骨架页
- **只有主题** — Agent 按主题自行生成内容

### 1.2 配图

询问用户是否有图片：
- **没有图片** — 仅使用文字和组件
- **有图片** — 用户提供图片路径

如有图片，Agent 需：
1. 逐一查看图片，评估可用性和主色调
2. 规划放置位置（哪一页的哪个布局插槽）
3. 复制到 `课件/<课件名>/images/` 目录下，HTML 中以 `images/xxx.png` 引用

---

## Phase 2：内容分析 (Content Analysis)

**依赖文件**：`SKILL.md`

Agent **内部完成**，不向用户展示，但必须做到：

### 2.1 结构分析

1. 识别教学模块（章节、单元、主题）
2. 识别每个模块内的知识点
3. 规划幻灯片拆分方案

### 2.2 逐页规划

对每一页确定：
- **Module name** → 放入 `.header-module`
- **Knowledge point** → 放入 `.header-title`
- **Content elements** — 文本、图片、交互组件
- **Layout mode** — 选择 8+2 种布局/变体之一
- **Components** — 选用哪些组件
- **Summary** — 是否包含总结面板

### 2.3 全文完整性检查

规划完成后，必须核对源材料中的每句话都已分配到某一页。**不得省略任何内容。**

---

## Phase 3：布局规划 (Layout Planning)

**读取文件链**：
1. `references/layout-system.md` — 三区画布模型 + 8+2 种布局模式及对比变体

### 3.1 三区画布模型

```
+----------------------------------------------------+
|  ZONE 1: 标题栏 (Header Bar)                         |
|  .slide-header                                      |
|    +-- .header-module  <- 面包屑：序号.节号 名称      |
|    +-- .header-title   <- 本页知识点名称               |
+----------------------------------------------------+
|  ZONE 2: 内容区 (Content Area)                      |
|  .slide-content.layout-[MODE]                       |
|    内容填充到布局插槽中                               |
+----------------------------------------------------+
|  ZONE 3: 总结面板 (Summary, 可选)                    |
|  .summary-trigger + .summary-panel                  |
+----------------------------------------------------+
|  Speaker Notes (必须, JSON 块, 页内最后子元素)         |
+----------------------------------------------------+
```

### 3.2 8+2 种布局模式及对比变体

| 布局类名 | 适用场景 |
|---------|---------|
| `layout-title` | 封面页、章节封面、封底 — 垂直+水平居中 |
| `layout-single` | 长文本、单组件、全宽图片 — **默认布局** |
| `layout-2col` | 图+文并排、双概念对比、双语对照 |
| `layout-2col.compare` | 双栏对比——中间自动撑出 VS 圆圈 |
| `layout-2col-wide-left` | 主内容+辅助信息（左宽右窄） |
| `layout-2col-wide-right` | 标签/图标+主视觉（左窄右宽） |
| `layout-3col` | 三概念并列、三步流程 |
| `layout-3col.compare` | 三栏对比——两栏间自动撑出 VS 圆圈 |
| `layout-2row` | 依次步骤、前后对比 |
| `layout-grid-2x2` | 四个相关概念、2x2 矩阵 |

**内容密度规则**（不设硬性上限）：
- 无"每页最多 N 条"限制
- 全文本保留，不压缩、不摘要
- 当内容超出内容区垂直空间时，进行智能分页（下一页继承相同的 header-module/header-title）

### 3.3 总结面板决策

当一页有明确的要点总结价值时包含 `summary-trigger` + `summary-panel`。不要在封面页、练习题页、过渡页或内容极少的页面上使用。

---

---

## Phase 4：草稿生成与用户审查 (Draft Generation & Review)

**依赖文件**：`references/draft-guide.md`

**目的**：将 AI 内部规划的结果输出为可视化的 Markdown 草稿文件，让用户在生成最终 HTML 前审查和修改，实现对课件结构的完全可控。

### 4.1 生成草稿

AI 按 `references/draft-guide.md` 中定义的格式，逐页输出草稿到 `课件/<课件名>/draft-<课件名>.md`。

草稿核心要求：
- **所见即所得** — 最终 HTML 有什么内容，草稿就有什么内容
- **全内联** — 正文全文、题目、选项、正确答案、批注、讲者备注必须全部出现在草稿正文中，不使用"见附录"
- **批注锚点** — 答题与批注组件使用 `[N-left-begin]...[N-left-end]` 和 `[N-right-begin]...[N-right-end]` 标记对来精确标注批注关联位置
- **所有组件字段逐一列出** — 不写"略""见模板"

格式详情、组件字段规范、批注标记用法与完整示例均见 `references/draft-guide.md`。

### 4.2 审查与修改流程

1. **AI 生成草稿** → 写入草稿文件
2. **用户审查** → 阅读草稿，提出修改意见
3. **多轮修改** → 用户与 AI 对话调整：
   - 拆分/合并页面
   - 修改布局模式
   - 更换组件类型
   - 调整具体文本内容
   - 调整批注锚点位置
   - 添加/删除总结面板
4. **定稿确认** → 用户确认草稿无误后，进入 Phase 5（课件生成）

> **注意**：草稿文件仅描述"内容结构"，不含实际的 CSS 类名、data-edit-id、JavaScript 加载等实现细节。这些细节在 Phase 5 生成 HTML 时由 AI 自动填充。



## Phase 5：课件生成 (Generate Courseware)

**读取文件链（严格按顺序）**：

### 5.1 模板与参考

1. `references/html-template.md` — HTML 骨架、CSS/JS 加载顺序
2. `references/component-templates.md` — 17 种组件模板
3. `references/animation-patterns.md` — 动画类名分配
4. `references/libraries.md` — CDN 库（Chart.js 等）
5. `references/presentation-layer.md` — 共享规范

### 5.2 CSS 加载顺序

```
viewport-base.css
  -> theme (xindongfang-green.css --- 单一教学主题，无选择步骤)
  -> components.css
  -> zone1-header.css
  -> zone2-layout.css
  -> zone2-components.css (12 通用组件)
  -> zone2-image-card.css (图片卡片样式)
  -> zone2-immersive-components.css (title-hero, chapter-hero, ending-quote)
  -> zone2-quiz-annotation/ (13 CSS 子文件，按依赖拓扑)
  -> zone2-example-card.css
  -> zone3-summary.css
  -> editor/editor.css
```

### 5.3 JS 加载顺序

```
第 1 层 --- 放映底座（5 模块，始终加载）：
  navigation.js -> keyboard.js -> step-through.js -> chart-integration.js -> speaker-notes.js

第 2 层 --- 音效总线（始终加载）：
  audio-runtime.js

第 2b 层 --- 答题系统音效（按需）：
  [quiz-annotation-audio.js -> zone2-quiz-annotation/ 17 JS 子模块]

第 3 层 --- 编辑系统（始终加载）：
  editor-utils.js -> editor-persistence.js -> editor-history.js
  -> editor-inline-boxes.js -> image-card-runtime.js -> editor-rich-text.js
  -> editor-core.js -> editor-core-image.js

第 4 层 --- 普通页隐藏标注 + 涂鸦（始终加载）：
  page-richtext-annotation-runtime.js -> doodle-runtime.js

第 5 层 --- 例题系统（按需）：
  [example-card-audio.js -> example-card-core.js -> example-card-authoring.js -> example-card-student.js]
```

### 5.4 组件系统

当前共 **17 种组件**，分为 3 个 CSS 文件管理：

**通用组件（`zone2-components.css`，12 种）：**
`.card` / `.flip-card` / `.collapse-card` / `.code-window` / `.stat-card` / `.highlight-card` / `.dual-bar` / `.timeline-card` / `.chart-container` / `.table-wrap` / `.image-card` / `.content-block`

**沉浸式组件（`zone2-immersive-components.css`，3 种）：**
`.title-hero`（封面）/ `.chapter-hero`（章节封面）/ `.ending-quote`（封底鸡汤）

**专项教学组件（独立文件）：**
`.quiz-annotation`（答题与批注，13 CSS + 17 JS）/ `.example-card`（例题，独立 CSS + 3 JS）

### 5.5 设计原则

| 原则 | 说明 |
|------|------|
| **零依赖** | 所有 CSS/JS 通过外部引用指向 `../../assets/`，无 npm/构建工具 |
| **Glassmorphism** | 卡片表面使用 `rgba(255,255,255,0.25)` + `backdrop-filter: blur(24px)`，让幻灯片双色环境光自然穿透 |
| **统一 Hover 交互** | 所有卡片类组件 hover 统一为 `translateY(-2px) scale(1.02)` + 阴影提升，不变背景色 |
| **全文本保留** | 每个知识点完整呈现，不压缩、不摘要 |
| **data-edit-id** | 所有用户可编辑文本块都必须标记 `data-edit-id`（含 `data-edit-id-auto="true"`），编辑器通过此 ID 持久化 |
| **键盘步进契约** | 普通页 `↑↓` 控制一级焦点/翻页，`←→` 仅在当前焦点宿主内步进片段 |

### 5.6 演讲者备注

每页**必须**包含以 JSON 格式嵌入的讲者备注：

```json
{"title":"幻灯片标题","script":"教师讲解词（口语化，像在跟学生说话）","notes":["关键教学点1","关键教学点2"]}
```

- `script` 使用自然口语风格
- **不得包含**：舞台指示、转场提示、元评论

### 5.7 课件保存规范

所有生成课件必须存放在 `课件/<课件英文名>/<课件英文名>.html`，遵循：
- 文件夹名 = 文件名（不含 `.html`）
- 引用路径：`../../assets/...`（从课件文件上溯两级）
- 图片统一放在 `课件/<课件名>/images/` 下
- 涂鸦文件（`.doodle`）与 HTML 平级

---

## Phase 6：PPT 转换 (Mode B)

**依赖文件**：`scripts/extract-pptx.py`

1. 运行 `python scripts/extract-pptx.py <input.pptx> <output_dir>`（需安装 `python-pptx`）
2. 向用户确认抽取结果（标题、内容摘要、图片数量）
3. 将抽取的内容送入 Phase 3 -> 4 -> 5 的课件生成流水线

---

## Phase 7：HTML 转换 (Mode D)

**读取文件**：`references/conversion-patterns.md`

支持以下源格式的自动检测与转换：

| 源格式 | 检测特征 | 映射策略 |
|--------|---------|---------|
| reveal.js | `<div class="reveal">` + `<section>` | 1:1 映射 |
| Marp | `<!-- marp: true -->` 或 `class="marpit"` | 1:1 映射 |
| impress.js | `<div id="impress">` + `div.step` | 1:1 映射 |
| Slidev | `class="slidev-layout"` | 1:1 映射 |
| Google Slides | Google 特有嵌套 div | 提取文本+图片 |
| 文章/博客 | `<article>` / `<main>` / 标题结构 | 按标题拆分 |
| 通用 HTML | 无特定框架特征 | 按标题拆分 |

转换流程：读取 -> 对照合规检查（9 条规则）-> 提取内容 -> 送入 Phase 3-5

---

## Phase 8：交付 (Delivery)

Agent 打开 HTML 文件并向用户输出使用引导：

- **导航**：方向键 / 空格 / 滚轮 / 滑动 / 小圆点
- **讲者备注**：F12 -> 控制台自动显示当前页串词
- **编辑模式**：按 E 键进入 -> 点击任意文本编辑 -> Ctrl+S 或点击 保存按钮 保存到文件
- **加载存档**：点击 加载按钮 清除草稿并刷新页面

---

## Phase 9：分享与导出 (Share & Export, Optional)

Agent 主动询问用户是否需要分享或导出：

### 8A：部署到在线 URL

```bash
bash scripts/deploy.sh <课件路径>
```
通过 Vercel 部署为可分享的在线页面。

### 8B：导出为 PDF

```bash
bash scripts/export-pdf.sh <课件路径> [输出文件]
bash scripts/export-pdf.sh <课件路径> [输出文件] --compact  # 紧凑模式
```
使用 Playwright 截图各页并拼合为 PDF。

---

## 关键数据流：编辑 -> 保存 -> 读取

```
+-----------------------------------------------------------+
|                    页面加载时                               |
|  HTML 解析 -> __BASELINE__ 快照(干净DOM, 运行时前捕获)      |
|       -> 外部脚本执行(运行时注入 + 编辑器初始化)             |
+-----------------------------------------------------------+
|                    编辑阶段                                 |
|  用户按 E -> toggleEditMode()                              |
|    +- BoxManager 扫描 [data-edit-id] 注入控件条             |
|    +- ImageCardRuntime 扫描 .image-card 注入替换按钮        |
|    +- 编辑工具栏激活                                        |
|    +- 翻页时 syncFromDOM(当前页) -> localStorage            |
|    +- 保存按钮 -> PersistenceLayer.saveToHTMLFile()         |
|         +- 克隆 __BASELINE__                               |
|         +- 从 localStorage 覆写 [data-edit-id] innerHTML    |
|         +- 从实时 DOM 补回 <script> 标签                    |
|         +- 触发 onExportClean 钩子(quiz/example-card 清洗)  |
|         +- File System Access API 写入 HTML 文件            |
+-----------------------------------------------------------+
|                    读取/重置                                |
|  点击 加载按钮 -> 清除 localStorage -> location.reload()     |
|    +- 从 HTML 文件重新加载 -> 组件 runtime 重新初始化        |
+-----------------------------------------------------------+
---

## 核心架构文件索引

| 类别 | 文件 | 职责 |
|------|------|------|
| **入口** | `SKILL.md` | 核心指令集，定义 9 阶段工作流（含草稿审查） |
| **布局** | `references/layout-system.md` | 三区画布、8+2 布局模式及对比变体 |
| **组件** | `references/component-templates.md` | 全部 17 组件 HTML 模板 |
| **模板** | `references/html-template.md` | HTML 骨架、CSS/JS 加载顺序、9 条规则 |
| **动画** | `references/animation-patterns.md` | 动效-情绪映射、类名参照 |
| **转换** | `references/conversion-patterns.md` | 框架检测、提取规则 |
| **库** | `references/libraries.md` | CDN 库参考 |
| **层规范** | `references/presentation-layer.md` | 共享结构规范 |
| **CSS 组件** | `assets/zones/zone2-components.css` | 12 通用组件样式 |
| **CSS 沉浸** | `assets/zones/zone2-immersive-components.css` | title-hero、chapter-hero、ending-quote |
| **CSS 布局** | `assets/zones/zone2-layout.css` | 8+2 布局模式及对比变体的 grid/flex 定义 |
| **CSS 主题** | `assets/themes/xindongfang-green.css` | 单一教学主题的全部 CSS 变量 |
| **JS 导航** | `assets/runtime/navigation.js` | 翻页、UI、`goTo()`/`next()`/`prev()` |
| **JS 步进** | `assets/runtime/step-through.js` | 页内焦点队列、一级/二级步进策略 |
| **JS 键盘** | `assets/runtime/keyboard.js` | 键盘事件分发 |
| **JS 音效** | `assets/audio/audio-runtime.js` | 全局音效总线、cue 定义与播放 |
| **JS 编辑器** | `assets/editor/editor-core.js` | 编辑模式总控 |
| **JS 持久化** | `assets/editor/editor-persistence.js` | localStorage -> HTML 文件保存/读取 |
| **JS 框管理** | `assets/editor/editor-inline-boxes.js` | 文本框+简单图片框统一管理 |
| **JS 图片卡片** | `assets/runtime/image-card-runtime.js` | 图片卡片插入/替换/清空/光箱 |
| **JS 涂鸦** | `assets/runtime/doodle-runtime.js` | SVG 涂鸦覆盖层、.doodle sidecar |
| **脚本** | `scripts/extract-pptx.py` | PPT 内容提取 |
| **脚本** | `scripts/deploy.sh` | Vercel 部署 |
| **脚本** | `scripts/export-pdf.sh` | PDF 导出 |


