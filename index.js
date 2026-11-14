/**
 * Host half of dsh-theme-glass.
 *
 * V1 全部效果都在浏览器侧（token 覆盖 + 一张样式表），宿主不需要做任何事：
 * 没有路由、没有磁盘读写、没有 ffmpeg、没有设置项。因此这里只留一个空 apply()，
 * 保证 bundle 能在 profile 里被正常加载（缺 apply 会让该行进 failed 状态）。
 *
 * 后续要加「可调参数」时，在这里导出 schemastery 的 Config —— DSH 会把设置
 * 落到 `<profile>/cordis.patch.yml`，与浏览器 origin/端口无关。
 */
export function apply() {}
