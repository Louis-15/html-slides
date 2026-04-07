/**
 * HTML-Slides 涂鸦放映模式全接管引擎 (Doodle Mode)
 * 基于原生 SVG 矢量层，支持手写板悬空激光笔与自动平滑抗锯齿
 */

(function () {
    var DoodleManager = {
        isActive: false,
        currentTool: 'laser', // 'laser' | 'pen' | 'highlighter' | 'magic'
        currentColor: '#e74c3c',
        isDrawing: false,
        currentPath: null,
        currentSvg: null,
        points: [], // 用于二次贝塞尔曲线的采点集
        svgLayers: new Map(), // slideElement => svgElement
        laserCursor: null,
        uiContainer: null,
        strokeWidths: {
            'laser': 0,
            'pen': 4,
            'highlighter': 16,
            'magic': 4
        },

        init: function () {
            var self = this;
            this._injectUI();
            this._injectLaserCursor();
            this._bindEvents();

            // 如果已经有了 PersistenceLayer 补丁支持，恢复数据
            window.addEventListener('load', function() {
                self._restoreDoodles();
            });
        },

        _injectUI: function () {
            var self = this;

            // 1. 左下角的悬浮触发按钮
            var toggleBtn = document.createElement('button');
            toggleBtn.className = 'edit-toggle doodle-entry-btn'; // 复用编辑按钮的样式并特殊化
            toggleBtn.id = 'doodleToggleBtn';
            toggleBtn.title = '涂鸦模式 (中键切入)';
            toggleBtn.innerHTML = '<svg viewBox="0 0 24 24" style="width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/></svg>';
            // 设置位置到左下角，隔离编辑模式。强制 top: auto 和 pointer-events: auto 覆盖原编辑按钮遗留的安全锁定！
            toggleBtn.style.cssText = 'position: fixed; top: auto; left: 20px; bottom: 20px; z-index: 9999; display: flex; opacity: 0.6; pointer-events: auto; transition: all 0.3s ease; text-decoration: none;';
            toggleBtn.onmouseover = function() { toggleBtn.style.opacity = '1'; };
            toggleBtn.onmouseout = function() { if(!self.isActive) toggleBtn.style.opacity = '0.6'; };
            document.body.appendChild(toggleBtn);

            toggleBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                self.toggleDoodleMode();
            });
            this.toggleBtn = toggleBtn;

            // 2. 左侧贴边工具栏 (覆盖 min-width 强制复原宽度)
            var tb = document.createElement('div');
            tb.id = 'doodleToolbar';
            tb.className = 'rich-toolbar doodle-toolbar'; // 先复用主题
            tb.style.cssText = 'position: fixed; left: 20px; top: 50%; transform: translateY(-50%); flex-direction: column; opacity: 0; pointer-events: none; transition: 0.3s; z-index: 10000; width: 60px; min-width: 60px !important; padding: 10px; gap: 12px; display: flex; align-items: center; border-radius: 12px; cursor: default;';
            
            var tools = [
                { id: 'magic', icon: '<svg viewBox="0 0 24 24"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>', title: '临时铅笔 (高频指引/5秒挥发)' },
                { id: 'pen', icon: '<svg viewBox="0 0 24 24"><g transform="rotate(-90 12 12)"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></g></svg>', title: '钢笔 (标准原笔迹书写)' },
                { id: 'highlighter', icon: '<svg viewBox="0 0 24 24"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>', title: '荧光笔 (半透明覆盖强调)' },
                { id: 'eraser', icon: '<svg viewBox="0 0 24 24"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>', title: '橡皮擦 (擦除碰到的单条笔画)' }
            ];

            tools.forEach(function(t) {
                var btn = document.createElement('button');
                btn.className = 'rt-btn doodle-tool-btn';
                btn.innerHTML = t.icon;
                btn.title = t.title;
                btn.setAttribute('data-tool', t.id);
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    self.setTool(t.id);
                });
                tb.appendChild(btn);
            });

            // 颜色块选择器 (小圆点阵列)
            var colors = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#fd79a8', '#ffffff'];
            var colorGrid = document.createElement('div');
            colorGrid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; margin-bottom: 8px; width: 100%;';
            colors.forEach(function(c) {
                var cb = document.createElement('div');
                // 默认形态：添加极其微弱的一层阴影区分白底即可
                cb.style.cssText = 'width: 16px; height: 16px; border-radius: 50%; cursor: pointer; transition: all 0.2s; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.1); background: ' + c;
                cb.setAttribute('data-color', c);
                cb.addEventListener('click', function(e) {
                    e.stopPropagation();
                    self.setColor(c);
                    Array.from(colorGrid.children).forEach(function(kid) { 
                        kid.style.transform = 'scale(1)'; 
                        kid.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.1)'; 
                    });
                    cb.style.transform = 'scale(1.2)';
                    // 多层投影叠加法：一层纯白描边兜底 + 一层灰色外扩高光 + 一层物理悬浮深阴影
                    cb.style.boxShadow = '0 0 0 2px #fff, 0 0 0 3px rgba(0,0,0,0.2), 0 3px 8px rgba(0,0,0,0.25)';
                });
                colorGrid.appendChild(cb);
            });
            // 默认选中第一个颜色
            colorGrid.children[0].style.transform = 'scale(1.2)';
            colorGrid.children[0].style.boxShadow = '0 0 0 2px #fff, 0 0 0 3px rgba(0,0,0,0.2), 0 3px 8px rgba(0,0,0,0.25)';
            tb.appendChild(colorGrid);

            // 清理按钮 (替换为用户指定的原生极简 Lucide 线框扫把图标)
            var clearCurrentBtn = document.createElement('button');
            clearCurrentBtn.className = 'rt-btn rt-danger';
            clearCurrentBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-brush-cleaning-icon lucide-brush-cleaning"><path d="m16 22-1-4"/><path d="M19 14a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2h-3a1 1 0 0 1-1-1V4a2 2 0 0 0-4 0v5a1 1 0 0 1-1 1H6a2 2 0 0 0-2 2v1a1 1 0 0 0 1 1"/><path d="M19 14H5l-1.973 6.767A1 1 0 0 0 4 22h16a1 1 0 0 0 .973-1.233z"/><path d="m8 22 1-4"/></svg>';
            clearCurrentBtn.title = '清空本页';
            clearCurrentBtn.style.marginTop = '8px';
            clearCurrentBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                self.clearCurrentSlide();
            });
            tb.appendChild(clearCurrentBtn);

            var clearAllBtn = document.createElement('button');
            clearAllBtn.className = 'rt-btn rt-danger';
            clearAllBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
            clearAllBtn.title = '清空全站涂鸦';
            clearAllBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (confirm('核弹级警告！确定要彻底抹除整个演示文稿所有页面的涂鸦吗？此操作不可逆！')) {
                    self.clearAllSlides();
                }
            });
            tb.appendChild(clearAllBtn);

            document.body.appendChild(tb);
            this.uiContainer = tb;
            this.setTool('magic'); // 默认使用排名第一的临时笔，因为脱机演讲用得最多
        },

        _injectLaserCursor: function () {
            var cursor = document.createElement('div');
            cursor.id = 'doodleLaserPointer';
            // 取消写死的宽高与形状。增加物理形变缓冲 (切记避开 left/top 否则光标会延迟失控)
            cursor.style.cssText = 'position:fixed; pointer-events:none; z-index:99999; display:none; opacity:0; transition: width 0.2s, height 0.2s, border-radius 0.2s, transform 0.2s, box-shadow 0.2s, background-color 0.2s, opacity 0.15s; mix-blend-mode: normal;';
            document.body.appendChild(cursor);
            this.laserCursor = cursor;
            this._updateCursorStyle(); // 注入装载后立刻赋予初始形体
        },

        _bindEvents: function () {
            var self = this;

            // 快捷键: 中键呼出、Esc 退出
            document.addEventListener('mousedown', function (e) {
                if (e.button === 1) { // 鼠标滚轮中键
                    e.preventDefault();
                    self.toggleDoodleMode();
                }
            });
            document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape' && self.isActive) {
                    self.toggleDoodleMode();
                }
            });

            // 当进入涂鸦状态后，鼠标只要在画面里移动，激光笔就跟随（手写板悬停特性）
            document.addEventListener('pointermove', function(e) {
                if (!self.isActive) return;
                self.laserCursor.style.left = e.clientX + 'px';
                self.laserCursor.style.top = e.clientY + 'px';

                if (e.target.closest && e.target.closest('.doodle-toolbar, .doodle-entry-btn, .nav-dots, .rich-toolbar')) {
                    self.laserCursor.style.opacity = '0';
                    document.documentElement.style.cursor = 'auto'; // 在 UI 上恢复系统光标
                } else {
                    self.laserCursor.style.opacity = '1';
                    document.documentElement.style.cursor = 'none'; // 在画板上隐藏系统光标
                }

                if (self.isDrawing) self._onPointerMove(e);
            }, { passive: false });

            // 涂鸦起步
            document.addEventListener('pointerdown', self._onPointerDown.bind(self), { passive: false });
            document.addEventListener('pointerup', self._onPointerUp.bind(self));
            document.addEventListener('pointercancel', self._onPointerUp.bind(self));

            // 全局拦截所有的默认滑动/翻页物理触发，保留 .nav-dots
            document.addEventListener('wheel', function(e) {
                if (self.isActive) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }, { capture: true, passive: false });

            document.addEventListener('touchmove', function(e) {
                if (self.isActive && !e.target.closest('.nav-dots') && !e.target.closest('.doodle-toolbar')) {
                    e.preventDefault();
                }
            }, { passive: false });
            
            // 防止右键菜单干扰 (涂鸦模式下按右键可以作为快捷退出, 这里使用双击右键)
            var lastRbTime = 0;
            document.addEventListener('contextmenu', function(e) {
                if (self.isActive) {
                    var now = Date.now();
                    if (now - lastRbTime < 400) {
                        e.preventDefault();
                        self.toggleDoodleMode();
                    }
                    lastRbTime = now;
                }
            });
        },

        toggleDoodleMode: function () {
            this.isActive = !this.isActive;
            var body = document.body;

            if (this.isActive) {
                // 如果目前是编辑排版模式，强制其退出
                if (window.editorCore && window.editorCore.isActive) {
                    window.editorCore.toggleEditMode();
                }
                
                // 居中吸附当前最可能是视口的 slide (借用 editor-utils 几何判断)
                if (window._editorUtils) {
                    var targetIndex = window._editorUtils.getCurrentSlideIndex();
                    var slides = window._editorUtils.getAllSlides();
                    if (slides[targetIndex]) {
                        slides[targetIndex].scrollIntoView({ behavior: 'auto', block: 'center' });
                    }
                }
                
                body.classList.add('doodle-mode');
                this.toggleBtn.classList.add('active');
                this.toggleBtn.style.opacity = '1';
                
                this.uiContainer.style.opacity = '1';
                this.uiContainer.style.pointerEvents = 'auto';
                this.uiContainer.style.transform = 'translateY(-50%) translateX(0)';

                this.laserCursor.style.color = this.currentColor;
                this.laserCursor.style.display = 'block';
                // 初始化时如果鼠标还没有动，先显示系统光标防懵圈
                document.documentElement.style.cursor = 'auto';
            } else {
                body.classList.remove('doodle-mode');
                this.toggleBtn.classList.remove('active');
                this.toggleBtn.style.opacity = '0.6';
                
                this.uiContainer.style.opacity = '0';
                this.uiContainer.style.pointerEvents = 'none';
                this.uiContainer.style.transform = 'translateY(-50%) translateX(-20px)';
                
                this.laserCursor.style.display = 'none';
                document.documentElement.style.cursor = 'auto';
            }
        },

        setTool: function (tool) {
            this.currentTool = tool;
            Array.from(this.uiContainer.querySelectorAll('.doodle-tool-btn')).forEach(function(btn) {
                btn.classList.toggle('active', btn.getAttribute('data-tool') === tool);
            });
            this._updateCursorStyle();
        },

        setColor: function (c) {
            this.currentColor = c;
            this._updateCursorStyle();
        },

        _updateCursorStyle: function () {
            if (!this.laserCursor) return;
            var c = this.currentColor;
            var tool = this.currentTool;

            // 恢复所有默认基准物态
            this.laserCursor.innerHTML = ''; // 清除内嵌 SVG
            this.laserCursor.style.backgroundColor = 'transparent';
            this.laserCursor.style.backgroundImage = 'none';
            this.laserCursor.style.boxShadow = 'none';
            this.laserCursor.style.border = 'none';
            this.laserCursor.style.borderRadius = '50%';
            this.laserCursor.style.transform = 'translate(-50%, -50%)';

            if (tool === 'magic' || tool === 'pen') {
                // 笔类：精致的小发光点
                this.laserCursor.style.width = '8px';
                this.laserCursor.style.height = '8px';
                this.laserCursor.style.backgroundColor = c;
                this.laserCursor.style.boxShadow = '0 0 6px ' + c + ', 0 0 10px ' + c + ', inset 0 0 2px #fff';
            } else if (tool === 'highlighter') {
                // 荧光笔：和物理宽度一比一精确契合的半透明遮罩圆，不发光
                var size = this.strokeWidths['highlighter'] + 'px';
                this.laserCursor.style.width = size;
                this.laserCursor.style.height = size;
                this.laserCursor.style.backgroundColor = c;
                this.laserCursor.style.boxShadow = '0 0 0 1px rgba(0,0,0,0.1)';
            } else if (tool === 'eraser') {
                // 橡皮擦：返璞归真，直接使用 UI 层面的原生极简线框 SVG 图标，大小精确匹配
                this.laserCursor.style.width = '24px';
                this.laserCursor.style.height = '24px';
                this.laserCursor.style.color = '#546e7a'; // 保持统一的沉稳蓝灰主题色
                this.laserCursor.style.borderRadius = '0';
                // 纯净灌入 SVG，不再附带任何物理背景框
                this.laserCursor.innerHTML = '<svg viewBox="0 0 24 24" style="width:100%;height:100%;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>';
            }
        },

        getCurrentSvg: function () {
            var slides = document.querySelectorAll('.slide');
            var currSlide = null;
            var minDiff = Infinity;
            
            // 物理测算：寻找其 top 最贴近视口顶部（0）的 slide（无视任何样式标志）
            for (var i = 0; i < slides.length; i++) {
                var rect = slides[i].getBoundingClientRect();
                var diff = Math.abs(rect.top);
                if (diff < minDiff) {
                    minDiff = diff;
                    currSlide = slides[i];
                }
            }
            if (!currSlide && slides.length > 0) currSlide = slides[0];
            if (!currSlide) return null;

            var existingSvg = currSlide.querySelector('svg.doodle-layer');
            if (existingSvg) return existingSvg;

            var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute('class', 'doodle-layer');
            svg.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 400;';
            currSlide.appendChild(svg);
            return svg;
        },

        _onPointerDown: function (e) {
            if (!this.isActive || e.button !== 0) return;
            // 点击的是 UI 或者 导航圆点，不触发绘图
            if (e.target.closest('.doodle-toolbar') || e.target.closest('.doodle-entry-btn') || e.target.closest('.nav-dots') || e.target.closest('.rich-toolbar')) {
                return;
            }
            
            e.preventDefault();
            this.isDrawing = true;
            this.currentSvg = this.getCurrentSvg();
            if (!this.currentSvg) return;

            // 物理橡皮擦模式（点击即进行 24x24 极高致密网格探测，81点无漏斗全覆盖）
            if (this.currentTool === 'eraser') {
                for (var dx = -12; dx <= 12; dx += 3) {
                    for (var dy = -12; dy <= 12; dy += 3) {
                        var el = document.elementFromPoint(e.clientX + dx, e.clientY + dy);
                        if (el && el.tagName.toLowerCase() === 'path' && el.closest('svg.doodle-layer')) {
                            el.remove();
                        }
                    }
                }
                return;
            }

            this.points = [{ x: e.clientX, y: e.clientY }];

            var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("fill", "none");
            path.setAttribute("stroke", this.currentColor);
            path.setAttribute("stroke-linecap", "round");
            path.setAttribute("stroke-linejoin", "round");

            // 工具属性派发
            if (this.currentTool === 'pen') {
                path.setAttribute("stroke-width", this.strokeWidths.pen);
            } else if (this.currentTool === 'highlighter') {
                path.setAttribute("stroke-width", this.strokeWidths.highlighter);
                path.setAttribute("opacity", "0.4");
                path.style.mixBlendMode = "multiply"; // 荧光笔覆盖混合物理效果
            } else if (this.currentTool === 'magic') {
                path.setAttribute("stroke-width", this.strokeWidths.magic);
                path.style.transition = "opacity 0.8s ease-in"; // 渐隐过程 0.8秒
            }

            path.setAttribute("d", "M" + e.clientX + " " + e.clientY + " L" + e.clientX + " " + (e.clientY+0.1)); // 戳一个点

            this.currentSvg.appendChild(path);
            this.currentPath = path;
        },

        _onPointerMove: function (e) {
            if (!this.isDrawing) return;

            // 物理橡皮擦模式（拖拽路径经过即擦除，极高致密网格模拟真实 24x24 碰撞面）
            if (this.currentTool === 'eraser') {
                for (var dx = -12; dx <= 12; dx += 3) {
                    for (var dy = -12; dy <= 12; dy += 3) {
                        var el = document.elementFromPoint(e.clientX + dx, e.clientY + dy);
                        if (el && el.tagName.toLowerCase() === 'path' && el.closest('svg.doodle-layer')) {
                            el.remove();
                        }
                    }
                }
                return;
            }

            if (!this.currentPath) return;

            var x = e.clientX;
            var y = e.clientY;

            // Shift键触发硬直线绘制
            if (e.shiftKey && this.points.length > 0) {
                var startPt = this.points[0];
                this.currentPath.setAttribute("d", "M" + startPt.x + " " + startPt.y + " L" + x + " " + y);
                // 强制修正中途点只保留起点和此刻点
                this.points = [startPt, { x: x, y: y }];
                return;
            }

            this.points.push({ x: x, y: y });

            // 二次贝塞尔平滑算法
            var p1, p2;
            var d = "M" + this.points[0].x + " " + this.points[0].y;
            for (var i = 1; i < this.points.length - 1; i++) {
                p1 = this.points[i];
                p2 = this.points[i + 1];
                // 中间控制点平滑
                var midX = (p1.x + p2.x) / 2;
                var midY = (p1.y + p2.y) / 2;
                d += " Q " + p1.x + " " + p1.y + " " + midX + " " + midY;
            }
            d += " L " + x + " " + y;

            this.currentPath.setAttribute("d", d);
        },

        _onPointerUp: function (e) {
            if (!this.isDrawing) return;
            this.isDrawing = false;

            if (this.currentPath && this.currentTool === 'magic') {
                // 5 秒后触发溶解
                var magicPath = this.currentPath;
                setTimeout(function() {
                    magicPath.style.opacity = '0';
                    setTimeout(function() {
                        magicPath.remove();
                    }, 800); // 留出 0.8秒 的 css 动画时间再移除 DOM
                }, 5000);
            }

            this.currentPath = null;
            this.points = [];

            // 触发存盘
            this.saveDoodles();
        },

        clearCurrentSlide: function () {
            var svg = this.getCurrentSvg();
            if (svg) svg.innerHTML = '';
            this.saveDoodles();
        },

        clearAllSlides: function () {
            document.querySelectorAll('svg.doodle-layer').forEach(function(svg) {
                svg.innerHTML = '';
            });
            this.saveDoodles();
        },

        /** Persistence 支持 **/
        saveDoodles: function () {
            // 利用 slide-index 记录每页的 SVG innerHTML
            var map = {};
            document.querySelectorAll('.slide').forEach(function(slide, idx) {
                var svg = slide.querySelector('svg.doodle-layer');
                if (svg && svg.innerHTML.trim() !== '') {
                    map[idx] = svg.innerHTML;
                }
            });
            try { localStorage.setItem('ds_doodles_' + location.pathname, JSON.stringify(map)); } catch(e){}
        },

        _restoreDoodles: function () {
            try {
                var stored = localStorage.getItem('ds_doodles_' + location.pathname);
                if (!stored) return;
                var map = JSON.parse(stored);
                var slides = document.querySelectorAll('.slide');
                Object.keys(map).forEach(function(idx) {
                    var slide = slides[idx];
                    if (!slide) return;
                    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                    svg.setAttribute('class', 'doodle-layer');
                    svg.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 400;';
                    svg.innerHTML = map[idx];
                    slide.appendChild(svg);
                });
            } catch(e) {}
        }
    };

    // 暴露到全局，与 editorCore 等层级持平
    window.DoodleManager = DoodleManager;

    // 自启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { DoodleManager.init(); });
    } else {
        DoodleManager.init();
    }

})();
