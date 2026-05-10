/* ===========================================
   SPEAKER-NOTES.JS
   讲者备注 — 控制台输出教师讲稿
   依赖：navigation.js（使用 slides, current, total）
   将 showSpeakerNotes 注册到 __slideRuntime__
   =========================================== */

var RT = window.__slideRuntime__;

function showSpeakerNotes(index) {
  var slide = slides[index];
  var notesEl = slide.querySelector('script.slide-notes') || slide.querySelector('[class="slide-notes"]');
  console.clear();
  if (notesEl) {
    try {
      var n = JSON.parse(notesEl.textContent);
      var title = n.title || 'Slide ' + (index + 1);
      var script = n.script || '';
      var notes = n.notes || [];
      var parts = ['\n%c\u{1F4CB} Slide ' + (index + 1) + '/' + total + ': ' + title + '\n'];
      var styles = ['font-size:16px;font-weight:bold;color:#2563eb;'];
      if (script) {
        parts.push('\n%c' + script + '\n');
        styles.push('font-size:14px;color:#d97706;line-height:1.6;');
      }
      if (notes.length) {
        notes.forEach(function(note) {
          parts.push('\n  %c\u2022%c ' + note);
          styles.push('color:#16a34a;font-size:14px;');
          styles.push('color:#16a34a;font-size:14px;');
        });
        parts.push('\n');
      }
      parts.push('\n\n\n\n%cUse HTMLSlides presenter app for notes editing and more features.\nhtmlslides.com\n');
      styles.push('font-size:10px;color:#9ca3af;');
      console.log.apply(console, [parts.join('')].concat(styles));
    } catch (e) { /* JSON 解析失败时静默跳过 */ }
  } else {
    console.log('%c\u{1F4CB} Slide ' + (index + 1) + '/' + total + '\n\n%cNo speaker notes for this slide.',
      'font-size:16px;font-weight:bold;color:#2563eb;', 'font-size:12px;color:#9ca3af;');
  }
}

/* 注册到 __slideRuntime__ */
RT.showSpeakerNotes = showSpeakerNotes;

/* ===========================================
   全局初始化
   所有模块加载完毕后统一启动
   =========================================== */
autoTagSteppables();
ensureSlidePager();
updateUI();
buildInteractionQueue(0);
finishSlideAnimationsForEditorMode(slides[current]);

/* 首页讲者备注 */
setTimeout(function() { showSpeakerNotes(0); }, 500);
