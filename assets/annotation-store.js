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
  var _initData = null;

  // === 文件名推导 ===

  /** 根据当前 HTML 文件名推导 JS 数据文件名 */
  function _getDataFilename() {
    var path = decodeURIComponent(location.pathname);
    var htmlName = path.substring(path.lastIndexOf('/') + 1);
    return htmlName.replace(/\.html?$/i, '') + '.annotations.js';
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

  function _loadDataFile() {
    // 统一使用脚本标签注入加载侧挂数据，兼容 file:// 和 HTTP(S) 两种协议
    return _loadDataFileViaScriptTag();
  }

  function _readStoredEditableHTML(editId) {
    var utils = window._editorUtils;

    if (!editId || !utils || typeof utils.storageKey !== 'function') {
      return null;
    }

    try {
      var primaryKey = utils.storageKey('e:' + editId);
      var primaryValue = window.localStorage.getItem(primaryKey);
      if (primaryValue !== null) {
        return primaryValue;
      }

      if (typeof utils.legacyStorageKey !== 'function') {
        return null;
      }

      var legacyKey = utils.legacyStorageKey('e:' + editId);
      if (!legacyKey || legacyKey === primaryKey) {
        return null;
      }

      return window.localStorage.getItem(legacyKey);
    } catch (e) {
      return null;
    }
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
        if (!el) return;

        /* localStorage 是当前设备上的最新编辑态快照，sidecar 是跨刷新/跨会话的文件快照。
           当两者同时存在且版本不一致时，如果这里仍无条件套用 sidecar，
           就会把"刚写进 localStorage 的新富文本标注"重新覆盖成旧文件内容，
           用户看到的表现就是第一次刷新回到旧版本、第二次刷新才恢复。
           因此这里必须对齐普通页面的恢复语义：优先采用 localStorage，sidecar 只做兜底。 */
        var storedHTML = _readStoredEditableHTML(key);
        if (storedHTML !== null) {
          el.innerHTML = storedHTML;
          elements[key] = storedHTML;
        } else {
          el.innerHTML = val;
        }
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
      // 广播"已就绪"或页面完成后再做一次稳定 id 准备，然后才回放通用 data-edit-id 数据。
      document.addEventListener('editor-utils-ready', finalizeApply, { once: true });
      document.addEventListener('DOMContentLoaded', finalizeApply, { once: true });
      window.addEventListener('load', finalizeApply, { once: true });
    });
  }

  function _init() {
    // 如果已保存过（标注数据已内联到 HTML），跳过侧挂加载
    try {
      var markerKey = 'hslides-ann-inline:' + decodeURIComponent(location.pathname);
      if (localStorage.getItem(markerKey) === '1') {
        _readyResolve(false);
        return;
      }
    } catch (e) { }

    _loadDataFile().then(function (data) {
      if (data) {
        _initData = data;
        return _applyDataWhenStableIdsReady(data);
      }
      return null;
    }).then(function () {
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
      // 标注内容已通过 editor-persistence 的 input 监听器自动存入 localStorage。
      // 最终保存由 editor-persistence.saveToHTMLFile() 统一完成。
    },
    saveNow: function () { return Promise.resolve(false); },
    authorizeAndSave: function () { return Promise.resolve(false); },
    ensureWriteAccess: function () { return Promise.resolve(false); },
    flushPendingSave: function () { return Promise.resolve(false); },
    hasWriteAccess: function () { return false; }
  };

  _init();

})();
