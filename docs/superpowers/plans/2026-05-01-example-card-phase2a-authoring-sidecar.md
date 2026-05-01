# Example Card Phase 2A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not dispatch multiple agents for this plan; pause with askQuestions at the manual checkpoint.

**Goal:** 在 example-card 中打通第二阶段 2A 的最小闭环：编辑模式下可编辑题干 / 选项 / 解析，作者写入的隐藏型富文本标注能进入 `.annotations.js` sidecar，学生态下这些标注必须在提交后才开放 reveal。

**Architecture:** 文本与 fragment 继续复用 ordinary `elements[editId] = innerHTML` 协议，不新增 example-card 专属文本 sidecar schema。运行时只补两层最小增量：一层是编辑态的 option-text 可编辑与点击隔离，另一层是 example-card 对普通页 fragment runtime 的“提交后 reveal”门禁。

**Tech Stack:** 原生 HTML / CSS / JavaScript、既有 `editor-utils` / `editor-rich-text` / `annotation-store` / `page-richtext-annotation-runtime`、Node.js `--test` + jsdom、真实课件页 `七选五理论论述.html`。

**执行约束补充：** 本计划刻意省略 git commit 步骤，因为当前用户没有授权提交 commit；实现过程中采用单线程推进，并在真实课件可独立体验后用 askQuestions 进入人工检查闸口。

---

## 文件地图

### 主要修改文件

- `assets/editor-utils.js`
- `assets/editor-rich-text.js`
- `assets/example-card-runtime.js`
- `assets/page-richtext-annotation-runtime.js`
- `assets/annotation-store.js`
- `七选五理论论述.html`

### 主要测试文件

- `testing/tests/editor-stable-id.test.js`
- `testing/tests/page-richtext-authoring.test.js`
- `testing/tests/annotation-store.test.js`
- `testing/tests/page-richtext-annotation-runtime.test.js`
- `testing/tests/example-card-runtime.test.js`

### 本轮明确不动

- `assets/slides-runtime.js`
- `assets/quiz-annotation-runtime.js`
- `assets/audio-runtime.js`
- `testing/tests/audio-runtime.test.js`

### 关键实现约束

1. 未来多题路线虽然已锁定为“每题独立 DOM / 独立 editId”，但 2A 本轮不实现翻题 UI，也不持久化当前题号。
2. 本轮继续复用 ordinary `elements[editId] = innerHTML`；不要发明 `exampleCards[].texts` 或 `exampleCards[].fragments` 之类的重复 schema。
3. example-card 内 authored fragment 的 reveal 资格必须受提交门禁约束：编辑模式始终可见，学生态未提交不可 reveal，学生态已提交仅当前显示题可 reveal。
4. 编辑模式下 example-card 的 `.qa-option-text` 必须可编辑，但 quiz 内 `.qa-option-text` 仍保留专属恢复链路，不能被 generic stable-id / generic contenteditable 方案误伤。
5. 真实课件页达到可体验状态后，必须先用 askQuestions 进入人工检查闸口，再决定是否继续下一个切片。

## Task 1: 修复编辑模式下 option-text 不可编辑与点击抢答

**Files:**
- Modify: `testing/tests/editor-stable-id.test.js`
- Modify: `testing/tests/example-card-runtime.test.js`
- Modify: `assets/editor-utils.js`
- Modify: `assets/example-card-runtime.js`

- [ ] **Step 1: 在 `editor-stable-id.test.js` 增加红灯用例，锁定“example-card option-text 可编辑，但 quiz option-text 不进入 generic 路径”**

把下面这条测试追加到 `testing/tests/editor-stable-id.test.js` 的 `describe('stable editable ids', ...)` 内：

