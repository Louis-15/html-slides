# Example Card Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 html-slides 中落地一个全新的单栏例题组件首版，先完成截图对应的核心体验：提交前选择态、提交后判分态、解析展开态、编辑态正确答案切换。

**Architecture:** 组件采用独立的 `.example-card` 根节点与最小运行时，不接入旧的步进、sidecar 与富文本激活链路。运行时以 `WeakMap<HTMLElement, State>` 维护每张卡片实例状态，视觉层只定向复用 `.qa-option` 微结构与 quiz 的成熟状态类语义。

**Tech Stack:** 原生 HTML / CSS / JavaScript、`AudioRuntime` 全局 cue 总线、`editor-core` / `editor-utils` 既有编辑系统、Node.js `--test` + jsdom。

**执行约束补充：** 本计划刻意省略 git commit 步骤，因为当前用户没有授权提交 commit；每个任务以测试或人工 checkpoint 作为收口。

---

## 文件地图

### 新建文件

- `assets/zones/zone2-example-card.css`
- `assets/example-card-runtime.js`
- `assets/example-card-audio.js`
- `assets/example-card-demo.html`
- `testing/tests/example-card-runtime.test.js`

### 修改文件

- `assets/audio-runtime.js`
- `testing/tests/audio-runtime.test.js`

### 本轮明确不动

- `assets/slides-runtime.js`
- `assets/annotation-store.js`
- `assets/editor-core.js`
- `assets/editor-utils.js`

### 关键实现约束

1. 只靠 `data-edit-id` 接入已有编辑系统，不为 `.example-card` 新开一套编辑器底座。
2. 选择题继续使用 `.qa-option`、`.qa-option-label`、`.qa-option-text` 微结构，避免在文本编辑与样式复用上重新踩坑。
3. 填空题本轮只做“提交后 reveal 正确答案”，不引入学生输入、不引入对错音效。
4. 解析区只有在提交后才能展开，展开宽度必须是左 5 右 3。
5. 运行时代码、状态判断、编辑态分支都必须带详细中文注释，说明为什么这样设计，而不是只描述表面行为。

## Task 1: 建立例题组件红灯测试与最小选择态运行时

**Files:**
- Create: `testing/tests/example-card-runtime.test.js`
- Create: `assets/example-card-runtime.js`

- [ ] **Step 1: 写第一个 failing test，先锁住“单选题提交前只允许一个选项进入 selected”**

在 `testing/tests/example-card-runtime.test.js` 先写最小 harness 与第一条行为测试。这里故意直接读取未来的 `assets/example-card-runtime.js`，让第一次运行以“文件不存在 / API 不存在”的方式红灯，证明测试确实卡在新能力缺失上。

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..', '..');
const runtimePath = path.join(projectRoot, 'assets', 'example-card-runtime.js');

function createExampleCardDom(bodyHtml) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${bodyHtml}</body></html>`, {
    runScripts: 'outside-only',
    url: 'http://localhost/'
  });
  const runtimeSource = fs.readFileSync(runtimePath, 'utf-8');
  dom.window.eval(runtimeSource);
  dom.window.ExampleCardRuntime.initAll();
  return dom;
}

describe('example-card runtime', () => {
  it('keeps exactly one selected option before submit for single questions', () => {
    const dom = createExampleCardDom(`
      <section class="example-card" data-question-type="single">
        <div class="example-card__main">
          <div class="example-card__answers">
            <button type="button" class="qa-option example-card__option" data-option-value="A">
              <span class="qa-option-label">A</span>
              <span class="qa-option-text" data-edit-id="q1-a">Alpha</span>
            </button>
            <button type="button" class="qa-option example-card__option" data-option-value="B" data-correct="true">
              <span class="qa-option-label">B</span>
              <span class="qa-option-text" data-edit-id="q1-b">Beta</span>
            </button>
          </div>
          <div class="example-card__actions">
            <button type="button" class="example-card__analysis-toggle" disabled>查看解析</button>
            <button type="button" class="example-card__submit-btn">提交答案</button>
          </div>
        </div>
        <aside class="example-card__analysis" hidden></aside>
      </section>
    `);

    const { document } = dom.window;
    const optionA = document.querySelector('[data-option-value="A"]');
    const optionB = document.querySelector('[data-option-value="B"]');

    optionA.click();
    optionB.click();

    assert.equal(optionA.classList.contains('selected'), false);
    assert.equal(optionB.classList.contains('selected'), true);
  });
});
```

