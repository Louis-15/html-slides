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
     * 为目标元素注入 📍✖ 控件条（文本框和简单图片框共用同一套代码）
     * 文本框：创建 .native-edit-wrap.editable-wrap 包裹
     * 简单图片框（IMG）：创建 .simple-image-box.editable-wrap 包裹 + 额外八爪鱼缩放点
     * 两者共享同一套 control/position/drag/delete 逻辑
     */
    _injectControls: function (el) {
      var self = this;
      var wrap = el.closest(".editable-wrap");
      var isImg = (el.tagName === "IMG");

      // 批注气泡本身自带完整的控制界面（拖拽、删除、关联等），无需套壳与注入通用控件
      if (el.closest(".qa-note-bubble")) return;

      // 图片卡片内部的图片由 ImageCardRuntime 管理，不在此处理
      if (isImg && el.closest('.image-card')) return;

      // ====== 包裹阶段：确保元素有 .editable-wrap 外壳 ======

      // 简单图片框：如果没有包裹，创建 .simple-image-box 包裹
      if (isImg) {
        var imgWrap = el.closest('.simple-image-box');
        if (!imgWrap) {
          imgWrap = document.createElement('div');
          imgWrap.className = 'simple-image-box editable-wrap';
          imgWrap.style.display = 'inline-block';
          imgWrap.style.verticalAlign = 'top';
          el.parentNode.insertBefore(imgWrap, el);
          imgWrap.appendChild(el);
          wrap = imgWrap;
        } else {
          wrap = imgWrap;
        }
      }

      // 文本框：为原生的文本编辑块安全隔离一层 wrapper
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

      // 确保目标容器有 position:relative 以便控件绝对定位
      var posTarget = wrap || target;
      if (posTarget) {
        var cs = window.getComputedStyle(posTarget);
        if (cs.position === "static") posTarget.style.position = "relative";
      }

      var controls = document.createElement("div");
      controls.className = "box-controls";
      controls.setAttribute("contenteditable", "false");
      controls.innerHTML =
        '<span class="drag-handle" title="按住拖动📍">📍</span><span class="del-btn" title="删除/隐藏">✖</span>';

      if (target) target.appendChild(controls);

      this._bindDrag(controls.querySelector(".drag-handle"), el, wrap);
      this._bindDelete(controls.querySelector(".del-btn"), el, wrap);

      // 简单图片框：让图片自适应父容器宽度
      if (isImg) {
        var resizeTarget = wrap || el;
        // 让图片宽度自动占满容器
        el.style.maxWidth = '100%';
        el.style.width = '100%';
        el.style.height = 'auto';
        // 容器本身也自适应宽度
        if (wrap) {
          wrap.style.width = '100%';
          wrap.style.maxWidth = '100%';
        }
      }
    },

    /** 绑定上下排序拖拽逻辑（文本框和简单图片框共用，带跟随光标和落点指示器） */
    _bindDrag: function (handle, el, wrap) {
      var dragState = null;

      handle.addEventListener('pointerdown', function (e) {
        if (!window.editorCore || !window.editorCore.isActive) return;
        e.preventDefault();
        e.stopPropagation();

        var target = wrap || el;
        var parent = target.parentNode;
        var siblings = Array.from(parent.children).filter(function (child) {
          return child.classList.contains('simple-image-box') ||
                 child.classList.contains('native-edit-wrap') ||
                 child.classList.contains('editable-wrap');
        });
        var currentIndex = siblings.indexOf(target);
        if (currentIndex < 0) return;

        // 记录拖拽起始状态
        var targetRect = target.getBoundingClientRect();
        var scrollTop = window.scrollY || window.pageYOffset;
        var scrollLeft = window.scrollX || window.pageXOffset;

        // 创建跟随鼠标的克隆体
        var ghost = target.cloneNode(true);
        ghost.style.cssText =
          'position:fixed;z-index:99999;pointer-events:none;' +
          'width:' + targetRect.width + 'px;' +
          'height:' + targetRect.height + 'px;' +
          'top:' + targetRect.top + 'px;' +
          'left:' + targetRect.left + 'px;' +
          'opacity:0.85;box-shadow:0 12px 48px rgba(0,0,0,0.25);' +
          'border-radius:8px;overflow:hidden;' +
          'transition:opacity 0.15s ease;';
        // 不可编辑
        ghost.querySelectorAll('[contenteditable]').forEach(function (g) { g.removeAttribute('contenteditable'); });
        document.body.appendChild(ghost);

        // 原元素变半透明占位
        target.style.opacity = '0.25';
        target.style.transition = 'opacity 0.15s ease';

        // 创建落点指示器（水平线）
        var dropLine = document.createElement('div');
        dropLine.style.cssText =
          'height:3px;background:var(--accent-green,#3fb950);' +
          'border-radius:2px;pointer-events:none;' +
          'margin:2px 0;display:none;';
        parent.insertBefore(dropLine, parent.firstChild);

        // 计算落点位置：遍历所有可排序兄弟，用鼠标 Y 与各框中心线比较
        function updateDropLine(cursorY) {
          var bestIdx = siblings.length;
          for (var i = 0; i < siblings.length; i++) {
            var r = siblings[i].getBoundingClientRect();
            if (cursorY < r.top + r.height / 2) {
              bestIdx = i;
              break;
            }
          }
          // 因为目标自身变半透明且不参与视觉排序，实际有效索引以 DOM 当前顺序为准
          // 获取当前 DOM 顺序中 target 的实时索引
          var liveSiblings = Array.from(parent.children).filter(function (child) {
            return child.classList.contains('simple-image-box') ||
                   child.classList.contains('native-edit-wrap') ||
                   child.classList.contains('editable-wrap');
          });
          var liveIdx = liveSiblings.indexOf(target);

          // 显示指示器：只要 bestIdx 不等于目标所在插槽（即目标前后的位置都不算变化）
          // 目标插槽 = 目标所在的 DOM 位置：目标占据一个位置，插入到它自己之前或之后都算原位
          var atOwnSlot = (bestIdx === liveIdx) || (bestIdx === liveIdx + 1);
          if (atOwnSlot) {
            dropLine.style.display = 'none';
          } else {
            dropLine.style.display = 'block';
            var ref = liveSiblings[bestIdx];
            if (ref && ref !== target) {
              parent.insertBefore(dropLine, ref);
            } else {
              parent.appendChild(dropLine);
            }
          }
        }

        handle.setPointerCapture(e.pointerId);

        dragState = {
          parent: parent,
          siblings: siblings,
          currentIndex: currentIndex,
          offsetY: e.clientY - targetRect.top,
          offsetX: e.clientX - targetRect.left,
          target: target,
          ghost: ghost,
          dropLine: dropLine,
          scrollTop: scrollTop,
          scrollLeft: scrollLeft,
          updateDropLine: updateDropLine
        };
      });

      handle.addEventListener('pointermove', function (e) {
        if (!dragState) return;
        e.preventDefault();

        // 克隆体跟随鼠标
        dragState.ghost.style.top = (e.clientY - dragState.offsetY) + 'px';
        dragState.ghost.style.left = (e.clientX - dragState.offsetX) + 'px';

        // 更新落点指示器
        dragState.updateDropLine(e.clientY);
      });

      handle.addEventListener('pointerup', function () {
        if (!dragState) return;

        // 移除克隆体
        if (dragState.ghost && dragState.ghost.parentNode) {
          dragState.ghost.parentNode.removeChild(dragState.ghost);
        }

        // 恢复原元素透明度
        dragState.target.style.opacity = '';
        dragState.target.style.transition = '';

        // 移动目标到落点指示器的位置（仅当指示器可见——即确实发生了位置变化）
        var moved = false;
        var dropLine = dragState.dropLine;
        if (dropLine && dropLine.parentNode) {
          if (dropLine.style.display !== 'none') {
            // 指示器可见：将目标插入到指示器的位置（指示器被移除前作为占位标记）
            dropLine.parentNode.insertBefore(dragState.target, dropLine);
            moved = true;
          }
          dropLine.parentNode.removeChild(dropLine);
        }

        if (moved) {
          window.PersistenceLayer.saveCustomBoxes();
          window.historyMgr.recordState(true);
        }

        dragState = null;
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
      var img = document.createElement('img');
      img.setAttribute('data-edit-id', id);
      img.className = 'simple-image';
      if (src) img.setAttribute('src', src);
      img.style.maxWidth = '100%';
      img.style.display = 'block';

      targetParent.appendChild(img);
      // _injectControls 会自动包裹 .simple-image-box 并注入控件条和八爪鱼缩放点
      this._injectControls(img);

      // 写 localStorage（与 saveElement / restoreAllElements 保持一致）
      try {
        if (window.PersistenceLayer) {
          window.PersistenceLayer.saveElement(img);
        }
      } catch (e) {}

      return img.closest('.simple-image-box') || img;
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
