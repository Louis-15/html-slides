# 幻灯片草稿撰写指南

> **面向对象**：AI 智能体（Agent）
> **用途**：在 Phase 4（草稿生成与用户审查）阶段，按本指南格式将幻灯片规划结果输出为 Markdown 草稿文件。
> **核心原则**：所见即所得 — 最终 HTML 中有什么内容，草稿中就有什么内容。一个字符都不省略。

---

## 一、草稿文件基本规范

### 1.1 保存路径

```
课件/<课件英文名>/draft-<课件英文名>.md
```

例如：`课件/sentence-structure/draft-sentence-structure.md`

### 1.2 结构要求

- 按幻灯片页号从 0 开始，逐页编写
- 每页包含：Zone 1 状态与内容、Zone 2 布局与组件、Zone 3（若有）、讲者备注
- **所有内容全部内联**，不使用"见附录"等外部引用

### 1.3 内容完整性

> ⚠️ **铁律**：最终 HTML 中有什么内容，草稿中就有什么内容。
> 正文全文、题目选项、正确答案、批注文字、讲者备注——一个字都不能少。

---

## 二、每页草稿格式

### 2.1 标准结构

```markdown
## Slide N

### Zone 1（标题栏）
- **状态**：正常
- **header-module**：`[序号.节号 名称]`
- **header-title**：`[本页知识点名称]`

### Zone 2（内容区）
- **布局**：`layout-[MODE]`

#### 组件 1：[组件类型]
- **位置**：[第几个插槽 / 单列 / 居中]
- **组件内容**：
  （按组件字段逐一列出）

#### 组件 2：[组件类型]
  ...

### Zone 3（可选）
- [总结要点 1]
- [总结要点 2]

### 讲者备注
- **title**：[标题]
- **script**：[讲解词]
- **notes**：
  - [要点 1]
  - [要点 2]
```

### 2.2 Zone 1 状态说明

| 状态值 | 含义 | 适用场景 |
|--------|------|---------|
| `正常` | 显示标题栏 | 所有普通内容页 |
| `沉浸式逃逸` | 隐藏标题栏，Zone 2 全屏 | 封面（.title-hero）、章节封面（.chapter-hero）、封底鸡汤（.ending-quote） |

沉浸式逃逸页面**不需要**写 header-module 和 header-title。

### 2.3 图片的处理

html-slides 的图片系统使用**外挂相对路径**（`images/xxx.png`），不支持 Base64 内嵌。所有图片由用户提前放入 `课件/<课件名>/images/` 目录。

图片在幻灯片中有两种放置方式，草稿中需明确区分：

| 方式 | 类型 | 用什么写 | 适用场景 |
|------|------|---------|---------|
| **图片卡片** | 组件级 | `image-card` 组件 | 独占布局一栏，有框、空态占位、放映光箱、编辑按钮 |
| **简单图片框** | 元素级 | 在组件内部标注 | 嵌入组件内与其他内容流式混排，与文本框同级 |

#### 用户提供图片后 AI 需做的事

1. 逐一查看图片，评估内容和主色调
2. 规划每张图片的放置位置（哪个 Slide、哪种方式）
3. 在草稿中按下方格式标注

#### 方式一：图片卡片（组件级）

`image-card` 是一个独立的组件，独占一个布局插槽。草稿中分为空态和有图两种情况：

```markdown
# 空态（占位，用户后续自己在编辑模式替换）
#### 组件 1：image-card（图片卡片）
- **位置**：左栏
- **状态**：空态占位

# 有图（AI 指定了图片）
#### 组件 1：image-card（图片卡片）
- **位置**：左栏
- **图片文件**：images/sentence-diagram.png
- **替代文本**：句子结构图
- **变体**：无  # 可选：image-screenshot / image-logo
```

> **变体说明**：`image-screenshot` 加边框和阴影，适合截图；`image-logo` 缩小尺寸适合 Logo。

#### 方式二：简单图片框（组件内嵌）

简单图片框不是组件，而是嵌在某个组件**内部**的一个可编辑元素。草稿中直接在该组件的字段里标注：

```markdown
#### 组件 1：content-block（内容块）
- **位置**：左栏
- **正文**：下图展示了英语句子的基本结构。
- **组件内图片**：images/structure-overview.png  # 简单图片框，与文字流式混排
- **正文续**：从图中可以看出，主语和谓语构成句子的主干。
```

