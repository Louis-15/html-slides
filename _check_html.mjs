import fs from 'node:fs';
const files = ['组件展示全览.html', 'qa-test-all-types.html'];
for (const f of files) {
  const h = fs.readFileSync(f, 'utf8');
  const links = h.match(/<link[^>]+>/g) || [];
  const scripts = h.match(/<script[^>]+src="[^"]*"/g) || [];
  console.log(`\n=== ${f} ===`);
  console.log('CSS links:');
  links.forEach(l => console.log('  ', l));
  console.log('JS scripts:');
  scripts.forEach(s => console.log('  ', s));
  console.log('Has __BASELINE__:', h.includes('__BASELINE__'));
  console.log('Has </head>:', h.includes('</head>'));
  console.log('Has <body:', h.includes('<body'));
  console.log('Has deck:', h.includes('id="deck"'));
}
