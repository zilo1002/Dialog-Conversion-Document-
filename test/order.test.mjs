import test from 'node:test';
import assert from 'node:assert/strict';

import { parseSharePayload } from '../src/parseShare.js';
import { parseChatGPTShare } from '../src/parseChatGPT.js';
import { parseClaudeShare } from '../src/parseClaude.js';
import { parsePastedText } from '../src/paste.js';
import { groupByDate } from '../src/groupByDate.js';

const TZ = 'Asia/Shanghai';
const meta = { shareId: 'x', sourceUrl: 'https://example.com/share/x', fetchedAt: 1777151747965, timeZone: TZ };
const roleSeq = (conv) => groupByDate(conv).flatMap((g) => g.messages.map((m) => m.role));
const seqText = (conv) => groupByDate(conv).flatMap((g) => g.messages.map((m) => m.parts.map((p) => p.content).join('|')).filter(Boolean)).join(',');

function dsMessage(id, parentId, role, at, ...frags) {
  return { message_id: id, parent_id: parentId, role, inserted_at: at, fragments: frags.map(([t, c]) => ({ type: t, content: c })) };
}
function dsPayload(messages, title = 'Shared Conversation') {
  return { title, model_type: 'expert', messages };
}

test('DeepSeek 多轮：接口数组倒序 + 用户/助手时间戳相同，仍按「先问后答」输出', () => {
  const ordered = [
    dsMessage(275, 268, 'USER', 1777151747.965, ['REQUEST', 'Q1']),
    dsMessage(276, 275, 'ASSISTANT', 1777151747.965, ['RESPONSE', 'A1']),
    dsMessage(280, 276, 'USER', 1777161000.001, ['REQUEST', 'Q2']),
    dsMessage(281, 280, 'ASSISTANT', 1777161000.001, ['RESPONSE', 'A2']),
  ];
  const conv = parseSharePayload(dsPayload([...ordered].reverse()), meta);
  assert.deepEqual(roleSeq(conv), ['user', 'assistant', 'user', 'assistant']);
  assert.equal(seqText(conv), 'Q1,A1,Q2,A2');
});

test('DeepSeek：时间戳完全相同的多轮对话按 parent_id 链序输出（不靠时间戳）', () => {
  const conv = parseSharePayload(
    dsPayload([
      dsMessage(2, 1, 'ASSISTANT', 1777151747.965, ['RESPONSE', 'A1']),
      dsMessage(4, 3, 'ASSISTANT', 1777151747.965, ['RESPONSE', 'A2']),
      dsMessage(1, 0, 'USER', 1777151747.965, ['REQUEST', 'Q1']),
      dsMessage(3, 2, 'USER', 1777151747.965, ['REQUEST', 'Q2']),
    ]),
    meta,
  );
  assert.equal(seqText(conv), 'Q1,A1,Q2,A2');
});

test('DeepSeek：parent 链分叉时沿第一条子消息走，接不上的变体补在末尾且不丢内容', () => {
  const conv = parseSharePayload(
    dsPayload([
      dsMessage(1, 0, 'USER', 1777151747.965, ['REQUEST', 'Q1']),
      dsMessage(3, 1, 'ASSISTANT', 1777151800.0, ['RESPONSE', 'A1当前']),
      dsMessage(4, 3, 'USER', 1777161000.0, ['REQUEST', 'Q2']),
      dsMessage(2, 1, 'ASSISTANT', 1777151750.0, ['RESPONSE', 'A1旧变体']),
    ]),
    meta,
  );
  // 与官方前端一致：每个父消息取数组里第一条子消息，沿链走到底；
  // 分叉的旧变体接不上链，按数组顺序补在末尾
  const texts = groupByDate(conv).flatMap((g) => g.messages.map((m) => m.parts.map((p) => p.content).join('|')));
  assert.deepEqual(texts, ['Q1', 'A1当前', 'Q2', 'A1旧变体']);
  const roles = roleSeq(conv);
  assert.deepEqual(roles.slice(0, 3), ['user', 'assistant', 'user']);
});

test('ChatGPT 多轮：重新生成的分支只导出当前回答，提问不会被挤到重复回答下面', () => {
  const mapping = {
    u2: { id: 'u2', message: { author: { role: 'user' }, content: { parts: ['Q2'] }, create_time: 1777161000 }, parent: 'a1', children: ['a2'] },
    root: { id: 'root', message: null, parent: null, children: ['u1'] },
    a2old: { id: 'a2old', message: { author: { role: 'assistant' }, content: { parts: ['A2旧变体'] }, create_time: 1777161020 }, parent: 'u2', children: [] },
    a2: { id: 'a2', message: { author: { role: 'assistant' }, content: { parts: ['A2当前'] }, create_time: 1777161030 }, parent: 'u2', children: [] },
    a1: { id: 'a1', message: { author: { role: 'assistant' }, content: { parts: ['A1'] }, create_time: 1777151800 }, parent: 'u1', children: ['u2'] },
    u1: { id: 'u1', message: { author: { role: 'user' }, content: { parts: ['Q1'] }, create_time: 1777151747 }, parent: 'root', children: ['a1'] },
  };
  const html =
    '<!doctype html><html><head><script id="__NEXT_DATA__" type="application/json">' +
    JSON.stringify({ props: { pageProps: { serverResponse: { data: { title: 'T', mapping, current_node: 'a2' } } } } }) +
    '</script></head><body></body></html>';
  const conv = parseChatGPTShare(html, meta);
  assert.deepEqual(roleSeq(conv), ['user', 'assistant', 'user', 'assistant']);
  const texts = conv.messages.map((m) => m.parts.map((p) => p.content).join('|'));
  assert.deepEqual(texts, ['Q1', 'A1', 'Q2', 'A2当前']);
});

test('Claude 多轮：chat_messages 带 index 时按 index 还原先后，数组倒序也能正确排', () => {
  const messages = [
    { sender: 'assistant', index: 3, created_at: '2026-11-01T11:00:15Z', content: [{ type: 'text', text: 'A2' }] },
    { sender: 'human', index: 0, created_at: '2026-11-01T10:00:00Z', content: [{ type: 'text', text: 'Q1' }] },
    { sender: 'human', index: 2, created_at: '2026-11-01T11:00:00Z', content: [{ type: 'text', text: 'Q2' }] },
    { sender: 'assistant', index: 1, created_at: '2026-11-01T10:00:20Z', content: [{ type: 'text', text: 'A1' }] },
  ];
  const html =
    '<!doctype html><html><head><script id="__NEXT_DATA__" type="application/json">' +
    JSON.stringify({ props: { pageProps: { serverData: { name: 'T', chat_messages: messages } } } }) +
    '</script></head><body></body></html>';
  const conv = parseClaudeShare(html, meta);
  const texts = conv.messages.map((m) => m.parts.map((p) => p.content).join('|'));
  assert.deepEqual(texts, ['Q1', 'A1', 'Q2', 'A2']);
});

test('粘贴模式多轮：按标记切分后保持「先问后答」', () => {
  const conv = parsePastedText('用户：Q1\nDeepSeek：A1\n\n用户：Q2\nDeepSeek：A2', { date: '2026-11-01', timeZone: TZ });
  assert.deepEqual(roleSeq(conv), ['user', 'assistant', 'user', 'assistant']);
});
