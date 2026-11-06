import test from 'node:test';
import assert from 'node:assert/strict';

import { parseSharePayload } from '../src/parseShare.js';
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

test('粘贴模式多轮：按标记切分后保持「先问后答」', () => {
  const conv = parsePastedText('用户：Q1\nDeepSeek：A1\n\n用户：Q2\nDeepSeek：A2', { date: '2026-11-01', timeZone: TZ });
  assert.deepEqual(roleSeq(conv), ['user', 'assistant', 'user', 'assistant']);
});