- [ ] **Step 2: 跑红灯，确认失败原因指向“新运行时缺失”**

Run: `Set-Location d:/Projects/html-slides/testing; node --test tests/example-card-runtime.test.js`

Expected: FAIL，原因是 `assets/example-card-runtime.js` 不存在，或 `window.ExampleCardRuntime.initAll` 未定义。

- [ ] **Step 3: 写最小运行时骨架，只让第一条测试转绿**

在 `assets/example-card-runtime.js` 先只实现三件事：自动初始化、单选题点击逻辑、`selected` 类渲染。暂时不要引入提交判分、音效、编辑态答案键。

```js
(function initExampleCardRuntime() {
  if (window.ExampleCardRuntime) return;

  const CARD_SELECTOR = '.example-card';
  const OPTION_SELECTOR = '.example-card__option';
  const stateMap = new WeakMap();

  function ensureState(root) {
    if (!stateMap.has(root)) {
      stateMap.set(root, {
        questionType: root.getAttribute('data-question-type') || 'single',
        selectedValues: [],
        correctValues: [],
        submitted: false,
        isCorrect: null,
        analysisExpanded: false
      });
    }
    return stateMap.get(root);
  }

  function renderSelection(root) {
    const state = ensureState(root);
    root.querySelectorAll(OPTION_SELECTOR).forEach((option) => {
      const value = option.getAttribute('data-option-value') || '';
      option.classList.toggle('selected', state.selectedValues.includes(value));
    });
  }

  function handleOptionClick(option) {
    const root = option.closest(CARD_SELECTOR);
    if (!root) return;
    const state = ensureState(root);
    if (state.submitted) return;

    const value = option.getAttribute('data-option-value') || '';
    if (state.questionType === 'multiple') {
      state.selectedValues = state.selectedValues.includes(value)
        ? state.selectedValues.filter((item) => item !== value)
        : state.selectedValues.concat(value);
    } else {
      state.selectedValues = value ? [value] : [];
    }

    renderSelection(root);
  }

  function initCard(root) {
    ensureState(root);
    renderSelection(root);
  }

  function initAll(scope = document) {
    scope.querySelectorAll(CARD_SELECTOR).forEach(initCard);
  }

  document.addEventListener('click', (event) => {
    const option = event.target.closest(OPTION_SELECTOR);
    if (option) handleOptionClick(option);
  });

  window.ExampleCardRuntime = { initAll, initCard };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initAll());
  } else {
    initAll();
  }
})();
```

- [ ] **Step 4: 重新跑同一条测试，确认最小选择态已经转绿**

Run: `Set-Location d:/Projects/html-slides/testing; node --test tests/example-card-runtime.test.js`

Expected: PASS，且只有“单选题提交前只保留一个 selected”这条行为被覆盖，不要顺手实现提交判分。

## Task 2: 用 TDD 补齐提交判分与解析展开锁

**Files:**
- Modify: `testing/tests/example-card-runtime.test.js`
- Modify: `assets/example-card-runtime.js`

- [ ] **Step 1: 增加两条 failing tests，分别卡住“提交后判分”和“提交后才允许展开解析”**

把下面两条测试追加到 `testing/tests/example-card-runtime.test.js`。不要删前一条选择态测试。

