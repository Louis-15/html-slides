/* ===========================================
   EDITOR-IMAGES.JS
   HTML-Slides 编辑器 — 图片框编辑管理
   依赖：editor-utils.js (window._editorUtils)
   运行时依赖：window.PersistenceLayer, window.editorCore, window.historyMgr
   暴露：window.ImageManager

   注意：本文件从 editor-text-manager.js（原名 editor-box-manager.js）拆分而来，专门负责
   图片插入、拖拽、缩放、删除等编辑操作。后续将大幅重构
   图片插入与修改相关功能。
   =========================================== */

(function () {
  "use strict";

  var utils = window._editorUtils;
  var storageKey = utils.storageKey;

  var ImageManager = {
    /**
     * 初始化：为所有已有的 IMG 元素绑定拖拽/缩放/删除控件
     */
    init: function () {
      var self = this;
      document.querySelectorAll("img[data-edit-id]").forEach(function (el) {
        self._injectControls(el);
      });
    },

    /**
     * 为目标图片元素注入 📍✖ 控件条与八爪鱼缩放点（如果尚未注入）
     */
    _injectControls: function (el) {
      if (el.tagName !== "IMG") return;
      var self = this;
      var wrap = el.closest(".editable-wrap");

      // 暴力清理从 innerHTML（撤销操作/重水化）恢复回来的死节点
      if (wrap && wrap.querySelectorAll) {
        var zombies = wrap.querySelectorAll(".box-controls, .rs-handle");
        zombies.forEach(function (node) { node.remove(); });
      }

      // 确定图片的容器目标：自定义图片框用 wrap，原生图片找父容器
      var target = wrap || el.closest(".image-frame") ||
        el.closest(".image-fullbleed") || el.parentNode;

      // 确保目标容器有 position:relative 以便控件绝对定位
      var cs = window.getComputedStyle(target);
      if (cs.position === "static") target.style.position = "relative";

      // 暴力清理目标容器内的残余死节点
      if (target.querySelectorAll) {
        target.querySelectorAll(".box-controls, .rs-handle").forEach(function (n) { n.remove(); });
      }

      // 注入 📍✖ 控件条
      var controls = document.createElement("div");
      controls.className = "box-controls";
      controls.setAttribute("contenteditable", "false");
      controls.innerHTML =
        '<span class="drag-handle" title="按住拖动📍">📍</span><span class="del-btn" title="删除/隐藏">✖</span>';
      target.appendChild(controls);

      // 注入八爪鱼缩放点（8 个方向）
      if (!target.querySelector(".rs-se")) {
        var corners = ["nw", "ne", "sw", "se", "n", "s", "w", "e"];
        corners.forEach(function (dir) {
          var r = document.createElement("div");
          r.className = "rs-handle rs-" + dir;
          r.setAttribute("data-dir", dir);
          r.setAttribute("contenteditable", "false");
          target.appendChild(r);
          self._bindResize(r, target);
        });
        target.style.resize = "none";
      }

      this._bindDrag(controls.querySelector(".drag-handle"), el, wrap);
      this._bindDelete(controls.querySelector(".del-btn"), el, wrap);
    },

    /** 绑定图片拖拽逻辑（统一使用 PointerEvent） */
    _bindDrag: function (handle, el, wrap) {
      var dragState = null;
      var isCustom = wrap && wrap.classList.contains("custom-box");

      handle.addEventListener("pointerdown", function (e) {
        if (!window.editorCore || !window.editorCore.isActive) return;
        e.preventDefault();
        e.stopPropagation();
        handle.setPointerCapture(e.pointerId);

        if (isCustom) {
          // 自定义图片框：绝对定位拖拽，先锁定宽高防止拖拽时尺寸塌缩
          if (!wrap.style.width || wrap.style.width === "auto")
            wrap.style.width = wrap.offsetWidth + "px";
          if (!wrap.style.height || wrap.style.height === "auto")
            wrap.style.height = wrap.offsetHeight + "px";
          dragState = {
            target: wrap,
            startX: e.clientX,
            startY: e.clientY,
            initLeft: wrap.offsetLeft,
            initTop: wrap.offsetTop,
            type: "abs",
          };
        } else {
          // 原生图片：transform 拖拽
          var dragTarget =
            el.closest(".image-frame") ||
            el.closest(".image-fullbleed") ||
            el.parentNode;
          var tx = ImageManager._parseTranslate(dragTarget);
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

    /** 绑定 8 点缩放逻辑 */
    _bindResize: function (handle, target) {
      var rsState = null;
      handle.addEventListener("pointerdown", function (e) {
        if (!window.editorCore || !window.editorCore.isActive) return;
        e.preventDefault();
        e.stopPropagation();
        handle.setPointerCapture(e.pointerId);

        var cs = window.getComputedStyle(target);
        if (cs.position === "static") target.style.position = "relative";
        target.style.maxWidth = "none";
        target.style.maxHeight = "none";
        target.style.flexShrink = "0";

        // 确保内部图片填满容器
        var innerImg = target.querySelector("img.slide-image");
        if (innerImg) {
          innerImg.style.width = "100%";
          innerImg.style.height = "100%";
          innerImg.style.maxHeight = "none";
        }

        var currLeft = parseFloat(target.style.left) || 0;
        var currTop = parseFloat(target.style.top) || 0;

        rsState = {
          target: target,
          dir: handle.getAttribute("data-dir"),
          startX: e.clientX,
          startY: e.clientY,
          w: target.offsetWidth,
          h: target.offsetHeight,
          cLeft: currLeft,
          cTop: currTop,
        };
      });

      handle.addEventListener("pointermove", function (e) {
        if (!rsState) return;
        var dx = e.clientX - rsState.startX;
        var dy = e.clientY - rsState.startY;
        var t = rsState.target;

        if (rsState.dir.indexOf("e") > -1)
          t.style.width = Math.max(20, rsState.w + dx) + "px";
        if (rsState.dir.indexOf("s") > -1)
          t.style.height = Math.max(20, rsState.h + dy) + "px";
        if (rsState.dir.indexOf("w") > -1) {
          var pw = Math.max(20, rsState.w - dx);
          if (pw > 20) {
            t.style.width = pw + "px";
            t.style.left = rsState.cLeft + (rsState.w - pw) + "px";
          }
        }
        if (rsState.dir.indexOf("n") > -1) {
          var ph = Math.max(20, rsState.h - dy);
          if (ph > 20) {
            t.style.height = ph + "px";
            t.style.top = rsState.cTop + (rsState.h - ph) + "px";
          }
        }
      });

      handle.addEventListener("pointerup", function () {
        if (!rsState) return;
        rsState = null;
        window.PersistenceLayer.saveCustomBoxes();
        window.PersistenceLayer.saveNativeMods();
        window.historyMgr.recordState(true);
      });
    },

    /** 绑定图片删除/隐藏逻辑 */
    _bindDelete: function (btn, el, wrap) {
      btn.addEventListener("click", function () {
        if (!window.editorCore || !window.editorCore.isActive) return;
        var isCustom = wrap && wrap.classList.contains("custom-box");
        var msg = isCustom
          ? "确定要删除这张图片吗？"
          : "确定要隐藏这张原版图片吗？";
        if (!confirm(msg)) return;

        if (isCustom) {
          var id = el.getAttribute("data-edit-id");
          wrap.remove();
          try {
            localStorage.removeItem(storageKey("e:" + id));
          } catch (e) {}
          window.PersistenceLayer.saveCustomBoxes();
        } else {
          // 原生图片：隐藏父容器
          var delTarget =
            el.closest(".image-frame") ||
            el.closest(".image-fullbleed") ||
            el.parentNode;
          delTarget.style.display = "none";
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

    /** 创建自定义图片图元 */
    createImageBox: function (id, left, top, width, height, src, targetSlide) {
      var container =
        targetSlide.querySelector(".slide-content") || targetSlide;
      var wrap = document.createElement("div");
      wrap.className = "editable-wrap custom-box image-box image-frame";
      if (left === "center") {
        left = "50%";
        top = "30%";
        wrap.style.transform = "translateX(-50%)";
      }
      wrap.style.left = left;
      wrap.style.top = top;
      if (width) wrap.style.width = width;
      if (height) wrap.style.height = height;

      var img = document.createElement("img");
      img.setAttribute("data-edit-id", id);
      img.setAttribute("src", src);
      img.className = "slide-image";

      wrap.appendChild(img);
      container.appendChild(wrap);
      this._injectControls(img);

      if (typeof ResizeObserver !== "undefined") {
        var ro = new ResizeObserver(function () {
          if (window.editorCore && window.editorCore.isActive) {
            window.PersistenceLayer.saveCustomBoxes();
          }
        });
        ro.observe(wrap);
      }
    },

    /**
     * DOM 恢复后重新绑定事件 — 图片专用。
     * 文本框的恢复见 BoxManager.rehydrateSlide()
     */
    rehydrateSlide: function (slideEl) {
      if (!slideEl) return;
      var self = this;
      slideEl.querySelectorAll("img[data-edit-id]").forEach(function (el) {
        self._injectControls(el);
      });
      slideEl
        .querySelectorAll(".editable-wrap.custom-box.image-box")
        .forEach(function (wrap) {
          if (typeof ResizeObserver !== "undefined") {
            var ro = new ResizeObserver(function () {
              if (window.editorCore && window.editorCore.isActive) {
                window.PersistenceLayer.saveCustomBoxes();
              }
            });
            ro.observe(wrap);
          }
        });
    },
  };

  window.ImageManager = ImageManager;
})();
