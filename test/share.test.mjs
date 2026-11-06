import test from 'node:test';
import assert from 'node:assert/strict';

import { convertPaste } from '../src/convert.js';

const TZ = 'Asia/Shanghai';

test('buildResult 产出四个分享出口：html / transcript / plaintext / share(结构化)', () => {
  const built = convertPaste({ text: '用户：Q1\nDeepSeek：A1', date: '2026-11-06', tz: TZ });
  // HTML 主入口：完整文档、无脚本依赖
  assert.match(built.html, /<html/);
  assert.doesNotMatch(built.html, /<script/i);
  assert.match(built.html, /Q1/);
  // .md 出口复用对话稿
  assert.match(built.transcript, /## 用户/);
  // .txt 纯文本：无 Markdown 语法，【角色】行
  assert.match(built.plaintext, /【用户】/);
  assert.match(built.plaintext, /【DeepSeek】/);
  assert.doesNotMatch(built.plaintext, /^##/m);
  // .json 结构化：元信息 + 逐条消息
  assert.equal(built.share.messageCount, 2);
  assert.equal(built.share.messages.length, 2);
  assert.deepEqual(built.share.messages.map((m) => m.role), ['user', 'assistant']);
  assert.equal(built.share.messages[0].content, 'Q1');
  assert.equal(built.share.messages[1].content, 'A1');
  assert.equal(built.share.messages[0].time, null); // 粘贴模式无逐条时间
  assert.equal(built.share.title, 'Q1');
});

test('share 结构化数据跟随生成选项并可直接 JSON 序列化', () => {
  const built = convertPaste({
    text: '用户：Q1\nDeepSeek：A1',
    date: '2026-11-06',
    tz: TZ,
    options: { showLink: false, showTime: false },
  });
  assert.equal(built.share.sourceUrl, null);
  assert.deepEqual(built.share.days, []);
  assert.equal(built.share.timeSource, 'hidden');
  assert.equal(built.share.messages[0].time, null);
  const round = JSON.parse(JSON.stringify(built.share));
  assert.equal(round.messages.length, 2);
});

test('DeepSeek 真实样本的 share 数据含思考过程分片与时间', async () => {
  const { readFileSync } = await import('node:fs');
  const { parseSharePayload } = await import('../src/parseShare.js');
  const { applyConversationOptions, buildResult } = await import('../src/convert.js');
  const bizData = JSON.parse(readFileSync('samples/sample-share-api.json', 'utf8')).data.biz_data;
  const conv = parseSharePayload(bizData, { shareId: 'x', sourceUrl: 'https://chat.deepseek.com/share/x', fetchedAt: 1777151747965, timeZone: TZ });
  const built = buildResult(applyConversationOptions(conv));
  const assistant = built.share.messages.find((m) => m.role === 'assistant');
  assert.ok(assistant.parts.some((p) => p.type === 'thinking'));
  assert.ok(Number.isFinite(assistant.parts.find((p) => p.type === 'thinking').elapsedSecs));
  assert.ok(assistant.time, assistant.time);
  assert.equal(built.plaintext.includes('思考'), false); // 纯文本与对话稿都不含思考过程
  assert.equal(built.transcript.includes('思考'), false);
});
