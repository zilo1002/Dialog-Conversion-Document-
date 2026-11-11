// 前端与后端分离的连接配置（纯静态文件，改完刷新页面即生效）
//
// 后端地址：Cloudflare Worker（见仓库 README「部署」一节）。
// 也可以不改代码：浏览器控制台执行
//   localStorage.setItem('D2D_API_BASE', 'https://你的后端地址')
// 后刷新页面即可切换后端（改回来就 localStorage.removeItem('D2D_API_BASE')）。
window.D2D_API_BASE = window.D2D_API_BASE || 'https://deepseek-to-doc.liuziyi2333.workers.dev';
