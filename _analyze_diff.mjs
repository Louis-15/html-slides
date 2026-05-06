import { execSync } from 'node:child_process';
const out = execSync('git diff -- qa-test-all-types.html', { encoding: 'utf8' });

const removed = [];
const added = [];
const lines = out.split('\n');
lines.forEach(line => {
  if (line.startsWith('-') && !line.startsWith('---')) removed.push(line.substring(1));
  if (line.startsWith('+') && !line.startsWith('+++')) added.push(line.substring(1));
});

// Check specific patterns
const checks = [
  ['& → &amp;', l => l.includes('&amp;') && l.includes('link')],
  ['data-scrollable=""', l => l.includes('data-scrollable=""')],
  ['<html><head> collapsed', l => l.includes('<html') && l.includes('<head')],
  ['style="display: none" on blank-answer', l => l.includes('qa-blank-answer') && l.includes('display: none')],
  ['qa-blank-value span added', l => l.includes('qa-blank-value')],
  ['qa-blank-user restructured', l => l.includes('qa-blank-user') && !l.includes('qa-blank-value')],
  ['No closing newline', l => l.includes('</html>') || l.includes('</body>')],
  ['Script tag formatting', l => l.includes('script src=')],
  ['qa-note-content changed (actual edit)', l => l.includes('qa-note-content')],
  ['text-anchor fragment changed', l => l.includes('qa-note-fragment') || l.includes('qa-fragment')],
];

for (const [name, fn] of checks) {
  const rCount = removed.filter(fn).length;
  const aCount = added.filter(fn).length;
  if (rCount + aCount > 0) {
    console.log(`  ${name}: -${rCount} / +${aCount}`);
  }
}

// Also check: what percentage of changes are just whitespace/formatting?
const onlyWhitespaceDiff = (a, b) => a.replace(/\s+/g, ' ') === b.replace(/\s+/g, ' ');
let formattingOnly = 0;
for (let i = 0; i < Math.min(removed.length, added.length); i++) {
  if (onlyWhitespaceDiff(removed[i], added[i])) formattingOnly++;
}
console.log(`\n  Purely whitespace/formatting changes: ~${formattingOnly} pairs`);
console.log(`  Total - lines: ${removed.length}, + lines: ${added.length}`);
