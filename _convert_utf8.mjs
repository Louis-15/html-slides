import fs from 'node:fs';

const filepath = '组件展示全览.html';
let content = fs.readFileSync(filepath, 'utf8');

// Strip BOM if present
if (content.charCodeAt(0) === 0xFEFF) {
  content = content.slice(1);
}

fs.writeFileSync(filepath, content, 'utf8');

const verify = fs.readFileSync(filepath);
console.log('First 4 bytes hex:', verify.slice(0, 4).toString('hex'));
console.log('Expected (UTF-8 no BOM): 3c21444f');
console.log('Match:', verify.slice(0, 4).toString('hex') === '3c21444f');
console.log('Size:', verify.length, 'bytes');
