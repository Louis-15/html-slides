/* ===========================================
   ANNOTATION-STORE.JS
   批注数据持久化 — JS 文件自动读写

  读取：file:// 下走脚本注入恢复，HTTP(S) 下走沙箱 iframe 加载同名 .annotations.js
   写入：File System Access API（首次需用户确认，之后自动）

   数据格式：
   - "{editId}": "innerHTML"         — 普通段落/气泡（有 data-edit-id 的元素）
   - "{linkId}-right": { qaIndex, option, innerHTML } — 右侧关联锚点
  - answerKeys[]                      — 题目正确答案配置（单选/多选/连线题）
   =========================================== */

(function () {
  'use strict';

  // === 内部状态 ===
  var _fileHandle = null;
  var _saveTimer = null;
  var _hasPendingSave = false;
  var _initData = null;
  var _permissionGranted = false;  // 真实权限状态追踪
  var _firstGestureAuthInstalled = false;
  var _firstGestureAuthAttempted = false;
  var _exitFlushHookInstalled = false;

  // === 文件名推导 ===

  /** 根据当前 HTML 文件名推导 JS 数据文件名 */
  function _getDataFilename() {
    var path = decodeURIComponent(location.pathname);
    var htmlName = path.substring(path.lastIndexOf('/') + 1);
    return htmlName.replace(/\.html?$/i, '') + '.annotations.js';
  }

  // === IndexedDB：持久化文件句柄 ===

  var DB_NAME = 'AnnotationFileHandles';
  var DB_VERSION = 1;
  var STORE_NAME = 'handles';

  function _openDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE_NAME); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function _getHandleKey() { return 'ann:' + location.pathname; }

  function _getStoredHandle() {
    return _openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readonly');
        var req = tx.objectStore(STORE_NAME).get(_getHandleKey());
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    }).catch(function () { return null; });
  }

  function _storeHandle(handle) {
    return _openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(handle, _getHandleKey());
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    }).catch(function () { });
  }

  // === 读取：本地 file:// 走可靠脚本注入，HTTP(S) 走沙箱 iframe ===

  function _loadDataFileViaScriptTag() {
    return new Promise(function (resolve) {
      window.__annotationData = undefined;
      var script = document.createElement('script');
      script.src = './' + _getDataFilename();
      script.onload = function () {
        script.remove();
        if (window.__annotationData) {
          resolve(window.__annotationData);
          window.__annotationData = undefined;
        } else {
          resolve(null);
        }
      };
      script.onerror = function () {
        script.remove();
        resolve(null);
      };
      document.head.appendChild(script);
    });
  }

  function _escapeHTML(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _loadDataFile() {
    if (location.protocol === 'file:') {
      // 本地独立课件以 file:// 打开时，Chrome 对 sandbox iframe 里的相对脚本加载并不稳定。
      // 这里回退到原先可靠的脚本注入方案，优先保证用户的本地批注能恢复出来。
      return _loadDataFileViaScriptTag();
    }

    return new Promise(function (resolve) {
      var token = 'ann-sandbox:' + Date.now() + ':' + Math.random().toString(36).slice(2);
      var iframe = document.createElement('iframe');
      var host = document.body || document.documentElement;
      var settled = false;
      var timeoutId = null;

      function cleanup(result) {
        if (settled) return;
        settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        window.removeEventListener('message', onMessage);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        resolve(result || null);
      }

      function onMessage(event) {
        var payload = event && event.data;
        if (!payload || payload.source !== 'AnnotationStoreSandbox' || payload.token !== token) return;
        cleanup(payload.payload || null);
      }

      window.addEventListener('message', onMessage);
      iframe.setAttribute('sandbox', 'allow-scripts');
      iframe.style.display = 'none';
      iframe.srcdoc =
        '<!DOCTYPE html><html><head><meta charset="utf-8"><base href="' + _escapeHTML(location.href) + '"></head><body><script>' +
        'window.__annotationData = null;' +
        'function notify(payload){ parent.postMessage({ source: "AnnotationStoreSandbox", token: ' + JSON.stringify(token) + ', payload: payload }, "*"); }' +
        'window.addEventListener("error", function(){ notify(null); });' +
        'var script = document.createElement("script");' +
        'script.src = ' + JSON.stringify('./' + _getDataFilename()) + ';' +
        'script.onload = function(){ notify(window.__annotationData || null); };' +
        'script.onerror = function(){ notify(null); };' +
        'document.head.appendChild(script);' +
        '<\/script></body></html>';

      host.appendChild(iframe);
      timeoutId = setTimeout(function () { cleanup(null); }, 3000);
    });
  }

  // === 写入：File System Access API ===

  function _tryRestoreHandle() {
    return _getStoredHandle().then(function (handle) {
      if (!handle) return false;
      return handle.queryPermission({ mode: 'readwrite' }).then(function (perm) {
        if (perm === 'granted') {
          _fileHandle = handle;
          _permissionGranted = true;
          return true;
        }
        _fileHandle = handle;
        _permissionGranted = false;
        // 首次用户手势上的授权尝试交由 quiz-annotation 运行时统一触发，避免重复弹窗。
        return 'needs-reauth';
      });
    }).catch(function () { return false; });
  }

  function _requestWritePermission() {
    if (!_fileHandle) return _pickNewFile();
    return _fileHandle.requestPermission({ mode: 'readwrite' }).then(function (perm) {
      if (perm === 'granted') return true;
      return _pickNewFile();
    }).catch(function () { return _pickNewFile(); });
  }

  function _ensureWriteAccess() {
    if (_fileHandle && _permissionGranted) return Promise.resolve(true);

    return _requestWritePermission().then(function (ok) {
      if (ok) {
        _permissionGranted = true;
        _updateStatus('ready');
        return true;
      }
      _updateStatus('needs-auth');
      return false;
    }).catch(function () {
      _updateStatus('error');
      return false;
    });
  }

  function _pickNewFile() {
    if (!window.showSaveFilePicker) {
      console.warn('[AnnotationStore] 浏览器不支持 File System Access API');
      return Promise.resolve(false);
    }
    return window.showSaveFilePicker({
      suggestedName: _getDataFilename(),
      types: [{
        description: '批注数据',
        accept: { 'application/javascript': ['.js'] }
      }]
    }).then(function (handle) {
      _fileHandle = handle;
      _permissionGranted = true;
      return _storeHandle(handle).then(function () { return true; });
    }).catch(function (e) {
      if (e.name !== 'AbortError') console.warn('[AnnotationStore] 选择文件失败:', e);
      return false;
    });
  }

  function _writeToFile(data) {
    if (!_fileHandle) return Promise.resolve(false);
    var jsContent = 'window.__annotationData = ' + JSON.stringify(data, null, 2) + ';\n';
    return _fileHandle.createWritable().then(function (writable) {
      return writable.write(jsContent).then(function () { return writable.close(); });
    }).then(function () {
      _updateStatus('saved');
      return true;
    }).catch(function (e) {
      console.warn('[AnnotationStore] 写入失败:', e);
      _updateStatus('error');
      return false;
    });
  }

  function _flushPendingSave() {
    if (!_hasPendingSave) return Promise.resolve(false);

    if (_saveTimer) {
      clearTimeout(_saveTimer);
      _saveTimer = null;
    }

    _hasPendingSave = false;
    var data = _collectData();

    if (_fileHandle && _permissionGranted) {
      return _writeToFile(data);
    }

    if (_fileHandle && !_permissionGranted) {
      return _fileHandle.requestPermission({ mode: 'readwrite' }).then(function (perm) {
        if (perm === 'granted') {
          _permissionGranted = true;
          _updateStatus('ready');
          return _writeToFile(data);
        }
        _updateStatus('needs-auth');
        return false;
      }).catch(function () {
        _updateStatus('needs-auth');
        return false;
      });
    }

    _updateStatus('needs-auth');
    return Promise.resolve(false);
  }

  // === 数据收集 ===

  function _stripTransientQuizState(html) {
    if (!html) return html;

    var needsQuizCleanup = html.indexOf('qa-blank-slot') !== -1;
    var needsFragmentCleanup = html.indexOf('data-fragment-step') !== -1 || html.indexOf('qa-fragment-visible') !== -1;
    if (!needsQuizCleanup && !needsFragmentCleanup) return html;

    var temp = document.createElement('div');
    temp.innerHTML = html;

    if (needsQuizCleanup) {
      temp.querySelectorAll('.qa-blank-slot[data-correct-answer]').forEach(function (slot) {
        slot.removeAttribute('data-user-answer');
        slot.classList.remove('filled', 'slot-answered', 'result-correct', 'result-incorrect', 'show-correct-answer');
        slot.querySelectorAll('.qa-result-mark, .qa-blank-correct').forEach(function (el) { el.remove(); });

        var answerSpan = slot.querySelector('.qa-blank-answer');
        if (answerSpan) {
          answerSpan.textContent = '';
          answerSpan.style.display = 'none';
        }

        var userSpan = slot.querySelector('.qa-blank-user');
        if (userSpan) {
          var sup = userSpan.querySelector('sup');
          userSpan.textContent = '';
          var valueSpan = document.createElement('span');
          valueSpan.className = 'qa-blank-value';
          userSpan.appendChild(valueSpan);
          if (sup) userSpan.appendChild(sup);
        }
      });
    }

    if (needsFragmentCleanup) {
      temp.querySelectorAll('[data-fragment-step]').forEach(function (fragment) {
        fragment.classList.remove('qa-fragment-visible');
        fragment.removeAttribute('data-fragment-manual-reveal');
      });
    }

    return temp.innerHTML;
  }

  function _collectOrdinaryFragmentElements(data) {
    document.querySelectorAll('.slide').forEach(function (slide) {
      if (!slide || slide.querySelector('.quiz-annotation')) return;

      var collectedOrdinaryRoots = Object.create(null);

      slide.querySelectorAll('[data-fragment-step="true"]').forEach(function (fragment) {
        var root = fragment.closest('[data-edit-id]');
        if (!root || !slide.contains(root) || root.closest('.quiz-annotation')) return;

        var editId = root.getAttribute('data-edit-id');
        if (!editId) return;
        if (collectedOrdinaryRoots[editId]) return;
        collectedOrdinaryRoots[editId] = true;

        /* 普通页面隐藏型标注沿用 AnnotationStore 的 elements[editId] = innerHTML 结构，
           这里保存的是“拥有 fragment 的最近 ordinary 根块”，而不是祖先根块或单独抽 fragment patch。
           这样可以和作者态、运行时都统一到同一个 owning root：嵌套 ordinary roots 时，fragment
           必须归属于最近的 data-edit-id 根块，才能避免 sidecar 粒度漂移到外层祖先，导致恢复结果
           与页面实际编辑 / 播放链路不一致。 */
        data.elements[editId] = _stripTransientQuizState(root.innerHTML);
      });
    });
  }

  function _collectData() {
    var data = {
      version: 1,
      timestamp: new Date().toISOString(),
      title: document.title || '',
      elements: {},
      answerKeys: [],
      deletedNotes: []
    };

    document.querySelectorAll('.quiz-annotation').forEach(function (qa, qaIndex) {
      // 先收集删除列表（仅用于清洗，不写入文件）
      var raw = qa.dataset.deletedNotes;
      if (raw) {
        try {
          JSON.parse(raw).forEach(function (id) {
            if (data.deletedNotes.indexOf(id) === -1) data.deletedNotes.push(id);
          });
        } catch (e) { }
      }

      // 左侧段落（含 text-anchor 锚点，有 data-edit-id）
      qa.querySelectorAll('.qa-passage [data-edit-id]').forEach(function (el) {
        data.elements[el.getAttribute('data-edit-id')] = _stripTransientQuizState(_cleanDeletedAnchors(el.innerHTML, data.deletedNotes));
      });

      // 答题面板中有 data-edit-id 的元素（AI 原生气泡等）
      qa.querySelectorAll('.qa-answer-panel [data-edit-id]').forEach(function (el) {
        data.elements[el.getAttribute('data-edit-id')] = _stripTransientQuizState(_cleanDeletedAnchors(el.innerHTML, data.deletedNotes));
      });

      // 批注气泡内容（只保存未删除的）
      qa.querySelectorAll('.qa-note-bubble .qa-note-content[data-edit-id]').forEach(function (el) {
        var bubble = el.closest('.qa-note-bubble');
        var linkId = bubble ? bubble.getAttribute('data-link') : null;
        if (linkId && data.deletedNotes.indexOf(linkId) !== -1) return;
        data.elements[el.getAttribute('data-edit-id')] = _stripTransientQuizState(el.innerHTML);
      });

      // 右侧关联：answer-anchor 在 .qa-option-text 中（没有 data-edit-id）
      // 格式: "{linkId}-right" → { qaIndex, option, innerHTML }
      qa.querySelectorAll('.answer-anchor[data-link-answer], .answer-anchor[data-link]').forEach(function (anchor) {
        var linkId = anchor.getAttribute('data-link-answer') || anchor.getAttribute('data-link');
        if (!linkId || data.deletedNotes.indexOf(linkId) !== -1) return;
        var option = anchor.closest('.qa-option');
        var optionText = anchor.closest('.qa-option-text');
        if (option && optionText) {
          data.elements[linkId + '-right'] = {
            qaIndex: qaIndex,
            option: option.getAttribute('data-option'),
            innerHTML: _stripTransientQuizState(optionText.innerHTML)
          };
        }
      });

      // 正确答案配置：选择题保存 data-correct，连线题保存每个空位的 data-correct-answer
      qa.querySelectorAll('.qa-question').forEach(function (question, questionIndex) {
        var questionType = question.getAttribute('data-type') || 'single';

        if (questionType === 'matching') {
          var blanks = [];
          qa.querySelectorAll('.qa-passage .qa-blank-slot[data-correct-answer]').forEach(function (slot) {
            blanks.push({
              blankId: slot.getAttribute('data-blank-id') || '',
              correctAnswer: slot.getAttribute('data-correct-answer') || ''
            });
          });

          if (blanks.length > 0) {
            data.answerKeys.push({
              qaIndex: qaIndex,
              questionIndex: questionIndex,
              type: questionType,
              blanks: blanks
            });
          }
          return;
        }

        var correctOptions = [];
        question.querySelectorAll('.qa-option[data-correct="true"]').forEach(function (option) {
          var optionId = option.getAttribute('data-option');
          if (optionId) correctOptions.push(optionId);
        });

        data.answerKeys.push({
          qaIndex: qaIndex,
          questionIndex: questionIndex,
          type: questionType,
          correctOptions: correctOptions
        });
      });
    });

    _collectOrdinaryFragmentElements(data);

     /* deletedNotes 不能在导出前清空。
       删除批注时，源码 HTML 里的 text-anchor / answer-anchor / qa-note-bubble 仍然存在；
       如果 sidecar 不把这份“墓碑列表”写回去，刷新后运行时就不知道哪些源码节点该继续 purge，
       结果就是当前会话里删掉的批注在重新加载后又从原始 HTML 里复活。 */

    return data;
  }

  /**
   * 从 HTML 字符串中清除已删除批注的锚点标记
   */
  function _cleanDeletedAnchors(html, deletedIds) {
    if (!deletedIds || deletedIds.length === 0) return html;
    var temp = document.createElement('div');
    temp.innerHTML = html;
    var changed = false;
    deletedIds.forEach(function (linkId) {
      // 清除 text-anchor
      temp.querySelectorAll('.text-anchor[data-link="' + linkId + '"]').forEach(function (anchor) {
        anchor.querySelectorAll('.note-badge').forEach(function (b) { b.remove(); });
        var parent = anchor.parentNode;
        while (anchor.firstChild) parent.insertBefore(anchor.firstChild, anchor);
        parent.removeChild(anchor);
        changed = true;
      });
      // 清除 answer-anchor
      temp.querySelectorAll('.answer-anchor[data-link-answer="' + linkId + '"], .answer-anchor[data-link="' + linkId + '"]').forEach(function (anchor) {
        anchor.querySelectorAll('.note-badge').forEach(function (b) { b.remove(); });
        var parent = anchor.parentNode;
        while (anchor.firstChild) parent.insertBefore(anchor.firstChild, anchor);
        parent.removeChild(anchor);
        changed = true;
      });
    });
    return changed ? temp.innerHTML : html;
  }

  // === 数据恢复 ===

  function _applyData(data) {
    if (!data) return;
    var qas = document.querySelectorAll('.quiz-annotation');
    var elements = data.elements || {};

    Object.keys(elements).forEach(function (key) {
      var val = elements[key];

      if (key.match(/-right$/) && val && typeof val === 'object' && val.innerHTML !== undefined) {
        // 右侧关联：通过 qaIndex + data-option 定位 .qa-option-text
        var qa = qas[val.qaIndex];
        if (!qa) return;
        var optionText = qa.querySelector('.qa-option[data-option="' + val.option + '"] .qa-option-text');
        if (optionText) optionText.innerHTML = val.innerHTML;
      } else if (typeof val === 'string') {
        // 普通 data-edit-id 元素
        var el = document.querySelector('[data-edit-id="' + key + '"]');
        if (el) el.innerHTML = val;
      }
    });

    if (Array.isArray(data.answerKeys)) {
      data.answerKeys.forEach(function (entry) {
        var qa = qas[entry.qaIndex];
        if (!qa) return;

        var questions = qa.querySelectorAll('.qa-question');
        var question = questions[entry.questionIndex];
        if (!question) return;

        if (entry.type === 'matching') {
          (entry.blanks || []).forEach(function (blank) {
            if (!blank || !blank.blankId) return;
            var slot = qa.querySelector('.qa-passage .qa-blank-slot[data-blank-id="' + blank.blankId + '"]');
            if (slot) {
              slot.setAttribute('data-correct-answer', blank.correctAnswer || '');
            }
          });
          return;
        }

        question.querySelectorAll('.qa-option').forEach(function (option) {
          option.removeAttribute('data-correct');
        });

        (entry.correctOptions || []).forEach(function (optionId) {
          var option = question.querySelector('.qa-option[data-option="' + optionId + '"]');
          if (option) option.setAttribute('data-correct', 'true');
        });
      });
    }

    if (data.deletedNotes && data.deletedNotes.length > 0) {
      var jsonStr = JSON.stringify(data.deletedNotes);
      qas.forEach(function (qa) {
        qa.dataset.deletedNotes = jsonStr;
      });
    }
  }

  // === 状态指示 ===

  function _updateStatus(status) {
    document.querySelectorAll('.annotation-store-status').forEach(function (el) {
      clearTimeout(el._t);
      switch (status) {
        case 'saved':
          el.textContent = '已保存';
          el.style.color = 'var(--accent-green, #3fb950)';
          el.style.display = 'inline-flex';
          el.style.opacity = '1';
          el._t = setTimeout(function () {
            el.textContent = '';
            el.style.display = 'none';
            el.style.opacity = '0';
          }, 1600);
          break;
        case 'error':
          el.textContent = '保存失败';
          el.style.color = 'var(--accent-red, #f85149)';
          el.style.display = 'inline-flex';
          el.style.opacity = '1';
          break;
        case 'ready':
          el.textContent = '';
          el.style.display = 'none';
          el.style.opacity = '0';
          break;
        case 'needs-auth':
          el.textContent = '📁 点击授权保存';
          el.style.color = 'var(--text-dim, #8b949e)';
          el.style.display = 'inline-flex';
          el.style.opacity = '1';
          break;
      }
    });
  }

  function _installFirstGestureAuth() {
    if (_firstGestureAuthInstalled || _firstGestureAuthAttempted) return;
    if (_fileHandle && _permissionGranted) return;

    _firstGestureAuthInstalled = true;

    function removeListeners() {
      if (!_firstGestureAuthInstalled) return;
      _firstGestureAuthInstalled = false;
      document.removeEventListener('click', handleFirstGesture, true);
      document.removeEventListener('keydown', handleFirstGesture, true);
    }

    function handleFirstGesture() {
      removeListeners();
      _firstGestureAuthAttempted = true;
      /* 本地课件的用户记忆是“打开后第一次真实操作时授权一次，后面自动保存”。
         这里恢复的是“先拿句柄和写权限”，而不是立刻整包写文件。
         这样既能保留原来的无感自动保存体验，也能避免在 DOM 仍处于恢复中的时刻
         把一个尚未完全回放的快照覆盖写回 sidecar。 */
      _ensureWriteAccess();
    }

    document.addEventListener('click', handleFirstGesture, true);
    document.addEventListener('keydown', handleFirstGesture, true);
  }

  function _installExitFlushHook() {
    if (_exitFlushHookInstalled) return;

    function registerHook() {
      if (_exitFlushHookInstalled) return true;
      if (!window.EditorHooks || typeof window.EditorHooks.register !== 'function') return false;

      _exitFlushHookInstalled = true;
      window.EditorHooks.register('onEditModeExit', function () {
        /* 富文本标注目前通过 300ms debounce 写 sidecar。
           如果用户刚改完就退出编辑模式并立刻刷新，定时器常常还没来得及落盘，
           第一次刷新就只能读到旧 sidecar，第二次才看见新内容。
           退出编辑模式是一个明确的“我要结束这轮编辑”的边界，这里直接冲刷待保存队列，
           让第一次刷新就能看到刚刚新增的标注。 */
        _flushPendingSave();
      });
      return true;
    }

    if (registerHook()) return;
    document.addEventListener('editor-utils-ready', function handleEditorUtilsReady() {
      if (registerHook()) {
        document.removeEventListener('editor-utils-ready', handleEditorUtilsReady);
      }
    });
  }

  // === 初始化 ===

  var _readyResolve;
  var _readyPromise = new Promise(function (resolve) { _readyResolve = resolve; });

  function _applyDataWhenStableIdsReady(data) {
    if (!data) return Promise.resolve();

    if (window._editorUtils && typeof window._editorUtils.ensureStableEditableIds === 'function') {
      window._editorUtils.ensureStableEditableIds();
      _applyData(data);
      return Promise.resolve();
    }

    return new Promise(function (resolve) {
      var settled = false;

      function finalizeApply() {
        if (settled) return;
        settled = true;
        document.removeEventListener('editor-utils-ready', finalizeApply);
        document.removeEventListener('DOMContentLoaded', finalizeApply);
        window.removeEventListener('load', finalizeApply);
        if (window._editorUtils && typeof window._editorUtils.ensureStableEditableIds === 'function') {
          window._editorUtils.ensureStableEditableIds();
        }
        _applyData(data);
        resolve();
      }

      // annotation-store 在 mixed / quiz deck 中通常先于 editor-utils 加载。
      // 这里不能因为 helper 当下还没注册就直接放弃普通元素恢复，而是要等到 editor-utils
      // 广播“已就绪”或页面完成后再做一次稳定 id 准备，然后才回放通用 data-edit-id 数据。
      document.addEventListener('editor-utils-ready', finalizeApply, { once: true });
      document.addEventListener('DOMContentLoaded', finalizeApply, { once: true });
      window.addEventListener('load', finalizeApply, { once: true });
    });
  }

  function _init() {
    _installExitFlushHook();
    _loadDataFile().then(function (data) {
      if (data) {
        _initData = data;
        return _applyDataWhenStableIdsReady(data);
      }
      return null;
    }).then(function () {
      return _tryRestoreHandle();
    }).then(function (handleStatus) {
      if (handleStatus === true) {
        _updateStatus('ready');
      } else if (handleStatus === 'needs-reauth') {
        _updateStatus('needs-auth');
      }
      if (!_permissionGranted) {
        _installFirstGestureAuth();
      }
      _readyResolve(!!_initData);
    }).catch(function () {
      _readyResolve(false);
    });
  }

  // === 公开 API ===

  window.AnnotationStore = {
    whenReady: function () { return _readyPromise; },
    getInitData: function () { return _initData; },

    scheduleSave: function () {
      _hasPendingSave = true;
      if (_saveTimer) clearTimeout(_saveTimer);
      _saveTimer = setTimeout(function () {
        _saveTimer = null;
        _flushPendingSave();
      }, 300);
    },

    saveNow: function () {
      var data = _collectData();
      if (!_fileHandle) return Promise.resolve(false);
      return _writeToFile(data);
    },

    authorizeAndSave: function () {
      return _ensureWriteAccess().then(function (ok) {
        if (ok) {
          var data = _collectData();
          return _writeToFile(data);
        }
        return false;
      });
    },

    ensureWriteAccess: function () {
      return _ensureWriteAccess();
    },

    flushPendingSave: function () {
      return _flushPendingSave();
    },

    hasWriteAccess: function () {
      return !!_fileHandle && _permissionGranted;
    }
  };

  _init();

})();