```js
it('marks wrong choice red, correct choice green, and enables analysis after submit', () => {
  const dom = createExampleCardDom(`
    <section class="example-card" data-question-type="single">
      <div class="example-card__main">
        <div class="example-card__answers">
          <button type="button" class="qa-option example-card__option" data-option-value="A">
            <span class="qa-option-label">A</span>
            <span class="qa-option-text" data-edit-id="q2-a">Alpha</span>
          </button>
          <button type="button" class="qa-option example-card__option" data-option-value="B" data-correct="true">
            <span class="qa-option-label">B</span>
            <span class="qa-option-text" data-edit-id="q2-b">Beta</span>
          </button>
        </div>
        <div class="example-card__actions">
          <button type="button" class="example-card__analysis-toggle" disabled>查看解析</button>
          <button type="button" class="example-card__submit-btn">提交答案</button>
        </div>
      </div>
      <aside class="example-card__analysis" hidden></aside>
    </section>
  `);

  const { document } = dom.window;
  const optionA = document.querySelector('[data-option-value="A"]');
  const optionB = document.querySelector('[data-option-value="B"]');
  const submitBtn = document.querySelector('.example-card__submit-btn');
  const analysisBtn = document.querySelector('.example-card__analysis-toggle');

  optionA.click();
  submitBtn.click();

  assert.equal(optionA.classList.contains('result-incorrect'), true);
  assert.equal(optionB.classList.contains('result-correct'), true);
  assert.equal(analysisBtn.disabled, false);
});

it('keeps analysis hidden before submit and opens it only after submit', () => {
  const dom = createExampleCardDom(`
    <section class="example-card" data-question-type="single">
      <div class="example-card__main">
        <div class="example-card__answers">
          <button type="button" class="qa-option example-card__option" data-option-value="A" data-correct="true">
            <span class="qa-option-label">A</span>
            <span class="qa-option-text" data-edit-id="q3-a">Alpha</span>
          </button>
        </div>
        <div class="example-card__actions">
          <button type="button" class="example-card__analysis-toggle" disabled>查看解析</button>
          <button type="button" class="example-card__submit-btn">提交答案</button>
        </div>
      </div>
      <aside class="example-card__analysis" hidden>
        <div class="example-card__analysis-body" data-edit-id="q3-analysis">解析</div>
      </aside>
    </section>
  `);

  const { document } = dom.window;
  const optionA = document.querySelector('[data-option-value="A"]');
  const submitBtn = document.querySelector('.example-card__submit-btn');
  const analysisBtn = document.querySelector('.example-card__analysis-toggle');
  const analysis = document.querySelector('.example-card__analysis');

  analysisBtn.click();
  assert.equal(analysis.hidden, true);

  optionA.click();
  submitBtn.click();
  analysisBtn.click();

  assert.equal(analysis.hidden, false);
  assert.equal(document.querySelector('.example-card').classList.contains('is-analysis-open'), true);
});
```

- [ ] **Step 2: 跑红灯，确认失败点集中在缺少 submit / analysis toggle 逻辑**

Run: `Set-Location d:/Projects/html-slides/testing; node --test tests/example-card-runtime.test.js`

Expected: FAIL，断言会落在缺少 `result-correct` / `result-incorrect` 类，或解析按钮仍然不可用。

- [ ] **Step 3: 在运行时中只补本任务需要的最小提交与展开逻辑**

扩展 `assets/example-card-runtime.js`，加入正确答案收集、提交渲染、解析按钮状态切换。不要在这一任务引入编辑态答案键或音效。

```js
function collectCorrectValues(root) {
  return Array.from(root.querySelectorAll(OPTION_SELECTOR))
    .filter((option) => option.hasAttribute('data-correct'))
    .map((option) => option.getAttribute('data-option-value') || '')
    .filter(Boolean);
}

function arraysEqual(left, right) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function renderSubmission(root) {
  const state = ensureState(root);
  const analysisToggle = root.querySelector('.example-card__analysis-toggle');
  const submitBtn = root.querySelector('.example-card__submit-btn');

  root.classList.toggle('is-submitted', state.submitted);
  if (analysisToggle) analysisToggle.disabled = !state.submitted;
  if (submitBtn) submitBtn.disabled = state.submitted;

  root.querySelectorAll(OPTION_SELECTOR).forEach((option) => {
    const value = option.getAttribute('data-option-value') || '';
    const isSelected = state.selectedValues.includes(value);
    const isCorrect = state.correctValues.includes(value);
    option.classList.toggle('result-correct', state.submitted && isCorrect);
    option.classList.toggle('result-incorrect', state.submitted && isSelected && !isCorrect);
  });
}

function submitCard(root) {
  const state = ensureState(root);
  state.correctValues = collectCorrectValues(root).sort();
  state.selectedValues = state.selectedValues.slice().sort();
  state.submitted = true;
  state.isCorrect = arraysEqual(state.selectedValues, state.correctValues);
  renderSelection(root);
  renderSubmission(root);
}

function toggleAnalysis(root) {
  const state = ensureState(root);
  if (!state.submitted) return;
  const panel = root.querySelector('.example-card__analysis');
  if (!panel) return;
  state.analysisExpanded = !state.analysisExpanded;
  panel.hidden = !state.analysisExpanded;
  root.classList.toggle('is-analysis-open', state.analysisExpanded);
}

document.addEventListener('click', (event) => {
  const submitBtn = event.target.closest('.example-card__submit-btn');
  if (submitBtn) {
    const root = submitBtn.closest(CARD_SELECTOR);
    if (root) submitCard(root);
    return;
  }

  const analysisBtn = event.target.closest('.example-card__analysis-toggle');
  if (analysisBtn) {
    const root = analysisBtn.closest(CARD_SELECTOR);
    if (root) toggleAnalysis(root);
    return;
  }

  const option = event.target.closest(OPTION_SELECTOR);
  if (option) handleOptionClick(option);
});
```

