/* ===========================================
   quiz-toolbar.js
   答题与批注组件 — 浮动工具条与批注创建
   依赖：quiz-core.js、quiz-constants.js、quiz-fragments.js、
         quiz-persistence.js、quiz-dragdrop.js、quiz-linking.js、
         quiz-note-interactions.js
   =========================================== */

(function () {
  'use strict';
  var QA = window.QA = window.QA || {};

  /* =========================================
     选区矩形工具
     ========================================= */

  function getSelectionRects(range) {
    if (!range || typeof range.getClientRects !== 'function') return [];
    return Array.from(range.getClientRects()).filter(Boolean);
  }

  /* =========================================
     浮动工具栏定位
     ========================================= */

  QA.positionFloatingToolbar = function (toolbar, qa, range, offsetY) {
    if (!toolbar || !qa || !range) return false;
    var rects = getSelectionRects(range);
    if (rects.length === 0) return false;

    var firstRect = rects[0];
    var qaRect = qa.getBoundingClientRect();
    var ans = qa.querySelector('.qa-answer-panel');
    var inAnswer = ans && ans.contains(range.commonAncestorContainer);

    if (inAnswer) {
      // 右栏空间局促：改为右对齐，工具栏向左延伸，出现在选中文字的左上方
      toolbar.style.left = 'auto';
      toolbar.style.right = (qaRect.right - firstRect.left) + 'px';
    } else {
      // 左栏：保持左对齐，工具栏向右延伸，出现在选中文字的右上方
      toolbar.style.left = (firstRect.left - qaRect.left) + 'px';
      toolbar.style.right = 'auto';
    }

    toolbar.style.top = (firstRect.top - qaRect.top - (offsetY || 45)) + 'px';
    return true;
  };

  QA.positionAnchorToolbarBesideSelection = function (toolbar, range) {
    if (!toolbar || !range) return false;

    var rects = getSelectionRects(range);
    if (rects.length === 0) return false;

    var menu = toolbar.querySelector('.rt-dropdown-menu');
    var viewportW = window.innerWidth || document.documentElement.clientWidth || 1280;
    var viewportH = window.innerHeight || document.documentElement.clientHeight || 720;
    var gap = 12;
    var inset = 8;

    var selectionLeft = Math.min.apply(Math, rects.map(function (rect) { return rect.left; }));
    var selectionRight = Math.max.apply(Math, rects.map(function (rect) { return rect.right; }));
    var selectionTop = Math.min.apply(Math, rects.map(function (rect) { return rect.top; }));
    var selectionBottom = Math.max.apply(Math, rects.map(function (rect) { return rect.bottom; }));

    var menuRect = menu && typeof menu.getBoundingClientRect === 'function'
      ? menu.getBoundingClientRect()
      : { width: 0, height: 0 };
    var menuWidth = Math.max(menuRect.width || 0, 220);
    var menuHeight = Math.max(menuRect.height || 0, 140);

    var left = selectionRight + gap;
    if (left + menuWidth > viewportW - inset) {
      left = selectionLeft - menuWidth - gap;
    }
    if (left < inset) {
      left = Math.max(inset, Math.min(selectionRight + gap, viewportW - menuWidth - inset));
    }

    var top = ((selectionTop + selectionBottom) / 2) - (menuHeight / 2);
    var maxTop = Math.max(inset, viewportH - menuHeight - inset);
    top = Math.min(Math.max(inset, top), maxTop);

    toolbar.style.position = 'fixed';
    toolbar.style.left = Math.round(left) + 'px';
    toolbar.style.top = Math.round(top) + 'px';
    return true;
  };

  /* =========================================
     工具栏下拉菜单
     ========================================= */

  QA.clearToolbarDropdownMenus = function (toolbar) {
    if (!toolbar) return;
    toolbar.querySelectorAll('.rt-dropdown-menu').forEach(function (menu) {
      menu.classList.remove('show');
      menu.classList.remove('drop-up');
    });
  };

  QA.openAnchorToolbarDropdown = function (toolbar) {
    if (!toolbar) return;
    var menu = toolbar.querySelector('.rt-dropdown-menu');
    if (!menu) return;

    QA.clearToolbarDropdownMenus(toolbar);
    menu.classList.add('show');
  };

  /* =========================================
     选区文本分析
     ========================================= */

  function normalizeSentenceText(text) {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[。！？.!?]+$/, '')
      .trim();
  }

  function splitSentenceCandidates(text) {
    var rawText = String(text || '').replace(/\s+/g, ' ').trim();
    if (!rawText) return [];
    var matches = rawText.match(/[^。！？.!?]+[。！？.!?]?/g) || [];
    var candidates = matches.map(normalizeSentenceText).filter(Boolean);
    return candidates.length > 0 ? candidates : [normalizeSentenceText(rawText)].filter(Boolean);
  }

  function isSentenceLikeSelection(range) {
    if (!range) return false;
    var selectedText = normalizeSentenceText(range.toString());
    if (!selectedText) return false;

    var commonNode = QA.getSelectionRootNode(range.commonAncestorContainer);
    var sentenceHost = commonNode && commonNode.closest
      ? commonNode.closest('.qa-option-text, p, li, .qa-passage, .qa-answer-panel')
      : null;
    var hostText = normalizeSentenceText(sentenceHost ? sentenceHost.textContent : range.toString());
    if (!hostText) return false;

    var candidates = splitSentenceCandidates(hostText);
    return candidates.indexOf(selectedText) !== -1;
  }

  /* =========================================
     工具函数：选区根节点
     ========================================= */

  QA.getSelectionRootNode = function (node) {
    if (!node) return null;
    return node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
  };

  function getNodeDepth(node) {
    var depth = 0;
    var current = node;
    while (current && current.parentNode) {
      depth += 1;
      current = current.parentNode;
    }
    return depth;
  }

  function selectionIntersectsNode(range, node) {
    if (!range || !node) return false;
    if (typeof range.intersectsNode === 'function') {
      try {
        return range.intersectsNode(node);
      } catch (e) {
        return false;
      }
    }

    var nodeRange = document.createRange();
    nodeRange.selectNodeContents(node);
    return range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0 &&
      range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0;
  }

  function unwrapFragmentNode(fragment) {
    if (!fragment || !fragment.parentNode) return;
    var parent = fragment.parentNode;
    while (fragment.firstChild) {
      parent.insertBefore(fragment.firstChild, fragment);
    }
    parent.removeChild(fragment);
    parent.normalize();
  }

  /* =========================================
     格式化应用
     ========================================= */

  QA.clearNoteFragmentFormat = function () {
    var qa = QA.getActiveQA();
    var sel = window.getSelection();
    if (!qa || !sel || sel.isCollapsed || sel.rangeCount === 0) return;

    var range = sel.getRangeAt(0);
    var commonNode = QA.getSelectionRootNode(range.commonAncestorContainer);
    var anchor = QA.getFragmentOwnerAnchor(commonNode);
    if (!anchor) return;

    var fragments = Array.from(anchor.querySelectorAll('[data-fragment-step="true"]')).filter(function (fragment) { return selectionIntersectsNode(range, fragment); });
    if (fragments.length === 0) return;

    fragments.sort(function (left, right) { return getNodeDepth(right) - getNodeDepth(left); });
    fragments.forEach(function (fragment) { return unwrapFragmentNode(fragment); });

    var ownerLinkId = anchor.getAttribute('data-link-answer') || anchor.getAttribute('data-link') || '';
    var bubble = ownerLinkId ? QA.getBubbleByLink(qa, ownerLinkId) : null;
    if (bubble) {
      var state = QA.getNoteFragmentState(bubble);
      state.cursor = -1;
      state.visible.clear();
      QA.syncNoteFragments(bubble);
    }

    sel.removeAllRanges();
    QA.persistQuizAuthoringChange({ node: anchor, immediate: true });
  };

  /** 安全地将选区文本包裹进锚点 span */
  function wrapRangeInAnchor(range, anchor) {
    try {
      range.surroundContents(anchor);
    } catch (e) {
      // 选区跨越了元素边界，改用 extractContents + insertNode
      var fragment = range.extractContents();
      anchor.appendChild(fragment);
      range.insertNode(anchor);
    }
  }

  QA.applyNoteFragmentFormat = function (formatType, value) {
    var qa = QA.getActiveQA();
    var sel = window.getSelection();
    if (!qa || !sel || sel.isCollapsed || sel.rangeCount === 0) return;

    var range = sel.getRangeAt(0);
    var commonNode = QA.getSelectionRootNode(range.commonAncestorContainer);
    var anchor = QA.getFragmentOwnerAnchor(commonNode);
    if (!anchor) return;

    var ownerLinkId = anchor.getAttribute('data-link-answer') || anchor.getAttribute('data-link') || '';
    var bubble = ownerLinkId ? QA.getBubbleByLink(qa, ownerLinkId) : null;
    if (!bubble) return;

    var wrapper = document.createElement('span');
    wrapper.className = 'qa-note-fragment';
    wrapper.setAttribute('data-fragment-step', 'true');
    wrapper.setAttribute('data-fragment-group', QA.resolveSelectedFragmentGroupId(qa, range, commonNode));
    wrapper.setAttribute('data-fragment-format', formatType);

    if (formatType === 'color') {
      var fragmentColor = value || 'var(--accent-blue)';
      wrapper.style.setProperty('--qa-fragment-color', fragmentColor);
      wrapper.dataset.fragmentColor = fragmentColor;
      wrapRangeInAnchor(range, wrapper);
    } else if (formatType === 'highlight') {
      var fragmentHighlight = value || 'rgba(88, 166, 255, 0.15)';
      wrapper.style.setProperty('--qa-fragment-highlight', fragmentHighlight);
      wrapper.dataset.fragmentHighlight = fragmentHighlight;
      wrapRangeInAnchor(range, wrapper);
    } else if (formatType === 'strikethrough') {
      wrapper.style.setProperty('--qa-fragment-strike-color', 'rgba(186, 26, 26, 0.4)');
      wrapper.style.setProperty('--qa-fragment-strike-thickness', '0.12em');
      wrapper.dataset.fragmentStrikeColor = 'rgba(186, 26, 26, 0.4)';
      wrapper.dataset.fragmentStrikeThickness = '0.12em';
      wrapRangeInAnchor(range, wrapper);
    } else if (formatType === 'ruby') {
      var rubyText = value || '';
      wrapper.innerHTML = '<ruby>' + range.toString() + '<rt>' + rubyText + '</rt></ruby>';
      wrapRangeInAnchor(range, wrapper);
    }

    var state = QA.getNoteFragmentState(bubble);
    state.cursor = -1;
    state.visible.clear();
    QA.syncNoteFragments(bubble);
    sel.removeAllRanges();
    QA.persistQuizAuthoringChange({ node: anchor, immediate: true });
  };

  /** 创建新批注 */
  QA.createAnnotation = function (qa, format, colorStr) {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;

    var range = sel.getRangeAt(0);

    // 判断选区在左栏还是右栏
    var passage = qa.querySelector('.qa-passage');
    var answerPanel = qa.querySelector('.qa-answer-panel');
    var inPassage = passage && passage.contains(range.commonAncestorContainer);
    var inAnswer = answerPanel && answerPanel.contains(range.commonAncestorContainer);

    if (!inPassage && !inAnswer) return;

    // 新建批注的 id 不能复用 deletedNotes 里的 tombstone
    var newLinkId = QA.getNextNoteLinkId(qa);

    // 计算新的 step
    var allBubbles = qa.querySelectorAll('.qa-note-bubble');
    var newStep = allBubbles.length + 1;

    // 包裹选区为锚点
    var anchor = document.createElement('span');
    anchor.className = inPassage ? 'text-anchor' : 'answer-anchor';
    anchor.dataset[inPassage ? 'link' : 'linkAnswer'] = newLinkId;
    anchor.dataset.step = newStep;

    // 应用格式
    var formatStyles = {
      color: 'color: ' + (colorStr || 'var(--accent-blue)') + ';',
      highlight: 'background-color: ' + (colorStr || 'rgba(88, 166, 255, 0.15)') + ';',
      underline: 'text-decoration: underline; text-decoration-color: ' + (colorStr || 'var(--accent-blue)') + '; text-underline-offset: 4px; text-decoration-thickness: 2px; text-decoration-skip-ink: none;',
      strikethrough: 'text-decoration: line-through; text-decoration-color: rgba(186, 26, 26, 0.4); text-decoration-thickness: 0.12em;'
    };
    anchor.setAttribute('style', formatStyles[format] || '');

    wrapRangeInAnchor(range, anchor);

    // 添加角标
    var badge = document.createElement('sup');
    badge.className = 'note-badge';
    badge.textContent = newStep;
    anchor.appendChild(badge);

    // 即时清理，防止用户手滑框选到了首尾的空格影响排版
    QA.trimAnchorWhitespaces(anchor);

    // 在批注面板创建空气泡
    var notesList = qa.querySelector('.qa-notes-list');
    if (!notesList) return;

    var bubble = document.createElement('div');
    bubble.className = 'qa-note-bubble';
    bubble.dataset.link = newLinkId;
    if (inAnswer) {
      bubble.dataset.linkAnswer = newLinkId; // 从右栏创建时自动关联
    }
    bubble.dataset.step = newStep;
    // 默认关闭，仅在左侧手柄 hover 控制开启
    bubble.setAttribute('draggable', 'false');

    // 动态生成操作按钮
    var hasLeftLink = inPassage;
    var hasRightLink = inAnswer;
    var actionsHTML = '';
    if (!hasLeftLink) actionsHTML += '<button class="qa-note-action-btn link-btn action-link-left" title="关联左侧"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-cable-icon lucide-cable"><path d="M17 19a1 1 0 0 1-1-1v-2a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a1 1 0 0 1-1 1z"/><path d="M17 21v-2"/><path d="M19 14V6.5a1 1 0 0 0-7 0v11a1 1 0 0 1-7 0V10"/><path d="M21 21v-2"/><path d="M3 5V3"/><path d="M4 10a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2a2 2 0 0 1-2 2z"/><path d="M7 5V3"/></svg></button>';
    if (!hasRightLink) actionsHTML += '<button class="qa-note-action-btn link-btn action-link-right" title="关联右侧"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-cable-icon lucide-cable"><path d="M17 19a1 1 0 0 1-1-1v-2a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a1 1 0 0 1-1 1z"/><path d="M17 21v-2"/><path d="M19 14V6.5a1 1 0 0 0-7 0v11a1 1 0 0 1-7 0V10"/><path d="M21 21v-2"/><path d="M3 5V3"/><path d="M4 10a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2a2 2 0 0 1-2 2z"/><path d="M7 5V3"/></svg></button>';
    if (hasLeftLink) actionsHTML += '<button class="qa-note-action-btn action-unlink-left" title="取消左侧关联" style="color: var(--editor-danger, #e74c3c);"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-link-off"><g style="transform-origin: center; transform: scaleX(-1);"><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M9 15l3 -3m2 -2l1 -1" /><path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464" /><path d="M3 3l18 18" /><path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463" /></g></svg></button>';
    if (hasRightLink) actionsHTML += '<button class="qa-note-action-btn action-unlink-right" title="取消右侧关联" style="color: var(--editor-danger, #e74c3c);"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-link-off"><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M9 15l3 -3m2 -2l1 -1" /><path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464" /><path d="M3 3l18 18" /><path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463" /></svg></button>';
    if (hasLeftLink) actionsHTML += '<button class="qa-note-action-btn action-select-left" title="选中左侧原文" style="color: var(--text-dim, #8b949e);"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-symlink-icon"><path d="M20 11V4a2 2 0 0 0-2-2h-8a2.4 2.4 0 0 0-1.706.706l-3.588 3.588A2.4 2.4 0 0 0 4 8v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2h-7"/><path d="M10 2v5a1 1 0 0 1-1 1H4"/><path d="m14 18-3-3 3-3"/></svg></button>';
    if (hasRightLink) actionsHTML += '<button class="qa-note-action-btn action-select-right" title="选中右侧原文" style="color: var(--text-dim, #8b949e);"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-symlink-icon lucide-file-symlink"><path d="M4 11V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h7"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="m10 18 3-3-3-3"/></svg></button>';
    actionsHTML += '<button class="qa-note-action-btn action-delete" title="删除批注">✖</button>';

    bubble.innerHTML = '' +
      '<div class="qa-note-header">' +
        '<div class="qa-note-handle">' +
          '<span class="qa-note-step">' + newStep + '</span>' +
        '</div>' +
        '<div class="qa-note-actions">' + actionsHTML + '</div>' +
      '</div>' +
      '<div class="qa-note-content" contenteditable="true" data-edit-id="' + newLinkId + '"></div>';
    notesList.appendChild(bubble);

    // 先清除选区（必须在 focus 之前）
    sel.removeAllRanges();

    // 确保批注面板展开（可能触发 DOM 布局变动）
    if (!qa.classList.contains('notes-active')) {
      QA.toggleNotesPanel(qa);
    }

    // 只要新批注落在左侧正文，就按正文真实顺序把气泡插回正确位置，并重算后续序号。
    QA.recalcStepNumbers(qa);

    // 重新绑定事件
    QA.initNoteInteractions(qa);
    QA.initDragAndDrop(qa);

    // 持久化正文/答题区的锚点变更到 localStorage
    QA.persistAnchorChange(anchor, { immediate: true });

    // 【撤销栈】：记录新建批注变动，支持 Ctrl+Z 撤销
    if (window.historyMgr && !window.historyMgr.isRestoring) {
      window.historyMgr.recordState(true);
    }

    QA.updateProgressCounter(qa);

    if (QA.isEditorMode()) {
      QA.expandAllBubbles(qa);
    }

    // 最后再聚焦到新气泡的内容区（在所有 DOM 操作和事件绑定完成后）
    var contentEl = bubble.querySelector('.qa-note-content');
    if (contentEl) {
      QA.hydrateDynamicNoteContent(contentEl);
      // 内容变化时自动保存到 JSON 文件
      contentEl.addEventListener('input', function () {
        if (window.PersistenceLayer && typeof window.PersistenceLayer.saveElement === 'function') {
          window.PersistenceLayer.saveElement(contentEl);
        }
        QA.scheduleAnnotationSave();
      });
      contentEl.addEventListener('blur', function () {
        if (window.PersistenceLayer && typeof window.PersistenceLayer.saveElement === 'function') {
          window.PersistenceLayer.saveElement(contentEl);
        }
        QA.scheduleAnnotationSave();
      });
      // 延迟一帧聚焦，确保 DOM 布局已稳定
      requestAnimationFrame(function () { return contentEl.focus(); });
    }
  };

  /** 建立关联（关联模式下使用） */
  QA.createLinkAssociation = function (qa, format, colorStr) {
    if (!window.linkingState) return;
    var bubble = window.linkingState.bubble;
    var direction = window.linkingState.direction;
    var linkId = bubble.dataset.link;

    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;

    var range = sel.getRangeAt(0);

    // 创建锚点
    var anchor = document.createElement('span');
    var step = parseInt(bubble.dataset.step) || 1;

    if (direction === 'left') {
      // 关联左侧正文
      anchor.className = 'text-anchor';
      anchor.dataset.link = linkId;
    } else {
      // 关联右侧答题
      anchor.className = 'answer-anchor';
      anchor.dataset.linkAnswer = linkId;
      // 更新气泡的 data-link-answer
      bubble.dataset.linkAnswer = linkId;
    }
    anchor.dataset.step = step;

    // 应用格式
    var formatStyles = {
      color: 'color: ' + (colorStr || 'var(--accent-blue)') + ';',
      highlight: 'background-color: ' + (colorStr || 'rgba(88, 166, 255, 0.15)') + ';',
      underline: 'text-decoration: underline; text-decoration-color: ' + (colorStr || 'var(--accent-blue)') + '; text-underline-offset: 4px; text-decoration-thickness: 2px; text-decoration-skip-ink: none;',
      strikethrough: 'text-decoration: line-through; text-decoration-color: rgba(186, 26, 26, 0.4); text-decoration-thickness: 0.12em;'
    };
    anchor.setAttribute('style', formatStyles[format] || '');

    wrapRangeInAnchor(range, anchor);

    // 添加角标
    var badge = document.createElement('sup');
    badge.className = 'note-badge';
    badge.textContent = step;
    anchor.appendChild(badge);

    // 即时清理首尾空格
    QA.trimAnchorWhitespaces(anchor);

    // 移除关联按钮（已经关联了）
    var actionBtn = direction === 'left'
      ? bubble.querySelector('.action-link-left')
      : bubble.querySelector('.action-link-right');
    if (actionBtn) actionBtn.remove();

    // 退出关联模式
    QA.exitLinkingMode();

    // 右侧先建、后补左侧关联时，也必须立刻并入正文顺序。
    QA.recalcStepNumbers(qa);

    // 重新绑定事件
    QA.initNoteInteractions(qa);

    // 角标避让
    QA.arrangeAdjacentBadges(qa);

    // 持久化正文/答题区的锚点变更到 localStorage
    QA.persistAnchorChange(anchor, { immediate: true });

    // 【撤销栈】：记录关联变动，支持 Ctrl+Z 撤销
    if (window.historyMgr && !window.historyMgr.isRestoring) {
      window.historyMgr.recordState(true);
    }

    QA.updateProgressCounter(qa);
    sel.removeAllRanges();
  };

  /* =========================================
     工具条按钮绑定
     ========================================= */

  QA.bindFloatingToolbarButtons = function (toolbar, shouldToggleDropdown) {
    if (!toolbar || toolbar.dataset.toolbarBound === 'true') return;
    toolbar.dataset.toolbarBound = 'true';

    toolbar.querySelectorAll('.qa-toolbar-btn').forEach(function (btn) {
      btn.addEventListener('mousedown', function (e) { return e.preventDefault(); });
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();

        var format = btn.dataset.format;
        if (!format) return;

        // 如果 shouldToggleDropdown 返回 true，打开下拉菜单；否则直接应用
        if (typeof shouldToggleDropdown === 'function') {
          var result = shouldToggleDropdown(format);

          // 如果返回的是 dropdown 菜单元素，表示需要打开下拉
          var dropdown = btn.closest('.qa-format-dropdown');
          if (result && dropdown) {
            // 直接打开下拉菜单
            var menu = dropdown.querySelector('.rt-dropdown-menu');
            if (menu) {
              // 关闭同级别的其他下拉
              var toolbarEl = btn.closest('.qa-annotation-toolbar, .qa-note-fragment-toolbar, .page-richtext-fragment-toolbar');
              if (toolbarEl) QA.clearToolbarDropdownMenus(toolbarEl);
              menu.classList.add('show');
            }
          }
          // 如果返回 false，表示已经在 shouldToggleDropdown 内部处理了
        }
      });
    });
  };

  /* =========================================
     编辑模式工具条初始化
     ========================================= */

  QA.initAnnotationToolbar = function (qa) {
    var ownerId = QA.ensureQAToolbarOwnerId(qa);
    var toolbar = QA.getAnnotationToolbar(qa);
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.className = 'qa-annotation-toolbar qa-annotation-palette';
      toolbar.dataset.qaToolbarOwner = ownerId;
      toolbar.style.position = 'fixed';
      toolbar.style.left = '0px';
      toolbar.style.top = '0px';
      toolbar.innerHTML = '' +
        '<div class="rt-dropdown qa-format-dropdown qa-direct-underline-dropdown" title="选择下划线颜色">' +
          '<button class="qa-toolbar-btn btn-underline" data-format="underline" tabindex="-1" aria-hidden="true"><span style="text-decoration:underline;text-decoration-color:#3498db;font-weight:bold;">U</span></button>' +
          '<div class="rt-dropdown-menu"><div class="palette-grid ul-colors"></div></div>' +
        '</div>';
      document.body.appendChild(toolbar);

      var underlineColors = ['#2C3E50', '#E74C3C', '#E67E22', '#F1C40F', '#2ECC71', '#1ABC9C', '#3498DB', '#9B59B6', '#FD79A8'];
      var ulGrid = toolbar.querySelector('.ul-colors');
      if (ulGrid) {
        underlineColors.forEach(function (color) {
          var swatch = document.createElement('div');
          swatch.className = 'color-swatch';
          swatch.style.background = color;
          var handledByPointer = false;
          var applyUnderlineColor = function () {
            var curQA = QA.getActiveQA();
            if (!curQA) return;
            if (window.linkingState) {
              QA.createLinkAssociation(curQA, 'underline', color);
            } else {
              QA.createAnnotation(curQA, 'underline', color);
            }
            QA.hideQASelectionToolbars(curQA);
          };
          swatch.addEventListener('pointerdown', function (e) {
            e.preventDefault();
            e.stopPropagation();
            handledByPointer = true;
            applyUnderlineColor();
          });
          swatch.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (handledByPointer) {
              handledByPointer = false;
              return;
            }
            applyUnderlineColor();
          });
          ulGrid.appendChild(swatch);
        });
      }

      QA.bindFloatingToolbarButtons(toolbar, function (format) { return format === 'underline'; });
    }

    var fragmentToolbar = QA.getNoteFragmentToolbar(qa);
    if (!fragmentToolbar) {
      fragmentToolbar = document.createElement('div');
      fragmentToolbar.className = 'qa-note-fragment-toolbar';
      fragmentToolbar.innerHTML = '' +
        '<div class="qa-toolbar-label fragment-toolbar-label">隐藏型标注</div>' +
        '<div class="qa-toolbar-divider" aria-hidden="true"></div>' +
        '<div class="rt-dropdown qa-format-dropdown" title="文字颜色">' +
          '<button class="qa-toolbar-btn btn-color" data-format="color"><span style="font-weight:bold;color:#e74c3c;">A</span></button>' +
          '<div class="rt-dropdown-menu"><div class="palette-grid text-colors"></div></div>' +
        '</div>' +
        '<div class="rt-dropdown qa-format-dropdown" title="背景高光">' +
          '<button class="qa-toolbar-btn btn-highlight" data-format="highlight"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16" stroke="#f1c40f" stroke-width="6" opacity="0.5"/><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg></button>' +
          '<div class="rt-dropdown-menu"><div class="palette-grid bg-colors"></div></div>' +
        '</div>' +
        '<button class="qa-toolbar-btn btn-strikethrough" data-format="strikethrough" title="删除线"><s style="text-decoration-color:rgba(186, 26, 26, 0.4);text-decoration-thickness:0.12em;">S</s></button>' +
        '<button class="qa-toolbar-btn btn-ruby" data-format="ruby" title="顶标"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19h16"/><path d="m12 15 4-8 4 8"/><path d="M14 11h4"/><path d="M4 9h5"/><path d="M6 5h1"/></svg></button>' +
        '<div class="qa-toolbar-divider" aria-hidden="true"></div>' +
        '<button class="qa-toolbar-btn btn-remove-format" data-format="remove-format" title="清除格式">' + QA.REMOVE_FORMAT_TOOL_ICON + '</button>';
      qa.appendChild(fragmentToolbar);

      var textColors = ['#000000', '#2C3E50', '#7F8C8D', '#FD79A8', '#E74C3C', '#E67E22', '#F1C40F', '#2ECC71', '#1ABC9C', '#3498DB', '#9B59B6'];
      var highlightColors = [
        'rgba(231, 76, 60, 0.4)', 'rgba(230, 126, 34, 0.4)', 'rgba(241, 196, 15, 0.4)', 'rgba(46, 204, 113, 0.4)',
        'rgba(52, 152, 219, 0.4)', 'rgba(155, 89, 182, 0.4)', 'rgba(253, 121, 168, 0.4)', 'rgba(255, 255, 255, 0.4)',
        'rgba(0,0,0,0)'
      ];

      var colorGrid = fragmentToolbar.querySelector('.text-colors');
      if (colorGrid) {
        textColors.forEach(function (color) {
          var swatch = document.createElement('div');
          swatch.className = 'color-swatch';
          swatch.style.background = color;
          var handledByPointer = false;
          var applyTextColor = function () {
            QA.applyNoteFragmentFormat('color', color);
            QA.hideQASelectionToolbars(QA.getActiveQA());
          };
          swatch.addEventListener('pointerdown', function (e) {
            e.preventDefault();
            e.stopPropagation();
            handledByPointer = true;
            applyTextColor();
          });
          swatch.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (handledByPointer) {
              handledByPointer = false;
              return;
            }
            applyTextColor();
          });
          colorGrid.appendChild(swatch);
        });
      }

      var bgGrid = fragmentToolbar.querySelector('.bg-colors');
      if (bgGrid) {
        bgGrid.style.gridTemplateColumns = 'repeat(5, 1fr)';
        highlightColors.forEach(function (color) {
          var swatch = document.createElement('div');
          swatch.className = 'color-swatch';
          if (color === 'rgba(0,0,0,0)') {
            swatch.style.background = '#fff';
            swatch.innerHTML = '<div style="width:100%;height:100%;background:linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%),linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%);background-size:8px 8px;background-position:0 0,4px 4px;border-radius:3px;"></div>';
          } else {
            swatch.style.background = color;
          }
          var handledByPointer = false;
          var applyHighlightColor = function () {
            QA.applyNoteFragmentFormat('highlight', color);
            QA.hideQASelectionToolbars(QA.getActiveQA());
          };
          swatch.addEventListener('pointerdown', function (e) {
            e.preventDefault();
            e.stopPropagation();
            handledByPointer = true;
            applyHighlightColor();
          });
          swatch.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (handledByPointer) {
              handledByPointer = false;
              return;
            }
            applyHighlightColor();
          });
          bgGrid.appendChild(swatch);
        });
      }

      QA.bindFloatingToolbarButtons(fragmentToolbar, function (format) {
        if (format === 'strikethrough') {
          QA.applyNoteFragmentFormat('strikethrough');
          QA.hideQASelectionToolbars(QA.getActiveQA());
          return false;
        }
        if (format === 'ruby') {
          var rubyText = window.prompt('请输入顶标内容');
          if (rubyText && rubyText.trim()) {
            QA.applyNoteFragmentFormat('ruby', rubyText.trim());
          }
          QA.hideQASelectionToolbars(QA.getActiveQA());
          return false;
        }
        if (format === 'remove-format') {
          QA.clearNoteFragmentFormat();
          QA.hideQASelectionToolbars(QA.getActiveQA());
          return false;
        }
        return true;
      });
    }

    if (!document._qaToolbarPointerdownBound) {
      document._qaToolbarPointerdownBound = true;
      document.addEventListener('pointerdown', function (e) {
        var target = e.target && typeof e.target.closest === 'function' ? e.target : null;
        if (target && target.closest('.qa-format-dropdown')) return;
        var activeQA = QA.getActiveQA();
        if (activeQA) {
          QA.clearToolbarDropdownMenus(QA.getAnnotationToolbar(activeQA));
          QA.clearToolbarDropdownMenus(QA.getNoteFragmentToolbar(activeQA));
        }

        if (e.button !== 0 || !target || !QA.isEditorMode()) {
          window.qaSelectionPointerActive = false;
          window.qaSelectionPointerOwner = null;
          return;
        }

        var selectionSurface = target.closest('.qa-passage, .qa-answer-panel');
        window.qaSelectionPointerOwner = selectionSurface ? selectionSurface.closest('.quiz-annotation') : null;
        window.qaSelectionPointerActive = !!window.qaSelectionPointerOwner;

        if (window.qaSelectionPointerOwner) {
          QA.hideQASelectionToolbars(window.qaSelectionPointerOwner);
        }
      });
    }

    if (!document._qaSelectionPointerupBound) {
      document._qaSelectionPointerupBound = true;
      document.addEventListener('pointerup', function (e) {
        if (typeof e.button === 'number' && e.button !== 0) return;
        var targetQA = window.qaSelectionPointerOwner;
        var shouldRefresh = window.qaSelectionPointerActive && !!targetQA;
        window.qaSelectionPointerActive = false;
        window.qaSelectionPointerOwner = null;
        if (shouldRefresh) {
          QA.updateSelectionToolbars(targetQA);
        }
      });

      document.addEventListener('pointercancel', function () {
        window.qaSelectionPointerActive = false;
        window.qaSelectionPointerOwner = null;
      });
    }

    if (!document._qaSelectionchangeBound) {
      document._qaSelectionchangeBound = true;
      document.addEventListener('selectionchange', function () {
        var activeQA = QA.getActiveQA();
        if (!activeQA) return;

        if (window.qaSelectionPointerActive) {
          QA.hideQASelectionToolbars(activeQA);
          return;
        }

        QA.updateSelectionToolbars(activeQA);
      });
    }
  };

})();
