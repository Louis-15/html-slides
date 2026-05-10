/* ===========================================
   quiz-header.js
   答题与批注组件 — 栏头与气泡迁移
   依赖：quiz-core.js、quiz-panel.js、quiz-dragdrop.js、quiz-persistence.js
   =========================================== */

(function () {
  'use strict';
  var QA = window.QA = window.QA || {};

  /* =========================================
     批注面板栏头
     ========================================= */

  /** 初始化批注面板栏头（展开态） */
  QA.initNotesHeader = function (qa) {
    var notesPanel = qa.querySelector('.qa-notes-panel');
    if (!notesPanel) return;

    // 如果栏头已存在，仅重新绑定事件后返回
    var existingHeader = notesPanel.querySelector('.qa-notes-header');
    if (existingHeader) {
      var collapseBtn = existingHeader.querySelector('.qa-notes-collapse-btn');
      if (collapseBtn) {
        collapseBtn.addEventListener('click', function () { return QA.toggleNotesPanel(qa); });
      }
      return;
    }

    // 创建栏头
    var header = document.createElement('div');
    header.className = 'qa-notes-header';
    header.innerHTML = '' +
      '<div class="qa-notes-header-left">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M15 18a3 3 0 1 0-6 0"/><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M12 13v-1"/></svg>' +
        '<span>批注</span>' +
        '<span class="qa-notes-counter">0/0</span>' +
      '</div>' +
      '<button class="qa-notes-collapse-btn" title="收起批注面板 (D)">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/></svg>' +
      '</button>';

    // 插入到面板的最前面
    notesPanel.insertBefore(header, notesPanel.firstChild);

    // 创建气泡列表容器（如果不存在）
    var notesList = notesPanel.querySelector('.qa-notes-list');
    if (!notesList) {
      notesList = document.createElement('div');
      notesList.className = 'qa-notes-list';
      notesList.setAttribute('data-scrollable', '');
      // 将面板中已有的气泡移入列表
      var existingBubbles = notesPanel.querySelectorAll('.qa-note-bubble');
      existingBubbles.forEach(function (b) { return notesList.appendChild(b); });
      notesPanel.appendChild(notesList);
    }

    // 折叠按钮
    var collapseBtn = header.querySelector('.qa-notes-collapse-btn');
    collapseBtn.addEventListener('click', function () { return QA.toggleNotesPanel(qa); });
  };

  /**
   * 将旧结构的气泡自动迁移到新的带 qa-note-header 的结构
   * 使得之前硬编码生成的页面无需重新生成也能应用新排版。
   */
  QA.migrateLegacyBubbles = function (qa) {
    qa.querySelectorAll('.qa-note-bubble').forEach(function (bubble) {
      if (bubble.querySelector('.qa-note-header')) return; // 已是新版结构

      var handle = bubble.querySelector('.qa-note-handle');
      var actions = bubble.querySelector('.qa-note-actions');
      if (handle && actions) {
        var header = document.createElement('div');
        header.className = 'qa-note-header';
        bubble.insertBefore(header, bubble.firstChild);
        header.appendChild(handle);
        header.appendChild(actions);
      }
    });
  };

  /* =========================================
     孤儿锚点扫描与气泡自动重建
     ========================================= */

  /**
   * 扫描正文 / 答题区中所有的 .text-anchor 和 .answer-anchor，
   * 收集所有唯一的 linkId，然后检查 .qa-notes-list 中是否存在对应的 .qa-note-bubble。
   * 对于缺失气泡的锚点（"孤儿锚点"），自动创建空气泡并追加到面板中。
   */
  QA.rebuildOrphanBubbles = function (qa) {
    var notesList = qa.querySelector('.qa-notes-list');
    if (!notesList) return;

    // 收集所有唯一 linkId 及其关联信息
    var linkMap = new Map(); // linkId → { step, hasLeft, hasRight }

    qa.querySelectorAll('.text-anchor[data-link]').forEach(function (anchor) {
      var linkId = anchor.dataset.link;
      if (!linkId) return;
      if (!linkMap.has(linkId)) {
        linkMap.set(linkId, { step: 0, hasLeft: false, hasRight: false });
      }
      linkMap.get(linkId).hasLeft = true;
      // 取最大 step
      var s = parseInt(anchor.dataset.step) || 0;
      if (s > linkMap.get(linkId).step) linkMap.get(linkId).step = s;
    });

    qa.querySelectorAll('.answer-anchor[data-link-answer], .answer-anchor[data-link]').forEach(function (anchor) {
      var linkId = anchor.dataset.linkAnswer || anchor.dataset.link;
      if (!linkId) return;
      if (!linkMap.has(linkId)) {
        linkMap.set(linkId, { step: 0, hasLeft: false, hasRight: false });
      }
      linkMap.get(linkId).hasRight = true;
      var s = parseInt(anchor.dataset.step) || 0;
      if (s > linkMap.get(linkId).step) linkMap.get(linkId).step = s;
    });

    // 按 step 排序
    var sortedEntries = Array.from(linkMap.entries()).sort(function (a, b) { return a[1].step - b[1].step; });

    sortedEntries.forEach(function (entry) {
      var linkId = entry[0];
      var info = entry[1];

      // 检查是否已存在对应气泡
      var existingBubble = notesList.querySelector('.qa-note-bubble[data-link="' + linkId + '"]');
      if (existingBubble) {
        existingBubble.dataset.step = info.step;
        var stepEl = existingBubble.querySelector('.qa-note-step');
        if (stepEl) stepEl.textContent = info.step;
        return;
      }

      // 创建空气泡
      var bubble = document.createElement('div');
      bubble.className = 'qa-note-bubble';
      bubble.dataset.link = linkId;
      if (info.hasRight) bubble.dataset.linkAnswer = linkId;
      bubble.dataset.step = info.step;
      bubble.setAttribute('draggable', 'false');

      // 按钮排列顺序：关联左侧 → 关联右侧 → 取消左侧 → 取消右侧 → 选中左侧原文 → 选中右侧原文 → 删除批注
      var actionsHTML = '';
      if (!info.hasLeft) actionsHTML += '<button class="qa-note-action-btn link-btn action-link-left" title="关联左侧"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-cable-icon lucide-cable"><path d="M17 19a1 1 0 0 1-1-1v-2a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a1 1 0 0 1-1 1z"/><path d="M17 21v-2"/><path d="M19 14V6.5a1 1 0 0 0-7 0v11a1 1 0 0 1-7 0V10"/><path d="M21 21v-2"/><path d="M3 5V3"/><path d="M4 10a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2a2 2 0 0 1-2 2z"/><path d="M7 5V3"/></svg></button>';
      if (!info.hasRight) actionsHTML += '<button class="qa-note-action-btn link-btn action-link-right" title="关联右侧"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-cable-icon lucide-cable"><path d="M17 19a1 1 0 0 1-1-1v-2a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a1 1 0 0 1-1 1z"/><path d="M17 21v-2"/><path d="M19 14V6.5a1 1 0 0 0-7 0v11a1 1 0 0 1-7 0V10"/><path d="M21 21v-2"/><path d="M3 5V3"/><path d="M4 10a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2a2 2 0 0 1-2 2z"/><path d="M7 5V3"/></svg></button>';
      if (info.hasLeft) actionsHTML += '<button class="qa-note-action-btn action-unlink-left" title="取消左侧关联" style="color: var(--editor-danger, #e74c3c);"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-link-off"><g style="transform-origin: center; transform: scaleX(-1);"><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M9 15l3 -3m2 -2l1 -1" /><path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464" /><path d="M3 3l18 18" /><path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463" /></g></svg></button>';
      if (info.hasRight) actionsHTML += '<button class="qa-note-action-btn action-unlink-right" title="取消右侧关联" style="color: var(--editor-danger, #e74c3c);"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-link-off"><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M9 15l3 -3m2 -2l1 -1" /><path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464" /><path d="M3 3l18 18" /><path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463" /></svg></button>';
      if (info.hasLeft) actionsHTML += '<button class="qa-note-action-btn action-select-left" title="选中左侧原文" style="color: var(--text-dim, #8b949e);"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-symlink-icon"><path d="M20 11V4a2 2 0 0 0-2-2h-8a2.4 2.4 0 0 0-1.706.706l-3.588 3.588A2.4 2.4 0 0 0 4 8v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2h-7"/><path d="M10 2v5a1 1 0 0 1-1 1H4"/><path d="m14 18-3-3 3-3"/></svg></button>';
      if (info.hasRight) actionsHTML += '<button class="qa-note-action-btn action-select-right" title="选中右侧原文" style="color: var(--text-dim, #8b949e);"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-symlink-icon lucide-file-symlink"><path d="M4 11V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h7"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="m10 18 3-3-3-3"/></svg></button>';
      actionsHTML += '<button class="qa-note-action-btn action-delete" title="删除批注">✖</button>';

      bubble.innerHTML = '' +
        '<div class="qa-note-header">' +
          '<div class="qa-note-handle">' +
            '<span class="qa-note-step">' + info.step + '</span>' +
          '</div>' +
          '<div class="qa-note-actions">' + actionsHTML + '</div>' +
        '</div>' +
        '<div class="qa-note-content" contenteditable="true" data-edit-id="' + linkId + '"></div>';
      notesList.appendChild(bubble);

      // 从 localStorage 恢复内容（与 AI 原生气泡走同一条 restoreAllElements 链路）
      var contentEl = bubble.querySelector('.qa-note-content');
      if (contentEl) {
        QA.hydrateDynamicNoteContent(contentEl);
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
      }

      QA.normalizeBubbleEndpointState(qa, bubble);
    });
  };

  /** 创建 AnnotationStore 状态指示器（已弃用，保留函数体以防调用） */
  QA._initStoreUI = function () {};

})();
