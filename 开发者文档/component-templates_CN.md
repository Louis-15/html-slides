# 组件造型与排版准则手册 (Component Style Reference)

> **架构更新 (2026-04)**：组件系统已完成三区模块化拆分。

## 三区模块化架构

所有组件按照画布位置归类为三个区域，CSS 分别存放在独立文件中：

| Zone | 名称 | CSS 文件 | 内容 |
|------|------|---------|------|
| **Zone 1** | 标题栏 | `assets/zones/zone1-header.css` | `.slide-header` 及其变体（当前：`banner` 横幅式） |
| **Zone 2** | 内容区 | `assets/zones/zone2-content.css` | 8 种布局模式 + 16 个交互/展示组件 |
| **Zone 3** | 总结面板 | `assets/zones/zone3-summary.css` | `.summary-trigger` 弹出式总结面板 |
| **共享** | 基础 | `assets/components.css` | Reset、粒子、Chrome 装饰、排版原子类、glow blobs、动画关键帧 |

**变体切换**：Zone 1 组件通过显式 CSS class 选择变体（如 `<div class="slide-header banner">`）。`slides-runtime.js` 会自动检测未指定变体的元素并补上默认 class。

**配色机制**：主题文件（`assets/themes/*.css`）提供种子变量（`--brand-primary` 等），组件内部自动衍生全部色彩。主题可选择性覆盖特定变量进行精细调教。

---

这里收录了那些能够做到预装拼搭、即刻拷贝、随时运转的 HTML/CSS 标准部件。这些模式的作用在于保证**排版的惊艳与制式的绝对一致性**——它们不是简单的选择清单，而是构建世界观的基石砖块。

## 如何拿这一本手册去实战

每一张幻灯片的设计都只能为了它承载的“内容”本身服务。当你面临对应的数据表达诉求时，就从下方的标准形态中抽调一套方案应用去维持全局制式一致性。当然，这里**绝不是你在创造力上的枷锁天花板**——遇到无法包容的特殊结构展现，你可以完全手写自定义前卫的 HTML/CSS 结构！

---

## 骨干 HTML 形态版式模板

### 秘密机制: 讲稿备忘录提词器 (Speaker Notes)

每一页生成的系统之中**强制且必须**包含一个作为压舱石的 `<script class="slide-notes">` 标签。对于观众来说它是不可见的隐藏暗室，但是在演讲者切页时，浏览器的后台控制台却会立刻将提词数据高亮刷出。

```html
<div class="slide" data-slide="[当前页序列N]">
  <!-- 能够被肉眼观测的宏图版式写在这里 -->
  <script type="application/json" class="slide-notes">
  {"title":"[用来在后台显示的主标题]","script":"[非常拟人化可以供主讲人照着念的讲稿台词]","notes":["[关键点备忘1]","[关键点备忘2]"]}
  </script>
</div>
```
所有的备注 JSON 数据块必须放置在每一个 `<div class="slide">` 内部容器封闭前的**最后一行底层子元素中**。它是不可见幽灵，但极为致命有效。

---

### 1. 首页破冰舰 (Title Slide)

拥有绝对尺寸的超大冲击力文本、彩虹霓虹切割流横幅、游弋环境的光晕背景水母，共同组成的起手大招版式。

```html
<div class="slide active" data-slide="0">
  <div class="glow-blob glow-blue" style="top:-100px;left:-100px;"></div>
  <div class="glow-blob glow-purple" style="bottom:-120px;right:-80px;"></div>
  <p class="slide-tag anim-1">[高管级专属引述/专有分类前缀]</p>
  <h1 class="anim-2">[排版大文案首行]<br>[第二行排布]<br><span class="rainbow-text">[拥有绚丽反光的高亮文眼]</span> [可能存在的补充]</h1>
  <p class="subtitle anim-3">[副标题定调]</p>
  <div class="rainbow-line anim-4"></div>
  <p class="subtitle anim-5" style="font-size:14px;margin-top:8px;">演讲者： <strong>[报告人/单位]</strong></p>
  <script type="application/json" class="slide-notes">
  {"title":"[TITLE]","script":"[PRESENTER_SCRIPT]","notes":["[NOTE_1]"]}
  </script>
</div>
```
**什么时候必须上这套板子**：无论怎么变化，这是毫无争议的首席开天辟地第一页。