简单图片框在生成 HTML 时会由 `BoxManager` 自动包裹为 `.simple-image-box` 容器，无需手工指定类名。它没有独立控件条、无光箱、无空态占位——这些属于 `image-card` 组件的专有能力。

---

## 三、各类组件的草稿格式

### 3.1 简单组件（直接列字段）

#### Card / 普通卡片

```markdown
#### 组件 1：card（普通卡片）
- **位置**：左栏
- **图标**：📦
- **标题**：什么是句子成分？
- **描述**：句子的组成部分，包括主语、谓语、宾语、表语、定语、状语、补语等。
```

#### Stat Card / 数字强调卡片

```markdown
#### 组件 1：stat-card（数字卡片）
- **位置**：左栏
- **数字**：85
- **单位**：%
- **标签**：满意率
- **描述**：用户对教学内容的整体满意度
- **颜色**：green  # 可选：green / orange / blue / purple
```

#### Flip Card / 翻转卡片

```markdown
#### 组件 1：flip-card（翻转卡片）
- **位置**：左栏
- **正面图标**：🔄
- **正面标题**：什么是主语？
- **正面副标题**：点击翻转查看答案
- **背面图标**：📖
- **背面内容**：主语是句子陈述的对象，说明"谁"或"什么"。
```

#### Collapse Card / 折叠卡片

```markdown
#### 组件 1：collapse-card（折叠卡片）
- **位置**：左栏
- **标题**：主语的位置
- **简短描述**：主语通常位于句首，但在疑问句和倒装句中位置会变化。
- **展开详情**：在陈述句中，主语位于动词之前。在一般疑问句中，助动词提到主语之前。在倒装句中，整个动词词组可能提到主语之前。
```

#### Code Window / 代码窗口

```markdown
#### 组件 1：code-window（代码窗口）
- **位置**：左栏
- **文件名**：hello.py
- **代码**：
  ```
  1  def greet(name):
  2      return f"Hello, {name}!"
  3
  4  if __name__ == "__main__":
  5      print(greet("World"))
  ```
```

#### Highlight Card / 内容强调卡片

```markdown
#### 组件 1：highlight-card（强调卡片）
- **位置**：右栏
- **标签**：核心概念
- **标题**：句子的主干
- **正文**：主语和谓语构成句子的主干，是所有其他成分依附的核心骨架。
```

#### Dual Bar / 双色条形图

```markdown
#### 组件 1：dual-bar（双色条形图）
- **位置**：单列
- **左侧文字**：正面评价
- **左侧比例**：78
- **右侧文字**：待改进
- **右侧比例**：22
```

#### Timeline Card / 时间线卡片

```markdown
#### 组件 1：timeline-card（时间线）
- **位置**：右栏
- **节点列表**：
  | 颜色 | 文字 |
  |------|------|
  | green | **Step 1** — 识别动词，确定谓语 |
  | blue  | **Step 2** — 问"谁/什么"发出了这个动作 |
  | orange | **Step 3** — 找到主语 |
```

#### Chart / 图表

```markdown
#### 组件 1：chart（图表）
- **位置**：单列
- **图表类型**：bar
- **图表标题**：各题型使用频率
- **数据**：
  | 标签 | 数值 |
  |------|------|
  | 单选题 | 45 |
  | 多选题 | 30 |
  | 填空题 | 15 |
  | 拖拽题 | 10 |
```

#### Table / 表格

```markdown
#### 组件 1：table（表格）
- **位置**：单列
- **表头**：名称 | 分类 | 说明
- **行数据**：
  | 名词 | 实词 | 表示人、事物、地点 |
  | 动词 | 实词 | 表示动作或状态 |
  | 形容词 | 实词 | 修饰名词 |
  | 冠词 | 虚词 | 限定名词 |
```

#### Content Block / 内容块

```markdown
#### 组件 1：content-block（内容块）
- **位置**：左栏
- **正文**：主语是句子的核心成分之一，它回答了"谁"或"什么"的问题。在英语中，每个完整的句子都必须有主语。
- **文内强调**：<span class="accent">每个完整的句子都必须有主语。</span>
- **重点内容（callout）**：主语不可省略。
- **补充说明**：即使是祈使句，也隐含了第二人称主语 you。
```

#### Image Card / 图片卡片

图片卡片是组件级元素，独占一个布局插槽。生成 HTML 后，用户可在编辑模式下通过 🖼️ 按钮替换图片或 🗑️ 清空。

