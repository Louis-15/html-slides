/* ===========================================
   答题与批注组件 — 运行时模块
   quiz-annotation-runtime.js

   职责：
   1. 面板展开/收起状态管理
   2. 批注步进策略（annotation 策略注册）
   3. 角标点击 / 高亮原文 / 双向追视
   4. SVG 贝塞尔曲线连线（步进持久 + Hover 临时）
   5. 批注气泡拖拽排序 + data-step 同步
   6. 可拖动分隔条（正文/选项比例 + 批注上下联动）
   7. 全屏覆盖/还原
   8. 答题系统（选择/填空/连线拖拽/判分）
   9. 答题隔离规则 + 提交后批注浮现
   10. 气泡内容折叠
   11. 编辑模式：浮动工具条 + 添加/删除批注
   12. 快捷键 D/F
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

  /** 获取原文锚点元素 */
  function getAnchorByLink(qa, linkId) {
    return qa.querySelector(`.text-anchor[data-link="${linkId}"]`);
  }

  /** 获取批注气泡元素 */
  function getBubbleByLink(qa, linkId) {
    return qa.querySelector(`.qa-note-bubble[data-link="${linkId}"]`);
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
    // 更新按钮状态
    const btn = qa.querySelector('.qa-toggle-btn[data-panel="notes"]');
    if (btn) btn.classList.toggle('active', isActive);
  }

  /** 切换作答面板 */
  function toggleAnswersPanel(qa) {
    if (!qa) return;
    const isActive = qa.classList.toggle('answers-active');
    const btn = qa.querySelector('.qa-toggle-btn[data-panel="answers"]');
    if (btn) btn.classList.toggle('active', isActive);
    // 全屏状态下切换回来要先取消全屏
    if (!isActive && qa.classList.contains('answers-full')) {
      qa.classList.remove('answers-full');
    }
  }

  /** 全屏覆盖/还原 — 不关闭批注面板 */
  function toggleFullscreen(qa) {
    if (!qa) return;
    // 全屏必须先确保答题面板已展开
    if (!qa.classList.contains('answers-active')) {
      qa.classList.add('answers-active');
      const answersBtn = qa.querySelector('.qa-toggle-btn[data-panel="answers"]');
      if (answersBtn) answersBtn.classList.add('active');
    }
    const isFull = qa.classList.toggle('answers-full');
    // ★ 全屏时不关闭批注面板！只隐藏左侧正文行
    // 清除拖动留下的 inline style，让 CSS class 生效
    const body = qa.querySelector('.qa-body');
    if (body) body.style.gridTemplateRows = '';
    // 更新全屏按钮文字
    const fsBtn = qa.querySelector('.qa-fullscreen-btn');
    if (fsBtn) {
      fsBtn.textContent = isFull ? '⬇ 还原' : '⬆ 全屏';
    }
  }


  // =========================================
  // 2. 批注步进策略
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
  // 3. 批注激活与降噪
  // =========================================

  /** 激活指定批注 */
  function activateNote(qa, bubble) {
    if (!qa || !bubble) return;
    const linkId = bubble.dataset.link;

    // 清除其他激活状态
    clearAllActive(qa);

    // 激活气泡
    bubble.classList.add('note-active');
    // 自动展开折叠内容
    bubble.classList.add('note-expanded');
    qa.classList.add('has-active-note');

    // 激活原文锚点
    const anchor = getAnchorByLink(qa, linkId);
    if (anchor) anchor.classList.add('anchor-active');

    // 绘制步进连线（持久）
    drawStepConnector(qa, linkId);

    // 双向追视
    scrollIntoViewSmooth(bubble);
    if (anchor) scrollIntoViewSmooth(anchor);

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
  }

  /** 清除所有激活状态 */
  function clearAllActive(qa) {
    if (!qa) return;
    qa.querySelectorAll('.note-active').forEach(b => b.classList.remove('note-active', 'note-expanded'));
    qa.querySelectorAll('.anchor-active').forEach(a => a.classList.remove('anchor-active'));
    qa.classList.remove('has-active-note');
    clearStepConnector(qa);
  }

  /** 平滑滚动到可见区域 */
  function scrollIntoViewSmooth(el) {
    if (!el) return;
    // 找到最近的可滚动父容器
    const scrollParent = el.closest('.qa-passage, .qa-notes-top, .qa-notes-btm, .qa-answer-content');
    if (scrollParent) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }


  // =========================================
  // 4. SVG 连线系统
  // =========================================

  /** 绘制步进连线（持久，直到下一个步进） */
  function drawStepConnector(qa, linkId) {
    clearStepConnector(qa);
    const line = createConnectorLine(qa, linkId, 'connector-step');
    if (line) {
      const canvas = qa.querySelector('.qa-connector-canvas');
      if (canvas) canvas.appendChild(line);
    }
  }

  /** 清除步进连线 */
  function clearStepConnector(qa) {
    if (!qa) return;
    const canvas = qa.querySelector('.qa-connector-canvas');
    if (canvas) {
      canvas.querySelectorAll('.connector-step').forEach(l => l.remove());
    }
  }

  /** 绘制 Hover 临时连线 */
  function drawHoverConnector(qa, linkId) {
    clearHoverConnector(qa);
    const line = createConnectorLine(qa, linkId, 'connector-hover');
    if (line) {
      const canvas = qa.querySelector('.qa-connector-canvas');
      if (canvas) canvas.appendChild(line);
    }
  }

  /** 清除 Hover 临时连线 */
  function clearHoverConnector(qa) {
    if (!qa) return;
    const canvas = qa.querySelector('.qa-connector-canvas');
    if (canvas) {
      canvas.querySelectorAll('.connector-hover').forEach(l => l.remove());
    }
  }

  /** 创建一条 SVG 贝塞尔曲线连线（精确锚定到角标和序号球） */
  function createConnectorLine(qa, linkId, className) {
    const anchor = getAnchorByLink(qa, linkId);
    const bubble = getBubbleByLink(qa, linkId);
    if (!anchor || !bubble) return null;

    // 精确获取角标和批注序号的位置
    const badge = anchor.querySelector('.note-badge') || anchor;
    const step = bubble.querySelector('.qa-note-step') || bubble;

    const qaRect = qa.getBoundingClientRect();
    const badgeRect = badge.getBoundingClientRect();
    const stepRect = step.getBoundingClientRect();

    // 起点：角标右侧中点
    const x1 = badgeRect.right - qaRect.left;
    const y1 = badgeRect.top + badgeRect.height / 2 - qaRect.top;

    // 终点：序号球左侧中点
    const x2 = stepRect.left - qaRect.left;
    const y2 = stepRect.top + stepRect.height / 2 - qaRect.top;

    // 贝塞尔控制点
    const dx = Math.abs(x2 - x1) * 0.4;
    const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', `qa-connector-line ${className}`);
    path.dataset.link = linkId;
    return path;
  }


  // =========================================
  // 5. 拖拽排序
  // =========================================

  let draggedBubble = null;

  function initDragAndDrop(qa) {
    const notesContainers = qa.querySelectorAll('.qa-notes-top, .qa-notes-btm');
    const placeholder = document.createElement('div');
    placeholder.className = 'qa-note-placeholder';

    // 为每个气泡绑定拖拽事件
    qa.querySelectorAll('.qa-note-bubble').forEach(b => bindDragEvents(qa, b, placeholder));

    // 容器级委托 dragover（避免死循环闪烁）
    notesContainers.forEach(container => {
      container.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!draggedBubble) return;
        const afterElement = getDragAfterElement(container, e.clientY);
        if (afterElement == null) {
          container.appendChild(placeholder);
        } else {
          container.insertBefore(placeholder, afterElement);
        }
      });
    });
  }

  /** 绑定单个气泡的拖拽事件 */
  function bindDragEvents(qa, b, placeholder) {
    b.addEventListener('dragstart', (e) => {
      draggedBubble = b;
      b.classList.add('dragging-source');
      e.dataTransfer.effectAllowed = 'move';
      placeholder.style.minHeight = b.offsetHeight + 'px';
      // 必须 setTimeout，否则还没抓起连 ghost 都隐藏了
      setTimeout(() => b.style.display = 'none', 0);
    });

    b.addEventListener('dragend', () => {
      if (draggedBubble) {
        draggedBubble.classList.remove('dragging-source');
        draggedBubble.style.display = '';
      }
      if (placeholder.parentNode && draggedBubble) {
        placeholder.parentNode.replaceChild(draggedBubble, placeholder);
      }
      draggedBubble = null;

      // 重算 data-step 序号
      recalcStepNumbers(qa);

      // 恢复激活状态和更新连线
      const activeBubble = qa.querySelector('.qa-note-bubble.note-active');
      if (activeBubble) {
        const bubbles = getSortedBubbles(qa);
        annotationStepIndex = bubbles.indexOf(activeBubble);
        updateProgressCounter(qa);
        window.requestAnimationFrame(() => drawStepConnector(qa, activeBubble.dataset.link));
      } else {
        updateProgressCounter(qa);
      }
    });
  }

  /** 获取拖拽位置下方最近的气泡（容器级算法，避免闪烁） */
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

  /** 重算所有气泡的 data-step 序号并同步原文锚点 */
  function recalcStepNumbers(qa) {
    const allBubbles = qa.querySelectorAll('.qa-note-bubble');
    allBubbles.forEach((bubble, index) => {
      const newStep = index + 1;
      bubble.dataset.step = newStep;
      // 更新气泡内的序号显示
      const stepEl = bubble.querySelector('.qa-note-step');
      if (stepEl) stepEl.textContent = newStep;

      // 同步原文锚点的 data-step
      const linkId = bubble.dataset.link;
      const anchor = getAnchorByLink(qa, linkId);
      if (anchor) {
        anchor.dataset.step = newStep;
        const badge = anchor.querySelector('.note-badge');
        if (badge) badge.textContent = newStep;
      }
    });
  }


  // =========================================
  // 6. 可拖动分隔条
  // =========================================

  function initResizeBar(qa) {
    const resizeBar = qa.querySelector('.qa-resize-bar');
    if (!resizeBar) return;

    const body = qa.querySelector('.qa-body');
    let isResizing = false;
    let startY = 0;

    resizeBar.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isResizing = true;
      startY = e.clientY;
      resizeBar.classList.add('dragging');

      // 记录当前实际像素高度
      const passage = qa.querySelector('.qa-passage');
      const ansPanel = qa.querySelector('.qa-answer-panel');
      const startPassH = passage.offsetHeight;
      const startAnsH = ansPanel.offsetHeight;

      const onMove = (ev) => {
        if (!isResizing) return;
        const delta = ev.clientY - startY;
        const totalH = startPassH + startAnsH;
        const newPass = Math.max(80, startPassH + delta);
        const newAns = Math.max(80, totalH - newPass + 8); // 8 = resize-bar
        // 用 fr 换算
        const passFr = newPass / totalH;
        const ansFr = newAns / totalH;
        body.style.gridTemplateRows = `${passFr}fr 8px ${ansFr}fr`;
      };
      const onUp = () => {
        isResizing = false;
        resizeBar.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
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
        if (qa.classList.contains('submitted')) return;

        const isMulti = option.closest('.qa-question')?.dataset.type === 'multi';
        if (!isMulti) {
          // 单选：取消同组其他选中
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

        // 只显示序号，不显示内容
        const userSpan = slot.querySelector('.qa-blank-user');
        if (userSpan) {
          userSpan.textContent = optionId;
        } else {
          slot.textContent = optionId;
        }
        slot.classList.add('filled');
        slot.dataset.userAnswer = optionId;

        // 标记选项为已使用
        const dragOpt = qa.querySelector(`.qa-drag-option[data-option="${optionId}"]`);
        if (dragOpt) dragOpt.classList.add('used');
      });

      // 点击已填入的空位可以清除
      slot.addEventListener('click', () => {
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
        if (qa.classList.contains('submitted')) return;
        submitQuiz(qa);
      });
    }
  }

  /** 提交判分 */
  function submitQuiz(qa) {
    qa.classList.add('submitted');

    // 禁用提交按钮
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
        // 延迟显示动画
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

      // 连线题（有前后两段的结构）
      const userSpan = slot.querySelector('.qa-blank-user');
      const answerSpan = slot.querySelector('.qa-blank-answer');

      if (userSpan && answerSpan) {
        // 连线题
        const isCorrect = userAnswer.toUpperCase() === correctAnswer.toUpperCase();

        // 添加判分标记
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
          // 答对：不显示后段重复
          slot.classList.add('result-correct');
        } else {
          // 答错：后段浮现正确选项
          answerSpan.textContent = correctAnswer;
        }
      } else {
        // 普通填空题 — 直接显示正确答案
        let correctEl = slot.querySelector('.qa-blank-correct');
        if (!correctEl) {
          correctEl = document.createElement('span');
          correctEl.className = 'qa-blank-correct';
          correctEl.textContent = correctAnswer;
          slot.appendChild(correctEl);
        }
      }
    });

    // — 解锁批注功能 —
    // .submitted 类已添加，CSS 会自动显示批注
    // 启用批注按钮
    const notesBtn = qa.querySelector('.qa-toggle-btn[data-panel="notes"]');
    if (notesBtn) {
      notesBtn.classList.remove('disabled');
      notesBtn.style.opacity = '';
      notesBtn.style.pointerEvents = '';
    }
  }


  // =========================================
  // 8. 进度指示器
  // =========================================

  function updateProgressCounter(qa) {
    const counter = qa.querySelector('.qa-step-counter');
    if (!counter) return;
    const bubbles = getSortedBubbles(qa);
    const total = bubbles.length;
    const current = annotationStepIndex + 1;
    counter.textContent = `${current}/${total}`;
  }


  // =========================================
  // 9. 角标点击 + Hover 连线
  // =========================================

  function initNoteInteractions(qa) {
    // 角标点击 → 激活对应批注
    qa.querySelectorAll('.note-badge').forEach(badge => {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        const anchor = badge.closest('.text-anchor');
        if (!anchor) return;
        const linkId = anchor.dataset.link;
        const bubble = getBubbleByLink(qa, linkId);
        if (!bubble) return;

        // 更新步进索引
        const bubbles = getSortedBubbles(qa);
        annotationStepIndex = bubbles.indexOf(bubble);

        // 确保面板已展开
        if (!qa.classList.contains('notes-active')) {
          toggleNotesPanel(qa);
        }

        activateNote(qa, bubble);
      });
    });

    // Hover 连线 — 原文锚点
    qa.querySelectorAll('.text-anchor').forEach(anchor => {
      anchor.addEventListener('mouseenter', () => {
        if (!qa.classList.contains('notes-active')) return;
        drawHoverConnector(qa, anchor.dataset.link);
      });
      anchor.addEventListener('mouseleave', () => {
        clearHoverConnector(qa);
      });
    });

    // 气泡：点击切换激活 + Hover 连线
    qa.querySelectorAll('.qa-note-bubble').forEach(bubble => {
      // 点击气泡 → 切换激活（所有模式均可）
      bubble.addEventListener('click', (e) => {
        // 如果点击的是悬浮操作按钮，则不触发选中
        if (e.target.closest('.qa-note-action-btn')) return;
        if (!qa.classList.contains('notes-active')) return;

        // 使用动态 indexOf 替代静态闭包 idx，避免拖拽后索引错乱
        const bubbles = getSortedBubbles(qa);
        annotationStepIndex = bubbles.indexOf(bubble);
        activateNote(qa, bubble);

        // 编辑模式下同时切换操作按钮可见性
        if (document.body.classList.contains('edit-mode')) {
          qa.querySelectorAll('.qa-note-bubble.note-selected').forEach(b => {
            if (b !== bubble) b.classList.remove('note-selected');
          });
          bubble.classList.toggle('note-selected');
        }
      });

      // Hover 连线
      bubble.addEventListener('mouseenter', () => {
        if (!qa.classList.contains('notes-active')) return;
        drawHoverConnector(qa, bubble.dataset.link);
      });
      bubble.addEventListener('mouseleave', () => {
        clearHoverConnector(qa);
      });
    });

    // 监听滚动实时更新连线
    qa.querySelectorAll('[data-scrollable]').forEach(el => {
      el.addEventListener('scroll', () => {
        window.requestAnimationFrame(() => {
          const activeBubble = qa.querySelector('.qa-note-bubble.note-active');
          if (activeBubble && qa.classList.contains('notes-active')) {
            drawStepConnector(qa, activeBubble.dataset.link);
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

        // 自动选中原文
        const range = document.createRange();
        range.selectNodeContents(anchor);
        // 排除角标
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
  }

  /** 删除批注 */
  function deleteNote(qa, linkId) {
    // 删除气泡
    const bubble = getBubbleByLink(qa, linkId);
    if (bubble) bubble.remove();

    // 清除原文锚点格式并解包
    const anchor = getAnchorByLink(qa, linkId);
    if (anchor) {
      // 移除角标
      anchor.querySelectorAll('.note-badge').forEach(b => b.remove());
      // 清除 inline style
      anchor.removeAttribute('style');
      // 解包 span — 保留内部文本
      const parent = anchor.parentNode;
      while (anchor.firstChild) {
        parent.insertBefore(anchor.firstChild, anchor);
      }
      parent.removeChild(anchor);
    }

    // 清除连线
    clearStepConnector(qa);
    clearHoverConnector(qa);

    // 重算序号
    recalcStepNumbers(qa);
    updateProgressCounter(qa);
  }


  // =========================================
  // 10. 气泡内容折叠
  // =========================================

  /** 气泡内容折叠 — 点击气泡即可自动展开，无需独立按钮 */
  function initBubbleFolding(qa) {
    // 点击气泡由 initNoteInteractions 统一处理，此处无需额外绑定
  }


  // =========================================
  // 11. 编辑模式 — 浮动工具条（添加批注）
  // =========================================

  function initAnnotationToolbar(qa) {
    const passage = qa.querySelector('.qa-passage');
    if (!passage) return;

    // 创建浮动工具条 DOM（如果不存在）
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

    // 监听选区变化（仅编辑模式）
    document.addEventListener('selectionchange', () => {
      if (!document.body.classList.contains('edit-mode')) {
        toolbar.classList.remove('visible');
        return;
      }

      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        toolbar.classList.remove('visible');
        return;
      }

      // 检查选区是否在正文区域内
      const range = sel.getRangeAt(0);
      if (!passage.contains(range.commonAncestorContainer)) {
        toolbar.classList.remove('visible');
        return;
      }

      // 检查选中内容是否已经是锚点（避免重复添加）
      const parentAnchor = range.commonAncestorContainer.closest?.('.text-anchor');
      if (parentAnchor) {
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
      toolbar.style.top = `${firstRect.top - qaRect.top - 45}px`; // 45px 在选区上方
      toolbar.classList.add('visible');
    });

    // 工具条按钮点击 → 创建批注
    toolbar.querySelectorAll('.qa-toolbar-btn').forEach(btn => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault(); // 防止失去选区
      });
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const format = btn.dataset.format;
        createAnnotation(qa, format);
        toolbar.classList.remove('visible');
      });
    });
  }

  /** 创建新批注 */
  function createAnnotation(qa, format) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);

    // 生成新的 data-link ID（取当前最大值 +1）
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

    // 包裹选区为 text-anchor
    const anchor = document.createElement('span');
    anchor.className = 'text-anchor';
    anchor.dataset.link = newLinkId;
    anchor.dataset.step = newStep;

    // 应用格式
    const formatStyles = {
      color: 'color: var(--accent-blue);',
      highlight: 'background-color: rgba(88, 166, 255, 0.15);',
      underline: 'text-decoration: underline; text-decoration-color: var(--accent-blue);',
      strikethrough: 'text-decoration: line-through; text-decoration-color: var(--accent-red);'
    };
    anchor.setAttribute('style', formatStyles[format] || '');

    // 包裹选区
    range.surroundContents(anchor);

    // 添加角标
    const badge = document.createElement('sup');
    badge.className = 'note-badge';
    badge.textContent = newStep;
    anchor.appendChild(badge);

    // 在批注面板创建空气泡
    const notesPanel = qa.querySelector('.qa-notes-top');
    if (!notesPanel) return;

    const bubble = document.createElement('div');
    bubble.className = 'qa-note-bubble';
    bubble.dataset.link = newLinkId;
    bubble.dataset.step = newStep;
    bubble.setAttribute('draggable', 'true');
    bubble.innerHTML = `
      <div class="qa-note-handle">
        <span class="qa-note-step">${newStep}</span>
      </div>
      <div class="qa-note-content" contenteditable="true" data-edit-id="new-${newLinkId}"></div>
      <div class="qa-note-actions">
        <button class="qa-note-action-btn action-select" title="选中原文">📌</button>
        <button class="qa-note-action-btn action-delete" title="删除批注">✖</button>
      </div>
    `;
    notesPanel.appendChild(bubble);

    // 聚焦到新气泡的内容区
    const contentEl = bubble.querySelector('.qa-note-content');
    if (contentEl) {
      contentEl.focus();
    }

    // 确保批注面板展开
    if (!qa.classList.contains('notes-active')) {
      toggleNotesPanel(qa);
    }

    // 重新绑定事件
    initNoteInteractions(qa);
    initBubbleFolding(qa);
    initDragAndDrop(qa);

    // 清除选区
    sel.removeAllRanges();
  }


  // =========================================
  // 12. 快捷键 D / F
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

    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      toggleAnswersPanel(qa);
    }
  });


  // =========================================
  // 13. 角标智能避让
  // =========================================

  /** 对同一个容器内相邻的角标进行横向避让 */
  function arrangeAdjacentBadges(qa) {
    const badges = Array.from(qa.querySelectorAll('.note-badge'));
    for (let i = 1; i < badges.length; i++) {
      const prevBadge = badges[i - 1];
      const currBadge = badges[i];

      // 检查两个角标的父锚点是否相邻或嵌套
      const prevAnchor = prevBadge.closest('.text-anchor');
      const currAnchor = currBadge.closest('.text-anchor');

      if (!prevAnchor || !currAnchor) continue;

      const prevRect = prevBadge.getBoundingClientRect();
      const currRect = currBadge.getBoundingClientRect();

      // 如果两个角标在同一行且距离小于 5px，横向错开
      if (Math.abs(prevRect.top - currRect.top) < 5 &&
          Math.abs(prevRect.right - currRect.left) < 5) {
        currBadge.style.marginLeft = '0px'; // 紧贴排列
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
    qa.querySelectorAll('.qa-passage, .qa-answer-content, .qa-notes-top, .qa-notes-btm').forEach(el => {
      el.setAttribute('data-scrollable', '');
    });

    // 初始化各子系统
    initNoteInteractions(qa);
    initBubbleFolding(qa);
    initDragAndDrop(qa);
    initResizeBar(qa);
    initQuizSystem(qa);
    initAnnotationToolbar(qa);

    // 角标避让
    arrangeAdjacentBadges(qa);

    // 控制按钮绑定
    qa.querySelectorAll('.qa-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const panel = btn.dataset.panel;
        if (panel === 'notes') toggleNotesPanel(qa);
        if (panel === 'answers') toggleAnswersPanel(qa);
      });
    });

    // 全屏按钮绑定
    const fsBtn = qa.querySelector('.qa-fullscreen-btn');
    if (fsBtn) {
      fsBtn.addEventListener('click', () => toggleFullscreen(qa));
    }

    // 初始化进度指示器
    updateProgressCounter(qa);
  }

  // 自动标记并初始化
  function autoInit() {
    document.querySelectorAll('.quiz-annotation').forEach(qa => {
      // 自动标记为可步进组件
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
  // 使用 slides-runtime.js 提供的钩子接口，替代在 body 上挂 MutationObserver 的做法
  // （MutationObserver + subtree:true 会在翻页时反复触发回调，与 class 切换冲突导致翻页失效）
  if (typeof window.addSlideChangeListener === 'function') {
    window.addSlideChangeListener(function() {
      annotationStepIndex = -1;
      const qa = getActiveQA();
      if (qa) {
        clearAllActive(qa);
        updateProgressCounter(qa);
      }
    });
  }

})();
