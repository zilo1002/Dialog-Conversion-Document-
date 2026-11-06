import { markdownToHtml } from './markdown.js';
import { dateTimeLabel } from './localtime.js';
import { conversationDateLabel } from './groupByDate.js';

const ROLE_LABEL = { user: '用户', assistant: 'DeepSeek', system: '系统', unknown: '未标注角色' };

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function elapsedText(elapsed) {
  if (!Number.isFinite(elapsed)) return '';
  const sec = Math.round(elapsed);
  if (sec < 60) return `${sec} 秒`;
  return `${Math.floor(sec / 60)} 分 ${sec % 60} 秒`;
}

function renderPart(part) {
  if (part.type === 'thinking') {
    const tag = elapsedText(part.elapsed);
    return `<details class="thinking"><summary>思考过程${tag ? ` · ${tag}` : ''}</summary><div class="md">${markdownToHtml(part.content)}</div></details>`;
  }
  if (part.type === 'search' || part.type === 'extra') {
    return `<aside class="label-block"><div class="label-block-title">${escapeHtml(part.label)}</div><div class="md">${markdownToHtml(part.content)}</div></aside>`;
  }
  return `<div class="md">${markdownToHtml(part.content)}</div>`;
}

const STYLE = `
:root {
  color-scheme: light dark;
  --bg: #f7f6f3;
  --paper: #ffffff;
  --ink: #1f2328;
  --ink-soft: #5b636d;
  --line: #e4e1da;
  --accent: #4d6bfe;
  --accent-soft: #eef1ff;
  --code-bg: #f4f5f7;
  --radius: 14px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #14161a;
    --paper: #1b1e24;
    --ink: #e6e8eb;
    --ink-soft: #9aa3ad;
    --line: #2b3038;
    --accent: #7d92ff;
    --accent-soft: #232a44;
    --code-bg: #12151a;
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font: 16px/1.75 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
}
.wrap { max-width: 820px; margin: 0 auto; padding: 40px 20px 80px; }
header.doc-head { margin-bottom: 28px; }
h1.doc-title { font-size: 30px; line-height: 1.3; margin: 0 0 14px; letter-spacing: -0.01em; }
.meta { display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 13px; color: var(--ink-soft); }
.meta a { color: var(--accent); text-decoration: none; word-break: break-all; }
.meta a:hover { text-decoration: underline; }
.note {
  margin: 18px 0 0; padding: 12px 14px; border-radius: 10px;
  background: var(--accent-soft); color: var(--ink-soft); font-size: 13px; line-height: 1.7;
}
.note strong { color: var(--ink); }
.warnings { list-style: none; margin: 10px 0 0; padding: 12px 14px; border-radius: 10px; border: 1px dashed var(--line); font-size: 13px; color: var(--ink-soft); }
.warnings li { margin: 3px 0; }
.warnings li::before { content: "· "; }
section.day { margin-top: 44px; }
.day-head {
  position: sticky; top: 0; z-index: 2;
  display: flex; align-items: baseline; gap: 10px;
  margin: 0 -4px 18px; padding: 10px 4px;
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--line);
}
.day-head h2 { font-size: 18px; margin: 0; letter-spacing: 0.01em; }
.day-head .count { font-size: 12px; color: var(--ink-soft); }
article.msg {
  background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 18px 20px; margin: 0 0 16px; box-shadow: 0 1px 2px rgba(0,0,0,.03);
}
article.msg.user { background: var(--accent-soft); border-color: transparent; }
.msg-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; font-size: 13px; }
.role { font-weight: 600; letter-spacing: .02em; }
article.msg.user .role { color: var(--accent); }
.time { color: var(--ink-soft); font-variant-numeric: tabular-nums; }
.md > :first-child { margin-top: 0; }
.md > :last-child { margin-bottom: 0; }
.md p { margin: 0 0 12px; }
.md h3, .md h4, .md h5, .md h6 { margin: 22px 0 10px; line-height: 1.4; }
.md h3 { font-size: 19px; } .md h4 { font-size: 17px; } .md h5 { font-size: 15px; } .md h6 { font-size: 14px; }
.md ul, .md ol { margin: 0 0 12px; padding-left: 24px; }
.md li { margin: 4px 0; }
.md blockquote { margin: 0 0 12px; padding: 6px 14px; border-left: 3px solid var(--line); color: var(--ink-soft); }
.md a { color: var(--accent); }
.md hr { border: none; border-top: 1px solid var(--line); margin: 20px 0; }
.md table { border-collapse: collapse; width: 100%; margin: 0 0 14px; font-size: 14px; }
.md th, .md td { border: 1px solid var(--line); padding: 6px 10px; text-align: left; }
.md th { background: var(--code-bg); }
.md code { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace; font-size: 13.5px; }
.md :not(pre) > code { background: var(--code-bg); padding: 2px 5px; border-radius: 5px; }
.code-block { margin: 0 0 14px; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; background: var(--code-bg); }
.code-lang { font: 12px/1 ui-monospace, monospace; text-transform: lowercase; color: var(--ink-soft); padding: 8px 12px; border-bottom: 1px solid var(--line); background: color-mix(in srgb, var(--code-bg) 60%, var(--paper)); }
.code-block pre { margin: 0; padding: 14px; overflow-x: auto; }
.code-block pre code { background: none; padding: 0; white-space: pre; display: block; }
details.thinking { margin: 0 0 14px; border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px; background: color-mix(in srgb, var(--paper) 70%, var(--bg)); }
details.thinking > summary { cursor: pointer; font-size: 13px; color: var(--ink-soft); }
details.thinking[open] > summary { margin-bottom: 10px; }
aside.label-block { margin: 0 0 14px; padding: 10px 14px; border-left: 3px solid var(--accent); background: color-mix(in srgb, var(--accent-soft) 60%, transparent); border-radius: 0 10px 10px 0; }
.label-block-title { font-size: 12px; font-weight: 600; color: var(--ink-soft); margin-bottom: 6px; }
footer.doc-foot { margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--line); font-size: 12px; color: var(--ink-soft); }
@media print {
  :root { --bg: #fff; --paper: #fff; --ink: #000; --ink-soft: #444; --line: #ddd; }
  body { background: #fff; }
  .wrap { max-width: none; padding: 0; }
  .day-head { position: static; backdrop-filter: none; }
  article.msg { break-inside: avoid; box-shadow: none; }
  details.thinking { break-inside: avoid; }
  details.thinking[open] > summary { display: none; }
  a { color: inherit; }
}
`;

