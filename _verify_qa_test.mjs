import fs from 'node:fs';

const html = fs.readFileSync('qa-test-all-types.html', 'utf8');

const slides = html.match(/data-slide="(\d+)"/g) || [];
const types = html.match(/data-reading-type="(\w+)"/g) || [];
const hasBaseline = html.includes('__BASELINE__');
const hasAnStore = html.includes('annotation-store.js');
const hasRuntime = html.includes('quiz-annotation-runtime.js');
const hasHasQuiz = (html.match(/has-quiz/g) || []).length;

console.log('=== QA Test File Verification ===');
console.log('Slides:', slides);
console.log('Reading types:', types);
console.log('has-quiz count:', hasHasQuiz);
console.log('Has __BASELINE__:', hasBaseline);
console.log('Has annotation-store.js:', hasAnStore);
console.log('Has quiz-annotation-runtime.js:', hasRuntime);
console.log('Has editor-persistence.js:', html.includes('editor-persistence.js'));
console.log('Total size:', (fs.statSync('qa-test-all-types.html').size / 1024).toFixed(1), 'KB');
console.log('');
console.log('=== Expected ===');
console.log('Slides: 0(matching), 1(single), 2(blank), 3(analysis), 4(ending) = 6 slides total');
console.log('Types: matching, single, blank, analysis');
console.log('has-quiz: 3 (matching + single + blank)');
console.log('analysis: no has-quiz');
