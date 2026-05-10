/* ===========================================
   quiz-note-interactions.js
   答题与批注组件 — 气泡操作按钮与删除
   依赖：quiz-core.js、quiz-fragments.js、quiz-panel.js、quiz-dragdrop.js、
         quiz-activation.js、quiz-connectors.js、quiz-persistence.js、quiz-linking.js
   =========================================== */

(function () {
  'use strict';
  var QA = window.QA = window.QA || {};

  /* =========================================
     锚点文本操作工具
     ========================================= */

  /** 剥离锚点首尾的文本空格 */
  QA.trimAnchorWhitespaces = function (anchor) {
    if (!anchor) return;
    var textNodes = [];
    // 遍历锚点内的所有文本节点
    var walker = document.createTreeWalker(anchor, NodeFilter.SHOW_TEXT, null, false);
    var n;
    while (n = walker.nextNode()) {
      // 忽略角标内部的文本
      var parentElement = n.parentNode.nodeType === 1 ? n.parentNode : n.parentNode.parentElement;
      if (parentElement && !parentElement.closest('.note-badge')) {
        textNodes.push(n);
      }
    }

    if (textNodes.length === 0) return;

    // 1. 剥离尾部空格
    var trailingSpaces = '';
    for (var i = textNodes.length - 1; i >= 0; i--) {
      var tNode = textNodes[i];
      var val = tNode.nodeValue;
      var match = val.match(/\s+$/);
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
    var leadingSpaces = '';
    for (var j = 0; j < textNodes.length; j++) {
      var tNode2 = textNodes[j];
      var val2 = tNode2.nodeValue;
      var match2 = val2.match(/^\s+/);
      if (match2 && match2[0] === val2) {
        leadingSpaces += val2;
        tNode2.nodeValue = '';
      } else if (match2) {
        leadingSpaces += match2[0];
        tNode2.nodeValue = val2.substring(match2[0].length);
        break;
      } else {
        break;
      }
    }
    if (leadingSpaces) {
      anchor.parentNode.insertBefore(document.createTextNode(leadingSpaces), anchor);
    }
  };

  /**
   * 为锚点补一个只承载"正文文字层"的包裹节点。
   */
  QA.ensureAnchorTextVisualLayer = function (anchor) {
    if (!anchor) return null;

    var textLayer = Array.from(anchor.children).find(function (child) { return child.classList && child.classList.contains('qa-anchor-text'); }) || null;
    if (!textLayer) {
      textLayer = document.createElement('span');
      textLayer.className = 'qa-anchor-text';
    }

    var directBadge = Array.from(anchor.children).find(function (child) { return child.classList && child.classList.contains('note-badge'); }) || null;
    if (textLayer.parentNode !== anchor) {
      anchor.insertBefore(textLayer, directBadge || anchor.firstChild);
    }

    Array.from(anchor.childNodes).forEach(function (node) {
      if (node === textLayer) return;
      if (node.nodeType === 1 && node.classList && node.classList.contains('note-badge')) return;
      textLayer.appendChild(node);
    });

    if (!textLayer.childNodes.length) {
      textLayer.remove();
      return null;
    }

    return textLayer;
  };

  function hasMeaningfulSibling(node, direction) {
    var current = node ? node[direction] : null;
    while (current) {
      if (current.nodeType === Node.TEXT_NODE) {
        if (/\S/.test(current.nodeValue || '')) return true;
      } else if (current.nodeType === Node.ELEMENT_NODE) {
        return true;
      }
      current = current[direction];
    }
    return false;
  }

  QA.trimBlankSlotWhitespaces = function (slot) {
    if (!slot || !slot.parentNode) return;

    var prevNode = slot.previousSibling;
    if (prevNode && prevNode.nodeType === Node.TEXT_NODE) {
      if (/\S/.test(prevNode.nodeValue || '')) {
        prevNode.nodeValue = prevNode.nodeValue.replace(/\s*$/, ' ');
      } else {
        prevNode.nodeValue = hasMeaningfulSibling(prevNode, 'previousSibling') ? ' ' : '';
      }
    } else if (hasMeaningfulSibling(slot, 'previousSibling')) {
      slot.parentNode.insertBefore(document.createTextNode(' '), slot);
    }

    var nextNode = slot.nextSibling;
    if (nextNode && nextNode.nodeType === Node.TEXT_NODE) {
      if (/\S/.test(nextNode.nodeValue || '')) {
        nextNode.nodeValue = nextNode.nodeValue.replace(/^\s*/, ' ');
      } else {
        nextNode.nodeValue = hasMeaningfulSibling(nextNode, 'nextSibling') ? ' ' : '';
      }
    } else if (hasMeaningfulSibling(slot, 'nextSibling')) {
      slot.parentNode.insertBefore(document.createTextNode(' '), nextNode || null);
    }
  };

  /* =========================================
     面板同步
     ========================================= */

  QA.syncNotesPanelForCurrentMode = function (qa) {
    if (!qa) return;

    QA.cleanupDragArtifacts(qa);

    if (QA.isEditorMode()) {
      // 编辑模式下：展开中栏面板并显示所有批注
      qa.classList.add('notes-active');
      QA.expandAllBubbles(qa);
    } else {
      QA.hideAllBubbles(qa);
    }

    QA.syncChoiceAnswerKeyEditors(qa);
    QA.syncMatchingAnswerUI(qa, { resetTransientState: false });
    QA.syncBlankAnswerUI(qa);

    QA.updateProgressCounter(qa);
  };

  QA.syncAllNotesPanelsForCurrentMode = function () {
    document.querySelectorAll('.quiz-annotation').forEach(function (qa) {
      QA.syncNotesPanelForCurrentMode(qa);
      requestAnimationFrame(function () { return QA.updateDividerPositions(qa); });
    });
  };

  /* =========================================
     删除批注
     ========================================= */

  QA.deleteNote = function (qa, linkId) {
    var bubble = QA.getBubbleByLink(qa, linkId);
    var contentEl = bubble ? bubble.querySelector('.qa-note-content[data-edit-id]') : null;
    var contentEditId = contentEl ? (contentEl.getAttribute('data-edit-id') || '') : '';

    // 删除批注是"整条 note 生命周期结束"
    var passageAnchor = QA.getAnchorByLink(qa, linkId);
    if (passageAnchor) {
      passageAnchor.querySelectorAll('.note-badge').forEach(function (b) { return b.remove(); });
      var parent = passageAnchor.parentNode;
      while (passageAnchor.firstChild) {
        parent.insertBefore(passageAnchor.firstChild, passageAnchor);
      }
      parent.removeChild(passageAnchor);
      parent.normalize();
      QA.persistAnchorChange(parent, { immediate: true });
    }

    // 清除右栏答题锚点的关联角标
    QA.getAnswerAnchorsByLink(qa, linkId).forEach(function (aa) {
      aa.querySelectorAll('.note-badge').forEach(function (b) { return b.remove(); });
      var parent = aa.parentNode;
      while (aa.firstChild) {
        parent.insertBefore(aa.firstChild, aa);
      }
      parent.removeChild(aa);
      parent.normalize();
      QA.persistAnchorChange(parent, { immediate: true });
    });

    if (bubble) {
      if (window.linkingState && window.linkingState.bubble === bubble) {
        window.linkingState = null;
        document.body.classList.remove('linking-mode');
      }
      bubble.remove();
    }

    QA.clearStoredEditableHTML(contentEditId);

    // 清除连线
    QA.clearStepConnectors(qa);
    QA.clearHoverConnectors(qa);

    qa.classList.remove('has-active-note');

    // 重算序号
    QA.recalcStepNumbers(qa);

    // 持久化删除记录
    QA.addDeletedNoteId(qa, linkId);

    // 【撤销栈护城河】
    if (window.historyMgr && !window.historyMgr.isRestoring) {
      window.historyMgr.recordState(true);
    }
    QA.updateProgressCounter(qa);
  };

  /* =========================================
     交互绑定入口
     ========================================= */

  QA.initNoteInteractions = function (qa) {
    qa.querySelectorAll('.text-anchor, .answer-anchor').forEach(function (anchor) {
      QA.ensureAnchorTextVisualLayer(anchor);
    });

    if (!qa.__qaSourceFragmentContextMenuBound) {
      qa.__qaSourceFragmentContextMenuBound = true;
      qa.addEventListener('contextmenu', function (e) {
        var fragment = e.target.closest('[data-fragment-step="true"]');
        var ownerAnchor = fragment && fragment.closest('.text-anchor, .answer-anchor');
        if (!fragment || !ownerAnchor || !QA.canTriggerFragmentDiscovery(ownerAnchor)) return;
        e.preventDefault();
        e.stopPropagation();
        QA.revealNoteFragmentImmediately(fragment);
      });
    }

    qa.querySelectorAll('.text-anchor, .answer-anchor').forEach(function (anchor) {
      if (anchor.hasAttribute('data-fragment-hover-audio-bound')) {
        anchor.removeAttribute('data-fragment-hover-audio-bound');
      }
      if (anchor.__qaFragmentHoverAudioBound === true) return;
      anchor.__qaFragmentHoverAudioBound = true;
      anchor.addEventListener('mouseenter', function () {
        if (QA.isEditorMode()) return;
        QA.playFragmentHoverSound(anchor);
      });
    });

    // 角标点击 → 激活对应批注
    qa.querySelectorAll('.note-badge').forEach(function (badge) {
      badge.addEventListener('click', function (e) {
        e.stopPropagation();
        // 支持左栏和右栏的角标
        var anchor = badge.closest('.text-anchor') || badge.closest('.answer-anchor');
        if (!anchor) return;
        var linkId = anchor.dataset.link || anchor.dataset.linkAnswer;
        var bubble = QA.getBubbleByLink(qa, linkId);
        if (!bubble) return;

        var bubbles = QA.getSortedBubbles(qa);
        QA.annotationStepIndex = bubbles.indexOf(bubble);

        if (!qa.classList.contains('notes-active')) {
          QA.toggleNotesPanel(qa);
        }

        QA.activateNote(qa, bubble);
      });
    });

    // 气泡：点击切换激活 + Hover 连线 + 初始化按钮
    qa.querySelectorAll('.qa-note-bubble').forEach(function (bubble) {
      // 动态补全操作按钮
      var endpointState = QA.normalizeBubbleEndpointState(qa, bubble);
      var linkId = endpointState.linkId;
      var hasLeftLink = endpointState.hasLeft;
      var hasRightLink = endpointState.hasRight;

      // 按钮排列顺序：关联左侧 → 关联右侧 → 取消左侧 → 取消右侧 → 选中左侧原文 → 选中右侧原文 → 删除批注
      var actionsHTML = '';
      if (!hasLeftLink) actionsHTML += '<button class="qa-note-action-btn link-btn action-link-left" title="关联左侧"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-cable-icon lucide-cable"><path d="M17 19a1 1 0 0 1-1-1v-2a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a1 1 0 0 1-1 1z"/><path d="M17 21v-2"/><path d="M19 14V6.5a1 1 0 0 0-7 0v11a1 1 0 0 1-7 0V10"/><path d="M21 21v-2"/><path d="M3 5V3"/><path d="M4 10a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2a2 2 0 0 1-2 2z"/><path d="M7 5V3"/></svg></button>';
      if (!hasRightLink) actionsHTML += '<button class="qa-note-action-btn link-btn action-link-right" title="关联右侧"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-cable-icon lucide-cable"><path d="M17 19a1 1 0 0 1-1-1v-2a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a1 1 0 0 1-1 1z"/><path d="M17 21v-2"/><path d="M19 14V6.5a1 1 0 0 0-7 0v11a1 1 0 0 1-7 0V10"/><path d="M21 21v-2"/><path d="M3 5V3"/><path d="M4 10a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2a2 2 0 0 1-2 2z"/><path d="M7 5V3"/></svg></button>';
      if (hasLeftLink) actionsHTML += '<button class="qa-note-action-btn action-unlink-left" title="取消左侧关联" style="color: var(--editor-danger, #e74c3c);"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-link-off"><g style="transform-origin: center; transform: scaleX(-1);"><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M9 15l3 -3m2 -2l1 -1" /><path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464" /><path d="M3 3l18 18" /><path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463" /></g></svg></button>';
      if (hasRightLink) actionsHTML += '<button class="qa-note-action-btn action-unlink-right" title="取消右侧关联" style="color: var(--editor-danger, #e74c3c);"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-link-off"><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M9 15l3 -3m2 -2l1 -1" /><path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464" /><path d="M3 3l18 18" /><path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463" /></svg></button>';
      if (hasLeftLink) actionsHTML += '<button class="qa-note-action-btn action-select-left" title="选中左侧原文" style="color: var(--text-dim, #8b949e);"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-symlink-icon"><path d="M20 11V4a2 2 0 0 0-2-2h-8a2.4 2.4 0 0 0-1.706.706l-3.588 3.588A2.4 2.4 0 0 0 4 8v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2h-7"/><path d="M10 2v5a1 1 0 0 1-1 1H4"/><path d="m14 18-3-3 3-3"/></svg></button>';
      if (hasRightLink) actionsHTML += '<button class="qa-note-action-btn action-select-right" title="选中右侧原文" style="color: var(--text-dim, #8b949e);"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-symlink-icon lucide-file-symlink"><path d="M4 11V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h7"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="m10 18 3-3-3-3"/></svg></button>';
      actionsHTML += '<button class="qa-note-action-btn action-delete" title="删除批注">✖</button>';

      var actionsDiv = bubble.querySelector('.qa-note-actions');
      var noteHeader = bubble.querySelector('.qa-note-header');

      // 历史恢复后 strip 只会剥离按钮容器，不会移除 qa-note-header。
      if (!noteHeader) {
        var noteHandle = bubble.querySelector('.qa-note-handle');
        if (noteHandle) {
          noteHeader = document.createElement('div');
          noteHeader.className = 'qa-note-header';
          bubble.insertBefore(noteHeader, bubble.firstChild);
          noteHeader.appendChild(noteHandle);
        }
      }

      if (actionsDiv) {
        actionsDiv.innerHTML = actionsHTML;
        if (noteHeader && actionsDiv.parentNode !== noteHeader) {
          noteHeader.appendChild(actionsDiv);
        }
      } else {
        actionsDiv = document.createElement('div');
        actionsDiv.className = 'qa-note-actions';
        actionsDiv.innerHTML = actionsHTML;
        if (noteHeader) {
          noteHeader.appendChild(actionsDiv);
        } else {
          bubble.appendChild(actionsDiv);
        }
      }

      // 点击气泡 → 切换激活
      bubble.addEventListener('click', function (e) {
        if (e.target.closest('.qa-note-action-btn')) return;
        if (!qa.classList.contains('notes-active')) return;

        var bubbles = QA.getSortedBubbles(qa);
        QA.annotationStepIndex = bubbles.indexOf(bubble);
        QA.activateNote(qa, bubble);
      });
      // Hover 连线 — 仅气泡 hover
      bubble.addEventListener('mouseenter', function () {
        if (!qa.classList.contains('notes-active')) return;
        if (bubble.classList.contains('note-active')) return;
        QA.drawHoverConnectors(qa, bubble);
      });
      bubble.addEventListener('mouseleave', function () {
        QA.clearHoverConnectors(qa);
      });
    });

    // 监听三个滚动容器的 scroll 实时更新连线
    qa.querySelectorAll('[data-scrollable]').forEach(function (el) {
      el.addEventListener('scroll', function () {
        window.requestAnimationFrame(function () {
          var activeBubble = qa.querySelector('.qa-note-bubble.note-active');
          if (activeBubble && qa.classList.contains('notes-active')) {
            QA.drawStepConnectors(qa, activeBubble);
          }
        });
      });
    });

    // 全局恢复拖拽状态函数
    var restoreDragState = function () {
      qa.querySelectorAll('.temp-no-drag').forEach(function (el) {
        el.setAttribute('draggable', 'true');
        el.classList.remove('temp-no-drag');
      });
    };

    // 防止按钮点击时偷走焦点，导致放映模式下文字选中失效或隐形
    qa.querySelectorAll('.qa-note-action-btn').forEach(function (btn) {
      btn.addEventListener('mousedown', function (e) {
        e.preventDefault();
      });
    });

    // 任何鼠标按下（如果不是点击操作按钮），都尝试无缝恢复原来的可拖拽状态
    qa.addEventListener('mousedown', function (e) {
      if (!e.target.closest('.qa-note-action-btn')) {
        restoreDragState();
      }
    });

    // 点击空白处取消气泡选中
    qa.addEventListener('click', function (e) {
      if (!e.target.closest('.qa-note-bubble')) {
        qa.querySelectorAll('.note-selected').forEach(function (b) { return b.classList.remove('note-selected'); });
        restoreDragState();
      }
    });

    var removeAnchorWrap = function (anchor) {
      var badge = anchor.querySelector('.note-badge');
      if (badge) badge.remove();
      var parent = anchor.parentNode;
      if (parent) {
        while (anchor.firstChild) {
          parent.insertBefore(anchor.firstChild, anchor);
        }
        parent.removeChild(anchor);
        parent.normalize();
        QA.persistAnchorChange(parent, { immediate: true });
      }
    };

    // — 取消左侧关联按钮 —
    qa.querySelectorAll('.qa-note-action-btn.action-unlink-left').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        restoreDragState();
        var bubble = btn.closest('.qa-note-bubble');
        if (!bubble) return;
        var linkId = bubble.dataset.link;
        if (!linkId) return;

        var anchor = qa.querySelector('.text-anchor[data-link="' + linkId + '"]');
        if (anchor) removeAnchorWrap(anchor);

        // 一旦失去左侧正文锚点，这条批注就要退出正文顺序队列并重算全局编号。
        QA.recalcStepNumbers(qa);

        if (window.linkingState && window.linkingState.bubble === bubble && window.linkingState.direction === 'left') {
            window.linkingState = null;
            document.body.classList.remove('linking-mode');
        }

        QA.clearStepConnectors(qa);
        QA.initNoteInteractions(qa);
        if (window.historyMgr && !window.historyMgr.isRestoring) window.historyMgr.recordState(true);
      });
    });

    // — 取消右侧关联按钮 —
    qa.querySelectorAll('.qa-note-action-btn.action-unlink-right').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        restoreDragState();
        var bubble = btn.closest('.qa-note-bubble');
        if (!bubble) return;
        var linkId = bubble.dataset.link;
        var rightLinkId = bubble.dataset.linkAnswer || linkId;

        var anchor = QA.getAnswerAnchorByLink(qa, rightLinkId);
        if (anchor) removeAnchorWrap(anchor);

        if (window.linkingState && window.linkingState.bubble === bubble && window.linkingState.direction === 'right') {
            window.linkingState = null;
            document.body.classList.remove('linking-mode');
        }
        delete bubble.dataset.linkAnswer;
        bubble.removeAttribute('data-link-answer');

        QA.clearStepConnectors(qa);
        QA.initNoteInteractions(qa);
        if (window.historyMgr && !window.historyMgr.isRestoring) window.historyMgr.recordState(true);
      });
    });

    // — 选中左侧原文按钮 —
    qa.querySelectorAll('.qa-note-action-btn.action-select-left').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        restoreDragState();
        var bubble = btn.closest('.qa-note-bubble');
        if (!bubble) return;
        var linkId = bubble.dataset.link;
        var anchor = QA.getAnchorByLink(qa, linkId);
        if (!anchor) return;

        // 临时禁用拖拽以允许原生 Selection 高亮穿透
        var parentDraggable = anchor.closest('[draggable="true"]');
        if (parentDraggable && !document.documentElement.classList.contains('editor-mode')) {
          parentDraggable.setAttribute('draggable', 'false');
          parentDraggable.classList.add('temp-no-drag');
        }

        var range = document.createRange();
        range.selectNodeContents(anchor);
        var badges = anchor.querySelectorAll('.note-badge');
        if (badges.length > 0) {
          range.setEndBefore(badges[0]);
        }
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        QA.scrollIntoViewSmooth(anchor);
      });
    });

    // — 选中右侧原文按钮 —
    qa.querySelectorAll('.qa-note-action-btn.action-select-right').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        restoreDragState();
        var bubble = btn.closest('.qa-note-bubble');
        if (!bubble) return;
        var linkId = bubble.dataset.link;
        var rightLinkId = bubble.dataset.linkAnswer || linkId;
        var anchor = QA.getAnswerAnchorByLink(qa, rightLinkId);
        if (!anchor) return;

        // 临时禁用拖拽以允许原生 Selection 高亮穿透
        var parentDraggable = anchor.closest('[draggable="true"]');
        if (parentDraggable && !document.documentElement.classList.contains('editor-mode')) {
          parentDraggable.setAttribute('draggable', 'false');
          parentDraggable.classList.add('temp-no-drag');
        }

        var range = document.createRange();
        range.selectNodeContents(anchor);
        var badges = anchor.querySelectorAll('.note-badge');
        if (badges.length > 0) {
          range.setEndBefore(badges[0]);
        }
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        QA.scrollIntoViewSmooth(anchor);
      });
    });

    // — 删除批注按钮（✖） —
    qa.querySelectorAll('.qa-note-action-btn.action-delete').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var bubble = btn.closest('.qa-note-bubble');
        if (!bubble) return;
        if (!confirm('确定要删除这条批注吗？')) return;
        QA.deleteNote(qa, bubble.dataset.link);
      });
    });

    // — 关联左侧/右侧按钮（🔗） —
    qa.querySelectorAll('.qa-note-action-btn.action-link-left').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var bubble = btn.closest('.qa-note-bubble');
        if (bubble) QA.enterLinkingMode(qa, bubble, 'left');
      });
    });
    qa.querySelectorAll('.qa-note-action-btn.action-link-right').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var bubble = btn.closest('.qa-note-bubble');
        if (bubble) QA.enterLinkingMode(qa, bubble, 'right');
      });
    });
  };

})();
