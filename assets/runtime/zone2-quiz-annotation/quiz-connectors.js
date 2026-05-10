/* ===========================================
   quiz-connectors.js
   答题与批注组件 — SVG 连线与涂鸦穿透
   依赖：quiz-core.js、quiz-constants.js
   =========================================== */

(function () {
  'use strict';
  var QA = window.QA = window.QA || {};

  /* === 模块级变量 === */
  var activeDoodleProxyAnchor = null;
  var doodlePassthroughBound = false;

  /* =========================================
     Doodle 模式穿透光标
     ========================================= */

  QA.syncDoodlePassthroughCursor = function (target) {
    var passthroughButton = target && target.closest ? target.closest(QA.DOODLE_PASSTHROUGH_BUTTON_SELECTOR) : null;
    var cursorMode = '';

    if (passthroughButton) {
      cursorMode = passthroughButton.disabled ? 'not-allowed' : 'pointer';
    }

    if (cursorMode) {
      document.documentElement.dataset.qaDoodleCursor = cursorMode;
      document.body.dataset.qaDoodleCursor = cursorMode;
    } else {
      delete document.documentElement.dataset.qaDoodleCursor;
      delete document.body.dataset.qaDoodleCursor;
    }

    return passthroughButton;
  };

  QA.setActiveDoodleProxyAnchor = function (anchor) {
    if (activeDoodleProxyAnchor === anchor) return false;

    if (activeDoodleProxyAnchor) {
      activeDoodleProxyAnchor.classList.remove('qa-fragment-hover-proxy');
    }

    activeDoodleProxyAnchor = anchor || null;
    if (activeDoodleProxyAnchor) {
      activeDoodleProxyAnchor.classList.add('qa-fragment-hover-proxy');
    }

    return true;
  };

  QA.clearDoodleProxyAnchor = function () {
    QA.setActiveDoodleProxyAnchor(null);
  };

  /* =========================================
     SVG 连线画布
     ========================================= */

  /** 确保 SVG 画布存在 */
  QA.ensureCanvas = function (qa) {
    var canvas = qa.querySelector('.qa-connector-canvas');
    if (!canvas) {
      canvas = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      canvas.setAttribute('class', 'qa-connector-canvas');
      var body = qa.querySelector('.qa-body');
      if (body) body.appendChild(canvas);
    }
    return canvas;
  };

  /**
   * 绘制步进连线（旧版持久橙线）。
   * 2026-04 的焦点视觉改版后，这层持久连线已被更克制的端点联动高亮取代，
   * 因此这里仅保留"清空旧 DOM"的职责，避免激活/滚动链路继续残留历史 connector-step 节点。
   */
  QA.drawStepConnectors = function (qa, bubble) {
    QA.clearStepConnectors(qa);
    if (!bubble) return;
  };

  /** 清除步进连线 */
  QA.clearStepConnectors = function (qa) {
    if (!qa) return;
    var canvas = qa.querySelector('.qa-connector-canvas');
    if (canvas) {
      canvas.querySelectorAll('.connector-step').forEach(function (l) { l.remove(); });
      canvas.querySelectorAll('.qa-edge-arrow.arrow-step').forEach(function (a) { a.remove(); });
    }
  };

  /** 绘制 Hover 临时连线（双向） */
  QA.drawHoverConnectors = function (qa, bubble) {
    QA.clearHoverConnectors(qa);
    if (!bubble) return;
    var canvas = QA.ensureCanvas(qa);
    var endpointState = QA.normalizeBubbleEndpointState(qa, bubble);
    var linkId = endpointState.linkId;
    var hasAnswerLink = endpointState.hasRight;

    var leftLine = createLeftConnectorLine(qa, linkId, 'connector-hover');
    if (leftLine) canvas.appendChild(leftLine);

    if (hasAnswerLink) {
      var rightLine = createRightConnectorLine(qa, linkId, 'connector-hover');
      if (rightLine) canvas.appendChild(rightLine);
    }
  };

  /** 清除 Hover 临时连线 */
  QA.clearHoverConnectors = function (qa) {
    if (!qa) return;
    var canvas = qa.querySelector('.qa-connector-canvas');
    if (canvas) {
      canvas.querySelectorAll('.connector-hover').forEach(function (l) { l.remove(); });
      canvas.querySelectorAll('.qa-edge-arrow.arrow-hover').forEach(function (a) { a.remove(); });
    }
  };

  /* =========================================
     可见性检测
     ========================================= */

  /**
   * 检测元素是否在其滚动容器的可见范围内
   * 返回 { visible, direction } direction: 'up'|'down'|null
   */
  function checkVisibility(el, scrollContainer) {
    if (!el || !scrollContainer) return { visible: false, direction: null };
    var elRect = el.getBoundingClientRect();
    var containerRect = scrollContainer.getBoundingClientRect();

    if (elRect.bottom < containerRect.top) {
      return { visible: false, direction: 'up' };
    }
    if (elRect.top > containerRect.bottom) {
      return { visible: false, direction: 'down' };
    }
    return { visible: true, direction: null };
  }

  /* =========================================
     连线路径创建
     ========================================= */

  /** 创建左侧连线：正文角标 → 气泡序号球 */
  function createLeftConnectorLine(qa, linkId, className) {
    var anchor = QA.getAnchorByLink(qa, linkId);
    var bubble = QA.getBubbleByLink(qa, linkId);
    if (!anchor || !bubble) return null;

    var badge = anchor.querySelector('.note-badge') || anchor;
    var step = bubble.querySelector('.qa-note-step') || bubble;

    var body = qa.querySelector('.qa-body');
    if (!body) return null;
    var bodyRect = body.getBoundingClientRect();

    // 检测锚点可见性（边缘钉定）
    var passage = qa.querySelector('.qa-passage');
    var anchorVis = checkVisibility(badge, passage);

    var x1, y1;
    if (anchorVis.visible) {
      var badgeRect = badge.getBoundingClientRect();
      x1 = badgeRect.right - bodyRect.left;
      y1 = badgeRect.top + badgeRect.height / 2 - bodyRect.top;
    } else {
      // 钉定在左栏边缘
      var passageRect = passage.getBoundingClientRect();
      x1 = passageRect.right - 20 - bodyRect.left;
      y1 = anchorVis.direction === 'up'
        ? passageRect.top - bodyRect.top + 10
        : passageRect.bottom - bodyRect.top - 10;
    }

    var stepRect = step.getBoundingClientRect();
    var x2 = stepRect.left - bodyRect.left;
    var y2 = stepRect.top + stepRect.height / 2 - bodyRect.top;

    // 贝塞尔控制点
    var dx = Math.abs(x2 - x1) * 0.4;
    var d = 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + dx) + ' ' + y1 + ', ' + (x2 - dx) + ' ' + y2 + ', ' + x2 + ' ' + y2;

    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', 'qa-connector-line ' + className);
    path.dataset.link = linkId;

    // 如果锚点出屏，在钉定端画箭头
    if (!anchorVis.visible) {
      var arrowType = className.indexOf('step') !== -1 ? 'arrow-step' : 'arrow-hover';
      drawEdgeArrow(qa, x1, y1, anchorVis.direction, arrowType, linkId);
    }

    return path;
  }

  /** 创建右侧连线：气泡序号球 → 答题角标 */
  function createRightConnectorLine(qa, linkId, className) {
    var bubble = QA.getBubbleByLink(qa, linkId);
    if (!bubble) return null;

    // 查找右栏中与该批注关联的答题锚点
    var answerAnchor = QA.getAnswerAnchorByLink(qa, linkId);
    if (!answerAnchor) return null;

    var step = bubble.querySelector('.qa-note-step') || bubble;
    var ansBadge = answerAnchor.querySelector('.note-badge') || answerAnchor;

    var body = qa.querySelector('.qa-body');
    if (!body) return null;
    var bodyRect = body.getBoundingClientRect();

    var stepRect = step.getBoundingClientRect();
    var x1 = stepRect.right - bodyRect.left;
    var y1 = stepRect.top + stepRect.height / 2 - bodyRect.top;

    // 检测答题锚点可见性
    var answerContent = qa.querySelector('.qa-answer-content');
    var ansVis = checkVisibility(ansBadge, answerContent);

    var x2, y2;
    if (ansVis.visible) {
      var ansBadgeRect = ansBadge.getBoundingClientRect();
      x2 = ansBadgeRect.left - bodyRect.left;
      y2 = ansBadgeRect.top + ansBadgeRect.height / 2 - bodyRect.top;
    } else {
      // 钉定在右栏边缘
      var ansRect = answerContent ? answerContent.getBoundingClientRect() : qa.querySelector('.qa-answer-panel').getBoundingClientRect();
      x2 = ansRect.left + 20 - bodyRect.left;
      y2 = ansVis.direction === 'up'
        ? ansRect.top - bodyRect.top + 10
        : ansRect.bottom - bodyRect.top - 10;
    }

    var dx = Math.abs(x2 - x1) * 0.4;
    var d = 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + dx) + ' ' + y1 + ', ' + (x2 - dx) + ' ' + y2 + ', ' + x2 + ' ' + y2;

    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', 'qa-connector-line ' + className);
    path.dataset.link = linkId;

    if (!ansVis.visible) {
      var arrowType = className.indexOf('step') !== -1 ? 'arrow-step' : 'arrow-hover';
      drawEdgeArrow(qa, x2, y2, ansVis.direction, arrowType, linkId);
    }

    return path;
  }

  /** 绘制边缘钉定箭头 */
  function drawEdgeArrow(qa, x, y, direction, className, linkId) {
    var canvas = QA.ensureCanvas(qa);
    var arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    var size = 6;
    var points;
    if (direction === 'up') {
      points = (x - size) + ',' + (y + size) + ' ' + (x + size) + ',' + (y + size) + ' ' + x + ',' + (y - size);
    } else {
      points = (x - size) + ',' + (y - size) + ' ' + (x + size) + ',' + (y - size) + ' ' + x + ',' + (y + size);
    }
    arrow.setAttribute('points', points);
    arrow.setAttribute('class', 'qa-edge-arrow ' + className);
    arrow.dataset.link = linkId;

    // 点击箭头 → 重新激活该批注（触发 scrollIntoView）
    arrow.addEventListener('click', function () {
      var bubble = QA.getBubbleByLink(qa, linkId);
      if (bubble) {
        var bubbles = QA.getSortedBubbles(qa);
        QA.annotationStepIndex = bubbles.indexOf(bubble);
        QA.activateNote(qa, bubble);
      }
    });

    canvas.appendChild(arrow);
  }

  /* =========================================
     Doodle 模式全局事件绑定
     ========================================= */

  function syncDoodleDividerButtons(clientX, clientY, resolvedTarget) {
    var activeSlide = document.querySelector('.slide.active');
    if (!activeSlide) return;

    var activeQa = resolvedTarget && resolvedTarget.closest ? resolvedTarget.closest('.quiz-annotation') : null;
    activeSlide.querySelectorAll('.quiz-annotation').forEach(function (qa) {
      if (!activeQa || qa === activeQa) {
        QA.updateDividerButtonHoverState(qa, clientX, clientY);
      } else {
        QA.hideDividerButton(qa);
      }
    });
  }

  QA.bindDoodleModePassthrough = function () {
    if (doodlePassthroughBound) return;
    doodlePassthroughBound = true;

    document.addEventListener('pointermove', function (e) {
      if (!QA.isDoodleMode()) {
        QA.clearDoodleProxyAnchor();
        QA.syncDoodlePassthroughCursor(null);
        document.querySelectorAll('.quiz-annotation').forEach(function (qa) { QA.hideDividerButton(qa); });
        return;
      }

      if (QA.isDoodleDrawingActive()) {
        QA.clearDoodleProxyAnchor();
        QA.syncDoodlePassthroughCursor(null);
        document.querySelectorAll('.quiz-annotation').forEach(function (qa) { QA.hideDividerButton(qa); });
        return;
      }

      var resolvedTarget = QA.resolveDoodlePassthroughTarget(e) || (e.target && e.target.nodeType === 1 ? e.target : null);
      QA.syncDoodlePassthroughCursor(resolvedTarget);
      syncDoodleDividerButtons(e.clientX, e.clientY, resolvedTarget);

      var anchor = resolvedTarget && resolvedTarget.closest ? resolvedTarget.closest('.text-anchor, .answer-anchor') : null;
      if (!QA.canTriggerFragmentDiscovery(anchor)) {
        QA.clearDoodleProxyAnchor();
        return;
      }

      var changed = QA.setActiveDoodleProxyAnchor(anchor);
      if (changed) {
        QA.playFragmentHoverSound(anchor);
      }
    }, true);

    document.addEventListener('contextmenu', function (e) {
      if (!QA.isDoodleMode() || QA.isEditorMode()) return;
      if (!(e.target && e.target.closest && e.target.closest('svg.doodle-layer'))) return;

      var resolvedTarget = QA.resolveDoodlePassthroughTarget(e);
      var fragment = resolvedTarget && resolvedTarget.closest ? resolvedTarget.closest('[data-fragment-step="true"]') : null;
      var ownerAnchor = fragment && fragment.closest('.text-anchor, .answer-anchor');
      if (!fragment || !ownerAnchor || !QA.canTriggerFragmentDiscovery(ownerAnchor)) return;

      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') {
        e.stopImmediatePropagation();
      }
      QA.revealNoteFragmentImmediately(fragment);
    }, true);

    document.addEventListener('pointerdown', function (e) {
      if (!QA.isDoodleMode() || QA.isEditorMode() || QA.isDoodleDrawingActive() || e.button !== 0) return;
      if (!(e.target && e.target.closest && e.target.closest('svg.doodle-layer'))) return;

      var resolvedTarget = QA.resolveDoodlePassthroughTarget(e);
      var passthroughButton = QA.syncDoodlePassthroughCursor(resolvedTarget);
      if (!passthroughButton) return;

      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') {
        e.stopImmediatePropagation();
      }

      passthroughButton.click();
    }, true);
  };

})();
