/* ===========================================
   EDITOR-INLINE-BOXES.JS
   HTML-Slides 编辑器 — 文本框/简单图片框统一管理
   原名 editor-text-manager.js，与 editor-images.js 合并而来
   负责：
   - 文本框：创建、控件注入、删除
   - 简单图片框：创建、控件注入、八爪鱼缩放、删除
   - 统一排序拖拽（上下排列模式）
   图片卡片见 image-card-runtime.js
   依赖：editor-utils.js (window._editorUtils)
   运行时依赖：window.PersistenceLayer, window.editorCore, window.historyMgr
   暴露：window.BoxManager
   =========================================== */

(function () {
  "use strict";

  var utils = window._editorUtils;
  var storageKey = utils.storageKey;

  var BoxManager = {
    /**
     * 初始化：为所有已有的原生 [data-edit-id] 元素绑定控件
     * 统一方案：文本框使用内嵌 .box-controls 控件条，
     * IMG 元素创建 .simple-image-box 包裹 + 八爪鱼缩放点
     */
    init: function () {
      var self = this;
      document.querySelectorAll("[data-edit-id]").forEach(function (el) {
        // 自动补出来的稳定 id 只是为了让恢复链路在进入编辑模式前也能命中普通正文根块。
        // 它们原本没有源码级 id，如果现在就注入 wrapper，会把"首次进入编辑模式才套壳"的旧行为提前到页面初始加载，
        // 进而放大 DOM 抖动与动画重播风险。因此这里继续只处理显式 id 元素，自动 id 交给 _ensureWrappersReady 接管。
        if (el.hasAttribute("data-edit-id-auto")) return;
        self._injectControls(el);
      });
    },

    /**
     * 为目标元素注入 📍✖ 控件条（文本框）或简单图片框包裹+八爪鱼缩放点（IMG）
     * _injectControls 内部会按 el.tagName 分流处理
     */
    _injectControls: function (el) {
      var self = this;
      var wrap = el.closest(".editable-wrap");

      // 批注气泡本身自带完整的控制界面（拖拽、删除、关联等），无需套壳与注入通用控件
      if (el.closest(".qa-note-bubble")) return;

      // ====== IMG 元素：走简单图片框路径 ======
      if (el.tagName === "IMG") {
        // 跳过图片卡片内部的图片（由 ImageCardRuntime 管理）
        if (el.closest('.image-card')) return;
        // 如果已经包裹在 .simple-image-box 中，跳过
        if (el.closest('.simple-image-box')) return;

        // 创建简单图片框包裹
        var imgWrap = document.createElement('div');
        imgWrap.className = 'simple-image-box editable-wrap';
        imgWrap.style.display = 'inline-block';
        imgWrap.style.verticalAlign = 'top';
        el.parentNode.insertBefore(imgWrap, el);
        imgWrap.appendChild(el);
        wrap = imgWrap;

        // 暴力清理残留死节点
        if (wrap.querySelectorAll) {
          var zombies = wrap.querySelectorAll(".box-controls, .rs-handle");
          zombies.forEach(function (node) { node.remove(); });
        }

        // 确保目标容器有 position:relative 以便控件绝对定位
        var cs = window.getComputedStyle(wrap);
        if (cs.position === "static") wrap.style.position = "relative";

        // 注入 📍✖ 控件条
        var controls = document.createElement("div");
        controls.className = "box-controls";
        controls.setAttribute("contenteditable", "false");
        controls.innerHTML =
          '<span class="drag-handle" title="按住拖动📍">📍</span><span class="del-btn" title="删除">✖</span>';
        wrap.appendChild(controls);

        // 注入八爪鱼缩放点（简单图片框需要）
        this._injectResizeHandles(wrap);

        this._bindDrag(controls.querySelector(".drag-handle"), el, wrap);
        this._bindDelete(controls.querySelector(".del-btn"), el, wrap);
        return;
      }

      // ====== 非 IMG 元素：文本框路径（原有逻辑） ======

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

    /** 注入八爪鱼缩放点（简单图片框使用） */
    _injectResizeHandles: function (target) {
      if (!target || target.querySelector('.rs-se')) return;
      var corners = ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'];
      var self = this;
      corners.forEach(function (dir) {
        var r = document.createElement('div');
        r.className = 'rs-handle rs-' + dir;
        r.setAttribute('data-dir', dir);
        r.setAttribute('contenteditable', 'false');
        target.appendChild(r);
        self._bindResize(r, target);
      });
      target.style.resize = 'none';
    },

    /** 绑定上下排序拖拽逻辑（文本框和简单图片框共用） */
    _bindDrag: function (handle, el, wrap) {
      var dragState = null;

      handle.addEventListener('pointerdown', function (e) {
        if (!window.editorCore || !window.editorCore.isActive) return;
        e.preventDefault();
        e.stopPropagation();
        handle.setPointerCapture(e.pointerId);

        var parent = (wrap || el).parentNode;
        var siblings = Array.from(parent.children).filter(function (child) {
          return child.classList.contains('simple-image-box') ||
                 child.classList.contains('native-edit-wrap') ||
                 child.classList.contains('editable-wrap');
        });
        var currentIndex = siblings.indexOf(wrap || el);
        if (currentIndex < 0) return;

        // 给所有同级框打上排序高亮
        siblings.forEach(function (s) { s.classList.add('sort-highlight'); });

        dragState = {
          parent: parent,
          siblings: siblings,
          currentIndex: currentIndex,
          startY: e.clientY,
          target: wrap || el
        };
      });

      handle.addEventListener('pointermove', function (e) {
        if (!dragState) return;
        e.preventDefault();

        var siblings = dragState.siblings;
        var current = dragState.target;
        var currentRect = current.getBoundingClientRect();
        var currentCenterY = currentRect.top + currentRect.height / 2;

        // 遍历同级框，检查鼠标是否越过了某个框的中线
        for (var i = 0; i < siblings.length; i++) {
          if (siblings[i] === current) continue;
          var rect = siblings[i].getBoundingClientRect();
          var centerY = rect.top + rect.height / 2;

          // 鼠标越过中线且方向正确时执行交换
          if (e.clientY < centerY && currentCenterY > rect.bottom - 5 && i < dragState.currentIndex) {
            // 向上插入到该框之前
            dragState.parent.insertBefore(current, siblings[i]);
            dragState.currentIndex = i;
            currentCenterY = current.getBoundingClientRect().top + current.getBoundingClientRect().height / 2;
          } else if (e.clientY > centerY && currentCenterY < rect.top + 5 && i > dragState.currentIndex) {
            // 向下插入到该框之后
            if (siblings[i + 1]) {
              dragState.parent.insertBefore(current, siblings[i + 1]);
            } else {
              dragState.parent.appendChild(current);
            }
            dragState.currentIndex = i;
            currentCenterY = current.getBoundingClientRect().top + current.getBoundingClientRect().height / 2;
          }
        }
      });

      handle.addEventListener('pointerup', function () {
        if (!dragState) return;
        // 移除排序高亮
        dragState.siblings.forEach(function (s) { s.classList.remove('sort-highlight'); });

        // 如果排序发生了变化，保存状态
        window.PersistenceLayer.saveCustomBoxes();
        window.historyMgr.recordState(true);
        dragState = null;
      });
    },

    /** 绑定 8 点缩放逻辑（简单图片框使用，八爪鱼拖拽） */
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

    /** 绑定删除/隐藏逻辑 — 文本框/简单图片框共用 */
    _bindDelete: function (btn, el, wrap) {
      btn.addEventListener("click", function () {
        if (!window.editorCore || !window.editorCore.isActive) return;
        var isCustom = wrap && wrap.classList.contains("custom-box");
        var isSimpleImage = el.tagName === 'IMG' && wrap && wrap.classList.contains('simple-image-box');
        var msg = isSimpleImage
          ? "确定要删除这个图片框吗？"
          : isCustom
            ? "确定要删除这个文本框吗？"
            : "确定要隐藏此元素吗？";
        if (!confirm(msg)) return;

        if (isCustom || isSimpleImage) {
          var id = el.getAttribute("data-edit-id");
          (wrap || el).remove();
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

    /** 创建简单图片框（流式布局，放入组件内部） */
    createSimpleImageBox: function (id, src, targetParent) {
      if (!targetParent) return null;
      var wrap = document.createElement('div');
      wrap.className = 'simple-image-box editable-wrap';
      wrap.style.display = 'inline-block';
      wrap.style.verticalAlign = 'top';

      var img = document.createElement('img');
      img.setAttribute('data-edit-id', id);
      img.className = 'simple-image';
      if (src) img.setAttribute('src', src);
      img.style.maxWidth = '100%';
      img.style.display = 'block';

      wrap.appendChild(img);
      targetParent.appendChild(wrap);
      this._injectControls(img);
      return wrap;
    },

    /**
     * DOM 恢复后重新绑定事件 — 文本框 + 简单图片框共用
     */
    rehydrateSlide: function (slideEl) {
      if (!slideEl) return;
      var self = this;
      slideEl.querySelectorAll("[data-edit-id]").forEach(function (el) {
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
