const HTML_ESC = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function safeBase(title) {
  return (
    String(title || '')
      .replace(/[/\\:*?"<>|\s]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50) || '对话'
  );
}

/**
 * 重命名本机存档：改 summary.title，并同步替换四份输出里写死的文档标题与下载文件名。
 * 只动标题，不碰对话正文；公开分享页 /share/<id> 在服务端，标题保持识别时的样子。
 * 返回新对象，不改原 entry；标题为空或与原来一样时原样返回。
 */
export function applyTitle(entry, rawTitle) {
  const title = String(rawTitle || '').trim();
  const old = (entry && entry.summary && entry.summary.title) || '';
  if (!entry || !title || title === old) return entry;
  const html = (entry.html || '')
    .replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${HTML_ESC(title)} · DeepSeek 对话存档</title>`)
    .replace(/<h1 class="doc-title">[\s\S]*?<\/h1>/i, () => `<h1 class="doc-title">${HTML_ESC(title)}</h1>`);
  const markdown = (entry.markdown || '').replace(/^# .*$/m, () => `# ${title}`);
  const transcript = (entry.transcript || '').replace(/^# DeepSeek 对话记录：.*$/m, () => `# DeepSeek 对话记录：${title}`);
  const plaintext = (entry.plaintext || '').replace(/^DeepSeek 对话记录：.*$/m, () => `DeepSeek 对话记录：${title}`);
  const base = safeBase(title);
  const filenames = {
    html: `${base}.html`,
    markdown: `${base}.md`,
    transcript: `${base}_对话稿.md`,
  };
  // 顶层 title 也同步：结果页标题等显示字段读的是顶层
  return { ...entry, title, summary: { ...(entry.summary || {}), title, filenames }, html, markdown, transcript, plaintext };
}

// 排版风格：与 src/convert.js 的 DOC_STYLES 保持一致（classic 经典文档 / plain 简洁纯文本 / bubbles 聊天气泡）
const DOC_STYLES = ['classic', 'plain', 'bubbles'];

/** 切换排版：改 html 的 body class（三套主题 CSS 都在文档里）并同步 options / summary.options，正文不动。 */
export function applyDocStyle(entry, style) {
  if (!entry || !DOC_STYLES.includes(style) || !entry.html) return entry;
  const old = (entry.options && entry.options.docStyle) || (entry.summary && entry.summary.options && entry.summary.options.docStyle) || 'classic';
  if (style === old) return entry;
  if (!/<body class="doc-(classic|plain|bubbles)"/.test(entry.html)) return entry;
  const html = entry.html.replace(/<body class="doc-(classic|plain|bubbles)"/, `<body class="doc-${style}"`);
  const options = { ...(entry.options || {}), docStyle: style };
  const summary = { ...(entry.summary || {}), options: { ...((entry.summary && entry.summary.options) || {}), docStyle: style } };
  return { ...entry, options, summary, html };
}
