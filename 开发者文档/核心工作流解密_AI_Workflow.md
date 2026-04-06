# HTML-Slides 核心工作流解析 (AI Agent Workflow)

如果想要对 `html-slides` 这个技能（Skill）进行深度定制和二次开发，仅了解它能生成什么是远远不够的。作为系统开发者，必须完全掌握隐藏在底层的 **AI 智能体（Agent）工作流**，理解它是如何一步步依据预设脚本、文档字典和规则模板，将用户的自然语言需求转化为最终生产环境中可运行的 HTML 文件的。

本解析文档全面梳理了大型语言模型（LLM）驱动该项目从“意图识别”到“组件拼装”，再到“资源打包构建”的完整生命周期。

---

## 阶段 0：意图识别与路由分发 (Detect Mode)

这是 AI 接收到唤醒口令（如 `/html-slides`）并拉取初始上下文后执行的首个操作模块：**评估输入意图并进行任务调度**。

1. **核心逻辑驱动**：
   Agent 会加载并解析 `SKILL.md`（技能核心指令集），对用户的文本或者附加文件进行意图识别（Intent Detection），将工作流派发到模式 A、B、C 或 D（新建、解析、修改、转换）。
2. **容错与状态检查 (专为模式 C 设立)**：
   若用户要求对现有的 HTML 幻灯片进行局部微调（模式 C），Agent 会触发前置 DOM 扫描检查。包括：遍历检查所有的 `data-slide` 自增索引是否产生断层，确保页面包裹容器没有出现跨视口（Overflow）的错误嵌套等，以此保障输出具备极高的结构鲁棒性。

---

## 阶段 1 & 2：策略选择与主题设定 (Choose Mode & Content/Theme)

在这个阶段，模型并不急于生成前端代码，而是作为一名“项目架构师”与“UI/UX 设计师”去获取必要的状态和偏好以明确项目的设计系统（Design System）。

1. **Agent 交互确认**：
   利用问答或对话阻断，向用户确认大方向：是使用重数据的“组件组合模式（Pro）”还是重设计的“主观氛围创意模式（Vibe）”？并确认对深色与浅色模式（Dark/Light Theme）的偏好。
2. **调阅样式预设库 (Style Presets)**：
   - 特别在 **Vibe 模式** 下：Agent 会大量查阅 **`references/STYLE_PRESETS.md`** 词典。它会分析用户的目标受众情绪（如专业、活力、治愈），并在后台生成 **3 款不同 CSS 色值及版式布局的样板代码（Demo）** 展示给用户做最终确认。
3. **静态资产 (Assets) 预处理**：
   如果用户上传了相关的插图或企业 Logo，后台系统会自动计算其适配占比，建立对这些本地文件（写入 `assets/` 目录）的相对路径引用，保障成品文件完全去耦合、可离线运行。

---

## 阶段 3：组件拼装与资源融合生成 (Generate Presentation)

这是最为占用 Token 上下文解析量、也是进行复杂前端结构重排的核心业务层。

1. **模板读取与视口约束校验 (Viewport Fitting)**：
   - Agent 必须确保设计稿不会越过 `100vh` 窗口物理极限，遇到大段内容时必须强制自动执行分页操作。
   - **布局调用**：Agent 频繁查询 **`references/component-templates.md`**。判断此处该引入“状态时间线 (Timeline)”还是“交互翻转卡片 (Flip Card)”。
   - **动效分配**：查询 **`references/animation-patterns.md`**，按前端交互原则合理分配带有层级延迟的进场 CSS 动画类名（如 `anim-3`, `bounce-1`）。

2. **核心构建依赖项的内联嵌入 (Inline CSS & JS Injection)**：
   受限于“单 HTML 原则”，Agent 将多个底层文件强行进行合并（Minify & Inject）：
   - 将负责自适应视口的重置样式 **`assets/viewport-base.css`** 及通用组件样式 **`assets/components.css`**，直接插入至 `<style>` 标签的根部。
   - 插入所选主题的 CSS 变量注册表（如 **`assets/themes/editorial-light.css`**）。
   - 将提供前端 DOM 事件监听和基础页面控制引擎的 **`assets/slides-runtime.js`** 直接挂载到页面底部的 `<script>` 中。

3. **演讲者备注序列化注入 (Speaker Notes Backend JSON)**：
   这是针对商业场景极其关键的一步。Agent 根据幻灯片的可视内容，自己推演出符合演讲人临场语气的串词，并将这些信息序列化成 JSON 字典：
   ```json
   {"title":"...", "script":"...", "notes":["..."]}
   ```
   然后静默地将其封装并嵌入到每一层 `<div class="slide">` 底部的 `class="slide-notes"` 数据岛之中，以供浏览器 F12 控制台专用调用输出。

---

## 阶段 4 & 5：外部协议解析与清洗 (Extraction & HTML Conversion)

当数据来源不是纯文本而是复杂的前端/后端文档结构时，则交由此模块处理。

1. **模式 B：解析 PPTX 结构流 (Phase 4)**：
   - 调用工具：**`scripts/extract-pptx.py`**
   - 机制：此步骤中模型通常不能硬读文件，因此必须使用本地 Terminal 挂载 Python 子进程工具进行解包操作。成功抽离出的图片与段落文本数组返回给工作区流转接口后，重新由 Agent 读取并投掷到上文的生成流水线上重构为 HTML。
2. **模式 D：旧前端库 DOM 转换与清洗 (Phase 5)**：
   - 调用规则手册：**`references/conversion-patterns.md`**
   - 机制：系统分析像 reveal.js 或纯 Markdown 导出的 HTML 原型，利用正则或者文本切片技术清洗掉带有依赖污染的残缺 `class`，剥离出核心纯净的骨架再投入加工流。

---

## 阶段 6 & 7：部署发布与形态兼容转换 (Share & Export Ecosystem)

在输出纯粹的单一 HTML 页面后，系统依然持有触发附加生产管线工具链的权利。

1. **Vercel 云托管发版部署：**
   调用 **`scripts/deploy.sh`**。作为 CI/CD 快捷通道使用，帮助非运维人员一键建立网络公开发布。
2. **无头浏览器 PDF 静电影像渲染：**
   调用 **`scripts/export-pdf.sh`**。这一步挂载了类似 Playwright 的无头内核底座功能。为了提供可以物理列印与向下兼容汇报的产品，该脚本将在后台加载整套 HTML 并自动执行所有幻灯片的截取、拍平等 PDF 高解析封装业务。

---

## 开发导向建议（如果要修改该逻辑）

在掌握了以上完整路由周期后，对于想二次开发系统的工程师而言：
- **修改意图识别和 AI 语言风格** 👉 更新 `SKILL.md` (或 `SKILL_CN.md`) 中对应的 prompt 参数。
- **添加新的交互组件和结构布局** 👉 更新 `references/component-templates.md` 给模型补充新组件认知，并在 `assets/components.css` 下添加组件自身的对应隔离样式。
- **自定义品牌色板和 UI 皮肤** 👉 去 `assets/themes/` 新建专属主题 CSS 文件，顺手在阶段二策略提示词中告诉 AI 可以选择该新文件。
- **优化 PPTX 提取效率与清洗容错率** 👉 修改 `scripts/extract-pptx.py`。