```js
it('treats example-card option text as a generic editable root while keeping quiz option text on the dedicated path', () => {
  const bodyHtml = `
    <div class="deck">
      <div class="slide active" data-slide="1">
        <section class="example-card">
          <button type="button" class="qa-option example-card__option" data-option-value="A">
            <span class="qa-option-label">A</span>
            <span class="qa-option-text" data-edit-id="example-option-a">Example option text</span>
          </button>
        </section>

        <div class="quiz-annotation">
          <button type="button" class="qa-option" data-option="A">
            <span class="qa-option-label">A</span>
            <span class="qa-option-text">Quiz option text</span>
          </button>
        </div>
      </div>
    </div>`;

  const dom = createDom(bodyHtml);
  const { window } = dom;
  window.eval(editorUtilsSource);

  const exampleOption = window.document.querySelector('.example-card .qa-option-text');
  const quizOption = window.document.querySelector('.quiz-annotation .qa-option-text');
  const candidates = window._editorUtils.getEditableCandidates();

  assert.ok(exampleOption, '测试夹具必须提供 example-card 选项文本');
  assert.ok(quizOption, '测试夹具必须提供 quiz 选项文本');
  assert.equal(candidates.includes(exampleOption), true, 'expected example-card option text to enter the generic editable candidate set even though it sits inside a button');
  assert.equal(candidates.includes(quizOption), false, 'expected quiz option text to stay out of the generic editable candidate set');
});
```

- [ ] **Step 2: 在 `example-card-runtime.test.js` 增加红灯用例，锁定“编辑模式下点击选项不触发学生态选择”**

把下面这条测试追加到 `testing/tests/example-card-runtime.test.js`：

```js
it('ignores option clicks while editor mode is active', () => {
  const dom = createExampleCardDom(`
    <section class="example-card" data-question-type="single">
      <div class="example-card__main">
        <div class="example-card__answers">
          <button type="button" class="qa-option example-card__option" data-option-value="A">
            <span class="qa-option-label">A</span>
            <span class="qa-option-text" data-edit-id="q-editor-a">Alpha</span>
          </button>
          <button type="button" class="qa-option example-card__option" data-option-value="B" data-correct="true">
            <span class="qa-option-label">B</span>
            <span class="qa-option-text" data-edit-id="q-editor-b">Beta</span>
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

  document.documentElement.classList.add('editor-mode');
  optionA.click();

  assert.equal(optionA.classList.contains('selected'), false);
  assert.equal(optionB.classList.contains('selected'), false);
});
```

- [ ] **Step 3: 跑当前切片红灯，确认失败点分别落在 editable candidate 过滤和 option click 门禁**

Run: `Set-Location 'd:/Projects/html-slides/testing'; node --test tests/editor-stable-id.test.js tests/example-card-runtime.test.js`

Expected: FAIL，且至少有一条错误信息分别指向：

1. `example-card option text to enter the generic editable candidate set`
2. `ignores option clicks while editor mode is active`

- [ ] **Step 4: 最小修复 `editor-utils.js`，只为 example-card 放开 button 内的 `.qa-option-text`**

在 `assets/editor-utils.js` 里把“黑名单过滤”从直接 `closest(button)` 改成带白名单分支的 helper。按下面这段改：

```js
function isExampleCardOptionText(el) {
    return !!(el && el.matches && el.matches('.example-card .qa-option-text'));
}

function isBlacklistedEditable(el) {
    if (!el) return false;

    /* example-card 的选项文本虽然位于 qa-option 按钮内部，
     * 但作者态需要直接在这块文本上改文案；这里仅对白名单的 option-text 放行，
     * 其余按钮和按钮子树仍继续留在黑名单，避免把 quiz / 普通按钮控件一起放进 generic contenteditable。 */
    if (isExampleCardOptionText(el)) {
        return false;
    }

    return (EDITABLE_BLACKLIST && el.matches(EDITABLE_BLACKLIST)) ||
        (EDITABLE_BLACKLIST && el.closest(EDITABLE_BLACKLIST));
}
```

并把 `getEditableCandidates()` 里的过滤条件替换成：

```js
if (isBlacklistedEditable(el)) {
    return;
}
```

- [ ] **Step 5: 最小修复 `example-card-runtime.js`，编辑模式下短路学生态作答点击**

在 `handleOptionClick(option)` 开头、`state.submitted` 判断前加入下面这段：

```js
  // 编辑模式下点击选项的语义是“把光标放进文本里继续编辑”，
  // 不是学生作答；这里必须像 quiz 组件一样直接短路，避免作者一边改选项文案、一边误触写入 selectedValues。
  if (isEditorMode()) {
    return;
  }
