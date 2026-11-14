/**
 * dsh-theme-glass —— 浏览器侧实现。
 *
 * 配色体系 **逐条移植自 wallpaper-engine v1.4.2** 的 packages/glass/src/glass-css.js
 * （从 GitHub 源码读的，不是从打包产物猜的）。核心是它那套
 * **可读性下限（readability floor）** 配方：
 *
 *     surface = color-mix(in srgb,
 *                 <主题釉色>            <floor>%,
 *                 <玻璃色 @ alpha×(1−floor)>  (100−floor)%)
 *
 * color-mix 在预乘空间按权重插值，权重会乘上操作数自身 alpha ⇒ 这条声明恰好等于
 * 「釉色 @floor 压在一个 alpha=玻璃透明度的玻璃层之上」，于是
 *     有效 alpha = floor + a_glass × (1 − floor) ≥ floor
 * —— 玻璃怎么调都不会把文字掉到不可读。这是整套观感的地基，不是装饰。
 *
 * 与壁纸版的差别（用户口径）：**没有壁纸**。画布是一块纯灰（用户：
 * 「不需要渐变了，灰色+毛玻璃就可以」），没有图片、没有视频、没有解码。
 * 玻璃的霜仍然是真的 backdrop-filter —— 它在面板压住正文时（输入框压消息、
 * 代码块压滚动内容）真实可见；压在纯色画布上时 blur 是恒等变换，这是物理事实。
 *
 * 移植过来的常量（与源码逐字一致，改任何一个都要同步改注释）：
 *   READABILITY_FLOOR      0.45（浅）/ 0.59（深）
 *   --we-glass-alpha       max(0.10, 0.25 − glassAlpha/100 × 0.15)
 *   --we-blur              44px
 *   --we-saturate          1.30   （GLASS_SATURATE：与模糊半径解耦的材质常量）
 *   --we-glass-brightness  1.04
 *   --we-border-alpha      0.35
 *   --we-glass-highlight   0.32
 *   --we-glass-shadow      0.12
 *   层权重                  layer-1 0.9 / layer-2 1.0 / layer-3 1.1 /
 *                           抬高按钮 1.15 / overlay 1.3 / 气泡 0.8 /
 *                           代码块 0.8 / 行内代码-标签-未选分段 1.0 / 选中分段 1.15
 *   釉光渐变               浅色 0.10 → 0.03@38% → 0.05；深色 0.07 → 0.02@38% → 0.03
 *   霜配方                 blur(N) saturate(1.30) brightness(1.04) contrast(1.01)
 *   厚玻璃阴影             inset 0 1px 0 rgba(255,255,255,.32),
 *                          inset 0 -1px 0 rgba(255,255,255,.08),
 *                          inset 0 0 0 .5px rgba(255,255,255,.08),
 *                          0 12px 40px rgba(0,0,0,.12)
 *
 * 选择器依据（读宿主源码得来，不是猜的）：
 *   · dsh-client-ui-sidebar  侧栏根 `background: var(--dsw-specific-sidebar-fill)`
 *   · dsh-client-ui-layout   `[data-windows-titlebar] .{hash}_frame` 也读 sidebar-fill；
 *                            `.{hash}_centerCol` 读 --dsw-alias-bg-base，带 16px 圆角
 *   · dsh-client-ui-chat     有稳定的 `[data-composer-seat]` / `[data-conversation-scroll]` 锚点
 *   · Vite CSS Module 类名形如 `{hash}_{模块名}` —— 哈希每次构建变、后缀不变
 *     ⇒ 用 `[class*="_frame"]` 这一类子串选择器（与源码同一条手法）
 */

