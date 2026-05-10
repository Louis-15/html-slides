/* ===========================================
   quiz-persistence.js
   答题与批注组件 — 持久化与删除管理
   依赖：quiz-core.js、quiz-constants.js
   =========================================== */

(function () {
  'use strict';
  var QA = window.QA = window.QA || {};

  /* === 模块级变量 === */
  var annotationStoreAuthorizePromise = null;
  var annotationStoreFirstGestureInstalled = false;
  var annotationStoreFirstGestureAttempted = false;

  /* =========================================
     批注存档调度
     ========================================= */

  /** 统一的批注存档调度入口，避免各处重复判断 API 能力 */
  QA.scheduleAnnotationSave = function () {
    if (window.AnnotationStore && typeof window.AnnotationStore.scheduleSave === 'function') {
      window.AnnotationStore.scheduleSave();
    }
  };

  /** 统一检查 AnnotationStore 是否暴露了写入能力查询接口 */
  QA.canUseAnnotationStoreWriteAPI = function () {
    return !!(window.AnnotationStore && typeof window.AnnotationStore.hasWriteAccess === 'function');
  };

  /* =========================================
     AnnotationStore 授权管理
     ========================================= */

  QA.hasAnnotationStoreWriteAccess = function () {
    return QA.canUseAnnotationStoreWriteAPI() && window.AnnotationStore.hasWriteAccess();
  };

  function hideAnnotationStoreStatus(statusEl) {
    if (!statusEl) return;
    clearTimeout(statusEl._qaStatusTimer);
    statusEl.textContent = '';
    statusEl.title = '';
    statusEl.style.display = 'none';
    statusEl.style.opacity = '0';
  }

  function showAnnotationStoreStatus(statusEl, status) {
    if (!statusEl) return;
    clearTimeout(statusEl._qaStatusTimer);
    statusEl.style.display = 'inline-flex';
    statusEl.style.alignItems = 'center';
    statusEl.style.gap = '4px';
    statusEl.style.opacity = '1';

    if (status === 'error') {
      statusEl.textContent = '保存失败';
      statusEl.style.color = 'var(--accent-red, #f85149)';
      statusEl.title = '写入批注存档失败，点击后重新请求授权';
      return;
    }

    statusEl.textContent = '📁 点击授权保存';
    statusEl.style.color = 'var(--text-dim, #8b949e)';
    statusEl.title = '首次保存需要授权创建 JSON 存档文件';
  }

  QA.syncAnnotationStoreStatus = function (status) {
    document.querySelectorAll('.annotation-store-status').forEach(function (statusEl) {
      if (status === 'ready') {
        hideAnnotationStoreStatus(statusEl);
      } else {
        showAnnotationStoreStatus(statusEl, status);
      }
    });
  };

  QA.requestAnnotationStoreAuthorization = function (showFallbackOnFailure) {
    if (!window.AnnotationStore || typeof window.AnnotationStore.authorizeAndSave !== 'function') {
      return Promise.resolve(false);
    }
    if (QA.hasAnnotationStoreWriteAccess()) {
      QA.syncAnnotationStoreStatus('ready');
      return Promise.resolve(true);
    }
    if (annotationStoreAuthorizePromise) return annotationStoreAuthorizePromise;

    annotationStoreAuthorizePromise = window.AnnotationStore.authorizeAndSave().then(function (ok) {
      if (ok) {
        QA.syncAnnotationStoreStatus('ready');
        return true;
      }
      if (showFallbackOnFailure) QA.syncAnnotationStoreStatus('needs-auth');
      return false;
    }).catch(function () {
      if (showFallbackOnFailure) QA.syncAnnotationStoreStatus('error');
      return false;
    }).finally(function () {
      annotationStoreAuthorizePromise = null;
    });

    return annotationStoreAuthorizePromise;
  };

  QA.installAnnotationStoreFirstGestureAuth = function () {
    if (annotationStoreFirstGestureInstalled || annotationStoreFirstGestureAttempted) return;
    if (!window.AnnotationStore || typeof window.AnnotationStore.authorizeAndSave !== 'function') return;
    if (QA.hasAnnotationStoreWriteAccess()) return;

    annotationStoreFirstGestureInstalled = true;

    function removeListeners() {
      if (!annotationStoreFirstGestureInstalled) return;
      annotationStoreFirstGestureInstalled = false;
      document.removeEventListener('click', handleFirstGesture, true);
      document.removeEventListener('keydown', handleFirstGesture, true);
    }

    function handleFirstGesture() {
      removeListeners();
      annotationStoreFirstGestureAttempted = true;
      QA.requestAnnotationStoreAuthorization(true);
    }

    document.addEventListener('click', handleFirstGesture, true);
    document.addEventListener('keydown', handleFirstGesture, true);
  };

  /** 正确答案等结构化编辑要进入历史栈，保证撤销/重做可用 */
  QA.recordHistorySnapshot = function () {
    if (window.historyMgr && !window.historyMgr.isRestoring && typeof window.historyMgr.recordState === 'function') {
      window.historyMgr.recordState(true);
    }
  };

  /* =========================================
     锚点变更持久化
     ========================================= */

  /**
   * 锚点变更后持久化：触发 JSON 文件保存
   * AnnotationStore 会从 DOM 收集所有带 data-edit-id 容器的 innerHTML
   */
  QA.persistAnchorChange = function (anchor, options) {
    var persistNode = anchor || null;
    var persistRoot = persistNode && typeof persistNode.closest === 'function'
      ? persistNode.closest('[data-edit-id]')
      : null;
    var persistOptions = options && typeof options === 'object' ? options : null;
    var immediate = !!(persistOptions && persistOptions.immediate === true);

    /* 新建批注、关联/解绑端点、删除批注都属于离散结构变更。
       如果这里只走 debounce 的 sidecar 保存，用户在这一步后立刻刷新，
       就可能只留下 new-note-* 的内容缓存，却丢掉 passage / answer 上的 anchor 结构，
       表现成"新批注没了，但再次新建又自动带回旧文字"。
       因此这类链路必须先把最近的 data-edit-id 根块立即写入本地，再尽量立即 flush sidecar。 */
    if (persistRoot && window.PersistenceLayer && typeof window.PersistenceLayer.saveElement === 'function') {
      window.PersistenceLayer.saveElement(persistRoot);
    }

    if (immediate && window.AnnotationStore) {
      var canScheduleAnnotationSave = typeof window.AnnotationStore.scheduleSave === 'function';
      var canSaveAnnotationImmediately = typeof window.AnnotationStore.saveNow === 'function';
      var canEnsureAnnotationWriteAccess = typeof window.AnnotationStore.ensureWriteAccess === 'function';
      var canAuthorizeAnnotationSave = typeof window.AnnotationStore.authorizeAndSave === 'function';
      var hasAnnotationWriteAccess = typeof window.AnnotationStore.hasWriteAccess === 'function'
        ? window.AnnotationStore.hasWriteAccess()
        : true;

      if (!hasAnnotationWriteAccess && canEnsureAnnotationWriteAccess) {
        window.AnnotationStore.ensureWriteAccess().then(function (ok) {
          if (!ok) return;
          if (canSaveAnnotationImmediately) {
            window.AnnotationStore.saveNow();
          } else if (canScheduleAnnotationSave) {
            window.AnnotationStore.scheduleSave();
          }
        }).catch(function () {});
      } else if (!hasAnnotationWriteAccess && canAuthorizeAnnotationSave) {
        window.AnnotationStore.authorizeAndSave().catch(function () {});
      } else if (canSaveAnnotationImmediately) {
        window.AnnotationStore.saveNow();
      } else if (canScheduleAnnotationSave) {
        window.AnnotationStore.scheduleSave();
      }
      return;
    }

    QA.scheduleAnnotationSave();
  };

  /** 编辑模式下的结构化变更需要同时触发保存和历史快照 */
  QA.persistQuizAuthoringChange = function (options) {
    var persistOptions = options && typeof options === 'object' ? options : null;
    var persistNode = persistOptions && persistOptions.node ? persistOptions.node : null;
    var persistRoot = persistOptions && persistOptions.root
      ? persistOptions.root
      : (persistNode && typeof persistNode.closest === 'function'
        ? persistNode.closest('[data-edit-id]')
        : null);

    /* quiz 的 fragment authoring 也是按钮驱动的离散结构变更，不是持续键入。
       如果这里只走 debounce sidecar 保存，那么用户在退出编辑模式后立刻刷新时，
       很容易在落盘 Promise 真正完成前读回旧数据，表现成"第一次刷新没生效，第二次才有"。
       因此这里要和普通页面对齐：
       1. 先把最近的 data-edit-id 根块立即写入 localStorage；
       2. 再把 sidecar 尽量在当前手势里立即落盘；
       3. 只有非离散事务才继续使用 scheduleSave 的 debounce 语义。 */
    if (persistRoot && window.PersistenceLayer && typeof window.PersistenceLayer.saveElement === 'function') {
      window.PersistenceLayer.saveElement(persistRoot);
    }

    if (persistOptions && persistOptions.immediate === true && window.AnnotationStore) {
      var canScheduleAnnotationSave = typeof window.AnnotationStore.scheduleSave === 'function';
      var canSaveAnnotationImmediately = typeof window.AnnotationStore.saveNow === 'function';
      var canEnsureAnnotationWriteAccess = typeof window.AnnotationStore.ensureWriteAccess === 'function';
      var canAuthorizeAnnotationSave = typeof window.AnnotationStore.authorizeAndSave === 'function';
      var hasAnnotationWriteAccess = typeof window.AnnotationStore.hasWriteAccess === 'function'
        ? window.AnnotationStore.hasWriteAccess()
        : true;

      if (!hasAnnotationWriteAccess && canEnsureAnnotationWriteAccess) {
        window.AnnotationStore.ensureWriteAccess().then(function (ok) {
          if (!ok) return;
          if (canSaveAnnotationImmediately) {
            window.AnnotationStore.saveNow();
          } else if (canScheduleAnnotationSave) {
            window.AnnotationStore.scheduleSave();
          }
        }).catch(function () {});
      } else if (!hasAnnotationWriteAccess && canAuthorizeAnnotationSave) {
        window.AnnotationStore.authorizeAndSave().catch(function () {});
      } else if (canSaveAnnotationImmediately) {
        window.AnnotationStore.saveNow();
      } else if (canScheduleAnnotationSave) {
        window.AnnotationStore.scheduleSave();
      }
    } else {
      QA.scheduleAnnotationSave();
    }

    QA.recordHistorySnapshot();
  };

  /* =========================================
     删除持久化工具
     ========================================= */
  // 策略：已删除列表仅存 qa.dataset.deletedNotes（DOM 属性）
  // - historyMgr 快照自动捕获此属性（用于撤销/重做）
  // - AnnotationStore.scheduleSave() 从 DOM 收集并写入 JSON 文件（用于跨刷新持久化）

  /** 获取当前 QA 组件的已删除批注 ID 集合 */
  QA.getDeletedNoteIds = function (qa) {
    try {
      var raw = qa.dataset.deletedNotes;
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch (e) { return new Set(); }
  };

  /** 添加一个已删除的批注 ID */
  QA.addDeletedNoteId = function (qa, linkId) {
    var ids = QA.getDeletedNoteIds(qa);
    ids.add(linkId);
    var json = JSON.stringify([].concat(Array.from(ids)));
    // 写入 DOM 属性：historyMgr 快照会自动携带
    qa.dataset.deletedNotes = json;
    // ★ 同时写入 localStorage，刷新后 purgeDeletedNotes 才能恢复
    try {
      var slide = qa.closest('.slide');
      var slideIdx = slide ? slide.getAttribute('data-slide') : '0';
      var key = (window._editorUtils && window._editorUtils.storageKey) ? window._editorUtils.storageKey('deleted:' + slideIdx) : null;
      if (key) window.localStorage.setItem(key, json);
    } catch (e) {}
  };

  QA.parseNoteNumericId = function (linkId) {
    var match = String(linkId || '').match(/^note-(\d+)$/);
    return match ? parseInt(match[1], 10) : null;
  };

  QA.getNextNoteLinkId = function (qa) {
    var usedNumbers = new Set();

    qa.querySelectorAll('[data-link], [data-link-answer]').forEach(function (element) {
      var linkId = element.getAttribute('data-link') || element.getAttribute('data-link-answer') || '';
      var noteNumber = QA.parseNoteNumericId(linkId);
      if (Number.isInteger(noteNumber)) {
        usedNumbers.add(noteNumber);
      }
    });

    QA.getDeletedNoteIds(qa).forEach(function (linkId) {
      var noteNumber = QA.parseNoteNumericId(linkId);
      if (Number.isInteger(noteNumber)) {
        usedNumbers.add(noteNumber);
      }
    });

    var nextNumber = 1;
    while (usedNumbers.has(nextNumber)) {
      nextNumber += 1;
    }

    return 'note-' + String(nextNumber).padStart(2, '0');
  };

  /** 清除原始 HTML 中残留的已删除批注的锚点和气泡 */
  QA.purgeDeletedNotes = function (qa) {
    // 撤销/重做恢复时：DOM data-deleted-notes 已被 historyMgr 恢复为正确状态
    if (window.historyMgr && window.historyMgr.isRestoring) {
      return;
    }

    // 优先从 DOM 属性读取，刷新后回退到 localStorage
    var deletedIds = QA.getDeletedNoteIds(qa);
    if (deletedIds.size === 0) {
      try {
        var slide = qa.closest('.slide');
        var slideIdx = slide ? slide.getAttribute('data-slide') : '0';
        var key = (window._editorUtils && window._editorUtils.storageKey) ? window._editorUtils.storageKey('deleted:' + slideIdx) : null;
        if (key) {
          var saved = window.localStorage.getItem(key);
          if (saved) {
            deletedIds = new Set(JSON.parse(saved));
            // 回写到 DOM 属性，后续操作可以继续增量更新
            qa.dataset.deletedNotes = saved;
          }
        }
      } catch (e) {}
    }
    if (deletedIds.size === 0) return;

    deletedIds.forEach(function (linkId) {
      // 清除左栏锚点
      var anchor = qa.querySelector('.text-anchor[data-link="' + linkId + '"]');
      if (anchor) {
        anchor.querySelectorAll('.note-badge').forEach(function (b) { b.remove(); });
        var parent = anchor.parentNode;
        while (anchor.firstChild) parent.insertBefore(anchor.firstChild, anchor);
        parent.removeChild(anchor);
      }
      // 清除右栏锚点
      QA.getAnswerAnchorsByLink(qa, linkId).forEach(function (aa) {
        aa.querySelectorAll('.note-badge').forEach(function (b) { b.remove(); });
        var parent = aa.parentNode;
        while (aa.firstChild) parent.insertBefore(aa.firstChild, aa);
        parent.removeChild(aa);
      });
      // 清除气泡
      var bubble = qa.querySelector('.qa-note-bubble[data-link="' + linkId + '"]');
      if (bubble) bubble.remove();
    });
  };

})();
