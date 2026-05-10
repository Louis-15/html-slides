/* ===========================================
   CHART-INTEGRATION.JS
   Chart.js 集成 — 主题拾色、创建/销毁、生命周期管理
   依赖：navigation.js（使用 slides）
   将 createChart/destroyChart 注册到 __slideRuntime__
   =========================================== */

var RT = window.__slideRuntime__;

function getThemePalette() {
  var s = getComputedStyle(document.documentElement);
  function get(v) { return s.getPropertyValue(v).trim(); }
  return {
    text: get('--text') || get('--text-primary') || '#e6edf3',
    textMuted: get('--text-muted') || get('--text-secondary') || '#8b949e',
    textDim: get('--text-dim') || '#6e7681',
    border: get('--border') || 'rgba(255,255,255,0.07)',
    bgCard: get('--bg-card') || get('--bg-secondary') || '#131720',
    colors: [
      get('--accent-blue') || '#58a6ff',
      get('--accent-green') || '#3fb950',
      get('--accent-orange') || '#f0883e',
      get('--accent-purple') || '#a371f7',
      get('--accent-yellow') || '#d29922',
      get('--accent-red') || '#f85149'
    ]
  };
}

var chartInstances = {};
RT.chartInstances = chartInstances;

function createChart(canvasId) {
  if (typeof Chart === 'undefined') return;
  var el = document.getElementById(canvasId);
  if (!el) return;
  var configEl = document.querySelector('[data-chart-config="' + canvasId + '"]');
  if (!configEl) return;

  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
    delete chartInstances[canvasId];
  }

  try {
    var palette = getThemePalette();
    var userConfig = JSON.parse(configEl.textContent);
    var chartType = userConfig.type;

    userConfig.data.datasets.forEach(function(ds, i) {
      var color = palette.colors[i % palette.colors.length];
      if (!ds.backgroundColor) {
        if (['pie', 'doughnut', 'polarArea'].indexOf(chartType) !== -1) {
          ds.backgroundColor = palette.colors.slice(0, ds.data.length);
          ds.borderColor = palette.bgCard;
          ds.borderWidth = 2;
        } else {
          ds.backgroundColor = color + '33';
          ds.borderColor = color;
          ds.borderWidth = 2;
        }
      }
      if (!ds.pointBackgroundColor && ['line', 'radar', 'scatter', 'bubble'].indexOf(chartType) !== -1) {
        ds.pointBackgroundColor = color;
      }
    });

    var themedOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 800, easing: 'easeOutQuart' },
      plugins: {
        legend: {
          labels: { color: palette.textMuted, font: { family: "'Inter', sans-serif", size: 12 } }
        },
        tooltip: {
          backgroundColor: palette.bgCard,
          titleColor: palette.text,
          bodyColor: palette.textMuted,
          borderColor: palette.border,
          borderWidth: 1
        }
      }
    };

    if (['bar', 'line', 'scatter', 'bubble'].indexOf(chartType) !== -1) {
      themedOptions.scales = {
        x: {
          ticks: { color: palette.textDim, font: { family: "'Inter', sans-serif", size: 11 } },
          grid: { color: palette.border }
        },
        y: {
          ticks: { color: palette.textDim, font: { family: "'Inter', sans-serif", size: 11 } },
          grid: { color: palette.border }
        }
      };
    }

    if (userConfig.options) {
      Object.assign(themedOptions.plugins, userConfig.options.plugins || {});
      Object.assign(themedOptions, userConfig.options, { plugins: themedOptions.plugins });
    }

    chartInstances[canvasId] = new Chart(el, {
      type: chartType,
      data: userConfig.data,
      options: themedOptions
    });
  } catch (e) {
    el.parentElement.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px;">Chart unavailable</p>';
  }
}

function destroyChart(canvasId) {
  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
    delete chartInstances[canvasId];
  }
}

/* 注册到 __slideRuntime__ */
RT.createChart = createChart;
RT.destroyChart = destroyChart;

/* 首页图表初始化 */
if (typeof Chart !== 'undefined') {
  setTimeout(function() {
    slides[0].querySelectorAll('.chart-container canvas').forEach(function(c) {
      createChart(c.id);
    });
  }, 400);
}
