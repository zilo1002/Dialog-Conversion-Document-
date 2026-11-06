import { fetchShare, fetchShareShellHtml } from './fetchShare.js';
import { parseShareInput } from './shareUrl.js';
import { parseSharePayload } from './parseShare.js';
import { parseConversationFromHtml } from './htmlFallback.js';
import { parsePastedText } from './paste.js';
import { groupByDate, dateRangeLabel } from './groupByDate.js';
import { renderHtmlDocument } from './renderHtml.js';
import { renderMarkdown } from './renderMarkdown.js';
import { renderTranscript, renderPlainText } from './renderTranscript.js';
import { safeFileBase } from './filenames.js';
import { safeTimeZone } from './localtime.js';

/** 生成选项：用户决定文档与存档里保留哪些信息（界面上的四个勾选）。 */
export const DOC_STYLES = ['classic', 'plain', 'bubbles'];
export const DEFAULT_OPTIONS = { stripThinking: false, showTitle: true, showLink: true, showTime: true, docStyle: 'classic' };

export function normalizeOptions(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  return {
    stripThinking: o.stripThinking === true,
    showTitle: o.showTitle !== false,
    showLink: o.showLink !== false,
    showTime: o.showTime !== false,
    docStyle: DOC_STYLES.includes(o.docStyle) ? o.docStyle : 'classic',
  };
}

/**
 * 把选项套到对话模型上，再进入渲染：
 * - stripThinking：只留正文问答，思考过程 / 联网搜索等非正文片段全部删除
 * - showTitle=false：不用首条提问派生的标题，固定「DeepSeek 对话」
 * - showLink=false：不保存原始链接（文档与存档摘要都不出现）
 * - showTime=false：不分日期、不带逐条时间（分组与渲染都跟随 conversation.options）
 */
export function applyConversationOptions(conversation, rawOptions) {
  const o = normalizeOptions(rawOptions);
  conversation.options = o;
  if (o.stripThinking) {
    const before = conversation.messages.length;
    conversation.messages = conversation.messages
      .map((m) => ({ ...m, parts: m.parts.filter((p) => p.type === 'request' || p.type === 'response') }))
      .filter((m) => m.parts.length > 0)
      .map((m, i) => ({ ...m, index: i + 1 }));
    const dropped = before - conversation.messages.length;
    conversation.warnings = (conversation.warnings || []).filter((w) => !/思考过程/.test(w));
    conversation.warnings.push(
      dropped > 0
        ? `按你的选择只保留正文问答：思考过程、联网搜索等非正文内容已删除（${dropped} 条只剩非正文内容的消息整条移除）。`
        : '按你的选择只保留正文问答，思考过程、联网搜索等非正文内容已删除。',
    );
  }
  if (!o.showTitle) {
    conversation.title = 'DeepSeek 对话';
    conversation.titleSource = 'fixed';
  }
  if (!o.showLink) conversation.sourceUrl = null;
  if (!o.showTime) conversation.timeNote = '按你的选择，本文档不含逐条时间与日期信息。';
  return conversation;
}

const SHARE_ROLE_LABEL = { user: '用户', assistant: 'DeepSeek', system: '系统', unknown: '对话' };

/**
 * /share/<id>.json 的结构化数据：元信息 + 逐条消息。
 * content 是正文（只含问答），parts 保留全部分片（含思考过程，type 标明），时间跟随生成选项。
 */
export function sharePayload(built) {
  const c = built.conversation;
  const noTime = c.options && c.options.showTime === false;
  return {
    title: c.title,
    platform: c.platform,
    sourceLabel: c.sourceLabel || null,
    sourceUrl: c.sourceUrl || null,
    timeZone: c.timeZone,
    timeSource: noTime ? 'hidden' : c.timeSource,
    timeNote: c.timeNote,
    messageCount: c.messages.length,
    days: noTime ? [] : built.groups.map((g) => ({ key: g.key, label: g.label, count: g.messages.length })),
    options: c.options || { ...DEFAULT_OPTIONS },
    warnings: c.warnings,
    exportedAt: new Date(c.fetchedAt).toISOString(),
    // 时间标签在分组时才落到消息上，从分组结果取
    messages: built.groups.flatMap((g) => g.messages).map((m) => ({
      index: m.index ?? null,
      role: m.role,
      roleLabel: SHARE_ROLE_LABEL[m.role] || m.role,
      time: noTime ? null : m.timeLabel || null,
      content: m.parts
        .filter((p) => p.type === 'request' || p.type === 'response')
        .map((p) => String(p.content || '').trim())
        .filter(Boolean)
        .join('\n\n'),
      parts: m.parts.map((p) => ({
        type: p.type,
        label: p.label || null,
        content: String(p.content || ''),
        ...(Number.isFinite(p.elapsed) ? { elapsedSecs: Math.round(p.elapsed) } : {}),
      })),
    })),
  };
}

export function buildResult(conversation) {
  const groups = groupByDate(conversation);
  const html = renderHtmlDocument(conversation, groups);
  const markdown = renderMarkdown(conversation, groups);
  const transcript = renderTranscript(conversation, groups);
  const plaintext = renderPlainText(conversation, groups);
  const share = sharePayload({ conversation, groups });
  const noTime = conversation.options && conversation.options.showTime === false;
  const base = safeFileBase(conversation.title, noTime ? 'no-date' : dateRangeLabel(groups));
  return {
    conversation,
    groups,
    html,
    markdown,
    transcript,
    plaintext,
    share,
    filenames: { html: `${base}.html`, markdown: `${base}.md`, transcript: `${base}_对话稿.md` },
  };
}

export function summarize(built) {
  const c = built.conversation;
  const noTime = c.options && c.options.showTime === false;
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
    days: noTime ? [] : built.groups.map((g) => ({ key: g.key, label: g.label, count: g.messages.length })),
    options: c.options || { ...DEFAULT_OPTIONS },
    warnings: c.warnings,
    filenames: built.filenames,
  };
}

/** 链接模式：只支持 DeepSeek 分享链接（接口失败回退分享页 HTML 兜底） */
export async function convertUrl(rawUrl, tz, options) {
  const timeZone = safeTimeZone(tz);
  const parsed = parseShareInput(rawUrl);
  const meta = { shareId: parsed.shareId, sourceUrl: parsed.canonicalUrl, fetchedAt: Date.now(), timeZone };

  let apiError = null;
  try {
    const share = await fetchShare(rawUrl);
    return buildResult(applyConversationOptions(parseSharePayload(share.raw, meta), options));
  } catch (err) {
    apiError = err;
    if (err.code === 'SHARE_NOT_FOUND' || err.code === 'EMPTY_INPUT' || err.code === 'UNSUPPORTED_SITE' || err.code === 'NO_SHARE_ID') throw err;
  }

  try {
    const html = await fetchShareShellHtml(parsed.canonicalUrl);
    const fallback = parseConversationFromHtml(html, meta);
    if (fallback) return buildResult(applyConversationOptions(fallback, options));
  } catch {
    /* 页面也抓不到，抛出原始接口错误 */
  }
  throw apiError;
}

/** 粘贴模式：纯函数 */
export function convertPaste({ text, title, date, tz, options }) {
  const conversation = parsePastedText(text, { title, date, timeZone: safeTimeZone(tz) });
  return buildResult(applyConversationOptions(conversation, options));
}
