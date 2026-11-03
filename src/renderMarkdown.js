import { dateTimeLabel } from './localtime.js';
import { conversationDateLabel } from './groupByDate.js';

const ROLE_LABEL = { user: '用户', assistant: 'DeepSeek', system: '系统', unknown: '未标注角色' };

function quote(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => (line.trim() ? `> ${line}` : '>'))
    .join('\n');
}

function elapsedText(elapsed) {
  if (!Number.isFinite(elapsed)) return '';
  const sec = Math.round(elapsed);
  if (sec < 60) return `用时 ${sec} 秒`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `用时 ${m} 分 ${s} 秒`;
}

function renderPart(part) {
  if (part.type === 'thinking') {
    const tag = elapsedText(part.elapsed);
    return `> **思考过程${tag ? `（${tag}）**` : '**'}\n>\n${quote(part.content)}`;
  }
  if (part.type === 'search') {
    return `> **${part.label}**\n>\n${quote(part.content)}`;
  }
  if (part.type === 'extra') {
    return `> **${part.label}**\n>\n${quote(part.content)}`;
  }
  return String(part.content || '').trim();
}

export function renderMarkdown(conversation, groups) {
  const line = [];
  const totalMessages = conversation.messages.length;

  line.push(`# ${conversation.title}`);
  line.push('');
  line.push('> AI 对话存档');
  line.push(`> 来源：${conversation.sourceLabel || '未知来源'}`);
  if (conversation.sourceUrl) line.push(`> 原始链接：${conversation.sourceUrl}`);
  line.push(`> 对话日期：${conversationDateLabel(conversation, groups)}`);
  line.push(`> 导出时间：${dateTimeLabel(conversation.fetchedAt, conversation.timeZone)}（${conversation.timeZone}）`);
  line.push(`> 消息：${totalMessages} 条，分在 ${groups.length} 个日期`);
  if (conversation.modelLabel) line.push(`> 模型：${conversation.modelLabel}`);
  line.push(`> 时间说明：${conversation.timeNote}`);
  line.push('');
  line.push('---');
  line.push('');

  for (const group of groups) {
    line.push(`## ${group.label}`);
    line.push('');
    for (const msg of group.messages) {
      const head = msg.timeLabel ? `${msg.timeLabel} · ${ROLE_LABEL[msg.role] || msg.role}` : ROLE_LABEL[msg.role] || msg.role;
      line.push(`### ${head}`);
      line.push('');
      for (const part of msg.parts) {
        const body = renderPart(part);
        if (body) {
          line.push(body);
          line.push('');
        }
      }
    }
    line.push('');
  }

  line.push('---');
  line.push('');
  line.push(`由 deepseek-to-doc 从 AI 对话分享链接导出，共 ${totalMessages} 条消息。`);
  line.push('');

  return line.join('\n');
}