```

- [ ] **Step 6: 回跑同一组 focused tests，确认这两个问题同时转绿**

Run: `Set-Location 'd:/Projects/html-slides/testing'; node --test tests/editor-stable-id.test.js tests/example-card-runtime.test.js`

Expected: PASS，且新用例与现有 example-card focused tests 一起通过。

## Task 2: 锁住 example-card 对普通页面隐藏型标注 authoring 协议的复用能力

**Files:**
- Modify: `testing/tests/page-richtext-authoring.test.js`
- Modify: `assets/editor-rich-text.js`（仅当新测试仍然为红时）

- [ ] **Step 1: 在 `page-richtext-authoring.test.js` 增加 example-card authoring harness 与两条红灯用例**

先在测试文件里追加一个专用 harness：

```js
function createExampleCardAuthoringDom() {
  const html = `<!DOCTYPE html><html><body>
    <div class="slide active" data-slide="1">
      <section class="example-card">
        <div class="example-card__stem" data-edit-id="example-stem" contenteditable="true">
          Stem fragment sample text.
        </div>
        <div class="example-card__answers">
          <button type="button" class="qa-option example-card__option" data-option-value="A">
            <span class="qa-option-label">A</span>
            <span class="qa-option-text" data-edit-id="example-option-a" contenteditable="true">
              Option fragment sample text.
            </span>
          </button>
        </div>
        <aside class="example-card__analysis" hidden>
          <div class="example-card__analysis-body" data-edit-id="example-analysis" contenteditable="true">
            Analysis fragment sample text.
          </div>
        </aside>
      </section>
    </div>
  </body></html>`;

  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'http://localhost/'
  });

  const { window } = dom;
  window.console.log = () => {};
  window.console.warn = () => {};
  window.alert = () => {};
  window.prompt = () => '主语';
  window.document.execCommand = () => true;
  window.editorCore = { isActive: true };

  const persistenceCalls = [];
  const historyCalls = [];
  const scheduleSaveCalls = [];
  window.PersistenceLayer = { saveElement(element) { persistenceCalls.push(element); } };
  window.historyMgr = { recordState(forceSnapshot) { historyCalls.push(forceSnapshot); } };
  window.AnnotationStore = { scheduleSave() { scheduleSaveCalls.push('scheduled'); } };

  window.eval(editorUtilsSource);
  window.eval(editorRichTextSource);
  window.RichTextToolbar.init();

  return { dom, window, persistenceCalls, historyCalls, scheduleSaveCalls };
}
```

然后追加两条测试：

```js
it('shows the ordinary hidden-fragment toolbar for a partial selection inside example-card option text', () => {
  const { window } = createExampleCardAuthoringDom();
  const optionRoot = window.document.querySelector('[data-edit-id="example-option-a"]');

  selectText(window, optionRoot, 'fragment sample');

  const toolbar = getPageFragmentToolbar(window.document);
  assert.ok(toolbar?.classList.contains('visible'), 'expected example-card option text to reuse the ordinary hidden-fragment toolbar');
  assert.match(toolbar?.textContent || '', /隐藏型标注/);
});

it('authors fragment markup inside example-card option text and schedules a sidecar save', () => {
  const { window, persistenceCalls, historyCalls, scheduleSaveCalls } = createExampleCardAuthoringDom();
  const optionRoot = window.document.querySelector('[data-edit-id="example-option-a"]');

  selectText(window, optionRoot, 'fragment sample');
  clickToolbarControl(window, getToolbarButton(requireVisiblePageFragmentToolbar(window.document), '删除线'));

  const fragment = optionRoot.querySelector('[data-fragment-step="true"]');
  assert.ok(fragment, 'expected example-card option text to receive authored fragment markup');
  assert.equal(fragment.getAttribute('data-fragment-format'), 'strikethrough');
  assert.deepEqual(persistenceCalls, [optionRoot]);
  assert.deepEqual(historyCalls, [true]);
  assert.deepEqual(scheduleSaveCalls, ['scheduled']);
});
```

- [ ] **Step 2: 跑 authoring 红灯，确认 example-card option root 真的走到了普通页面隐藏型标注协议**

Run: `Set-Location 'd:/Projects/html-slides/testing'; node --test tests/page-richtext-authoring.test.js`

Expected: 如果 Task 1 的放行还不够，失败信息会指向“toolbar 不显示”或 “fragment markup 未写入 optionRoot”。

- [ ] **Step 3: 只有在 Task 2 仍为红时，最小修复 `editor-rich-text.js` 的 ordinary-root 解析**

如果上一步已经是绿灯，不改生产代码，直接进入 Step 4；如果仍为红灯，则在 `assets/editor-rich-text.js` 的 `_getOrdinaryPageEditRoot(node)` 中补下面这段注释化保护：

```js
        _getOrdinaryPageEditRoot: function (node) {
            var el = this._getSelectionRootNode(node);
            if (!el || !el.closest) return null;
            var root = el.closest('[data-edit-id]');
            if (!root) return null;
            if (root.closest('.quiz-annotation')) return null;

            /* example-card 的 stem / option-text / analysis 虽然处在组件壳层里，
               但它们仍然是 ordinary data-edit-id 根块；这里不要把 example-card 误当成 quiz 专属区域拦掉，
               否则作者态只能在普通页面正文上加隐藏型标注，不能覆盖例题讲评正文。 */
            return root;
        },
