/* ===========================================
   quiz-dragdrop.js
   答题与批注组件 — 拖拽排序与序号同步
   依赖：quiz-core.js、quiz-panel.js、quiz-connectors.js
   =========================================== */

(function () {
  'use strict';
  var QA = window.QA = window.QA || {};

  /* === 模块级变量 === */
  var draggedBubble = null;

  /* =========================================
     拖拽排序
     ========================================= */

  QA.cleanupDragArtifacts = function (qa) {
    if (!qa) return;
    qa.querySelectorAll('.qa-note-placeholder').forEach(function (placeholder) { placeholder.remove(); });
    qa.querySelectorAll('.qa-note-bubble.dragging-source').forEach(function (bubble) {
      bubble.classList.remove('dragging-source');
      bubble.style.display = '';
      bubble.setAttribute('draggable', 'false');
    });
    if (draggedBubble && qa.contains(draggedBubble)) {
      draggedBubble.classList.remove('dragging-source');
      draggedBubble.style.display = '';
      draggedBubble.setAttribute('draggable', 'false');
    }
    draggedBubble = null;
  };

  QA.initDragAndDrop = function (qa) {
    var notesList = qa.querySelector('.qa-notes-list');
    if (!notesList) return;

    QA.cleanupDragArtifacts(qa);

    var placeholder = notesList.__qaNotePlaceholder;
    if (!placeholder) {
      placeholder = document.createElement('div');
      placeholder.className = 'qa-note-placeholder';
      notesList.__qaNotePlaceholder = placeholder;
    }

    // 为每个气泡绑定拖拽事件
    qa.querySelectorAll('.qa-note-bubble').forEach(function (b) { return bindDragEvents(qa, b, placeholder); });

    // 容器级委托 dragover
    if (!notesList.__qaDragOverBound) {
      notesList.__qaDragOverBound = true;
      notesList.addEventListener('dragover', function (e) {
        e.preventDefault();
        if (!draggedBubble) return;
        var currentPlaceholder = notesList.__qaNotePlaceholder;
        var afterElement = getDragAfterElement(notesList, e.clientY);
        if (afterElement == null) {
          notesList.appendChild(currentPlaceholder);
        } else {
          notesList.insertBefore(currentPlaceholder, afterElement);
        }
      });
    }
  };

  /** 绑定单个气泡的拖拽事件 */
  function bindDragEvents(qa, b, placeholder) {
    if (b.__qaDragBound) return;
    b.__qaDragBound = true;

    // 默认关闭全局 draggable，防止覆盖输入框内的原生文字拖拽和选区
    b.setAttribute('draggable', 'false');

    var dragArea = b.querySelector('.qa-note-header') || b.querySelector('.qa-note-handle');
    if (dragArea) {
      // 在整个头部区域按下鼠标即可开启拖拽（明确排除对右侧操作按钮的点击）
      dragArea.addEventListener('mousedown', function (e) {
        if (e.target.closest('.qa-note-actions')) return;
        b.setAttribute('draggable', 'true');
      });
      dragArea.addEventListener('mouseup', function () { return b.setAttribute('draggable', 'false'); });
      dragArea.addEventListener('mouseleave', function () { return b.setAttribute('draggable', 'false'); });
    }

    b.addEventListener('dragstart', function (e) {
      // 若不是由 handle 唤醒的拖拽行为，直接阻止
      if (b.getAttribute('draggable') !== 'true') {
        e.preventDefault();
        return;
      }

      draggedBubble = b;
      b.classList.add('dragging-source');
      e.dataTransfer.effectAllowed = 'move';
      placeholder.style.minHeight = b.offsetHeight + 'px';
      setTimeout(function () { return b.style.display = 'none'; }, 0);
    });

    b.addEventListener('dragend', function () {
      b.setAttribute('draggable', 'false');
      if (draggedBubble) {
        draggedBubble.classList.remove('dragging-source');
        draggedBubble.style.display = '';
      }
      if (placeholder.parentNode && draggedBubble) {
        placeholder.parentNode.replaceChild(draggedBubble, placeholder);
      } else if (placeholder.parentNode) {
        placeholder.remove();
      }
      draggedBubble = null;

      // 重算 data-step 序号（统一序号：左中右三栏同步）
      QA.recalcStepNumbers(qa);

      // 恢复激活状态和更新连线
      var activeBubble = qa.querySelector('.qa-note-bubble.note-active');
      if (activeBubble) {
        var bubbles = QA.getSortedBubbles(qa);
        QA.annotationStepIndex = bubbles.indexOf(activeBubble);
        QA.updateProgressCounter(qa);
        window.requestAnimationFrame(function () { return QA.drawStepConnectors(qa, activeBubble); });
      } else {
        QA.updateProgressCounter(qa);
      }
    });
  }

  /** 获取拖拽位置下方最近的气泡 */
  function getDragAfterElement(container, y) {
    var draggableElements = [].concat(Array.from(container.querySelectorAll('.qa-note-bubble:not(.dragging-source)')));
    return draggableElements.reduce(function (closest, child) {
      var box = child.getBoundingClientRect();
      var offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      }
      return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  /** 重算所有气泡的 data-step 序号并同步左右两栏角标（统一序号系统） */
  QA.recalcStepNumbers = function (qa) {
    QA.syncBubbleOrderToPassageAnchors(qa);

    var allBubbles = qa.querySelectorAll('.qa-note-bubble');
    allBubbles.forEach(function (bubble, index) {
      var newStep = index + 1;
      bubble.dataset.step = newStep;
      // 更新气泡内的序号显示
      var stepEl = bubble.querySelector('.qa-note-step');
      if (stepEl) stepEl.textContent = newStep;

      // 同步左栏原文锚点的 data-step 和角标
      var linkId = bubble.dataset.link;
      var anchor = QA.getAnchorByLink(qa, linkId);
      if (anchor) {
        anchor.dataset.step = newStep;
        var badge = anchor.querySelector('.note-badge');
        if (badge) badge.textContent = newStep;
      }

      // 同步右栏答题锚点的角标
      var answerAnchors = QA.getAnswerAnchorsByLink(qa, linkId);
      answerAnchors.forEach(function (aa) {
        aa.dataset.step = newStep;
        var badge = aa.querySelector('.note-badge');
        if (badge) badge.textContent = newStep;
      });
    });
  };

})();
