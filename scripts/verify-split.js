#!/usr/bin/env node
/* ===========================================
   VERIFY-SPLIT.JS
   代码拆分校验脚本
   用途：在将一个大文件拆分为多个小文件后，验证拆分的完整性
   用法：
     node scripts/verify-split.js \
       --original assets/runtime/quiz-annotation-runtime.js \
       --parts quiz-core,quiz-fragments,...,quiz-init \
       --outdir assets/runtime/zone2-quiz-annotation
   =========================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// ==========================================
// 命令行参数解析
// ==========================================
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--original' && i + 1 < args.length) opts.original = args[++i];
    else if (args[i] === '--parts' && i + 1 < args.length) opts.parts = args[++i].split(',');
    else if (args[i] === '--outdir' && i + 1 < args.length) opts.outdir = args[++i];
    else if (args[i] === '--original-css' && i + 1 < args.length) opts.originalCss = args[++i];
    else if (args[i] === '--parts-css' && i + 1 < args.length) opts.partsCss = args[++i].split(',');
    else if (args[i] === '--outdir-css' && i + 1 < args.length) opts.outdirCss = args[++i];
    else {
      console.error(`未知参数: ${args[i]}`);
      process.exit(1);
    }
  }

  if (!opts.original && !opts.originalCss) {
    console.error('用法: node scripts/verify-split.js --original <文件> --parts <模块列表> --outdir <目录>');
    console.error('  或: node scripts/verify-split.js --original-css <文件> --parts-css <模块列表> --outdir-css <目录>');
    process.exit(1);
  }

  return opts;
}

// ==========================================
// 函数定义提取器
// ==========================================
function extractFunctionNames(source) {
  const names = new Set();
  const patterns = [
    /(?:^|\s|;)function\s+(\w+)\s*\(/gm,           // function xxx(
    /(?:^|\s|;)(\w+)\s*=\s*function\s*\(/gm,        // xxx = function(
    /(?:^|\s|;)(\w+)\s*:\s*function\s*\(/gm,        // xxx: function( (对象方法)
    /QA\.(\w+)\s*=\s*function\s*\(/gm,               // QA.xxx = function(
    /QA\.(\w+)\s*=\s*(?:function)?\s*\(/gm,          // QA.xxx = (function)?(
    /window\.QA\s*=\s*window\.QA\s*\|\|\s*\{\};?\s*(?:\/\*[\s\S]*?\*\/)?\s*(?:var\s+)?QA\.(\w+)\s*=\s*function/gm
  ];

  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      names.add(match[1]);
    }
  });

  return names;
}

// ==========================================
// 提取模块标记边界
// ==========================================
function extractModuleBoundaries(source) {
  const modules = [];
  const moduleStartRegex = /\/\*\s*={3,}\s*MODULE:\s*(\w[\w-]*)\s*={3,}\s*\*\//g;
  let match;

  while ((match = moduleStartRegex.exec(source)) !== null) {
    modules.push({
      name: match[1],
      startLine: source.substring(0, match.index).split('\n').length
    });
  }

  return modules;
}

// ==========================================
// 提取自执行代码（文件末尾的 IIFE 启动代码）
// ==========================================
function extractIIFESource(source) {
  // 查找常见的自执行模式
  const iifePatterns = [
    /if\s*\(\s*document\.readyState\s*===\s*'loading'\s*\)\s*\{[\s\S]*?document\.addEventListener\s*\(\s*['"]DOMContentLoaded['"]/, // DOMContentLoaded
    /if\s*\(\s*typeof\s+window\.addSlideChangeListener\s*===\s*['"]function['"]\s*\)/, // 页面切换监听
    /function\s+autoInit\s*\(\)/, // autoInit
    /window\.initQuizAnnotation\s*=/, // 暴露 API
    /window\.stripDynamicQAElements\s*=/  // 暴露 API
  ];

  const found = [];
  iifePatterns.forEach(pattern => {
    if (pattern.test(source)) found.push(pattern);
  });
  return found;
}

// ==========================================
// 统计函数名在字符串中出现的次数（用于检测重复定义）
// ==========================================
function countFunctionOccurrences(source, funcName) {
  const regex = new RegExp(
    `(?:function\\s+${funcName}\\s*\\(|QA\\.${funcName}\\s*=\\s*function|${funcName}\\s*=\\s*function)`,
    'g'
  );
  const matches = source.match(regex);
  return matches ? matches.length : 0;
}

// ==========================================
// 主校验逻辑
// ==========================================
function verifySplit(originalPath, partNames, outdir) {
  const absOriginal = path.resolve(projectRoot, originalPath);
  if (!fs.existsSync(absOriginal)) {
    console.error(`❌ 原文件不存在: ${absOriginal}`);
    process.exit(1);
  }

  const originalSource = fs.readFileSync(absOriginal, 'utf-8');
  const originalLines = originalSource.split('\n').length;
  const originalFuncs = extractFunctionNames(originalSource);
  const iifePatterns = extractIIFESource(originalSource);

  console.log(`\n📄 原文件: ${originalPath} (${originalLines} 行)`);
  console.log(`   检测到 ${originalFuncs.size} 个函数定义`);
  console.log(`   检测到 ${iifePatterns.length} 个自执行/启动代码模式\n`);

  // 读取所有新文件
  const absOutdir = path.resolve(projectRoot, outdir);
  const newFiles = [];
  let partErrors = [];

  partNames.forEach(name => {
    // 尝试 .js 和 .css 后缀
    const jsFile = path.join(absOutdir, `${name}.js`);
    const cssFile = path.join(absOutdir, `${name}.css`);

    if (fs.existsSync(jsFile)) {
      newFiles.push({ name, path: jsFile, type: 'js' });
    } else if (fs.existsSync(cssFile)) {
      newFiles.push({ name, path: cssFile, type: 'css' });
    } else {
      partErrors.push(`   文件未找到: ${name}.js (在 ${outdir} 中)`);
    }
  });

  if (partErrors.length > 0) {
    console.error('❌ 部分新文件缺失:');
    partErrors.forEach(e => console.error(e));
    return false;
  }

  // 分析每个新文件
  const fileAnalyses = [];
  let totalNewLines = 0;
  const allNewFuncs = new Map(); // funcName → [fileNames]

  newFiles.forEach(({ name, path: filePath }) => {
    const source = fs.readFileSync(filePath, 'utf-8');
    const lines = source.split('\n').length;
    const funcs = extractFunctionNames(source);
    const hasIIFE = extractIIFESource(source).length > 0;

    totalNewLines += lines;

    funcs.forEach(fn => {
      if (!allNewFuncs.has(fn)) allNewFuncs.set(fn, []);
      allNewFuncs.get(fn).push(name);
    });

    fileAnalyses.push({ name, lines, funcs: funcs.size, hasIIFE });
  });

  // ===== 校验 1：行数守恒 =====
  console.log('─── 校验 1: 行数守恒 ───');
  const lineDiff = Math.abs(originalLines - totalNewLines);
  // 允许 ±10% 的行数波动（新增注释、空行等）
  const lineThreshold = originalLines * 0.1;
  if (lineDiff <= lineThreshold) {
    console.log(`  ✅ 原文件 ${originalLines} 行 ≈ 新文件 ${totalNewLines} 行 (差异 ${lineDiff})`);
  } else {
    console.error(`  ❌ 行数不匹配: 原文件 ${originalLines} 行, 新文件 ${totalNewLines} 行 (差异 ${lineDiff})`);
    return false;
  }

  // ===== 校验 2：函数完整性 =====
  console.log('\n─── 校验 2: 函数完整性 ───');
  let missingFuncs = [];
  let extraFuncs = [];

  originalFuncs.forEach(fn => {
    if (!allNewFuncs.has(fn)) {
      missingFuncs.push(fn);
    }
  });

  allNewFuncs.forEach((files, fn) => {
    if (!originalFuncs.has(fn)) {
      extraFuncs.push(fn);
    }
  });

  if (missingFuncs.length === 0) {
    console.log(`  ✅ 所有 ${originalFuncs.size} 个原文件函数已迁移`);
  } else {
    console.error(`  ❌ 以下函数未在任何新文件中找到 (${missingFuncs.length} 个):`);
    missingFuncs.forEach(fn => console.error(`     - ${fn}`));
    return false;
  }

  // ===== 校验 3：无重复定义 =====
  console.log('\n─── 校验 3: 无重复函数定义 ───');
  let duplicates = [];
  allNewFuncs.forEach((files, fn) => {
    if (files.length > 1) {
      duplicates.push({ fn, files });
    }
  });

  if (duplicates.length === 0) {
    console.log('  ✅ 无重复函数定义');
  } else {
    console.error(`  ❌ 以下函数出现在多个文件中 (${duplicates.length} 个):`);
    duplicates.forEach(({ fn, files }) => {
      console.error(`     - ${fn}: ${files.join(', ')}`);
    });
    return false;
  }

  // ===== 校验 4：自执行代码迁移 =====
  console.log('\n─── 校验 4: 自执行/启动代码迁移 ───');
  const filesWithIIFE = fileAnalyses.filter(f => f.hasIIFE);

  if (iifePatterns.length === 0) {
    console.log('  ⚠️ 原文件未检测到自执行模式，跳过此项检查');
  } else if (filesWithIIFE.length > 0) {
    console.log(`  ✅ 自执行/启动代码已迁移到: ${filesWithIIFE.map(f => f.name).join(', ')}`);
  } else {
    console.error(`  ❌ 原文件包含 ${iifePatterns.length} 个自执行模式，但新文件中未找到`);
    return false;
  }

  // ===== 输出摘要 =====
  console.log('\n─── 新文件摘要 ───');
  fileAnalyses.forEach(({ name, lines, funcs, hasIIFE }) => {
    const tags = [];
    if (hasIIFE) tags.push('含启动代码');
    console.log(`  ${name}.js: ${lines} 行, ${funcs} 个函数${tags.length ? ' (' + tags.join(', ') + ')' : ''}`);
  });

  console.log(`\n✅ 拆分校验通过！`);
  return true;
}

// ==========================================
// 执行
// ==========================================
const opts = parseArgs();
let allPass = true;

if (opts.original && opts.parts && opts.outdir) {
  const result = verifySplit(opts.original, opts.parts, opts.outdir);
  if (!result) allPass = false;
}

if (opts.originalCss && opts.partsCss && opts.outdirCss) {
  console.log('\n========================================');
  const result = verifySplit(opts.originalCss, opts.partsCss, opts.outdirCss);
  if (!result) allPass = false;
}

if (!allPass) {
  console.error('\n❌ 校验未通过，请根据上述错误修复后重新运行。');
  process.exit(1);
} else {
  console.log('\n✅ 全部校验通过！\n');
}
