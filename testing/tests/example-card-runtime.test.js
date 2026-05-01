import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..', '..');
const runtimePath = path.join(projectRoot, 'assets', 'example-card-runtime.js');
const exampleCardCssPath = path.join(projectRoot, 'assets', 'zones', 'zone2-example-card.css');
const exampleCardCssSource = fs.readFileSync(exampleCardCssPath, 'utf-8');

function createExampleCardDom(bodyHtml, options = {}) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${bodyHtml}</body></html>`, {
    runScripts: 'outside-only',
    url: 'http://localhost/'
  });

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

  if (options.localStorageElements) {
    dom.window._editorUtils = {
      storageKey(suffix) {
        return `test:${suffix}`;
      },
      legacyStorageKey(suffix) {
        return `legacy:${suffix}`;
      }
    };

    Object.entries(options.localStorageElements).forEach(([editId, html]) => {
      dom.window.localStorage.setItem(`test:e:${editId}`, html);
    });
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
});