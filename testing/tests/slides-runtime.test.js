import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..', '..');
const runtimePath = path.join(projectRoot, 'assets', 'slides-runtime.js');
const runtimeSource = fs.readFileSync(runtimePath, 'utf-8');

function clickElement(window, element) {
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

function createSlidesDom() {
  const html = `<!DOCTYPE html><html class="editor-mode"><body class="editor-mode">
    <div id="particles"></div>
    <div id="progress"></div>
    <div id="counter"></div>
    <div id="slideNav"></div>
    <div class="deck">
      <div class="slide active" data-slide="1">
        <div class="anim-1">Slide 1</div>
      </div>
      <div class="slide" data-slide="2">
        <div class="anim-1">Slide 2</div>
      </div>
    </div>
  </body></html>`;

  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'http://localhost/'
  });

  const { window } = dom;
  window.console.log = () => {};
  window.setTimeout = (callback) => {
    callback();
    return 1;
  };
  window.clearTimeout = () => {};

  window.eval(runtimeSource);

  return dom;
}

describe('slides runtime', () => {
  it('finishes animations on the newly active slide while editor mode is enabled', () => {
    const dom = createSlidesDom();
    const { window } = dom;
    const finishCalls = [];
    const nextSlide = window.document.querySelector('.slide[data-slide="2"]');
    const secondDot = window.document.querySelectorAll('.slide-nav-dot')[1];

    nextSlide.getAnimations = () => [{ finish: () => finishCalls.push('finished') }];

    clickElement(window, secondDot);

    assert.ok(nextSlide.classList.contains('active'), 'expected dot navigation to activate the target slide');
    assert.equal(finishCalls.length, 1, 'expected editor mode navigation to finish the new slide animations immediately');
  });
});