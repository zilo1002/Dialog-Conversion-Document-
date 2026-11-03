import { marked } from 'marked';

marked.use({ gfm: true, breaks: false, headerIds: false, mangle: false });

function escapeRawHtml(src) {
  // 内容来自别人分享的对话，按纯文本处理，避免把原始 HTML 直接塞进文档
  return String(src || '').replace(/<(?=[a-zA-Z/!?])/g, '&lt;');
}

function shiftHeadings(html) {
  return html.replace(/<(\/?)h([1-4])\b/gi, (_, slash, level) => `<${slash}h${Number(level) + 2}`);
}

function decorateCodeBlocks(html) {
  return html.replace(
    /<pre><code(?: class="language-([^"]*)")?>([\s\S]*?)<\/code><\/pre>/g,
    (_, lang, code) => {
      const label = (lang || 'text').trim() || 'text';
      return `<div class="code-block"><div class="code-lang">${label}</div><pre><code class="language-${label}">${code}</code></pre></div>`;
    },
  );
}

/** Markdown 片段 → 文档里用的 HTML（标题降两级、代码块带语言标签） */
export function markdownToHtml(src) {
  const html = marked.parse(escapeRawHtml(src), { async: false });
  return decorateCodeBlocks(shiftHeadings(html));
}

/** 从 Markdown 内容里粗略统计代码块，用于文档信息摘要 */
export function countCodeBlocks(src) {
  const m = String(src || '').match(/```/g);
  return m ? Math.floor(m.length / 2) : 0;
}
