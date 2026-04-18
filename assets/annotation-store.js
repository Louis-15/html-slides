/* ===========================================
   ANNOTATION-STORE.JS
   批注数据持久化 — JS 文件自动读写

   读取：动态 <script> 标签加载同名 .annotations.js（file:// 下可靠工作）
   写入：File System Access API（首次需用户确认，之后自动）

   数据格式：
   - "{editId}": "innerHTML"         — 普通段落/气泡（有 data-edit-id 的元素）
   - "{linkId}-right": { qaIndex, option, innerHTML } — 右侧关联锚点
   =========================================== */

(function () {
  'use strict';

  // === 内部状态 ===
  var _fileHandle = null;
  var _saveTimer = null;
  var _initData = null;
  var _permissionGranted = false;  // 真实权限状态追踪

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

  // === 读取：动态 <script> 标签（file:// 下可靠） ===

  function _loadDataFile() {
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
        // 注册一次性用户手势监听器，在第一次交互时自动重新获取权限
        _installAutoReauth();
        return 'needs-reauth';
      });
    }).catch(function () { return false; });
  }

  /**
   * 安装一次性自动重授权监听器
   * File System Access API 的 requestPermission 需要用户手势上下文，
   * 所以我们在全局 click/keydown 中透明地完成重授权
   */
  var _autoReauthInstalled = false;
  function _installAutoReauth() {
    if (_autoReauthInstalled) return;
    _autoReauthInstalled = true;

    function doReauth() {
      if (!_fileHandle || _permissionGranted) {
        _removeListeners();
        return;
      }
      _fileHandle.requestPermission({ mode: 'readwrite' }).then(function (perm) {
        if (perm === 'granted') {
          _permissionGranted = true;
          _updateStatus('ready');
          // 如果有挂起的保存需求，立即执行
          var data = _collectData();
          _writeToFile(data);
        }
      }).catch(function () { /* 用户拒绝或浏览器不支持，静默忽略 */ });
      _removeListeners();
    }

    function _removeListeners() {
      _autoReauthInstalled = false;
      document.removeEventListener('click', doReauth, { capture: true });
      document.removeEventListener('keydown', doReauth, { capture: true });
    }

    // capture: true 确保在任何 stopPropagation 之前触发
    document.addEventListener('click', doReauth, { capture: true, once: true });
    document.addEventListener('keydown', doReauth, { capture: true, once: true });
  }

  function _requestWritePermission() {
    if (!_fileHandle) return _pickNewFile();
    return _fileHandle.requestPermission({ mode: 'readwrite' }).then(function (perm) {
      if (perm === 'granted') return true;
      return _pickNewFile();
    }).catch(function () { return _pickNewFile(); });
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

  // === 数据收集 ===

  function _stripTransientQuizState(html) {
    if (!html || html.indexOf('qa-blank-slot') === -1) return html;

    var temp = document.createElement('div');
    temp.innerHTML = html;

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

    return temp.innerHTML;
  }

  function _collectData() {
    var data = {
      version: 1,
      timestamp: new Date().toISOString(),
      title: document.title || '',
      elements: {},
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
        data.elements[el.getAttribute('data-edit-id')] = _cleanDeletedAnchors(el.innerHTML, data.deletedNotes);
      });

      // 批注气泡内容（只保存未删除的）
      qa.querySelectorAll('.qa-note-bubble .qa-note-content[data-edit-id]').forEach(function (el) {
        var bubble = el.closest('.qa-note-bubble');
        var linkId = bubble ? bubble.getAttribute('data-link') : null;
        if (linkId && data.deletedNotes.indexOf(linkId) !== -1) return;
        data.elements[el.getAttribute('data-edit-id')] = el.innerHTML;
      });

      // 右侧关联：answer-anchor 在 .qa-option-text 中（没有 data-edit-id）
      // 格式: "{linkId}-right" → { qaIndex, option, innerHTML }
      qa.querySelectorAll('.answer-anchor[data-link-answer]').forEach(function (anchor) {
        var linkId = anchor.getAttribute('data-link-answer');
        if (!linkId || data.deletedNotes.indexOf(linkId) !== -1) return;
        var option = anchor.closest('.qa-option');
        var optionText = anchor.closest('.qa-option-text');
        if (option && optionText) {
          data.elements[linkId + '-right'] = {
            qaIndex: qaIndex,
            option: option.getAttribute('data-option'),
            innerHTML: optionText.innerHTML
          };
        }
      });
    });

    // deletedNotes 仅用于清洗 HTML，清洗完毕后置空（不写入文件）
    data.deletedNotes = [];

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
      temp.querySelectorAll('.answer-anchor[data-link-answer="' + linkId + '"]').forEach(function (anchor) {
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
    if (!data || !data.elements) return;
    var qas = document.querySelectorAll('.quiz-annotation');

    Object.keys(data.elements).forEach(function (key) {
      var val = data.elements[key];

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
      switch (status) {
        case 'saved':
          el.textContent = '✅ 已保存';
          el.style.color = 'var(--accent-green, #3fb950)';
          el.style.opacity = '1';
          clearTimeout(el._t);
          el._t = setTimeout(function () { el.style.opacity = '0.3'; }, 2000);
          break;
        case 'error':
          el.textContent = '⚠️ 保存失败';
          el.style.color = 'var(--accent-red, #f85149)';
          el.style.opacity = '1';
          break;
        case 'ready':
          el.textContent = '📁 自动保存';
          el.style.color = 'var(--accent-blue, #58a6ff)';
          el.style.opacity = '0.5';
          break;
        case 'needs-auth':
          el.textContent = '📁 点击授权保存';
          el.style.color = 'var(--text-dim, #8b949e)';
          el.style.opacity = '1';
          break;
      }
    });
  }

  // === 初始化 ===

  var _readyResolve;
  var _readyPromise = new Promise(function (resolve) { _readyResolve = resolve; });

  function _init() {
    _loadDataFile().then(function (data) {
      if (data) {
        _initData = data;
        _applyData(data);
      }
      return _tryRestoreHandle();
    }).then(function (handleStatus) {
      if (handleStatus === true) {
        _updateStatus('ready');
      } else if (handleStatus === 'needs-reauth') {
        _updateStatus('needs-auth');
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
      if (_saveTimer) clearTimeout(_saveTimer);
      _saveTimer = setTimeout(function () {
        var data = _collectData();
        if (_fileHandle && _permissionGranted) {
          // 权限已确认，直接写入
          _writeToFile(data);
        } else if (_fileHandle && !_permissionGranted) {
          // 句柄存在但权限未授予，尝试 requestPermission（需要用户手势上下文）
          _fileHandle.requestPermission({ mode: 'readwrite' }).then(function (perm) {
            if (perm === 'granted') {
              _permissionGranted = true;
              _updateStatus('ready');
              _writeToFile(data);
            } else {
              _updateStatus('needs-auth');
            }
          }).catch(function () {
            _updateStatus('needs-auth');
          });
        } else {
          _updateStatus('needs-auth');
        }
      }, 300);
    },

    saveNow: function () {
      var data = _collectData();
      if (!_fileHandle) return Promise.resolve(false);
      return _writeToFile(data);
    },

    authorizeAndSave: function () {
      return _requestWritePermission().then(function (ok) {
        if (ok) {
          _permissionGranted = true;
          _updateStatus('ready');
          var data = _collectData();
          return _writeToFile(data);
        }
        return false;
      });
    },

    hasWriteAccess: function () {
      return !!_fileHandle && _permissionGranted;
    }
  };

  _init();

})();
