import { fetchShare, fetchShareShellHtml } from './fetchShare.js';
import { parseShareInput } from './shareUrl.js';
import { parseSharePayload } from './parseShare.js';
import { parseConversationFromHtml } from './htmlFallback.js';
import { parseChatGPTShare } from './parseChatGPT.js';
import { parseClaudeShare } from './parseClaude.js';
import { parsePastedText } from './paste.js';
import { groupByDate, dateRangeLabel } from './groupByDate.js';
import { renderHtmlDocument } from './renderHtml.js';
import { renderMarkdown } from './renderMarkdown.js';
import { safeFileBase } from './filenames.js';
import { safeTimeZone } from './localtime.js';

export function buildResult(conversation) {
  const groups = groupByDate(conversation);
  const html = renderHtmlDocument(conversation, groups);
  const markdown = renderMarkdown(conversation, groups);
  const base = safeFileBase(conversation.title, dateRangeLabel(groups));
  return {
    conversation,
    groups,
    html,
    markdown,
    filenames: { html: `${base}.html`, markdown: `${base}.md` },
  };
}

export function summarize(built) {
  const c = built.conversation;
  return {
    title: c.title,
    titleSource: c.titleSource,
    sourceUrl: c.sourceUrl,
    platform: c.platform,
    sourceLabel: c.sourceLabel,
    modelLabel: c.modelLabel,
    timeZone: c.timeZone,
    timeSource: c.timeSource,
    timeNote: c.timeNote,
    messageCount: c.messages.length,
    days: built.groups.map((g) => ({ key: g.key, label: g.label, count: g.messages.length })),
    warnings: c.warnings,
    filenames: built.filenames,
  };
}

/** 链接模式：按平台分发（DeepSeek 接口 / ChatGPT、Claude 分享页 __NEXT_DATA__） */
export async function convertUrl(rawUrl, tz) {
  const timeZone = safeTimeZone(tz);
  const parsed = parseShareInput(rawUrl);
  const meta = { shareId: parsed.shareId, sourceUrl: parsed.canonicalUrl, fetchedAt: Date.now(), timeZone };

  if (parsed.platform === 'chatgpt') {
    const share = await fetchShare(rawUrl);
    return buildResult(parseChatGPTShare(share.html, meta));
  }
  if (parsed.platform === 'claude') {
    const share = await fetchShare(rawUrl);
    return buildResult(parseClaudeShare(share.html, meta));
  }

  let apiError = null;
  try {
    const share = await fetchShare(rawUrl);
    return buildResult(parseSharePayload(share.raw, meta));
  } catch (err) {
    apiError = err;
    if (err.code === 'SHARE_NOT_FOUND' || err.code === 'EMPTY_INPUT' || err.code === 'UNSUPPORTED_SITE' || err.code === 'NO_SHARE_ID') throw err;
  }

  try {
    const html = await fetchShareShellHtml(parsed.canonicalUrl);
    const fallback = parseConversationFromHtml(html, meta);
    if (fallback) return buildResult(fallback);
  } catch {
    /* 页面也抓不到，抛出原始接口错误 */
  }
  throw apiError;
}

/** 粘贴模式：纯函数 */
export function convertPaste({ text, title, date, tz }) {
  const conversation = parsePastedText(text, { title, date, timeZone: safeTimeZone(tz) });
  return buildResult(conversation);
}
