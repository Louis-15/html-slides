/* ===========================================
   EDITOR-CORE.JS
   HTML-Slides 编辑器 — 编辑模式总控 + 初始化引导 + 工具栏HTML注入
   依赖：editor-utils.js, editor-persistence.js, editor-history.js,
         editor-box-manager.js, editor-rich-text.js
   暴露：window.editorCore, window.historyMgr, window.richToolbar, window.boxManager
   =========================================== */

(function () {
  "use strict";

  var utils = window._editorUtils;
  var getCurrentSlideIndex = utils.getCurrentSlideIndex;
  var getAllSlides = utils.getAllSlides;
  var getEditableCandidates = utils.getEditableCandidates;
  var ensureStableEditableIds = utils.ensureStableEditableIds;
  var EditorHooks = window.EditorHooks;
  var PersistenceLayer = window.PersistenceLayer;
  var HistoryManager = window.HistoryManager;
  var BoxManager = window.BoxManager;
  var RichTextToolbar = window.RichTextToolbar;

  // ========================================
  // 工具栏 HTML 动态注入
  // ========================================
  function _injectEditorUI() {
    // 编辑热区（加宽，覆盖三个按钮：编辑20px + 保存75px + 读取130px，每个45px宽）
    var hotzone = document.createElement("div");
    hotzone.className = "edit-hotzone";
    hotzone.style.width = "190px";
    hotzone.style.height = "52px";
    document.body.insertBefore(hotzone, document.body.firstChild);

    // 编辑切换按钮
    var editToggle = document.createElement("button");
    editToggle.className = "edit-toggle";
    editToggle.id = "editToggle";
    editToggle.title = "编辑模式 (按E键)";
    editToggle.style.top = "6px";
    editToggle.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>';
    document.body.insertBefore(editToggle, hotzone.nextSibling);

    // 保存按钮
    var saveToggle = document.createElement("button");
    saveToggle.className = "edit-toggle save-toggle";
    saveToggle.id = "saveToggle";
    saveToggle.title = "保存到 HTML 文件 (Ctrl+S)";
    saveToggle.style.top = "6px";
    saveToggle.style.left = "75px";
    saveToggle.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg>';
    document.body.insertBefore(saveToggle, editToggle.nextSibling);

    // 读取按钮
    var loadToggle = document.createElement("button");
    loadToggle.className = "edit-toggle load-toggle";
    loadToggle.id = "loadToggle";
    loadToggle.title = "从 HTML 文件读取存档";
    loadToggle.style.top = "6px";
    loadToggle.style.left = "130px";
    loadToggle.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>';
    document.body.insertBefore(loadToggle, saveToggle.nextSibling);

    // 富文本工具栏
    var toolbar = document.createElement("div");
    toolbar.className = "rich-toolbar";
    toolbar.id = "richToolbar";
    toolbar.innerHTML =
      '<button class="rt-btn wide" id="undobtn" title="撤销" style="opacity:0.4;"><svg viewBox="0 0 24 24"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg></button>' +
      '<button class="rt-btn wide" id="redobtn" title="重做" style="opacity:0.4;"><svg viewBox="0 0 24 24"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/></svg></button>' +
      '<div class="rt-divider"></div>' +
      '<button class="rt-btn" data-cmd="bold" title="加粗"><b>B</b></button>' +
      '<button class="rt-btn" data-cmd="italic" title="斜体"><i>I</i></button>' +
      '<div class="rt-dropdown" title="下划线（可选颜色）">' +
      '<button class="rt-btn" id="ulColorToggle"><span style="text-decoration:underline;text-decoration-color:#3498db;font-weight:bold;">U</span></button>' +
      '<div class="rt-dropdown-menu" id="ulColorDropdown"><div class="palette-grid ul-colors"></div></div>' +
      "</div>" +
      '<button class="rt-btn" data-cmd="strikethrough" title="删除线"><s style="text-decoration-color:rgba(186, 26, 26, 0.4);text-decoration-thickness:0.12em;">S</s></button>' +
      '<div class="rt-divider"></div>' +
      '<div class="rt-dropdown" title="英文字体（受影响：字母/数字）"><button class="rt-btn wide" id="engFontToggle" style="padding:4px 8px;">\ud83c\uddec\ud83c\udde7 英文字体</button><div class="rt-dropdown-menu font-menu" id="engFontDropdown"></div></div>' +
      '<div class="rt-dropdown" title="中文字体（受影响：汉字）"><button class="rt-btn wide" id="zhFontToggle" style="padding:4px 8px;">\ud83c\udde8\ud83c\uddf3 中文字体</button><div class="rt-dropdown-menu font-menu" id="zhFontDropdown"></div></div>' +
      '<button class="rt-btn wide" id="fontSizeUp" title="增大字号">A+</button>' +
      '<button class="rt-btn wide" id="fontSizeDown" title="缩小字号">A-</button>' +
      '<div class="rt-divider"></div>' +
      '<div class="rt-dropdown" title="文字颜色"><button class="rt-btn" id="colorToggle"><span style="font-weight:bold;color:#e74c3c;font-size:1.1em;">A</span></button><div class="rt-dropdown-menu" id="colorDropdown"><div class="palette-grid text-colors"></div></div></div>' +
      '<div class="rt-dropdown" title="背景高亮"><button class="rt-btn" id="bgToggle"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--editor-primary)"><path d="M4 20h16" stroke="#f1c40f" stroke-width="6" opacity="0.5"/><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg></button><div class="rt-dropdown-menu" id="bgDropdown"><div class="palette-grid bg-colors"></div></div></div>' +
      '<div class="rt-divider"></div>' +
      '<button class="rt-btn" data-cmd="removeFormat" title="清除格式"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#7F8C8D;"><path d="m16 22-1-4"/><path d="M19 14a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2h-3a1 1 0 0 1-1-1V4a2 2 0 0 0-4 0v5a1 1 0 0 1-1 1H6a2 2 0 0 0-2 2v1a1 1 0 0 0 1 1"/><path d="M19 14H5l-1.973 6.767A1 1 0 0 0 4 22h16a1 1 0 0 0 .973-1.233z"/><path d="m8 22 1-4"/></svg></button>' +
      '<div class="rt-divider"></div>' +
      '<button class="rt-btn" id="rubyBtn" title="顶标批注"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19h16"/><path d="m12 15 4-8 4 8"/><path d="M14 11h4"/><path d="M4 9h5"/><path d="M6 5h1"/></svg></button>' +
      '<div class="rt-dropdown" title="插入超链接">' +
      '<button class="rt-btn" id="linkToggle"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></button>' +
      '<div class="rt-dropdown-menu" id="linkDropdown" style="width: 260px;">' +
      '<div class="rt-input-group">' +
      '<input type="url" id="linkUrlInput" placeholder="输入链接 (https://...)">' +
      '<div class="btn-row">' +
      '<button class="rt-input-btn" id="applyLinkBtn">确定</button>' +
      '<button class="rt-input-btn danger" id="removeLinkBtn">\u2715 清除</button>' +
      "</div>" +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div class="rt-dropdown" title="插入图片">' +
      '<button class="rt-btn" id="imageToggle"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg></button>' +
      '<div class="rt-dropdown-menu" id="imageDropdown" style="width: 260px;">' +
      '<div class="rt-input-group">' +
      '<input type="url" id="imageUrlInput" placeholder="输入图片 URL">' +
      '<button class="rt-input-btn" id="applyImageBtn">插入网络图片</button>' +
      '<div style="text-align:center;font-size:12px;color:var(--editor-text-muted);margin:4px 0;">或</div>' +
      '<input type="file" id="imageFileInput" accept="image/*" style="display:none;">' +
      '<button class="rt-input-btn secondary" id="triggerImageFileBtn">\ud83d\udcc2 浏览本地图片...</button>' +
      "</div>" +
      "</div>" +
      "</div>" +
      '<button class="rt-btn" id="addTextBoxBtn" title="添加文本框"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><path d="M8 8h8"/><path d="M12 8v8"/><path d="M10 16h4"/></svg></button>' +
      '<div class="rt-divider"></div>' +
      '<button class="rt-btn" id="hideToolbarBtn" title="收起工具条"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-panel-top-close-icon lucide-panel-top-close"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="m9 16 3-3 3 3"/></svg></button>';

    document.body.insertBefore(toolbar, editToggle.nextSibling);
  }

  // ========================================
  // EditorCore（编辑模式总控）
  // ========================================
  function EditorCore() {
    this.isActive = false;
    this.editableSet = new Set();
    this._navLocked = false;

    // 在恢复 localStorage / side车数据前，先为普通正文根块补稳定 data-edit-id。
    // 否则像 header-title 这类源码里没有显式 id 的元素，会在 restore 阶段彻底命不中，
    // 导致普通富文本和后续全局隐藏标注都无法可靠回放。
    ensureStableEditableIds();

    // 恢复持久化内容
    PersistenceLayer.restoreAllElements();
    PersistenceLayer.restoreNativeMods();
    this.refreshEditables();
    this._bindInputListener();
  }

  EditorCore.prototype = {
    refreshEditables: function () {
      this.editableSet = new Set(getEditableCandidates());
      if (this.isActive) {
        this.editableSet.forEach(function (el) {
          el.setAttribute("contenteditable", "true");
        });
      }
      if (RichTextToolbar && RichTextToolbar.syncFontIndicators) {
        RichTextToolbar.syncFontIndicators();
      }
    },

    toggleEditMode: function () {
      this.isActive = !this.isActive;
      var toggle = document.getElementById("editToggle");
      var toolbar = document.getElementById("richToolbar");

      if (this.isActive) {
        // 编辑模式下隐藏保存/读取按钮
        var saveToggle = document.getElementById("saveToggle");
        var loadToggle = document.getElementById("loadToggle");
        if (saveToggle) { saveToggle.classList.remove("show"); saveToggle.style.display = "none"; }
        if (loadToggle) { loadToggle.classList.remove("show"); loadToggle.style.display = "none"; }

        // 如果涂鸦模式处于开启状态，强制其退出（完全互斥）
        if (window.DoodleManager && window.DoodleManager.isActive) {
          window.DoodleManager.toggleDoodleMode();
        }

        var targetIndex = getCurrentSlideIndex();
        var slides = getAllSlides();
        if (slides[targetIndex]) {
          slides[targetIndex].scrollIntoView({
            behavior: "instant",
            block: "center",
          });
        }

        document.documentElement.classList.add("editor-mode");
        document.body.classList.add("editor-mode");
        document.execCommand("styleWithCSS", false, true);
        if (toggle) toggle.classList.add("active");
        if (toolbar) toolbar.classList.add("visible");
        this.refreshEditables();
        this.editableSet.forEach(function (el) {
          el.setAttribute("contenteditable", "true");
        });

        // 首次进入编辑模式时，一次性为所有可编辑元素注入 wrapper 和控件
        // 后续再次进入时跳过（wrapper 永久存在，不再移除）
        this._ensureWrappersReady();

        // 首次注入 wrapper 可能导致浏览器重新触发入场动画，
        // 用 Web Animations API 瞬间完成它们，消除视觉闪烁
        var currentSlideEl = slides[targetIndex];
        if (currentSlideEl && currentSlideEl.getAnimations) {
          try {
            currentSlideEl
              .getAnimations({ subtree: true })
              .forEach(function (a) {
                a.finish();
              });
          } catch (e) {
            /* 忽略不支持 subtree 的旧浏览器 */
          }
        }

        window.historyMgr.captureBaseline();
        this._navLocked = true;
        EditorHooks.fire("onEditModeEnter");
      } else {
        // ★ 零 DOM 变化退出：只做 class/attribute 切换，不剥离任何 wrapper
        document.documentElement.classList.remove("editor-mode");
        document.body.classList.remove("editor-mode");
        if (toggle) toggle.classList.remove("active");
        if (toolbar) toolbar.classList.remove("visible");
        this.editableSet.forEach(function (el) {
          el.removeAttribute("contenteditable");
        });
        this._navLocked = false;
        // 退出编辑模式，恢复保存/读取按钮
        var saveToggleOut = document.getElementById("saveToggle");
        var loadToggleOut = document.getElementById("loadToggle");
        if (saveToggleOut) saveToggleOut.style.display = "";
        if (loadToggleOut) loadToggleOut.style.display = "";
        EditorHooks.fire("onEditModeExit");
      }
    },

    /**
     * 一次性初始化所有编辑 wrapper（幂等操作）
     * 只在首次进入编辑模式时执行，后续调用自动跳过
     * wrapper 一旦注入就永久存在，避免 DOM 变动触发入场动画重播
     */
    _ensureWrappersReady: function () {
      if (this._wrappersReady) return;
      this._wrappersReady = true;

      ensureStableEditableIds();
      this.editableSet.forEach(function (el) {
        if (el.tagName === "TD" || el.tagName === "TH" || el.tagName === "IMG")
          return;
        if (el.closest(".editable-wrap")) return;
        BoxManager._injectControls(el);
      });
    },

    _bindInputListener: function () {
      document.body.addEventListener("input", function (e) {
        if (window.historyMgr.isRestoring) return;
        if (e.target.isContentEditable) {
          /* 优先查找带有 data-edit-id 的祖先进行精准持久化 */
          var editEl = e.target.closest
            ? e.target.closest("[data-edit-id]")
            : null;
          if (editEl) PersistenceLayer.saveElement(editEl);
          window.historyMgr.recordState(false);
        }
      });
    },
  };

  // ========================================
  // 初始化引导
  // ========================================

  // 1. 注入工具栏 HTML
  _injectEditorUI();

  // 2. 创建模块实例
  var historyMgr = new HistoryManager();
  window.historyMgr = historyMgr;

  var editorCore = new EditorCore();
  window.editorCore = editorCore;

  RichTextToolbar.init();
  window.richToolbar = RichTextToolbar;

  BoxManager.init();
  window.boxManager = BoxManager;

  PersistenceLayer.loadCustomBoxes();

  // 3. 编辑热区交互
  var hotzone = document.querySelector(".edit-hotzone");
  var editToggle = document.getElementById("editToggle");
  var editHideTimer = null;
  var saveHideTimer = null;
  var loadHideTimer = null;

  function clearAllTimers() {
    clearTimeout(editHideTimer); editHideTimer = null;
    clearTimeout(saveHideTimer); saveHideTimer = null;
    clearTimeout(loadHideTimer); loadHideTimer = null;
  }

  function showAll() {
    clearAllTimers();
    editToggle.classList.add("show");
    if (saveToggle) saveToggle.classList.add("show");
    if (loadToggle) loadToggle.classList.add("show");
  }

  function hideEdit() { editHideTimer = setTimeout(function () { if (!editorCore.isActive) editToggle.classList.remove("show"); }, 300); }
  function hideSave() { saveHideTimer = setTimeout(function () { if (saveToggle) saveToggle.classList.remove("show"); }, 300); }
  function hideLoad() { loadHideTimer = setTimeout(function () { if (loadToggle) loadToggle.classList.remove("show"); }, 300); }

  if (hotzone && editToggle) {
    // 热区悬浮：三个按钮全部亮起
    hotzone.addEventListener("mouseenter", showAll);
    hotzone.addEventListener("mouseleave", function () {
      hideEdit(); hideSave(); hideLoad();
    });
    hotzone.addEventListener("click", function () {
      editorCore.toggleEditMode();
    });

    // 编辑按钮：自己的悬浮和离开
    editToggle.addEventListener("mouseenter", function () {
      clearTimeout(editHideTimer);
    });
    editToggle.addEventListener("mouseleave", hideEdit);
    editToggle.addEventListener("click", function (e) {
      e.stopPropagation();
      editorCore.toggleEditMode();
    });

    // 保存按钮：独立的显隐定时器
    if (saveToggle) {
      saveToggle.addEventListener("mouseenter", function () {
        clearTimeout(saveHideTimer);
      });
      saveToggle.addEventListener("mouseleave", hideSave);
    }

    // 读取按钮：独立的显隐定时器
    if (loadToggle) {
      loadToggle.addEventListener("mouseenter", function () {
        clearTimeout(loadHideTimer);
      });
      loadToggle.addEventListener("mouseleave", hideLoad);
    }
  }

  // 4. 添加文本框按钮
  var addBoxBtn = document.getElementById("addTextBoxBtn");
  if (addBoxBtn) {
    addBoxBtn.addEventListener("click", function () {
      var slides = getAllSlides();
      var cs = slides[getCurrentSlideIndex()];
      if (!cs) return;
      BoxManager.createTextBox("custom-" + Date.now(), "10%", "10%", null, cs);
      PersistenceLayer.saveCustomBoxes();
      historyMgr.recordState(true);
    });
  }

  // 5. 隐藏工具条按钮
  var hideToolbarBtn = document.getElementById("hideToolbarBtn");
  if (hideToolbarBtn) {
    hideToolbarBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var tbar = document.getElementById("richToolbar");
      if (tbar) tbar.classList.remove("visible");
    });
  }

  // 6. 保存按钮事件
  if (saveToggle) {
    saveToggle.addEventListener("click", function (e) {
      e.stopPropagation();
      if (window.PersistenceLayer && typeof window.PersistenceLayer.saveToHTMLFile === "function") {
        window.PersistenceLayer.saveToHTMLFile().then(function (ok) {
          if (ok) {
            saveToggle.style.background = "var(--accent-green, #3fb950)";
            saveToggle.style.borderColor = "var(--accent-green, #3fb950)";
            saveToggle.style.color = "#fff";
            setTimeout(function () {
              saveToggle.style.background = "";
              saveToggle.style.borderColor = "";
              saveToggle.style.color = "";
            }, 1500);
          }
        });
      }
    });
  }

  // 7. 读取按钮事件
  if (loadToggle) {
    loadToggle.addEventListener("click", function (e) {
      e.stopPropagation();
      if (confirm("读取存档将放弃当前未保存的修改，并刷新页面。确定继续？")) {
        if (window.PersistenceLayer && typeof window.PersistenceLayer.loadFromHTMLFile === "function") {
          window.PersistenceLayer.loadFromHTMLFile();
        }
      }
    });
  }

  // ========================================
  // 全局快捷键（捕获阶段，优先于导航脚本）
  // ========================================
  document.addEventListener(
    "keydown",
    function (e) {
      if (
        (e.key === "e" || e.key === "E") &&
        !e.target.getAttribute("contenteditable")
      ) {
        editorCore.toggleEditMode();
      }
      if (
        editorCore.isActive &&
        e.ctrlKey &&
        !e.shiftKey &&
        (e.key === "z" || e.key === "Z")
      ) {
        e.preventDefault();
        historyMgr.undo();
      }
      if (
        editorCore.isActive &&
        ((e.ctrlKey && (e.key === "y" || e.key === "Y")) ||
          (e.ctrlKey && e.shiftKey && (e.key === "z" || e.key === "Z")))
      ) {
        e.preventDefault();
        historyMgr.redo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        if (window.PersistenceLayer && typeof window.PersistenceLayer.saveToHTMLFile === "function") {
          window.PersistenceLayer.saveToHTMLFile();
        } else {
          PersistenceLayer.exportCleanHTML();
        }
      }
      if (editorCore._navLocked) {
        var navKeys = [
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          " ",
          "PageDown",
          "PageUp",
          "Home",
          "End",
        ];
        if (navKeys.indexOf(e.key) !== -1) {
          e.stopPropagation();
          if (!e.target.isContentEditable) {
            e.preventDefault();
          }
        }
      }
    },
    true,
  );

  document.addEventListener(
    "wheel",
    function (e) {
      if (editorCore._navLocked) {
        // 放行富文本工具条内部（例如字体下拉列表的滚动）
        if (e.target.closest && e.target.closest(".rich-toolbar")) return;
        // 【关键修复】放行所有局部存在滚动条的容器，允许在编辑模式下依然可以滑动阅读
        if (
          e.target.closest &&
          e.target.closest(
            ".qa-passage, .qa-notes-panel, .qa-answer-panel, [data-scrollable]",
          )
        )
          return;

        e.preventDefault();
        e.stopPropagation();
      }
    },
    { capture: true, passive: false },
  );

  document.addEventListener(
    "touchmove",
    function (e) {
      if (editorCore._navLocked) {
        if (e.target.closest && e.target.closest(".rich-toolbar")) return;
        if (
          e.target.closest &&
          e.target.closest(
            ".qa-passage, .qa-notes-panel, .qa-answer-panel, [data-scrollable]",
          )
        )
          return;
        e.preventDefault();
        e.stopPropagation();
      }
    },
    { capture: true, passive: false },
  );

  // ========================================
  // 工具栏按钮事件绑定
  // ========================================
  var undoBtn = document.getElementById("undobtn");
  var redoBtn = document.getElementById("redobtn");
  if (undoBtn)
    undoBtn.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      historyMgr.undo();
    });
  if (redoBtn)
    redoBtn.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      historyMgr.redo();
    });

  document.querySelectorAll("[data-cmd]").forEach(function (btn) {
    btn.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      RichTextToolbar.restoreSelection();
      RichTextToolbar.execAndRecord(btn.getAttribute("data-cmd"));
    });
  });

  var fontUp = document.getElementById("fontSizeUp");
  var fontDown = document.getElementById("fontSizeDown");
  if (fontUp)
    fontUp.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      RichTextToolbar.changeFontSize(1);
    });
  if (fontDown)
    fontDown.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      RichTextToolbar.changeFontSize(-1);
    });

  var colorToggle2 = document.getElementById("colorToggle");
  var bgToggle2 = document.getElementById("bgToggle");
  if (colorToggle2)
    colorToggle2.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      RichTextToolbar.toggleDropdown("colorDropdown");
    });
  if (bgToggle2)
    bgToggle2.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      RichTextToolbar.toggleDropdown("bgDropdown");
    });

  var engFontToggle = document.getElementById("engFontToggle");
  var zhFontToggle = document.getElementById("zhFontToggle");
  if (engFontToggle)
    engFontToggle.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      RichTextToolbar.toggleDropdown("engFontDropdown");
    });
  if (zhFontToggle)
    zhFontToggle.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      RichTextToolbar.toggleDropdown("zhFontDropdown");
    });

  var rubyBtn = document.getElementById("rubyBtn");
  if (rubyBtn)
    rubyBtn.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      RichTextToolbar.addRubyAnnotation();
    });

  var ulColorToggle = document.getElementById("ulColorToggle");
  if (ulColorToggle)
    ulColorToggle.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      RichTextToolbar.toggleDropdown("ulColorDropdown");
    });

  var imageToggle = document.getElementById("imageToggle");
  if (imageToggle)
    imageToggle.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      RichTextToolbar.toggleDropdown("imageDropdown");
    });

  var applyImageBtn = document.getElementById("applyImageBtn");
  var imageUrlInput = document.getElementById("imageUrlInput");
  if (applyImageBtn && imageUrlInput) {
    applyImageBtn.addEventListener("click", function (e) {
      e.preventDefault();
      var url = imageUrlInput.value.trim();
      if (!url) return;
      var slides = getAllSlides();
      var cs = slides[getCurrentSlideIndex()];
      if (!cs) return;
      BoxManager.createImageBox(
        "img-" + Date.now(),
        "center",
        "center",
        null,
        null,
        url,
        cs,
      );
      PersistenceLayer.saveCustomBoxes();
      historyMgr.recordState(true);
      RichTextToolbar.closeDropdowns();
      imageUrlInput.value = "";
    });
  }

  var triggerImageFileBtn = document.getElementById("triggerImageFileBtn");
  var imageFileInput = document.getElementById("imageFileInput");
  if (triggerImageFileBtn && imageFileInput) {
    triggerImageFileBtn.addEventListener("click", function (e) {
      e.preventDefault();
      imageFileInput.click();
    });
    imageFileInput.addEventListener("change", function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (evt) {
        var img = new Image();
        img.onload = function () {
          var canvas = document.createElement("canvas");
          var maxW = 1000;
          var maxH = 1000;
          var w = img.width;
          var h = img.height;
          if (w > maxW) {
            h *= maxW / w;
            w = maxW;
          }
          if (h > maxH) {
            w *= maxH / h;
            h = maxH;
          }
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          var b64 = canvas.toDataURL(
            file.type === "image/jpeg" ? "image/jpeg" : "image/webp",
            0.85,
          );

          var slides = getAllSlides();
          var cs = slides[getCurrentSlideIndex()];
          if (cs) {
            BoxManager.createImageBox(
              "img-" + Date.now(),
              "center",
              "center",
              null,
              null,
              b64,
              cs,
            );
            PersistenceLayer.saveCustomBoxes();
            historyMgr.recordState(true);
            RichTextToolbar.closeDropdowns();
          }
        };
        img.src = evt.target.result;
      };
      reader.readAsDataURL(file);
      imageFileInput.value = "";
    });
  }

  var linkToggle2 = document.getElementById("linkToggle");
  if (linkToggle2)
    linkToggle2.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      RichTextToolbar.toggleDropdown("linkDropdown");
    });
  var applyLinkBtn = document.getElementById("applyLinkBtn");
  var linkUrlInput = document.getElementById("linkUrlInput");
  var removeLinkBtn = document.getElementById("removeLinkBtn");

  if (applyLinkBtn && linkUrlInput) {
    applyLinkBtn.addEventListener("click", function (e) {
      e.preventDefault();
      var url = linkUrlInput.value.trim();
      if (!url) return;
      if (!/^https?:\/\//i.test(url)) url = "http://" + url;
      RichTextToolbar.applyHyperlink(url);
      linkUrlInput.value = "";
    });
  }
  if (removeLinkBtn) {
    removeLinkBtn.addEventListener("click", function (e) {
      e.preventDefault();
      RichTextToolbar.removeHyperlink();
    });
  }

  // 防止在工具栏输入框中打字时触发快捷键
  document
    .querySelectorAll(".rt-dropdown-menu input")
    .forEach(function (input) {
      input.addEventListener("keydown", function (e) {
        e.stopPropagation();
      });
    });

  // ==========================================
  // 【架构级自愈：排版剥离与溢出解绑】
  // ==========================================

  // 1. 修复 overflow: hidden 导致顶标被切掉
  document
    .querySelectorAll(".slide-content, .slide-inner")
    .forEach(function (sc) {
      sc.style.overflow = "visible";
    });

  // 2. 修复误将内联 tag 塞入 h1 等长文本块
  document.querySelectorAll("[data-edit-id] .tag").forEach(function (tag) {
    var parentBlock = tag.closest("[data-edit-id]");
    if (parentBlock && parentBlock !== tag) {
      var sibling = tag.nextSibling;
      if (sibling && sibling.nodeType === 1 && sibling.tagName === "BR") {
        sibling.remove();
      } else if (
        sibling &&
        sibling.nodeType === 3 &&
        sibling.textContent.trim() === ""
      ) {
        if (sibling.nextSibling && sibling.nextSibling.tagName === "BR") {
          sibling.nextSibling.remove();
        }
        sibling.remove();
      }
      if (!tag.hasAttribute("data-edit-id")) {
        tag.setAttribute(
          "data-edit-id",
          "tag-" + Math.random().toString(36).substr(2, 6),
        );
      }
      parentBlock.parentNode.insertBefore(tag, parentBlock);
    }
  });

  // 3. 顶标注音文字（rt）的交互解耦
  document.addEventListener("mousedown", function (e) {
    if (e.detail >= 2) {
      var rt = e.target.closest("rt");
      if (rt) {
        e.preventDefault();
        e.stopPropagation();
        var sel = window.getSelection();
        var range = document.createRange();
        range.selectNodeContents(rt);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  });
})();
