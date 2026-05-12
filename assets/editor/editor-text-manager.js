/* ===========================================
   EDITOR-TEXT-MANAGER.JS
   HTML-Slides 编辑器 — 文本框编辑管理（从 editor-box-manager.js 重命名而来）
   依赖：editor-utils.js (window._editorUtils)
   运行时依赖：window.PersistenceLayer, window.editorCore, window.historyMgr
   暴露：window.BoxManager

   注意：本文件仅负责文本框管理。图片编辑相关功能已迁移到
   editor-images.js（window.ImageManager），请同步加载该文件。
   =========================================== */

(function () {
  "use strict";

  var utils = window._editorUtils;
  var storageKey = utils.storageKey;

  var BoxManager = {
    /**
     * 初始化：为所有已有的原生 [data-edit-id] 元素绑定拖拽/删除控件
     * 统一方案：所有文本框都使用内嵌 .box-controls 控件条
     */
    init: function () {
      var self = this;
      document.querySelectorAll("[data-edit-id]").forEach(function (el) {
        // 自动补出来的稳定 id 只是为了让恢复链路在进入编辑模式前也能命中普通正文根块。
        // 它们原本没有源码级 id，如果现在就注入 wrapper，会把“首次进入编辑模式才套壳”的旧行为提前到页面初始加载，
        // 进而放大 DOM 抖动与动画重播风险。因此这里继续只处理显式 id 元素，自动 id 交给 _ensureWrappersReady 接管。
        if (el.hasAttribute("data-edit-id-auto")) return;
        // 图片元素由 ImageManager.init() 管理
        if (el.tagName === "IMG") return;
        self._injectControls(el);
      });
    },

    /**
     * 为目标文本元素注入 📍✖ 控件条（如果尚未注入）
     * 不包含图片缩放逻辑，图片控件见 ImageManager._injectControls()
     */
    _injectControls: function (el) {
      var self = this;
      var wrap = el.closest(".editable-wrap");

      // 批注气泡本身自带完整的控制界面（拖拽、删除、关联等），无需套壳与注入通用控件
      if (el.closest(".qa-note-bubble")) return;

      // 图片元素由 ImageManager 管理
      if (el.tagName === "IMG") return;

      // 为原生的文本编辑块安全隔离一层 wrapper，使悬浮控制条不被内部 contenteditable 吃掉和误删
      if (
        !wrap &&
        el.tagName !== "TD" &&
        el.tagName !== "TH" &&
        !el.closest(".native-edit-wrap")
      ) {
        // 先读取被包裹元素的计算 display，让壳子镜像原有排版类型
        var elDisplay = window.getComputedStyle(el).display;
        wrap = document.createElement("div");
        wrap.className = "editable-wrap native-edit-wrap";
        // 块级元素用 block，行内/行内块用 inline-block（否则 border 不会显示）
        wrap.style.display =
          elDisplay === "inline" ||
          elDisplay === "inline-flex" ||
          elDisplay === "inline-grid"
            ? "inline-block"
            : "block";
        el.parentNode.insertBefore(wrap, el);
        wrap.appendChild(el);
      }

      var target = wrap || el;

      // 暴力清理从 innerHTML (撤销操作/重水化) 恢复回来的死节点
      if (target && target.querySelectorAll) {
        var zombies = target.querySelectorAll(".box-controls, .rs-handle");
        zombies.forEach(function (node) {
          node.remove();
        });
      }

      // td/th 元素不注入（表格单元格拖不动）
      if (el.tagName === "TD" || el.tagName === "TH") return;

      // 让原生元素也具备 position: relative 以便控件绝对定位
      if (!wrap && target) {
        var cs = window.getComputedStyle(target);
        if (cs.position === "static") target.style.position = "relative";
      }

      var controls = document.createElement("div");
      controls.className = "box-controls";
      controls.setAttribute("contenteditable", "false");
      controls.innerHTML =
        '<span class="drag-handle" title="按住拖动📍">📍</span><span class="del-btn" title="删除/隐藏">✖</span>';

      if (target) target.appendChild(controls);

      this._bindDrag(controls.querySelector(".drag-handle"), el, wrap);
      this._bindDelete(controls.querySelector(".del-btn"), el, wrap);
    },

    /** 绑定拖拽逻辑（统一使用 PointerEvent）— 文本框专用 */
    _bindDrag: function (handle, el, wrap) {
      var dragState = null;
      var isCustom = wrap && wrap.classList.contains("custom-box");

      handle.addEventListener("pointerdown", function (e) {
        if (!window.editorCore || !window.editorCore.isActive) return;
        e.preventDefault();
        e.stopPropagation();
        handle.setPointerCapture(e.pointerId);

        if (isCustom) {
          dragState = {
            target: wrap,
            startX: e.clientX,
            startY: e.clientY,
            initLeft: wrap.offsetLeft,
            initTop: wrap.offsetTop,
            type: "abs",
          };
        } else {
          var dragTarget = el;
          var tx = BoxManager._parseTranslate(dragTarget);
          dragState = {
            target: dragTarget,
            startX: e.clientX,
            startY: e.clientY,
            initTx: tx.x,
            initTy: tx.y,
            type: "transform",
          };
        }
      });

      handle.addEventListener("pointermove", function (e) {
        if (!dragState) return;
        var dx = e.clientX - dragState.startX;
        var dy = e.clientY - dragState.startY;
        if (dragState.type === "abs") {
          dragState.target.style.left = dragState.initLeft + dx + "px";
          dragState.target.style.top = dragState.initTop + dy + "px";
        } else {
          dragState.target.style.transform =
            "translate(" +
            (dragState.initTx + dx) +
            "px," +
            (dragState.initTy + dy) +
            "px)";
        }
      });

      handle.addEventListener("pointerup", function () {
        if (!dragState) return;
        if (dragState.type === "abs") window.PersistenceLayer.saveCustomBoxes();
        else window.PersistenceLayer.saveNativeMods();
        dragState = null;
        window.historyMgr.recordState(true);
      });
    },

    /** 绑定删除/隐藏逻辑 — 文本框专用（图片删除见 ImageManager） */
    _bindDelete: function (btn, el, wrap) {
      btn.addEventListener("click", function () {
        if (!window.editorCore || !window.editorCore.isActive) return;
        var isCustom = wrap && wrap.classList.contains("custom-box");
        var msg = isCustom
          ? "确定要删除这个文本框吗？"
          : "确定要隐藏此元素吗？";
        if (!confirm(msg)) return;

        if (isCustom) {
          var id = el.getAttribute("data-edit-id");
          wrap.remove();
          try {
            localStorage.removeItem(storageKey("e:" + id));
          } catch (e) {}
          window.PersistenceLayer.saveCustomBoxes();
        } else {
          el.style.display = "none";
          window.PersistenceLayer.saveNativeMods();
        }
        window.historyMgr.recordState(true);
      });
    },

    /** 解析 translate */
    _parseTranslate: function (el) {
      if (!el.style.transform) return { x: 0, y: 0 };
      var m = el.style.transform.match(
        /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/,
      );
      return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 };
    },

    /** 创建自定义文本框 */
    createTextBox: function (id, left, top, content, targetSlide) {
      var container =
        targetSlide.querySelector(".slide-content") || targetSlide;
      var wrap = document.createElement("div");
      wrap.className = "editable-wrap custom-box text-box";
      wrap.style.left = left;
      wrap.style.top = top;

      var editArea = document.createElement("div");
      editArea.setAttribute("data-edit-id", id);
      var isEditing = window.editorCore && window.editorCore.isActive;
      editArea.setAttribute("contenteditable", isEditing ? "true" : "false");
      editArea.style.cssText =
        "padding:8px; min-width:20px; min-height:24px; font-size:var(--body-size,1rem); line-height:1.45;";
      editArea.innerHTML = content || "请输入";

      wrap.appendChild(editArea);
      container.appendChild(wrap);
      this._injectControls(editArea);

      editArea.addEventListener("input", function () {
        if (window.editorCore && window.editorCore.isActive) {
          window.PersistenceLayer.saveElement(editArea);
          window.PersistenceLayer.saveCustomBoxes();
        }
      });

      if (window.editorCore) window.editorCore.refreshEditables();
    },

    /**
     * DOM 恢复后重新绑定事件 — 文本框专用。
     * 图片元素的恢复见 ImageManager.rehydrateSlide()
     */
    rehydrateSlide: function (slideEl) {
      if (!slideEl) return;
      var self = this;
      slideEl.querySelectorAll("[data-edit-id]").forEach(function (el) {
        // 图片元素由 ImageManager.rehydrateSlide() 处理
        if (el.tagName === "IMG") return;
        self._injectControls(el);
      });
      slideEl
        .querySelectorAll(".editable-wrap.custom-box.text-box")
        .forEach(function (wrap) {
          var editArea = wrap.querySelector("[data-edit-id]");
          if (!editArea || editArea.tagName === "IMG") return;
          editArea.addEventListener("input", function () {
            if (window.editorCore && window.editorCore.isActive) {
              window.PersistenceLayer.saveElement(editArea);
              window.PersistenceLayer.saveCustomBoxes();
            }
          });
        });
    },
  };

  window.BoxManager = BoxManager;
})();
