/* ===========================================
   EDITOR-CORE-IMAGE.JS
   HTML-Slides 编辑器 — 简单图片框插入逻辑
   从 editor-core.js 拆分而来，负责工具栏"插入简单图片框"按钮的事件绑定
   依赖：editor-utils.js, editor-persistence.js, editor-inline-boxes.js
   运行时依赖：window._editorUtils, window.BoxManager, window.PersistenceLayer, window.historyMgr
   暴露：window.ImageInsertHandler
   =========================================== */

(function () {
  "use strict";

  var ImageInsertHandler = {

    /**
     * 绑定"插入简单图片框"按钮事件。
     * 必须在工具栏 HTML 注入到 DOM 之后调用。
     */
    init: function () {
      var addBtn = document.getElementById('addSimpleImageBtn');
      if (!addBtn) return;

      addBtn.addEventListener('click', function () {
        var utils = window._editorUtils;
        if (!utils) return;
        var slides = utils.getAllSlides();
        var cs = slides[utils.getCurrentSlideIndex()];
        if (!cs) return;

        // 找到当前焦点所在的一级宿主组件
        var focusedEl = typeof window.__slideRuntime__ !== 'undefined' &&
          typeof window.__slideRuntime__.getFocusedInteractionElement === 'function'
          ? window.__slideRuntime__.getFocusedInteractionElement() : null;

        var targetParent = focusedEl || cs.querySelector('.slide-content') || cs;

        // ===== 翻转卡片特殊处理：让用户选择插入到正面还是背面 =====
        var flipCard = targetParent.closest('.flip-card');
        if (!flipCard && targetParent.querySelector) {
          flipCard = targetParent.querySelector('.flip-card');
        }
        if (flipCard) {
          ImageInsertHandler._showFlipPicker(flipCard);
          return;
        }

        // ===== 折叠卡片特殊处理：让用户选择插入到初始内容区还是展开内容区 =====
        var collapseCard = targetParent.closest('.collapse-card');
        if (!collapseCard && targetParent.querySelector) {
          collapseCard = targetParent.querySelector('.collapse-card');
        }
        if (collapseCard) {
          var expandInner = collapseCard.querySelector('.card-expand-inner');
          if (expandInner) {
            ImageInsertHandler._showCollapsePicker(collapseCard, expandInner);
            return;
          }
        }

        // 非折叠/翻转卡片：直接弹出文件选择器
        ImageInsertHandler._triggerFilePicker(targetParent);
      });
    },

    /** 翻转卡片插入位置选择面板 */
    _showFlipPicker: function (flipCard) {
      var front = flipCard.querySelector('.flip-front');
      var back = flipCard.querySelector('.flip-back');
      if (!front && !back) {
        ImageInsertHandler._triggerFilePicker(flipCard);
        return;
      }

      var picker = document.createElement('div');
      picker.className = 'image-insert-picker';
      picker.style.cssText =
        'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
        'z-index:99998;background:var(--bg-card,#fff);' +
        'border-radius:12px;box-shadow:0 24px 80px rgba(0,0,0,0.3);' +
        'padding:20px 24px;display:flex;flex-direction:column;gap:12px;' +
        'min-width:280px;';

      var title = document.createElement('div');
      title.textContent = '请选择图片插入位置：';
      title.style.cssText = 'font-size:14px;font-weight:600;color:var(--text,#333);margin-bottom:4px;';
      picker.appendChild(title);

      if (front) {
        var btnFront = document.createElement('button');
        btnFront.textContent = '🔵 插入到正面';
        btnFront.style.cssText =
          'padding:10px 16px;border-radius:8px;border:1px solid var(--border,#ddd);' +
          'background:var(--bg-card-hover,#f5f5f5);cursor:pointer;font-size:13px;text-align:left;';
        btnFront.addEventListener('click', function () {
          picker.remove();
          overlay.remove();
          ImageInsertHandler._triggerFilePicker(front);
        });
        picker.appendChild(btnFront);
      }

      if (back) {
        var btnBack = document.createElement('button');
        btnBack.textContent = '🔴 插入到背面';
        btnBack.style.cssText =
          'padding:10px 16px;border-radius:8px;border:1px solid var(--border,#ddd);' +
          'background:var(--bg-card-hover,#f5f5f5);cursor:pointer;font-size:13px;text-align:left;';
        btnBack.addEventListener('click', function () {
          picker.remove();
          overlay.remove();
          ImageInsertHandler._triggerFilePicker(back);
        });
        picker.appendChild(btnBack);
      }

      var overlay = document.createElement('div');
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:99997;background:rgba(0,0,0,0.3);';
      overlay.addEventListener('click', function () { picker.remove(); overlay.remove(); });
      document.body.appendChild(overlay);
      document.body.appendChild(picker);
    },

    /** 折叠卡片插入位置选择面板 */
    _showCollapsePicker: function (collapseCard, expandInner) {
      var selectedTarget = null;

      var picker = document.createElement('div');
      picker.className = 'image-insert-picker';
      picker.style.cssText =
        'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
        'z-index:99998;background:var(--bg-card,#fff);' +
        'border-radius:12px;box-shadow:0 24px 80px rgba(0,0,0,0.3);' +
        'padding:20px 24px;display:flex;flex-direction:column;gap:12px;' +
        'min-width:280px;';

      var title = document.createElement('div');
      title.textContent = '请选择图片插入位置：';
      title.style.cssText = 'font-size:14px;font-weight:600;color:var(--text,#333);margin-bottom:4px;';
      picker.appendChild(title);

      var btnInitial = document.createElement('button');
      btnInitial.textContent = '📄 插入到初始内容区';
      btnInitial.style.cssText =
        'padding:10px 16px;border-radius:8px;border:1px solid var(--border,#ddd);' +
        'background:var(--bg-card-hover,#f5f5f5);cursor:pointer;font-size:13px;text-align:left;';
      btnInitial.addEventListener('click', function () {
        var expandDiv = collapseCard.querySelector('.card-expand');
        if (expandDiv) {
          var initialContainer = collapseCard.querySelector('.card-initial-content');
          if (!initialContainer) {
            initialContainer = document.createElement('div');
            initialContainer.className = 'card-initial-content';
            collapseCard.insertBefore(initialContainer, expandDiv);
          }
          selectedTarget = initialContainer;
        } else {
          selectedTarget = collapseCard;
        }
        picker.remove();
        overlay.remove();
        ImageInsertHandler._triggerFilePicker(selectedTarget);
      });
      picker.appendChild(btnInitial);

      var btnExpand = document.createElement('button');
      btnExpand.textContent = '📂 插入到展开内容区';
      btnExpand.style.cssText =
        'padding:10px 16px;border-radius:8px;border:1px solid var(--border,#ddd);' +
        'background:var(--bg-card-hover,#f5f5f5);cursor:pointer;font-size:13px;text-align:left;';
      btnExpand.addEventListener('click', function () {
        selectedTarget = expandInner;
        picker.remove();
        overlay.remove();
        ImageInsertHandler._triggerFilePicker(selectedTarget);
      });
      picker.appendChild(btnExpand);

      var overlay = document.createElement('div');
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:99997;background:rgba(0,0,0,0.3);';
      overlay.addEventListener('click', function () { picker.remove(); overlay.remove(); });
      document.body.appendChild(overlay);
      document.body.appendChild(picker);
    },

    /** 弹出文件选择器，选中后创建简单图片框 */
    _triggerFilePicker: function (insertTarget) {
      if (!insertTarget) return;

      var fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.style.display = 'none';
      document.body.appendChild(fileInput);

      fileInput.addEventListener('change', function (e) {
        var file = e.target.files[0];
        if (!file) return;
        var fileName = file.name;
        if (!fileName || fileName.indexOf('.') === -1) {
          alert('选择的文件没有扩展名，请确认文件格式。');
          fileInput.remove();
          return;
        }
        var relativePath = 'images/' + fileName;

        if (typeof window.BoxManager !== 'undefined') {
          window.BoxManager.createSimpleImageBox(
            'simple-img-' + Date.now(),
            relativePath,
            insertTarget
          );
          if (window.PersistenceLayer) window.PersistenceLayer.saveCustomBoxes();
          if (window.historyMgr) window.historyMgr.recordState(true);
        }
        fileInput.remove();
      });

      fileInput.click();
    }
  };

  window.ImageInsertHandler = ImageInsertHandler;

  // 自初始化（必须在 editor-core.js 之后加载，确保工具栏 HTML 已注入）
  ImageInsertHandler.init();
})();
