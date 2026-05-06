import { execSync } from 'node:child_process';
const out = execSync('git diff -- qa-test-all-types.html', { encoding: 'utf8' });

const checks = [
  ['[A] <html>+<head> collapsed', l => /^\+.*<html.*<head/.test(l)],
  ['[A] & → &amp;', l => l.includes('&amp;')],
  ['[A] data-scrollable=""', l => l.includes('data-scrollable=""')],
  ['[A] scripts no newlines between', l => /script><\/script/.test(l) && !l.startsWith('---')],
  ['[A] </body></html> no newline', l => /<\/body><\/html/.test(l) && l.startsWith('+')],
  ['[A] comment between scripts lost', l => l.includes('JS 外链')],
  ['[B] qa-blank-value span', l => l.includes('qa-blank-value')],
  ['[B] qa-blank-answer style', l => l.includes('display: none') && l.includes('blank-answer')],
  ['[B] qa-blank-user ___ lost', l => l.includes('qa-blank-user')],
  ['[B] qa-matching-passage-slot', l => l.includes('qa-matching-passage-slot')],
  ['[B] show-correct-answer', l => l.includes('show-correct-answer')],
];

for (const [name, fn] of checks) {
  const r = out.split('\n').filter(l => fn(l)).length;
  if (r > 0) console.log(`  ${r} hits — ${name}`);
}
console.log(`\nTotal: ${out.split('\n').filter(l => l.startsWith('-') && !l.startsWith('---')).length} -lines, ${out.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).length} +lines`);
