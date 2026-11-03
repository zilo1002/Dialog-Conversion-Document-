import * as cheerio from 'cheerio';
import { parseSharePayload } from './parseShare.js';

/** 从 start 位置的 { 或 [ 开始，找到配对的结束下标（忽略字符串内的括号）。 */
function matchBracket(text, start) {
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let quote = '';
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findMessagesPayload(text) {
  const re = /"(?:messages|message_list)"\s*:\s*\[/g;
  let m;
  while ((m = re.exec(text))) {
    const start = text.indexOf('[', m.index);
    const end = matchBracket(text, start);
    if (end < 0) continue;
    const slice = text.slice(start, end + 1);
    try {
      const arr = JSON.parse(slice);
      if (Array.isArray(arr) && arr.length && arr.every((x) => x && typeof x === 'object' && 'role' in x)) {
        const titleMatch = text.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        return {
          messages: arr,
          title: titleMatch ? JSON.parse(`"${titleMatch[1]}"`) : '',
          model_type: (text.match(/"model_type"\s*:\s*"([^"]*)"/) || [])[1] || '',
        };
      }
    } catch {
      /* 继续找下一处 */
    }
  }
  return null;
}

function domFallback($) {
  const title = ($('meta[property="og:title"]').attr('content') || $('title').text() || '').replace(/\s*[-–|]\s*DeepSeek\s*$/i, '').trim();
  const messageNodes = $('.ds-markdown, [class*="message"] [class*="markdown"], [class*="chat-message"]');
  const messages = [];
  messageNodes.each((i, el) => {
    const node = $(el);
    const holder = node.closest('[class*="user"], [class*="assistant"], [class*="message"]');
    const holderClass = String(holder.attr('class') || '') + ' ' + String(node.attr('class') || '');
    let role = 'assistant';
    if (/user|human/i.test(holderClass)) role = 'user';
    const content = node.html() || '';
    if (!content.trim()) return;
    messages.push({
      message_id: i,
      role: role === 'user' ? 'USER' : 'ASSISTANT',
      inserted_at: null,
      fragments: [{ type: role === 'user' ? 'REQUEST' : 'RESPONSE', content }],
    });
  });
  if (messages.length === 0) return null;
  return { title, messages, model_type: '' };
}

/**
 * 接口不可用时的兜底：从分享页 HTML 里找内嵌 JSON，或退到 DOM 启发式提取。
 * 返回 { conversation, warning }；拿不到则返回 null。
 */
export function parseConversationFromHtml(html, meta) {
  if (!html || typeof html !== 'string') return null;

  const embedded = findMessagesPayload(html);
  if (embedded) {
    const conversation = parseSharePayload(embedded, meta);
    conversation.warnings.push('分享接口不可用，本次是从分享页 HTML 里内嵌的数据解析的。');
    return conversation;
  }

  let $;
  try {
    $ = cheerio.load(html);
  } catch {
    return null;
  }
  const dom = domFallback($);
  if (dom) {
    const conversation = parseSharePayload(dom, meta);
    conversation.warnings.push(
      '分享接口不可用，本次是从分享页 HTML 结构启发式提取的：角色和时间可能不准确，建议用「粘贴全文」核对。',
    );
    return conversation;
  }
  return null;
}