```

- [ ] **Step 4: 回跑 authoring focused tests，确认 example-card root 已被普通页面作者态协议锁住**

Run: `Set-Location 'd:/Projects/html-slides/testing'; node --test tests/page-richtext-authoring.test.js`

Expected: PASS，且新增 example-card authoring 用例与原有 ordinary-page 用例同时通过。

## Task 3: 锁住 example-card authored fragment 的 sidecar 收集 / 恢复闭环

**Files:**
- Modify: `testing/tests/annotation-store.test.js`
- Modify: `assets/annotation-store.js`（仅当新测试仍然为红时）

- [ ] **Step 1: 在 `annotation-store.test.js` 增加 example-card ordinary roots 的收集与恢复红灯用例**

追加下面两条测试：

```js
it('collects example-card option roots that contain authored fragments into ordinary elements payload', async () => {
  const { window, writes } = createAnnotationStoreHarness(`
    <div class="slide active" data-slide="1">
      <section class="example-card">
        <button type="button" class="qa-option example-card__option" data-option-value="A">
          <span class="qa-option-label">A</span>
          <span class="qa-option-text" data-edit-id="example-option-a">
            Option <span data-fragment-step="true" data-fragment-format="highlight">hidden fragment</span> text.
          </span>
        </button>
      </section>
    </div>
  `);

  const data = await authorizeAndCollect(window, writes);

  assert.equal(Object.prototype.hasOwnProperty.call(data.elements, 'example-option-a'), true, 'expected example-card option roots with authored fragments to enter the shared ordinary elements payload');
});

