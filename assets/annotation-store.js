/* ===========================================
   ANNOTATION-STORE.JS
   批注数据持久化 — 兼容存根

   标注数据已内联到 HTML 文件 + localStorage，
   不再使用 .annotations.js 侧挂文件。
   保留公开 API 供其他模块兼容调用。
   =========================================== */

(function () {
  'use strict';

  var _readyResolve;
  var _readyPromise = new Promise(function (resolve) { _readyResolve = resolve; });

  // 直接就绪，不再加载侧挂文件
  _readyResolve(false);

  window.AnnotationStore = {
    whenReady: function () { return _readyPromise; },
    scheduleSave: function () {},
    saveNow: function () { return Promise.resolve(false); },
    authorizeAndSave: function () { return Promise.resolve(false); },
    ensureWriteAccess: function () { return Promise.resolve(false); },
    flushPendingSave: function () { return Promise.resolve(false); },
    hasWriteAccess: function () { return false; }
  };

})();