- [ ] **Step 4: 重跑 focused tests，确认只为当前切片补到刚好通过**

Run: `Set-Location d:/Projects/html-slides/testing; node --test tests/example-card-runtime.test.js`

Expected: PASS，三条测试都转绿；实现里仍然没有答案键、blank reveal 与音效调用。

## Task 3: 补齐编辑态答案键与填空题 reveal

**Files:**
- Modify: `testing/tests/example-card-runtime.test.js`
- Modify: `assets/example-card-runtime.js`

- [ ] **Step 1: 先写两条 failing tests，分别卡住“编辑态切正确答案”和“填空题提交 reveal”**

继续追加下面两条测试：

```js
it('updates the correct option from the editor answer key strip', () => {
  const dom = createExampleCardDom(`
    <section class="example-card" data-question-type="single">
      <div class="example-card__main">
        <div class="example-card__editor-answer-key" data-editor-only="true">
          <button type="button" class="example-card__answer-key is-active" data-answer-value="A">A</button>
          <button type="button" class="example-card__answer-key" data-answer-value="B">B</button>
        </div>
        <div class="example-card__answers">
          <button type="button" class="qa-option example-card__option" data-option-value="A" data-correct="true">
            <span class="qa-option-label">A</span>
            <span class="qa-option-text" data-edit-id="q4-a">Alpha</span>
          </button>
          <button type="button" class="qa-option example-card__option" data-option-value="B">
            <span class="qa-option-label">B</span>
            <span class="qa-option-text" data-edit-id="q4-b">Beta</span>
          </button>
        </div>
      </div>
      <aside class="example-card__analysis" hidden></aside>
    </section>
  `);

  const { document } = dom.window;
  document.documentElement.classList.add('editor-mode');

  document.querySelector('[data-answer-value="B"]').click();

  assert.equal(document.querySelector('[data-option-value="A"]').hasAttribute('data-correct'), false);
  assert.equal(document.querySelector('[data-option-value="B"]').hasAttribute('data-correct'), true);
  assert.equal(document.querySelector('[data-answer-value="B"]').classList.contains('is-active'), true);
});

it('reveals blank answers on submit for blank questions', () => {
  const dom = createExampleCardDom(`
    <section class="example-card" data-question-type="blank">
      <div class="example-card__main">
        <div class="example-card__stem" data-edit-id="q5-stem">
          John planted <span class="example-card__blank" data-correct-answer="milkweed">______</span> in his yard.
        </div>
        <div class="example-card__actions">
          <button type="button" class="example-card__analysis-toggle" disabled>查看解析</button>
          <button type="button" class="example-card__submit-btn">提交答案</button>
        </div>
      </div>
      <aside class="example-card__analysis" hidden></aside>
    </section>
  `);

  const { document } = dom.window;
  document.querySelector('.example-card__submit-btn').click();

  assert.equal(document.querySelector('.example-card__blank').textContent.trim(), 'milkweed');
  assert.equal(document.querySelector('.example-card').classList.contains('is-submitted'), true);
});
```

- [ ] **Step 2: 跑红灯，确保失败来源正是答案键与 blank 逻辑缺失**

Run: `Set-Location d:/Projects/html-slides/testing; node --test tests/example-card-runtime.test.js`

Expected: FAIL，断言落在 `data-correct` 没切换，或 blank 文本仍是占位线。

- [ ] **Step 3: 给运行时补最小答案键同步与 blank 提交逻辑**

在 `assets/example-card-runtime.js` 中加两组能力：编辑态答案键同步、blank reveal。这里仍然不要接音效。

