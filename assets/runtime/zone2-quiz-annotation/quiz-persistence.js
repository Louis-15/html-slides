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
       如果这里只走 debounce 保存，用户在这一步后立刻刷新，
       就可能只留下 new-note-* 的内容缓存，却丢掉 passage / answer 上的 anchor 结构，
       表现成"新批注没了，但再次新建又自动带回旧文字"。
       因此这类链路必须先把最近的 data-edit-id 根块立即写入本地，再尽快落盘。 */
    if (persistRoot && window.PersistenceLayer && typeof window.PersistenceLayer.saveElement === 'function') {
      window.PersistenceLayer.saveElement(persistRoot);
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
       如果这里只走 debounce 保存，那么用户在退出编辑模式后立刻刷新时，
       很容易在落盘 Promise 真正完成前读回旧数据，表现成"第一次刷新没生效，第二次才有"。
       因此这里要和普通页面对齐：先把最近的 data-edit-id 根块立即写入 localStorage，
       只有非离散事务才继续使用 scheduleSave 的 debounce 语义。 */
    if (persistRoot && window.PersistenceLayer && typeof window.PersistenceLayer.saveElement === 'function') {
      window.PersistenceLayer.saveElement(persistRoot);
    }

    QA.scheduleAnnotationSave();

    QA.recordHistorySnapshot();
    QA.saveQuizAnswerConfigAfterAuthoring(persistRoot ? persistRoot.closest('.quiz-annotation') : null);
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

  /* =========================================
     答题答案配置持久化
     将正确答案、用户答案等结构化数据写入 localStorage，
     确保刷新后编辑的答案不会丢失（与 PersistenceLayer.saveElement 互补，
     后者只保存 [data-edit-id] 的 innerHTML）。
     ========================================= */

  /** 获取当前 QA 的答案配置存储 key */
  function getAnswerConfigKey(qa) {
    var utils = window._editorUtils;
    if (!qa || !utils || typeof utils.storageKey !== 'function') return '';
    var slide = qa.closest('.slide');
    var slideIdx = slide ? slide.getAttribute('data-slide') : '0';
    return utils.storageKey('quiz-answer-config:' + slideIdx);
  }

  /** 保存当前 QA 的所有答案配置到 localStorage */
  QA.saveQuizAnswerConfig = function (qa) {
    var key = getAnswerConfigKey(qa);
    if (!key) return;

    var config = {
      questions: []
    };

    qa.querySelectorAll('.qa-question').forEach(function (question) {
      var type = question.getAttribute('data-type') || '';
      var qConfig = { type: type, correct: [], blanks: [], userAnswers: [] };

      // 选择题：收集 data-correct
      if (type === 'single' || type === 'multi') {
        question.querySelectorAll('.qa-option[data-correct="true"]').forEach(function (opt) {
          var optId = opt.getAttribute('data-option');
          if (optId) qConfig.correct.push(optId);
        });
      }

      // 连线题/填空：收集 data-correct-answer 和 data-user-answer
      if (type === 'matching' || type === 'blank') {
        qa.querySelectorAll('.qa-passage .qa-blank-slot[data-blank-id]').forEach(function (slot) {
          var blankId = slot.getAttribute('data-blank-id') || '';
          var correctAnswer = slot.getAttribute('data-correct-answer') || '';
          var userAnswer = slot.getAttribute('data-user-answer') || '';
          qConfig.blanks.push({ blankId: blankId, correctAnswer: correctAnswer, userAnswer: userAnswer });
        });
      }

      config.questions.push(qConfig);
    });

    try {
      window.localStorage.setItem(key, JSON.stringify(config));
    } catch (e) {}
  };

  /** 从 localStorage 恢复答案配置 */
  QA.restoreQuizAnswerConfig = function (qa) {
    var key = getAnswerConfigKey(qa);
    if (!key) return;

    try {
      var raw = window.localStorage.getItem(key);
      if (!raw) return;
      var config = JSON.parse(raw);
      if (!config || !Array.isArray(config.questions)) return;

      // 收集 DOM 中所有 .qa-question（按 DOM 顺序），与 config 索引一一对应
      var domQuestions = qa.querySelectorAll('.qa-question');
      config.questions.forEach(function (qConfig, idx) {
        var question = domQuestions[idx];
        if (!question) return;
        var type = question.getAttribute('data-type') || '';

        // 选择题：恢复 data-correct
        if ((type === 'single' || type === 'multi') && Array.isArray(qConfig.correct)) {
          question.querySelectorAll('.qa-option').forEach(function (opt) {
            var optId = opt.getAttribute('data-option');
            if (optId && qConfig.correct.indexOf(optId) !== -1) {
              opt.setAttribute('data-correct', 'true');
            } else if (optId) {
              opt.removeAttribute('data-correct');
            }
          });
        }

        // 连线题/填空：恢复 data-correct-answer 和 data-user-answer
        if ((type === 'matching' || type === 'blank') && Array.isArray(qConfig.blanks)) {
          qConfig.blanks.forEach(function (blank) {
            if (blank.blankId) {
              var passageSlot = qa.querySelector('.qa-passage .qa-blank-slot[data-blank-id="' + blank.blankId + '"]');
              if (passageSlot) {
                if (blank.correctAnswer) passageSlot.setAttribute('data-correct-answer', blank.correctAnswer);
                if (blank.userAnswer) passageSlot.setAttribute('data-user-answer', blank.userAnswer);
              }
            }
          });
        }
      });
    } catch (e) {}
  };

  /** 在 persistQuizAuthoringChange 末尾调用，确保答案配置也写入 localStorage */
  QA.saveQuizAnswerConfigAfterAuthoring = function (qa) {
    if (!qa) {
      // 没有传入 qa 时尝试找当前活跃的
      qa = QA.getActiveQA();
    }
    if (qa) QA.saveQuizAnswerConfig(qa);
  };

  /* =========================================
     导出清洗钩子（onExportClean 注册）
     在保存到 HTML 文件时，负责清理批注瞬态数据、
     注入动态元素、同步答案属性到 clone。
     ========================================= */

  /** 注册 onExportClean 钩子（由 quiz-init.js 的 bindEditorModeSync 调用） */
  QA.registerOnExportClean = function () {
    if (QA.__onExportCleanRegistered) return;
    QA.__onExportCleanRegistered = true;

    if (!window.EditorHooks || typeof window.EditorHooks.register !== 'function') return;

    window.EditorHooks.register('onExportClean', function (clone) {
      // 1. 物理删除已删除批注的锚点和气泡
      var allDeleted = [];
      document.querySelectorAll('.quiz-annotation').forEach(function (qa) {
        var raw = qa.dataset.deletedNotes;
        if (raw) {
          try {
            JSON.parse(raw).forEach(function (id) {
              if (allDeleted.indexOf(id) === -1) allDeleted.push(id);
            });
          } catch (e) { }
        }
      });
      allDeleted.forEach(function (linkId) {
        // ★ 移除 text-anchor 前先清除内部角标，防止泄漏
        clone.querySelectorAll('.text-anchor[data-link="' + linkId + '"]').forEach(function (anchor) {
          anchor.querySelectorAll('.note-badge').forEach(function (badge) { badge.remove(); });
          var parent = anchor.parentNode;
          while (anchor.firstChild) parent.insertBefore(anchor.firstChild, anchor);
          parent.removeChild(anchor);
        });
        // ★ 移除 answer-anchor 前先清除内部角标，防止泄漏
        clone.querySelectorAll('.answer-anchor[data-link-answer="' + linkId + '"], .answer-anchor[data-link="' + linkId + '"]').forEach(function (anchor) {
          anchor.querySelectorAll('.note-badge').forEach(function (badge) { badge.remove(); });
          var parent = anchor.parentNode;
          while (anchor.firstChild) parent.insertBefore(anchor.firstChild, anchor);
          parent.removeChild(anchor);
        });
        clone.querySelectorAll('.qa-note-bubble[data-link="' + linkId + '"]').forEach(function (bubble) {
          bubble.remove();
        });
      });
      // 清除 clone 和实时 DOM 中的 deletedNotes
      document.querySelectorAll('.quiz-annotation').forEach(function (qa) {
        if (qa.dataset.deletedNotes) {
          delete qa.dataset.deletedNotes;
          try {
            var slide = qa.closest('.slide');
            var slideIdx = slide ? slide.getAttribute('data-slide') : '0';
            var key = (window._editorUtils && window._editorUtils.storageKey) ? window._editorUtils.storageKey('deleted:' + slideIdx) : null;
            if (key) window.localStorage.removeItem(key);
          } catch (e) {}
        }
      });
      clone.querySelectorAll('.quiz-annotation').forEach(function (qa) {
        if (qa.getAttribute('data-deleted-notes')) qa.removeAttribute('data-deleted-notes');
      });

      // 2. 注入动态气泡（不在 BASELINE 中但存在于实时 DOM）
      var cloneSlides = clone.querySelectorAll('.slide');
      var liveSlides = document.querySelectorAll('.slide');
      cloneSlides.forEach(function (cloneSlide, i) {
        var liveSlide = liveSlides[i];
        if (!liveSlide) return;
        var liveQA = liveSlide.querySelector('.quiz-annotation');
        var cloneQA = cloneSlide.querySelector('.quiz-annotation');
        if (!liveQA || !cloneQA) return;
        liveQA.querySelectorAll('.qa-note-bubble').forEach(function (liveBubble) {
          var linkId = liveBubble.getAttribute('data-link');
          if (!linkId) return;
          if (cloneQA.querySelector('.qa-note-bubble[data-link="' + linkId + '"]')) return;
          var clonedBubble = liveBubble.cloneNode(true);
          var contentEl = clonedBubble.querySelector('.qa-note-content[data-edit-id]');
          if (contentEl) {
            var editId = contentEl.getAttribute('data-edit-id');
            try {
              var saved = window.localStorage.getItem((window._editorUtils && window._editorUtils.storageKey ? window._editorUtils.storageKey('e:' + editId) : ''));
              if (saved && window.PersistenceLayer && typeof window.PersistenceLayer._stripHTML === 'function') {
                contentEl.innerHTML = window.PersistenceLayer._stripHTML(saved);
              }
            } catch (e) { }
          }
          var clonePanel = cloneQA.querySelector('.qa-notes-panel');
          if (clonePanel) clonePanel.appendChild(clonedBubble);
        });
        // 3. 同步实时 DOM 中气泡的 data-link-answer 到 clone
        cloneQA.querySelectorAll('.qa-note-bubble').forEach(function (cloneBubble) {
          var linkId = cloneBubble.getAttribute('data-link');
          if (!linkId) return;
          var liveBubble = liveQA.querySelector('.qa-note-bubble[data-link="' + linkId + '"]');
          if (!liveBubble) return;
          var liveAnswerLink = liveBubble.getAttribute('data-link-answer') || '';
          var cloneAnswerLink = cloneBubble.getAttribute('data-link-answer') || '';
          if (liveAnswerLink !== cloneAnswerLink) {
            if (liveAnswerLink) {
              cloneBubble.setAttribute('data-link-answer', liveAnswerLink);
            } else {
              cloneBubble.removeAttribute('data-link-answer');
              // 同时删除 clone 中残留的 answer-anchor（含内部角标）
              cloneQA.querySelectorAll('.answer-anchor[data-link-answer="' + cloneAnswerLink + '"], .answer-anchor[data-link="' + cloneAnswerLink + '"]').forEach(function (anchor) {
                anchor.querySelectorAll('.note-badge').forEach(function (badge) { badge.remove(); });
                var parent = anchor.parentNode;
                while (anchor.firstChild) parent.insertBefore(anchor.firstChild, anchor);
                parent.removeChild(anchor);
              });
            }
          }
        });
        // 4. 复制选项内 HTML：live DOM 中动态创建的 answer-anchor 包含在 .qa-option 内
        liveQA.querySelectorAll('.qa-option[data-option]').forEach(function (liveOpt) {
          var optKey = liveOpt.getAttribute('data-option');
          var cloneOpt = cloneQA.querySelector('.qa-option[data-option="' + optKey + '"]');
          if (cloneOpt && liveOpt.innerHTML !== cloneOpt.innerHTML) {
            cloneOpt.innerHTML = liveOpt.innerHTML;
          }
        });
        // 5. 恢复答案配置到 clone：从 localStorage 读取答案属性覆盖到 clone
        var answerConfigKey = null;
        var utils = window._editorUtils;
        if (utils && typeof utils.storageKey === 'function') {
          var slide = liveSlide;
          var slideIdx = slide ? slide.getAttribute('data-slide') : '0';
          answerConfigKey = utils.storageKey('quiz-answer-config:' + slideIdx);
        }
        if (answerConfigKey) {
          try {
            var raw = window.localStorage.getItem(answerConfigKey);
            if (raw) {
              var config = JSON.parse(raw);
              if (config && Array.isArray(config.questions)) {
                var cloneQuestions = cloneQA.querySelectorAll('.qa-question');
                config.questions.forEach(function (qConfig, idx) {
                  var cloneQuestion = cloneQuestions[idx];
                  if (!cloneQuestion) return;
                  var type = cloneQuestion.getAttribute('data-type') || '';

                  // 选择题：恢复 data-correct
                  if ((type === 'single' || type === 'multi') && Array.isArray(qConfig.correct)) {
                    cloneQuestion.querySelectorAll('.qa-option').forEach(function (opt) {
                      var optId = opt.getAttribute('data-option');
                      if (optId && qConfig.correct.indexOf(optId) !== -1) {
                        opt.setAttribute('data-correct', 'true');
                      } else if (optId) {
                        opt.removeAttribute('data-correct');
                      }
                    });
                  }

                  // 连线题/填空：恢复 data-correct-answer 和 data-user-answer
                  if ((type === 'matching' || type === 'blank') && Array.isArray(qConfig.blanks)) {
                    qConfig.blanks.forEach(function (blank) {
                      if (blank.blankId) {
                        var cloneSlot = cloneQA.querySelector('.qa-passage .qa-blank-slot[data-blank-id="' + blank.blankId + '"]');
                        if (cloneSlot) {
                          if (blank.correctAnswer) cloneSlot.setAttribute('data-correct-answer', blank.correctAnswer);
                          if (blank.userAnswer) cloneSlot.setAttribute('data-user-answer', blank.userAnswer);
                        }
                      }
                    });
                  }
                });
              }
            }
          } catch (e) {}
        }
      });
    });
  };

})();
