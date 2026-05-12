/* ===========================================
   image-card-runtime.JS
   HTML-Slides — 图片卡片编辑态运行时
   负责：空态↔有图切换、插入/替换图片按钮、文件选择器
   依赖：editor-utils.js, PersistenceLayer
   暴露：window.ImageCardRuntime
   =========================================== */

(function () {
  "use strict";

  var utils = window._editorUtils;
  var storageKey = utils.storageKey;

  var ImageCardRuntime = {

    /** 初始化：为所有 .image-card 注入编辑控件 */
    init: function () {
      var self = this;
      document.querySelectorAll('.image-card').forEach(function (block) {
        if (block._imageCardInitialized) return;
        block._imageCardInitialized = true;
        self._ensureStructure(block);
      });
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
      replaceBtn.innerHTML = '🖼️';
      replaceBtn.setAttribute('contenteditable', 'false');

      // 🗑️ 清空图片按钮（保留框，与简单图片框的 ✖ 不同）
      var clearBtn = document.createElement('button');
      clearBtn.className = 'image-card-clear-btn';
      clearBtn.title = '清空图片（保留框）';
      clearBtn.innerHTML = '🗑️';
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
      var isEmpty = !img || !img.getAttribute('src') || img.getAttribute('src') === '';
      block.classList.toggle('is-empty', isEmpty);
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
        if (window.PersistenceLayer) {
          var editId = img && img.getAttribute('data-edit-id');
          if (editId) {
            try {
              localStorage.removeItem(storageKey('e:' + editId));
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
      });
    },
  };

  window.ImageCardRuntime = ImageCardRuntime;
})();