```js
const ANSWER_KEY_SELECTOR = '.example-card__answer-key';
const BLANK_SELECTOR = '.example-card__blank[data-correct-answer]';

function isEditorMode() {
  return document.documentElement.classList.contains('editor-mode') ||
    document.body.classList.contains('editor-mode');
}

function syncAnswerKey(root) {
  const correctValues = collectCorrectValues(root);
  root.querySelectorAll(ANSWER_KEY_SELECTOR).forEach((button) => {
    const value = button.getAttribute('data-answer-value') || '';
    button.classList.toggle('is-active', correctValues.includes(value));
  });
}

function updateCorrectValuesFromAnswerKey(root, button) {
  if (!isEditorMode()) return;
  const value = button.getAttribute('data-answer-value') || '';
  const isMultiple = (root.getAttribute('data-question-type') || 'single') === 'multiple';

  root.querySelectorAll(OPTION_SELECTOR).forEach((option) => {
    const optionValue = option.getAttribute('data-option-value') || '';
    if (!isMultiple) {
      option.removeAttribute('data-correct');
    }
    if (optionValue === value) {
      if (isMultiple && option.hasAttribute('data-correct')) {
        option.removeAttribute('data-correct');
      } else {
        option.setAttribute('data-correct', 'true');
      }
    }
  });

  syncAnswerKey(root);
}

function revealBlankAnswers(root) {
  root.querySelectorAll(BLANK_SELECTOR).forEach((blank) => {
    blank.textContent = blank.getAttribute('data-correct-answer') || '';
    blank.classList.add('is-revealed');
  });
}

function submitCard(root) {
  const state = ensureState(root);
  state.submitted = true;

  if (state.questionType === 'blank') {
    revealBlankAnswers(root);
    renderSubmission(root);
    return;
  }

  state.correctValues = collectCorrectValues(root).sort();
  state.selectedValues = state.selectedValues.slice().sort();
  state.isCorrect = arraysEqual(state.selectedValues, state.correctValues);
  renderSelection(root);
  renderSubmission(root);
}

document.addEventListener('click', (event) => {
  const answerKey = event.target.closest(ANSWER_KEY_SELECTOR);
  if (answerKey) {
    const root = answerKey.closest(CARD_SELECTOR);
    if (root) updateCorrectValuesFromAnswerKey(root, answerKey);
    return;
  }
  // 其余 click 分支保持不变
});
```

- [ ] **Step 4: 再跑同一组 focused tests，确认编辑态与 blank 行为稳定**

Run: `Set-Location d:/Projects/html-slides/testing; node --test tests/example-card-runtime.test.js`

Expected: PASS，且 `editor-utils.js`、`editor-core.js` 无需改动就能接受 `.qa-option-text` 与 `data-edit-id` 宿主。

## Task 4: 通过 TDD 扩展音效 cue，并接上例题组件语义适配层

**Files:**
- Modify: `testing/tests/audio-runtime.test.js`
- Modify: `assets/audio-runtime.js`
- Create: `assets/example-card-audio.js`
- Modify: `assets/example-card-runtime.js`

- [ ] **Step 1: 先为 `answer-correct` / `answer-wrong` 和例题组件音频适配层写 failing tests**

在 `testing/tests/audio-runtime.test.js` 追加下面这段。这里先读未来的 `assets/example-card-audio.js`，让第一次运行稳定红灯。

```js
const exampleCardAudioPath = path.join(projectRoot, 'assets', 'example-card-audio.js');
const exampleCardAudioSource = fs.readFileSync(exampleCardAudioPath, 'utf-8');

it('maps example-card result cues to correct.mp3 and wrong.mp3', () => {
  const { window } = createAudioRuntimeDom();

  const correctCue = window.AudioRuntime.getCueDefinition('answer-correct');
  const wrongCue = window.AudioRuntime.getCueDefinition('answer-wrong');

  assert.match(correctCue.src, /\/sound\/correct\.mp3$/);
  assert.match(wrongCue.src, /\/sound\/wrong\.mp3$/);
  assert.equal(correctCue.gain, 1);
  assert.equal(wrongCue.gain, 1);
});

it('routes example-card submit-result semantics to the correct global cue', () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    runScripts: 'outside-only',
    url: 'http://localhost/'
  });
  const { window } = dom;
  const cueCalls = [];

  window.AudioRuntime = {
    playGlobalCue(name) {
      cueCalls.push(name);
      return true;
    }
  };

  window.eval(exampleCardAudioSource);

  window.ExampleCardAudio.playSubmitResult({ isCorrect: true });
  window.ExampleCardAudio.playSubmitResult({ isCorrect: false });

  assert.deepEqual(cueCalls, ['answer-correct', 'answer-wrong']);
});
```

