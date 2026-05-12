/* ===========================================
   image-card-runtime.JS
   HTML-Slides — 图片卡片编辑态运行时
   负责：空态↔有图切换、插入/替换图片按钮、文件选择器
   依赖：editor-utils.js, PersistenceLayer
   暴露：window.ImageCardRuntime

   放映模式：点击图片弹出内置光箱（可滚轮缩放、拖拽平移）
   =========================================== */

(function () {
  "use strict";

  var utils = window._editorUtils;
  var storageKey = utils.storageKey;

  var ImageCardRuntime = {

    /** 初始化：为所有 .image-card 注入编辑控件，并同步空态 */
    init: function () {
      var self = this;
      document.querySelectorAll('.image-card').forEach(function (block) {
        if (block._imageCardInitialized) return;
        block._imageCardInitialized = true;
        self._ensureStructure(block);
        // ⭐ _ensureStructure 有早期返回分支（.image-actions 已存在时跳过），
        //    但 _syncEmptyState 必须始终执行以匹配当前 DOM 状态
        self._syncEmptyState(block);
      });
      // 放映模式看图：全局事件委托，避免重复绑定
      self._initViewImageDelegate();
    },

    /** 确保 .image-card 内部结构完整（图片框/占位符/操作层） */
    _ensureStructure: function (block) {
      // 已初始化过则跳过
      if (block.querySelector('.image-actions')) return;

      // 创建操作按钮容器（始终存在，编辑态才显示）
      var actions = document.createElement('div');
      actions.className = 'image-actions';

      // 🖼️ 插入/替换图片按钮
      var replaceBtn = document.createElement('button');
      replaceBtn.className = 'image-card-replace-btn';
      replaceBtn.title = '插入/替换图片';
      replaceBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image-up-icon lucide-image-up"><path d="M10.3 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10l-3.1-3.1a2 2 0 0 0-2.814.014L6 21"/><path d="m14 19.5 3-3 3 3"/><path d="M17 22v-5.5"/><circle cx="9" cy="9" r="2"/></svg>';
      replaceBtn.setAttribute('contenteditable', 'false');

      // 🗑️ 清空图片按钮（保留框，与简单图片框的 ✖ 不同）
      var clearBtn = document.createElement('button');
      clearBtn.className = 'image-card-clear-btn';
      clearBtn.title = '清空图片（保留框）';
      clearBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2-icon lucide-trash-2"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
      clearBtn.setAttribute('contenteditable', 'false');

      actions.appendChild(replaceBtn);
      actions.appendChild(clearBtn);
      block.appendChild(actions);

      // 绑定替换按钮
      this._bindReplace(replaceBtn, block);
      this._bindClear(clearBtn, block);

      // 空态检测：如果没有 <img> 或 src 为空，打上 is-empty 标记
      this._syncEmptyState(block);
    },

    /** 同步空态标记 */
    _syncEmptyState: function (block) {
      var img = block.querySelector('.slide-image');
      // 同时检查 display:none（清空操作会隐藏 img 但不一定有 src）
      var isEmpty = !img || !img.getAttribute('src') || img.getAttribute('src') === '' || img.style.display === 'none';
      block.classList.toggle('is-empty', isEmpty);
    },

    /**
     * 全局事件委托：点击 .image-card 区域 → 内置光箱看图
     * 在原页面置顶图层放大显示图片，背景灰色滤镜，支持滚轮缩放
     */
    _initViewImageDelegate: function () {
      if (document.body._imageCardViewDelegate) return;
      document.body._imageCardViewDelegate = true;

      // 创建光箱容器（单例，惰性创建）
      var overlay = null;
      var overlayImg = null;
      var currentScale = 1;
      var translateX = 0;
      var translateY = 0;

      function createOverlay() {
        overlay = document.createElement('div');
        overlay.className = 'image-card-lightbox';
        overlay.style.cssText =
          'display:none;position:fixed;inset:0;z-index:99999;' +
          'background:rgba(0,0,0,0.65);' +
          'backdrop-filter:blur(6px);' +
          'cursor:grab;' +
          'display:flex;align-items:center;justify-content:center;';

        overlayImg = document.createElement('img');
        overlayImg.style.cssText =
          'max-width:90vw;max-height:90vh;' +
          'object-fit:contain;' +
          'border-radius:8px;' +
          'box-shadow:0 24px 80px rgba(0,0,0,0.5);' +
          'pointer-events:none;' +  /* 让鼠标事件穿透到 overlay，由拖拽逻辑统一处理 */
          'display:block;' +
          'transform-origin:center center;';
        overlayImg.draggable = false;
        overlay.appendChild(overlayImg);

        // 关闭按钮
        var closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.setAttribute('aria-label', '关闭');
        closeBtn.style.cssText =
          'position:fixed;top:20px;right:24px;' +
          'width:40px;height:40px;border-radius:50%;' +
          'border:none;background:rgba(0,0,0,0.4);' +
          'color:#fff;font-size:22px;cursor:pointer;' +
          'display:flex;align-items:center;justify-content:center;' +
          'z-index:100000;transition:background 0.2s;';
        closeBtn.addEventListener('mouseenter', function () { closeBtn.style.background = 'rgba(0,0,0,0.7)'; });
        closeBtn.addEventListener('mouseleave', function () { closeBtn.style.background = 'rgba(0,0,0,0.4)'; });
        closeBtn.addEventListener('click', closeOverlay);
        overlay.appendChild(closeBtn);

        document.body.appendChild(overlay);
      }

      function openOverlay(src) {
        if (!overlay) createOverlay();
        // 确保 overlay 的事件绑定已完成（首次打开时绑定，后续跳过）
        _ensureEventsBound();
        // 重置缩放和平移
        currentScale = 1;
        translateX = 0;
        translateY = 0;
        overlayImg.src = src;
        overlayImg.style.transform = 'scale(1) translate(0,0)';
        overlay.style.display = 'flex';
        // 禁止背景滚动
        document.body.style.overflow = 'hidden';
      }

      function closeOverlay() {
        if (!overlay) return;
        overlay.style.display = 'none';
        overlayImg.src = '';
        document.body.style.overflow = '';
      }

      // 在 overlay 首次创建后绑定一次拖拽事件（不能在 null 上绑定）
      var dragState = null;
      function _ensureEventsBound() {
        if (overlay._eventsBound) return;
        overlay._eventsBound = true;

        overlay.addEventListener('pointerdown', function (e) {
          if (e.target === overlay.querySelector('button') || e.target.closest('button')) return;
          dragState = {
            startX: e.clientX,
            startY: e.clientY,
            initTx: translateX,
            initTy: translateY,
            moved: false
          };
          overlay.setPointerCapture(e.pointerId);
          overlay.style.cursor = 'grabbing';
        });

        overlay.addEventListener('pointermove', function (e) {
          if (!dragState) return;
          var dx = e.clientX - dragState.startX;
          var dy = e.clientY - dragState.startY;
          if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragState.moved = true;
          translateX = dragState.initTx + dx;
          translateY = dragState.initTy + dy;
          overlayImg.style.transform = 'scale(' + currentScale + ') translate(' + translateX + 'px,' + translateY + 'px)';
        });

        overlay.addEventListener('pointerup', function (e) {
          if (!dragState) return;
          dragState = null;
          overlay.style.cursor = 'grab';
          overlay.releasePointerCapture(e.pointerId);
          // 不自动关闭光箱——仅 Esc / ✕ 按钮可关闭，避免误触退出
        });
      }

      // 鼠标滚轮缩放（仅在光箱打开时生效）
      document.body.addEventListener('wheel', function (e) {
        if (!overlay || overlay.style.display === 'none') return;
        e.preventDefault();
        e.stopPropagation();
        var delta = e.deltaY > 0 ? -0.1 : 0.1;
        currentScale = Math.max(0.5, Math.min(8, currentScale + delta));
        overlayImg.style.transform = 'scale(' + currentScale + ') translate(' + translateX + 'px,' + translateY + 'px)';
      }, { passive: false });

      // 键盘 Esc 关闭
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && overlay && overlay.style.display !== 'none') {
          closeOverlay();
        }
      });

      // 拦截 .image-card 点击
      document.body.addEventListener('click', function (e) {
        var block = e.target.closest('.image-card');
        if (!block) return;
        if (window.editorCore && window.editorCore.isActive) return;
        if (e.target.closest('.image-actions')) return;

        var img = block.querySelector('.slide-image');
        if (!img) return;
        var src = img.getAttribute('src');
        if (!src) return;

        // 补全为绝对路径
        var absSrc = src;
        if (src.indexOf('http') !== 0 && src.indexOf('//') !== 0) {
          absSrc = new URL(src, window.location.href).href;
        }
        openOverlay(absSrc);
      }, true);
    },

    /** 绑定替换按钮：文件选择器 → 写 src */
    _bindReplace: function (btn, block) {
      var self = this;
      // 创建隐藏的 file input
      var fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.style.display = 'none';
      document.body.appendChild(fileInput);

      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!window.editorCore || !window.editorCore.isActive) return;
        fileInput.click();
      });

      fileInput.addEventListener('change', function (e) {
        var file = e.target.files[0];
        if (!file) return;
        self._applyImageFile(file, block);
        fileInput.value = ''; // 重置，允许选同一文件
      });
    },

    /** 将文件路径写入图片框 */
    _applyImageFile: function (file, block) {
      var img = block.querySelector('.slide-image');
      if (!img) {
        // 如果没有 img 元素，创建一个
        img = document.createElement('img');
        img.className = 'slide-image';
        img.alt = '';
        // 插入到 .image-actions 之前
        var actions = block.querySelector('.image-actions');
        block.insertBefore(img, actions);
      }

      // 构建相对于 HTML 文件的路径：images/<文件名>
      var fileName = file.name;
      // 校验：文件必须有扩展名，否则提示用户
      if (!fileName || fileName.indexOf('.') === -1) {
        alert('选择的文件没有扩展名，请确认文件格式。');
        return;
      }
      var relativePath = 'images/' + fileName;

      img.setAttribute('src', relativePath);
      img.setAttribute('data-edit-id', img.getAttribute('data-edit-id') || ('img-' + Date.now()));
      // 清除之前清空操作留下的 display:none，确保图片可见
      if (img.style.display === 'none') {
        img.style.display = '';
      }

      this._syncEmptyState(block);

      // 保存到 localStorage
      if (window.PersistenceLayer) {
        window.PersistenceLayer.saveElement(img);
      }

      // 记录历史
      if (window.historyMgr) {
        window.historyMgr.recordState(true);
      }
    },

    /** 绑定清空按钮：清空 src，保留框 */
    _bindClear: function (btn, block) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!window.editorCore || !window.editorCore.isActive) return;
        var img = block.querySelector('.slide-image');
        if (img) {
          img.removeAttribute('src');
          img.style.display = 'none';
        }
        // 切换回空态
        block.classList.add('is-empty');

        // 更新 localStorage
        // ★ 将空状态写回 localStorage（而非只删除 key），
        //   确保保存到 HTML 文件时基线中的 img src 能被清除。
        //   参见 restoreEditIdFromStorage 中 'src' in parsed 的处理。
        if (window.PersistenceLayer) {
          var editId = img && img.getAttribute('data-edit-id');
          if (editId) {
            try {
              localStorage.setItem(storageKey('e:' + editId), JSON.stringify({ html: '', src: '' }));
            } catch (e) {}
          }
        }
        if (window.historyMgr) {
          window.historyMgr.recordState(true);
        }
      });
    },

    /** DOM 恢复后重新绑定事件 */
    rehydrateSlide: function (slideEl) {
      if (!slideEl) return;
      var self = this;
      slideEl.querySelectorAll('.image-card').forEach(function (block) {
        block._imageCardInitialized = false;
        self._ensureStructure(block);
        self._syncEmptyState(block);
      });
    },
  };

  window.ImageCardRuntime = ImageCardRuntime;
})();
