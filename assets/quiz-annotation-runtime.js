/* ===========================================
   答题与批注组件 — 运行时模块 v2
   quiz-annotation-runtime.js

   职责：
   1. 面板展开/收起（三栏布局状态管理）
   2. 分割线悬浮按钮（hover 浮现 📝 入口）
   3. 批注步进策略（annotation 策略注册）
   4. 角标点击 / 高亮原文 / 双向追视
   5. 双向 SVG 贝塞尔曲线连线（步进持久 + Hover 临时 + 边缘钉定）
   6. 批注气泡拖拽排序 + 统一序号同步（左中右三栏）
   7. 答题系统（选择/填空/连线拖拽/判分）
   8. 答题隔离规则 + 提交后批注浮现
   9. 气泡内容折叠
   10. 编辑模式：浮动工具条（左右两栏均可触发）+ 添加/删除批注
   11. 关联模式交互（🔗 关联左侧/右侧）
   12. 快捷键 D
   13. 批注进度指示器

   通过 registerStepStrategy() 接入步进系统，
   通过 data-scrollable 利用现有滚轮拦截。
   =========================================== */

(function() {
  'use strict';

  // =========================================
  // 工具函数
  // =========================================

  /** 获取当前页面中的 quiz-annotation 组件（如果有） */
  function getActiveQA() {
    const activeSlide = document.querySelector('.slide.active');
    if (!activeSlide) return null;
    return activeSlide.querySelector('.quiz-annotation');
  }

  /** 获取组件内所有批注气泡，按 data-step 排序 */
  function getSortedBubbles(qa) {
    const bubbles = Array.from(qa.querySelectorAll('.qa-note-bubble'));
    bubbles.sort((a, b) => {
      return (parseInt(a.dataset.step) || 0) - (parseInt(b.dataset.step) || 0);
    });
    return bubbles;
  }

  /** 获取左栏原文锚点元素 */
  function getAnchorByLink(qa, linkId) {
    return qa.querySelector(`.text-anchor[data-link="${linkId}"]`);
  }

  /** 获取右栏答题锚点元素 */
  function getAnswerAnchorByLink(qa, linkId) {
    return qa.querySelector(`.answer-anchor[data-link-answer="${linkId}"]`);
  }

  /** 获取批注气泡元素 */
  function getBubbleByLink(qa, linkId) {
    return qa.querySelector(`.qa-note-bubble[data-link="${linkId}"]`);
  }

  /** 剥离锚点首尾的文本空格（将空格移到 span 外部），防止下划线等样式意外延伸 */
  function trimAnchorWhitespaces(anchor) {
    if (!anchor) return;
    const textNodes = [];
    // 遍历锚点内的所有文本节点
    const walker = document.createTreeWalker(anchor, NodeFilter.SHOW_TEXT, null, false);
    let n;
    while (n = walker.nextNode()) {
      // 忽略角标内部的文本（否则剥离逻辑会被角标的数字阻断）
      const parentElement = n.parentNode.nodeType === 1 ? n.parentNode : n.parentNode.parentElement;
      if (parentElement && !parentElement.closest('.note-badge')) {
        textNodes.push(n);
      }
    }

    if (textNodes.length === 0) return;

    // 1. 剥离尾部空格
    let trailingSpaces = '';
    for (let i = textNodes.length - 1; i >= 0; i--) {
      let tNode = textNodes[i];
      let val = tNode.nodeValue;
      let match = val.match(/\s+$/);
      if (match && match[0] === val) { 
        trailingSpaces = val + trailingSpaces;
        tNode.nodeValue = '';
      } else if (match) {
        trailingSpaces = match[0] + trailingSpaces;
        tNode.nodeValue = val.substring(0, val.length - match[0].length);
        break; 
      } else {
        break;
      }
    }
    if (trailingSpaces) {
      anchor.parentNode.insertBefore(document.createTextNode(trailingSpaces), anchor.nextSibling);
    }

    // 2. 剥离首部空格
    let leadingSpaces = '';
    for (let i = 0; i < textNodes.length; i++) {
      let tNode = textNodes[i];
      let val = tNode.nodeValue;
      let match = val.match(/^\s+/);
      if (match && match[0] === val) {
        leadingSpaces += val;
        tNode.nodeValue = '';
      } else if (match) {
        leadingSpaces += match[0];
        tNode.nodeValue = val.substring(match[0].length);
        break;
      } else {
        break;
      }
    }
    if (leadingSpaces) {
      anchor.parentNode.insertBefore(document.createTextNode(leadingSpaces), anchor);
    }
  }

  /** 平滑滚动到可见区域 */
  function scrollIntoViewSmooth(el) {
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }


  // =========================================
  // 1. 面板展开/收起 状态管理
  // =========================================

  /** 切换批注面板 */
  function toggleNotesPanel(qa) {
    if (!qa) return;
    // 如果被答题隔离规则禁用，不允许展开
    if (qa.classList.contains('has-quiz') && !qa.classList.contains('submitted') &&
        !document.body.classList.contains('edit-mode')) {
      return;
    }
    const isActive = qa.classList.toggle('notes-active');

    // 展开时更新分割线位置
    if (isActive) {
      requestAnimationFrame(() => updateDividerPositions(qa));
    }

    // 更新进度指示器
    updateProgressCounter(qa);
  }


  // =========================================
  // 2. 分割线悬浮按钮 + 分割线位置
  // =========================================

  /** 更新分割线的 CSS 变量位置 */
  function updateDividerPositions(qa) {
    const body = qa.querySelector('.qa-body');
    if (!body) return;

    const bodyRect = body.getBoundingClientRect();
    const passage = qa.querySelector('.qa-passage');
    const notesPanel = qa.querySelector('.qa-notes-panel');

    if (passage) {
      const passageRect = passage.getBoundingClientRect();
      const pos1 = ((passageRect.right - bodyRect.left) / bodyRect.width * 100);
      body.style.setProperty('--divider-1-left', pos1 + '%');
    }

    if (notesPanel && qa.classList.contains('notes-active') && qa.classList.contains('has-quiz')) {
      const notesRect = notesPanel.getBoundingClientRect();
      const pos2 = ((notesRect.right - bodyRect.left) / bodyRect.width * 100);
      body.style.setProperty('--divider-2-left', pos2 + '%');
    }
  }

  /** 初始化分割线悬浮按钮 */
  function initDividerButton(qa) {
    const body = qa.querySelector('.qa-body');
    if (!body) return;

    // 创建悬浮按钮 DOM
    let dividerBtn = qa.querySelector('.qa-divider-btn');
    if (!dividerBtn) {
      dividerBtn = document.createElement('button');
      dividerBtn.className = 'qa-divider-btn';
      dividerBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/></svg>`;
      dividerBtn.title = '展开批注面板 (D)';
      body.appendChild(dividerBtn);
    }

    // 监听鼠标移动 — 检测是否在分割线 ±20px 范围内
    const HOVER_ZONE = 20; // 分割线两侧的感应范围（像素）

    body.addEventListener('mousemove', (e) => {
      // 批注已展开时不显示
      if (qa.classList.contains('notes-active')) return;
      // 答题隔离规则下不显示
      if (qa.classList.contains('has-quiz') && !qa.classList.contains('submitted') &&
          !document.body.classList.contains('edit-mode')) {
        dividerBtn.classList.remove('visible');
        return;
      }

      const bodyRect = body.getBoundingClientRect();

      // 获取第一条分割线的实际位置
      const passage = qa.querySelector('.qa-passage');
      if (!passage) return;
      const dividerX = passage.getBoundingClientRect().right;

      // 检测鼠标是否在分割线附近
      const mouseX = e.clientX;
      if (Math.abs(mouseX - dividerX) <= HOVER_ZONE) {
        // 浮现按钮，Y 轴跟随鼠标
        dividerBtn.style.left = (dividerX - bodyRect.left) + 'px';
        dividerBtn.style.top = (e.clientY - bodyRect.top - 16) + 'px'; // 居中对齐
        dividerBtn.classList.add('visible');
      } else {
        dividerBtn.classList.remove('visible');
      }
    });

    // 鼠标离开 body 时隐藏按钮
    body.addEventListener('mouseleave', () => {
      dividerBtn.classList.remove('visible');
    });

    // 点击悬浮按钮 → 展开批注面板
    dividerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleNotesPanel(qa);
    });
  }


  // =========================================
  // 3. 批注步进策略
  // =========================================

  /** 当前活跃的批注内部步进索引（-1 表示无） */
  let annotationStepIndex = -1;

  /** 注册 annotation 步进策略 */
  if (typeof window.registerStepStrategy === 'function') {
    window.registerStepStrategy('annotation', {
      forward(el) {
        const qa = el.closest('.quiz-annotation') || el;
        const bubbles = getSortedBubbles(qa);
        if (bubbles.length === 0) return;

        // 确保批注面板已展开
        if (!qa.classList.contains('notes-active')) {
          toggleNotesPanel(qa);
        }

        annotationStepIndex++;
        if (annotationStepIndex >= bubbles.length) {
          annotationStepIndex = bubbles.length - 1;
        }
        activateNote(qa, bubbles[annotationStepIndex]);
      },
      backward(el) {
        const qa = el.closest('.quiz-annotation') || el;
        const bubbles = getSortedBubbles(qa);

        if (annotationStepIndex >= 0) {
          deactivateNote(qa, bubbles[annotationStepIndex]);
        }
        annotationStepIndex--;
        if (annotationStepIndex >= 0 && annotationStepIndex < bubbles.length) {
          activateNote(qa, bubbles[annotationStepIndex]);
        } else {
          clearAllActive(qa);
          annotationStepIndex = -1;
        }
      },
      hasNextStep(el) {
        const qa = el.closest('.quiz-annotation') || el;
        const bubbles = getSortedBubbles(qa);
        return annotationStepIndex < bubbles.length - 1;
      }
    });
  }


  // =========================================
  // 4. 批注激活与降噪
  // =========================================

  /** 激活指定批注 */
  function activateNote(qa, bubble) {
    if (!qa || !bubble) return;
    const linkId = bubble.dataset.link;
    const answerLinkId = bubble.dataset.linkAnswer; // 可选的右侧关联

    // 清除其他激活状态
    clearAllActive(qa);

    // 激活气泡
    bubble.classList.add('note-active');
    // 自动展开折叠内容
    bubble.classList.add('note-expanded');
    qa.classList.add('has-active-note');

    // 激活左栏原文锚点
    const anchor = getAnchorByLink(qa, linkId);
    if (anchor) anchor.classList.add('anchor-active');

    // 激活右栏答题锚点（如果有）
    if (answerLinkId) {
      const answerAnchor = getAnswerAnchorByLink(qa, linkId);
      if (answerAnchor) answerAnchor.classList.add('anchor-active');
    }

    // 绘制双向步进连线（持久）
    drawStepConnectors(qa, bubble);

    // 三栏双向追视
    scrollIntoViewSmooth(bubble);
    if (anchor) scrollIntoViewSmooth(anchor);
    if (answerLinkId) {
      const ansAnchor = getAnswerAnchorByLink(qa, linkId);
      if (ansAnchor) scrollIntoViewSmooth(ansAnchor);
    }

    // 更新进度指示器
    updateProgressCounter(qa);
  }

  /** 取消指定批注激活 */
  function deactivateNote(qa, bubble) {
    if (!bubble) return;
    bubble.classList.remove('note-active', 'note-expanded');
    const linkId = bubble.dataset.link;
    const anchor = getAnchorByLink(qa, linkId);
    if (anchor) anchor.classList.remove('anchor-active');
    // 清除右栏锚点激活
    const ansAnchor = getAnswerAnchorByLink(qa, linkId);
    if (ansAnchor) ansAnchor.classList.remove('anchor-active');
  }

  /** 清除所有激活状态 */
  function clearAllActive(qa) {
    if (!qa) return;
    qa.querySelectorAll('.note-active').forEach(b => b.classList.remove('note-active', 'note-expanded'));
    qa.querySelectorAll('.anchor-active').forEach(a => a.classList.remove('anchor-active'));
    qa.classList.remove('has-active-note');
    clearStepConnectors(qa);
  }


  // =========================================
  // 5. 双向 SVG 连线系统
  // =========================================

  /** 确保 SVG 画布存在 */
  function ensureCanvas(qa) {
    let canvas = qa.querySelector('.qa-connector-canvas');
    if (!canvas) {
      canvas = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      canvas.setAttribute('class', 'qa-connector-canvas');
      const body = qa.querySelector('.qa-body');
      if (body) body.appendChild(canvas);
    }
    return canvas;
  }

  /** 绘制步进连线（双向，持久） */
  function drawStepConnectors(qa, bubble) {
    clearStepConnectors(qa);
    if (!bubble) return;
    const canvas = ensureCanvas(qa);
    const linkId = bubble.dataset.link;
    const hasAnswerLink = bubble.dataset.linkAnswer;

    // 左侧连线：原文锚点 → 气泡
    const leftLine = createLeftConnectorLine(qa, linkId, 'connector-step');
    if (leftLine) canvas.appendChild(leftLine);

    // 右侧连线：气泡 → 答题锚点（如果有关联）
    if (hasAnswerLink) {
      const rightLine = createRightConnectorLine(qa, linkId, 'connector-step');
      if (rightLine) canvas.appendChild(rightLine);
    }
  }

  /** 清除步进连线 */
  function clearStepConnectors(qa) {
    if (!qa) return;
    const canvas = qa.querySelector('.qa-connector-canvas');
    if (canvas) {
      canvas.querySelectorAll('.connector-step').forEach(l => l.remove());
      canvas.querySelectorAll('.qa-edge-arrow.arrow-step').forEach(a => a.remove());
    }
  }

  /** 绘制 Hover 临时连线（双向） */
  function drawHoverConnectors(qa, bubble) {
    clearHoverConnectors(qa);
    if (!bubble) return;
    const canvas = ensureCanvas(qa);
    const linkId = bubble.dataset.link;
    const hasAnswerLink = bubble.dataset.linkAnswer;

    const leftLine = createLeftConnectorLine(qa, linkId, 'connector-hover');
    if (leftLine) canvas.appendChild(leftLine);

    if (hasAnswerLink) {
      const rightLine = createRightConnectorLine(qa, linkId, 'connector-hover');
      if (rightLine) canvas.appendChild(rightLine);
    }
  }

  /** 清除 Hover 临时连线 */
  function clearHoverConnectors(qa) {
    if (!qa) return;
    const canvas = qa.querySelector('.qa-connector-canvas');
    if (canvas) {
      canvas.querySelectorAll('.connector-hover').forEach(l => l.remove());
      canvas.querySelectorAll('.qa-edge-arrow.arrow-hover').forEach(a => a.remove());
    }
  }

  /**
   * 检测元素是否在其滚动容器的可见范围内
   * 返回 { visible, direction } direction: 'up'|'down'|null
   */
  function checkVisibility(el, scrollContainer) {
    if (!el || !scrollContainer) return { visible: false, direction: null };
    const elRect = el.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();

    if (elRect.bottom < containerRect.top) {
      return { visible: false, direction: 'up' };
    }
    if (elRect.top > containerRect.bottom) {
      return { visible: false, direction: 'down' };
    }
    return { visible: true, direction: null };
  }

  /** 创建左侧连线：正文角标 → 气泡序号球 */
  function createLeftConnectorLine(qa, linkId, className) {
    const anchor = getAnchorByLink(qa, linkId);
    const bubble = getBubbleByLink(qa, linkId);
    if (!anchor || !bubble) return null;

    const badge = anchor.querySelector('.note-badge') || anchor;
    const step = bubble.querySelector('.qa-note-step') || bubble;

    const body = qa.querySelector('.qa-body');
    if (!body) return null;
    const bodyRect = body.getBoundingClientRect();

    // 检测锚点可见性（边缘钉定）
    const passage = qa.querySelector('.qa-passage');
    const anchorVis = checkVisibility(badge, passage);

    let x1, y1;
    if (anchorVis.visible) {
      const badgeRect = badge.getBoundingClientRect();
      x1 = badgeRect.right - bodyRect.left;
      y1 = badgeRect.top + badgeRect.height / 2 - bodyRect.top;
    } else {
      // 钉定在左栏边缘
      const passageRect = passage.getBoundingClientRect();
      x1 = passageRect.right - 20 - bodyRect.left;
      y1 = anchorVis.direction === 'up'
        ? passageRect.top - bodyRect.top + 10
        : passageRect.bottom - bodyRect.top - 10;
    }

    const stepRect = step.getBoundingClientRect();
    const x2 = stepRect.left - bodyRect.left;
    const y2 = stepRect.top + stepRect.height / 2 - bodyRect.top;

    // 贝塞尔控制点
    const dx = Math.abs(x2 - x1) * 0.4;
    const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', `qa-connector-line ${className}`);
    path.dataset.link = linkId;

    // 如果锚点出屏，在钉定端画箭头
    if (!anchorVis.visible) {
      const arrowType = className.includes('step') ? 'arrow-step' : 'arrow-hover';
      drawEdgeArrow(qa, x1, y1, anchorVis.direction, arrowType, linkId);
    }

    return path;
  }

  /** 创建右侧连线：气泡序号球 → 答题角标 */
  function createRightConnectorLine(qa, linkId, className) {
    const bubble = getBubbleByLink(qa, linkId);
    if (!bubble) return null;

    // 查找右栏中与该批注关联的答题锚点
    const answerAnchor = qa.querySelector(`.answer-anchor[data-link-answer="${linkId}"]`);
    if (!answerAnchor) return null;

    const step = bubble.querySelector('.qa-note-step') || bubble;
    const ansBadge = answerAnchor.querySelector('.note-badge') || answerAnchor;

    const body = qa.querySelector('.qa-body');
    if (!body) return null;
    const bodyRect = body.getBoundingClientRect();

    const stepRect = step.getBoundingClientRect();
    const x1 = stepRect.right - bodyRect.left;
    const y1 = stepRect.top + stepRect.height / 2 - bodyRect.top;

    // 检测答题锚点可见性
    const answerContent = qa.querySelector('.qa-answer-content');
    const ansVis = checkVisibility(ansBadge, answerContent);

    let x2, y2;
    if (ansVis.visible) {
      const ansBadgeRect = ansBadge.getBoundingClientRect();
      x2 = ansBadgeRect.left - bodyRect.left;
      y2 = ansBadgeRect.top + ansBadgeRect.height / 2 - bodyRect.top;
    } else {
      // 钉定在右栏边缘
      const ansRect = answerContent ? answerContent.getBoundingClientRect() : qa.querySelector('.qa-answer-panel').getBoundingClientRect();
      x2 = ansRect.left + 20 - bodyRect.left;
      y2 = ansVis.direction === 'up'
        ? ansRect.top - bodyRect.top + 10
        : ansRect.bottom - bodyRect.top - 10;
    }

    const dx = Math.abs(x2 - x1) * 0.4;
    const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', `qa-connector-line ${className}`);
    path.dataset.link = linkId;

    if (!ansVis.visible) {
      const arrowType = className.includes('step') ? 'arrow-step' : 'arrow-hover';
      drawEdgeArrow(qa, x2, y2, ansVis.direction, arrowType, linkId);
    }

    return path;
  }

  /** 绘制边缘钉定箭头 */
  function drawEdgeArrow(qa, x, y, direction, className, linkId) {
    const canvas = ensureCanvas(qa);
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    const size = 6;
    let points;
    if (direction === 'up') {
      points = `${x - size},${y + size} ${x + size},${y + size} ${x},${y - size}`;
    } else {
      points = `${x - size},${y - size} ${x + size},${y - size} ${x},${y + size}`;
    }
    arrow.setAttribute('points', points);
    arrow.setAttribute('class', `qa-edge-arrow ${className}`);
    arrow.dataset.link = linkId;

    // 点击箭头 → 重新激活该批注（触发 scrollIntoView）
    arrow.addEventListener('click', () => {
      const bubble = getBubbleByLink(qa, linkId);
      if (bubble) {
        const bubbles = getSortedBubbles(qa);
        annotationStepIndex = bubbles.indexOf(bubble);
        activateNote(qa, bubble);
      }
    });

    canvas.appendChild(arrow);
  }


  // =========================================
  // 6. 拖拽排序
  // =========================================

  let draggedBubble = null;

  function initDragAndDrop(qa) {
    const notesList = qa.querySelector('.qa-notes-list');
    if (!notesList) return;

    const placeholder = document.createElement('div');
    placeholder.className = 'qa-note-placeholder';

    // 为每个气泡绑定拖拽事件
    qa.querySelectorAll('.qa-note-bubble').forEach(b => bindDragEvents(qa, b, placeholder));

    // 容器级委托 dragover
    notesList.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!draggedBubble) return;
      const afterElement = getDragAfterElement(notesList, e.clientY);
      if (afterElement == null) {
        notesList.appendChild(placeholder);
      } else {
        notesList.insertBefore(placeholder, afterElement);
      }
    });
  }

  /** 绑定单个气泡的拖拽事件 */
  function bindDragEvents(qa, b, placeholder) {
    // 默认关闭全局 draggable，防止覆盖输入框内的原生文字拖拽和选区
    b.setAttribute('draggable', 'false');

    const handle = b.querySelector('.qa-note-handle');
    if (handle) {
      // 只有在左侧把手上按下鼠标时，才临时开启该气泡的拖拽能力
      handle.addEventListener('mousedown', () => b.setAttribute('draggable', 'true'));
      handle.addEventListener('mouseup', () => b.setAttribute('draggable', 'false'));
      handle.addEventListener('mouseleave', () => b.setAttribute('draggable', 'false'));
    }

    b.addEventListener('dragstart', (e) => {
      // 若不是由 handle 唤醒的拖拽行为，直接阻止
      if (b.getAttribute('draggable') !== 'true') {
        e.preventDefault();
        return;
      }
      
      draggedBubble = b;
      b.classList.add('dragging-source');
      e.dataTransfer.effectAllowed = 'move';
      placeholder.style.minHeight = b.offsetHeight + 'px';
      setTimeout(() => b.style.display = 'none', 0);
    });

    b.addEventListener('dragend', () => {
      b.setAttribute('draggable', 'false');
      if (draggedBubble) {
        draggedBubble.classList.remove('dragging-source');
        draggedBubble.style.display = '';
      }
      if (placeholder.parentNode && draggedBubble) {
        placeholder.parentNode.replaceChild(draggedBubble, placeholder);
      }
      draggedBubble = null;

      // 重算 data-step 序号（统一序号：左中右三栏同步）
      recalcStepNumbers(qa);

      // 恢复激活状态和更新连线
      const activeBubble = qa.querySelector('.qa-note-bubble.note-active');
      if (activeBubble) {
        const bubbles = getSortedBubbles(qa);
        annotationStepIndex = bubbles.indexOf(activeBubble);
        updateProgressCounter(qa);
        window.requestAnimationFrame(() => drawStepConnectors(qa, activeBubble));
      } else {
        updateProgressCounter(qa);
      }
    });
  }

  /** 获取拖拽位置下方最近的气泡 */
  function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.qa-note-bubble:not(.dragging-source)')];
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  /** 重算所有气泡的 data-step 序号并同步左右两栏角标（统一序号系统） */
  function recalcStepNumbers(qa) {
    const allBubbles = qa.querySelectorAll('.qa-note-bubble');
    allBubbles.forEach((bubble, index) => {
      const newStep = index + 1;
      bubble.dataset.step = newStep;
      // 更新气泡内的序号显示
      const stepEl = bubble.querySelector('.qa-note-step');
      if (stepEl) stepEl.textContent = newStep;

      // 同步左栏原文锚点的 data-step 和角标
      const linkId = bubble.dataset.link;
      const anchor = getAnchorByLink(qa, linkId);
      if (anchor) {
        anchor.dataset.step = newStep;
        const badge = anchor.querySelector('.note-badge');
        if (badge) badge.textContent = newStep;
      }

      // 同步右栏答题锚点的角标
      const answerAnchors = qa.querySelectorAll(`.answer-anchor[data-link-answer="${linkId}"]`);
      answerAnchors.forEach(aa => {
        const badge = aa.querySelector('.note-badge');
        if (badge) badge.textContent = newStep;
      });
    });
  }


  // =========================================
  // 7. 答题系统
  // =========================================

  function initQuizSystem(qa) {
    // 检测是否有答题内容
    const answerContent = qa.querySelector('.qa-answer-content');
    if (answerContent && answerContent.children.length > 0) {
      qa.classList.add('has-quiz');
    }

    // — 选择题点选 —
    qa.querySelectorAll('.qa-option').forEach(option => {
      option.addEventListener('click', () => {
        if (document.documentElement.classList.contains('editor-mode')) return;
        if (qa.classList.contains('submitted')) return;

        const isMulti = option.closest('.qa-question')?.dataset.type === 'multi';
        if (!isMulti) {
          option.closest('.qa-question, .qa-answer-content').querySelectorAll('.qa-option').forEach(o => {
            o.classList.remove('selected');
          });
        }
        option.classList.toggle('selected');
      });
    });

    // — 拖拽填空：选项拖到空位 —
    qa.querySelectorAll('.qa-drag-option').forEach(opt => {
      opt.addEventListener('dragstart', (e) => {
        if (document.documentElement.classList.contains('editor-mode')) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData('text/plain', opt.dataset.option);
        e.dataTransfer.effectAllowed = 'copy';
        opt.classList.add('dragging');
      });
      opt.addEventListener('dragend', () => {
        opt.classList.remove('dragging');
      });
    });

    qa.querySelectorAll('.qa-blank-slot').forEach(slot => {
      slot.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        slot.classList.add('drag-over');
      });
      slot.addEventListener('dragleave', () => {
        slot.classList.remove('drag-over');
      });
      slot.addEventListener('drop', (e) => {
        e.preventDefault();
        slot.classList.remove('drag-over');
        if (qa.classList.contains('submitted')) return;

        const optionId = e.dataTransfer.getData('text/plain');
        if (!optionId) return;

        const userSpan = slot.querySelector('.qa-blank-user');
        if (userSpan) {
          userSpan.textContent = optionId;
        } else {
          slot.textContent = optionId;
        }
        slot.classList.add('filled');
        slot.dataset.userAnswer = optionId;

        const dragOpt = qa.querySelector(`.qa-drag-option[data-option="${optionId}"]`);
        if (dragOpt) dragOpt.classList.add('used');
      });

      slot.addEventListener('click', () => {
        if (document.documentElement.classList.contains('editor-mode')) return;
        if (qa.classList.contains('submitted') || !slot.classList.contains('filled')) return;
        const usedOption = slot.dataset.userAnswer;
        if (usedOption) {
          const dragOpt = qa.querySelector(`.qa-drag-option[data-option="${usedOption}"]`);
          if (dragOpt) dragOpt.classList.remove('used');
        }
        const userSpan = slot.querySelector('.qa-blank-user');
        if (userSpan) {
          userSpan.textContent = '___';
        } else {
          slot.textContent = '___';
        }
        slot.classList.remove('filled');
        delete slot.dataset.userAnswer;
      });
    });

    // — 提交按钮 —
    const submitBtn = qa.querySelector('.qa-submit-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        if (document.documentElement.classList.contains('editor-mode')) return;
        if (qa.classList.contains('submitted')) return;
        submitQuiz(qa);
      });
    }
  }

  /** 提交判分 */
  function submitQuiz(qa) {
    qa.classList.add('submitted');

    const submitBtn = qa.querySelector('.qa-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    // — 选择题判分 —
    qa.querySelectorAll('.qa-option').forEach(option => {
      const isCorrect = option.dataset.correct === 'true';
      const isSelected = option.classList.contains('selected');

      let markEl = option.querySelector('.qa-result-mark');
      if (!markEl) {
        markEl = document.createElement('span');
        markEl.className = 'qa-result-mark';
        option.appendChild(markEl);
      }

      if (isCorrect) {
        markEl.textContent = '✓';
        markEl.classList.add('correct');
        setTimeout(() => markEl.classList.add('visible'), 100);
      } else if (isSelected && !isCorrect) {
        markEl.textContent = '✗';
        markEl.classList.add('incorrect');
        setTimeout(() => markEl.classList.add('visible'), 150);
      }
    });

    // — 填空题判分 —
    qa.querySelectorAll('.qa-blank-slot[data-correct-answer]').forEach(slot => {
      const correctAnswer = slot.dataset.correctAnswer;
      const userAnswer = slot.dataset.userAnswer || '';

      const userSpan = slot.querySelector('.qa-blank-user');
      const answerSpan = slot.querySelector('.qa-blank-answer');

      if (userSpan && answerSpan) {
        const isCorrect = userAnswer.toUpperCase() === correctAnswer.toUpperCase();

        let markEl = slot.querySelector('.qa-result-mark');
        if (!markEl) {
          markEl = document.createElement('span');
          markEl.className = 'qa-result-mark';
          userSpan.after(markEl);
        }
        markEl.textContent = isCorrect ? '✓' : '✗';
        markEl.classList.add(isCorrect ? 'correct' : 'incorrect');
        setTimeout(() => markEl.classList.add('visible'), 150);

        if (isCorrect) {
          slot.classList.add('result-correct');
        } else {
          answerSpan.textContent = correctAnswer;
        }
      } else {
        let correctEl = slot.querySelector('.qa-blank-correct');
        if (!correctEl) {
          correctEl = document.createElement('span');
          correctEl.className = 'qa-blank-correct';
          correctEl.textContent = correctAnswer;
          slot.appendChild(correctEl);
        }
      }
    });
  }


  // =========================================
  // 8. 进度指示器
  // =========================================

  function updateProgressCounter(qa) {
    // 更新栏头中的进度计数
    const counterEl = qa.querySelector('.qa-notes-counter');
    if (!counterEl) return;
    const bubbles = getSortedBubbles(qa);
    const total = bubbles.length;
    const current = annotationStepIndex + 1;
    counterEl.textContent = `${current}/${total}`;
  }


  // =========================================
  // 9. 角标点击 + Hover 连线
  // =========================================

  function initNoteInteractions(qa) {
    // 角标点击 → 激活对应批注
    qa.querySelectorAll('.note-badge').forEach(badge => {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        // 支持左栏和右栏的角标
        const anchor = badge.closest('.text-anchor') || badge.closest('.answer-anchor');
        if (!anchor) return;
        const linkId = anchor.dataset.link || anchor.dataset.linkAnswer;
        const bubble = getBubbleByLink(qa, linkId);
        if (!bubble) return;

        const bubbles = getSortedBubbles(qa);
        annotationStepIndex = bubbles.indexOf(bubble);

        if (!qa.classList.contains('notes-active')) {
          toggleNotesPanel(qa);
        }

        activateNote(qa, bubble);
      });
    });

    // 气泡：点击切换激活 + Hover 连线 + 初始化按钮
    qa.querySelectorAll('.qa-note-bubble').forEach(bubble => {
      // 动态补全操作按钮（防止原本写死的HTML缺少关联按钮）
      const linkId = bubble.dataset.link;
      const hasLeftLink = !!qa.querySelector(`.text-anchor[data-link="${linkId}"]`);
      const hasRightLink = !!qa.querySelector(`.answer-anchor[data-link-answer="${linkId}"]`);
      let actionsHTML = `
        <button class="qa-note-action-btn action-select" title="选中原文">📌</button>
        <button class="qa-note-action-btn action-delete" title="删除批注">✖</button>
      `;
      if (!hasLeftLink) actionsHTML += `<button class="qa-note-action-btn link-btn action-link-left" title="关联左侧">🔗←</button>`;
      if (!hasRightLink) actionsHTML += `<button class="qa-note-action-btn link-btn action-link-right" title="关联右侧">🔗→</button>`;
      
      let actionsDiv = bubble.querySelector('.qa-note-actions');
      if (actionsDiv) {
        actionsDiv.innerHTML = actionsHTML;
      } else {
        actionsDiv = document.createElement('div');
        actionsDiv.className = 'qa-note-actions';
        actionsDiv.innerHTML = actionsHTML;
        bubble.appendChild(actionsDiv);
      }

      // 点击气泡 → 切换激活
      bubble.addEventListener('click', (e) => {
        if (e.target.closest('.qa-note-action-btn')) return;
        if (!qa.classList.contains('notes-active')) return;

        const bubbles = getSortedBubbles(qa);
        annotationStepIndex = bubbles.indexOf(bubble);
        activateNote(qa, bubble);
      });

      // Hover 连线 — 仅气泡 hover
      bubble.addEventListener('mouseenter', () => {
        if (!qa.classList.contains('notes-active')) return;
        // 不为已激活的气泡重复画 hover 线
        if (bubble.classList.contains('note-active')) return;
        drawHoverConnectors(qa, bubble);
      });
      bubble.addEventListener('mouseleave', () => {
        clearHoverConnectors(qa);
      });
    });

    // 监听三个滚动容器的 scroll 实时更新连线
    qa.querySelectorAll('[data-scrollable]').forEach(el => {
      el.addEventListener('scroll', () => {
        window.requestAnimationFrame(() => {
          const activeBubble = qa.querySelector('.qa-note-bubble.note-active');
          if (activeBubble && qa.classList.contains('notes-active')) {
            drawStepConnectors(qa, activeBubble);
          }
        });
      });
    });

    // 点击空白处取消气泡选中
    qa.addEventListener('click', (e) => {
      if (!e.target.closest('.qa-note-bubble')) {
        qa.querySelectorAll('.note-selected').forEach(b => b.classList.remove('note-selected'));
      }
    });

    // — 选中原文按钮（📌） —
    qa.querySelectorAll('.qa-note-action-btn.action-select').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const bubble = btn.closest('.qa-note-bubble');
        if (!bubble) return;
        const linkId = bubble.dataset.link;
        const anchor = getAnchorByLink(qa, linkId);
        if (!anchor) return;

        const range = document.createRange();
        range.selectNodeContents(anchor);
        const badges = anchor.querySelectorAll('.note-badge');
        if (badges.length > 0) {
          range.setEndBefore(badges[0]);
        }
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        scrollIntoViewSmooth(anchor);
      });
    });

    // — 删除批注按钮（✖） —
    qa.querySelectorAll('.qa-note-action-btn.action-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const bubble = btn.closest('.qa-note-bubble');
        if (!bubble) return;
        deleteNote(qa, bubble.dataset.link);
      });
    });

    // — 关联左侧/右侧按钮（🔗） —
    qa.querySelectorAll('.qa-note-action-btn.action-link-left').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const bubble = btn.closest('.qa-note-bubble');
        if (bubble) enterLinkingMode(qa, bubble, 'left');
      });
    });
    qa.querySelectorAll('.qa-note-action-btn.action-link-right').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const bubble = btn.closest('.qa-note-bubble');
        if (bubble) enterLinkingMode(qa, bubble, 'right');
      });
    });
  }

  /** 删除批注 */
  function deleteNote(qa, linkId) {
    // 删除气泡
    const bubble = getBubbleByLink(qa, linkId);
    if (bubble) bubble.remove();

    // 清除左栏原文锚点格式并解包
    const anchor = getAnchorByLink(qa, linkId);
    if (anchor) {
      anchor.querySelectorAll('.note-badge').forEach(b => b.remove());
      anchor.removeAttribute('style');
      const parent = anchor.parentNode;
      while (anchor.firstChild) {
        parent.insertBefore(anchor.firstChild, anchor);
      }
      parent.removeChild(anchor);
    }

    // 清除右栏答题锚点的关联角标
    qa.querySelectorAll(`.answer-anchor[data-link-answer="${linkId}"]`).forEach(aa => {
      aa.querySelectorAll('.note-badge').forEach(b => b.remove());
      // 解包 answer-anchor span
      const parent = aa.parentNode;
      while (aa.firstChild) {
        parent.insertBefore(aa.firstChild, aa);
      }
      parent.removeChild(aa);
    });

    // 清除连线
    clearStepConnectors(qa);
    clearHoverConnectors(qa);

    // 重算序号
    recalcStepNumbers(qa);

    // 【撤销栈护城河】：拦截删除变动，记入历史以防覆盖
    if (window.historyMgr && !window.historyMgr.isRestoring) {
      window.historyMgr.recordState(true);
    }
    updateProgressCounter(qa);
  }


  // =========================================
  // 10. 关联模式交互
  // =========================================

  let linkingState = null; // { qa, bubble, direction: 'left'|'right' }

  /** 进入关联模式 */
  function enterLinkingMode(qa, bubble, direction) {
    linkingState = { qa, bubble, direction };

    // 添加视觉反馈（呼吸高亮边框）
    if (direction === 'left') {
      qa.classList.add('linking-left');
    } else {
      qa.classList.add('linking-right');
    }

    // Esc 键退出
    document.addEventListener('keydown', linkingEscHandler);
  }

  /** 退出关联模式 */
  function exitLinkingMode() {
    if (!linkingState) return;
    const { qa } = linkingState;
    qa.classList.remove('linking-left', 'linking-right');
    linkingState = null;
    document.removeEventListener('keydown', linkingEscHandler);
    // 隐藏关联工具条
    const toolbar = qa.querySelector('.qa-annotation-toolbar');
    if (toolbar) toolbar.classList.remove('visible');
  }

  function linkingEscHandler(e) {
    if (e.key === 'Escape') {
      exitLinkingMode();
    }
  }


  // =========================================
  // 11. 编辑模式 — 浮动工具条（添加批注 + 建立关联）
  // =========================================

  function initAnnotationToolbar(qa) {
    const passage = qa.querySelector('.qa-passage');
    const answerPanel = qa.querySelector('.qa-answer-panel');

    // 创建浮动工具条 DOM
    let toolbar = qa.querySelector('.qa-annotation-toolbar');
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.className = 'qa-annotation-toolbar';
      toolbar.innerHTML = `
        <span class="qa-toolbar-label">添加批注</span>
        <button class="qa-toolbar-btn btn-color" data-format="color" title="文字变色">A</button>
        <button class="qa-toolbar-btn btn-highlight" data-format="highlight" title="高亮背景">🖍</button>
        <button class="qa-toolbar-btn btn-underline" data-format="underline" title="下划线">U</button>
        <button class="qa-toolbar-btn btn-strikethrough" data-format="strikethrough" title="删除线">S</button>
      `;
      qa.appendChild(toolbar);
    }

    // 监听选区变化（仅编辑模式，防重复绑定）
    if (!document._qaSelectionchangeBound) {
      document._qaSelectionchangeBound = true;
      document.addEventListener('selectionchange', () => {
        // 如果当前不在编辑模式，隐藏所有 qa 的 toolbar
        if (!document.body.classList.contains('edit-mode')) {
          document.querySelectorAll('.qa-annotation-toolbar').forEach(t => t.classList.remove('visible'));
          return;
        }

      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        toolbar.classList.remove('visible');
        return;
      }

      const range = sel.getRangeAt(0);

      // 判断选区在左栏还是右栏
      const inPassage = passage && passage.contains(range.commonAncestorContainer);
      const inAnswer = answerPanel && answerPanel.contains(range.commonAncestorContainer);

      if (!inPassage && !inAnswer) {
        toolbar.classList.remove('visible');
        return;
      }

      // 关联模式下：只接受目标栏的选区
      if (linkingState) {
        const targetOk = (linkingState.direction === 'left' && inPassage) ||
                          (linkingState.direction === 'right' && inAnswer);
        if (!targetOk) {
          toolbar.classList.remove('visible');
          return;
        }
        // 更新工具条标签为"建立关联"
        const label = toolbar.querySelector('.qa-toolbar-label');
        if (label) label.textContent = '建立关联';
      } else {
        // 正常模式：更新标签为"添加批注"
        const label = toolbar.querySelector('.qa-toolbar-label');
        if (label) label.textContent = '添加批注';
      }

      // 检查选中内容是否已经是锚点（避免重复添加）
      const parentAnchor = range.commonAncestorContainer.closest?.('.text-anchor, .answer-anchor');
      if (parentAnchor && !linkingState) {
        toolbar.classList.remove('visible');
        return;
      }

      // 定位工具条到选区上方
      const rects = range.getClientRects();
      if (rects.length === 0) {
        toolbar.classList.remove('visible');
        return;
      }
      const firstRect = rects[0];
      const qaRect = qa.getBoundingClientRect();

      toolbar.style.left = `${firstRect.left - qaRect.left}px`;
      toolbar.style.top = `${firstRect.top - qaRect.top - 45}px`;
      toolbar.classList.add('visible');
    });
    }

    // 工具条按钮点击
    toolbar.querySelectorAll('.qa-toolbar-btn').forEach(btn => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault(); // 防止失去选区
      });
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const format = btn.dataset.format;

        if (linkingState) {
          // 关联模式：建立关联
          createLinkAssociation(qa, format);
        } else {
          // 正常模式：创建批注
          createAnnotation(qa, format);
        }
        toolbar.classList.remove('visible');
      });
    });
  }

  /** 创建新批注 */
  function createAnnotation(qa, format) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);

    // 判断选区在左栏还是右栏
    const passage = qa.querySelector('.qa-passage');
    const answerPanel = qa.querySelector('.qa-answer-panel');
    const inPassage = passage && passage.contains(range.commonAncestorContainer);
    const inAnswer = answerPanel && answerPanel.contains(range.commonAncestorContainer);

    if (!inPassage && !inAnswer) return;

    // 生成新的 data-link ID
    const allLinks = qa.querySelectorAll('[data-link]');
    let maxId = 0;
    allLinks.forEach(el => {
      const match = el.dataset.link.match(/note-(\d+)/);
      if (match) maxId = Math.max(maxId, parseInt(match[1]));
    });
    const newLinkId = `note-${String(maxId + 1).padStart(2, '0')}`;

    // 计算新的 step
    const allBubbles = qa.querySelectorAll('.qa-note-bubble');
    const newStep = allBubbles.length + 1;

    // 包裹选区为锚点
    const anchor = document.createElement('span');
    anchor.className = inPassage ? 'text-anchor' : 'answer-anchor';
    anchor.dataset[inPassage ? 'link' : 'linkAnswer'] = newLinkId;
    anchor.dataset.step = newStep;

    // 应用格式
    const formatStyles = {
      color: 'color: var(--accent-blue);',
      highlight: 'background-color: rgba(88, 166, 255, 0.15);',
      underline: 'text-decoration: underline; text-decoration-color: var(--accent-blue);',
      strikethrough: 'text-decoration: line-through; text-decoration-color: var(--accent-red);'
    };
    anchor.setAttribute('style', formatStyles[format] || '');

    range.surroundContents(anchor);

    // 添加角标
    const badge = document.createElement('sup');
    badge.className = 'note-badge';
    badge.textContent = newStep;
    anchor.appendChild(badge);
    
    // 即时清理，防止用户手滑框选到了首尾的空格影响排版
    trimAnchorWhitespaces(anchor);

    // 在批注面板创建空气泡
    const notesList = qa.querySelector('.qa-notes-list');
    if (!notesList) return;

    const bubble = document.createElement('div');
    bubble.className = 'qa-note-bubble';
    bubble.dataset.link = newLinkId;
    if (inAnswer) {
      bubble.dataset.linkAnswer = newLinkId; // 从右栏创建时自动关联
    }
    bubble.dataset.step = newStep;
    // 默认关闭，仅在左侧手柄 hover 控制开启
    bubble.setAttribute('draggable', 'false');

    // 动态生成操作按钮（包含关联按钮）
    const hasLeftLink = inPassage;
    const hasRightLink = inAnswer;
    let actionsHTML = `
      <button class="qa-note-action-btn action-select" title="选中原文">📌</button>
      <button class="qa-note-action-btn action-delete" title="删除批注">✖</button>
    `;
    if (!hasLeftLink) {
      actionsHTML += `<button class="qa-note-action-btn link-btn action-link-left" title="关联左侧">🔗←</button>`;
    }
    if (!hasRightLink) {
      actionsHTML += `<button class="qa-note-action-btn link-btn action-link-right" title="关联右侧">🔗→</button>`;
    }

    bubble.innerHTML = `
      <div class="qa-note-handle">
        <span class="qa-note-step">${newStep}</span>
      </div>
      <div class="qa-note-content" contenteditable="true" data-edit-id="new-${newLinkId}"></div>
      <div class="qa-note-actions">${actionsHTML}</div>
    `;
    notesList.appendChild(bubble);

    // 聚焦到新气泡的内容区
    const contentEl = bubble.querySelector('.qa-note-content');
    if (contentEl) contentEl.focus();

    // 确保批注面板展开
    if (!qa.classList.contains('notes-active')) {
      toggleNotesPanel(qa);
    }

    // 重新绑定事件
    initNoteInteractions(qa);
    initDragAndDrop(qa);

    sel.removeAllRanges();
  }

  /** 建立关联（关联模式下使用） */
  function createLinkAssociation(qa, format) {
    if (!linkingState) return;
    const { bubble, direction } = linkingState;
    const linkId = bubble.dataset.link;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);

    // 创建锚点
    const anchor = document.createElement('span');
    const step = parseInt(bubble.dataset.step) || 1;

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
    const formatStyles = {
      color: 'color: var(--accent-blue);',
      highlight: 'background-color: rgba(88, 166, 255, 0.15);',
      underline: 'text-decoration: underline; text-decoration-color: var(--accent-blue);',
      strikethrough: 'text-decoration: line-through; text-decoration-color: var(--accent-red);'
    };
    anchor.setAttribute('style', formatStyles[format] || '');

    range.surroundContents(anchor);

    // 添加角标
    const badge = document.createElement('sup');
    badge.className = 'note-badge';
    badge.textContent = step;
    anchor.appendChild(badge);

    // 移除关联按钮（已经关联了）
    const actionBtn = direction === 'left'
      ? bubble.querySelector('.action-link-left')
      : bubble.querySelector('.action-link-right');
    if (actionBtn) actionBtn.remove();

    // 退出关联模式
    exitLinkingMode();

    // 重新绑定事件
    initNoteInteractions(qa);

    sel.removeAllRanges();
  }


  // =========================================
  // 12. 批注面板栏头
  // =========================================

  /** 初始化批注面板栏头（展开态） */
  function initNotesHeader(qa) {
    const notesPanel = qa.querySelector('.qa-notes-panel');
    if (!notesPanel) return;

    // 如果栏头已存在，仅重新绑定事件后返回
    const existingHeader = notesPanel.querySelector('.qa-notes-header');
    if (existingHeader) {
      const collapseBtn = existingHeader.querySelector('.qa-notes-collapse-btn');
      if (collapseBtn) {
        // 用克隆节点替换自身来清除所有旧事件
        const fresh = collapseBtn.cloneNode(true);
        collapseBtn.parentNode.replaceChild(fresh, collapseBtn);
        fresh.addEventListener('click', () => toggleNotesPanel(qa));
      }
      return;
    }

    // 创建栏头
    const header = document.createElement('div');
    header.className = 'qa-notes-header';
    header.innerHTML = `
      <div class="qa-notes-header-left">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M15 18a3 3 0 1 0-6 0"/><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M12 13v-1"/></svg>
        <span>批注</span>
        <span class="qa-notes-counter">0/0</span>
      </div>
      <button class="qa-notes-collapse-btn" title="收起批注面板 (D)">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/></svg>
      </button>
    `;

    // 插入到面板的最前面
    notesPanel.insertBefore(header, notesPanel.firstChild);

    // 创建气泡列表容器（如果不存在）
    let notesList = notesPanel.querySelector('.qa-notes-list');
    if (!notesList) {
      notesList = document.createElement('div');
      notesList.className = 'qa-notes-list';
      notesList.setAttribute('data-scrollable', '');
      // 将面板中已有的气泡移入列表
      const existingBubbles = notesPanel.querySelectorAll('.qa-note-bubble');
      existingBubbles.forEach(b => notesList.appendChild(b));
      notesPanel.appendChild(notesList);
    }

    // 折叠按钮
    const collapseBtn = header.querySelector('.qa-notes-collapse-btn');
    collapseBtn.addEventListener('click', () => toggleNotesPanel(qa));
  }


  // =========================================
  // 13. 快捷键 D
  // =========================================

  document.addEventListener('keydown', (e) => {
    const qa = getActiveQA();
    if (!qa) return;

    // 如果焦点在输入框内，不拦截
    if (e.target.isContentEditable || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      toggleNotesPanel(qa);
    }
  });


  // =========================================
  // 14. 角标智能避让
  // =========================================

  function arrangeAdjacentBadges(qa) {
    const badges = Array.from(qa.querySelectorAll('.note-badge'));
    for (let i = 1; i < badges.length; i++) {
      const prevBadge = badges[i - 1];
      const currBadge = badges[i];

      const prevRect = prevBadge.getBoundingClientRect();
      const currRect = currBadge.getBoundingClientRect();

      if (Math.abs(prevRect.top - currRect.top) < 5 &&
          Math.abs(prevRect.right - currRect.left) < 5) {
        currBadge.style.marginLeft = '0px';
      }
    }
  }


  // =========================================
  // 初始化：页面加载时 + 页面切换时
  // =========================================

  function initQuizAnnotation(qa) {
    if (!qa || qa.dataset.qaInitialized) return;
    qa.dataset.qaInitialized = 'true';

    // 标记可滚动区域
    qa.querySelectorAll('.qa-passage, .qa-answer-content, .qa-notes-list').forEach(el => {
      el.setAttribute('data-scrollable', '');
    });

    // 清洗已存在锚点的首尾不当空格
    qa.querySelectorAll('.text-anchor, .answer-anchor').forEach(anchor => {
      trimAnchorWhitespaces(anchor);
    });

    // 初始化批注面板栏头（动态生成 header + notes-list 结构）
    initNotesHeader(qa);

    // 初始化各子系统
    initNoteInteractions(qa);
    initDragAndDrop(qa);
    initQuizSystem(qa);
    initAnnotationToolbar(qa);
    initDividerButton(qa);

    // 角标避让
    arrangeAdjacentBadges(qa);

    // 初始化进度指示器
    updateProgressCounter(qa);

    // 初始分割线位置
    requestAnimationFrame(() => updateDividerPositions(qa));
  }

  /**
   * 【灾后净化函数】：剥离所有运行时动态生成的DOM元素
   * 在 HistoryManager._restoreState 通过 innerHTML 恢复DOM后，
   * 恢复出的HTML中残留着首次初始化时注入的动态节点（栏头、按钮容器、工具条等），
   * 但这些节点上的 JavaScript 事件绑定已经全部丢失。
   * 必须先将它们剥离干净，让 initQuizAnnotation 从零重建并正确绑定事件。
   */
  function stripDynamicElements(qa) {
    // 1. 剥离栏头（initNotesHeader 会重建，需要重新绑定折叠按钮事件）
    const header = qa.querySelector('.qa-notes-header');
    if (header) header.remove();

    // 2. 解包 .qa-notes-list 容器 — 将气泡搬回 .qa-notes-panel 再移除空壳
    const notesList = qa.querySelector('.qa-notes-list');
    if (notesList) {
      const panel = notesList.parentNode;
      // 先收集所有气泡，再逐个移出（避免迭代过程中DOM变动）
      Array.from(notesList.children).forEach(child => panel.appendChild(child));
      notesList.remove();
    }

    // 3. 剥离各气泡上的动态操作按钮容器（initNoteInteractions 会重建）
    qa.querySelectorAll('.qa-note-actions').forEach(a => a.remove());

    // 4. 剥离分割线悬浮按钮（initDividerButton 会重建）
    qa.querySelectorAll('.qa-divider-btn').forEach(b => b.remove());

    // 5. 剥离浮动批注工具条（initAnnotationToolbar 会重建）
    qa.querySelectorAll('.qa-annotation-toolbar').forEach(t => t.remove());

    // 6. 清除 data-scrollable 标记（initQuizAnnotation 会重新添加）
    qa.querySelectorAll('[data-scrollable]').forEach(el => el.removeAttribute('data-scrollable'));
  }

  // 暴露给编辑器引擎：撤销/重做恢复 DOM 后，重新唤醒交互
  window.initQuizAnnotation = initQuizAnnotation;
  window.stripDynamicQAElements = stripDynamicElements;

  // 自动标记并初始化
  function autoInit() {
    document.querySelectorAll('.quiz-annotation').forEach(qa => {
      if (!qa.hasAttribute('data-steppable')) {
        qa.setAttribute('data-steppable', 'annotation');
      }
      initQuizAnnotation(qa);
    });
  }

  // 在 DOMContentLoaded 或者立即执行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }

  // 监听页面切换，重置步进索引
  if (typeof window.addSlideChangeListener === 'function') {
    window.addSlideChangeListener(function() {
      annotationStepIndex = -1;
      // 退出关联模式
      exitLinkingMode();
      const qa = getActiveQA();
      if (qa) {
        clearAllActive(qa);
        updateProgressCounter(qa);
        requestAnimationFrame(() => updateDividerPositions(qa));
      }
    });
  }

})();