window.__ModuleLoader__.load({
  id: 'dsh-theme-glass',
  factory: (require) => {
    // 与宿主自己产出的客户端模块同一种包装：factory 交出 module.exports，
    // 具名导出 apply / inject 由下面的 exports.* 赋值给出。
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    // ═══════════════════════════════════════════════════════════════════
    // 1. 材质常量（对应源码的 READABILITY_FLOOR / GLASS_SATURATE 等）
    // ═══════════════════════════════════════════════════════════════════
    const CANVAS = '#c9d2d4';        // 纯灰画布（对齐壁纸版主内容区实测值）
    const ACCENT = '#0c6e7e';        // 强调色（浅底 5.9:1）
    const ACCENT_HOVER = '#0a5c69'; // 同色系深一档（hover 态）

    const SHEET_ID = 'theme-glass-sheet';
    const ATTR = 'data-theme-glass';
    // 侧栏收起/展开动画期间挂在 body 上的标记：用来临时摘掉本插件加在动画路径
    // 上的重活（模糊、投影），静止态不出现、不影响外观。
    const ATTR_ANIM = 'data-theme-glass-animating';

    // ═══════════════════════════════════════════════════════════════════
    // 2. 样式表
    // ═══════════════════════════════════════════════════════════════════
    // 注意：整段是模板字符串 ⇒ 内部禁止反引号与 ${} 以外的插值。
    const SHEET = [
      // ─────────────────────────────────────────────────────────────
      // 2.1 画布 + 材质变量（= 壁纸版 body 上那一组 --we-* 注入）
      // ─────────────────────────────────────────────────────────────
      `
body[${ATTR}] {
  background-color: ${CANVAS} !important;

  /* 可读性下限：0.18（浅）。
     ⚠️ 与壁纸版不同：源码的 0.45 是为「壁纸可能是任意深色花图」兜的。本插件的画布是
     **恒定浅灰**，文字对比度天然充足（黑字 vs #c9d2d4 ≈ 12:1）⇒ 不需要那么重的地板。
     降到 0.18 换来的是真通透：面板能透出画布，而不是一层近乎实心的白。 */
  --tg-readability-floor: 0.18;
  --tg-readability-base: #ffffff;
  --tg-tint: #ffffff;

  /* ── 标题栏那条带的**不透明**颜色 ──────────────────────────────────────
     为什么需要一个显式不透明值：Windows 上右上角三个窗口按钮是 Electron 的
     原生覆盖层（titleBarOverlay），它的颜色**不是硬编码的**，而是由 preload 的
     syncWindowsAppearance() 从页面里一个隐藏探针 span 的计算样式推给主进程：
         probe.style.cssText = "background-color:var(--dsw-specific-sidebar-fill);
                                color:var(--dsw-alias-label-primary)";
         color = nativeColor(getComputedStyle(probe).backgroundColor)
         ipcRenderer.send('dsh-desktop:windows-appearance', lang, color, symbolColor)
     而 --dsw-specific-sidebar-fill 在本主题里是**半透明**玻璃色 ⇒ 同一种颜色：
       · 页面标题栏带：叠在灰画布上 → 偏灰（实测 #DBE1E2）
       · 原生覆盖层：叠在窗口底色上 → 偏亮（实测 #EFF1F2）
     于是右上角出现一块"更白"的矩形。
     修法：给标题栏带一个**不透明**色，并把这个色只写给那个探针（见 2.4b），
     两边就必然一致；真正的侧栏仍用半透明玻璃，视觉不变。 */
  --tg-titlebar: #dbe1e2;

  /* 玻璃三件套：透明度 0.202（滑杆 32）、模糊 44px、材质常量 1.30 / 1.04 */
  --tg-glass-alpha: 0.202;
  --tg-blur: 44px;
  --tg-saturate: 1.30;
  --tg-brightness: 1.04;

  /* 边框 / 高光 / 阴影（源码的三个默认值） */
  --tg-border-alpha: 0.35;
  --tg-highlight: 0.32;
  --tg-shadow: 0.12;
  --tg-border: rgba(180, 180, 180, var(--tg-border-alpha));

  /* 釉光三档（浅色；比源码的 0.10/0.03/0.05 再淡一档 —— 地板降到 0.18 之后
     原来的釉光会把侧栏顶回发白） */
  --tg-sheen-a: 0.05;
  --tg-sheen-b: 0.02;
  --tg-sheen-c: 0.03;

  /* 霜配方 —— 全文唯一的"模糊"定义，逐字对应源码 */
  --tg-frost: blur(var(--tg-blur)) saturate(var(--tg-saturate))
              brightness(var(--tg-brightness)) contrast(1.01);

  /* 厚玻璃阴影 —— 源码 [data-composer-card] 那组 */
  --tg-elevation:
    inset 0 1px 0 rgba(255, 255, 255, var(--tg-highlight)),
    inset 0 -1px 0 rgba(255, 255, 255, 0.08),
    inset 0 0 0 0.5px rgba(255, 255, 255, 0.08),
    0 12px 40px rgba(0, 0, 0, var(--tg-shadow));

  /* 镜面釉 —— 上权重渐变把平涂的染色变成"湿玻璃"（源码同一道） */
  --tg-sheen: linear-gradient(180deg,
    rgba(255, 255, 255, var(--tg-sheen-a)) 0%,
    rgba(255, 255, 255, var(--tg-sheen-b)) 38%,
    rgba(255, 255, 255, var(--tg-sheen-c)) 100%);

  /* 标题栏专用：**恒值**釉光。源码实测：百分比停靠点装进 40px 高的顶栏会算出
     比侧栏（1111px）弱一半的白釉，交界处出现肉眼可见台阶 ⇒ 顶栏只用单一停靠点。 */
  --tg-sheen-flat: linear-gradient(180deg,
    rgba(255, 255, 255, var(--tg-sheen-a)) 0%,
    rgba(255, 255, 255, var(--tg-sheen-a)) 100%);

  /* 三档玻璃面（layer-1/2/3 = 0.9/1.0/1.1 层权重） */
  --tg-glass-1: color-mix(in srgb,
    var(--tg-readability-base) calc(var(--tg-readability-floor) * 100%),
    color-mix(in srgb, var(--tg-tint) calc(var(--tg-glass-alpha) * 0.9 * 100%), transparent)
      calc((1 - var(--tg-readability-floor)) * 100%));
  --tg-glass-2: color-mix(in srgb,
    var(--tg-readability-base) calc(var(--tg-readability-floor) * 100%),
    color-mix(in srgb, var(--tg-tint) calc(var(--tg-glass-alpha) * 1.0 * 100%), transparent)
      calc((1 - var(--tg-readability-floor)) * 100%));
  --tg-glass-3: color-mix(in srgb,
    var(--tg-readability-base) calc(var(--tg-readability-floor) * 100%),
    color-mix(in srgb, var(--tg-tint) calc(var(--tg-glass-alpha) * 1.1 * 100%), transparent)
      calc((1 - var(--tg-readability-floor)) * 100%));
  /* 抬高按钮（侧栏「新建会话」、重命名输入框）：再高半档，否则与容器压平 */
  --tg-glass-elevated: color-mix(in srgb,
    var(--tg-readability-base) calc(var(--tg-readability-floor) * 100%),
    color-mix(in srgb, var(--tg-tint) calc(var(--tg-glass-alpha) * 1.15 * 100%), transparent)
      calc((1 - var(--tg-readability-floor)) * 100%));
  /* 浮层：最高一档 1.3 */
  --tg-glass-overlay: color-mix(in srgb,
    var(--tg-readability-base) calc(var(--tg-readability-floor) * 100%),
    color-mix(in srgb, var(--tg-tint) calc(var(--tg-glass-alpha) * 1.3 * 100%), transparent)
      calc((1 - var(--tg-readability-floor)) * 100%));
  /* 侧栏专用一档：比 layer-1 更淡一档（0.62 层权重），釉色微微偏暖 ——
     画布本身偏蓝（B-R +10），纯白釉压上去后侧栏会读成冷白；目标里侧栏几乎是中性色
     （B-R 仅 +2）。实测校准值，改动请重新跑 .tmp-diff.py 对照。 */
  --tg-sidebar-tint: #faf5ef;
  --tg-glass-sidebar: color-mix(in srgb,
    var(--tg-readability-base) calc(var(--tg-readability-floor) * 100%),
    color-mix(in srgb, var(--tg-sidebar-tint) calc(var(--tg-glass-alpha) * 0.62 * 100%), transparent)
      calc((1 - var(--tg-readability-floor)) * 100%));

  /* 侧栏圆角 —— 对齐壁纸版「侧栏圆角」20px 一档（实测截图量出 ~20px） */
  --tg-sidebar-radius: 20px;
  /* 侧栏上下留白（用户实测反馈：侧栏高度太高，要留点空隙） */
  --tg-sidebar-gap: 10px;

  /* 胶囊（「新会话」按钮 / 导航胶囊）：比面板再亮一档的薄玻璃 */
  --tg-capsule: color-mix(in srgb, var(--tg-glass-3) 88%, #ffffff);
  --tg-capsule-hover: color-mix(in srgb, var(--tg-glass-3) 72%, #ffffff);

  /* 气泡 0.8 / 输入卡 1.0（对话栏那一对独立地板，本插件两者同值） */
  --tg-glass-bubble: color-mix(in srgb,
    var(--tg-readability-base) calc(var(--tg-readability-floor) * 100%),
    color-mix(in srgb, var(--tg-tint) calc(var(--tg-glass-alpha) * 0.8 * 100%), transparent)
      calc((1 - var(--tg-readability-floor)) * 100%));

  /* ── 表面令牌：在**令牌源头**接管（源码 #80 的做法）────────────────
     宿主的面板 / 卡片 / 按钮 / 菜单都读这一族别名。改令牌 ⇒ 一次覆盖全应用，
     不必知道任何 CSS 模块哈希。 */
  --dsw-alias-bg-base: transparent !important;
  --dsw-specific-sidebar-fill: var(--tg-glass-1) !important;
  --dsw-alias-bg-layer-1: var(--tg-glass-1) !important;
  --dsw-alias-bg-layer-2: var(--tg-glass-2) !important;
  --dsw-alias-bg-layer-3: var(--tg-glass-3) !important;
  --dsw-alias-bg-overlay: var(--tg-glass-overlay) !important;
  --dsw-alias-button-elevated-fill: var(--tg-glass-elevated) !important;
  --dsw-alias-button-floating-fill: var(--tg-glass-3) !important;
  --dsw-alias-button-tool-bar-fill: var(--tg-glass-2) !important;
  --dsw-alias-button-ghost-active-fill: var(--tg-glass-1) !important;
  --dsw-alias-bg-module-platform: var(--tg-glass-elevated) !important;
  --dsw-alias-bg-multi-select: var(--tg-glass-3) !important;
  /* 选中/悬停行：Windows 侧的会话列表选中底色走这一族。
     取 layer-2（1.0 权重）—— 实测 layer-1 会让选中行偏深 14 级，
     layer-3 又太浅失去"被选中"的读法；1.0 是折中。 */
  --dsw-alias-interactive-bg-active: var(--tg-glass-2) !important;
  --dsw-alias-interactive-bg-hover-solid: var(--tg-glass-2) !important;

  /* 对话栏那一对（气泡 / 输入卡 / 读同一 token 的工具弹卡） */
  --dsw-specific-bubble: var(--tg-glass-bubble) !important;
  --dsw-specific-input-major: var(--tg-glass-2) !important;

  /* ── markdown 代码块 / 行内代码 / 标签（源码 L184-215 那一段）──────────
     代码块的底取 0.8 档（与气泡同档，用户原话「和对话框一样」）；
     行内代码 / 标签 / 未选分段取 1.0 档（小色块要比底稍亮才读得出"这是一枚 chip"）；
     选中分段 1.15 档（靠"比未选中更亮"表达选中，而不是回到实色）。
     注意：它们是**静态调色板**的令牌，不是层令牌派生 ⇒ 必须单独给。 */
  --dsw-alias-markdown-code-block: color-mix(in srgb,
    var(--tg-readability-base) calc(var(--tg-readability-floor) * 100%),
    rgba(255, 255, 255, calc(var(--tg-glass-alpha) * 0.8))
      calc((1 - var(--tg-readability-floor)) * 100%)) !important;
  --dsw-alias-markdown-code-block-banner: color-mix(in srgb,
    var(--tg-readability-base) calc(var(--tg-readability-floor) * 100%),
    rgba(255, 255, 255, calc(var(--tg-glass-alpha) * 0.8))
      calc((1 - var(--tg-readability-floor)) * 100%)) !important;
  --dsw-alias-markdown-inline-code: color-mix(in srgb,
    var(--tg-readability-base) calc(var(--tg-readability-floor) * 100%),
    rgba(255, 255, 255, var(--tg-glass-alpha))
      calc((1 - var(--tg-readability-floor)) * 100%)) !important;
  --dsw-alias-markdown-tag: var(--dsw-alias-markdown-inline-code) !important;
  --dsw-alias-markdown-code-segment-unselected: var(--dsw-alias-markdown-inline-code) !important;
  --dsw-alias-markdown-code-segment-selected: color-mix(in srgb,
    var(--tg-readability-base) calc(var(--tg-readability-floor) * 100%),
    rgba(255, 255, 255, calc(var(--tg-glass-alpha) * 1.15))
      calc((1 - var(--tg-readability-floor)) * 100%)) !important;
  --dsw-alias-markdown-citation: color-mix(in srgb,
    var(--tg-readability-base) calc(var(--tg-readability-floor) * 100%),
    rgba(255, 255, 255, calc(var(--tg-glass-alpha) * 0.9))
      calc((1 - var(--tg-readability-floor)) * 100%)) !important;
  --dsw-alias-markdown-placeholder: color-mix(in srgb,
    var(--tg-readability-base) calc(var(--tg-readability-floor) * 100%),
    rgba(255, 255, 255, calc(var(--tg-glass-alpha) * 1.1))
      calc((1 - var(--tg-readability-floor)) * 100%)) !important;

  /* ── 边框四档：中性灰 + 「边框」alpha（源码 #255④）─────────────────
     中性灰在深浅两个主题上都读得出；它同时驱动表格网格与卡片描边。 */
  --dsw-alias-border-l1: var(--tg-border) !important;
  --dsw-alias-border-l2: var(--tg-border) !important;
  --dsw-alias-border-l2-darkmode-thin: var(--tg-border) !important;
  --dsw-alias-border-l3: var(--tg-border) !important;
  --dsw-alias-border-l4: var(--tg-border) !important;

  /* ── 强调色一族 ─────────────────────────────────────────────────────
     ⚠️ 只设 brand-primary 是不够的：实测宿主的**按钮**读
     button-primary-fill，而它的默认值是 var(--dsw-alias-brand-primary)；
     **思考中的浅蓝字**读 label-deep-diving（默认是
     color-mix(deepseek-500 70%, blue-950)，跟主题色毫无关系）。
     这三族必须逐个显式接管，否则界面里会残留宿主的蓝。
     ⚠️ 本段不许出现反引号：整套样式是模板字符串。 */
  --dsw-alias-brand-primary: ${ACCENT} !important;
  --dsw-alias-brand-text: ${ACCENT} !important;
  --dsw-alias-state-business-primary: ${ACCENT} !important;
  --dsw-alias-trajectory-accent: ${ACCENT} !important;
  --dsw-specific-sidebar-nav-item-active-accent: ${ACCENT} !important;
  --dsw-alias-interactive-bg-hover: color-mix(in srgb, ${ACCENT} 14%, transparent) !important;
  --dsw-alias-interactive-bg-hover-accent: color-mix(in srgb, ${ACCENT} 18%, transparent) !important;

  /* 实心主按钮（发送键、停止键…）走主题色，而不是宿主的蓝 */
  --dsw-alias-button-primary-fill: ${ACCENT} !important;
  --dsw-alias-button-primary-hover: ${ACCENT_HOVER} !important;
  --dsw-alias-button-primary-dimmed: color-mix(in srgb, ${ACCENT} 42%, #ffffff) !important;

  /* ⚠️ **信息按钮（那个蓝色圆形停止键）**：宿主给它 --dsw-alias-button-info-fill
     = var(--dsw-static-deepseek-500) = #4176e6（实测按钮主色 #4679E6，Δ=10）。
     这一枚**不在** brand-primary 那一族里 ⇒ 只改 brand 改不到它。
     实测反馈「按钮的颜色也调整成主题色」⇒ 显式接管这一族。 */
  --dsw-alias-button-info-fill: ${ACCENT} !important;
  --dsw-alias-button-info-hover: ${ACCENT_HOVER} !important;

  /* 选中文字 / 轨迹强调色也是同一族蓝 */
  --dsw-alias-bg-document-selection: color-mix(in srgb, ${ACCENT} 40%, transparent) !important;
  --dsw-alias-brand-primary-new-colorprimary-new-color: ${ACCENT} !important;

  /* 「深度求索中…」那行字：默认浅蓝 ⇒ 换成主题色；shimmer 取同色系的浅一档 */
  --dsw-alias-label-deep-diving: ${ACCENT} !important;
  --dsw-alias-label-deep-diving-shimmer: color-mix(in srgb, ${ACCENT} 45%, #eaf4f5) !important;

  /* ── 链接：默认 var(--dsw-static-deepseek-500)（蓝）⇒ 换主题色 ──────────────
     实测消费点：action-cards / deliverables 的「查看」、plugin-market 的卡片链接、
     settings-web-search 的链接、workflow-run 的成员按钮、workspace 的空态操作、
     forge 的 action 按钮 —— 全都读这一枚。 */
  --dsw-alias-link: ${ACCENT} !important;

  /* ── 文字层级：宿主默认的 bluish-700/600 压在灰画布上偏浅 ──────────────
     实测反馈「灰色文字在当前背景下有点浅」⇒ 各压暗一档（仍守住对比度） */
  --dsw-alias-label-primary: #12181a !important;
  --dsw-alias-label-primary-dimmed: #1d2528 !important;
  --dsw-alias-label-secondary: #464e53 !important;
  --dsw-alias-label-tertiary: #5e6669 !important;
  /* ── 会话悬浮卡：宿主默认是**深色卡 + 白字**（一套高对比 tooltip 配色）─────
     实测反馈「回话上悬浮显示黑色的不太好看」。
     宿主的默认定义（主题包实测）：
       --dsw-alias-hovercard-bg:            var(--dsw-static-neutral-bluish-850)  ← 深底
       --dsw-alias-hovercard-label-primary: var(--dsw-static-neutral-bluish-00)   ← 白字
       --dsw-alias-hovercard-label-secondary: bluish-300
       --dsw-alias-hovercard-label-tertiary:  bluish-400
     卡片容器是 dist 里的 ._card_ 规则，只读 --dsw-alias-hovercard-bg + shadow-lv3。
     ⚠️ 必须**整族一起换**：只改底不改字会变成"深底 + 深字"（更糟）；
        只改字不改底会变成"深底 + 深字"同一个坑。 */
  --dsw-alias-hovercard-bg: #fbfcfc !important;
  --dsw-alias-hovercard-label-primary: #12181a !important;
  --dsw-alias-hovercard-label-secondary: #4b5357 !important;
  --dsw-alias-hovercard-label-tertiary: #6a7275 !important;
  /* 卡片上的状态点：沿用宿主语义（完成=紫、出错=红），只把紫调成主题色系 */
  --dsw-alias-hovercard-state-done: ${ACCENT} !important;

  /* ── 滚动条 ──────────────────────────────────────────────────────────────
     宿主的设计（主题包的 scrollbar_css_default，实测全文）：
       body{--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l1); …}
       ::-webkit-scrollbar{width:var(--dsh-scrollbar-width);height:…}
       ::-webkit-scrollbar-track{margin-block:var(--dsh-scrollbar-track-margin);background:0 0}
       ::-webkit-scrollbar-thumb{border:var(--dsh-scrollbar-thumb-border) solid transparent;
                                 background:var(--dsh-scrollbar-thumb);background-clip:content-box;
                                 border-radius:999px}
     ⇒ 轨道本来就是**透明**的，能看到的几乎只有滑块本身。

     ⚠️ 之前这里把滑块设成 color-mix(#ffffff 65%, #d4d4d4) = **#F0F0F0**。
        在浅灰画布(#C9D2D4)/代码块(#DAE0E1)/侧栏(#ECF4F5)上，它比背景**更亮**，
        而且宿主默认 thumb-border:0 ⇒ 5px 滑块把轨道整条填满
        ⇒ 视觉上就是一条刺眼的白杠（实测那条就是 #F0F0F0、约 7px）。
     改法：换成**半透明中性灰**（明暗两种底上都压得住，不会发白），
     并借用宿主自己的两个旋钮把它做细：
       --dsh-scrollbar-width: 10px    轨道留出空间
       --dsh-scrollbar-thumb-border: 2px + background-clip:content-box
         ⇒ 可见滑块 = 10-4 = 6px，两端 999px 圆角，看起来是一枚居中的胶囊 */
  --dsh-scrollbar-width: 10px;
  --dsh-scrollbar-thumb-border: 2px;
  --dsh-scrollbar-track-margin: 2px;

  /* 滑块：中性偏冷的半透明灰。用 alpha 而不是实色，才能同时适配
     浅色画布、玻璃面板和代码块三种底色而不显脏。 */
  --dsh-scrollbar-thumb: rgba(92, 106, 110, 0.32);
  --dsh-scrollbar-thumb-hover: rgba(92, 106, 110, 0.52);
  /* 宿主还有按层区分的一族令牌（侧栏 ._root 会把 l2 塞进 --dsh-scrollbar-thumb） */
  --dsw-alias-scrollbar-bg-l1: rgba(92, 106, 110, 0.32) !important;
  --dsw-alias-scrollbar-bg-l2: rgba(92, 106, 110, 0.32) !important;
  --dsw-alias-scrollbar-hover-l1: rgba(92, 106, 110, 0.52) !important;
  --dsw-alias-scrollbar-hover-l2: rgba(92, 106, 110, 0.52) !important;

  /* 宿主浮层的霜：宿主 Modal 遮罩本来就读 --dsw-mask-blur，
     主题把它定义成 none ⇒ 面板背后是没被模糊的画面。一次覆盖全部宿主浮层。 */
  --dsw-mask-blur: var(--tg-frost);
  --dsw-menu-backdrop-filter: var(--tg-frost);
}
`,

      // ─────────────────────────────────────────────────────────────
      // 2.2 外壳容器透明 —— 否则一块实色盖住画布
      // ─────────────────────────────────────────────────────────────
      `
body[${ATTR}] > #root,
body[${ATTR}] > #root > [class*="_frame"],
body[${ATTR}] > #root > [data-slot="root"] > [class*="_frame"],
body[${ATTR}] > #root > [class*="_frame"] > [class*="_root"],
body[${ATTR}] > #root > [data-slot="root"] > [class*="_frame"] > [class*="_root"] {
  background: transparent !important;
}
/* 桌面壳 AppFrame 本体：宿主自己的 CSS 用 :has(> [data-shell-overlay]) 给它上底。
   不清掉会整片盖住画布（源码实测过同一现象）。 */
body[${ATTR}] :has(> [data-shell-overlay]) {
  background: transparent !important;
}

/* ── 侧栏切换键（PanelLeft 图标）移到顶栏，与「应用 编辑」齐平 ─────────────
   实测（三个状态对照 + DOM 探针）：
     · 纯净宿主（无插件）      → 图标在 x=36..57, y=26..47（**顶栏行**）
     · 壁纸引擎开             → 不在顶栏
     · 本插件开               → DOM 探针显示 panelIcon 在 x=34..57, **y=100..123**（侧栏 logo 行）
   宿主自己的规则（dsh-client-ui-sidebar）：
     [data-windows-titlebar] .*_collapsed .*_toggle { position:fixed; left:12px;
                        top:calc((标题栏高 - 28px) / 2); z-index:30 }
     [data-windows-titlebar] .*_collapsed .*_toggle .*_panelIcon { display:inline }
   —— 也就是说：宿主只给**收起态**加了「提到顶栏」的定位；展开态下这个图标留在
   侧栏 logo 那一行。实测反馈「侧边栏切换按钮位置」不对，正是要它像收起态那样
   待在顶栏、与「应用 编辑」同高。
   ⚠️ 本插件的侧栏面板是**独立的一块玻璃**（有自己的 margin 与圆角），侧栏整体
     往下缩了 10px ⇒ 图标若继续留在侧栏内，会落在 logo 行上（用户看到的效果）。
   ⚠️ 本段不许出现反引号：整套样式是模板字符串。 */
body[${ATTR}] [class*="_panelIcon"] {
  position: fixed !important;
  left: 12px !important;
  top: calc((var(--dsh-windows-titlebar-height, 48px) - 16px) / 2) !important;
  z-index: 30 !important;
  -webkit-app-region: no-drag;
  display: inline-block !important;
  color: var(--dsw-alias-label-secondary) !important;
}
`,

/* ── 侧栏切换键：宿主自带，**不动** ──────────────────────────────────────
   实测结论（三个状态对照）：
     · 两个插件都关（纯净宿主）→ 顶栏左侧**有** PanelLeft 切换键
     · 只开壁纸引擎          → **没有**
     · 只开本插件            → **没有**
   宿主规则（dsh-client-ui-sidebar）：
     [data-windows-titlebar] .*_collapsed .*_toggle .*_panelIcon { display:inline }
     .*_collapsed .*_toggle .*_panelIcon { display:none }   ← 展开态隐藏
   即这个键**只在侧栏收起时出现**；纯净宿主那次侧栏处于收起态，所以有键。
   壁纸引擎开着时侧栏是展开态 ⇒ 同样没有键 —— 它不是壁纸版特有的东西。
   ⇒ 结论：这是宿主的正常设计，**本插件不得强行让它常显**（那会凭空多出一个
     宿主没打算显示的控件）。此处不做任何干预。 */

      // ─────────────────────────────────────────────────────────────
      // 2.3 侧栏：底色 + 釉光，**霜挂在根级装饰叶节点上**
      // ─────────────────────────────────────────────────────────────
      // 源码 S2 判据：这一列已经是一整块玻璃，再画一条竖线就把它与会话区切成两半。
      // 必须是**显式 none**，不能只删声明 —— 壳层自己有一条读 border-l3 的边框。
      //
      // ⚠️⚠️ **霜绝不能挂在侧栏本体上** —— 这是本插件踩过的最隐蔽的一个坑：
      //   一个元素一旦有了 backdrop-filter（或 filter/transform/will-change），
      //   它就成为**其后代的 position:fixed 包含块**。侧栏里正好有一个
      //   position:fixed 的元素 —— 那个 PanelLeft 切换键（宿主给它
      //   position:fixed; left:12px）。霜挂在侧栏上 ⇒ 这个键的定位基准从
      //   视口变成侧栏列 ⇒ 它从顶栏掉进侧栏 logo 行（实测：y=95..120，
      //   而正确位置是 y=26..47，与「应用 编辑」同高）。
      //   wallpaper-engine 早就踩过同一个坑，它的解法就是"装饰叶节点"：
      //   列本体只留底色（无 backdrop-filter），霜挂到一个根级的绝对定位叶上。
      //   本插件照抄那条机制（见 2.3b 的 JS：创建叶节点并跟随侧栏几何）。
      `
body[${ATTR}] [class*="_sidebarCol"],
body[${ATTR}] .dshDesktopSidebarSurface {
  background-color: var(--tg-glass-sidebar) !important;
  background-image: var(--tg-sheen) !important;
  border-right: none !important;
  border-left: none !important;
}

/* ── 侧栏面板的圆角与投影 ──────────────────────────────────────────────
   宿主原生左栏**不带圆角**（*_sidebarCol 只有底色 + 右分割线），圆角是插件给的。
   锚点用**座位出口** div:has(> [data-slot="sidebar"])（源码同一条）：出口 div 自己
   带 display:contents、不生成盒子，背景/圆角都画不出来 ⇒ 只能 :has() 反向选父元素。
   子选择器（>）是刻意的：写宽一档会连带匹配"任何祖先链里有该锚点"的元素。

   ⚠️ **上下留白**：用户实测反馈「侧边栏高度太高了，上下还是稍微留点空隙」。
   宿主把侧栏列撑满整列高（height:100%），面板一路顶到窗口上下边。
   做法是给这一列**上下 margin**（不是 padding：padding 会把内容一起推下去，
   margin 只让面板本身缩进，canvas 从缝里透出来 = 一圈真实的间隙）。
   宿主给侧栏根写的是 height:100% + box-sizing:border-box ⇒ 必须同时把 height
   改成 auto，否则 100% 高度 + margin 会溢出到窗口外（面板底部反而看不见了）。
   ⚠️ 这一列**不得**带 backdrop-filter（见 2.3 的说明：它会成为 fixed 后代的
     包含块，把切换键从顶栏拽下来）。 */
body[${ATTR}] div:has(> [data-slot="sidebar"]) {
  border-radius: 0 var(--tg-sidebar-radius) var(--tg-sidebar-radius) 0 !important;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.55),
    2px 0 12px rgba(52, 72, 78, 0.10) !important;
  height: auto !important;
  margin-block: var(--tg-sidebar-gap) !important;
}

/* ── 收起/展开动画期间：把这列上的"重活"临时摘掉 ─────────────────────────
   宿主左栏收起动的是 frame 的 grid-template-columns（**布局**属性，每帧整页重排）。
   在这一路径上，我加的 12px 投影会跟着元素每帧重绘一遍。（对照：右侧栏收起动的是
   transform:translateX，不重排，所以不卡。）
   动画期间（body[data-theme-glass-animating] 由 JS 在 transitionstart 时挂上、
   transitionend 时摘掉）先不画投影，静止态外观完全不变。 */
body[${ATTR}][data-theme-glass-animating] div:has(> [data-slot="sidebar"]) {
  box-shadow: none !important;
}

/* 侧栏列本体（宿主类名）：跟着一起缩进，否则内容区还占满整列、面板与内容错位 */
body[${ATTR}] [class*="_sidebarCol"],
body[${ATTR}] .dshDesktopSidebarSurface {
  height: auto !important;
  margin-block: var(--tg-sidebar-gap) !important;
}

/* ── 侧栏「新会话」按钮：目标是一个**胶囊**（两端全圆）─────────────
   宿主给的是一般圆角矩形；这里把圆角拉满并补一条与主题色同源的 hover。
   :not([class*="_collapsed"]) 门控：收起态那个按钮是图标态，不该变胶囊。 */
body[${ATTR}] [data-slot="sidebar"] :not([class*="_collapsed"]) > button[class*="_newSession"] {
  border-radius: 999px !important;
  background-color: var(--tg-capsule) !important;
  border: 1px solid rgba(180, 180, 180, calc(var(--tg-border-alpha) * 0.8)) !important;
  box-shadow:
    0 1px 2px rgba(52, 72, 78, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.9) !important;
  -webkit-backdrop-filter: blur(8px) saturate(1.3) brightness(1.04);
  backdrop-filter: blur(8px) saturate(1.3) brightness(1.04);
  transition: background-color 140ms ease, box-shadow 140ms ease;
}
body[${ATTR}] [data-slot="sidebar"] :not([class*="_collapsed"]) > button[class*="_newSession"]:hover {
  background-color: var(--tg-capsule-hover) !important;
  box-shadow:
    0 2px 6px rgba(52, 72, 78, 0.10),
    inset 0 1px 0 rgba(255, 255, 255, 0.95) !important;
}

/* ── 标题栏带 + 原生窗口按钮取色探针 ─────────────────────────────────────
   宿主给 Windows 标题栏画的是一条伪元素：
     [data-windows-titlebar] ._frame:before{height:标题栏高;
       background:var(--dsw-specific-sidebar-fill);app-region:drag;inset:0 0 auto}
   而右上角三个窗口按钮是 Electron 原生覆盖层，颜色由 preload 的
   syncWindowsAppearance() 从一个隐藏探针 span 算出来（见 --tg-titlebar 的说明）。
   两边都改成同一个**不透明**色 ⇒ 右上角不再比标题栏更白。 */
html[data-windows-titlebar] body[${ATTR}] [class*="_frame"]::before {
  background: var(--tg-titlebar) !important;
}

/* 只作用于那个隐藏探针（body 的直接子元素，inline style 带 visibility:hidden）。
   ⚠️ 千万不要把选择器放宽成侧栏根一类的元素 —— 那会把真正的侧栏也变成不透明，
      玻璃就没了。 */
body[${ATTR}] > span[style*="visibility: hidden"] {
  --dsw-specific-sidebar-fill: var(--tg-titlebar) !important;
  --dsw-alias-label-primary: #0f1115 !important;
}
`,

      // ─────────────────────────────────────────────────────────────
      // 2.3b 根级装饰叶节点（承载侧栏的霜）
      // ─────────────────────────────────────────────────────────────
      // 机制照搬 wallpaper-engine 的 surface-plate：列本体不带 backdrop-filter，
      // 霜挂到一个**根级**的绝对定位叶节点上 ⇒ 侧栏列不成为 fixed 后代的包含块，
      // 侧栏里的 position:fixed 切换键仍然相对**视口**定位（停在顶栏）。
      //
      // ⚠️ 侧栏收起动画期间**必须让叶节点停止工作**（见 apply 里的 transitionstart
      //    处理）。宿主左栏收起动的是 frame 的 grid-template-columns —— 一个**布局**
      //    属性，每帧都要整页重排；而叶节点带 backdrop-filter，尺寸每帧都变就要
      //    整块重新采样模糊。两者叠加就是实测反馈的「收起侧边栏卡顿」。
      //    对照：右侧栏收起动的是 transform:translateX（合成器属性，不重排），
      //    所以它不卡 —— 这是两栏体感差异的根源，左侧的布局动画无法从插件侧改掉，
      //    但可以把自己的模糊开销在动画期间摘掉。
      `
[data-tg-surface-root] {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  -webkit-app-region: initial !important;
}
[data-tg-surface-plate] {
  position: absolute;
  pointer-events: none;
}
body[${ATTR}] [data-tg-surface-plate="sidebar"] {
  -webkit-backdrop-filter: var(--tg-frost);
  backdrop-filter: var(--tg-frost);
}
`,

      // ─────────────────────────────────────────────────────────────
      // 2.3 侧栏切换键（PanelLeft 图标）：让它待在**顶栏**，与「应用 编辑」齐平
      // ─────────────────────────────────────────────────────────────
      // 实测（三个状态对照 + DOM 探针）：
      //   · 纯净宿主（无插件）  → 图标在 x=36..57, **y=26..47**（顶栏行）
      //   · 壁纸引擎开         → 不在顶栏
      //   · 本插件开           → DOM 探针显示 panelIcon 在 x=34..57, y=95..120（侧栏 logo 行）
      // 宿主自己的规则（dsh-client-ui-sidebar）：
      //   [data-windows-titlebar] .*_collapsed .*_toggle { position:fixed; left:12px;
      //                      top:calc((标题栏高 - 28px) / 2); z-index:30 }
      //   —— 宿主只给**收起态**加了「提到顶栏」的定位；展开态下这个图标留在侧栏内。
      //   实测反馈「侧边栏切换按钮位置」不对，正是要它像收起态那样停在顶栏。
      // ⚠️ 本段不许出现反引号：整套样式是模板字符串。 */
      `
body[${ATTR}] [class*="_panelIcon"] {
  position: fixed !important;
  left: 12px !important;
  top: calc((var(--dsh-windows-titlebar-height, 48px) - 16px) / 2) !important;
  z-index: 30 !important;
  -webkit-app-region: no-drag;
  display: inline-block !important;
  color: var(--dsw-alias-label-secondary) !important;
}
`,

      // ─────────────────────────────────────────────────────────────
      // 2.4 中栏：透出画布，保留宿主给的 16px 圆角
      // ─────────────────────────────────────────────────────────────
      `
body[${ATTR}] [class*="_centerCol"] {
  background: transparent !important;
}
`,

      // ─────────────────────────────────────────────────────────────
      // 2.5 输入卡：模糊必须搬到 ::before（源码 #89 的教训）
      // ─────────────────────────────────────────────────────────────
      // [data-composer-card] 里有 position:fixed 后代（AI 浏览器座位）。元素自己挂
      // 非 none 的 backdrop-filter 会成为 fixed 后代的包含块 ⇒ 那个按钮掉 ~522px。
      // 伪元素没有 DOM 后代，永远不会成为包含块 ⇒ 视觉相同、位置正确。
      `
body[${ATTR}] [data-composer-card] {
  background-color: var(--tg-glass-2) !important;
  background-image: var(--tg-sheen) !important;
  box-shadow: var(--tg-elevation) !important;
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}
body[${ATTR}] [data-composer-card]::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  z-index: -1;
  -webkit-backdrop-filter: var(--tg-frost);
  backdrop-filter: var(--tg-frost);
}
/* 输入座位**不铺底板、不挂霜**（源码 #156③ 已整条撤回）：
   座位里就有 [data-composer-card]，在座位上挂霜会把它的 fixed 后代重新锚到座位上。 */
body[${ATTR}] [data-composer-seat] {
  background: transparent !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
`,

      // ─────────────────────────────────────────────────────────────
      // 2.6 气泡 / 卡片：同一张配方表
      // ─────────────────────────────────────────────────────────────
      `
body[${ATTR}] [class*="_bubble_"]:not([role="tooltip"]) {
  background-color: var(--tg-glass-bubble) !important;
  background-image: var(--tg-sheen) !important;
  -webkit-backdrop-filter: var(--tg-frost);
  backdrop-filter: var(--tg-frost);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, var(--tg-highlight)),
    inset 0 -1px 0 rgba(255, 255, 255, 0.06);
}
/* 计划卡 / 交付卡 / 改动文件卡：只上平铺底，**不加釉不加霜**
   （源码实测：加霜会在大面积卡片上把整卡洗白） */
body[${ATTR}] [data-plan-card],
body[${ATTR}] [data-presented-file],
body[${ATTR}] [data-changed-files] {
  background-color: var(--tg-glass-bubble) !important;
  background-image: none !important;
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}
`,

      // ─────────────────────────────────────────────────────────────
      // 2.7 代码块：底走令牌（上面 2.1 已接管），这里只补霜与吸顶条
      // ─────────────────────────────────────────────────────────────
      // 宿主 CodeBlock.module.css 真正的 sticky 载体是 .bannerWrap（position:sticky），
      // 它的底板写的是 --dsw-alias-bg-base —— 我们把它置成 transparent 了 ⇒ 代码块一滚，
      // 吸顶的 header / 复制按钮直接压在正文上、连一块板都没有。这里补回底板 + 霜。
      `
body[${ATTR}] [data-code-block-banner],
body[${ATTR}] [class*="_bannerWrap"] {
  background-color: var(--tg-glass-2) !important;
  -webkit-backdrop-filter: var(--tg-frost);
  backdrop-filter: var(--tg-frost);
}
body[${ATTR}] [class*="md-code-block"] pre,
body[${ATTR}] [class*="md-code-block"] pre > code {
  background: transparent !important;
}
`,

      // ─────────────────────────────────────────────────────────────
      // 2.8 Markdown 表格（源码 L762-800）
      // ─────────────────────────────────────────────────────────────
      // 表格是承载文字的面却没有面 ⇒ 壁纸/画布直接透过单元格，文字对比度跟着起伏。
      // 底面取代码块同款（**直接写配方**，不读 code-block 令牌 —— 那条在工具结果面
      // 会被置成 transparent，表格要是读了它就会退化成一张没有底的网格）。
      // 表头给中性灰抬起带；两级边框抬到 1px，封顶 0.8 不让滑杆拉成硬线。
      `
body[${ATTR}] [data-chat-flow] table,
body[${ATTR}] [data-vcp-rawhtml] table {
  background: color-mix(in srgb,
    var(--tg-readability-base) calc(var(--tg-readability-floor) * 100%),
    color-mix(in srgb, var(--tg-tint) calc(var(--tg-glass-alpha) * 0.8 * 100%), transparent)
      calc((1 - var(--tg-readability-floor)) * 100%)) !important;
}
body[${ATTR}] [data-chat-flow] table th,
body[${ATTR}] [data-vcp-rawhtml] table th {
  background-color: rgba(180, 180, 180, calc(var(--tg-border-alpha) * 0.45)) !important;
  border-bottom: 1px solid rgba(180, 180, 180, min(0.8, calc(var(--tg-border-alpha) * 1.7))) !important;
}
body[${ATTR}] [data-chat-flow] table td,
body[${ATTR}] [data-vcp-rawhtml] table td {
  border-bottom: 1px solid rgba(180, 180, 180, calc(var(--tg-border-alpha) * 0.9)) !important;
}

/* ── 表格：左右留白 + 圆角 + 阴影，做成一张卡片 ───────────────────────────
   真正的原因（宿主 CSS 实测，dist 里的 index-*.css）：
     _tableScroll th, td                  { padding: 10px 16px }
     _tableScroll th:first-child,
     _tableScroll td:first-child          { padding-left: 0 }     ← 首列左内边距归零
     _tableScroll td:last-child           { padding-right: 0 }    ← 末列右内边距归零
     _tableScroll.md-table-wide           { overflow-x: hidden }  ← 右侧超出被裁掉
     _tableScroll table                   { width: max-content }
   宿主是故意让首末列贴边的（想让表格文字与正文左对齐）。实测反馈「表格左右
   没有边距」正是这个 padding-left/right: 0；而"后面看不到"是 overflow-x: hidden
   把超出部分裁掉了。

   还有一个坑：列数 >= 4 的表格会被加上 md-table-wide 这个**字面类名**（不是哈希），
   而该类的 --dsh-table-lead / --dsh-table-spare 会算出一个负 margin 让表格
   出血到整列边缘 —— 必须一起归零，否则卡片会向左溢出。

   ⚠️ 表格是 border-collapse: collapse，圆角加在 table 上无效 ⇒
      圆角/裁剪/阴影都挂在外层滚动容器上。
   ⚠️ 用类名子串匹配（_tableScroll）：哈希每次构建都会变。
   ⚠️ 本段绝对不许出现反引号 —— 注释里也不行！曾经在这里用反引号包了一个类名，
      反引号提前闭合了外层模板字符串，factory 直接抛 ReferenceError，
      整个模块的 exports 都没产出 ⇒ 界面样式全部消失。 */
/* 先掐掉宿主给宽表的负 margin 出血 */
body[${ATTR}] .md-table-wide {
  --dsh-table-lead: 0px !important;
  --dsh-table-spare: 0px !important;
  margin-left: 0 !important;
  padding-left: 0 !important;
}

/* 卡片本体：外层滚动容器 */
body[${ATTR}] [class*="_tableScroll"] {
  margin: 14px 0 !important;
  border-radius: 12px !important;
  background-color: #ffffff !important;
  box-shadow:
    0 4px 16px rgba(40, 55, 60, 0.10),
    inset 0 0 0 1px rgba(176, 182, 184, 0.42) !important;
  overflow: hidden !important;   /* 让圆角真的裁掉表格四角 */
}

/* 表格铺满卡片，不再按 max-content 撑出去被裁 */
body[${ATTR}] [class*="_tableScroll"] table {
  width: 100% !important;
  max-width: 100% !important;
  border-collapse: separate !important;
  border-spacing: 0 !important;
}

/* 恢复首末列的内边距 —— 这是"左右没有边距"的直接病根 */
body[${ATTR}] [class*="_tableScroll"] th,
body[${ATTR}] [class*="_tableScroll"] td {
  padding: 10px 16px !important;
}
body[${ATTR}] [class*="_tableScroll"] th:first-child,
body[${ATTR}] [class*="_tableScroll"] td:first-child {
  padding-left: 18px !important;
}
body[${ATTR}] [class*="_tableScroll"] th:last-child,
body[${ATTR}] [class*="_tableScroll"] td:last-child {
  padding-right: 18px !important;
}

/* 表头底色 + 最后一行去掉底边，卡片收口才干净 */
body[${ATTR}] [class*="_tableScroll"] thead th {
  background-color: rgba(233, 238, 239, 0.95) !important;
}
body[${ATTR}] [class*="_tableScroll"] tbody tr:last-child td {
  border-bottom: none !important;
}
`,

      // ─────────────────────────────────────────────────────────────
      // 2.9 右侧栏面板：玻璃底，收起态**不刷底**
      // ─────────────────────────────────────────────────────────────
      // 收起时容器仍占 absolute right:0，只是内部走 visibility:hidden ——
      // 无条件刷底会在收起态露出一整块不透明色，把收回按钮一起盖掉（源码 #107）。
      `
body[${ATTR}] [data-sidebar-right-panel][data-sidebar-right-open] {
  background-color: var(--tg-glass-2) !important;
  background-image: var(--tg-sheen) !important;
  -webkit-backdrop-filter: var(--tg-frost);
  backdrop-filter: var(--tg-frost);
}
`,

      // ─────────────────────────────────────────────────────────────
      // 2.10 浮层豁免：**不玻璃化**，给不透明实底（源码 #161 + #163）
      // ─────────────────────────────────────────────────────────────
      // 浮层背后是界面自己的正文，任何 <100% 的覆盖都会让底下那行字透上来，
      // 表现成"两行字叠在一起"的重影。所以 tooltip / menu / listbox / dropdown
      // 一律回到实底，只保留圆角与阴影。
      //
      // ⚠️ 「生成文件」那张悬停预览是**另一个坑**（源码 #163）：HoverCard 的 portal
      //    读的是 `--dsw-alias-bg-base`，而我们把页底置成了 transparent ⇒ 预览整块
      //    透明、文字直接压在下面的正文上。修法不是给 portal 写 background（它可能
      //    被内部节点覆盖），而是**在浮层作用域内把 bg-base 重新声明成实色** ——
      //    自定义属性沿 DOM 继承，一行就治好它整棵子树里所有读该令牌的地方。
      //
      // ⚠️ 文字颜色必须**显式**给：tooltip 的正文读 --dsw-alias-label-primary，
      //    而宿主那套 bubble/label 令牌是"浅底深字"的配套；只改底不改字，
      //    在浅色主题下会变成白底白字（实测：悬浮到侧边栏图标看不到文字）。
      `
body[${ATTR}] [role="tooltip"],
body[${ATTR}] [role="menu"],
body[${ATTR}] [role="listbox"],
body[${ATTR}] [class*="popover" i],
body[${ATTR}] [class*="dropdown" i],
body[${ATTR}] [class*="hovercard" i],
body[${ATTR}] [data-changes-hover-preview] {
  --dsw-alias-bg-base: #ffffff;
  --dsw-alias-bg-layer-1: #ffffff;
  --dsw-alias-bg-layer-2: #f7f8f8;
  --dsw-alias-bg-layer-3: #f2f4f4;
  /* 文字：显式给，不靠继承（tooltip 的 bubble/label 令牌是浅底深字那套的配套） */
  --dsw-alias-label-primary: #12181a;
  --dsw-alias-label-primary-dimmed: #1d2528;
  --dsw-alias-label-secondary: #464e53;
  --dsw-alias-label-tertiary: #5e6669;
  color: #12181a !important;
  background-color: #ffffff !important;
  background-image: none !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
  border-radius: 12px;
  box-shadow:
    0 12px 32px rgba(40, 55, 60, 0.16),
    inset 0 0 0 1px rgba(180, 180, 180, 0.35) !important;
}

/* tooltip 的 label span（_label_）与快捷键 kbd（_key_ 与 _keys_）也要跟着变深，
   否则文字仍是宿主的浅色（在白底上几乎看不见）。 */
body[${ATTR}] [role="tooltip"] [class*="_label_"],
body[${ATTR}] [role="tooltip"] [class*="_key_"],
body[${ATTR}] [role="tooltip"] [class*="_keys_"],
body[${ATTR}] [role="tooltip"] kbd {
  color: #12181a !important;
}
body[${ATTR}] [role="tooltip"] [class*="_key_"],
body[${ATTR}] [role="tooltip"] [class*="_keys_"] {
  background: rgba(120, 130, 135, 0.14) !important;
  border-color: rgba(120, 130, 135, 0.22) !important;
}

/* 文件改动预览的根：宿主把圆角写在**内部滚动容器**上，边缘会露出直角
   （源码实测「上圆下方」）⇒ 圆角钉在预览根上并裁剪。 */
body[${ATTR}] [data-changes-hover-preview] {
  overflow: hidden !important;
  border-radius: 12px !important;
}

/* 包住预览的那层 portal 自身是透明的，是边缘漏光的来源 ⇒ 同层实底。 */
body[${ATTR}] :has(> [data-changes-hover-preview]) {
  --dsw-alias-bg-base: #ffffff;
  background-color: #ffffff !important;
  border-radius: 12px;
}

/* ── tooltip 定位：**只关过渡，不改位置** ────────────────────────────────
   宿主 tooltip 的定位算法（客户端 dist 里的 gH）：
        const 候选 = [首选side, 对侧, ...其余];
        for (const S of 候选) { const O = C[S]; if (落在视口内) return {…O, side:S}; }
   它先按首选侧放、放不下才跳对侧，且挂在 ResizeObserver 上 —— 这套逻辑本身是
   可靠的：首帧 style 就是 visibility:hidden，等 useEffect 算好才置 visible，
   用户看不到中间态。

   ⚠️ **不要试图用 JS 复算位置。** 我试过一次（照抄 gH，用 MutationObserver 盯
      body），结果是灾难：拿的是 tooltip 自己的 rect 而不是触发元素(anchor)的 rect，
     又因为模型每输出一个字就触发一次 MutationObserver，每次都拿 tooltip 当前位置
     再往外推一次 ⇒ 提示框随着对话输出一路漂移。
   ⇒ 位置完全交给宿主。这里唯一做的事是**关掉过渡**，避免位置被设置时
     被 CSS 补间动画拖出一次可见的滑动。 */
body[${ATTR}] [role="tooltip"] {
  transition: none !important;
}
`,

      // ─────────────────────────────────────────────────────────────
      // 2.11 无 backdrop-filter 时的兜底（源码 @supports not）
      // ─────────────────────────────────────────────────────────────
      // 模糊不可用时，"半透明 + 无霜"等于把文字放到花底上 ⇒ 改用近不透明玻璃。
      `
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  body[${ATTR}] {
    --tg-frost: none;
    --tg-glass-1: color-mix(in srgb, var(--tg-tint) 92%, transparent);
    --tg-glass-2: color-mix(in srgb, var(--tg-tint) 94%, transparent);
    --tg-glass-3: color-mix(in srgb, var(--tg-tint) 96%, transparent);
  }
}
`,

      // ─────────────────────────────────────────────────────────────
      // 2.12 窄视口兜底（源码 @media max-width:1100px）
      // ─────────────────────────────────────────────────────────────
      // 宿主 <1100px 把侧栏折叠成抽屉、用 transform 位移 —— 那时 backdrop-filter
      // 采样不到有效矩形 ⇒ 抽屉全透明、正文直接压在画布上。改近不透明底并关霜。
      `
@media (max-width: 1100px) {
  body[${ATTR}] [class*="_sidebarCol"],
  body[${ATTR}] .dshDesktopSidebarSurface {
    background-color: color-mix(in srgb, var(--tg-tint) 92%, transparent) !important;
    background-image: none !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
  }
}
`,
    ].join('\n');

    // ═══════════════════════════════════════════════════════════════════
    // 3. 生命周期
    // ═══════════════════════════════════════════════════════════════════
    // ⚠️ `inject` 里的字符串是**服务名**（Cordis 的 ctx.<name>），不是模块 id。
    //   模块 id（`@deepseek-ai/dsh-client-ui-theme`）写在 package.json 的
    //   `dsh.client.inject` 里 —— 两者名字一样、含义完全不同，写错了服务解析不到，
    //   整个模块**静默不加载**（宿主一切正常、界面毫无变化，只有控制台有线索）。
    //   本插件只用 DOM（不读 ctx.theme / ctx.slots / ctx.locale）⇒ 不声明任何服务，
    //   把失败面压到零。将来要读 ctx.theme.overrideTokens 时再改成 ['theme']。
    function apply(ctx) {
      // 取证通道：确认这次刷新真的执行到了这里（打不开 DevTools 时靠它）。
      try {
        // eslint-disable-next-line no-console
        console.info('[theme-glass] apply · canvas=' + CANVAS + ' accent=' + ACCENT);
      } catch { /* ignore */ }

      ctx.effect(() => {
        const body = document.body;
        body.setAttribute(ATTR, '');

        const style = document.createElement('style');
        style.id = SHEET_ID;
        style.textContent = SHEET;
        document.head.append(style);

        // ── 让原生窗口按钮立刻用上我们的标题栏颜色 ────────────────────────
        // preload 的 syncWindowsAppearance() 靠 MutationObserver 盯着
        //   · document.body 的 style 属性
        //   · document.head 的 childList/subtree/characterData
        // 我们往 head 插入 <style> 已经会触发一次；这里再**明确碰一下 body.style**
        // 作为保险（探针 span 若比我们的样式晚创建，那次早触发会读到旧值）。
        // 只做一次 set+remove，不改任何实际样式。
        const resync = () => {
          try {
            body.style.setProperty('--tg-titlebar-sync', '1');
            body.style.removeProperty('--tg-titlebar-sync');
          } catch { /* ignore */ }
        };
        resync();
        // 再补一次：等首帧布局与探针都就绪后同步（探针由壳层在 DOM ready 时创建）
        const resyncTimer = setTimeout(resync, 300);

        // ── 装饰叶节点：承载侧栏的霜 ─────────────────────────────────────
        // 侧栏列本体**不能**挂 backdrop-filter（它会成为 position:fixed 后代
        // 的包含块，把侧栏里的切换键从顶栏拽到侧栏内 —— 见 2.3 的详细说明）。
        // 所以霜挂到这个根级叶节点上，叶节点的位置跟随侧栏列的实际几何。
        const root = document.createElement('div');
        root.setAttribute('data-tg-surface-root', '');
        const plate = document.createElement('div');
        plate.setAttribute('data-tg-surface-plate', 'sidebar');
        root.append(plate);
        body.append(root);

        // 侧栏列的锚点：座位出口 div:has(> [data-slot="sidebar"]) 的父元素。
        const findColumn = () => {
          const outlet = body.querySelector('[data-slot="sidebar"]');
          return outlet ? outlet.parentElement : null;
        };

        const sync = () => {
          const col = findColumn();
          if (!col) { plate.style.display = 'none'; return; }
          const r = col.getBoundingClientRect();
          if (!r.width || !r.height) { plate.style.display = 'none'; return; }
          plate.style.display = '';
          plate.style.left = r.left + 'px';
          plate.style.top = r.top + 'px';
          plate.style.width = r.width + 'px';
          plate.style.height = r.height + 'px';
          // 圆角跟侧栏面板一致（面板的圆角在 div:has(> [data-slot="sidebar"]) 上）。
          plate.style.borderRadius = '0 20px 20px 0';
        };

        sync();

        // ── 跟随侧栏几何，但**绝不做逐帧轮询** ──────────────────────────────
        // 最初这里是一个 requestAnimationFrame 死循环，每帧 getBoundingClientRect()
        // 再回写叶节点尺寸。实测反馈「收起侧边栏会卡顿」，原因正是这两件事叠加：
        //   ① 每帧 getBoundingClientRect() ⇒ 强制同步布局（layout thrashing）
        //   ② 叶节点带 backdrop-filter，尺寸每帧都变 ⇒ 每帧重新采样整块模糊
        // 改法：
        //   · 用 ResizeObserver 跟随真实尺寸变化（拖动改宽、布局变化）
        //   · 收起/展开动画期间**暂时隐藏叶节点**（动画只有 ~300ms，这期间
        //     由侧栏列自己的底色承担，视觉上几乎察觉不到，但省掉了整段重绘）
        //   · 动画结束（transitionend）再同步一次并显示
        let animating = false;

        const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (!animating) sync(); }) : null;
        const col0 = findColumn();
        if (ro && col0) ro.observe(col0);

        const frameEl = body.querySelector('[class*="_frame"]');
        const onTransitionStart = (e) => {
          if (e.propertyName !== 'grid-template-columns') return;
          animating = true;
          // 动画期间摘掉本插件加的两笔开销：
          //   ① 叶节点的 backdrop-filter（尺寸每帧都变 ⇒ 每帧重采样整块模糊）
          //   ② 侧栏列的 12px 投影（元素每帧都在变尺寸 ⇒ 每帧重绘阴影）
          // 两者都是**只在动画期间**关闭，静止态外观一模一样。
          plate.style.visibility = 'hidden';
          body.setAttribute(ATTR_ANIM, '');
        };
        const onTransitionEnd = (e) => {
          if (e.propertyName !== 'grid-template-columns') return;
          animating = false;
          sync();
          plate.style.visibility = '';
          body.removeAttribute(ATTR_ANIM);
        };
        if (frameEl) {
          frameEl.addEventListener('transitionstart', onTransitionStart, true);
          frameEl.addEventListener('transitionend', onTransitionEnd, true);
        }
        window.addEventListener('resize', sync);

        // ── tooltip 定位：**完全交给宿主，本插件不插手** ────────────────────
        // 曾经在这里写过一段"预定位"（照抄宿主 gH 的算法复算一遍），结果是**帮倒忙**：
        // 我拿的是 `document.querySelector('[role="tooltip"]')` 自己的
        // getBoundingClientRect()，而宿主 gH 要的是**触发元素(anchor)**的矩形。
        // 又因为监听了 body 的全部 DOM 变化，模型每输出一个字就重算一次，
        // 每次都拿 tooltip **当前**位置再往外推一次 ⇒ 位置一路漂移
        // （实测反馈：「按钮的悬浮提示会随着模型对话的输出，位置移动」）。
        //
        // 宿主自己的定位是可靠的：首帧 style 就是 visibility:hidden，
        // 等 useEffect 里算好位置才置为 visible，用户看不到中间态。
        // ⇒ 这里**什么都不做**。唯一的 CSS 干预是关掉过渡（见 2.10 的
        //   `transition: none`），避免位置生效时被补间动画拖出二次闪动。

        try {
          // eslint-disable-next-line no-console
          console.info('[theme-glass] sheet injected · ' + SHEET.length + ' chars');
        } catch { /* ignore */ }

        return () => {
          window.removeEventListener('resize', sync);
          if (ro) ro.disconnect();
          if (resyncTimer) clearTimeout(resyncTimer);
          if (frameEl) {
            frameEl.removeEventListener('transitionstart', onTransitionStart, true);
            frameEl.removeEventListener('transitionend', onTransitionEnd, true);
          }
          root.remove();
          style.remove();
          body.removeAttribute(ATTR);
        };
      }, 'theme-glass: canvas + glass sheet');
    }

    exports.apply = apply;
    exports.inject = [];
    return module.exports;
  },
});
