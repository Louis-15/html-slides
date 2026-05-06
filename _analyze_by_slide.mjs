import { execSync } from 'node:child_process';

const out = execSync('git diff -- qa-test-all-types.html', { encoding: 'utf8' });

// Count changes per slide section in the diff
const slides = [
  { name: 'Slide 0 (title)', marker: 'SLIDE 0' },
  { name: 'Slide 1 (matching)', marker: 'SLIDE 1' },
  { name: 'Slide 2 (single)', marker: 'SLIDE 2' },
  { name: 'Slide 3 (blank)', marker: 'SLIDE 3' },
  { name: 'Slide 4 (analysis)', marker: 'SLIDE 4' },
  { name: 'Slide 5 (ending)', marker: 'SLIDE 5' },
  { name: '<head> section', marker: '<meta charset' },
  { name: 'Footer (scripts)', marker: 'JS 外链' },
];

let currentSlide = 'Before head';
const bySlide = {};
slides.forEach(s => bySlide[s.name] = { added: 0, removed: 0 });

for (const line of out.split('\n')) {
  for (const s of slides) {
    if (line.includes(s.marker)) {
      currentSlide = s.name;
      break;
    }
    if (line.includes('SLIDE') && s.name.includes('SLIDE')) {
      const num = line.match(/SLIDE (\d)/);
      if (num && s.name.includes('Slide ' + num[1])) {
        currentSlide = s.name;
      }
    }
  }
  const isAdd = line.startsWith('+') && !line.startsWith('+++');
  const isDel = line.startsWith('-') && !line.startsWith('---');
  if (isAdd) bySlide[currentSlide] = bySlide[currentSlide] || { added: 0, removed: 0 };
  if (isDel) bySlide[currentSlide] = bySlide[currentSlide] || { added: 0, removed: 0 };
  if (isAdd) bySlide[currentSlide].added++;
  if (isDel) bySlide[currentSlide].removed++;
}

// Also categorize by change type
const types = {
  '___ text lost': l => l.includes('qa-blank-user') && (l.includes('></sup>') || !l.includes('___')),
  'outerHTML formatting': l => l.includes('<html') && l.includes('<head'),
  'outerHTML formatting2': l => l.includes('&amp;'),
  'outerHTML formatting3': l => l.includes('body></html'),
  'outerHTML formatting4': l => !l.includes('qa-') && !l.includes('note-') && !l.includes('slide-') && (l.includes('><') || l.trim() === ''),
  'comment lost': l => l.includes('JS 外链'),
  'Actual content change': l => l.includes('note-content') || l.includes('text-anchor') || l.includes('qa-fragment'),
};

const typeCounts = {};
for (const line of out.split('\n')) {
  const isChange = (line.startsWith('+') && !line.startsWith('+++')) || (line.startsWith('-') && !line.startsWith('---'));
  if (!isChange) continue;
  for (const [type, fn] of Object.entries(types)) {
    if (fn(line)) {
      typeCounts[type] = (typeCounts[type] || 0) + 1;
      break;
    }
  }
}

console.log('=== Changes by Slide ===');
for (const [name, counts] of Object.entries(bySlide)) {
  if (counts.added + counts.removed > 0) {
    console.log(`  ${name}: -${counts.removed} / +${counts.added} (${counts.added + counts.removed} total)`);
  }
}

console.log('\n=== Changes by Type ===');
for (const [type, count] of Object.entries(typeCounts)) {
  console.log(`  ${type}: ${count}`);
}