### 2. 重磅断言陈述板 (Statement Slide)

只强调一句话重量感。巨大无比的文字、单图或深邃的模糊紫光渲染背景、配合短小精悍的陈词。

```html
<div class="slide" data-slide="[N]">
  <div class="glow-blob glow-purple" style="top:50%;left:50%;transform:translate(-50%,-50%);"></div>
  <p class="slide-tag anim-1">[分类抬头]</p>
  <h1 class="anim-2" style="font-size:clamp(32px,4.5vw,56px);">[不容争辩的断言文句]<br><span class="highlight-[对应色系]">[关键核心动词/名词]</span></h1>
  <div class="rainbow-line anim-3"></div>
  <p class="subtitle anim-4">[佐证文字与数据支撑]</p>
</div>
```
**使用场景**：吸睛钩子页、问题引出揭秘、发布会终局大杀器、不可或缺的核心数据定调。

### 3. 可翻转互动记忆卡片 (Flip Cards 2x2 Grid)

将知识封装成四组具有正反面解谜机制的游戏式交互牌。点击正面则伴随着平滑深翻阅显现底部的解读内容。
**操作手红线警示**: `bounce-N`（动画弹出节奏轴）必须绑架在 `.flip-bounce-wrap` 包装层上，**绝对禁止**直接覆盖在带有 `transform` 动态翻转特性的本体 `.flip-card` 上！那只会导致动效相互咬死毁灭！

```html
<div class="slide" data-slide="[N]">
  <h2 class="anim-1">[主标题] <span class="highlight-[对应色系]">[高亮截断点]</span></h2>
  <p class="subtitle anim-2" style="font-size:15px;">点击卡片可进行翻转，揭秘背后细节</p>
  <div class="flip-grid anim-3">
    <!-- 包层开始 -->
    <div class="flip-bounce-wrap bounce-1">
      <div class="flip-card" onclick="this.classList.toggle('flipped')">
        <div class="flip-front border-[对应色系]">
          <div class="flip-icon">[引出感EMOJI标识]</div>
          <div class="flip-title">[这道选择题的明面悬疑/现象]</div>
          <div class="flip-subtitle highlight-[对应色系]">[简短引诱语]</div>
          <div class="flip-hint">点我可翻页</div>
        </div>
        <div class="flip-back">
          <div class="flip-icon-big">[解答EMOJI]</div>
          <div class="flip-detail">[背面详解附带着 <strong>可以被加粗强调的</strong> 内容呈现！]</div>
        </div>
      </div>
    </div>
    <!-- 第二至第四张复制并在包层挂载 bounce-2, bounce-3, bounce-4 -->
  </div>
</div>
```
**适用情场**：介绍相互挂钩的4个法则、提出痛点现象及解答对比等。

### 4. 左右双核对比阵列 (VS / Comparison Cards)

势同水火的一左一右两张版图。中央具有极具呼吸节奏感的 `+`（或 vs）霓虹发光节点隔空对冲连接。

