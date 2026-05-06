import fs from 'node:fs';

function checkEncoding(filepath) {
  const buf = fs.readFileSync(filepath);
  const hex = buf.slice(0, 4).toString('hex');
  const hasBom = buf[0] === 0xFF && buf[1] === 0xFE;
  console.log(`File: ${filepath}`);
  console.log(`  Size: ${buf.length} bytes`);
  console.log(`  First 4 bytes hex: ${hex}`);
  console.log(`  Has UTF-16LE BOM: ${hasBom}`);
  console.log();
}

checkEncoding('组件展示全览.html');
checkEncoding('qa-test-all-types.html');
checkEncoding('高考英语阅读实战.html');
