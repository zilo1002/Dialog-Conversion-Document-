import { firstMeaningfulLine } from './parseCommon.js';

const GENERIC_TITLES = new Set(['claude', 'claude conversation', 'shared conversation', '']);

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
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value > 1e12 ? Math.round(value) : Math.round(value * 1000);
  }
  const t = Date.parse(String(value));
  return Number.isFinite(t) ? t : null;
}

/** content 数组里的非文本块（图片/附件/工具结果）不丢，转成带链接的说明文本 */
function describeBlock(block) {
  if (typeof block === 'string') return block;
  if (block && typeof block === 'object') {
    if (block.type === 'text' && typeof block.text === 'string') return block.text;
    const type = block.type || 'attachment';
    const url = block.url || block.file_url || (block.source && block.source.url) || '';
    const name = block.name || block.filename || '';
    if (url || name) return `[${type} 附件${name ? `（${name}）` : ''}：${url || '链接未提供'}]`;
    return `[${type} 附件，内容无法解析为文本]`;
  }
  return '';
}

function toMessages(chatMessages) {
  const out = [];
  for (const m of chatMessages || []) {
    const sender = String(m?.sender || '').toLowerCase();
    const role = sender === 'human' ? 'user' : sender === 'assistant' ? 'assistant' : null;
    if (!role) continue;
    let content = '';
    if (Array.isArray(m.content)) {
      content = m.content.map(describeBlock).filter((t) => t && t.trim()).join('\n\n');
    } else if (typeof m.content === 'string') content = m.content;
    else if (typeof m.text === 'string') content = m.text;
    content = content.trim();
    if (content) {
      const idx = Number(m?.index);
      out.push({ role, ts: toMillis(m.created_at), content, index: Number.isFinite(idx) ? idx : null });
    }
  }
  // 带逐条 index 时按 index 排序（页面渲染顺序），数组顺序不保证时也能还原先后
  if (out.length && out.every((e) => e.index != null)) {
    out.sort((a, b) => a.index - b.index);
  }
  return out;
}

/**
 * 解析 claude.ai 分享页。
 * 结构依据（2026-11，公开导出工具实测）：同样是 Next.js 页面，对话在
 * <script id="__NEXT_DATA__"> 的 props.pageProps.serverData：chat_messages[]
 * （sender: human|assistant，content[] 文本块或 text，created_at），标题 name。
 * 限制：claude.ai 对本执行环境返回 region_unavailable（区域不可用），
 * 未能现场验证；解析失败明确报错并引导粘贴全文，不绕过访问限制。
 */
export function parseClaudeShare(html, meta = {}) {
  const data = nextDataJson(html);
  const serverData = (data && data.props && data.props.pageProps && (data.props.pageProps.serverData || data.props.pageProps)) || null;

  let rawMessages = [];
  let title = '';
  if (serverData) {
    rawMessages = toMessages(serverData.chat_messages || (serverData.conversation && serverData.conversation.chat_messages));
    title = String(serverData.name || serverData.snapshot_name || serverData.title || '');
  }
  if (rawMessages.length === 0) {
    const err = new Error(
      '没从 Claude 分享页里解析出消息：页面可能改版、需要登录，或你的网络/地区被 Claude 拒绝（region_unavailable）。请改用「粘贴全文」模式。',
    );
    err.code = 'PARSE_FAILED';
    throw err;
  }

  const isGeneric = GENERIC_TITLES.has(title.toLowerCase());
  if (isGeneric || !title) {
    title = firstMeaningfulLine(rawMessages.find((m) => m.role === 'user')?.content).slice(0, 28) || 'Claude 对话';
  }

  const hasTs = rawMessages.some((m) => Number.isFinite(m.ts));
  const warnings = [];
  if (!hasTs) warnings.push('Claude 分享数据里没有逐条时间戳，按「对话日期未知，导入日期为今天」归档。');

  return {
    title,
    titleSource: 'share',
    platform: 'claude',
    sourceLabel: 'Claude',
    modelLabel: 'claude',
    shareId: meta.shareId ?? null,
    sourceUrl: meta.sourceUrl ?? null,
    fetchedAt: meta.fetchedAt ?? Date.now(),
    timeZone: meta.timeZone,
    timeSource: hasTs ? 'message' : 'unknown',
    timeNote: hasTs
      ? '每条消息的时间取自 Claude 分享数据中的 created_at，按本地时区换算。'
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
