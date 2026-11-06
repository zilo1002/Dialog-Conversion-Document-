// 合并导出：从本机 IndexedDB 的存档（完整记录）拼合订本，全程在浏览器里完成，不需要管理密钥。
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function stampLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function bodyOf(html) {
  // 取每份文档 <div class="wrap"> 的内部内容（文档自带的样式由合订本统一提供）
  const m = /<div class="wrap">([\s\S]*)<\/div>\s*<\/body>/i.exec(html || '');
  return m ? m[1].trim() : '';
}

/**
 * 合订 HTML：整册用第一篇的排版风格（三套主题 CSS 都在样式表里，body class 决定），
 * 每篇一个 .doc-item 分节，打印 / 导 PDF 时按篇分页。
 */
export function mergedHtml(entries) {
  const list = (entries || []).filter((e) => e && e.html && bodyOf(e.html));
  if (!list.length) return null;
  const style = (/<style>([\s\S]*?)<\/style>/i.exec(list[0].html) || [])[1] || '';
  const bodyClass = (/<body class="doc-([a-z]+)"/.exec(list[0].html) || [])[1] || 'classic';
  const items = list.map((e) => `<section class="doc-item">\n${bodyOf(e.html)}\n</section>`).join('\n');
  const cover = `<header class="batch-head">
  <h1 class="doc-title">DeepSeek 对话合订本</h1>
  <div class="meta"><span>收录 ${list.length} 篇</span><span>导出 ${esc(stampLocal())}</span><span>合并自本机存档</span></div>
  <p class="note"><strong>说明：</strong>本文件由多份存档合并导出，按存档时间从新到旧排列；每篇保留自己的标题、来源与日期。整册沿用第一篇的排版风格。</p>
</header>`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DeepSeek 对话合订本 · ${list.length} 篇</title>
<style>${style}
.batch-head { margin-bottom: 8px; }
.doc-item { margin-top: 56px; padding-top: 28px; border-top: 1px solid var(--line); break-before: page; }
.doc-item:first-of-type { margin-top: 0; padding-top: 0; border-top: 0; break-before: auto; }
</style>
</head>
<body class="doc-${esc(bodyClass)}">
<div class="wrap">
${cover}
${items}
</div>
</body>
</html>
`;
}

/** 合订 Markdown：封面 + 各篇原文（每篇本就是带标题与来源的完整 Markdown），用分隔线隔开。 */
export function mergedMarkdown(entries) {
  const list = (entries || []).filter((e) => e && e.markdown);
  if (!list.length) return null;
  const head = [
    '# DeepSeek 对话合订本',
    '',
    `> 收录：${list.length} 篇`,
    `> 导出时间：${stampLocal()}（本机时区）`,
    '> 说明：以下按存档时间从新到旧合并，每篇保留自己的标题、来源与日期。',
    '',
  ].join('\n');
  return `${head}---\n\n${list.map((e) => e.markdown.trim()).join('\n\n---\n\n')}\n`;
}
