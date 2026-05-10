import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..', '..');
const doodleRuntimePath = path.join(projectRoot, 'assets', 'runtime', 'doodle-runtime.js');
const doodleRuntimeSource = fs.readFileSync(doodleRuntimePath, 'utf-8');

function createDoodleDom() {
  const html = `<!DOCTYPE html><html><body>
    <div class="slide active" data-slide="1">
      <div class="slide-content">Slide</div>
    </div>
  </body></html>`;

  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'http://localhost/'
  });

  const { window } = dom;
  window.alert = () => {};
  window.requestAnimationFrame = (callback) => {
    callback();
    return 1;
  };
  window.cancelAnimationFrame = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window._editorUtils = {
    getCurrentSlideIndex() {
      return 0;
    },
    getAllSlides() {
      return Array.from(window.document.querySelectorAll('.slide'));
    }
  };
  window.eval(doodleRuntimeSource);
  if (!window.DoodleManager.toggleBtn) {
    window.DoodleManager.init();
  }

  return dom;
}

describe('doodle runtime pointer cursor', () => {
  it('shows a pointer cursor when quiz runtime marks an underlying passthrough target as clickable', () => {
    const dom = createDoodleDom();
    const { window } = dom;

    window.DoodleManager.toggleDoodleMode();
    window.document.documentElement.dataset.qaDoodleCursor = 'pointer';

    window.document.body.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: 120, clientY: 140 }));

    assert.equal(window.document.documentElement.style.cursor, 'pointer', 'expected doodle mode to expose a hand cursor when the underlying passthrough target is clickable');
    assert.equal(window.DoodleManager.laserCursor.style.opacity, '0', 'expected the laser cursor to hide while the pointer is over a passthrough button');
  });
});