```html
<!-- 核心左右分岔对撞结构 -->
<div class="vs-container anim-3">
  <!-- 左卡片阵列进场 -->
  <div class="vs-card card-left slide-l">
    <div class="vs-label-top highlight-purple">[左营名号]</div>
    <div class="vs-name highlight-purple">[左岸本体]</div>
    <div class="vs-desc">[左侧特征属性等]</div>
    <div class="vs-badge">[盖章或特性描述符]</div>
  </div>
  <div class="vs-plus anim-3">+ 或者 VS</div>
  <!-- 右卡片阵列进场 -->
  <div class="vs-card card-right slide-r">
    <div class="vs-label-top highlight-blue">[右营名号]</div>
    <div class="vs-name gradient-text">[右岸本体长相]</div>
    <div class="vs-desc">[对方技能特性等]</div>
    <div class="vs-badge">[盖章或特性描述符]</div>
  </div>
</div>
```
**何时拔枪**：前后版本更迭升级换轨、两种相悖思想打擂、竞品互掐解析专用图。

### 5. 架构数据传导流 (Architecture Flow)

像是在空间站大屏里绘制那种三个节点组成的生产流向系统。各个黑盒节点之间有长距能量光标与说明流转互文互锁。

```html
<div class="arch-flow anim-3">
  <!-- 节点1 -->
  <div class="arch-box box-blue bounce-1">
    <div class="arch-icon">[大图标]</div>
    <div class="arch-label text-blue">[环节1名分]</div>
    <div class="arch-role">[所担任的组件职能]</div>
    <div class="arch-detail">[细碎工作报文参数等]</div>
  </div>
  <!-- 流连接导引指示器 -->
  <div class="arch-arrow anim-3">
    <span>[该环节通过什么手法流转给下文]</span>
    <div class="arrow-line"></div>
  </div>
  <!-- 节点2及节点3 按照颜色 box-yellow / text-yellow ... 持续串联构建 -->
</div>
```
**适用解局**：数据管道走向图、三大业务闭环处理分析、甚至某种进阶制程逻辑梳理。

### 6. 极客高配终端窗口 (Code Block)

具有苹果级 macOS 三色圆点，搭配 One Dark Pro 解析级别黑底深邃沉浸高光语法终端外卖窗。

```html
<!-- 骨架构造 -->
<div class="code-window anim-3">
  <div class="code-titlebar">
    <div class="code-dot red"></div><div class="code-dot yellow"></div><div class="code-dot green"></div>
    <span class="code-filename">[当前文件路径或类型后缀如 main.py]</span>
  </div>
  <div class="code-body">
<!-- 注意这里不允许格式化折叠，只能逐行！请自行运用底层提供好的类名高亮咒语 -->
<span class="ln">1</span><span class="kw">function</span> <span class="fn">invokeGod</span><span class="punc">(</span><span class="punc">)</span> <span class="punc">{</span>
<span class="ln">2</span>  <span class="kw">return</span> <span class="str">"Hello Cosmos!"</span>
  </div>
</div>
```
配合文末详细【法师高亮咒语表】服用。适用于大段展现令人窒息的高深技术代码！

### 7. 对阵审判真伪两面屏 (Auth Flip Compare)

结合左右抗衡对冲以及双面翻转的集大成者玩法。用来断正误、判优劣的绝杀互动版式！红光交叉伴着绿光复苏。

```html
<div class="auth-compare anim-3">
  <!-- 左边错误方代表包装层 -->
  <div class="auth-flip-wrap slide-l">
    <div class="auth-flip" onclick="...'>
      <!-- 带有 bad 红光审判属性正面 -->
      <div class="auth-front bad">
        <div class="auth-name">[过去的老办法]</div>
        <div class="auth-status">&#10060;</div>
      </div>
      <!-- 背面详解死因 -->
      ...
    </div>
  </div>
  <div class="auth-vs">vs</div>
  <!-- 右侧光照天启拯救方 (good属性) -->
  <div class="auth-flip-wrap slide-r">...</div>
</div>
```

### 8. 大盘压倒性数据展览台 (Stats Cards)

纯粹去炫耀或者展现极端冲击力巨型数值结果的排版方式，三组独立回弹特效卡支撑。

