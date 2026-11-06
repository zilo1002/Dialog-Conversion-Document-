import { conversationDateLabel } from './groupByDate.js';

const ROLE_LABEL = { user: '用户', assistant: 'DeepSeek', system: '系统', unknown: '对话' };

/**
 * 「AI 对话稿」输出：给其他 AI 应用（ChatGPT / Claude / Kimi / Grok / Today 等）直接用。
 * 形式是标准 Markdown：标题、原始 DeepSeek 分享链接块、按对话先后用「## 用户 / ## DeepSeek」
 * 标注角色，正文原样保留。任何支持粘贴文本的 AI 应用都能识别，不依赖各应用能否打开外链。
 * 永远不含思考过程等非正文内容；时间信息跟随生成选项。
 */
export function renderTranscript(conversation, groups) {
  const showTime = !(conversation.options && conversation.options.showTime === false);
  const lines = [];
  lines.push(`# DeepSeek 对话记录：${conversation.title}`);
  if (conversation.sourceUrl) lines.push(`- 原始对话链接：${conversation.sourceUrl}`);
  if (showTime) lines.push(`- 时间：${conversationDateLabel(conversation, groups)}`);
  lines.push('- 说明：以下为完整对话正文，角色用二级标题标注，可直接引用或继续提问。');
  lines.push('');
  for (const group of groups) {
    if (showTime && groups.length > 1) {
      lines.push(`<!-- ${group.label} -->`);
    }
    for (const msg of group.messages) {
      const stamp = showTime && msg.timeLabel ? `（${msg.timeLabel}）` : '';
      lines.push(`## ${ROLE_LABEL[msg.role] || msg.role}${stamp}`);
      lines.push('');
      for (const part of msg.parts) {
        if (part.type !== 'request' && part.type !== 'response') continue;
        const body = String(part.content || '').trim();
        if (body) {
          lines.push(body);
          lines.push('');
        }
      }
    }
  }
  lines.push(`---`);
  lines.push(`共 ${conversation.messages.length} 条消息，由 deepseek-to-doc 从 DeepSeek 分享链接导出。`);
  lines.push('');
  return lines.join('\n');
}
