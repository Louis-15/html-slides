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

  // 这里直接读取待实现运行时，确保红灯阶段的失败会明确指向新能力缺失。
  const runtimeSource = fs.readFileSync(runtimePath, 'utf-8');

  dom.window.eval(runtimeSource);

  // 测试显式触发初始化，避免把用例结果绑定到 jsdom 的加载时序细节上。
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

    assert.ok(optionA, '测试夹具必须提供 A 选项按钮');
    assert.ok(optionB, '测试夹具必须提供 B 选项按钮');

    optionA.click();
    optionB.click();

    assert.equal(optionA.classList.contains('selected'), false);
    assert.equal(optionB.classList.contains('selected'), true);
  });
});