```html
<div class="stats-row">
  <div class="stat-card pop-1">
    <div class="stat-number blue">[数值1]<span style="font-size:0.45em;">[单位如 % 或 倍]</span></div>
    <div class="stat-label">[什么数据]</div><div class="stat-desc">[详情解构]</div>
  </div>
  <!-- pop-2, pop-3 ...以绿橙不同数字上阵 -->
</div>
```

### 9. 可折叠拓展探索网格 (Expandable Cards 2x2)

表面云淡风轻四个模块，用户鼠标只要一点其中一张，即刻爆衣展露内部巨量的探索文细节机制，四组皆可随意点击折叠伸缩。

```html
<div class="use-case-grid anim-3">
  <div class="card-v2 glow-orange bounce-1" onclick="this.classList.toggle('expanded')">
    <div class="card-title">[面相大标题]</div>
    <div class="card-expand"><div class="card-expand-inner">[你平时不愿意全漏出来塞场面，但是点击后徐徐展示在下部的万字长文解说]</div></div>
    <div class="expand-hint">&#9660; 下坠点击按钮</div>
  </div>
</div>
```

### 10. 物流级里程碑时间线推进器 (Status Timeline)

从天垂到地的纵列节点流星雨打卡点。每个都有各种颜色（`green`完工 `yellow`进程中 `orange`预警 `red`受困死结）发光点进行标亮装点。

### 11. 终极留存率呼喊台 (CTA Box - Call to Action)

总是把它塞在报告会的绝对最后一张大幕落下。它带有一种终极诱惑导流面板属性，列满可供他们拿去研读的相关大区文档路径或超链接。

### 12. 会装神弄鬼的高端 JS原生大盘绘图仪 (Chart 组件)

这是一把神器组件，彻底丢弃截小图片的陋习。依托内嵌强大的 `Chart.js`，通过你传达特定的 JSON 参数让它在呈现页上自己当场利用硬件加速把复杂的可交互性雷达线图、气泡折扇画出来！
**先决解命题：一旦使用，页面绝对必须要在头部打上 `Chart.js` CDN 解除封印！**

```html
<!-- 必须在绘图页面或者全局注入库 -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.8/dist/chart.umd.min.js"></script>

<div class="chart-container anim-3">
  <canvas id="chart-唯一编号"></canvas>
  <script type="application/json" data-chart-config="chart-唯一编号">
  {
    "type": "bar/line/pie/doughnut/radar(看你心情使用)",
    "data": {
      "labels": ["一月", "二月", "第三发"],
      "datasets": [{
        "label": "项目完成热度值",
        "data": [90, 1500, 480]
      }]
    }
  }
  </script>
</div>
```
*温馨图纸设计法案*：如果是处理饼图、雷达图等圆形占地面的特装图，一定要将其外壳带上 `.chart-square` 类以维持矩形完美平衡。且此图表会随着本报告基调的颜色库自动抓取皮肤色彩（即它聪明到能够随着你把页面切成不同主题模式自适应！）。

### 13. 深渊探索表格 (Styled Table)

控制在此 5列x6行 的极限承压范围体系内的高端清冷风表格。自带 `hover` 每行的光点跟随效果。对于首列重要属性可用 `class="cell-highlight"` 特殊强化，使其在数据洋流中发光。

### 14. 极富画面张力欣赏画框 (Image Slide / Pure Media)

有的时候文字显得过分苍白，需要用到纯然的高清艺术化插图、界面截图抑或是客户的 Logo 时，使用这个容器进行优雅挂放。它不是随随便便贴图，能提供环境光遮蔽防震防崩。

它有三种子进阶流派变形：
1. **界面截图框裱 (`image-screenshot`)**：产品图有边框护体；
2. **LOGO聚光灯微距 (`image-logo`)**：放缩压制徽章或者人名大头贴；
3. **全图无尽出血吞噬模式 (`image-fullbleed` 搭配 `.slide内含去掉padding`)**：这才是最震撼的使用图片铺满全整个投影仪去压迫观众，文字悬浮层叠 `image-overlay`。