- [ ] **Step 2: 跑红灯，确认失败集中在 cue 缺失与适配文件缺失**

Run: `Set-Location d:/Projects/html-slides/testing; node --test tests/audio-runtime.test.js`

Expected: FAIL，原因是 `answer-correct` / `answer-wrong` 未定义，或 `assets/example-card-audio.js` 不存在。

- [ ] **Step 3: 先补最小 cue，再补适配层，再在运行时提交分支里接线**

在 `assets/audio-runtime.js` 的 `cueDefinitions` 中新增两个 1x 增益 cue：

```js
'answer-correct': Object.freeze({
  type: 'file',
  src: resolveSoundUrl('correct.mp3'),
  gain: 1
}),
'answer-wrong': Object.freeze({
  type: 'file',
  src: resolveSoundUrl('wrong.mp3'),
  gain: 1
}),
```

新建 `assets/example-card-audio.js`：

```js
(function initExampleCardAudio() {
  if (window.ExampleCardAudio) return;

  function playSubmitResult(payload) {
    if (!window.AudioRuntime || typeof window.AudioRuntime.playGlobalCue !== 'function') {
      return false;
    }
    return window.AudioRuntime.playGlobalCue(payload && payload.isCorrect ? 'answer-correct' : 'answer-wrong');
  }

  window.ExampleCardAudio = { playSubmitResult };
})();
```

最后只在 `assets/example-card-runtime.js` 的选择题 `submitCard(root)` 分支末尾加上：

```js
if (window.ExampleCardAudio && typeof window.ExampleCardAudio.playSubmitResult === 'function') {
  window.ExampleCardAudio.playSubmitResult({ isCorrect: state.isCorrect === true });
}
```

- [ ] **Step 4: 先跑音频测试，再跑组件测试，确认没有把 blank 题错误接上对错音效**

Run: `Set-Location d:/Projects/html-slides/testing; node --test tests/audio-runtime.test.js tests/example-card-runtime.test.js`

Expected: PASS，且 blank 题测试继续绿灯，因为 blank 分支不应调用 `playSubmitResult()`。

## Task 5: 落 CSS 与 demo 页面，把截图体验变成可手测入口

**Files:**
- Create: `assets/zones/zone2-example-card.css`
- Create: `assets/example-card-demo.html`

- [ ] **Step 1: 写独立样式文件，只覆盖例题组件自己的壳层、状态与编辑态**

在 `assets/zones/zone2-example-card.css` 里直接按 `.example-card` 根作用域写，核心先落这批选择器：

```css
.example-card {
  display: grid;
  grid-template-columns: 1fr;
  gap: 18px;
  padding: 22px;
  border-radius: 22px;
  border: 1px solid rgba(88, 166, 255, 0.14);
  background-color: rgba(255, 255, 255, 0.3);
  backdrop-filter: blur(24px) saturate(120%);
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.08);
}

.example-card.is-analysis-open {
  grid-template-columns: 5fr 3fr;
  align-items: start;
}

.example-card__analysis[hidden] {
  display: none !important;
}

.example-card__editor-answer-key {
  display: none;
}

html.editor-mode .example-card__editor-answer-key,
body.editor-mode .example-card__editor-answer-key {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.example-card__answer-key.is-active {
  background-color: var(--brand-primary, #00A355);
  color: #fff;
  border-color: var(--brand-primary, #00A355);
}

.example-card .qa-option.selected {
  border-color: var(--accent-orange, #f39800);
  background-color: rgba(243, 152, 0, 0.1);
}

.example-card .qa-option.result-correct {
  background-color: rgba(var(--brand-primary-rgb, 0, 163, 85), 0.15);
}

.example-card .qa-option.result-incorrect {
  background-color: rgba(186, 26, 26, 0.15);
}
```

要求：把复杂状态切换、5:3 布局原因、编辑态为什么单独显示答案键条，都写进中文注释，不要只留裸选择器。

- [ ] **Step 2: 新建独立 demo 页面，资源加载顺序严格跟现有课件一致，只额外插入例题组件 CSS / JS**