it('restores sidecar element payloads into example-card option roots on deck reload', async () => {
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>
    <div class="slide active" data-slide="1">
      <section class="example-card">
        <button type="button" class="qa-option example-card__option" data-option-value="A">
          <span class="qa-option-label">A</span>
          <span class="qa-option-text" data-edit-id="example-option-a">Original option text.</span>
        </button>
      </section>
    </div>
  </body></html>`, {
    runScripts: 'outside-only',
    url: 'file:///D:/Projects/html-slides/deck.html'
  });

  const { window } = dom;
  window.console.log = () => {};
  window.console.warn = () => {};
  window.indexedDB = {
    open() {
      throw new Error('indexeddb-disabled-for-test');
    }
  };

  const originalAppendChild = window.document.head.appendChild.bind(window.document.head);
  window.document.head.appendChild = (node) => {
    if (node.tagName === 'SCRIPT' && /deck\.annotations\.js$/i.test(node.src || '')) {
      window.__annotationData = {
        version: 1,
        title: 'deck',
        elements: {
          'example-option-a': 'Restored <span data-fragment-step="true" data-fragment-format="highlight">fragment</span> text.'
        },
        answerKeys: [],
        deletedNotes: []
      };
      queueMicrotask(() => {
        if (typeof node.onload === 'function') node.onload();
      });
      return node;
    }
    return originalAppendChild(node);
  };

  window.eval(annotationStoreSource);
  await Promise.resolve();
  await Promise.resolve();

  const target = window.document.querySelector('[data-edit-id="example-option-a"]');
  assert.match(target.innerHTML, /data-fragment-step="true"/);
  assert.match(target.textContent, /Restored/);
});
```

- [ ] **Step 2: 跑 sidecar 红灯，确认 example-card roots 进入 ordinary payload 的链路确实被锁住**

Run: `Set-Location 'd:/Projects/html-slides/testing'; node --test tests/annotation-store.test.js`

Expected: 如果仍有缺口，失败信息会落在 `example-option-a` 未进入 `data.elements`。

- [ ] **Step 3: 只有在 Task 3 仍为红时，最小修复 `annotation-store.js` 的 ordinary root 判断**

如果上一步已经是绿灯，不改生产代码，直接进入 Step 4；如果仍为红灯，则在 `assets/annotation-store.js` 中抽一个普通根块判断 helper，并让 `_collectOrdinaryFragmentElements()` 显式走它：

```js
  function _isOrdinaryFragmentRoot(root, slide) {
    if (!root || !slide || !slide.contains(root)) return false;
    if (root.closest('.quiz-annotation')) return false;
    return true;
  }

  function _collectOrdinaryFragmentElements(data) {
    document.querySelectorAll('.slide').forEach(function (slide) {
      if (!slide || slide.querySelector('.quiz-annotation')) return;

      var collectedOrdinaryRoots = Object.create(null);

      slide.querySelectorAll('[data-fragment-step="true"]').forEach(function (fragment) {
        var root = fragment.closest('[data-edit-id]');
        if (!_isOrdinaryFragmentRoot(root, slide)) return;

        var editId = root.getAttribute('data-edit-id');
        if (!editId || collectedOrdinaryRoots[editId]) return;
        collectedOrdinaryRoots[editId] = true;
        data.elements[editId] = _stripTransientQuizState(root.innerHTML);
      });
    });
  }
```

- [ ] **Step 4: 回跑 sidecar focused tests，确认 example-card roots 与 ordinary roots 继续共用同一 schema**

Run: `Set-Location 'd:/Projects/html-slides/testing'; node --test tests/annotation-store.test.js`

Expected: PASS，且 ordinary-page 既有测试不回归。

## Task 4: 为 example-card fragment host 增加“提交后 reveal”门禁

**Files:**
- Modify: `testing/tests/example-card-runtime.test.js`
- Modify: `testing/tests/page-richtext-annotation-runtime.test.js`
- Modify: `assets/example-card-runtime.js`
- Modify: `assets/page-richtext-annotation-runtime.js`
- Modify: `七选五理论论述.html`

- [ ] **Step 1: 在 `example-card-runtime.test.js` 增加红灯用例，锁住“提交后为当前题写 reveal 门禁标记”**

追加下面这条测试：

```js
it('marks the active example-card question submitted for fragment gating after submit', () => {
  const dom = createExampleCardDom(`
    <section class="example-card" data-question-type="single">
      <article class="example-card__question is-active" data-question-id="q1">
        <div class="example-card__main">
          <div class="example-card__answers">
            <button type="button" class="qa-option example-card__option" data-option-value="A" data-correct="true">
              <span class="qa-option-label">A</span>
              <span class="qa-option-text" data-edit-id="q-gate-a">Alpha</span>
            </button>
          </div>
          <div class="example-card__actions">
            <button type="button" class="example-card__analysis-toggle" disabled>查看解析</button>
            <button type="button" class="example-card__submit-btn">提交答案</button>
          </div>
        </div>
        <aside class="example-card__analysis" hidden></aside>
      </article>
    </section>
  `);

  const { document } = dom.window;
  const optionA = document.querySelector('[data-option-value="A"]');
  const submitBtn = document.querySelector('.example-card__submit-btn');
  const question = document.querySelector('.example-card__question');

  optionA.click();
  submitBtn.click();

  assert.equal(question.getAttribute('data-question-submitted'), 'true');
  assert.equal(question.getAttribute('data-question-active'), 'true');
});
```

- [ ] **Step 2: 在 `page-richtext-annotation-runtime.test.js` 增加红灯用例，分别锁住“未提交不能 reveal”和“只允许当前显示题 reveal”**

先在测试文件里新增一个 helper：

```js
function createExampleCardFragmentDom(submittedMarkup) {
  return createRuntimeDom(`
    <div class="slide active" data-slide="1">
      <section class="example-card">
        ${submittedMarkup}
      </section>
    </div>
    <div class="slide" data-slide="2">
      <div class="header-title">Slide 2</div>
    </div>
  `);
}
```

然后追加两条测试：

```js
it('does not reveal example-card fragments before the active question is submitted', () => {
  const dom = createExampleCardFragmentDom(`
    <article class="example-card__question is-active" data-question-id="q1" data-question-active="true" data-question-submitted="false">
      <div class="example-card__stem" data-edit-id="example-stem">
        Intro <span class="page-fragment" data-fragment-step="true">hidden</span> cue.
      </div>
    </article>
  `);

  const { window } = dom;
  const fragment = window.document.querySelector('[data-fragment-step="true"]');

  rightClickElement(window, fragment);

  assert.equal(fragment.classList.contains('qa-fragment-visible'), false, 'expected unsubmitted example-card fragments to stay unrevealable');
});

it('reveals only the active submitted example-card question fragments', () => {
  const dom = createExampleCardFragmentDom(`
    <article class="example-card__question is-active" data-question-id="q1" data-question-active="true" data-question-submitted="true">
      <div class="example-card__stem" data-edit-id="active-stem">
        Active <span class="page-fragment active-fragment" data-fragment-step="true">hidden</span> cue.
      </div>
    </article>
    <article class="example-card__question" data-question-id="q2" hidden data-question-active="false" data-question-submitted="true">
      <div class="example-card__stem" data-edit-id="inactive-stem">
        Hidden <span class="page-fragment inactive-fragment" data-fragment-step="true">hidden</span> cue.
      </div>
    </article>
  `);

  const { window } = dom;
  const activeFragment = window.document.querySelector('.active-fragment');
  const inactiveFragment = window.document.querySelector('.inactive-fragment');

  rightClickElement(window, activeFragment);
  rightClickElement(window, inactiveFragment);

  assert.equal(activeFragment.classList.contains('qa-fragment-visible'), true, 'expected the active submitted question fragment to reveal');
  assert.equal(inactiveFragment.classList.contains('qa-fragment-visible'), false, 'expected inactive question fragments to stay unrevealable');
});
```

- [ ] **Step 3: 跑 reveal 门禁红灯，确认失败点落在 example-card 与 page-richtext runtime 的交界处**

Run: `Set-Location 'd:/Projects/html-slides/testing'; node --test tests/example-card-runtime.test.js tests/page-richtext-annotation-runtime.test.js`

Expected: FAIL，且至少有一条错误信息指向 `data-question-submitted` 缺失，另一条错误信息指向未提交 fragment 被错误 reveal。

- [ ] **Step 4: 在 `example-card-runtime.js` 写当前题门禁标记，不实现多题状态机，只写当前显示题的 DOM 标记**

在文件顶部常量区加：

```js
  const QUESTION_SELECTOR = '.example-card__question';
```

再补一个 helper，并在 `initCard()`、`renderSubmission()`、`renderAnalysis()` 后调用它：

```js
  function syncQuestionGateState(root) {
    const state = ensureState(root);
    const questionNodes = root.querySelectorAll(QUESTION_SELECTOR);

    if (questionNodes.length === 0) {
      root.setAttribute('data-question-active', 'true');
      root.setAttribute('data-question-submitted', state.submitted ? 'true' : 'false');
      return;
    }

    questionNodes.forEach((question, index) => {
      const isActive = !question.hidden && (question.classList.contains('is-active') || index === 0);
      question.setAttribute('data-question-active', isActive ? 'true' : 'false');
      question.setAttribute('data-question-submitted', isActive && state.submitted ? 'true' : 'false');
    });
  }
```

并在 `initCard(root)` 末尾追加：

```js
    syncQuestionGateState(root);
```

以及在 `renderSubmission(root)` 末尾追加：

```js
    syncQuestionGateState(root);
```

- [ ] **Step 5: 在 `page-richtext-annotation-runtime.js` 把“样式资格”和“reveal 资格”拆开**

按下面的结构补 helper，不要把 example-card 的提交门禁硬塞进普通页面的 generic ordinary-root 判定：

```js
  function isExampleCardRevealEligible(root) {
    const card = root && root.closest ? root.closest('.example-card') : null;
    if (!card) return true;

    const question = root.closest('.example-card__question');
    if (!question) {
      return card.getAttribute('data-question-submitted') === 'true' || card.classList.contains('is-submitted');
    }

    const isActive = question.getAttribute('data-question-active') === 'true' &&
      !question.hidden &&
      question.getAttribute('aria-hidden') !== 'true';

    if (!isActive) return false;
    return question.getAttribute('data-question-submitted') === 'true';
  }

  function getFragmentBearingOrdinaryRoots(slide) {
    if (!slide || isQuizAnnotationSlide(slide)) return [];
    return getOrdinaryEditRoots(slide).filter((root) => rootOwnsOrdinaryFragments(root));
  }

  function getRevealEligibleOrdinaryRoots(slide) {
    return getFragmentBearingOrdinaryRoots(slide).filter((root) => isExampleCardRevealEligible(root));
  }
```

然后只改三处调用：

1. `shouldEnableOrdinaryFragmentHost(slide)` 用 `getFragmentBearingOrdinaryRoots(slide)`，保证未提交 fragment 也能被隐藏样式接管。
2. `getOrdinaryFragmentHosts(slide)` 改用 `getRevealEligibleOrdinaryRoots(slide)`，保证只有已提交当前题进入 reveal 宿主队列。
3. `getOwningOrdinaryTextRoot(target)` 在返回前加：

```js
    if (!isExampleCardRevealEligible(root)) return null;
```

这样 hover / 右键 reveal 都会被同一层门禁拦住。

- [ ] **Step 6: 把真实课件入口切到 future-compatible 的单题 question wrapper 结构**

在 `七选五理论论述.html` 当前这张题卡外层，把原先单题内容包一层：

```html
<article class="example-card__question is-active" data-question-id="lesson-example-q1" data-question-active="true" data-question-submitted="false">
  ...原先的 main / analysis 内容...
</article>
```

要求：

1. 原有 `data-edit-id="lesson-example-stem"`、`lesson-example-option-a`、`lesson-example-analysis` 保持不变。
2. 这一步只补 question wrapper，不提前加入分页按钮或第二题 DOM。

- [ ] **Step 7: 回跑 reveal focused tests，确认提交门禁和普通页 runtime 都转绿**

Run: `Set-Location 'd:/Projects/html-slides/testing'; node --test tests/example-card-runtime.test.js tests/page-richtext-annotation-runtime.test.js`

Expected: PASS，且未提交 example-card fragment 不可 reveal、已提交当前题 fragment 可 reveal。

## Task 5: 真实课件集成验证与人工检查闸口

**Files:**
- Modify: `docs/superpowers/plans/2026-05-01-example-card-phase2a-authoring-sidecar.md`（仅在执行过程中勾选进度，不新增内容）

- [ ] **Step 1: 回跑本轮完整 focused suite，确认 2A 没把 ordinary-page / example-card 链路带崩**

Run: `Set-Location 'd:/Projects/html-slides/testing'; node --test tests/editor-stable-id.test.js tests/page-richtext-authoring.test.js tests/annotation-store.test.js tests/page-richtext-annotation-runtime.test.js tests/example-card-runtime.test.js`

Expected: PASS，所有与 2A 相关的 focused tests 全绿。

- [ ] **Step 2: 在真实课件页做单线程人工验证，不要继续自动推进后续功能**

体验入口：`七选五理论论述.html` 的最后一页 example-card。

人工检查顺序：

1. 进入编辑模式，确认题干、选项、解析都能直接修改文案。
2. 在题干或选项文本上加一段隐藏型标注。
3. 如果浏览器提示 sidecar 写入授权，完成授权并保存。
4. 刷新页面，确认刚写入的隐藏型标注仍然存在。
5. 切回学生态，提交答案前尝试右键 authored fragment，确认不会 reveal。
6. 提交答案后，再次右键 authored fragment，确认当前题可以 reveal。

- [ ] **Step 3: 用 askQuestions 进入人工检查闸口，等待用户决定是否继续**

执行时必须使用 askQuestions，固定选项顺序写成下面这样：

1. `先让我手动测试这个功能 / 请先给我可体验实例`
2. `本功能讨论结束，继续下一个功能 / 阶段`
3. `结束对话 / 本轮到此为止`
4. `其他 / 自定义补充（请直接输入）`

如果用户选择先手动测试，就停在这里，不继续做 2B / 2C，也不继续自动扩 scope。
