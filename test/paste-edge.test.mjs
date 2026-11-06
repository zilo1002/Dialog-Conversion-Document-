import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePastedText } from '../src/paste.js';
import { localDateString } from '../public/localdate.js';

const TZ = 'Asia/Shanghai';

test('粘贴模式：第一条角色标记之前的文字不丢（作为未标注角色记录放在最前）', () => {
  const conv = parsePastedText('先说个背景：这是 yesterday 的讨论。\n用户：Q1\nDeepSeek：A1', { date: '2026-11-06', timeZone: TZ });
  assert.deepEqual(conv.messages.map((m) => m.role), ['unknown', 'user', 'assistant']);
  assert.equal(conv.messages[0].parts[0].content, '先说个背景：这是 yesterday 的讨论。');
  assert.equal(conv.messages[1].parts[0].content, 'Q1');
});

test('粘贴模式：代码块里的「用户：」「DeepSeek：」不会被当成消息边界', () => {
  const text = [
    '用户：给我一个 prompt 模板',
    'DeepSeek：好的，模板如下：',
    '```',
    '用户：<在这里填你的问题>',
    'DeepSeek：<AI 的回答>',
    '```',
    '用户：谢谢',
    'DeepSeek：不客气。',
  ].join('\n');
  const conv = parsePastedText(text, { date: '2026-11-06', timeZone: TZ });
  assert.deepEqual(conv.messages.map((m) => m.role), ['user', 'assistant', 'user', 'assistant']);
  const assistant = conv.messages[1].parts[0].content;
  assert.match(assistant, /用户：<在这里填你的问题>/);
  assert.match(assistant, /DeepSeek：<AI 的回答>/);
  assert.match(assistant, /```/);
});

test('粘贴模式：~~~ 围栏同样不切分；未闭合围栏后面的内容并入上一条', () => {
  const conv = parsePastedText('用户：Q\nDeepSeek：看示例\n~~~\n用户：假标记\n更多示例文字', { date: '2026-11-06', timeZone: TZ });
  assert.deepEqual(conv.messages.map((m) => m.role), ['user', 'assistant']);
  assert.match(conv.messages[1].parts[0].content, /假标记/);
});

test('粘贴模式：全部标记都在代码块里时整段成一条（不误切）', () => {
  const conv = parsePastedText('```\n用户：假\nDeepSeek：也假\n```\n补充说明', { date: '2026-11-06', timeZone: TZ });
  assert.equal(conv.messages.length, 1);
  assert.equal(conv.messages[0].role, 'unknown');
});

// —— 前端默认日期：本机时区，不是 UTC ——
test('localDateString：UTC+8 凌晨 0-8 点仍显示当天（旧实现会填前一天）', () => {
  // 上海本地 2026-11-06 07:00 = UTC 2026-11-05T23:00:00Z
  assert.equal(localDateString(new Date('2026-11-05T23:00:00Z'), 480), '2026-11-06');
});

test('localDateString：西半球（UTC-10）晚上仍是当天（旧实现会填第二天）', () => {
  // 檀香山本地 2026-11-06 20:00 = UTC 2026-11-07T06:00:00Z
  assert.equal(localDateString(new Date('2026-11-07T06:00:00Z'), -600), '2026-11-06');
});
