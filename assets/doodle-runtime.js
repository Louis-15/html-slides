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
            'magic': 6
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
            var colors = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#34495e', '#ecf0f1'];
            var colorGrid = document.createElement('div');
            colorGrid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; margin-bottom: 8px; width: 100%;';
            colors.forEach(function(c) {
                var cb = document.createElement('div');
                cb.style.cssText = 'width: 16px; height: 16px; border-radius: 50%; cursor: pointer; transition: transform 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.2); background: ' + c;
                cb.setAttribute('data-color', c);
                cb.addEventListener('click', function(e) {
                    e.stopPropagation();
                    self.setColor(c);
                    Array.from(colorGrid.children).forEach(function(kid) { kid.style.transform = 'scale(1)'; kid.style.border = 'none'; });
                    cb.style.transform = 'scale(1.2)';
                    cb.style.border = '2px solid white';
                });
                colorGrid.appendChild(cb);
            });
            // 默认选中第一个颜色
            colorGrid.children[0].style.transform = 'scale(1.2)';
            colorGrid.children[0].style.border = '2px solid white';
            tb.appendChild(colorGrid);

            // 清理按钮 (直接植入世界顶级开源图库 Phosphor Icons 官方原装 Broom，绝对无懈可击)
            var clearCurrentBtn = document.createElement('button');
            clearCurrentBtn.className = 'rt-btn rt-danger';
            clearCurrentBtn.innerHTML = '<svg viewBox="0 0 256 256" style="fill:currentColor;stroke:transparent;"><path d="M235.5,216.81c-22.56-11-35.5-34.58-35.5-64.8V134.73a15.94,15.94,0,0,0-10.09-14.87L165,110a8,8,0,0,1-4.48-10.34l21.32-53a28,28,0,0,0-16.1-37,28.14,28.14,0,0,0-35.82,16,.61.61,0,0,0,0,.12L108.9,79a8,8,0,0,1-10.37,4.49L73.11,73.14A15.89,15.89,0,0,0,55.74,76.8C34.68,98.45,24,123.75,24,152a111.45,111.45,0,0,0,31.18,77.53A8,8,0,0,0,61,232H232a8,8,0,0,0,3.5-15.19ZM67.14,88l25.41,10.3a24,24,0,0,0,31.23-13.45l21-53c2.56-6.11,9.47-9.27,15.43-7a12,12,0,0,1,6.88,15.92L145.69,93.76a24,24,0,0,0,13.43,31.14L184,134.73V152c0,.33,0,.66,0,1L55.77,101.71A108.84,108.84,0,0,1,67.14,88Zm48,128a87.53,87.53,0,0,1-24.34-42,8,8,0,0,0-15.49,4,105.16,105.16,0,0,0,18.36,38H64.44A95.54,95.54,0,0,1,40,152a85.9,85.9,0,0,1,7.73-36.29l137.8,55.12c3,18,10.56,33.48,21.89,45.16Z"/></svg>';
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
            // 实体化背景和阴影（颜色将在 setColor 里被直接刷新）
            cursor.style.cssText = 'position:fixed; width:14px; height:14px; border-radius:50%; pointer-events:none; z-index:99999; transform:translate(-50%, -50%); display:none; opacity:0; transition: opacity 0.15s; mix-blend-mode: normal;';
            document.body.appendChild(cursor);
            this.laserCursor = cursor;
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
        },

        setColor: function (c) {
            this.currentColor = c;
            if (this.laserCursor) {
                // 抛弃 currentColor 绑定，直接由 JS 高强度直写物理颜色
                this.laserCursor.style.backgroundColor = c;
                this.laserCursor.style.boxShadow = '0 0 10px ' + c + ', 0 0 20px ' + c + ', inset 0 0 4px #fff';
            }
        },

        getCurrentSvg: function () {
            var slides = document.querySelectorAll('.slide');
            var currentIdx = window.presentation ? window.presentation.currentSlideIndex : 0;
            var currSlide = slides[currentIdx];
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

            // 物理橡皮擦模式（点击即擦除）
            if (this.currentTool === 'eraser') {
                var el = document.elementFromPoint(e.clientX, e.clientY);
                if (el && el.tagName.toLowerCase() === 'path' && el.closest('svg.doodle-layer')) {
                    el.remove();
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

            // 物理橡皮擦模式（拖拽路径经过即擦除）
            if (this.currentTool === 'eraser') {
                var el = document.elementFromPoint(e.clientX, e.clientY);
                if (el && el.tagName.toLowerCase() === 'path' && el.closest('svg.doodle-layer')) {
                    el.remove();
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