> 必须杜绝使用超大 Base64！如果你有图，传进来复制进 `assets/` 后用合法地址索引去渲染它。

---

## 宇宙本源级底层挂件 (Chrome Elements)

这是脱离于单张幻灯片之外的绝对存在。它被凌驾丢在 `<body>` 最前面（也就是未进入正式的 `.deck` 切页模块内！）。
它们肩负了页面深空随处游弋的发光粒子（`#particles`），公司品牌标记（`.branding`），进度滑行条（`.progress-bar`）以及下角按键操作指南光晕（`.nav-hints`）。它们构成了这个宇宙的高级生命感。

---

## 法师高亮词法咒语表 (Syntax Highlighting Guide)

给代码框打上对应 class ，激活专属特定代码暗语光辉。
- `.tag` : 标签骨架构件 (红宝石色)
- `.attr` : 参数及属性定义 (暖阳亮色)
- `.str` : 字符串原液呈现 (嫩芽绿)
- `.kw` : 能够主宰逻辑生死的神级关键字(如 `const`, `return`,紫电法调)
- `.fn` : 函数招式攻击名 (水魔天蓝)
- `.prop`: 本体变量持有者 (黄金果实色)
- `.punc`: 各类花括号逗号算子的锁扣件 (青琉璃)
- `.comment`: 全斜体防沉寂的注释讲解符 (虚空死灰)

---

## 动效图鉴及施法吟唱时序 (Animation / Color Patterns)

不要试图一次爆发或者胡塞。按预设时序延迟分层触发是制造空间纵深体验的不二法门：

**动画流体系进场轴法：**
- `anim-1` (淡入上切) -> `0.1s`: 通常第一步交由副标题或标签热身。
- `anim-2` (淡入上切) -> `0.25s`: 主标题如雷霆出水霸占视野。
- `anim-3` (软糯回弹放大) -> `0.35s`: 主体图阵或者主内容体如巨幕般舒展开来。
- `anim-4` ~ `anim-5` 等最后进行底层补充和归因。
注意各种卡片阵列则走 `bounce-1` 等连贯序列引发多米诺式弹出！

**色系轮回学说守恒定律 (Color Accent Base)：**
文本高光(`highlight-*`)、组件阵列光污染(`box-blue`, `text-green`)、发光胶体背景池(`glow-purple`)... 都请严格从我们的极客五行色谱中去挑拣提取（蓝、绿、橙、红、紫、黄、另加一个特殊技彩虹 `rainbow/gradient-text`）。但谨记：无论用哪种色彩，在翻越连续幻灯片时应呈现色彩跳跃流动体系，绝不要连续两页在同个位置全盘皆使用同一个主打颜色（令人视觉疲倦的愚蠢色彩停滞）。

---

## 兜底图文大杀器 (Content Block Component 15)

当你翻完字典发现，“糟糕！我要说的话好像套不上这些高深的组件框架啊！” 别慌。这里有万金油兜底图册版式，被切割成4种子类型任由调用。

1. **绝对真理白板 (Statement/Default 15a)** -> 当你不知所措时的最后通牒。极易上手的主标题+正文文本框双剑合璧。一切图文排版的初恋起点。
2. **带有编号的图文印刻 (Numbered 15b)** -> 自带大型编号。如果你在演讲《避免翻车的七个定律》，请毫不留情地连写七张这种带序号递增印章的大标题排版片。
3. **病灶对冲双色卡 (Problem / Fix 15c)** -> 左边陈列一个大坑（深坑红区预警），右侧提供破局之路（蓝光神清气爽区）。用于抛出问题直指痛点、而后给用户开方喂药的推销绝佳阵型。
4. **单骑救主箴言壁 (Key Point 15d)** -> 版面清空只留下一句能钉进用户心脏的加粗大字断代文（比如配合巨大的左侧描边竖线引用体 `blockquote`）。适合极度庄严、高调提纯后的一击必杀。
