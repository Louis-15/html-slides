/* ===========================================
   普通页面隐藏型富文本标注 — 运行时宿主

   目标边界：
   1. 只处理普通页面、普通 [data-edit-id] 根块里的 authored fragment。
   2. 只负责放映态 reveal / rollback / 右键即时 reveal。
   3. 不进入一级步进队列，不接作者态工具条，不写回 authored 结构。
   =========================================== */

(function () {
  'use strict';

  const PAGE_FRAGMENT_HOST_CLASS = 'page-richtext-fragment-host';
  const slideFragmentState = new WeakMap();
  const fragmentIdentityKeys = new WeakMap();
  let fragmentIdentitySeed = 0;

  function isEditorMode() {
    return document.documentElement.classList.contains('editor-mode') ||
      document.body.classList.contains('editor-mode');
  }

  function getActiveSlide() {
    return document.querySelector('.slide.active');
  }

  function isQuizAnnotationSlide(slide) {
    return !!(slide && slide.querySelector('.quiz-annotation'));
  }

  function isOrdinaryEditRoot(root, slide) {
    if (!root || !slide || !slide.contains(root)) return false;
    if (root.closest('.quiz-annotation')) return false;

    const parentRoot = root.parentElement && root.parentElement.closest('[data-edit-id]');
    if (!parentRoot || !slide.contains(parentRoot)) return true;
    return !!parentRoot.closest('.quiz-annotation');
  }

  function getOrdinaryEditRoots(slide) {
    if (!slide) return [];
    return Array.from(slide.querySelectorAll('[data-edit-id]')).filter((root) => isOrdinaryEditRoot(root, slide));
  }

  function getSingleFragmentKey(fragment) {
    if (!fragmentIdentityKeys.has(fragment)) {
      fragmentIdentitySeed += 1;
      fragmentIdentityKeys.set(fragment, `single:${fragmentIdentitySeed}`);
    }
    return fragmentIdentityKeys.get(fragment);
  }

  function getFragmentIdentityKey(fragment) {
    if (!fragment) return '';
    const groupId = fragment.getAttribute('data-fragment-group');
    if (groupId) return `group:${groupId}`;
    return getSingleFragmentKey(fragment);
  }

  function collectFragmentEntries(slide) {
    if (!slide) return [];

    const entries = [];
    const entryMap = new Map();

    /* DOM 顺序是普通页面里唯一稳定、可恢复且与 authored 结构一致的权威顺序。
       这里不额外引入 step 编号，也不从运行时状态反推顺序，而是严格按普通 [data-edit-id] 根块
       和其内部 fragment 的文档先后构建 reveal 队列。这样即使作者稍后调整段落或切分片段，
       下一次放映也会自然以最新 authored DOM 为准，不需要额外迁移数据。 */
    getOrdinaryEditRoots(slide).forEach((root) => {
      root.querySelectorAll('[data-fragment-step="true"]').forEach((fragment) => {
        if (fragment.closest('.quiz-annotation')) return;
        if (fragment.closest('[data-edit-id]') !== root) return;

        const key = getFragmentIdentityKey(fragment);
        if (!entryMap.has(key)) {
          const entry = { key, fragments: [] };
          entryMap.set(key, entry);
          entries.push(entry);
        }

        entryMap.get(key).fragments.push(fragment);
      });
    });

    return entries;
  }

  function shouldEnableOrdinaryFragmentHost(slide) {
    if (!slide) return false;
    if (isQuizAnnotationSlide(slide)) return false;
    return collectFragmentEntries(slide).length > 0;
  }

  function syncSlideFragmentHostClass(slide) {
    if (!slide) return;

    /* 普通页面 fragment 的隐藏/显隐样式必须显式 opt-in，不能裸挂到所有 [data-edit-id]。
       原因是 mixed / quiz 页面里同样存在普通 data-edit-id 根块；如果 CSS 无条件生效，
       它们会先被普通页协议隐藏，但 JS 又因为“整页含 quiz 就禁用普通宿主”拿不到 reveal 路径，
       最终形成被隐藏却无法唤醒的死状态。这里用运行时 class 把结构资格和样式资格绑定到同一条件上。 */
    slide.classList.toggle(PAGE_FRAGMENT_HOST_CLASS, shouldEnableOrdinaryFragmentHost(slide));
  }

  function syncAllSlideFragmentHostClasses() {
    document.querySelectorAll('.slide').forEach((slide) => {
      syncSlideFragmentHostClass(slide);
    });
  }

  function resetSlideState(slide) {
    if (!slide) return;

    /* authored DOM 一旦被作者态改写，之前缓存的 cursor / visible 索引就只对应“旧顺序”。
       这里必须先把整页 reveal cache 和瞬时 class 清空，再按最新 DOM 重新计算宿主资格与片段队列，
       否则旧 visible index 会直接命中新顺序里的别的 fragment。 */
    slideFragmentState.delete(slide);
    slide.querySelectorAll('[data-fragment-step="true"]').forEach((fragment) => {
      fragment.classList.remove('qa-fragment-visible');
      fragment.removeAttribute('data-fragment-manual-reveal');
    });
  }

  function refreshSlide(slide) {
    if (!slide) return false;

    resetSlideState(slide);
    syncSlideFragmentHostClass(slide);
    syncSlideFragments(slide);
    return true;
  }

  function getSlideState(slide) {
    if (!slideFragmentState.has(slide)) {
      slideFragmentState.set(slide, {
        cursor: -1,
        visible: new Set(),
      });
    }
    return slideFragmentState.get(slide);
  }

  function syncSlideFragments(slide) {
    if (!slide) return;

    const entries = collectFragmentEntries(slide);
    const state = getSlideState(slide);

    Array.from(state.visible).forEach((index) => {
      if (index < 0 || index >= entries.length) {
        state.visible.delete(index);
      }
    });

    /* reveal / rollback 只是放映态瞬时状态，不能回写 authored HTML。
       因此这里仅切换运行时 class，不改 fragment 包裹层级、不改 group id，
       也不把当前显隐游标落盘。后续持久化仍然以作者保存下来的结构为准，
       避免把一次放映过程中的临时状态污染进 AnnotationStore 或编辑器恢复链路。 */
    entries.forEach((entry, index) => {
      const visible = state.visible.has(index);
      entry.fragments.forEach((fragment) => {
        fragment.classList.toggle('qa-fragment-visible', visible);
      });
    });
  }

  function canHandleSlide(slide) {
    if (!slide || isEditorMode()) return false;
    return shouldEnableOrdinaryFragmentHost(slide);
  }

  function stepFragmentsOnSlide(direction, slide) {
    if (!canHandleSlide(slide)) return false;

    const entries = collectFragmentEntries(slide);
    const state = getSlideState(slide);

    if (direction === 'forward') {
      while (state.cursor < entries.length - 1) {
        state.cursor += 1;
        if (state.visible.has(state.cursor)) continue;
        state.visible.add(state.cursor);
        syncSlideFragments(slide);
        return true;
      }
      return false;
    }

    const visibleIndexes = Array.from(state.visible).sort((a, b) => a - b);
    if (visibleIndexes.length === 0) return false;

    const hideIndex = visibleIndexes[visibleIndexes.length - 1];
    state.visible.delete(hideIndex);
    if (hideIndex <= state.cursor) {
      state.cursor = hideIndex - 1;
    }
    syncSlideFragments(slide);
    return true;
  }

  function revealFragmentImmediately(fragment) {
    if (!fragment) return false;

    const slide = fragment.closest('.slide');
    if (!canHandleSlide(slide)) return false;

    const entries = collectFragmentEntries(slide);
    const targetKey = getFragmentIdentityKey(fragment.closest('[data-fragment-step="true"]') || fragment);
    const index = entries.findIndex((entry) => entry.key === targetKey);
    if (index === -1) return false;

    const state = getSlideState(slide);
    state.visible.add(index);
    syncSlideFragments(slide);
    return true;
  }

  document.addEventListener('contextmenu', (event) => {
    const target = event.target && event.target.closest
      ? event.target.closest('[data-fragment-step="true"]')
      : null;
    if (!target) return;

    if (!revealFragmentImmediately(target)) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
  }, true);

  syncAllSlideFragmentHostClasses();
  if (typeof window.addSlideChangeListener === 'function') {
    window.addSlideChangeListener(() => {
      syncAllSlideFragmentHostClasses();
    });
  }

  window.PageRichTextAnnotationRuntime = {
    canHandleSlide,
    refreshSlide,
    resetSlideState,
    syncSlideFragmentHostClass,
    stepFragment(direction, slide) {
      return stepFragmentsOnSlide(direction, slide || getActiveSlide());
    },
    revealFragmentImmediately,
  };
})();