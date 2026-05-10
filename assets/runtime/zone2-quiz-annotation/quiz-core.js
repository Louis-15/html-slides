/* ===========================================
   quiz-core.js
   答题与批注组件 — 工具函数与全局状态
   依赖：无（最先加载）
   =========================================== */

(function () {
  'use strict';
  var QA = window.QA = window.QA || {};

  /* =========================================
     组件查询与气泡排序
     ========================================= */

  /** 获取当前页面中的 quiz-annotation 组件（如果有） */
  QA.getActiveQA = function () {
    var activeSlide = document.querySelector('.slide.active');
    if (!activeSlide) return null;
    return activeSlide.querySelector('.quiz-annotation');
  };

  /** 获取组件内所有批注气泡，按 data-step 排序 */
  QA.getSortedBubbles = function (qa) {
    var bubbles = Array.from(qa.querySelectorAll('.qa-note-bubble'));
    bubbles.sort(function (a, b) {
      return (parseInt(a.dataset.step) || 0) - (parseInt(b.dataset.step) || 0);
    });
    return bubbles;
  };

  /** 获取中栏真实承载气泡的容器。栏头存在时优先使用 .qa-notes-list。 */
  QA.getNotesBubbleContainer = function (qa) {
    if (!qa) return null;
    return qa.querySelector('.qa-notes-list') || qa.querySelector('.qa-notes-panel');
  };

  /** 收集左栏正文锚点的 linkId 顺序（按 DOM 先后，去重） */
  QA.getOrderedPassageLinkIds = function (qa) {
    if (!qa) return [];
    var orderedLinkIds = [];
    var seen = new Set();

    qa.querySelectorAll('.qa-passage .text-anchor[data-link]').forEach(function (anchor) {
      var linkId = anchor.getAttribute('data-link') || '';
      if (!linkId || seen.has(linkId)) return;
      seen.add(linkId);
      orderedLinkIds.push(linkId);
    });

    return orderedLinkIds;
  };

  /** 统一把中栏气泡顺序拉回"左侧正文顺序优先"的规则 */
  QA.syncBubbleOrderToPassageAnchors = function (qa) {
    var notesContainer = QA.getNotesBubbleContainer(qa);
    if (!qa || !notesContainer) return;

    var bubbles = Array.from(notesContainer.children).filter(function (child) {
      return child.classList && child.classList.contains('qa-note-bubble');
    });
    if (bubbles.length <= 1) return;

    var bubbleByLinkId = new Map();
    bubbles.forEach(function (bubble) {
      var linkId = bubble.getAttribute('data-link') || '';
      if (linkId) bubbleByLinkId.set(linkId, bubble);
    });

    var orderedPassageBubbles = [];
    var placed = new Set();
    QA.getOrderedPassageLinkIds(qa).forEach(function (linkId) {
      var bubble = bubbleByLinkId.get(linkId);
      if (!bubble || placed.has(bubble)) return;
      placed.add(bubble);
      orderedPassageBubbles.push(bubble);
    });

    var remainingBubbles = bubbles.filter(function (bubble) {
      return !placed.has(bubble);
    });
    var desiredOrder = orderedPassageBubbles.concat(remainingBubbles);

    desiredOrder.forEach(function (bubble) {
      if (bubble.parentNode === notesContainer) {
        notesContainer.appendChild(bubble);
      }
    });
  };

  /** 获取左栏原文锚点元素 */
  QA.getAnchorByLink = function (qa, linkId) {
    return qa.querySelector('.text-anchor[data-link="' + linkId + '"]');
  };

  /** 获取右栏答题锚点元素 */
  QA.getAnswerAnchorByLink = function (qa, linkId) {
    if (!qa || !linkId) return null;
    return qa.querySelector('.answer-anchor[data-link-answer="' + linkId + '"], .answer-anchor[data-link="' + linkId + '"]');
  };

  /** 获取同一批注在右栏的所有端点 */
  QA.getAnswerAnchorsByLink = function (qa, linkId) {
    if (!qa || !linkId) return [];
    return Array.from(qa.querySelectorAll('.answer-anchor[data-link-answer="' + linkId + '"], .answer-anchor[data-link="' + linkId + '"]'));
  };

  /** 获取批注气泡元素 */
  QA.getBubbleByLink = function (qa, linkId) {
    return qa.querySelector('.qa-note-bubble[data-link="' + linkId + '"]');
  };

  /** 统一把气泡同步到"一个 linkId，对应左右两个端点"的规范模型 */
  QA.normalizeBubbleEndpointState = function (qa, bubble) {
    if (!qa || !bubble) {
      return { linkId: '', hasLeft: false, hasRight: false };
    }

    var linkId = bubble.getAttribute('data-link') || '';
    var hasLeft = !!QA.getAnchorByLink(qa, linkId);
    var hasRight = !!QA.getAnswerAnchorByLink(qa, linkId);

    if (hasRight) {
      bubble.dataset.linkAnswer = linkId;
    } else {
      delete bubble.dataset.linkAnswer;
      bubble.removeAttribute('data-link-answer');
    }

    return { linkId: linkId, hasLeft: hasLeft, hasRight: hasRight };
  };

  QA.normalizeAllBubbleEndpointStates = function (qa) {
    if (!qa) return;
    qa.querySelectorAll('.qa-note-bubble[data-link]').forEach(function (bubble) {
      QA.normalizeBubbleEndpointState(qa, bubble);
    });
  };

  /* =========================================
     内容持久化工具
     ========================================= */

  QA.readStoredEditableHTML = function (editId) {
    var utils = window._editorUtils;

    if (!editId || !utils || typeof utils.storageKey !== 'function') {
      return null;
    }

    try {
      return window.localStorage.getItem(utils.storageKey('e:' + editId));
    } catch (error) {
      return null;
    }
  };

  QA.getAnnotationStoreElementHTML = function (editId) {
    if (!editId || !window.AnnotationStore || typeof window.AnnotationStore.getInitData !== 'function') {
      return null;
    }

    var initData = window.AnnotationStore.getInitData();
    if (!initData || !initData.elements) {
      return null;
    }

    return Object.prototype.hasOwnProperty.call(initData.elements, editId)
      ? initData.elements[editId]
      : null;
  };

  QA.clearStoredEditableHTML = function (editId) {
    var utils = window._editorUtils;

    if (!editId || !utils || typeof utils.storageKey !== 'function') {
      return;
    }

    try {
      window.localStorage.removeItem(utils.storageKey('e:' + editId));
    } catch (error) {
      // 删除批注时清缓存只是兜底清理，不应因为存储异常阻断真正的删除流程。
    }
  };

  QA.hydrateDynamicNoteContent = function (contentEl) {
    if (!contentEl) return;

    var editId = contentEl.getAttribute('data-edit-id') || '';
    if (!editId) return;

    /* 普通页面正文的恢复顺序是本地缓存优先，sidecar 兜底。
       quiz 的动态气泡如果先吃到旧 sidecar，再吃 localStorage，就会把"第一次刷新里最新的本地改动"压回旧值，
       于是出现必须刷新两次才能看到最新批注的错觉。这里显式对齐普通页面的恢复优先级。 */
    var persistedHTML = QA.readStoredEditableHTML(editId) ?? QA.getAnnotationStoreElementHTML(editId);
    if (persistedHTML !== null) {
      contentEl.innerHTML = persistedHTML;
    }
  };

  /* =========================================
     模式检测
     ========================================= */

  QA.isEditorMode = function () {
    return document.documentElement.classList.contains('editor-mode') ||
      document.body.classList.contains('editor-mode');
  };

  QA.isDoodleMode = function () {
    return document.documentElement.classList.contains('doodle-mode') ||
      document.body.classList.contains('doodle-mode') ||
      !!(window.DoodleManager && window.DoodleManager.isActive);
  };

  QA.isDoodleDrawingActive = function () {
    return !!(window.DoodleManager && window.DoodleManager.isDrawing);
  };

  QA.shouldSuppressFragmentDiscovery = function (qa) {
    return !!(qa && qa.classList.contains('has-quiz') && !qa.classList.contains('submitted'));
  };

  QA.shouldLockKeyboardAnnotationStepping = function (qa) {
    if (!qa || qa.classList.contains('submitted')) return false;

    var answerPanel = qa.querySelector('.qa-answer-panel');
    if (!answerPanel) return false;

    /* 这里专门控制上下键的批注步进门禁：
       只要右栏还存在真实题目内容，并且整题尚未提交，
       上下键就不应该提前把中栏批注自动弹出来，避免学生在作答前被讲解打断。 */
    return !!answerPanel.querySelector('.qa-question, .qa-option, .qa-answer-slot, .qa-blank-slot[data-correct-answer]');
  };

  /* =========================================
     Doodle 模式穿透工具
     ========================================= */

  QA.getActiveDoodleLayer = function () {
    var activeSlide = document.querySelector('.slide.active');
    if (!activeSlide) return null;
    return activeSlide.querySelector('svg.doodle-layer');
  };

  QA.getElementBehindDoodleLayer = function (clientX, clientY) {
    if (typeof document.elementFromPoint !== 'function') return null;

    var doodleLayer = QA.getActiveDoodleLayer();
    if (!doodleLayer) {
      return document.elementFromPoint(clientX, clientY);
    }

    document.documentElement.classList.add('qa-doodle-hit-test');
    document.body.classList.add('qa-doodle-hit-test');
    try {
      return document.elementFromPoint(clientX, clientY);
    } finally {
      document.documentElement.classList.remove('qa-doodle-hit-test');
      document.body.classList.remove('qa-doodle-hit-test');
    }
  };

  QA.resolveDoodlePassthroughTarget = function (event) {
    if (!event || typeof event.clientX !== 'number' || typeof event.clientY !== 'number') return null;
    return QA.getElementBehindDoodleLayer(event.clientX, event.clientY);
  };

  /* =========================================
     样式标准化工具
     ========================================= */

  /** 旧模板里可能残留纯红或上一版偏橙的删除线，这里统一归一到新的更深红规格。 */
  QA.normalizeStrikethroughColor = function (colorValue) {
    var rawColor = String(colorValue || '').trim();
    var normalizedColor = rawColor.toLowerCase();
    if (!normalizedColor ||
      normalizedColor === 'var(--accent-red)' ||
      normalizedColor === '#ba1a1a' ||
      normalizedColor === '#e74c3c' ||
      normalizedColor === 'rgb(186, 26, 26)' ||
      normalizedColor === 'rgba(186, 26, 26, 1)' ||
      normalizedColor === 'rgba(186,26,26,1)' ||
      normalizedColor === 'rgb(231, 76, 60)' ||
      normalizedColor === 'rgba(231, 76, 60, 1)' ||
      normalizedColor === 'rgba(231,76,60,1)' ||
      normalizedColor === 'rgba(231, 76, 60, 0.4)' ||
      normalizedColor === 'rgba(231,76,60,0.4)') {
      return 'rgba(186, 26, 26, 0.4)';
    }
    return rawColor;
  };

  /** 旧数据没有显式 thickness 时，统一补到新的 3 倍粗删除线规格。 */
  QA.normalizeStrikethroughThickness = function (thicknessValue) {
    var rawThickness = String(thicknessValue || '').trim();
    if (!rawThickness) return '0.12em';
    return rawThickness;
  };

  /* =========================================
     角标智能避让
     ========================================= */

  QA.arrangeAdjacentBadges = function (qa) {
    if (!qa) return;
    /* 先清除所有角标之前设置的 inline marginLeft，防止 HTML 源码中残留的硬编码干扰运行时排版。 */
    qa.querySelectorAll('.note-badge').forEach(function (b) { b.style.marginLeft = ''; });
    var badges = Array.from(qa.querySelectorAll('.note-badge'));
    for (var i = 1; i < badges.length; i++) {
      var prevBadge = badges[i - 1];
      var currBadge = badges[i];
      var prevRect = prevBadge.getBoundingClientRect();
      var currRect = currBadge.getBoundingClientRect();
      if (Math.abs(prevRect.top - currRect.top) < 5 &&
        Math.abs(prevRect.right - currRect.left) < 5) {
        currBadge.style.marginLeft = '0px';
      }
    }
  };

  /* =========================================
     通用工具函数
     ========================================= */

  /** 平滑滚动到可见区域 */
  QA.scrollIntoViewSmooth = function (el) {
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

})();