在 `assets/example-card-demo.html` 里使用与现有课件一致的 CSS / JS 顺序。CSS 放在 `zone2-quiz-annotation.css` 之后、`zone3-summary.css` 之前最稳；JS 放在 `audio-runtime.js` 后面接 `example-card-audio.js`，再接 `editor-*` 系列和 `example-card-runtime.js`。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="generator" content="html-slides v1.0.0">
  <title>Example Card Demo</title>
  <link rel="stylesheet" href="./viewport-base.css">
  <link rel="stylesheet" href="./themes/xindongfang-green.css">
  <link rel="stylesheet" href="./components.css">
  <link rel="stylesheet" href="./zones/zone1-header.css">
  <link rel="stylesheet" href="./zones/zone2-content.css">
  <link rel="stylesheet" href="./zones/zone2-immersive-components.css">
  <link rel="stylesheet" href="./zones/zone2-quiz-annotation.css">
  <link rel="stylesheet" href="./zones/zone2-example-card.css">
  <link rel="stylesheet" href="./zones/zone3-summary.css">
  <link rel="stylesheet" href="./editor.css">
</head>
<body>
  <div class="deck" id="deck">
    <div class="slide active" data-slide="0">
      <div class="slide-header banner">
        <div class="header-module">例题组件</div>
        <div class="header-title">核心交互 Demo</div>
      </div>
      <div class="slide-content layout-single">
        <!-- 放 1 张可交互单选题即可：先选错 -> 提交 -> 展开解析 -> 按 E 进入编辑态切答案 -->
      </div>
      <script type="application/json" class="slide-notes">
      {"title":"Example Card Demo","script":"用于手测例题组件首版核心体验。","notes":["选择态","提交态","编辑态答案键"]}
      </script>
    </div>
  </div>

  <script src="./slides-runtime.js"></script>
  <script src="./audio-runtime.js"></script>
  <script src="./example-card-audio.js"></script>
  <script src="./editor-utils.js"></script>
  <script src="./editor-persistence.js"></script>
  <script src="./editor-history.js"></script>
  <script src="./editor-box-manager.js"></script>
  <script src="./editor-rich-text.js"></script>
  <script src="./editor-core.js"></script>
  <script src="./page-richtext-annotation-runtime.js"></script>
  <script src="./doodle-runtime.js"></script>
  <script src="./example-card-runtime.js"></script>
</body>
</html>
```

- [ ] **Step 3: 先做静态校验，再做 focused tests 回归**

Run: `Set-Location d:/Projects/html-slides; rg -n "zone2-example-card.css|example-card-runtime.js|example-card-audio.js" assets/example-card-demo.html`

Expected: `assets/example-card-demo.html` 同时命中这 3 个资源引用，且顺序符合计划说明。

Run: `Set-Location d:/Projects/html-slides/testing; node --test tests/example-card-runtime.test.js tests/audio-runtime.test.js`

Expected: PASS，确保落 CSS / demo 后没有回滚运行时行为。

## Task 6: 最终验证与人工测试闸口

**Files:**
- Modify: `testing/tests/example-card-runtime.test.js`（如前面任务中还有遗漏断言）
- Modify: `assets/example-card-demo.html`（只在手测中发现确凿问题时修）

- [ ] **Step 1: 跑最终 focused verification，确认本轮范围内的 JS 能力全部绿灯**

Run: `Set-Location d:/Projects/html-slides/testing; node --test tests/example-card-runtime.test.js tests/audio-runtime.test.js`

Expected: PASS，且输出中不应再出现缺文件、缺 API 或未处理异常。

- [ ] **Step 2: 在浏览器中打开 `assets/example-card-demo.html`，按截图路径走一次人工验收**

手工核对顺序固定如下：

1. 页面打开后，单选题默认处于未提交态。
2. 先点击错误选项，核对橙色 selected 状态是否接近截图 1。
3. 点击“提交答案”，核对红错绿对状态、解析按钮解锁、是否播放错误音效。
4. 点击“查看解析”，核对布局是否切成左 5 右 3。
5. 按 `E` 进入编辑模式，点击顶部答案键切换正确答案，再退出编辑模式重复提交一次，确认结果立刻跟着新答案变化。

- [ ] **Step 3: 在人工测试闸口停下，不要自动继续扩展下一批能力**

完成上面的自动化验证与 demo 入口后，必须通过 askQuestions 询问用户是：

1. 先手动测试这个功能 / 请先给我可体验实例。
2. 本功能讨论结束，继续下一个功能 / 阶段。
3. 结束对话 / 本轮到此为止。
4. 其他 / 自定义补充（请直接输入）。

在用户没有明确放行继续推进之前，不要自动开始“翻页状态保存”“提交后富文本标注激活”“sidecar 持久化”等下一轮能力。
