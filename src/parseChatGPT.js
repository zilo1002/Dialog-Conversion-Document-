import * as cheerio from 'cheerio';
import { firstMeaningfulLine } from './parseCommon.js';

const GENERIC_TITLES = new Set(['shared conversation', 'shared chat', 'chatgpt', '']);

function nextDataJson(html) {
  const m = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function toMillis(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 1e12 ? Math.round(n) : Math.round(n * 1000);
}

/** content.parts 里的非字符串（图片/附件）不丢，转成带链接的说明文本 */
function describePart(part) {
  if (typeof part === 'string') return part;
  if (part && typeof part === 'object') {
    const type = part.content_type || part.type || 'attachment';
    const url = part.url || part.asset_pointer || part.audio_asset_pointer || '';
    if (url) return `[${type} 附件：${url}]`;
    return `[${type} 附件，内容无法解析为文本]`;
  }
  return '';
}

function walkMapping(mapping) {
  let rootId = null;
  for (const [id, node] of Object.entries(mapping)) {
    if (node && !node.parent) {
      rootId = id;
      break;
    }
  }
  if (!rootId) return [];
  const messages = [];
  const seen = new Set();
  const walk = (nodeId) => {
    if (seen.has(nodeId)) return;
    seen.add(nodeId);
    const node = mapping[nodeId];
    if (!node) return;
    const msg = node.message || {};
    const role = String(msg?.author?.role || '').toLowerCase();
    const content = (msg?.content?.parts || [])
      .map(describePart)
      .filter((t) => t && t.trim())
      .join('\n\n')
      .trim();
    if (content && (role === 'user' || role === 'assistant')) {
      messages.push({ role, ts: toMillis(msg.create_time), content });
    }
    // 只走当前分支：children[0] 是页面正在显示的那条回答，
    // 重新生成的历史变体不导出，避免同一条回答重复出现、把后面的提问挤到下面。
    for (const child of (node.children || []).slice(0, 1)) walk(child);
  };
  walk(rootId);
  return messages;
}

function domFallback(html) {
  const $ = cheerio.load(html);
  const out = [];
  $('[data-message-author-role]').each((_, el) => {
    const role = $(el).attr('data-message-author-role');
    if (role !== 'user' && role !== 'assistant') return;
    const text = $(el).text().replace(/\n{3,}/g, '\n\n').trim();
    if (text) out.push({ role, ts: null, content: text });
  });
  return out;
}

/**
 * 解析 chatgpt.com / chat.openai.com 分享页。
 * 结构依据（2026-11，公开导出工具实测）：正文内嵌在 <script id="__NEXT_DATA__">，
 * props.pageProps.serverResponse.data.mapping 是消息树：message.author.role、
 * message.content.parts（字符串=正文，对象=附件）、message.create_time（秒）。
 * 我方执行环境连不上 chatgpt.com，未能现场验证；读不到内嵌数据时退到 DOM 启发式。
 */
export function parseChatGPTShare(html, meta = {}) {
  const warnings = [];
  let title = '';
  let rawMessages = [];

  const data = nextDataJson(html);
  if (data) {
    const pageProps = data?.props?.pageProps || {};
    const conv = pageProps?.serverResponse?.data || pageProps;
    const mapping = conv?.mapping;
    title = String(conv?.title || '');
    if (mapping && typeof mapping === 'object') rawMessages = walkMapping(mapping);
  }

  if (rawMessages.length === 0) {
    rawMessages = domFallback(html);
    if (rawMessages.length > 0) {
      warnings.push('ChatGPT 分享页内嵌数据没读到，本次是从页面 DOM 启发式提取，Markdown 结构可能退化。');
    }
  }
  if (rawMessages.length === 0) {
    const err = new Error('没从 ChatGPT 分享页里解析出消息：页面可能改版、需要登录或被风控拦截。请改用「粘贴全文」模式。');
    err.code = 'PARSE_FAILED';
    throw err;
  }

  if (!title) {
    const $ = cheerio.load(html);
    title = ($('meta[property="og:title"]').attr('content') || $('title').text() || '')
      .replace(/\s*[-–|]\s*(ChatGPT|OpenAI)\s*$/i, '')
      .trim();
  }
  const isGeneric = GENERIC_TITLES.has(title.toLowerCase());
  if (isGeneric || !title) {
    title = firstMeaningfulLine(rawMessages.find((m) => m.role === 'user')?.content).slice(0, 28) || 'ChatGPT 对话';
  }

  const hasTs = rawMessages.some((m) => Number.isFinite(m.ts));
  if (!hasTs) warnings.push('ChatGPT 分享数据里没有逐条时间戳，按「对话日期未知，导入日期为今天」归档。');

  return {
    title,
    titleSource: 'share',
    platform: 'chatgpt',
    sourceLabel: 'ChatGPT',
    modelLabel: 'chatgpt',
    shareId: meta.shareId ?? null,
    sourceUrl: meta.sourceUrl ?? null,
    fetchedAt: meta.fetchedAt ?? Date.now(),
    timeZone: meta.timeZone,
    timeSource: hasTs ? 'message' : 'unknown',
    timeNote: hasTs
      ? '每条消息的时间取自 ChatGPT 分享数据中的 create_time（精确到秒），按本地时区换算。'
      : '来源未提供逐条时间，本对话的日期未知，按导入日期归档（不编造时间）。',
    messages: rawMessages.map((m, i) => ({
      index: i + 1,
      id: null,
      role: m.role,
      ts: m.ts,
      parts: [{ type: m.role === 'user' ? 'request' : 'response', label: m.role === 'user' ? '提问' : '回答', content: m.content }],
      hasThinking: false,
    })),
    warnings,
  };
}
