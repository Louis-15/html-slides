/* ===========================================
   EDITOR-RICH-TEXT.JS
   HTML-Slides 编辑器 — 富文本工具栏逻辑
   依赖：editor-utils.js (window._editorUtils)
   运行时依赖：window.PersistenceLayer, window.editorCore, window.historyMgr
   暴露：window.RichTextToolbar
   =========================================== */

(function () {
    'use strict';

    var utils = window._editorUtils;
    var getActiveEditContainer = utils.getActiveEditContainer;

    var RichTextToolbar = {
        savedRange: null,
        pageFragmentToolbar: null,
        pageFragmentGroupSeed: 0,

        /** 可选字体列表（英文框） */
        FONTS_ENG: [
            { name: '默认 (DM Sans)', family: "'DM Sans'" },
            { name: 'Space Grotesk', family: "'Space Grotesk'" },
            { name: 'Manrope', family: "'Manrope'" },
            { name: 'Plus Jakarta Sans', family: "'Plus Jakarta Sans'" },
            { name: 'Outfit', family: "'Outfit'" },
            { name: 'Work Sans', family: "'Work Sans'" },
            { name: 'IBM Plex Sans', family: "'IBM Plex Sans'" },
            { name: 'Syne', family: "'Syne'" },
            { name: 'Archivo', family: "'Archivo'" },
            { name: 'Cormorant', family: "'Cormorant'" },
            { name: 'Bodoni Moda', family: "'Bodoni Moda'" },
            { name: 'Fraunces', family: "'Fraunces'" },
            { name: 'JetBrains Mono', family: "'JetBrains Mono'" },
            { name: 'Space Mono', family: "'Space Mono'" },
            { name: '--- 手写体 ---', family: '' },
            { name: 'MV Boli', family: "'MV Boli'" },
            { name: 'Caveat', family: "'Caveat'" },
            { name: '--- 汉字体 ---', family: '' },
            { name: '微软雅黑', family: "'Microsoft YaHei', 'PingFang SC', sans-serif" },
            { name: '等线', family: "DengXian, 'PingFang SC', sans-serif" },
            { name: '宋体', family: "SimSun, 'Songti SC', serif" },
            { name: '楷体', family: "KaiTi, 'Kaiti SC', serif" },
            { name: '仿宋', family: "FangSong, 'FangSong SC', serif" }
        ],

        /** 可选字体列表（中文框） */
        FONTS_ZH: [
            { name: '默认 (微软雅黑)', family: "'Microsoft YaHei', 'PingFang SC', sans-serif" },
            { name: '等线', family: "DengXian, 'PingFang SC', sans-serif" },
            { name: '宋体', family: "SimSun, 'Songti SC', serif" },
            { name: '楷体', family: "KaiTi, 'Kaiti SC', serif" },
            { name: '仿宋', family: "FangSong, 'FangSong SC', serif" },
            { name: '--- 手写体 ---', family: '' },
            { name: '华文行楷', family: "'STXingkai', 'Xingkai SC', '华文行楷', cursive" }
        ],

        init: function () {
            var self = this;

            // 监听光标变化
            document.addEventListener('selectionchange', function () {
                if (!window.editorCore || !window.editorCore.isActive) return;
                var sel = window.getSelection();
                if (sel.rangeCount > 0) {
                    var range = sel.getRangeAt(0);
                    var el = range.commonAncestorContainer;
                    el = el.nodeType === 3 ? el.parentNode : el;
                    if (el && el.closest && el.closest('[contenteditable="true"]')) {
                        self.savedRange = range;
                    } else {
                        // 修复：如果焦点转移到了工具栏/下拉面板上，保留 savedRange 不清空
                        // 否则点击下划线色板等工具栏按钮时选区会丢失
                        var activeEl = document.activeElement;
                        var inToolbar = activeEl && activeEl.closest && activeEl.closest('.rich-toolbar, .rt-dropdown-menu, .page-richtext-fragment-toolbar');
                        if (!inToolbar) {
                            self.savedRange = null;
                        }
                    }
                } else {
                    self.savedRange = null;
                }
                self.syncFontIndicators();
                if (typeof self.syncFormatButtons === 'function') self.syncFormatButtons();
                if (typeof self.syncPageFragmentToolbar === 'function') self.syncPageFragmentToolbar();
            });

            this._initPalettes();
            this._initFontMenu('engFontDropdown', this.FONTS_ENG, 'eng');
            this._initFontMenu('zhFontDropdown', this.FONTS_ZH, 'zh');
            this._ensurePageFragmentToolbar();

            if (window.EditorHooks && typeof window.EditorHooks.register === 'function' && !this._pageFragmentExitHookBound) {
                this._pageFragmentExitHookBound = true;
                window.EditorHooks.register('onEditModeExit', function () {
                    self.savedRange = null;
                    self._hidePageFragmentToolbar();
                });
            }
        },

        restoreSelection: function () {
            if (!this.savedRange) return;
            var sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(this.savedRange);
        },

        _getSelectionRootNode: function (node) {
            return node && node.nodeType === 3 ? node.parentNode : node;
        },

        _getOrdinaryPageEditRoot: function (node) {
            var el = this._getSelectionRootNode(node);
            if (!el || !el.closest) return null;
            var root = el.closest('[data-edit-id]');
            if (!root) return null;
            if (root.closest('.quiz-annotation')) return null;
            return root;
        },

        _resolvePageFragmentSelection: function (range) {
            if (!range || range.collapsed || !range.toString || !range.toString().trim()) return null;

            var startRoot = this._getOrdinaryPageEditRoot(range.startContainer);
            var endRoot = this._getOrdinaryPageEditRoot(range.endContainer);
            if (!startRoot || !endRoot) return null;

            /* 普通页面隐藏型标注的 authored DOM 是按“单个普通 data-edit-id 根块整体持久化”的。
               一旦允许跨根块选区，写入时就必须同时改多个持久化单元，清除格式和后续 reveal 顺序
               也会失去稳定归属，最终把一个局部格式操作放大成跨块事务。本切片因此在 UI 层就直接拒绝。 */
            if (startRoot !== endRoot) return null;

            return {
                root: startRoot,
                range: range,
                commonNode: this._getSelectionRootNode(range.commonAncestorContainer)
            };
        },

        _ensurePageFragmentToolbar: function () {
            var self = this;
            if (this.pageFragmentToolbar && this.pageFragmentToolbar.isConnected) return this.pageFragmentToolbar;

            var toolbar = document.createElement('div');
            toolbar.className = 'page-richtext-fragment-toolbar';
            /* 普通页面作者态工具条继续保留 page-richtext 自己的宿主与持久化逻辑，
               但视觉壳、按钮尺寸、分隔线和下拉菜单全部与 quiz fragment toolbar 对齐。
               这样普通页面和答题批注组件能看到完全一致的浮动工具条，同时又不把两套业务状态混在一起。 */
            toolbar.innerHTML =
                '<div class="qa-toolbar-label fragment-toolbar-label">隐藏型标注</div>' +
                '<div class="qa-toolbar-divider" aria-hidden="true"></div>' +
                '<div class="rt-dropdown qa-format-dropdown">' +
                    '<button class="qa-toolbar-btn btn-color" title="文字颜色"><span style="font-weight:bold;color:#e74c3c;">A</span></button>' +
                    '<div class="rt-dropdown-menu page-fragment-dropdown-menu"><div class="palette-grid text-colors page-fragment-text-colors"></div></div>' +
                '</div>' +
                '<div class="rt-dropdown qa-format-dropdown">' +
                    '<button class="qa-toolbar-btn btn-highlight" title="背景高光"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16" stroke="#f1c40f" stroke-width="6" opacity="0.5"/><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg></button>' +
                    '<div class="rt-dropdown-menu page-fragment-dropdown-menu"><div class="palette-grid bg-colors page-fragment-highlight-colors"></div></div>' +
                '</div>' +
                '<button class="qa-toolbar-btn btn-strikethrough" title="删除线"><s style="text-decoration-color:rgba(186, 26, 26, 0.4);text-decoration-thickness:0.12em;">S</s></button>' +
                '<button class="qa-toolbar-btn btn-ruby" title="顶标"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19h16"/><path d="m12 15 4-8 4 8"/><path d="M14 11h4"/><path d="M4 9h5"/><path d="M6 5h1"/></svg></button>' +
                '<div class="qa-toolbar-divider" aria-hidden="true"></div>' +
                '<button class="qa-toolbar-btn btn-remove-format" title="清除格式"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 22-1-4"/><path d="M19 14a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2h-3a1 1 0 0 1-1-1V4a2 2 0 0 0-4 0v5a1 1 0 0 1-1 1H6a2 2 0 0 0-2 2v1a1 1 0 0 0 1 1"/><path d="M19 14H5l-1.973 6.767A1 1 0 0 0 4 22h16a1 1 0 0 0 .973-1.233z"/><path d="m8 22 1-4"/></svg></button>';

            document.body.appendChild(toolbar);
            this.pageFragmentToolbar = toolbar;
            this._initPageFragmentPalettes(toolbar);

            toolbar.querySelectorAll('button').forEach(function (button) {
                button.addEventListener('pointerdown', function (e) {
                    e.preventDefault();
                });
            });

            var colorBtn = toolbar.querySelector('.btn-color');
            var highlightBtn = toolbar.querySelector('.btn-highlight');
            var strikeBtn = toolbar.querySelector('.btn-strikethrough');
            var rubyBtn = toolbar.querySelector('.btn-ruby');
            var clearBtn = toolbar.querySelector('.btn-remove-format');

            if (colorBtn) {
                colorBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    self._togglePageFragmentDropdown(colorBtn.nextElementSibling);
                });
            }

            if (highlightBtn) {
                highlightBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    self._togglePageFragmentDropdown(highlightBtn.nextElementSibling);
                });
            }

            if (strikeBtn) {
                strikeBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    self._applyPageFragmentFormat('strikethrough');
                });
            }

            if (rubyBtn) {
                rubyBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    var rubyText = window.prompt('请输入顶标内容', '批注');
                    if (!rubyText) return;
                    self._applyPageFragmentFormat('ruby', rubyText);
                });
            }

            if (clearBtn) {
                clearBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    self._clearPageFragmentFormat();
                });
            }

            document.addEventListener('pointerdown', function (e) {
                if (!e.target.closest || !e.target.closest('.page-richtext-fragment-toolbar')) {
                    self._closePageFragmentDropdowns();
                }
            });

            return toolbar;
        },

        _initPageFragmentPalettes: function (toolbar) {
            var self = this;
            /* 这里刻意复用答题批注组件 fragment toolbar 原有的多色语义色板。
               “隐藏型标注”这个左侧标签需要走新东方绿色系，但文字色/高光色本身承载的是作者对内容的标记语义，
               不能被主题绿色吞掉，否则就会把原来已经形成习惯的颜色含义一起改掉。 */
            var textColors = ['#000000', '#2C3E50', '#7F8C8D', '#FD79A8', '#E74C3C', '#E67E22', '#F1C40F', '#2ECC71', '#1ABC9C', '#3498DB', '#9B59B6'];
            var highlightColors = ['rgba(231, 76, 60, 0.4)', 'rgba(230, 126, 34, 0.4)', 'rgba(241, 196, 15, 0.4)', 'rgba(46, 204, 113, 0.4)', 'rgba(52, 152, 219, 0.4)', 'rgba(155, 89, 182, 0.4)', 'rgba(253, 121, 168, 0.4)', 'rgba(255, 255, 255, 0.4)', 'rgba(0,0,0,0)'];
            var textGrid = toolbar.querySelector('.page-fragment-text-colors');
            var highlightGrid = toolbar.querySelector('.page-fragment-highlight-colors');

            if (textGrid) {
                textColors.forEach(function (color) {
                    var swatch = document.createElement('div');
                    swatch.className = 'color-swatch';
                    swatch.style.background = color;
                    swatch.addEventListener('pointerdown', function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        self._applyPageFragmentFormat('color', color);
                        self._closePageFragmentDropdowns();
                    });
                    textGrid.appendChild(swatch);
                });
            }

            if (highlightGrid) {
                highlightColors.forEach(function (color) {
                    var swatch = document.createElement('div');
                    swatch.className = 'color-swatch';
                    if (color === 'transparent' || color === 'rgba(0,0,0,0)') {
                        swatch.style.background = '#fff';
                        swatch.innerHTML = '<div style="width:100%;height:100%;background:linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%),linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%);background-size:8px 8px;background-position:0 0,4px 4px;border-radius:3px;"></div>';
                    } else {
                        swatch.style.background = color;
                    }
                    swatch.addEventListener('pointerdown', function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        self._applyPageFragmentFormat('highlight', (color === 'transparent' || color === 'rgba(0,0,0,0)') ? 'rgba(0,0,0,0)' : color);
                        self._closePageFragmentDropdowns();
                    });
                    highlightGrid.appendChild(swatch);
                });
            }
        },

        _togglePageFragmentDropdown: function (menu) {
            if (!menu) return;
            var shouldShow = !menu.classList.contains('show');
            this._closePageFragmentDropdowns();
            if (shouldShow) menu.classList.add('show');
        },

        _closePageFragmentDropdowns: function () {
            var toolbar = this.pageFragmentToolbar;
            if (!toolbar) return;
            toolbar.querySelectorAll('.rt-dropdown-menu.show').forEach(function (menu) {
                menu.classList.remove('show');
            });
        },

        _showPageFragmentToolbar: function (range) {
            var toolbar = this._ensurePageFragmentToolbar();
            if (!toolbar || !range) return;

            var rect = range.getBoundingClientRect ? range.getBoundingClientRect() : null;
            var width = rect && rect.width ? rect.width : (rect ? rect.right - rect.left : 0);
            var left = rect ? rect.left + width / 2 : window.innerWidth / 2;
            var top = rect ? rect.top : 80;

            /* page-richtext-fragment-toolbar 是 fixed 定位，坐标系已经和 range.getBoundingClientRect()
               一样都基于当前视口。这里如果再叠加 scrollX / scrollY，就等于把页面滚动偏移重复算了两次，
               工具条会在页面滚动后持续向右下漂移。 */
            toolbar.style.left = left + 'px';
            toolbar.style.top = top + 'px';
            toolbar.classList.add('visible');
        },

        _hidePageFragmentToolbar: function () {
            if (!this.pageFragmentToolbar) return;
            this.pageFragmentToolbar.classList.remove('visible');
            this._closePageFragmentDropdowns();
        },

        syncPageFragmentToolbar: function () {
            if (!window.editorCore || !window.editorCore.isActive) {
                this._hidePageFragmentToolbar();
                return;
            }

            var sel = window.getSelection();
            if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
                this._hidePageFragmentToolbar();
                return;
            }

            var context = this._resolvePageFragmentSelection(sel.getRangeAt(0));
            if (!context) {
                this._hidePageFragmentToolbar();
                return;
            }

            this._showPageFragmentToolbar(context.range);
        },

        _getNodeDepth: function (node) {
            var depth = 0;
            var current = node;
            while (current && current.parentNode) {
                depth += 1;
                current = current.parentNode;
            }
            return depth;
        },

        _selectionIntersectsNode: function (range, node) {
            if (!range || !node) return false;
            if (typeof range.intersectsNode === 'function') {
                try {
                    return range.intersectsNode(node);
                } catch (e) {
                    return false;
                }
            }

            var nodeRange = document.createRange();
            nodeRange.selectNodeContents(node);
            return range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0 &&
                range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0;
        },

        _unwrapPageFragmentNode: function (fragment) {
            if (!fragment || !fragment.parentNode) return;
            var parent = fragment.parentNode;
            while (fragment.firstChild) {
                parent.insertBefore(fragment.firstChild, fragment);
            }
            parent.removeChild(fragment);
        },

        _wrapRangeInFragment: function (range, wrapper) {
            try {
                range.surroundContents(wrapper);
            } catch (e) {
                var fragment = range.extractContents();
                wrapper.appendChild(fragment);
                range.insertNode(wrapper);
            }
        },

        _getNextPageFragmentGroupId: function () {
            var self = this;
            document.querySelectorAll('[data-fragment-group]').forEach(function (fragment) {
                var match = String(fragment.getAttribute('data-fragment-group') || '').match(/^frag-group-(\d+)$/);
                if (match) self.pageFragmentGroupSeed = Math.max(self.pageFragmentGroupSeed, Number(match[1]));
            });
            this.pageFragmentGroupSeed += 1;
            return 'frag-group-' + this.pageFragmentGroupSeed;
        },

        _ensurePageFragmentGroup: function (fragment) {
            if (!fragment) return this._getNextPageFragmentGroupId();
            var groupId = fragment.getAttribute('data-fragment-group');
            if (!groupId) {
                groupId = this._getNextPageFragmentGroupId();
                fragment.setAttribute('data-fragment-group', groupId);
            }
            return groupId;
        },

        _resolveSelectedPageFragmentGroupId: function (range) {
            var commonNode = this._getSelectionRootNode(range.commonAncestorContainer);
            var fragmentRoot = commonNode && commonNode.closest ? commonNode.closest('[data-fragment-step="true"]') : null;
            if (fragmentRoot) return this._ensurePageFragmentGroup(fragmentRoot);
            return this._getNextPageFragmentGroupId();
        },

        _persistPageFragmentChange: function (root) {
            if (root && window.PersistenceLayer && typeof window.PersistenceLayer.saveElement === 'function') {
                window.PersistenceLayer.saveElement(root);
            }
            if (window.historyMgr && typeof window.historyMgr.recordState === 'function') {
                window.historyMgr.recordState(true);
            }
            /* 普通页面隐藏型标注既要让本地编辑态立刻可恢复，也要进入 AnnotationStore 的 sidecar 链路。
               仅写 localStorage 会让导出的 .annotations.js 缺少普通 fragment 根块；仅写 sidecar 又会让
               当前编辑会话里的普通富文本恢复链路落后，因此这里必须双写并行调度。 */
            if (window.AnnotationStore) {
                var canScheduleAnnotationSave = typeof window.AnnotationStore.scheduleSave === 'function';
                var canEnsureAnnotationWriteAccess = typeof window.AnnotationStore.ensureWriteAccess === 'function';
                var canAuthorizeAnnotationSave = typeof window.AnnotationStore.authorizeAndSave === 'function';
                var hasAnnotationWriteAccess = typeof window.AnnotationStore.hasWriteAccess === 'function'
                    ? window.AnnotationStore.hasWriteAccess()
                    : true;

                if (!hasAnnotationWriteAccess && canEnsureAnnotationWriteAccess) {
                    /* 普通页面 / example-card 的首轮保存需要先在真实用户手势里拿到文件句柄，
                       但这里不应该直接改成“再手动点一次保存”。作者点击格式按钮之后，
                       正确的行为是：这一下顺手完成授权，随后仍然走原来的自动 scheduleSave。
                       这样既满足 File System Access API 的手势要求，也保留“授权一次，后续自动保存”的旧体验。 */
                    window.AnnotationStore.ensureWriteAccess().then(function (ok) {
                        if (ok && canScheduleAnnotationSave) {
                            window.AnnotationStore.scheduleSave();
                        }
                    }).catch(function () {});
                } else if (!hasAnnotationWriteAccess && canAuthorizeAnnotationSave) {
                    window.AnnotationStore.authorizeAndSave().catch(function () {});
                } else if (canScheduleAnnotationSave) {
                    window.AnnotationStore.scheduleSave();
                }
            }

            var slide = root && root.closest ? root.closest('.slide') : null;
            if (slide && window.PageRichTextAnnotationRuntime && typeof window.PageRichTextAnnotationRuntime.refreshSlide === 'function') {
                /* 作者态改写 fragment 结构后，放映态缓存里的 visible index 已经不再可信。
                   如果不立刻重置，旧 reveal 顺序会直接套到新的 authored DOM 上，造成“上一轮已显示的序号”
                   串到新片段顺序里。refreshSlide 同时负责清空运行时 reveal cache，并同步 slide 的宿主 class。 */
                window.PageRichTextAnnotationRuntime.refreshSlide(slide);
            }
        },

        _applyPageFragmentFormat: function (formatType, value) {
            this.restoreSelection();
            var sel = window.getSelection();
            if (!sel || !sel.rangeCount || sel.isCollapsed) return;

            var range = sel.getRangeAt(0);
            var context = this._resolvePageFragmentSelection(range);
            if (!context) {
                this._hidePageFragmentToolbar();
                return;
            }

            var wrapper = document.createElement('span');
            wrapper.className = 'page-richtext-fragment';
            wrapper.setAttribute('data-fragment-step', 'true');
            wrapper.setAttribute('data-fragment-format', formatType);
            wrapper.setAttribute('data-fragment-group', this._resolveSelectedPageFragmentGroupId(range));

            /* 这里写入的只是 authored 结构：data-fragment-step / format / group 以及对应样式变量。
               放映态 reveal 何时可见、是否加 qa-fragment-visible，属于运行时宿主的瞬时职责。
               两者分离后，作者保存下来的 DOM 才不会被一次课堂播放过程里的临时显隐状态污染。 */
            if (formatType === 'color') {
                var fragmentColor = value || 'var(--accent-blue)';
                wrapper.style.setProperty('--qa-fragment-color', fragmentColor);
                wrapper.dataset.fragmentColor = fragmentColor;
                this._wrapRangeInFragment(range, wrapper);
            } else if (formatType === 'highlight') {
                var fragmentHighlight = value || 'rgba(245, 158, 11, 0.28)';
                wrapper.style.setProperty('--qa-fragment-highlight', fragmentHighlight);
                wrapper.dataset.fragmentHighlight = fragmentHighlight;
                this._wrapRangeInFragment(range, wrapper);
            } else if (formatType === 'strikethrough') {
                wrapper.style.setProperty('--qa-fragment-strike-color', 'rgba(186, 26, 26, 0.4)');
                wrapper.style.setProperty('--qa-fragment-strike-thickness', '0.12em');
                wrapper.dataset.fragmentStrikeColor = 'rgba(186, 26, 26, 0.4)';
                wrapper.dataset.fragmentStrikeThickness = '0.12em';
                this._wrapRangeInFragment(range, wrapper);
            } else if (formatType === 'ruby') {
                if (!value) return;
                var ruby = document.createElement('ruby');
                var rt = document.createElement('rt');
                rt.textContent = value;
                var fragment = range.extractContents();
                ruby.appendChild(fragment);
                ruby.appendChild(rt);
                wrapper.appendChild(ruby);
                range.insertNode(wrapper);
            } else {
                return;
            }

            context.root.normalize();

            var newRange = document.createRange();
            newRange.selectNodeContents(wrapper);
            sel.removeAllRanges();
            sel.addRange(newRange);
            this.savedRange = newRange;

            this._persistPageFragmentChange(context.root);
            this.syncPageFragmentToolbar();
        },

        _clearPageFragmentFormat: function () {
            this.restoreSelection();
            var sel = window.getSelection();
            if (!sel || !sel.rangeCount || sel.isCollapsed) return;

            var range = sel.getRangeAt(0);
            var context = this._resolvePageFragmentSelection(range);
            if (!context) {
                this._hidePageFragmentToolbar();
                return;
            }

            var self = this;
            var fragments = Array.from(context.root.querySelectorAll('[data-fragment-step="true"]')).filter(function (fragment) {
                return self._selectionIntersectsNode(range, fragment);
            });

            if (fragments.length === 0) return;

            fragments.sort(function (left, right) {
                return self._getNodeDepth(right) - self._getNodeDepth(left);
            });
            fragments.forEach(function (fragment) {
                self._unwrapPageFragmentNode(fragment);
            });

            context.root.normalize();
            sel.removeAllRanges();
            this.savedRange = null;
            this._persistPageFragmentChange(context.root);
            this._hidePageFragmentToolbar();
        },

        /** 执行 execCommand 并记录历史（删除线使用自定义实现） */
        execAndRecord: function (cmd, val) {
            if (cmd === 'strikethrough') {
                // 删除线显式写入颜色与粗细，避免不同浏览器回退到不同的默认线宽。
                this._toggleDecoration('line-through', 'rgba(186, 26, 26, 0.4)', '0.12em');
                return;
            }
            this.restoreSelection();
            document.execCommand(cmd, false, val || null);
            window.historyMgr.recordState(true);
        },

        /** 通用装饰去除 */
        _cleanDecoration: function (root, decorationType) {
            var found = false;
            var spans = Array.from(root.querySelectorAll('span'));
            for (var i = spans.length - 1; i >= 0; i--) {
                var s = spans[i];
                if (s.style.textDecoration && s.style.textDecoration.indexOf(decorationType) !== -1) {
                    found = true;
                    // 精确移除特定装饰类型
                    var parts = s.style.textDecoration.split(/\s+/).filter(function(p) { return p && p !== decorationType; });
                    if (parts.length > 0) {
                        s.style.textDecoration = parts.join(' ');
                    } else {
                        s.style.removeProperty('text-decoration');
                    }

                    if (decorationType === 'underline') {
                        s.style.removeProperty('text-decoration-color');
                        s.style.removeProperty('text-underline-offset');
                        s.style.removeProperty('text-decoration-thickness');
                        s.style.removeProperty('text-decoration-skip-ink');
                    } else if (decorationType === 'line-through') {
                        // 删除线颜色/粗细都属于显式规格；移除删除线时要一并清掉，避免残留到其他装饰。
                        s.style.removeProperty('text-decoration-color');
                        s.style.removeProperty('text-decoration-thickness');
                    }
                    
                    if (!s.getAttribute('style') || s.getAttribute('style').trim() === '') {
                        var parent = s.parentNode;
                        while (s.firstChild) parent.insertBefore(s.firstChild, s);
                        parent.removeChild(s);
                    }
                }
            }
            return found;
        },

        /** 在提取前检查活 DOM：选区内的所有文本是否全部拥有指定装饰 */
        _isRangeFullyDecorated: function (range, container, decorationType) {
            var ancestor = range.commonAncestorContainer;
            var el = ancestor.nodeType === 3 ? ancestor.parentNode : ancestor;

            var checkEl = el;
            while (checkEl && checkEl !== container && checkEl !== container.parentNode) {
                if (checkEl.style && checkEl.style.textDecoration &&
                    checkEl.style.textDecoration.indexOf(decorationType) !== -1) {
                    return true;
                }
                checkEl = checkEl.parentNode;
            }

            var root = ancestor.nodeType === 3 ? ancestor.parentNode : ancestor;
            var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
            var node;
            var foundAny = false;

            while (node = walker.nextNode()) {
                if (!range.intersectsNode(node)) continue;
                if (!node.textContent || node.textContent.trim() === '') continue;
                foundAny = true;

                var hasDecor = false;
                var parent = node.parentNode;
                while (parent && parent !== container && parent !== container.parentNode) {
                    if (parent.style && parent.style.textDecoration &&
                        parent.style.textDecoration.indexOf(decorationType) !== -1) {
                        hasDecor = true;
                        break;
                    }
                    parent = parent.parentNode;
                }
                if (!hasDecor) return false;
            }
            return foundAny;
        },

        /** 清理因 extractContents 残留的空装饰 span */
        _cleanEmptyDecoSpans: function (container, decorationType) {
            Array.from(container.querySelectorAll('span')).forEach(function (s) {
                if (s.style.textDecoration && s.style.textDecoration.indexOf(decorationType) !== -1) {
                    if (!s.textContent) s.parentNode.removeChild(s);
                }
            });
        },

        /** 核心：将包裹选区的装饰 span 在选区边界处劈开 */
        _splitDecoSpanAtRange: function (range, container, decorationType) {
            var startEl = range.startContainer.nodeType === 3 ? range.startContainer.parentNode : range.startContainer;
            var decoSpan = null;
            var check = startEl;
            while (check && check !== container) {
                if (check.tagName === 'SPAN' && check.style.textDecoration &&
                    check.style.textDecoration.indexOf(decorationType) !== -1) {
                    decoSpan = check;
                    break;
                }
                check = check.parentNode;
            }
            if (!decoSpan) return;

            var parent = decoSpan.parentNode;

            // 1. 提取「选区之后」的内容
            var afterRange = document.createRange();
            afterRange.setStart(range.endContainer, range.endOffset);
            if (decoSpan.lastChild) afterRange.setEndAfter(decoSpan.lastChild);
            else afterRange.setEnd(decoSpan, 0);
            var afterFrag = afterRange.extractContents();

            // 2. 提取「选中」的内容
            var selectedFrag = range.extractContents();
            var nextSib = decoSpan.nextSibling;

            // 3. 插入「之后」部分（保留装饰）
            if (afterFrag.textContent) {
                var afterSpan = decoSpan.cloneNode(false);
                afterSpan.appendChild(afterFrag);
                parent.insertBefore(afterSpan, nextSib);
            }

            // 4. 插入「选中」部分
            var bareWrap = document.createElement('span');
            bareWrap.appendChild(selectedFrag);
            parent.insertBefore(bareWrap, decoSpan.nextSibling);

            // 5. 清空的前半 span 移除
            if (!decoSpan.textContent) parent.removeChild(decoSpan);

            // 6. 设置选区指向 bareWrap 内容
            var sel = window.getSelection();
            var newRange = document.createRange();
            newRange.selectNodeContents(bareWrap);
            sel.removeAllRanges();
            sel.addRange(newRange);
            this.savedRange = newRange;
        },

        /** 切换装饰（删除线等） */
        _toggleDecoration: function (decorationType, decoColor, decoThickness) {
            this.restoreSelection();
            var sel = window.getSelection();
            if (!sel.rangeCount || sel.isCollapsed) return;
            var container = getActiveEditContainer();
            if (!container) return;

            var range = sel.getRangeAt(0);
            var allDecorated = this._isRangeFullyDecorated(range, container, decorationType);

            // 修复混合样式 Bug：如果不是要“取消”全部样式，就不应该切断跨界的选中域，让原生的 extractContents 去处理父级包裹，避免将 C 拉入外层 span
            if (allDecorated) {
                this._splitDecoSpanAtRange(range, container, decorationType);
            }
            this.restoreSelection();
            sel = window.getSelection();
            if (!sel.rangeCount) return;
            range = sel.getRangeAt(0);

            var fragment = range.extractContents();
            this._cleanDecoration(fragment, decorationType);
            this._cleanEmptyDecoSpans(container, decorationType);

            if (allDecorated) {
                range.insertNode(fragment);
            } else {
                var span = document.createElement('span');
                span.style.textDecoration = decorationType;
                if (decoColor) span.style.textDecorationColor = decoColor;
                if (decorationType === 'underline') {
                    span.style.textUnderlineOffset = '4px';
                    span.style.textDecorationThickness = '2px';
                    span.style.textDecorationSkipInk = 'none';
                } else if (decorationType === 'line-through' && decoThickness) {
                    span.style.textDecorationThickness = decoThickness;
                }
                span.appendChild(fragment);
                range.insertNode(span);
                var newRange = document.createRange();
                newRange.selectNodeContents(span);
                sel.removeAllRanges();
                sel.addRange(newRange);
                this.savedRange = newRange;
            }
            container.normalize();
            window.PersistenceLayer.saveElement(container);
            window.historyMgr.recordState(true);
        },

        /** 有色下划线 */
        applyUnderlineColor: function (color) {
            this.restoreSelection();
            var sel = window.getSelection();
            if (!sel.rangeCount || sel.isCollapsed) return;
            var container = getActiveEditContainer();
            if (!container) return;

            var range = sel.getRangeAt(0);
            this._splitDecoSpanAtRange(range, container, 'underline');
            this.restoreSelection();
            sel = window.getSelection();
            if (!sel.rangeCount) return;
            range = sel.getRangeAt(0);

            var fragment = range.extractContents();
            this._cleanDecoration(fragment, 'underline');
            this._cleanEmptyDecoSpans(container, 'underline');
            var span = document.createElement('span');
            span.style.textDecoration = 'underline';
            span.style.textDecorationColor = color;
            span.style.textUnderlineOffset = '4px';
            span.style.textDecorationThickness = '2px';
            span.style.textDecorationSkipInk = 'none';
            span.appendChild(fragment);
            range.insertNode(span);
            var newRange = document.createRange();
            newRange.selectNodeContents(span);
            sel.removeAllRanges();
            sel.addRange(newRange);
            this.savedRange = newRange;
            container.normalize();
            window.PersistenceLayer.saveElement(container);
            window.historyMgr.recordState(true);
        },

        /** 去掉下划线 */
        removeUnderline: function () {
            this.restoreSelection();
            var sel = window.getSelection();
            if (!sel.rangeCount || sel.isCollapsed) return;
            var container = getActiveEditContainer();
            if (!container) return;

            var range = sel.getRangeAt(0);
            this._splitDecoSpanAtRange(range, container, 'underline');
            this.restoreSelection();
            sel = window.getSelection();
            if (!sel.rangeCount) return;

            var fragment = sel.getRangeAt(0).extractContents();
            this._cleanDecoration(fragment, 'underline');
            this._cleanEmptyDecoSpans(container, 'underline');

            // 直接插回被剥离了下划线格式的片段
            sel.getRangeAt(0).insertNode(fragment);
            container.normalize();

            window.PersistenceLayer.saveElement(container);
            window.historyMgr.recordState(true);
            this.closeDropdowns();
        },

        applyHyperlink: function (url) {
            this.restoreSelection();
            var sel = window.getSelection();
            var container = getActiveEditContainer();
            if (!container) {
                alert('请先将光标放置在文本框内！');
                return;
            }

            if (sel.isCollapsed) {
                var linkHtml = '<a href="' + url + '" target="_blank" style="text-decoration:underline;text-underline-offset:4px;text-decoration-thickness:2px;text-decoration-skip-ink:none;">' + url + '</a>';
                document.execCommand('insertHTML', false, linkHtml);
            } else {
                document.execCommand('createLink', false, url);
                this.restoreSelection();
                sel = window.getSelection();
                if (sel.rangeCount > 0) {
                    var range = sel.getRangeAt(0);
                    var el = range.commonAncestorContainer;
                    var parent = el.nodeType === 3 ? el.parentNode : el;
                    if (parent && parent.tagName === 'A') {
                        parent.setAttribute('target', '_blank');
                    } else if (parent) {
                        parent.querySelectorAll('a').forEach(function (a) {
                            if (a.getAttribute('href') === url) {
                                a.setAttribute('target', '_blank');
                            }
                        });
                    }
                }
            }
            container.normalize();
            window.PersistenceLayer.saveElement(container);
            window.historyMgr.recordState(true);
            this.closeDropdowns();
        },

        removeHyperlink: function () {
            this.restoreSelection();
            if (!getActiveEditContainer()) return;
            document.execCommand('unlink');
            window.PersistenceLayer.saveElement(getActiveEditContainer());
            window.historyMgr.recordState(true);
            this.closeDropdowns();
        },

        applyForeColor: function (c) {
            this.restoreSelection();
            document.execCommand('foreColor', false, c);
            window.historyMgr.recordState(true);
        },

        applyHiliteColor: function (c) {
            this.restoreSelection();
            if (!document.execCommand('hiliteColor', false, c)) document.execCommand('backColor', false, c);
            window.historyMgr.recordState(true);
        },

        /** 修改字体 */
        applyFontFamily: function (fontFamily) {
            var container = getActiveEditContainer();
            if (!container) return;

            var sel = window.getSelection();
            if (sel.rangeCount > 0 && !sel.isCollapsed) {
                this.restoreSelection();
                document.execCommand('fontName', false, fontFamily);
            } else {
                container.style.fontFamily = fontFamily;
            }

            window.PersistenceLayer.saveElement(container);
            window.historyMgr.recordState(true);
            this.closeDropdowns();
        },

        /** 智能双模式字号调节 */
        changeFontSize: function (dir) {
            this.restoreSelection();
            var container = getActiveEditContainer();
            if (!container) return;

            var sel = window.getSelection();
            var hasSelection = sel.rangeCount > 0 && !sel.isCollapsed;

            if (hasSelection) {
                var range = sel.getRangeAt(0);
                var anchor = sel.anchorNode;
                var anchorEl = anchor ? (anchor.nodeType === 3 ? anchor.parentNode : anchor) : null;
                var rtNode = anchorEl ? anchorEl.closest('rt') : null;

                if (rtNode) {
                    var cs = parseFloat(window.getComputedStyle(rtNode).fontSize);
                    rtNode.style.fontSize = Math.max(8, cs + dir * 2) + 'px';
                } else {
                    var currentFS = parseFloat(window.getComputedStyle(container).fontSize);
                    if (anchorEl && anchorEl !== container) {
                        currentFS = parseFloat(window.getComputedStyle(anchorEl).fontSize);
                    }
                    var span = document.createElement('span');
                    span.style.fontSize = Math.max(10, currentFS + dir * 2) + 'px';
                    span.style.lineHeight = 'inherit';
                    span.appendChild(range.extractContents());
                    range.insertNode(span);

                    var newRange = document.createRange();
                    newRange.selectNodeContents(span);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                    this.savedRange = newRange;
                }
            } else {
                var currentSize = parseFloat(window.getComputedStyle(container).fontSize);
                container.style.fontSize = Math.max(10, currentSize + dir * 2) + 'px';

                container.querySelectorAll('*').forEach(function (child) {
                    if (!child.closest('rt') && child.style && child.style.fontSize) {
                        child.style.removeProperty('font-size');
                    }
                });
            }

            window.PersistenceLayer.saveElement(container);
            window.historyMgr.recordState(true);
        },

        /** Ruby 顶标批注 */
        addRubyAnnotation: function () {
            if (!window.editorCore || !window.editorCore.isActive) return;
            var sel = window.getSelection();
            if (!sel.rangeCount || sel.isCollapsed) { alert('请先用鼠标选中一段文字！'); return; }

            var range = sel.getRangeAt(0);
            var ancestor = range.commonAncestorContainer;
            var editableNode = (ancestor.nodeType === 3 ? ancestor.parentNode : ancestor).closest('[data-edit-id]');
            if (!editableNode) return;

            var ruby = document.createElement('ruby');
            var fragment = range.extractContents();
            var rt = document.createElement('rt');
            rt.innerText = '批注';

            // 智能吸色特性
            var bgCol = null;
            var ctxNode = ancestor.nodeType === 3 ? ancestor.parentNode : ancestor;
            var bgElem = ctxNode.closest && ctxNode.closest('[style*="background-color"]');
            if (bgElem) {
                bgCol = bgElem.style.backgroundColor;
            } else if (fragment.querySelector) {
                var childBg = fragment.querySelector('[style*="background-color"]');
                if (childBg) bgCol = childBg.style.backgroundColor;
            }
            if (!bgCol && fragment.childNodes) {
                for (var i = 0; i < fragment.childNodes.length; i++) {
                    var ch = fragment.childNodes[i];
                    if (ch.nodeType === 1 && ch.style && ch.style.backgroundColor) {
                        bgCol = ch.style.backgroundColor; break;
                    }
                }
            }
            if (bgCol) {
                var match = bgCol.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
                if (match) {
                    rt.style.color = 'rgb(' + match[1] + ',' + match[2] + ',' + match[3] + ')';
                }
            }

            ruby.appendChild(fragment);
            ruby.appendChild(rt);
            range.insertNode(ruby);

            window.PersistenceLayer.saveElement(editableNode);
            window.historyMgr.recordState(true);
            sel.removeAllRanges();
        },

        toggleDropdown: function (id) {
            document.querySelectorAll('.rt-dropdown-menu.show').forEach(function (m) { if (m.id !== id) m.classList.remove('show'); });
            if (!id) return;
            var m = document.getElementById(id);
            if (m) m.classList.toggle('show');
        },

        closeDropdowns: function () {
            document.querySelectorAll('.rt-dropdown-menu.show').forEach(function (m) { m.classList.remove('show'); });
        },

        /** 初始化调色板 */
        _initPalettes: function () {
            var self = this;
            var tc = ['#000000', '#2C3E50', '#7F8C8D', '#FD79A8', '#E74C3C', '#E67E22', '#F1C40F', '#2ECC71', '#1ABC9C', '#3498DB', '#9B59B6', '#FFFFFF'];
            var hc = [
                'rgba(231, 76, 60, 0.4)', 'rgba(230, 126, 34, 0.4)', 'rgba(241, 196, 15, 0.4)', 'rgba(46, 204, 113, 0.4)',
                'rgba(52, 152, 219, 0.4)', 'rgba(155, 89, 182, 0.4)', 'rgba(253, 121, 168, 0.4)', 'rgba(255, 255, 255, 0.4)',
                'transparent'
            ];
            var tg = document.querySelector('.text-colors');
            var bg = document.querySelector('.bg-colors');
            if (bg) bg.style.gridTemplateColumns = 'repeat(5, 1fr)';

            if (tg) tc.forEach(function (c) {
                var s = document.createElement('div'); s.className = 'color-swatch'; s.style.background = c;
                if (c === '#FFFFFF') s.style.border = '1px solid #ccc';
                s.addEventListener('pointerdown', function (e) { e.preventDefault(); self.applyForeColor(c); });
                tg.appendChild(s);
            });

            if (bg) hc.forEach(function (c) {
                var s = document.createElement('div'); s.className = 'color-swatch';
                if (c === 'transparent') {
                    s.style.background = '#fff';
                    s.innerHTML = '<div style="width:100%;height:100%;background:linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%),linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%);background-size:8px 8px;background-position:0 0,4px 4px;border-radius:3px;"></div>';
                } else { s.style.background = c; }
                s.addEventListener('pointerdown', function (e) { e.preventDefault(); self.applyHiliteColor(c === 'transparent' ? 'rgba(0,0,0,0)' : c); });
                bg.appendChild(s);
            });

            // 下划线颜色面板
            var ulGrid = document.querySelector('.ul-colors');
            if (ulGrid) {
                var removeBtn = document.createElement('div');
                removeBtn.className = 'color-swatch';
                removeBtn.style.background = '#fff';
                removeBtn.title = '去掉下划线';
                removeBtn.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:14px;color:#e74c3c;font-weight:bold;">&#10005;</div>';
                removeBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); self.removeUnderline(); });
                ulGrid.appendChild(removeBtn);
                tc.forEach(function (c) {
                    if (c === '#FFFFFF') return;
                    var s = document.createElement('div'); s.className = 'color-swatch'; s.style.background = c;
                    s.addEventListener('pointerdown', function (e) { e.preventDefault(); self.applyUnderlineColor(c); });
                    ulGrid.appendChild(s);
                });
            }

            document.addEventListener('pointerdown', function (e) {
                if (!e.target.closest('.rt-dropdown')) self.closeDropdowns();
            });
        },

        /** 获取当前容器的真实 Computed 字体数组 */
        _getCurrentFontTuple: function () {
            var target = document.body;
            var sel = window.getSelection();
            if (sel.rangeCount > 0 && !sel.isCollapsed) {
                var anchor = sel.anchorNode;
                var el = anchor ? (anchor.nodeType === 3 ? anchor.parentNode : anchor) : null;
                if (el && el.closest && el.closest('[data-edit-id]')) target = el;
            } else {
                var container = getActiveEditContainer();
                if (container) target = container;
            }

            var ff = window.getComputedStyle(target).fontFamily;
            var fonts = ff.split(',').map(function (s) { return s.trim().replace(/['"]/g, ''); });
            var eng = fonts[0] || 'sans-serif';
            var zh = fonts.length > 1 ? fonts[1] : fonts[0];
            return { eng: eng, zh: zh };
        },

        /** 光标移动时监测是否处于"拥有富文本格式"的状态 */
        syncFormatButtons: function () {
            var removeFormatBtn = document.querySelector('[data-cmd="removeFormat"]');
            if (!removeFormatBtn) return;
            var svg = removeFormatBtn.querySelector('svg');
            if (!svg) return;

            var hasFormat = false;
            var sel = window.getSelection();
            if (sel.rangeCount > 0) {
                var range = sel.getRangeAt(0);
                var node = range.commonAncestorContainer;
                if (node.nodeType === 3) node = node.parentNode;

                function isFormattedNode(el) {
                    if (el.nodeType !== 1) return false;
                    if (el.getAttribute('contenteditable') === 'false' ||
                        (el.classList && (el.classList.contains('box-controls') || el.classList.contains('del-btn') || el.classList.contains('drag-handle') || el.classList.contains('rs-handle')))) {
                        return false;
                    }
                    var tag = el.tagName.toLowerCase();
                    if (['b', 'i', 'u', 's', 'em', 'strong', 'font', 'ruby', 'rt'].indexOf(tag) !== -1) return true;
                    if (el.style) {
                        if (el.style.color || el.style.backgroundColor || el.style.fontFamily ||
                            el.style.fontSize || el.style.textDecoration || el.style.textDecorationLine ||
                            el.style.fontWeight || el.style.fontStyle) {
                            return true;
                        }
                    }
                    return false;
                }

                var walkNode = node;
                while (walkNode && walkNode.nodeType === 1 && !walkNode.hasAttribute('contenteditable')) {
                    if (isFormattedNode(walkNode)) { hasFormat = true; break; }
                    walkNode = walkNode.parentNode;
                }

                if (!hasFormat && !range.collapsed) {
                    var frag = range.cloneContents();
                    var children = frag.querySelectorAll('*');
                    for (var i = 0; i < children.length; i++) {
                        if (isFormattedNode(children[i])) { hasFormat = true; break; }
                    }
                }
            }

            svg.style.color = hasFormat ? '#2C3E50' : '#BDC3C7';
            svg.style.transition = 'color 0.2s ease';
        },

        /** 实时同步状态按钮内的文字 */
        syncFontIndicators: function () {
            var engBtn = document.getElementById('engFontToggle');
            var zhBtn = document.getElementById('zhFontToggle');
            if (!engBtn || !zhBtn) return;
            var t = this._getCurrentFontTuple();
            var engRaw = t.eng;
            var zhRaw = t.zh;

            function getShortName(raw, isZhFallback) {
                var name = raw;
                if (/YaHei/i.test(raw)) name = '微软雅黑';
                else if (/SimSun|Songti/i.test(raw)) name = '宋体';
                else if (/KaiTi/i.test(raw)) name = '楷体';
                else if (/FangSong/i.test(raw)) name = '仿宋';
                else if (/DengXian/i.test(raw)) name = '等线';
                else if (/PingFang/i.test(raw)) name = '苹方';
                else if (raw === 'sans-serif') name = isZhFallback ? '默认黑体' : '默认体系';
                else if (raw === 'serif') name = isZhFallback ? '默认宋体' : '默认衬线';
                else if (name.length > 12) name = name.substring(0, 10) + '..';
                return name;
            }

            var isPrimaryChinese = /[\u4e00-\u9fa5]|YaHei|SimSun|KaiTi|FangSong|Songti|PingFang|DengXian/i.test(engRaw);

            engBtn.innerHTML = '<span style="font-weight:700;">' + getShortName(engRaw, false) + '</span>';
            if (isPrimaryChinese) {
                zhBtn.innerHTML = '<span style="font-size:0.9em;font-weight:500;color:var(--editor-text-muted);">(同左)</span>';
            } else {
                zhBtn.innerHTML = '<span style="font-weight:700;">' + getShortName(zhRaw, true) + '</span>';
            }
        },

        applyMixedFontFamily: function (fontFamily, type) {
            var t = this._getCurrentFontTuple();
            var engRaw = t.eng;
            var zhRaw = t.zh;

            var mergedFontStr = '';
            if (type === 'eng') {
                mergedFontStr = fontFamily + ", '" + zhRaw + "', sans-serif";
                var isChinese = /[\u4e00-\u9fa5]|YaHei|SimSun|KaiTi|FangSong|Songti|PingFang|DengXian/i.test(fontFamily);
                if (isChinese) mergedFontStr = fontFamily;
            } else if (type === 'zh') {
                mergedFontStr = "'" + engRaw + "', " + fontFamily + ", sans-serif";
            }

            var container = getActiveEditContainer();
            var sel = window.getSelection();

            if (sel.rangeCount > 0 && !sel.isCollapsed && container) {
                this.restoreSelection();
                document.execCommand('fontName', false, mergedFontStr);
            } else {
                document.documentElement.style.setProperty('--font-body', mergedFontStr);
                document.documentElement.style.setProperty('--font-display', mergedFontStr);
                document.body.style.fontFamily = mergedFontStr;
                document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(function (h) {
                    h.style.fontFamily = mergedFontStr;
                });
            }

            if (container) window.PersistenceLayer.saveElement(container);
            window.historyMgr.recordState(true);
            this.closeDropdowns();
            this.syncFontIndicators();
        },

        /** 初始化字体选择菜单 */
        _initFontMenu: function (menuId, fontsArray, type) {
            var self = this;
            var menu = document.getElementById(menuId);
            if (!menu) return;

            fontsArray.forEach(function (f) {
                var opt = document.createElement('div');
                opt.className = 'font-option';
                opt.textContent = f.name;
                if (!f.family) {
                    opt.style.cssText = 'background:none; text-align:center; color:var(--editor-text-muted); font-size:10px; cursor:default;';
                } else {
                    opt.style.fontFamily = f.family;
                    opt.addEventListener('pointerdown', function (e) {
                        e.preventDefault();
                        self.applyMixedFontFamily(f.family, type);
                    });
                    opt.addEventListener('mouseenter', function () {
                        if (f.family) opt.style.fontFamily = f.family;
                    });
                }
                menu.appendChild(opt);
            });

            menu.addEventListener('wheel', function(e) {
                e.stopPropagation();
            }, { passive: true });
        }
    };

    window.RichTextToolbar = RichTextToolbar;

})();
