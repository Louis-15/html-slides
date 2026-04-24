/* ===========================================
   普通页面隐藏型富文本标注 — 运行时宿主

   目标边界：
   1. 只处理普通页面、普通 [data-edit-id] 根块里的 authored fragment。
   2. 只负责放映态 reveal / rollback / 右键即时 reveal。
  3. 二级 fragment 能力挂在“当前一级焦点组件宿主”上，不再让每个 ordinary root 单独入一级队列；
    同时不接作者态工具条，也不写回 authored 结构。
   =========================================== */

(function () {
  'use strict';

  const PAGE_FRAGMENT_HOST_CLASS = 'page-richtext-fragment-host';
  const PAGE_HOST_STEP_TYPE = 'page-richtext-host';
  const PAGE_HOST_MARKER_ATTR = 'data-page-richtext-host';
  const PAGE_HOST_STEP_MARKER_ATTR = 'data-page-richtext-steppable';
  const PAGE_FRAGMENT_HOVER_PROXY_CLASS = 'page-fragment-hover-proxy';
  const PAGE_COMPONENT_HOST_SELECTOR = [
    '.card',
    '.collapse-card',
    '.flip-card',
    '.highlight-card',
    '.stat-card',
    '.timeline-card',
    '.code-window',
    '.chart-container',
    '.table-wrap',
    '.image-block',
    '.content-block'
  ].join(', ');
  const HOVER_COOLDOWN_MS = 160;
  const hostFragmentState = new WeakMap();
  const fragmentIdentityKeys = new WeakMap();
  let fragmentIdentitySeed = 0;
  let activeDoodleProxyRoot = null;
  let lastHoverKey = '';
  let lastHoverTime = 0;

  function isEditorMode() {
    return document.documentElement.classList.contains('editor-mode') ||
      document.body.classList.contains('editor-mode');
  }

  function isDoodleMode() {
    return document.documentElement.classList.contains('doodle-mode') ||
      document.body.classList.contains('doodle-mode') ||
      !!(window.DoodleManager && window.DoodleManager.isActive);
  }

  function isDoodleDrawingActive() {
    return !!(window.DoodleManager && window.DoodleManager.isDrawing);
  }

  function getActiveSlide() {
    return document.querySelector('.slide.active');
  }

  function getActiveDoodleLayer() {
    const activeSlide = getActiveSlide();
    if (!activeSlide) return null;
    return activeSlide.querySelector('svg.doodle-layer');
  }

  function getElementBehindDoodleLayer(clientX, clientY) {
    if (typeof document.elementFromPoint !== 'function') return null;

    const doodleLayer = getActiveDoodleLayer();
    if (!doodleLayer) {
      return document.elementFromPoint(clientX, clientY);
    }

    /* 普通页与 quiz 共用 qa-doodle-hit-test 这个全局逃逸开关。
       原因不是“普通页也属于 quiz”，而是 doodle-runtime 只认这一套 class 来临时放开顶层 doodle layer 的命中测试。
       这里复用同一开关，能让普通页 fragment 也走完全相同的“顶层 SVG 透传到底层真实 DOM”路径，避免再造第二套 hit-test 协议。 */
    document.documentElement.classList.add('qa-doodle-hit-test');
    document.body.classList.add('qa-doodle-hit-test');
    try {
      return document.elementFromPoint(clientX, clientY);
    } finally {
      document.documentElement.classList.remove('qa-doodle-hit-test');
      document.body.classList.remove('qa-doodle-hit-test');
    }
  }

  function resolveDoodlePassthroughTarget(event) {
    if (!event || typeof event.clientX !== 'number' || typeof event.clientY !== 'number') return null;
    return getElementBehindDoodleLayer(event.clientX, event.clientY);
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

  function getOrdinaryRootIdentityKey(root) {
    if (!root) return '';
    return `root:${root.getAttribute('data-edit-id') || getSingleFragmentKey(root)}`;
  }

  function getFragmentEntryKey(root, fragment) {
    return `${getOrdinaryRootIdentityKey(root)}:${getFragmentIdentityKey(fragment)}`;
  }

  function collectFragmentEntriesForTextRoot(root) {
    if (!root) return [];

    const entries = [];
    const entryMap = new Map();

    root.querySelectorAll('[data-fragment-step="true"]').forEach((fragment) => {
      if (fragment.closest('.quiz-annotation')) return;
      if (fragment.closest('[data-edit-id]') !== root) return;

      const key = getFragmentEntryKey(root, fragment);
      if (!entryMap.has(key)) {
        const entry = { key, fragments: [] };
        entryMap.set(key, entry);
        entries.push(entry);
      }

      entryMap.get(key).fragments.push(fragment);
    });

    return entries;
  }

  function rootOwnsOrdinaryFragments(root) {
    return collectFragmentEntriesForTextRoot(root).length > 0;
  }

  function getOrdinaryFragmentRoots(slide) {
    if (!slide || isQuizAnnotationSlide(slide)) return [];
    return getOrdinaryEditRoots(slide).filter((root) => rootOwnsOrdinaryFragments(root));
  }

  function getSummaryTriggerHost(root, slide) {
    if (!root || !slide || !slide.contains(root)) return null;

    const summaryContainer = root.closest('.summary-content, .summary-panel');
    if (!summaryContainer || !slide.contains(summaryContainer)) return null;

    /* zone3 summary 的 trigger 与 panel / content 是兄弟节点，不存在可复用的祖先链。
       如果这里只靠 closest('[data-steppable], ...') 向上找，summary-panel 里的 ordinary root
       会被误判成 standalone host，结果就是 ← → 无法挂到 summary-trigger 当前焦点上，
       同时 ↑ ↓ 队列里还会额外塞进一个空的 ordinary root 步骤。 */
    const summaryTrigger = slide.querySelector('.summary-trigger');
    if (!summaryTrigger || !slide.contains(summaryTrigger) || summaryTrigger.closest('.quiz-annotation')) {
      return null;
    }

    return summaryTrigger;
  }

  function getOrdinaryFragmentHost(root, slide) {
    if (!root || !slide || !slide.contains(root)) return null;

    const summaryHost = getSummaryTriggerHost(root, slide);
    if (summaryHost) {
      return summaryHost;
    }

    /* 普通页二级 fragment 现在要挂到“当前一级焦点组件”上，而不是让每个 ordinary text root 都自己挤进一级队列。
       这样像 collapse-card、card 这类已有组件在第一次 ArrowDown 进入后，左右键就能立刻控制内部普通页 fragment，
       不会再出现“先进组件、再额外下一步进内部 root”的割裂体验。 */
    const host = root.parentElement && root.parentElement.closest(`[data-steppable], ${PAGE_COMPONENT_HOST_SELECTOR}`);
    if (host && slide.contains(host) && !host.closest('.quiz-annotation')) {
      return host;
    }

    return root;
  }

  function getOrdinaryFragmentHosts(slide) {
    if (!slide || isQuizAnnotationSlide(slide)) return [];

    const hosts = [];
    const hostSet = new Set();
    getOrdinaryFragmentRoots(slide).forEach((root) => {
      const host = getOrdinaryFragmentHost(root, slide);
      if (!host || hostSet.has(host)) return;
      hostSet.add(host);
      hosts.push(host);
    });
    return hosts;
  }

  function collectFragmentEntriesForHost(host) {
    if (!host) return [];

    const slide = host.closest('.slide');
    if (!slide || isQuizAnnotationSlide(slide)) return [];

    const entries = [];
    getOrdinaryFragmentRoots(slide).forEach((root) => {
      if (getOrdinaryFragmentHost(root, slide) !== host) return;
      entries.push(...collectFragmentEntriesForTextRoot(root));
    });
    return entries;
  }

  function shouldEnableOrdinaryFragmentHost(slide) {
    if (!slide) return false;
    if (isQuizAnnotationSlide(slide)) return false;
    return getOrdinaryFragmentHosts(slide).length > 0;
  }

  function syncHostSteppableState(host, enabled) {
    if (!host) return;

    if (enabled) {
      host.setAttribute(PAGE_HOST_MARKER_ATTR, 'true');
      if (!host.hasAttribute('data-steppable') || host.getAttribute('data-steppable') === PAGE_HOST_STEP_TYPE) {
        host.setAttribute('data-steppable', PAGE_HOST_STEP_TYPE);
        host.setAttribute(PAGE_HOST_STEP_MARKER_ATTR, 'true');
      }
      return;
    }

    host.removeAttribute(PAGE_HOST_MARKER_ATTR);
    if (host.getAttribute(PAGE_HOST_STEP_MARKER_ATTR) === 'true' && host.getAttribute('data-steppable') === PAGE_HOST_STEP_TYPE) {
      host.removeAttribute('data-steppable');
      host.classList.remove('step-active');
    }
    host.removeAttribute(PAGE_HOST_STEP_MARKER_ATTR);
  }

  function syncSlideOrdinaryHosts(slide) {
    if (!slide) return;

    const eligibleHosts = new Set(getOrdinaryFragmentHosts(slide));
    const candidates = new Set([
      ...slide.querySelectorAll('[data-edit-id]'),
      ...slide.querySelectorAll('[data-steppable]'),
      ...slide.querySelectorAll(PAGE_COMPONENT_HOST_SELECTOR),
      ...slide.querySelectorAll(`[${PAGE_HOST_MARKER_ATTR}]`),
      ...slide.querySelectorAll('[data-page-richtext-root]')
    ]);

    candidates.forEach((host) => {
      syncHostSteppableState(host, eligibleHosts.has(host));
      if (host.hasAttribute('data-page-richtext-root')) {
        host.removeAttribute('data-page-richtext-root');
      }
    });
  }

  function syncSlideFragmentHostClass(slide) {
    if (!slide) return;

    syncSlideOrdinaryHosts(slide);

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

  function isManagedOrdinaryHost(host, slide) {
    if (!host || !slide || !slide.contains(host)) return false;
    return host.getAttribute(PAGE_HOST_MARKER_ATTR) === 'true';
  }

  function isOrdinaryFragment(fragment) {
    if (!fragment || !fragment.closest) return false;

    const slide = fragment.closest('.slide');
    if (!slide || !shouldEnableOrdinaryFragmentHost(slide)) return false;

    const root = fragment.closest('[data-edit-id]');
    if (!root || !isOrdinaryEditRoot(root, slide)) return false;
    return fragment.closest('[data-edit-id]') === root;
  }

  function getOwningOrdinaryTextRoot(target) {
    if (!target || !target.closest) return null;

    const slide = target.closest('.slide');
    const root = target.closest('[data-edit-id]');
    if (!slide || !root || !isOrdinaryEditRoot(root, slide)) return null;
    if (!rootOwnsOrdinaryFragments(root)) return null;
    return root;
  }

  function getOwningOrdinaryHost(target) {
    if (!target || !target.closest) return null;

    const slide = target.closest('.slide');
    const root = getOwningOrdinaryTextRoot(target);
    if (!slide || !root) return null;
    return getOrdinaryFragmentHost(root, slide);
  }

  function resetSlideState(slide) {
    if (!slide) return;

    /* authored DOM 一旦被作者态改写，之前缓存的 cursor / visible 索引就只对应“旧顺序”。
       这里必须先把整页 reveal cache 和瞬时 class 清空，再按最新 DOM 重新计算宿主资格与片段队列，
       否则旧 visible index 会直接命中新顺序里的别的 fragment。 */
    getOrdinaryFragmentHosts(slide).forEach((host) => {
      hostFragmentState.delete(host);
    });

    getOrdinaryEditRoots(slide).forEach((root) => {
      root.classList.remove(PAGE_FRAGMENT_HOVER_PROXY_CLASS);
      root.querySelectorAll('[data-fragment-step="true"]').forEach((fragment) => {
        if (fragment.closest('[data-edit-id]') !== root) return;
        fragment.classList.remove('qa-fragment-visible');
        fragment.removeAttribute('data-fragment-manual-reveal');
      });
    });

    if (activeDoodleProxyRoot && slide.contains(activeDoodleProxyRoot)) {
      clearDoodleProxyFragment();
    }
  }

  function syncCurrentSlideInteractionQueue(slide, options) {
    if (!slide || slide !== getActiveSlide()) return false;
    if (typeof window.refreshInteractionQueueForCurrentSlide !== 'function') return false;
    window.refreshInteractionQueueForCurrentSlide(options || {});
    return true;
  }

  function refreshSlide(slide) {
    if (!slide) return false;

    resetSlideState(slide);
    syncSlideFragmentHostClass(slide);
    /* refreshSlide 面向作者态 DOM 重写场景。
       这时旧的一级焦点很可能已经指向被删掉或重排前的 root，
       必须连同当前页 interaction queue 一起复位到“无焦点”状态，
       下一次 ArrowDown 才会重新进入新的 owning root，而不是直接越过当前页。 */
    syncCurrentSlideInteractionQueue(slide, { resetFocus: true });
    return true;
  }

  function getHostState(host) {
    if (!hostFragmentState.has(host)) {
      hostFragmentState.set(host, {
        cursor: -1,
        visible: new Set(),
      });
    }
    return hostFragmentState.get(host);
  }

  function syncHostFragments(host) {
    if (!host) return;

    const entries = collectFragmentEntriesForHost(host);
    const state = getHostState(host);

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

  function playGlobalCue(name) {
    if (isEditorMode()) return false;
    if (!window.AudioRuntime || typeof window.AudioRuntime.playGlobalCue !== 'function') return false;
    return window.AudioRuntime.playGlobalCue(name);
  }

  function playFragmentStepSound(direction) {
    return playGlobalCue(direction === 'backward' ? 'fragment-swoosh-back' : 'fragment-swoosh');
  }

  function playFragmentHoverSound(root) {
    if (!root || isEditorMode()) return false;

    const hoverKey = getOrdinaryRootIdentityKey(root);
    const now = Date.now();
    if (hoverKey && lastHoverKey === hoverKey && (now - lastHoverTime) < HOVER_COOLDOWN_MS) {
      return false;
    }

    lastHoverKey = hoverKey;
    lastHoverTime = now;
    return playGlobalCue('ui-hover');
  }

  function setActiveDoodleProxyFragment(root) {
    if (activeDoodleProxyRoot === root) return false;

    if (activeDoodleProxyRoot) {
      activeDoodleProxyRoot.classList.remove(PAGE_FRAGMENT_HOVER_PROXY_CLASS);
    }

    activeDoodleProxyRoot = root || null;
    if (activeDoodleProxyRoot) {
      activeDoodleProxyRoot.classList.add(PAGE_FRAGMENT_HOVER_PROXY_CLASS);
    }
    return true;
  }

  function clearDoodleProxyFragment() {
    setActiveDoodleProxyFragment(null);
  }

  function resolveFocusedOrdinaryHost(slide, focusedElement) {
    if (!slide || !canHandleSlide(slide)) return null;
    if (!focusedElement || focusedElement.nodeType !== 1) return null;

    const host = focusedElement.matches && focusedElement.matches(`[${PAGE_HOST_MARKER_ATTR}="true"]`)
      ? focusedElement
      : (focusedElement.closest ? focusedElement.closest(`[${PAGE_HOST_MARKER_ATTR}="true"]`) : null);
    if (!isManagedOrdinaryHost(host, slide)) return null;
    return host;
  }

  function stepFragmentsOnHost(direction, host) {
    if (!host) return false;

    const entries = collectFragmentEntriesForHost(host);
    const state = getHostState(host);

    if (direction === 'forward') {
      while (state.cursor < entries.length - 1) {
        state.cursor += 1;
        if (state.visible.has(state.cursor)) continue;
        state.visible.add(state.cursor);
        syncHostFragments(host);
        playFragmentStepSound('forward');
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
    syncHostFragments(host);
    playFragmentStepSound('backward');
    return true;
  }

  function stepFragment(direction, slide, focusedElement) {
    const targetSlide = slide || getActiveSlide();
    const host = resolveFocusedOrdinaryHost(targetSlide, focusedElement);
    if (!host) return false;
    return stepFragmentsOnHost(direction, host);
  }

  function syncTopLevelFocusToHost(host) {
    if (!host || typeof window.activateInteractionStepForElement !== 'function') return false;
    return !!window.activateInteractionStepForElement(host);
  }

  function revealFragmentImmediately(fragment) {
    if (!isOrdinaryFragment(fragment)) return false;

    const slide = fragment.closest('.slide');
    const root = getOwningOrdinaryTextRoot(fragment);
    const host = getOwningOrdinaryHost(fragment);
    if (!canHandleSlide(slide) || !root || !host) return false;

    const entries = collectFragmentEntriesForHost(host);
    const targetKey = getFragmentEntryKey(root, fragment.closest('[data-fragment-step="true"]') || fragment);
    const index = entries.findIndex((entry) => entry.key === targetKey);
    if (index === -1) return false;

    const state = getHostState(host);
    const wasVisible = state.visible.has(index);
    state.visible.add(index);
    if (index > state.cursor) {
      state.cursor = index;
    }
    syncHostFragments(host);
    syncTopLevelFocusToHost(host);
    if (!wasVisible) {
      playFragmentStepSound('forward');
    }
    return true;
  }

  function handleOrdinaryFragmentHover(event) {
    if (isEditorMode()) {
      clearDoodleProxyFragment();
      return;
    }

    const eventTarget = event.target && event.target.nodeType === 1 ? event.target : null;
    const overDoodleLayer = !!(eventTarget && eventTarget.closest && eventTarget.closest('svg.doodle-layer'));

    if (isDoodleMode() && overDoodleLayer) {
      if (isDoodleDrawingActive()) {
        clearDoodleProxyFragment();
        return;
      }

      const resolvedTarget = resolveDoodlePassthroughTarget(event);
      const root = getOwningOrdinaryTextRoot(resolvedTarget);
      if (!root) {
        clearDoodleProxyFragment();
        return;
      }

      const changed = setActiveDoodleProxyFragment(root);
      if (changed) {
        playFragmentHoverSound(root);
      }
      return;
    }

    clearDoodleProxyFragment();
    /* hover / doodle proxy 现在统一按 text root 判定，而不是精确命中 fragment 本体。
       这样鼠标落在文本框留白、行间、或 doodle layer 透传到底层的任意子节点上时，
       同一个 text root 里的普通页 fragment 都会一起亮起橙色高光，音效也只按这个 root 去重一次。 */
    const root = getOwningOrdinaryTextRoot(eventTarget);
    if (!root) return;
    playFragmentHoverSound(root);
  }

  document.addEventListener('contextmenu', (event) => {
    if (isEditorMode()) return;

    const eventTarget = event.target && event.target.nodeType === 1 ? event.target : null;
    const overDoodleLayer = !!(eventTarget && eventTarget.closest && eventTarget.closest('svg.doodle-layer'));
    const resolvedTarget = overDoodleLayer ? resolveDoodlePassthroughTarget(event) : eventTarget;
    const target = resolvedTarget && resolvedTarget.closest
      ? resolvedTarget.closest('[data-fragment-step="true"]')
      : null;
    if (!target) return;

    if (!revealFragmentImmediately(target)) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener('pointermove', handleOrdinaryFragmentHover, true);

  if (typeof window.registerStepStrategy === 'function') {
    window.registerStepStrategy(PAGE_HOST_STEP_TYPE, {
      /* 普通页 host 现在分两类：已有一级组件壳，或 genuinely standalone 的文本框 root。
         不管是哪一类，一级步进都只负责“把当前焦点停在正确宿主上”，
         真正的 reveal / rollback 统一留给 ← →，这样当前宿主之外已 reveal 的片段才能稳定保留。 */
      canStepTopLevelForward() {
        return false;
      },
      canStepTopLevelBackward() {
        return false;
      },
      forwardTopLevel(root) {
        return !!root;
      },
      backwardTopLevel(root) {
        return !!root;
      }
    });
  }

  syncAllSlideFragmentHostClasses();
  syncCurrentSlideInteractionQueue(getActiveSlide());
  if (typeof window.addSlideChangeListener === 'function') {
    window.addSlideChangeListener(() => {
      clearDoodleProxyFragment();
      syncAllSlideFragmentHostClasses();
    });
  }

  window.PageRichTextAnnotationRuntime = {
    canHandleSlide,
    refreshSlide,
    resetSlideState,
    syncSlideFragmentHostClass,
    stepFragment(direction, slide, focusedElement) {
      return stepFragment(direction, slide || getActiveSlide(), focusedElement || null);
    },
    revealFragmentImmediately,
  };
})();