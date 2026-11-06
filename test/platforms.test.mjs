import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseShareInput } from '../src/shareUrl.js';
import { parseSharePayload } from '../src/parseShare.js';
import { parsePastedText } from '../src/paste.js';
import { groupByDate } from '../src/groupByDate.js';
import { renderMarkdown } from '../src/renderMarkdown.js';
import { renderHtmlDocument } from '../src/renderHtml.js';
import { renderTranscript } from '../src/renderTranscript.js';
import { convertPaste, applyConversationOptions, normalizeOptions } from '../src/convert.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const TZ = 'Asia/Shanghai';
const meta = { shareId: 'x', sourceUrl: 'https://chat.deepseek.com/share/x', fetchedAt: 1777151747965, timeZone: TZ };

test('DeepSeek 分享链接正常识别', () => {
  const parsed = parseShareInput('https://chat.deepseek.com/share/95z1fr6y7rj4q5nmd0');
  assert.equal(parsed.platform, 'deepseek');
  assert.equal(parsed.platformLabel, 'DeepSeek');
});

test('ChatGPT / Claude / 其他域名的链接被明确拒绝', () => {
  for (const url of [
    'https://chatgpt.com/share/693df0fb-ab38-800f-83b2-96f4cc74826b',
    'https://chat.openai.com/share/693df0fb-ab38-800f-83b2-96f4cc74826b',
    'https://claude.ai/share/55718b5b-22de-4d58-96a3-f4718c9bea4a',
    'https://example.com/share/abc123',
  ]) {
    assert.throws(() => parseShareInput(url), /暂不支持/, url);
  }
});

test('粘贴模式：用户 / DeepSeek 标记切分；ChatGPT 字样不再是角色标记', () => {
  const conv = parsePastedText('用户：Q1\nDeepSeek：A1', { date: '2026-11-06', timeZone: TZ });
  assert.deepEqual(conv.messages.map((m) => m.role), ['user', 'assistant']);
  const noMark = parsePastedText('用户：Q1\nDeepSeek：A1\nChatGPT：这不是标记', { date: '2026-11-06', timeZone: TZ });
  assert.deepEqual(noMark.messages.map((m) => m.role), ['user', 'assistant']);
  assert.match(noMark.messages[1].parts[0].content, /ChatGPT：这不是标记/);
  const single = parsePastedText('只有一行「ChatGPT：xxx」的整段', { date: '2026-11-06', timeZone: TZ });
  assert.equal(single.messages.length, 1);
  assert.equal(single.messages[0].role, 'unknown');
});

const realSample = () => JSON.parse(readFileSync(path.join(here, '../samples/sample-share-api.json'), 'utf8')).data.biz_data;

test('选项 stripThinking：只留正文问答，思考过程与联网搜索片段删除', () => {
  const conv = applyConversationOptions(parseSharePayload(realSample(), meta), { stripThinking: true });
  for (const m of conv.messages) {
    for (const p of m.parts) assert.ok(['request', 'response'].includes(p.type), p.type);
  }
  const md = renderMarkdown(conv, groupByDate(conv));
  assert.doesNotMatch(md, /思考过程/);
  assert.match(conv.warnings.join('\n'), /只保留正文问答/);
});

test('选项默认值：不勾选任何删除项时行为与旧版一致（思考过程保留）', () => {
  const conv = applyConversationOptions(parseSharePayload(realSample(), meta), undefined);
  assert.deepEqual(normalizeOptions(undefined), { stripThinking: false, showTitle: true,
    docStyle: 'classic', showLink: true, showTime: true });
  assert.ok(conv.messages.some((m) => m.parts.some((p) => p.type === 'thinking')));
});

test('选项 showTitle / showLink：标题固定、原始链接不进文档与摘要', () => {
  const conv = applyConversationOptions(parseSharePayload(realSample(), meta), { showTitle: false, showLink: false });
  assert.equal(conv.title, 'DeepSeek 对话');
  assert.equal(conv.sourceUrl, null);
  const md = renderMarkdown(conv, groupByDate(conv));
  const html = renderHtmlDocument(conv, groupByDate(conv));
  assert.doesNotMatch(md, /原始链接/);
  assert.doesNotMatch(html, /原始链接/);
  assert.match(md, /# DeepSeek 对话/);
});

test('选项 showTime=false：不分日期、不带逐条时间、摘要 days 为空', () => {
  const conv = applyConversationOptions(parseSharePayload(realSample(), meta), { showTime: false });
  const groups = groupByDate(conv);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, '对话内容');
  for (const m of groups[0].messages) assert.equal(m.timeLabel, '');
  const md = renderMarkdown(conv, groups);
  assert.doesNotMatch(md, /对话日期：/);
  assert.match(conv.timeNote, /不含逐条时间/);
});

test('AI 对话稿：标准 Markdown、角色二级标题、含原始链接、不含思考过程', () => {
  const conv = parseSharePayload(realSample(), meta);
  const transcript = renderTranscript(conv, groupByDate(conv));
  assert.match(transcript, /^# DeepSeek 对话记录：/);
  assert.match(transcript, /- 原始对话链接：https:\/\/chat\.deepseek\.com\/share\/x/);
  assert.match(transcript, /## 用户/);
  assert.match(transcript, /## DeepSeek/);
  assert.doesNotMatch(transcript, /思考过程/);
  const lines = transcript.split('\n').filter((l) => /^## /.test(l));
  assert.ok(lines[0].startsWith('## 用户'));
  assert.ok(lines[1].startsWith('## DeepSeek'));
});

test('AI 对话稿跟随选项：不保存时间则无时间行，正文顺序不变', () => {
  const conv = applyConversationOptions(parseSharePayload(realSample(), meta), { showTime: false });
  const transcript = renderTranscript(conv, groupByDate(conv));
  assert.doesNotMatch(transcript, /时间：/);
  assert.match(transcript, /## 用户[\s\S]*## DeepSeek/);
});

test('粘贴模式 + 选项：convertPaste 端到端接受 options', () => {
  const built = convertPaste({ text: '用户：Q1\nDeepSeek：A1', date: '2026-11-06', tz: TZ, options: { stripThinking: true, showLink: false } });
  assert.equal(built.conversation.options.stripThinking, true);
  assert.equal(built.conversation.sourceUrl, null);
  assert.ok(built.transcript.includes('## 用户'));
  assert.ok(built.filenames.transcript.endsWith('_对话稿.md'));
});