export function renderHtmlDocument(conversation, groups) {
  const totalMessages = conversation.messages.length;
  const showTime = !(conversation.options && conversation.options.showTime === false);
  const metaBits = [];
  metaBits.push(`<span>来源：${escapeHtml(conversation.sourceLabel || '未知来源')}</span>`);
  if (showTime) metaBits.push(`<span>对话日期：${escapeHtml(conversationDateLabel(conversation, groups))}</span>`);
  if (conversation.sourceUrl) {
    metaBits.push(`<span>原始链接：<a href="${escapeHtml(conversation.sourceUrl)}" rel="noreferrer">${escapeHtml(conversation.sourceUrl)}</a></span>`);
  }
  metaBits.push(`<span>消息 ${totalMessages} 条${showTime ? ` · ${groups.length} 个日期` : ''}</span>`);
  if (conversation.modelLabel) metaBits.push(`<span>模型 ${escapeHtml(conversation.modelLabel)}</span>`);
  metaBits.push(`<span>时区 ${escapeHtml(conversation.timeZone)}</span>`);
  metaBits.push(`<span>导出 ${escapeHtml(dateTimeLabel(conversation.fetchedAt, conversation.timeZone))}</span>`);

  const warnings = (conversation.warnings || [])
    .map((w) => `<li>${escapeHtml(w)}</li>`)
    .join('');

  const sections = groups
    .map((group) => {
      const items = group.messages
        .map((msg) => {
          const parts = msg.parts.map(renderPart).join('\n');
          return `<article class="msg ${msg.role}">
  <div class="msg-head"><span class="role">${escapeHtml(ROLE_LABEL[msg.role] || msg.role)}</span>${
    msg.timeLabel ? `<span class="time">${escapeHtml(msg.timeLabel)}</span>` : ''
          }</div>
  ${parts}
</article>`;
        })
        .join('\n');
      return `<section class="day" id="d-${escapeHtml(group.key)}">
  <div class="day-head"><h2>${escapeHtml(group.label)}</h2><span class="count">${group.messages.length} 条</span></div>
${items}
</section>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(conversation.title)} · DeepSeek 对话存档</title>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
<header class="doc-head">
  <h1 class="doc-title">${escapeHtml(conversation.title)}</h1>
  <div class="meta">${metaBits.join('')}</div>
  <p class="note"><strong>时间说明：</strong>${escapeHtml(conversation.timeNote)}</p>
  ${warnings ? `<ul class="warnings">${warnings}</ul>` : ''}
</header>
${sections}
<footer class="doc-foot">由 deepseek-to-doc 从 AI 对话分享链接导出 · 共 ${totalMessages} 条消息 · 生成于 ${escapeHtml(dateTimeLabel(conversation.fetchedAt, conversation.timeZone))}</footer>
</div>
</body>
</html>
`;
}
