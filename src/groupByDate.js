import { dateKey, dateLabel, clockLabel } from './localtime.js';

/**
 * 按本地日期把消息分组，供 HTML / Markdown 文档分节。
 * fallbackDate 用于「粘贴全文」这种没有逐条时间的情况。
 */
export function groupByDate(conversation) {
  const { messages, timeZone } = conversation;
  const groups = [];
  const map = new Map();

  const unknownLabel = `对话日期未知（导入日期 ${dateKey(Date.now(), timeZone)}）`;
  messages.forEach((msg, i) => {
    const hasTs = Number.isFinite(msg.ts);
    const key = hasTs ? dateKey(msg.ts, timeZone) : conversation.fallbackDate || '对话日期未知';
    const label = hasTs
      ? dateLabel(msg.ts, timeZone)
      : conversation.fallbackDate
        ? dateLabel(Date.parse(`${key}T12:00:00Z`) || Date.now(), timeZone)
        : unknownLabel;
    let group = map.get(key);
    if (!group) {
      group = { key, label, messages: [] };
      map.set(key, group);
      groups.push(group);
    }
    group.messages.push({
      ...msg,
      order: i + 1,
      timeLabel: hasTs ? clockLabel(msg.ts, timeZone) : '',
      hasTs,
    });
  });

  groups.sort((a, b) => String(a.key).localeCompare(String(b.key)));
  for (const g of groups) {
    g.messages.sort((a, b) => {
      if (a.hasTs && b.hasTs) return a.ts - b.ts || a.order - b.order;
      return a.order - b.order;
    });
  }
  return groups;
}

export function dateRangeLabel(groups) {
  const keys = groups.map((g) => g.key).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
  if (keys.length === 0) return groups[0]?.key || '未标注日期';
  const sorted = [...keys].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return first === last ? first : `${first}_至_${last}`;
}

/** 文档头部用的「对话日期」一行：有逐条时间给区间，手动归档给日期，都没有就明确写未知 + 导入日期。 */
export function conversationDateLabel(conversation, groups) {
  if (conversation.timeSource === 'message') return dateRangeLabel(groups);
  if (conversation.timeSource === 'day' && conversation.fallbackDate) return conversation.fallbackDate;
  return `未知（导入日期 ${dateKey(Date.now(), conversation.timeZone)}）`;
}
