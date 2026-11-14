/**
 * 源码级模板字符串守卫 —— 在生成 CSS 之前抓那两类致命事故。
 *
 * `node --check` 抓不到它们：注释里多一个反引号往往**仍能解析成合法程序**，
 * 只是模板被提前闭合、后半段 CSS 变成了 JS 字符串字面量，于是样式静默消失。
 * 桩环境验证要到运行期才报，而且报的是 ReferenceError，指不到真正的行。
 *
 * 两条规则（都是我在这个项目里真实犯过的）：
 *   ① **模板字符串内部的 CSS 注释里不许出现反引号**
 *      —— 它会提前闭合模板。注释外的反引号是合法定界符，不报。
 *   ② **CSS 注释里不许再嵌套 斜杠星号**
 *      —— 内层终止符会提前收尾，后面半句变成非法 CSS 被丢弃。
 *
 * 用法：node tools/check-template.cjs
 * 退出码：0 = 干净，1 = 有问题。
 */
const fs = require('node:fs');
const path = require('node:path');

const FILE = path.resolve(__dirname, '..', 'client.js');
const src = fs.readFileSync(FILE, 'utf8');

// 状态机：code | template | cssComment
let state = 'code';
let line = 1;
let templateCount = 0;
let inTemplateLines = 0;
let lineHadTemplate = false;
const problems = [];
let commentOpenLine = 0;

for (let i = 0; i < src.length; i++) {
  const c = src[i];
  const n = src[i + 1];

  if (c === '\n') {
    if (lineHadTemplate) inTemplateLines++;
    lineHadTemplate = state === 'template' || state === 'cssComment';
    line++;
    continue;
  }

  if (state === 'code') {
    if (c === '/' && n === '/') {                 // 行注释：跳到行尾
      while (i < src.length && src[i] !== '\n') i++;
      line++;
      lineHadTemplate = false;
      continue;
    }
    if (c === '/' && n === '*') { state = 'codeComment'; i++; continue; }
    if (c === '`') { state = 'template'; templateCount++; continue; }
    continue;
  }

  if (state === 'codeComment') {                   // JS 注释，不影响模板判定
    if (c === '*' && n === '/') { state = 'code'; i++; }
    continue;
  }

  if (state === 'template') {
    if (c === '\\') { i++; continue; }
    if (c === '/' && n === '*') { state = 'cssComment'; commentOpenLine = line; i++; continue; }
    if (c === '`') { state = 'code'; continue; }    // 合法闭合
    continue;
  }

  if (state === 'cssComment') {
    if (c === '*' && n === '/') { state = 'template'; i++; continue; }
    if (c === '/' && n === '*') {
      problems.push({
        line,
        msg: `CSS 注释内部又出现 /*（起始于 L${commentOpenLine}）—— 会提前终止注释`,
        text: src.slice(Math.max(0, i - 40), i + 40).replace(/\n/g, ' ').trim(),
      });
      i++;
      continue;
    }
    if (c === '`') {
      problems.push({
        line,
        msg: 'CSS 注释里出现反引号 —— 会提前闭合模板字符串，导致样式全部消失',
        text: src.slice(Math.max(0, i - 60), i + 60).replace(/\n/g, ' ').trim(),
      });
      // 按真实语义：反引号闭合模板
      state = 'template';
      continue;
    }
    continue;
  }
}

console.log(`模板字符串 ${templateCount} 个，跨 ${inTemplateLines} 行 / 全文 ${line} 行\n`);
if (problems.length) {
  for (const p of problems) {
    console.log(`  ★ L${p.line}  ${p.msg}`);
    console.log(`      …${p.text}…`);
  }
  console.log(`\n★ 发现 ${problems.length} 处结构问题`);
  process.exit(1);
}
console.log('模板字符串结构干净 ✓');
process.exit(0);
