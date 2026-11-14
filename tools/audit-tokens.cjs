/**
 * 令牌撞色审计 —— 找出「background 与 color 被设成同一个值」的情况。
 *
 * 那种配对会让文字**完全隐形**（底色与文字色同色），而界面看起来只是"少了点什么"，
 * 极难定位。本工具自动扫出全部撞色组合。
 *
 * 原理：
 *   1. 扫描 DSH 宿主所有客户端包里形如 `background: X; color: Y` 的规则，收集配对；
 *   2. 读本插件 client.js 里覆盖的令牌值；
 *   3. 交叉比对，报出「底色令牌与文字令牌被覆盖成同一个值」的组合。
 *
 * 误报排除：宿主故意用 `color-mix(in srgb, X 10%, transparent)` 做淡色底 + 同色文字
 *           （chip 配色，可读）—— 底色里含 transparent / color-mix 即排除。
 *
 * 用法：
 *   ⚠️ 必须用 **Electron 的 node** 跑 —— DSH 装在 app.asar 里，普通 Node 读不了 asar 内部：
 *      set ELECTRON_RUN_AS_NODE=1
 *      "<DSH 路径>\DeepSeek Harness.exe" tools\audit-tokens.cjs
 *   或（Linux/macOS）：
 *      ELECTRON_RUN_AS_NODE=1 "<DSH 路径>/DeepSeek Harness" tools/audit-tokens.cjs
 *
 *   路径可覆盖：DSH_SCOPE=<...>\resources\app.asar\dsh\node_modules\@deepseek-ai
 *
 * 退出码：0 = 无冲突，1 = 有冲突，2 = 环境不对。
 */
const fs = require('node:fs');
const path = require('node:path');

const SCOPE = process.env.DSH_SCOPE
  || 'C:\\Users\\20466\\scoop\\apps\\deepseek-harness-pre\\current\\resources\\app.asar\\dsh\\node_modules\\@deepseek-ai';
const PLUGIN = path.resolve(__dirname, '..', 'client.js');

if (!process.versions.electron) {
  console.error('★ 必须在 Electron 的 node 下运行（ELECTRON_RUN_AS_NODE=1），');
  console.error('  否则读不了 app.asar 内部的宿主包。');
  console.error('  例：set ELECTRON_RUN_AS_NODE=1 && "DeepSeek Harness.exe" tools\\audit-tokens.cjs');
  process.exit(2);
}

if (!fs.existsSync(SCOPE)) {
  console.error(`找不到 DSH 宿主包目录：${SCOPE}`);
  console.error('请设置 DSH_SCOPE 环境变量指向 <安装目录>/resources/app.asar/dsh/node_modules/@deepseek-ai');
  process.exit(2);
}

// ── 1. 收集宿主的 (底色, 文字色) 配对 ────────────────────────────────────
const PAIRS = new Map();
for (const d of fs.readdirSync(SCOPE)) {
  const f = path.join(SCOPE, d, 'lib', 'client.js');
  if (!fs.existsSync(f)) continue;
  let t;
  try { t = fs.readFileSync(f, 'utf8'); } catch { continue; }
  const pkg = d;
  const re = /background(?:-color)?:([^;{}]{0,90});[^}]{0,90}?color:([^;{}]{0,90})/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    const bg = m[1].trim();
    const fg = m[2].trim();
    if (!bg.includes('var(--dsw') || !fg.includes('var(--dsw')) continue;
    const key = bg + '  ||  ' + fg;
    if (!PAIRS.has(key)) PAIRS.set(key, pkg);
  }
}

// ── 2. 读本插件覆盖的令牌 ────────────────────────────────────────────────
const mine = new Map();
const src = fs.readFileSync(PLUGIN, 'utf8');
for (const m of src.matchAll(/(--dsw-[a-z0-9-]+):\s*([^;!\n]+?)(?:\s*!important)?\s*;/gi)) {
  mine.set(m[1], m[2].trim().replace(/\s+/g, ' '));
}

console.log(`宿主令牌配对 ${PAIRS.size} 组；本插件覆盖 ${mine.size} 个令牌\n`);
console.log('=== ★ 冲突：底色与文字色被设成同色 ===');

let bad = 0;
for (const [key, pkg] of PAIRS) {
  const [bg, fg] = key.split('  ||  ');
  if (/transparent/.test(bg) || /color-mix/.test(bg)) continue;   // 淡色底 + 同色文字：宿主有意为之
  const bgTok = (bg.match(/var\((--dsw-[a-z0-9-]+)\)/) || [])[1];
  const fgTok = (fg.match(/var\((--dsw-[a-z0-9-]+)\)/) || [])[1];
  if (!bgTok || !fgTok) continue;
  const bv = mine.get(bgTok);
  const fv = mine.get(fgTok);
  if (bv && fv && bv.replace(/\s/g, '') === fv.replace(/\s/g, '')) {
    console.log(`  ★ 底色 ${bgTok} = ${bv}`);
    console.log(`      文字 ${fgTok} = ${fv}     [${pkg}]`);
    bad++;
  }
}

if (bad) {
  console.log(`\n共 ${bad} 处冲突 —— 这些地方的文字会是隐形的。`);
  process.exit(1);
}
console.log('  无冲突 ✓');
process.exit(0);