```markdown
# 空态（无图时保留布局位置，用户自己在编辑模式插入图片）
#### 组件 1：image-card（图片卡片）
- **位置**：左栏
- **状态**：空态占位

# 有图
#### 组件 1：image-card（图片卡片）
- **位置**：左栏
- **图片文件**：images/sentence-diagram.png
- **替代文本**：句子结构图
- **变体**：无  # 可选：image-screenshot / image-logo
```

> 关于图片的两种存放方式及路径规范详见 [2.3 图片的处理](#23-图片的处理)。

### 3.2 沉浸式组件

#### Title Hero / 封面标题组

```markdown
#### 组件 1：title-hero（封面组）
- **位置**：居中
- **学科名**：高中英语
- **课件标题**：句子成分与结构
- **分割线**：有（渐变分割线）
- **讲师信息**：张老师
```

#### Chapter Hero / 章节封面页

```markdown
#### 组件 1：chapter-hero（章节封面）
- **位置**：居中
- **章节序号**：模块一
- **章节标题**：句子成分与结构
```

#### Ending Quote / 封底鸡汤页

```markdown
#### 组件 1：ending-quote（封底鸡汤）
- **位置**：居中
- **英文**：Education is not the filling of a pail, but the lighting of a fire.
- **中文**：教育不是灌满一桶水，而是点燃一把火。
- **出处**：—— 威廉·巴特勒·叶芝
```
> 出处为可选字段。如果鸡汤为 AI 自创且无明确出处，可省略。

### 3.3 教学交互组件

#### Quiz-Annotation / 答题与批注组件

这是最复杂的组件，涉及三栏布局（左栏正文 | 中栏批注 | 右栏答题）。**拥有独立的沉浸式逃逸规则**——只要 Slide 中包含 `.quiz-annotation`，Zone 1 标题栏自动隐藏，Zone 2 获得全页高度。

**内容类型**：该组件支持 4 种类型，草稿中需标注：

| 类型标识 | 含义 | 右栏内容 |
|---------|------|---------|
| `single` | 阅读单选 | 选择题选项 + 判分 |
| `matching` | 阅读七选五 / 拖拽连线 | 拖拽选项 + 空位 |
| `blank` | 阅读填空 | 填空输入框 + 判分 |
| `analysis` | 纯文章解析 | 无右栏答题区，只保留正文 + 批注 |

> **解析归属**：所有解析/讲解内容统一放在**中栏批注**中，以箭头的形式写清楚解释。不要把"解析"附在每道题后面。

**批注标记规范**：在正文和题目中，用标记对精确标注每一条批注的关联位置。锚定范围通常是一段短语或从句，而非单个单词。

```
标记格式：
  左栏正文锚点：  [N-left-begin]锚定文字[N-left-end]
  右栏题目锚点：  [N-right-begin]锚定文字[N-right-end]
  N 为批注编号，从 1 开始递增。
```

**【完整示例】Slide 5：答题与批注（single + blank）**

以下示例包含一段较长正文、4 条短语级批注、2 道题。批注内容作为所有题目及正文知识点的统一解析。

```markdown
## Slide 5

### Zone 1（标题栏）
- **状态**：沉浸式逃逸
<!-- 答题与批注组件自动触发沉浸式逃逸，无需手工指定 header-module/header-title -->

### Zone 2（内容区）
- **布局**：`layout-single`

#### 组件 1：quiz-annotation（答题与批注）
- **内容类型**：single + blank

**左栏正文（passage）：**
The Industrial Revolution, which [1-left-begin]began in Britain in the late 18th century[1-left-end], transformed society from an agrarian economy into one dominated by industry and machine manufacturing. Before this transformation, [2-left-begin]most people lived in small villages and worked on farms[2-left-end].

A key factor behind the revolution was the development of new technologies, such as the steam engine and the spinning jenny, which [3-left-begin]allowed goods to be produced on a large scale[3-left-end]. At the same time, the construction of canals and railways made it easier to [4-left-begin]transport raw materials and finished products[4-left-end] across long distances.

**中栏批注（notes）：**
1. **[began in Britain in the late 18th century] → time + place phrase**：时间状语和地点状语的组合使用。注意介词 `in` 在时间和地点前后的搭配。
2. **[most people lived in small villages and worked on farms] → past habit**：描述过去习惯性状态，用一般过去时。`work on farms` 中的 `on` 表示"在农场上工作"。
3. **[allowed goods to be produced on a large scale] → passive + scale phrase**：`to be produced` 是不定式的被动形式。`on a large scale` 意为"大规模地"。
4. **[transport raw materials and finished products] → vocabulary pair**：`raw materials`（原材料）和 `finished products`（成品）是一对反义词组。`transport` 是及物动词，后直接跟宾语。

**右栏答题（answers）：**

第1题 · 阅读单选
题面：[1-right-begin]Where did the Industrial Revolution begin?[1-right-end]
选项：
  A. France
  B. Britain（正解）
  C. America
  D. Germany

第2题 · 阅读填空
题面：[2-right-begin]Before the Industrial Revolution, most people worked on ______ and lived in small villages.[2-right-end]
答案：farms

### 讲者备注
- **title**：工业革命阅读理解
- **script**：我们通过这篇关于工业革命的短文，讲解几个重点语法和词汇点，同时做两道练习巩固。
- **notes**：
  - 第1题通过"时间+地点"短语定位答案 Britain
  - 第2题要求回原文找 farms，呼应批注 2 的 past habit 用法
  - 批注 3、4 不直接对应题目，属于纯文章解析内容
```

> **批注编号规则**：
> - [N-left-begin]...[N-left-end] 必须在**左栏正文**中，锚定范围是短语/从句，不限于单个单词
> - [N-right-begin]...[N-right-end] 必须在**右栏题目**中
> - 同一个 N 的 left 标记和 right 标记**不要求出现在同一行**
> - 如果某条批注只关联左栏正文不关联右栏题目（如纯文章解析），则不写 right 标记
> - 标记的 N 编号与批注列表的编号一一对应
> - **解析/讲解不附在每道题后面**，所有知识点统一放在中栏批注中

**第2题 · 多选**
题面：以下哪些属于交互组件？
选项：
  A. 翻转卡片（正解）
  B. 折叠卡片（正解）
  C. 普通卡片
  D. 时间线
解析：翻转卡片和折叠卡片由运行时管理点击交互。普通卡片和时间线是纯展示组件。

**第3题 · 填空**
题面：Monarch butterflies lay their eggs on ______ plants.
答案：milkweed
解析：帝王蝶只在马利筋（milkweed）上产卵。
```

### 3.4 Zone 3 总结面板

```markdown
### Zone 3（可选）
- 主语是句子的核心成分
- 主语回答"谁"或"什么"
- 每个完整句子必须有主语
```

---

## 四、完整草稿示例

以下是一个包含封面、章节封面、普通页、答题页、封底的完整草稿示例：

```markdown
# 句子成分与结构 — 课件草稿

## Slide 0

### Zone 1
- **状态**：沉浸式逃逸

### Zone 2
- **布局**：`layout-title`

#### 组件 1：title-hero（封面组）
- **位置**：居中
- **学科名**：高中英语
- **课件标题**：句子成分与结构
- **分割线**：有
- **讲师信息**：张老师

### 讲者备注
- **title**：封面
- **script**：欢迎大家，今天我们来系统学习英语的句子成分与结构。
- **notes**：
  - 本课涵盖主语、谓语、宾语、表语、定语、状语、补语七大成分
  - 配套阅读理解练习

---

## Slide 1

### Zone 1
- **状态**：沉浸式逃逸

### Zone 2
- **布局**：`layout-title`

#### 组件 1：chapter-hero（章节封面）
- **位置**：居中
- **章节序号**：模块一
- **章节标题**：句子成分与结构

### 讲者备注
- **title**：章节封面
- **script**：先来看模块一，我们学习句子成分的基本概念。
- **notes**：
  - 七大成分概览
  - 主干成分 vs 修饰成分

---

## Slide 2

### Zone 1
- **状态**：正常
- **header-module**：模块一 句子成分 / 主语
- **header-title**：主语的定义与识别

### Zone 2
- **布局**：`layout-2col`

#### 组件 1：content-block（内容块）
- **位置**：左栏
- **正文**：主语是句子的主体，表示句子描述的是"谁"或"什么"。主语通常由名词、代词、动名词或名词性从句担任。
- **重点内容（callout）**：找到动词，问"谁/什么"发出了这个动作，就能找到主语。

#### 组件 2：card（普通卡片）
- **位置**：右栏
- **图标**：💡
- **标题**：例句
- **描述**：
  1. **Tom** likes apples.（名词作主语）
  2. **She** is a teacher.（代词作主语）
  3. **Swimming** is fun.（动名词作主语）

### Zone 3（可选）
- 主语定义：句子陈述的对象
- 识别方法：先找动词，再问"谁/什么"
- 常见形式：名词、代词、动名词、从句

### 讲者备注
- **title**：主语的定义与识别
- **script**：我们先看主语。主语是句子最重要的主干成分之一，大家记住一个口诀——先找动词，再问谁。
- **notes**：
  - 三个例句分别展示三种主语形式
  - 强调动名词作主语的用法（易错点）

---

## Slide 5

### Zone 1
- **状态**：沉浸式逃逸

### Zone 2
- **布局**：`layout-single`

#### 组件 1：quiz-annotation（答题与批注）
- **内容类型**：single + blank

**左栏正文（passage）：**
The Industrial Revolution, which [1-left-begin]began in Britain in the late 18th century[1-left-end], transformed society from an agrarian economy into one dominated by industry. Before this, [2-left-begin]most people lived in small villages and worked on farms[2-left-end].

**中栏批注（notes）：**
1. **[began in Britain in the late 18th century] → time + place phrase**：时间状语和地点状语的组合使用，注意两个 `in` 的搭配。
2. **[most people lived in small villages and worked on farms] → past habit**：用一般过去时描述过去的习惯性状态。

**右栏答题（answers）：**

第1题 · 阅读单选
题面：[1-right-begin]Where did the Industrial Revolution begin?[1-right-end]
选项：
  A. France
  B. Britain（正解）
  C. America
  D. Germany

第2题 · 阅读填空
题面：[2-right-begin]Before the Industrial Revolution, most people worked on ______.[2-right-end]
答案：farms

### 讲者备注
- **title**：工业革命阅读理解
- **script**：我们来看一篇关于工业革命的短文，通过例题巩固两个语法点。
- **notes**：
  - 第1题通过时间地点短语定位 Britain
  - 第2题回原文找 farms
  - 所有解析内容统一在中间栏的批注中

---

## Slide 8

### Zone 1
- **状态**：沉浸式逃逸

### Zone 2
- **布局**：`layout-title`

#### 组件 1：ending-quote（封底鸡汤）
- **位置**：居中
- **英文**：Education is not the filling of a pail, but the lighting of a fire.
- **中文**：教育不是灌满一桶水，而是点燃一把火。
- **出处**：—— 威廉·巴特勒·叶芝

### 讲者备注
- **title**：结语
- **script**：感谢大家，记住教育是点燃一把火，而不只是灌满一桶水。
- **notes**：
  - 叶芝名言，与教育主题呼应
```

---

## 五、审查修改流程

### 5.1 生成

AI 按本指南格式生成完整草稿，写入 `课件/<课件名>/draft-<课件名>.md`。

### 5.2 用户审查

用户阅读草稿后，可以提出以下类型的修改：

| 修改类型 | 示例话术 |
|---------|---------|
| 拆分/合并页面 | "Slide 2 内容太多，拆成两页" |
| 修改布局 | "Slide 3 改成双栏对比" |
| 更换组件 | "Slide 4 的 card 换成 flip-card" |
| 修改文本 | "Slide 2 的正文第三句改成……" |
| 增加 Zone 3 | "Slide 2 加上总结面板" |
| 调整批注 | "第 1 条批注的锚点位置不对，应该关联到……" |
| 删除/新增页面 | "在章节封面后面加一页学习目标概览" |

### 5.3 定稿

用户确认草稿无误后，AI 进入 Phase 5（课件生成），将草稿转化为包含完整 CSS/JS 引用的 HTML 文件。

### 5.4 草稿与 HTML 的对应关系

| 草稿字段 | 最终 HTML |
|---------|----------|
| Slide N | `<div class="slide" data-slide="N">` |
| Zone 1 状态 | `沉浸式逃逸` → `:has()` 隐藏标题栏 |
| header-module | `.header-module` 的 innerHTML |
| header-title | `.header-title` 的 innerHTML |
| 布局 | `slide-content` 上的 `layout-[MODE]` 类 |
| 组件字段 | 对应组件的 DOM 子元素 |
| 批注 [N-left-begin]...[N-left-end] | 左栏正文锚点 span |
| 批注 [N-right-begin]...[N-right-end] | 右栏题目锚点 span |
| 讲者备注 | `<script class="slide-notes">` JSON 块 |
