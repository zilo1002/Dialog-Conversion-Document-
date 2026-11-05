const GENERIC_TITLES = new Set([
  'shared conversation',
  'shared chat',
  '共享对话',
  '共享的对话',
  '分享的对话',
  '分享对话',
  'deepseek',
  '',
]);

const ROLE_MAP = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
};

const FRAGMENT_LABELS = {
  THINK: '思考过程',
  RESPONSE: '回答',
  REQUEST: '提问',
  SEARCH: '联网搜索',
  FILE: '文件',
  TOOL: '工具调用',
};

function cleanTitle(value) {
  return String(value ?? '')
    .replace(/\s*[-–|]\s*DeepSeek\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstMeaningfulLine(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.replace(/^[#>\-*\s]+/, '').trim())
    .find((l) => l.length > 0) || '';
}

function deriveTitleFromMessages(messages) {
  const firstUser = messages.find((m) => m.role === 'user');
  const line = firstMeaningfulLine(firstUser?.parts?.find((p) => p.type === 'request')?.content);
  if (!line) return null;
  const trimmed = line.length > 28 ? `${line.slice(0, 28)}…` : line;
  return trimmed;
}

function toMillis(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  // inserted_at 是「秒」，可能带小数；兼容误传毫秒的情况
  return n > 1e12 ? Math.round(n) : Math.round(n * 1000);
}

/** 把接口里的 fragments 数组按原始顺序转成 parts，遇到未知类型也不丢正文。 */
function fragmentsToParts(fragments) {
  const parts = [];
  for (const frag of fragments || []) {
    const type = String(frag?.type || '').toUpperCase();
    const content = typeof frag?.content === 'string' ? frag.content : '';
    if (!content.trim() && type !== 'SEARCH') continue;

    if (type === 'REQUEST') {
      parts.push({ type: 'request', label: '提问', content });
    } else if (type === 'THINK') {
      parts.push({
        type: 'thinking',
        label: FRAGMENT_LABELS.THINK,
        content,
        elapsed: Number.isFinite(frag?.elapsed_secs) ? frag.elapsed_secs : null,
      });
    } else if (type === 'RESPONSE') {
      parts.push({ type: 'response', label: FRAGMENT_LABELS.RESPONSE, content });
    } else if (type === 'SEARCH') {
      parts.push({ type: 'search', label: FRAGMENT_LABELS.SEARCH, content: content || '（本次回答开始前进行了联网搜索）' });
    } else {
      parts.push({ type: 'extra', label: FRAGMENT_LABELS[type] || type || '其他片段', content });
    }
  }
  return parts;
}

/**
 * 按 parent_id 把接口返回的扁平数组重排成对话链顺序。
 * DeepSeek 接口的 messages 数组不保证是链序（它自己的前端也是拿 parent_id
 * 在数组里 find 子消息），而同一次提问的用户/助手消息 inserted_at 可能完全相同
 * （同一请求写入），只按时间戳或数组顺序排会出现「回答跑到提问前面」。
 * 跟官方前端一致：每个父消息取数组里第一条子消息，沿链走到底；孤儿消息按原顺序补在后面。
 */
function orderMessages(rawMessages) {
  if (!Array.isArray(rawMessages) || rawMessages.length < 2) return rawMessages || [];
  const ids = new Set(rawMessages.map((m) => m?.message_id).filter((v) => v != null));
  if (ids.size === 0) return rawMessages;
  const firstChildOf = new Map();
  for (const m of rawMessages) {
    const pid = m?.parent_id;
    if (pid != null && !firstChildOf.has(pid)) firstChildOf.set(pid, m);
  }
  const root = rawMessages.find((m) => m?.parent_id == null || !ids.has(m.parent_id)) || rawMessages[0];
  const ordered = [];
  const seen = new Set();
  let cur = root;
  while (cur) {
    const id = cur?.message_id;
    if (id != null) {
      if (seen.has(id)) break; // 防环
      seen.add(id);
    }
    ordered.push(cur);
    const next = firstChildOf.get(id);
    cur = next && !seen.has(next?.message_id) ? next : null;
  }
  // 没接上的消息：只要它的父消息已入列就按数组顺序续上（应对数组乱序），
  // 最后实在接不上的（分叉的旧变体等）按原数组顺序补在末尾，不丢内容。
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const m of rawMessages) {
      const id = m?.message_id;
      if (id == null || seen.has(id)) continue;
      const pid = m?.parent_id;
      if (pid != null && seen.has(pid)) {
        seen.add(id);
        ordered.push(m);
        progressed = true;
      }
    }
  }
  for (const m of rawMessages) if (m?.message_id == null || !seen.has(m.message_id)) ordered.push(m);
  return ordered;
}

/**
 * 解析 /api/v0/share/content 的 biz_data。
 */
export function parseSharePayload(bizData, meta = {}) {
  const warnings = [];
  const rawMessages = orderMessages(Array.isArray(bizData?.messages) ? bizData.messages : []);

  const messages = rawMessages.map((m, i) => {
    const role = ROLE_MAP[String(m?.role || '').toUpperCase()] || 'assistant';
    const parts = fragmentsToParts(m?.fragments);
    return {
      index: i + 1,
      id: m?.message_id ?? null,
      role,
      ts: toMillis(m?.inserted_at),
      parts,
      hasThinking: parts.some((p) => p.type === 'thinking'),
    };
  });

  const withContent = messages.filter((m) => m.parts.length > 0);
  if (withContent.length === 0) {
    warnings.push('分享数据里没有可渲染的正文，已跳过空消息。');
  }

  const shareTitle = cleanTitle(bizData?.title);
  const isGeneric = GENERIC_TITLES.has(shareTitle.toLowerCase());
  let title = isGeneric ? '' : shareTitle;
  if (!title) {
    const derived = deriveTitleFromMessages(withContent);
    title = derived || 'DeepSeek 对话';
    if (derived) {
      warnings.push('分享接口没有返回真实对话标题（只给了通用占位标题），已用首条提问作为文档标题。');
    }
  }

  const hasTs = withContent.some((m) => Number.isFinite(m.ts));
  if (!hasTs) {
    warnings.push('分享数据里没有逐条时间戳，只能按对话所属日期归档（时间粒度只到日）。');
  }
  if (withContent.some((m) => m.hasThinking)) {
    warnings.push('回答里包含 DeepSeek 的思考过程，已单独标注并默认折叠，正文没有省略。');
  }

  const modelType = String(bizData?.model_type || '').trim();

  return {
    title,
    titleSource: isGeneric ? 'derived' : 'share',
    platform: 'deepseek',
    sourceLabel: 'DeepSeek',
    modelLabel: modelType ? `deepseek-${modelType}` : '',
    shareId: meta.shareId ?? null,
    sourceUrl: meta.sourceUrl ?? null,
    fetchedAt: meta.fetchedAt ?? Date.now(),
    timeZone: meta.timeZone,
    timeSource: hasTs ? 'message' : 'day',
    timeNote: hasTs
      ? '每条消息的时间取自 DeepSeek 分享数据中的 inserted_at（精确到秒），按本地时区换算。'
      : '来源未提供逐条时间，本文档按对话所属日期归档，时间粒度只到日。',
    messages: withContent,
    warnings,
  };
}
