import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..', '..');
const runtimePath = path.join(projectRoot, 'assets', 'runtime', 'example-card-runtime.js');
const exampleCardCssPath = path.join(projectRoot, 'assets', 'zones', 'zone2-example-card.css');
const exampleCardCssSource = fs.readFileSync(exampleCardCssPath, 'utf-8');

function createExampleCardDom(bodyHtml, options = {}) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${bodyHtml}</body></html>`, {
    runScripts: 'outside-only',
    url: 'http://localhost/'
  });

  if (options.editorCoreStub) {
    dom.window.editorCore = typeof options.editorCoreStub === 'function'
      ? options.editorCoreStub(dom.window)
      : options.editorCoreStub;
  }

  let annotationStoreReadyResolver = null;
  let annotationStoreCurrentData = options.annotationStoreInitData || null;

  if (options.annotationStoreInitData || options.annotationStoreReadyData) {
    const readyPromise = options.annotationStoreReadyData
      ? new Promise((resolve) => {
          annotationStoreReadyResolver = () => {
            annotationStoreCurrentData = options.annotationStoreReadyData;
            resolve(true);
          };
        })
      : Promise.resolve(true);

    dom.window.AnnotationStore = {
      getInitData() {
        return annotationStoreCurrentData;
      },
      whenReady() {
        return readyPromise;
      }
    };
  }

  if (options.localStorageElements || options.localStorageCardStates || options.enableStorageUtils === true) {
    dom.window._editorUtils = {
      storageKey(suffix) {
        return `test:${suffix}`;
      },
      legacyStorageKey(suffix) {
        return `legacy:${suffix}`;
      }
    };

    if (options.localStorageCardStates) {
      Object.entries(options.localStorageCardStates).forEach(([cardId, state]) => {
        dom.window.localStorage.setItem(`test:example-card-state:${cardId}`, JSON.stringify(state));
      });
    }

    if (options.localStorageElements) {
      Object.entries(options.localStorageElements).forEach(([editId, html]) => {
        dom.window.localStorage.setItem(`test:e:${editId}`, html);
      });
    }

    if (options.localStorageRawEntries) {
      Object.entries(options.localStorageRawEntries).forEach(([key, value]) => {
        dom.window.localStorage.setItem(key, value);
      });
    }
  }

  if (options.stubFragmentRefresh === true) {
    const refreshCalls = [];
    dom.window.PageRichTextAnnotationRuntime = {
      refreshSlide(slide) {
        refreshCalls.push(slide);
      }
    };
    dom.window.__fragmentRefreshCalls = refreshCalls;
  }

  // 这里直接读取待实现运行时，确保红灯阶段的失败会明确指向新能力缺失。
  let runtimeSource = fs.readFileSync(runtimePath, 'utf-8');

  if (options.exposeRuntimeState === true) {
    // 正式运行时不暴露闭包内状态；测试里注入只读 getter，
    // 这样既能验证 submitCard 是否写入卡片级判分结果，也不会把内部状态变成公开 API。
    const instrumentedSource = runtimeSource.replace(
      /  window\.ExampleCardRuntime = \{\r?\n    initAll,\r?\n    initCard\r?\n  \};/,
      [
        '  window.ExampleCardRuntime = {',
        '    initAll,',
        '    initCard,',
        '    __getState(root) {',
        '      return stateMap.get(root);',
        '    }',
        '  };'
      ].join('\n')
    );

    assert.notEqual(instrumentedSource, runtimeSource, '测试注入运行时状态钩子失败，请同步更新测试夹具');
    runtimeSource = instrumentedSource;
  }

  dom.window.eval(runtimeSource);

  // 测试显式触发初始化，避免把用例结果绑定到 jsdom 的加载时序细节上。
  dom.window.ExampleCardRuntime.initAll();

  if (annotationStoreReadyResolver) {
    dom.window.__resolveAnnotationStoreReady = async () => {
      annotationStoreReadyResolver();
      await Promise.resolve();
      await Promise.resolve();
    };
  }

  return dom;
}

function readStoredCardState(window, cardId) {
  const raw = window.localStorage.getItem(`test:example-card-state:${cardId}`);
  return raw ? JSON.parse(raw) : null;
}

function createMultiQuestionExampleCardMarkup(cardId) {
  return `
    <section class="example-card" data-card-id="${cardId}" data-question-type="single">
      <article class="example-card__question is-active" data-question-id="q1">
        <div class="example-card__main">
          <div class="example-card__stem" data-edit-id="${cardId}-q1-stem">Question one stem.</div>
          <div class="example-card__answers">
            <button type="button" class="qa-option example-card__option" data-option-value="A" data-correct="true">
              <span class="qa-option-label">A</span>
              <span class="qa-option-text" data-edit-id="${cardId}-q1-option-a">Question one option A.</span>
            </button>
            <button type="button" class="qa-option example-card__option" data-option-value="B">
              <span class="qa-option-label">B</span>
              <span class="qa-option-text" data-edit-id="${cardId}-q1-option-b">Question one option B.</span>
            </button>
          </div>
          <div class="example-card__actions">
            <button type="button" class="example-card__analysis-toggle" disabled>查看解析</button>
            <button type="button" class="example-card__submit-btn">提交答案</button>
          </div>
        </div>
        <aside class="example-card__analysis" hidden>
          <div class="example-card__analysis-body" data-edit-id="${cardId}-q1-analysis">Question one analysis.</div>
        </aside>
      </article>

      <article class="example-card__question" data-question-id="q2" hidden aria-hidden="true">
        <div class="example-card__main">
          <div class="example-card__stem" data-edit-id="${cardId}-q2-stem">Question two stem.</div>
          <div class="example-card__answers">
            <button type="button" class="qa-option example-card__option" data-option-value="A">
              <span class="qa-option-label">A</span>
              <span class="qa-option-text" data-edit-id="${cardId}-q2-option-a">Question two option A.</span>
            </button>
            <button type="button" class="qa-option example-card__option" data-option-value="B" data-correct="true">
              <span class="qa-option-label">B</span>
              <span class="qa-option-text" data-edit-id="${cardId}-q2-option-b">Question two option B.</span>
            </button>
          </div>
          <div class="example-card__actions">
            <button type="button" class="example-card__analysis-toggle" disabled>查看解析</button>
            <button type="button" class="example-card__submit-btn">提交答案</button>
          </div>
        </div>
        <aside class="example-card__analysis" hidden>
          <div class="example-card__analysis-body" data-edit-id="${cardId}-q2-analysis">Question two analysis.</div>
        </aside>
      </article>

      <div class="example-card__footer">
        <div class="example-card__nav">
          <button type="button" class="example-card__prev-btn" disabled>上一题</button>
          <button type="button" class="example-card__next-btn">下一题</button>
        </div>
      </div>
    </section>
  `;
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

    assert.ok(optionA, '测试夹具必须提供 A 选项按钮');
    assert.ok(optionB, '测试夹具必须提供 B 选项按钮');

    optionA.click();
    optionB.click();

    assert.equal(optionA.classList.contains('selected'), false);
    assert.equal(optionB.classList.contains('selected'), true);
  });

  it('keeps multiple selected options before submit for multi questions', () => {
    const dom = createExampleCardDom(`
      <section class="example-card" data-question-type="multi">
        <div class="example-card__main">
          <div class="example-card__stem" data-edit-id="multi-stem">Which actions helped the garden attract more butterflies?</div>
          <div class="example-card__answers">
            <button type="button" class="qa-option example-card__option" data-option-value="A" data-correct="true">
              <span class="qa-option-label">A</span>
              <span class="qa-option-text" data-edit-id="multi-option-a">Planting more milkweed.</span>
            </button>
            <button type="button" class="qa-option example-card__option" data-option-value="B">
              <span class="qa-option-label">B</span>
              <span class="qa-option-text" data-edit-id="multi-option-b">Painting the fence dark brown.</span>
            </button>
            <button type="button" class="qa-option example-card__option" data-option-value="C" data-correct="true">
              <span class="qa-option-label">C</span>
              <span class="qa-option-text" data-edit-id="multi-option-c">Leaving a shallow dish of water nearby.</span>
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
    const options = Array.from(document.querySelectorAll('.example-card__option'));

    assert.equal(options.length, 3, '测试夹具必须提供 3 个多选选项');

    options[0].click();
    options[2].click();

    assert.equal(options[0].classList.contains('selected'), true);
    assert.equal(options[1].classList.contains('selected'), false);
    assert.equal(options[2].classList.contains('selected'), true);
  });

  it('keeps multiple selected options before submit for flex questions', () => {
    const dom = createExampleCardDom(`
      <section class="example-card" data-question-type="flex">
        <div class="example-card__main">
          <div class="example-card__stem" data-edit-id="flex-stem">Which of the following could be true according to the talk?</div>
          <div class="example-card__answers">
            <button type="button" class="qa-option example-card__option" data-option-value="A" data-correct="true">
              <span class="qa-option-label">A</span>
              <span class="qa-option-text" data-edit-id="flex-option-a">The fence still supported bean vines.</span>
            </button>
            <button type="button" class="qa-option example-card__option" data-option-value="B">
              <span class="qa-option-label">B</span>
              <span class="qa-option-text" data-edit-id="flex-option-b">The garden was repaired by volunteers.</span>
            </button>
            <button type="button" class="qa-option example-card__option" data-option-value="C" data-correct="true">
              <span class="qa-option-label">C</span>
              <span class="qa-option-text" data-edit-id="flex-option-c">A shallow dish of water was added.</span>
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
    const options = Array.from(document.querySelectorAll('.example-card__option'));

    assert.equal(options.length, 3, '测试夹具必须提供 3 个不定项选项');

    options[0].click();
    options[2].click();

    assert.equal(options[0].classList.contains('selected'), true);
    assert.equal(options[1].classList.contains('selected'), false);
    assert.equal(options[2].classList.contains('selected'), true);
  });

  it('lets editor switch question types and keep multiple correct answers for multi questions', () => {
    const dom = createExampleCardDom(`
      <section class="example-card" data-question-type="single">
        <div class="example-card__main">
          <div class="example-card__editor-answer-key" data-editor-only="true" aria-label="正确答案编辑区">
            <span class="example-card__editor-label">正确答案</span>
            <button type="button" class="example-card__answer-key is-active" data-answer-value="A">A</button>
            <button type="button" class="example-card__answer-key" data-answer-value="B">B</button>
            <button type="button" class="example-card__answer-key" data-answer-value="C">C</button>
            <button type="button" class="example-card__answer-key" data-answer-value="D">D</button>
          </div>
          <div class="example-card__stem" data-edit-id="type-switch-stem">27. Which changes improved the backyard habitat?</div>
          <div class="example-card__answers">
            <button type="button" class="qa-option example-card__option" data-option-value="A" data-correct="true">
              <span class="qa-option-label">A</span>
              <span class="qa-option-text" data-edit-id="type-switch-option-a">Planting milkweed.</span>
            </button>
            <button type="button" class="qa-option example-card__option" data-option-value="B">
              <span class="qa-option-label">B</span>
              <span class="qa-option-text" data-edit-id="type-switch-option-b">Replacing the fence.</span>
            </button>
            <button type="button" class="qa-option example-card__option" data-option-value="C">
              <span class="qa-option-label">C</span>
              <span class="qa-option-text" data-edit-id="type-switch-option-c">Adding a shallow water dish.</span>
            </button>
            <button type="button" class="qa-option example-card__option" data-option-value="D">
              <span class="qa-option-label">D</span>
              <span class="qa-option-text" data-edit-id="type-switch-option-d">Painting the gate blue.</span>
            </button>
          </div>
        </div>
        <aside class="example-card__analysis" hidden></aside>
      </section>
    `);

    const { document } = dom.window;
    document.documentElement.classList.add('editor-mode');

    const multiTypeButton = document.querySelector('[data-question-type-value="multi"]');
    const answerKeyA = document.querySelector('.example-card__answer-key[data-answer-value="A"]');
    const answerKeyC = document.querySelector('.example-card__answer-key[data-answer-value="C"]');
    const optionA = document.querySelector('.example-card__option[data-option-value="A"]');
    const optionC = document.querySelector('.example-card__option[data-option-value="C"]');
    const card = document.querySelector('.example-card');

    assert.ok(multiTypeButton, '编辑态必须提供题型选择胶囊');
    assert.ok(answerKeyA, '测试夹具必须提供 A 答案键');
    assert.ok(answerKeyC, '测试夹具必须提供 C 答案键');
    assert.ok(card, '测试夹具必须提供例题卡片根节点');

    multiTypeButton.click();
    answerKeyC.click();

    assert.equal(card.getAttribute('data-question-type'), 'multi');
    assert.equal(optionA.hasAttribute('data-correct'), true);
    assert.equal(optionC.hasAttribute('data-correct'), true);
  });

  it('shows the current blank answer in editor mode and lets the author edit it directly', () => {
    const dom = createExampleCardDom(`
      <section class="example-card" data-question-type="blank">
        <div class="example-card__main">
          <div class="example-card__stem" data-edit-id="blank-editor-stem">
            By late summer, the garden had become a small haven for <span class="example-card__blank" data-blank-id="blank-editor-1" data-correct-answer="butterflies">______</span>.
          </div>
          <div class="example-card__actions">
            <button type="button" class="example-card__analysis-toggle" disabled>查看解析</button>
            <button type="button" class="example-card__submit-btn">提交答案</button>
          </div>
        </div>
        <aside class="example-card__analysis" hidden></aside>
      </section>
    `, { enableStorageUtils: true });

    const { document, localStorage } = dom.window;
    document.documentElement.classList.add('editor-mode');

    const blank = document.querySelector('.example-card__blank');
    const editorInput = document.querySelector('.example-card__blank-answer-input');

    assert.ok(blank, '测试夹具必须提供 blank 占位节点');
    assert.ok(editorInput, '编辑态 blank 题应该渲染专用答案输入框');
    assert.equal(editorInput.value, 'butterflies', '编辑态 blank 输入框应该显示当前正确答案');
    assert.equal(editorInput.disabled, false, '编辑态 blank 输入框必须允许直接修改');

    editorInput.value = 'pollinators';
    editorInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

    assert.equal(blank.getAttribute('data-correct-answer'), 'pollinators', '编辑态修改 blank 输入框后，标准答案应同步回 blank 节点');

    const storedConfigEntries = Object.entries(localStorage).filter(([key]) => key.includes('example-card-authoring'));
    assert.equal(storedConfigEntries.length, 1, '编辑态修改 blank 答案后应写回一份作者态配置快照');

    const storedConfig = JSON.parse(storedConfigEntries[0][1]);
    assert.match(JSON.stringify(storedConfig.blankAnswers || []), /pollinators/, '作者态配置快照里应保存最新的 blank 正确答案');
  });

  it('blocks leaving editor mode and shakes the hint when a multi question has fewer than two correct answers', () => {
    const dom = createExampleCardDom(`
      <section class="example-card" data-question-type="single">
        <div class="example-card__main">
          <div class="example-card__editor-answer-key" data-editor-only="true" aria-label="正确答案编辑区">
            <span class="example-card__editor-label">正确答案</span>
            <button type="button" class="example-card__answer-key is-active" data-answer-value="A">A</button>
            <button type="button" class="example-card__answer-key" data-answer-value="B">B</button>
            <button type="button" class="example-card__answer-key" data-answer-value="C">C</button>
            <button type="button" class="example-card__answer-key" data-answer-value="D">D</button>
          </div>
          <div class="example-card__stem" data-edit-id="guard-stem">28. Which TWO details show the garden became more welcoming to insects?</div>
          <div class="example-card__answers">
            <button type="button" class="qa-option example-card__option" data-option-value="A" data-correct="true">
              <span class="qa-option-label">A</span>
              <span class="qa-option-text" data-edit-id="guard-option-a">More milkweed was planted.</span>
            </button>
            <button type="button" class="qa-option example-card__option" data-option-value="B">
              <span class="qa-option-label">B</span>
              <span class="qa-option-text" data-edit-id="guard-option-b">The fence was repainted.</span>
            </button>
            <button type="button" class="qa-option example-card__option" data-option-value="C">
              <span class="qa-option-label">C</span>
              <span class="qa-option-text" data-edit-id="guard-option-c">A shallow water dish was added.</span>
            </button>
            <button type="button" class="qa-option example-card__option" data-option-value="D">
              <span class="qa-option-label">D</span>
              <span class="qa-option-text" data-edit-id="guard-option-d">The path was widened.</span>
            </button>
          </div>
        </div>
        <aside class="example-card__analysis" hidden></aside>
      </section>
    `, {
      editorCoreStub(window) {
        return {
          isActive: true,
          toggleCalls: 0,
          toggleEditMode() {
            this.toggleCalls += 1;
            this.isActive = !this.isActive;
            window.document.documentElement.classList.toggle('editor-mode', this.isActive);
            window.document.body.classList.toggle('editor-mode', this.isActive);
          }
        };
      }
    });

    const { document, editorCore } = dom.window;
    document.documentElement.classList.add('editor-mode');
    document.body.classList.add('editor-mode');

    const multiTypeButton = document.querySelector('[data-question-type-value="multi"]');
    const hint = document.querySelector('.example-card__editor-multi-hint');

    assert.ok(multiTypeButton, '编辑态必须提供题型选择胶囊');
    assert.ok(hint, '多选题必须提供至少两个答案的文字提示');

    multiTypeButton.click();
    editorCore.toggleEditMode();

    assert.equal(editorCore.isActive, true);
    assert.equal(editorCore.toggleCalls, 0);
    assert.equal(document.documentElement.classList.contains('editor-mode'), true);
    assert.equal(hint.classList.contains('is-shaking'), true);
  });

  it('restores editor-authored question type and correct answers after reload', () => {
    const firstDom = createExampleCardDom(`
      <section class="example-card" data-card-id="persist-card" data-question-type="single">
        <div class="example-card__main">
          <div class="example-card__editor-answer-key" data-editor-only="true" aria-label="正确答案编辑区">
            <span class="example-card__editor-label">正确答案</span>
            <button type="button" class="example-card__answer-key is-active" data-answer-value="A">A</button>
            <button type="button" class="example-card__answer-key" data-answer-value="B">B</button>
            <button type="button" class="example-card__answer-key" data-answer-value="C">C</button>
            <button type="button" class="example-card__answer-key" data-answer-value="D">D</button>
          </div>
          <div class="example-card__stem" data-edit-id="persist-stem">29. Which changes made the backyard more suitable for pollinators?</div>
          <div class="example-card__answers">
            <button type="button" class="qa-option example-card__option" data-option-value="A" data-correct="true">
              <span class="qa-option-label">A</span>
              <span class="qa-option-text" data-edit-id="persist-option-a">Planting milkweed.</span>
            </button>
            <button type="button" class="qa-option example-card__option" data-option-value="B">
              <span class="qa-option-label">B</span>
              <span class="qa-option-text" data-edit-id="persist-option-b">Replacing the fence.</span>
            </button>
            <button type="button" class="qa-option example-card__option" data-option-value="C">
              <span class="qa-option-label">C</span>
              <span class="qa-option-text" data-edit-id="persist-option-c">Adding a shallow water dish.</span>
            </button>
          </div>
        </div>
        <aside class="example-card__analysis" hidden></aside>
      </section>
    `, { enableStorageUtils: true });

    const { document: firstDocument, localStorage: firstLocalStorage } = firstDom.window;
    firstDocument.documentElement.classList.add('editor-mode');

    firstDocument.querySelector('[data-question-type-value="multi"]')?.click();
    firstDocument.querySelector('.example-card__answer-key[data-answer-value="C"]')?.click();

    const rawEntries = {};
    for (let index = 0; index < firstLocalStorage.length; index += 1) {
      const key = firstLocalStorage.key(index);
      if (!key) continue;
      rawEntries[key] = firstLocalStorage.getItem(key) || '';
    }

    const secondDom = createExampleCardDom(`
      <section class="example-card" data-card-id="persist-card" data-question-type="single">
        <div class="example-card__main">
          <div class="example-card__editor-answer-key" data-editor-only="true" aria-label="正确答案编辑区">
            <span class="example-card__editor-label">正确答案</span>
            <button type="button" class="example-card__answer-key is-active" data-answer-value="A">A</button>
            <button type="button" class="example-card__answer-key" data-answer-value="B">B</button>
            <button type="button" class="example-card__answer-key" data-answer-value="C">C</button>
            <button type="button" class="example-card__answer-key" data-answer-value="D">D</button>
          </div>
          <div class="example-card__stem" data-edit-id="persist-stem">29. Which changes made the backyard more suitable for pollinators?</div>
          <div class="example-card__answers">
            <button type="button" class="qa-option example-card__option" data-option-value="A" data-correct="true">
              <span class="qa-option-label">A</span>
              <span class="qa-option-text" data-edit-id="persist-option-a">Planting milkweed.</span>
            </button>
            <button type="button" class="qa-option example-card__option" data-option-value="B">
              <span class="qa-option-label">B</span>
              <span class="qa-option-text" data-edit-id="persist-option-b">Replacing the fence.</span>
            </button>
            <button type="button" class="qa-option example-card__option" data-option-value="C">
              <span class="qa-option-label">C</span>
              <span class="qa-option-text" data-edit-id="persist-option-c">Adding a shallow water dish.</span>
            </button>
          </div>
        </div>
        <aside class="example-card__analysis" hidden></aside>
      </section>
    `, {
      enableStorageUtils: true,
      localStorageRawEntries: rawEntries
    });

    const secondDocument = secondDom.window.document;
    const reloadedCard = secondDocument.querySelector('.example-card');
    const reloadedOptionA = secondDocument.querySelector('.example-card__option[data-option-value="A"]');
    const reloadedOptionC = secondDocument.querySelector('.example-card__option[data-option-value="C"]');

    assert.equal(reloadedCard?.getAttribute('data-question-type'), 'multi');
    assert.equal(reloadedOptionA?.hasAttribute('data-correct'), true);
    assert.equal(reloadedOptionC?.hasAttribute('data-correct'), true);
  });

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

    assert.ok(optionA, '测试夹具必须提供 A 选项按钮');
    assert.ok(optionB, '测试夹具必须提供 B 选项按钮');

    document.documentElement.classList.add('editor-mode');
    optionA.click();

    assert.equal(optionA.classList.contains('selected'), false);
    assert.equal(optionB.classList.contains('selected'), false);
  });

  it('hydrates dynamic example-card edit roots from AnnotationStore initData during initCard', () => {
    const dom = createExampleCardDom(`
      <div class="slide active" data-slide="1">
        <section class="example-card" data-question-type="single">
          <div class="example-card__main">
            <div class="example-card__stem" data-edit-id="lesson-example-stem">Original stem.</div>
            <div class="example-card__answers">
              <button type="button" class="qa-option example-card__option" data-option-value="A">
                <span class="qa-option-label">A</span>
                <span class="qa-option-text" data-edit-id="lesson-example-option-a">Alpha</span>
              </button>
            </div>
          </div>
          <aside class="example-card__analysis" hidden></aside>
        </section>
      </div>
    `, {
      annotationStoreInitData: {
        elements: {
          'lesson-example-stem': 'Updated <span data-fragment-step="true" data-fragment-format="highlight">fragment</span> stem.'
        }
      }
    });

    const stem = dom.window.document.querySelector('[data-edit-id="lesson-example-stem"]');

    assert.ok(stem, '测试夹具必须提供动态题卡的题干根块');
    assert.match(stem.innerHTML, /data-fragment-step="true"/, 'expected initCard to hydrate dynamic example-card roots from already loaded sidecar data');
    assert.match(stem.textContent, /Updated fragment stem\./, 'expected hydrated example-card roots to expose the saved sidecar text immediately on first refresh');
  });

  it('rehydrates dynamic example-card edit roots after AnnotationStore.whenReady resolves and refreshes fragment hosts', async () => {
    const dom = createExampleCardDom(`
      <div class="slide active" data-slide="11">
        <section class="example-card" data-question-type="single">
          <div class="example-card__main">
            <div class="example-card__stem" data-edit-id="lesson-example-stem">Original stem.</div>
            <div class="example-card__answers">
              <button type="button" class="qa-option example-card__option" data-option-value="A">
                <span class="qa-option-label">A</span>
                <span class="qa-option-text" data-edit-id="lesson-example-option-a">Alpha</span>
              </button>
            </div>
          </div>
          <aside class="example-card__analysis" hidden></aside>
        </section>
      </div>
    `, {
      annotationStoreReadyData: {
        elements: {
          'lesson-example-stem': 'Delayed <span data-fragment-step="true" data-fragment-format="highlight">fragment</span> stem.'
        }
      },
      stubFragmentRefresh: true
    });

    const stem = dom.window.document.querySelector('[data-edit-id="lesson-example-stem"]');

    assert.ok(stem, '测试夹具必须提供动态题卡的题干根块');
    assert.doesNotMatch(stem.innerHTML, /data-fragment-step="true"/, 'expected sidecar data not to exist before the deferred AnnotationStore.whenReady resolves');
    assert.equal(typeof dom.window.__resolveAnnotationStoreReady, 'function', '测试夹具必须暴露 AnnotationStore 延迟就绪的手动触发器');

    await dom.window.__resolveAnnotationStoreReady();

    assert.match(stem.innerHTML, /data-fragment-step="true"/, 'expected dynamic example-card roots to rehydrate once AnnotationStore finishes loading after initCard');
    assert.match(stem.textContent, /Delayed fragment stem\./, 'expected the delayed sidecar payload to become visible on the first refresh without requiring a second reload');
    assert.equal(dom.window.__fragmentRefreshCalls.length, 1, 'expected delayed example-card hydration to refresh the ordinary fragment runtime host cache once the fragment markup arrives');
  });

  it('prefers localStorage content over stale AnnotationStore initData for dynamic example-card roots', () => {
    const dom = createExampleCardDom(`
      <div class="slide active" data-slide="1">
        <section class="example-card" data-question-type="single">
          <div class="example-card__main">
            <div class="example-card__stem" data-edit-id="lesson-example-stem">Original stem.</div>
          </div>
          <aside class="example-card__analysis" hidden></aside>
        </section>
      </div>
    `, {
      annotationStoreInitData: {
        elements: {
          'lesson-example-stem': 'Stale <span data-fragment-step="true" data-fragment-format="highlight">sidecar</span> stem.'
        }
      },
      localStorageElements: {
        'lesson-example-stem': 'Fresh <span data-fragment-step="true" data-fragment-format="highlight">local</span> stem.'
      }
    });

    const stem = dom.window.document.querySelector('[data-edit-id="lesson-example-stem"]');

    assert.ok(stem, '测试夹具必须提供动态题卡的题干根块');
    assert.match(stem.textContent, /Fresh local stem\./, 'expected dynamic example-card roots to mirror ordinary-page restore precedence by preferring localStorage over stale sidecar data');
    assert.doesNotMatch(stem.textContent, /Stale sidecar stem\./, 'expected stale sidecar content not to overwrite fresher local restore data on the first refresh');
  });

  it('stores card-level correctness in state.isCorrect on submit', () => {
    const dom = createExampleCardDom(
      `
        <section class="example-card" data-question-type="single">
          <div class="example-card__main">
            <div class="example-card__answers">
              <button type="button" class="qa-option example-card__option" data-option-value="A">
                <span class="qa-option-label">A</span>
                <span class="qa-option-text" data-edit-id="q1-state-a">Alpha</span>
              </button>
              <button type="button" class="qa-option example-card__option" data-option-value="B" data-correct="true">
                <span class="qa-option-label">B</span>
                <span class="qa-option-text" data-edit-id="q1-state-b">Beta</span>
              </button>
            </div>
            <div class="example-card__actions">
              <button type="button" class="example-card__analysis-toggle" disabled>查看解析</button>
              <button type="button" class="example-card__submit-btn">提交答案</button>
            </div>
          </div>
          <aside class="example-card__analysis" hidden></aside>
        </section>
      `,
      { exposeRuntimeState: true }
    );

    const { document, ExampleCardRuntime } = dom.window;
    const card = document.querySelector('.example-card');
    const optionA = document.querySelector('[data-option-value="A"]');
    const submitBtn = document.querySelector('.example-card__submit-btn');

    assert.ok(card, '测试夹具必须提供例题卡片根节点');
    assert.ok(optionA, '测试夹具必须提供 A 选项按钮');
    assert.ok(submitBtn, '测试夹具必须提供提交按钮');
    assert.equal(typeof ExampleCardRuntime.__getState, 'function');

    optionA.click();
    submitBtn.click();

    assert.equal(ExampleCardRuntime.__getState(card).isCorrect, false);
  });

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

    assert.ok(optionA, '测试夹具必须提供 A 选项按钮');
    assert.ok(optionB, '测试夹具必须提供 B 选项按钮');
    assert.ok(submitBtn, '测试夹具必须提供提交按钮');
    assert.ok(analysisBtn, '测试夹具必须提供解析按钮');

    optionA.click();
    submitBtn.click();

    assert.equal(optionA.classList.contains('result-incorrect'), true);
    assert.equal(optionB.classList.contains('result-correct'), true);
    assert.equal(analysisBtn.disabled, false);
  });

  it('renders check and cross result marks inside option labels after submit', () => {
    const dom = createExampleCardDom(`
      <section class="example-card" data-question-type="single">
        <div class="example-card__main">
          <div class="example-card__answers">
            <button type="button" class="qa-option example-card__option" data-option-value="A">
              <span class="qa-option-label">A</span>
              <span class="qa-option-text" data-edit-id="q2-mark-a">Alpha</span>
            </button>
            <button type="button" class="qa-option example-card__option" data-option-value="B" data-correct="true">
              <span class="qa-option-label">B</span>
              <span class="qa-option-text" data-edit-id="q2-mark-b">Beta</span>
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
    const optionALabel = optionA?.querySelector('.qa-option-label');
    const optionBLabel = optionB?.querySelector('.qa-option-label');

    assert.ok(optionA, '测试夹具必须提供 A 选项按钮');
    assert.ok(optionB, '测试夹具必须提供 B 选项按钮');
    assert.ok(submitBtn, '测试夹具必须提供提交按钮');
    assert.ok(optionALabel, '测试夹具必须提供 A 选项标签');
    assert.ok(optionBLabel, '测试夹具必须提供 B 选项标签');

    optionA.click();
    submitBtn.click();

    const incorrectMark = optionALabel.querySelector('.qa-result-mark');
    const correctMark = optionBLabel.querySelector('.qa-result-mark');

    assert.ok(incorrectMark, '选错的标签上应渲染 ✗ 结果标记');
    assert.ok(correctMark, '正确答案标签上应渲染 ✓ 结果标记');
    assert.equal(incorrectMark.textContent, '✗');
    assert.equal(correctMark.textContent, '✓');
    assert.equal(incorrectMark.classList.contains('incorrect'), true);
    assert.equal(correctMark.classList.contains('correct'), true);
    assert.equal(incorrectMark.classList.contains('visible'), true);
    assert.equal(correctMark.classList.contains('visible'), true);
  });

  it('routes single-choice submit results through ExampleCardAudio semantics', () => {
    const dom = createExampleCardDom(`
      <section class="example-card" data-question-type="single">
        <div class="example-card__main">
          <div class="example-card__answers">
            <button type="button" class="qa-option example-card__option" data-option-value="A">
              <span class="qa-option-label">A</span>
              <span class="qa-option-text" data-edit-id="q2-audio-a">Alpha</span>
            </button>
            <button type="button" class="qa-option example-card__option" data-option-value="B" data-correct="true">
              <span class="qa-option-label">B</span>
              <span class="qa-option-text" data-edit-id="q2-audio-b">Beta</span>
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
    const submitAudioCalls = [];
    const optionA = document.querySelector('[data-option-value="A"]');
    const submitBtn = document.querySelector('.example-card__submit-btn');

    dom.window.ExampleCardAudio = {
      playSubmitResult(payload) {
        submitAudioCalls.push({
          isCorrect: payload && payload.isCorrect === true
        });
        return true;
      }
    };

    assert.ok(optionA, '测试夹具必须提供 A 选项按钮');
    assert.ok(submitBtn, '测试夹具必须提供提交按钮');

    optionA.click();
    submitBtn.click();

    assert.deepEqual(submitAudioCalls, [{ isCorrect: false }]);
  });

  it('freezes option changes after submit', () => {
    const dom = createExampleCardDom(`
      <section class="example-card" data-question-type="single">
        <div class="example-card__main">
          <div class="example-card__answers">
            <button type="button" class="qa-option example-card__option" data-option-value="A">
              <span class="qa-option-label">A</span>
              <span class="qa-option-text" data-edit-id="q2-freeze-a">Alpha</span>
            </button>
            <button type="button" class="qa-option example-card__option" data-option-value="B" data-correct="true">
              <span class="qa-option-label">B</span>
              <span class="qa-option-text" data-edit-id="q2-freeze-b">Beta</span>
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

    assert.ok(optionA, '测试夹具必须提供 A 选项按钮');
    assert.ok(optionB, '测试夹具必须提供 B 选项按钮');
    assert.ok(submitBtn, '测试夹具必须提供提交按钮');

    optionA.click();
    submitBtn.click();
    optionB.click();

    assert.equal(optionA.classList.contains('selected'), true);
    assert.equal(optionB.classList.contains('selected'), false);
    assert.equal(optionA.classList.contains('result-incorrect'), true);
    assert.equal(optionB.classList.contains('result-correct'), true);
  });

  it('marks misselected options red after submit for flex questions too', () => {
    const dom = createExampleCardDom(`
      <section class="example-card" data-question-type="flex">
        <div class="example-card__main">
          <div class="example-card__stem" data-edit-id="flex-submit-stem">Which choices are supported by the speaker's description?</div>
          <div class="example-card__answers">
            <button type="button" class="qa-option example-card__option" data-option-value="A" data-correct="true">
              <span class="qa-option-label">A</span>
              <span class="qa-option-text" data-edit-id="flex-submit-option-a">The fence still supported climbing beans.</span>
            </button>
            <button type="button" class="qa-option example-card__option" data-option-value="B">
              <span class="qa-option-label">B</span>
              <span class="qa-option-text" data-edit-id="flex-submit-option-b">The darker fence color attracted butterflies.</span>
            </button>
            <button type="button" class="qa-option example-card__option" data-option-value="C" data-correct="true">
              <span class="qa-option-label">C</span>
              <span class="qa-option-text" data-edit-id="flex-submit-option-c">A shallow water dish was placed near the flowers.</span>
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
    const optionA = document.querySelector('.example-card__option[data-option-value="A"]');
    const optionB = document.querySelector('.example-card__option[data-option-value="B"]');
    const optionC = document.querySelector('.example-card__option[data-option-value="C"]');
    const submitBtn = document.querySelector('.example-card__submit-btn');

    assert.ok(optionA && optionB && optionC && submitBtn, '测试夹具必须提供完整的不定项提交流程节点');

    optionA.click();
    optionB.click();
    optionC.click();
    submitBtn.click();

    assert.equal(optionA.classList.contains('result-correct'), true);
    assert.equal(optionB.classList.contains('result-incorrect'), true);
    assert.equal(optionC.classList.contains('result-correct'), true);
  });

  it('disables submit button after submit', () => {
    const dom = createExampleCardDom(`
      <section class="example-card" data-question-type="single">
        <div class="example-card__main">
          <div class="example-card__answers">
            <button type="button" class="qa-option example-card__option" data-option-value="A" data-correct="true">
              <span class="qa-option-label">A</span>
              <span class="qa-option-text" data-edit-id="q3-disable-a">Alpha</span>
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
    const submitBtn = document.querySelector('.example-card__submit-btn');

    assert.ok(optionA, '测试夹具必须提供 A 选项按钮');
    assert.ok(submitBtn, '测试夹具必须提供提交按钮');

    optionA.click();
    submitBtn.click();

    assert.equal(submitBtn.disabled, true);
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
    const card = document.querySelector('.example-card');

    assert.ok(optionA, '测试夹具必须提供 A 选项按钮');
    assert.ok(submitBtn, '测试夹具必须提供提交按钮');
    assert.ok(analysisBtn, '测试夹具必须提供解析按钮');
    assert.ok(analysis, '测试夹具必须提供解析面板');
    assert.ok(card, '测试夹具必须提供例题卡片根节点');

    analysisBtn.click();
    assert.equal(analysis.hidden, true);

    optionA.click();
    submitBtn.click();
    analysisBtn.click();

    assert.equal(analysis.hidden, false);
    assert.equal(card.classList.contains('is-analysis-open'), true);
  });

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
    const answerKeyA = document.querySelector('[data-answer-value="A"]');
    const answerKeyB = document.querySelector('[data-answer-value="B"]');
    const optionA = document.querySelector('[data-option-value="A"]');
    const optionB = document.querySelector('[data-option-value="B"]');

    assert.ok(answerKeyA, '测试夹具必须提供 A 答案键按钮');
    assert.ok(answerKeyB, '测试夹具必须提供 B 答案键按钮');
    assert.ok(optionA, '测试夹具必须提供 A 选项按钮');
    assert.ok(optionB, '测试夹具必须提供 B 选项按钮');

    document.documentElement.classList.add('editor-mode');
    answerKeyB.click();

    assert.equal(optionA.hasAttribute('data-correct'), false);
    assert.equal(optionB.hasAttribute('data-correct'), true);
    // 回归锁定：答案键切换必须同时让旧答案退出激活，避免作者态 UI 和真实判分基准出现“只切了一半”的漂移。
    assert.equal(answerKeyA.classList.contains('is-active'), false);
    assert.equal(answerKeyB.classList.contains('is-active'), true);
    assert.equal(document.querySelectorAll('.example-card__answer-key.is-active').length, 1);
  });

  it('ignores answer key clicks outside editor mode', () => {
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
              <span class="qa-option-text" data-edit-id="q4-noop-a">Alpha</span>
            </button>
            <button type="button" class="qa-option example-card__option" data-option-value="B">
              <span class="qa-option-label">B</span>
              <span class="qa-option-text" data-edit-id="q4-noop-b">Beta</span>
            </button>
          </div>
        </div>
        <aside class="example-card__analysis" hidden></aside>
      </section>
    `);

    const { document } = dom.window;
    const answerKeyA = document.querySelector('[data-answer-value="A"]');
    const answerKeyB = document.querySelector('[data-answer-value="B"]');
    const optionA = document.querySelector('[data-option-value="A"]');
    const optionB = document.querySelector('[data-option-value="B"]');

    assert.ok(answerKeyA, '测试夹具必须提供 A 答案键按钮');
    assert.ok(answerKeyB, '测试夹具必须提供 B 答案键按钮');
    assert.ok(optionA, '测试夹具必须提供 A 选项按钮');
    assert.ok(optionB, '测试夹具必须提供 B 选项按钮');

    answerKeyB.click();

    // 非编辑态点击答案键必须是纯 no-op；这里同时锁住数据属性和激活态，避免未来只挡住其中一层导致“看起来没变、实际判分基准被改掉”。
    assert.equal(optionA.hasAttribute('data-correct'), true);
    assert.equal(optionB.hasAttribute('data-correct'), false);
    assert.equal(answerKeyA.classList.contains('is-active'), true);
    assert.equal(answerKeyB.classList.contains('is-active'), false);
    assert.equal(document.querySelectorAll('.example-card__answer-key.is-active').length, 1);
  });

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

    assert.ok(optionA, '测试夹具必须提供 A 选项按钮');
    assert.ok(submitBtn, '测试夹具必须提供提交按钮');
    assert.ok(question, '测试夹具必须提供题目容器');

    optionA.click();
    submitBtn.click();

    assert.equal(question.getAttribute('data-question-submitted'), 'true');
    assert.equal(question.getAttribute('data-question-active'), 'true');
  });

  it('refreshes the ordinary fragment runtime immediately after submit so hover gating updates in place', () => {
    const dom = createExampleCardDom(`
      <div class="slide active" data-slide="1">
        <section class="example-card" data-question-type="single">
          <article class="example-card__question is-active" data-question-id="q1">
            <div class="example-card__main">
              <div class="example-card__stem" data-edit-id="lesson-example-stem">
                Intro <span data-fragment-step="true" data-fragment-format="highlight">hidden</span> cue.
              </div>
              <div class="example-card__answers">
                <button type="button" class="qa-option example-card__option" data-option-value="A" data-correct="true">
                  <span class="qa-option-label">A</span>
                  <span class="qa-option-text" data-edit-id="q-gate-refresh-a">Alpha</span>
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
      </div>
    `, { stubFragmentRefresh: true });

    const { document } = dom.window;
    const optionA = document.querySelector('[data-option-value="A"]');
    const submitBtn = document.querySelector('.example-card__submit-btn');

    assert.ok(optionA, '测试夹具必须提供 A 选项按钮');
    assert.ok(submitBtn, '测试夹具必须提供提交按钮');
    assert.ok(Array.isArray(dom.window.__fragmentRefreshCalls), '测试夹具必须暴露 ordinary fragment runtime refresh 调用记录');

    optionA.click();
    submitBtn.click();

    assert.equal(dom.window.__fragmentRefreshCalls.length, 1, 'expected example-card submit to refresh the ordinary fragment runtime immediately so post-submit hover and reveal gating become effective without another page reload');
  });

  it('switches questions with footer navigation and keeps each question state independent', () => {
    const dom = createExampleCardDom(createMultiQuestionExampleCardMarkup('lesson-card-a'));

    const { document } = dom.window;
    const prevBtn = document.querySelector('.example-card__prev-btn');
    const nextBtn = document.querySelector('.example-card__next-btn');
    const questionOne = document.querySelector('[data-question-id="q1"]');
    const questionTwo = document.querySelector('[data-question-id="q2"]');
    const questionOneOptionA = questionOne?.querySelector('[data-option-value="A"]');
    const questionOneSubmit = questionOne?.querySelector('.example-card__submit-btn');
    const questionTwoOptionB = questionTwo?.querySelector('[data-option-value="B"]');
    const questionTwoSubmit = questionTwo?.querySelector('.example-card__submit-btn');

    assert.ok(prevBtn, '测试夹具必须提供上一题按钮');
    assert.ok(nextBtn, '测试夹具必须提供下一题按钮');
    assert.ok(questionOne, '测试夹具必须提供第一题容器');
    assert.ok(questionTwo, '测试夹具必须提供第二题容器');
    assert.ok(questionOneOptionA, '测试夹具必须提供第一题 A 选项');
    assert.ok(questionOneSubmit, '测试夹具必须提供第一题提交按钮');
    assert.ok(questionTwoOptionB, '测试夹具必须提供第二题 B 选项');
    assert.ok(questionTwoSubmit, '测试夹具必须提供第二题提交按钮');

    assert.equal(prevBtn.disabled, true, 'expected the first question to disable previous navigation initially');
    assert.equal(nextBtn.disabled, false, 'expected the first question to allow forward navigation when later questions exist');

    questionOneOptionA.click();
    questionOneSubmit.click();
    nextBtn.click();

    assert.equal(questionOne.hidden, true, 'expected the first question to hide once the card navigates to the second question');
    assert.equal(questionTwo.hidden, false, 'expected the second question to become visible after clicking 下一题');
    assert.equal(prevBtn.disabled, false, 'expected the second question to enable backward navigation');
    assert.equal(nextBtn.disabled, true, 'expected the last question to disable forward navigation');

    questionTwoOptionB.click();
    prevBtn.click();

    assert.equal(questionOne.hidden, false, 'expected navigating back to restore the first question visibility');
    assert.equal(questionOne.querySelector('.example-card__submit-btn')?.disabled, true, 'expected the first question to keep its own submitted state after leaving and coming back');
    assert.equal(questionOne.querySelector('.example-card__analysis-toggle')?.disabled, false, 'expected the first question analysis toggle to stay unlocked after its own submission');

    nextBtn.click();

    assert.equal(questionTwo.hidden, false, 'expected navigating forward again to re-activate the second question');
    assert.equal(questionTwo.querySelector('[data-option-value="B"]')?.classList.contains('selected'), true, 'expected the second question to keep its own in-progress selection instead of inheriting the first question result state');
    assert.equal(questionTwo.querySelector('.example-card__submit-btn')?.disabled, false, 'expected the second question to remain unsubmitted after the first question was already submitted');
  });

  it('plays the page-turn cue only when example-card question navigation actually changes the active question', () => {
    const dom = createExampleCardDom(createMultiQuestionExampleCardMarkup('lesson-card-nav-audio'));
    const { document } = dom.window;
    const calls = [];

    dom.window.AudioRuntime = {
      playGlobalCue(name) {
        calls.push(name);
        return true;
      }
    };

    const prevBtn = document.querySelector('.example-card__prev-btn');
    const nextBtn = document.querySelector('.example-card__next-btn');

    assert.ok(prevBtn, '测试夹具必须提供上一题按钮');
    assert.ok(nextBtn, '测试夹具必须提供下一题按钮');

    prevBtn.click();
    nextBtn.click();
    nextBtn.click();
    nextBtn.click();
    prevBtn.click();
    prevBtn.click();

    assert.deepEqual(calls, ['page-turn', 'page-turn'], 'expected example-card navigation to reuse turn_page.mp3 only for successful question switches, while exhausted previous/next clicks stay silent');
  });

  it('resets the active question and per-question state after reload even when the card id stays the same', () => {
    const firstDom = createExampleCardDom(createMultiQuestionExampleCardMarkup('lesson-card-persist'), {
      enableStorageUtils: true
    });

    const firstDocument = firstDom.window.document;
    firstDocument.querySelector('[data-question-id="q1"] [data-option-value="A"]')?.click();
    firstDocument.querySelector('[data-question-id="q1"] .example-card__submit-btn')?.click();
    firstDocument.querySelector('.example-card__next-btn')?.click();
    firstDocument.querySelector('[data-question-id="q2"] [data-option-value="B"]')?.click();

    const storedState = readStoredCardState(firstDom.window, 'lesson-card-persist');

    assert.equal(storedState, null, 'expected example-card runtime not to persist student answer state across reloads, otherwise refreshing the lesson would keep the previous round of answers and make repeated classroom reuse impossible');

    const reloadedDom = createExampleCardDom(createMultiQuestionExampleCardMarkup('lesson-card-persist'), {
      enableStorageUtils: true
    });

    const { document } = reloadedDom.window;
    const questionOne = document.querySelector('[data-question-id="q1"]');
    const questionTwo = document.querySelector('[data-question-id="q2"]');

    assert.ok(questionOne, '测试夹具必须提供第一题容器');
    assert.ok(questionTwo, '测试夹具必须提供第二题容器');
    assert.equal(questionOne.hidden, false, 'expected reload to restart from the first question instead of reopening the previously active question');
    assert.equal(questionTwo.hidden, true, 'expected reload to hide later questions until the user navigates there again');
    assert.equal(questionOne.querySelector('.example-card__submit-btn')?.disabled, false, 'expected reload to clear the previous submitted state and let the class reuse the question immediately');
    assert.equal(questionOne.querySelector('.example-card__analysis-toggle')?.disabled, true, 'expected reload to relock analysis until the new round is submitted');
    assert.equal(questionOne.querySelector('[data-option-value="A"]')?.classList.contains('selected'), false, 'expected reload not to keep the previous round of selected answers');
    assert.equal(questionTwo.querySelector('[data-option-value="B"]')?.classList.contains('selected'), false, 'expected reload not to keep in-progress selections from later questions either');
  });

  it('keeps multiple example-card components independent in memory without writing cross-refresh card buckets', () => {
    const dom = createExampleCardDom(`
      <div class="slide active" data-slide="1">
        ${createMultiQuestionExampleCardMarkup('lesson-card-a')}
        ${createMultiQuestionExampleCardMarkup('lesson-card-b')}
      </div>
    `, {
      enableStorageUtils: true
    });

    const { document, localStorage } = dom.window;
    const cardA = document.querySelector('[data-card-id="lesson-card-a"]');
    const cardB = document.querySelector('[data-card-id="lesson-card-b"]');

    assert.ok(cardA, '测试夹具必须提供第一张 example-card');
    assert.ok(cardB, '测试夹具必须提供第二张 example-card');

    cardA.querySelector('.example-card__next-btn')?.click();
    cardA.querySelector('[data-question-id="q2"] [data-option-value="B"]')?.click();
    cardB.querySelector('[data-question-id="q1"] [data-option-value="A"]')?.click();
    cardB.querySelector('[data-question-id="q1"] .example-card__submit-btn')?.click();

    const cardAState = JSON.parse(localStorage.getItem('test:example-card-state:lesson-card-a') || 'null');
    const cardBState = JSON.parse(localStorage.getItem('test:example-card-state:lesson-card-b') || 'null');

    assert.equal(cardAState, null, 'expected the first example-card not to leave behind cross-refresh answer buckets in localStorage');
    assert.equal(cardBState, null, 'expected the second example-card not to leave behind cross-refresh answer buckets in localStorage either');
    assert.equal(cardA.querySelector('[data-question-id="q2"]')?.hidden, false, 'expected the first card to keep its own in-memory active question independently during the current session');
    assert.equal(cardB.querySelector('[data-question-id="q1"] .example-card__submit-btn')?.disabled, true, 'expected the second card submitted state to stay isolated inside its own card during the current session');
    assert.equal(cardA.querySelector('[data-question-id="q1"] .example-card__submit-btn')?.disabled, false, 'expected the first card not to inherit the second card submitted state');
  });

  it('reveals blank answers without grading blank questions on submit', () => {
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
    `, { exposeRuntimeState: true });

    const { document, ExampleCardRuntime } = dom.window;
    const submitAudioCalls = [];
    const blank = document.querySelector('.example-card__blank');
    const submitBtn = document.querySelector('.example-card__submit-btn');
    const card = document.querySelector('.example-card');

    dom.window.ExampleCardAudio = {
      playSubmitResult(payload) {
        submitAudioCalls.push(payload);
        return true;
      }
    };

    assert.ok(blank, '测试夹具必须提供 blank 占位节点');
    assert.ok(submitBtn, '测试夹具必须提供提交按钮');
    assert.ok(card, '测试夹具必须提供例题卡片根节点');
    assert.equal(typeof ExampleCardRuntime.__getState, 'function');

    submitBtn.click();

    assert.equal(blank.textContent.trim(), 'milkweed');
    assert.equal(card.classList.contains('is-submitted'), true);
    // blank 题当前阶段只揭示标准答案，不生成 true/false 判分；这里同时锁状态与 DOM，避免 reveal 流程被误接入单选题结果样式。
    assert.equal(ExampleCardRuntime.__getState(card).isCorrect, null);
    assert.equal(card.querySelectorAll('.result-correct, .result-incorrect').length, 0);
    assert.deepEqual(submitAudioCalls, []);
  });

  it('renders the question-type pill before the stem and styles the editor type picker', () => {
    assert.match(
      exampleCardCssSource,
      /\.example-card__stem\[data-question-type-label\]::before\s*\{[\s\S]*content:\s*attr\(data-question-type-label\);[\s\S]*border-radius:\s*999px;[\s\S]*display:\s*inline-flex;/,
      'expected the student-facing stem to render a pill from data-question-type-label before the question number'
    );

    assert.match(
      exampleCardCssSource,
      /\.example-card__editor-type-picker\s*\{[\s\S]*display:\s*none;[\s\S]*flex-wrap:\s*wrap;/,
      'expected the editor to expose a dedicated question-type picker row above the answer key'
    );

    assert.match(
      exampleCardCssSource,
      /\.example-card__type-button\.is-active\s*\{[\s\S]*background-color:\s*var\(--brand-primary,\s*#00A355\);[\s\S]*color:\s*#fff;/,
      'expected the active question-type pill to use the same green selection language as the answer-key pills'
    );
  });

  it('keeps the blank underline visible and reveals the answer in red without breaking the line', () => {
    assert.match(
      exampleCardCssSource,
      /\.example-card__blank\s*\{[\s\S]*display:\s*inline-block;[\s\S]*border-bottom:\s*2px\s+solid[\s\S]*color:\s*transparent;[\s\S]*text-align:\s*center;/,
      'expected the example-card blank slot to use one continuous underline instead of visible underscore glyph segments'
    );

    assert.match(
      exampleCardCssSource,
      /\.example-card__blank\.is-revealed\s*\{[\s\S]*color:\s*var\(--accent-red,\s*#ba1a1a\);[\s\S]*border-bottom-color:/,
      'expected blank answers to appear in red while keeping the underline visible after submit'
    );

    assert.match(
      exampleCardCssSource,
      /\.example-card__editor-multi-hint\.is-shaking\s*\{[\s\S]*animation:\s*example-card-multi-hint-shake/,
      'expected the multi-answer hint to expose a dedicated shake state when the user tries to leave editor mode too early'
    );
  });

  it('overrides the pre-submit orange halo with result-state glow colors after submit', () => {
    assert.match(
      exampleCardCssSource,
      /\.example-card \.qa-option\.result-correct\s*\{[\s\S]*box-shadow:\s*0\s+0\s+0\s+2px\s+rgba\(var\(--brand-primary-rgb,\s*0,\s*163,\s*85\),\s*0\.15\);/,
      'expected submitted correct options to replace the selected orange halo with a green glow'
    );

    assert.match(
      exampleCardCssSource,
      /\.example-card \.qa-option\.result-incorrect\s*\{[\s\S]*box-shadow:\s*0\s+0\s+0\s+2px\s+rgba\(186,\s*26,\s*26,\s*0\.15\);/,
      'expected submitted incorrect options to replace the selected orange halo with a red glow'
    );
  });

  it('forces inactive multi-question panes fully out of layout when hidden', () => {
    assert.match(
      exampleCardCssSource,
      /\.example-card__question\[hidden\]\s*\{[\s\S]*display:\s*none\s*!important;/,
      'expected multi-question example-card panes to keep an explicit hidden => display:none contract, otherwise the author rule .example-card__question { display:grid } will override the browser default hidden behavior and visible panes will stack on top of each other'
    );
  });

  it('keeps blank editor mode from showing both the answer-key chips and the blank answer input at the same time', () => {
    assert.match(
      exampleCardCssSource,
      /\.example-card__editor-answer-key\[hidden\],\s*\.example-card__editor-blank-answer\[hidden\]\s*\{[\s\S]*display:\s*none\s*!important;/,
      'expected blank-question editor rows to honor hidden even inside editor mode, otherwise the global editor display:flex rule will make the A/B/C/D answer-key chips leak back onto blank questions'
    );
  });
});