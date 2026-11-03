import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseShareInput } from '../src/shareUrl.js';
import { parseSharePayload } from '../src/parseShare.js';
import { groupByDate, dateRangeLabel } from '../src/groupByDate.js';
import { renderMarkdown } from '../src/renderMarkdown.js';
import { renderHtmlDocument } from '../src/renderHtml.js';
import { parsePastedText } from '../src/paste.js';
import { safeFileBase } from '../src/filenames.js';
import { dateLabel } from '../src/localtime.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(readFileSync(path.join(here, '../samples/sample-share-api.json'), 'utf8')).data.biz_data;

const TZ = 'Asia/Shanghai';
const conversation = () =>
  parseSharePayload(sample, {
    shareId: '95z1fr6y7rj4q5nmd0',
    sourceUrl: 'https://chat.deepseek.com/share/95z1fr6y7rj4q5nmd0',
    fetchedAt: 1777151747965,
    timeZone: TZ,
  });

test('分享链接的各种粘贴形式都能解析出 share id', () => {
  const a = parseShareInput('https://chat.deepseek.com/share/95z1fr6y7rj4q5nmd0');
  assert.equal(a.shareId, '95z1fr6y7rj4q5nmd0');

  const b = parseShareInput('  https://chat.deepseek.com/share/abc123?from=web&x=1  ');
  assert.equal(b.shareId, 'abc123');

  const c = parseShareInput('95z1fr6y7rj4q5nmd0');
  assert.equal(c.canonicalUrl, 'https://chat.deepseek.com/share/95z1fr6y7rj4q5nmd0');
});

test('非 DeepSeek 链接被明确拒绝', () => {
  assert.throws(() => parseShareInput('https://example.com/share/abc123'), /暂不支持/);
  assert.throws(() => parseShareInput(''), /粘贴/);
});

test('真实样本：两条消息、角色、思考过程与耗时都对', () => {
  const conv = conversation();
  assert.equal(conv.messages.length, 2);
  assert.equal(conv.messages[0].role, 'user');
  assert.equal(conv.messages[1].role, 'assistant');
  const parts = conv.messages[1].parts;
  assert.equal(parts[0].type, 'thinking');
  assert.ok(parts[0].elapsed > 19 && parts[0].elapsed < 21);
  assert.equal(parts[1].type, 'response');
  assert.match(parts[1].content, /```/);
  assert.equal(conv.timeSource, 'message');
  assert.equal(conv.modelLabel, 'deepseek-expert');
});

test('时间戳按本地时区归到 2026-04-26', () => {
  const conv = conversation();
  const groups = groupByDate(conv);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, '2026-04-26');
  assert.equal(groups[0].messages[0].timeLabel, '05:15');
  assert.equal(dateLabel(Date.UTC(2026, 3, 25, 21, 15), TZ), '2026-04-26 星期日');
  assert.equal(dateRangeLabel(groups), '2026-04-26');
});

test('通用标题会被首条提问替换，并给出提示', () => {
  const conv = conversation();
  assert.equal(conv.titleSource, 'derived');
  assert.match(conv.title, /go board prompt/);
  assert.ok(conv.warnings.some((w) => w.includes('标题')));
});

test('Markdown 文档：日期分节、思考过程、代码块换行都在', () => {
  const conv = conversation();
  const md = renderMarkdown(conv, groupByDate(conv));
  assert.match(md, /^# /);
  assert.match(md, /## 2026-04-26 星期日/);
  assert.match(md, /> \*\*思考过程（用时 20 秒）\*\*/);
  assert.match(md, /```/);
  assert.match(md, /A B C D E F G H I/);
});

test('HTML 文档：日期区块、思考折叠、代码块语言标签', () => {
  const conv = conversation();
  const html = renderHtmlDocument(conv, groupByDate(conv));
  assert.match(html, /<!doctype html>/);
  assert.match(html, /<h2>2026-04-26 星期日<\/h2>/);
  assert.match(html, /<details class="thinking"><summary>思考过程 · 20 秒<\/summary>/);
  assert.match(html, /class="code-lang">text</);
  assert.ok(html.includes('A B C D E F G H I'));
  assert.ok(!html.includes('<script'));
});

test('内容里的原始 HTML 会被转义，不会注入文档', () => {
  const evil = {
    messages: [
      { role: 'USER', inserted_at: 1777151747, fragments: [{ type: 'REQUEST', content: 'hi' }] },
      { role: 'ASSISTANT', inserted_at: 1777151748, fragments: [{ type: 'RESPONSE', content: '<img src=x onerror=alert(1)>' }] },
    ],
  };
  const conv = parseSharePayload(evil, { timeZone: TZ });
  const html = renderHtmlDocument(conv, groupByDate(conv));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img'));
});

test('未知片段类型不会被静默丢弃', () => {
  const payload = {
    messages: [{ role: 'ASSISTANT', inserted_at: 1777151747, fragments: [{ type: 'SEARCH', content: '检索了 3 条结果' }, { type: 'RESPONSE', content: '答案' }] }],
  };
  const conv = parseSharePayload(payload, { timeZone: TZ });
  assert.equal(conv.messages[0].parts.length, 2);
  assert.equal(conv.messages[0].parts[0].type, 'search');
});

test('粘贴模式：角色标记', () => {
  const conv = parsePastedText('用户：写个冒泡排序\nDeepSeek：好的，代码如下：\n\n```js\n[1].sort()\n```', { timeZone: TZ, date: '2026-11-04' });
  assert.equal(conv.messages.length, 2);
  assert.equal(conv.messages[0].role, 'user');
  assert.equal(conv.messages[1].role, 'assistant');
  assert.equal(conv.timeSource, 'day');
  assert.equal(conv.fallbackDate, '2026-11-04');
  const md = renderMarkdown(conv, groupByDate(conv));
  assert.match(md, /## 2026-11-04 星期三/);
  assert.match(md, /```js/);
});

test('粘贴模式：从网页复制的「Thought for N seconds」也能切分', () => {
  const pasted = [
    'Shared Conversation',
    'This shared conversation is generated by AI, for reference only.',
    '帮我起个标题',
    'Thought for 12 seconds',
    '先想一下标题的几种写法，再给结论。',
    '标题可以叫《慢一点》。',
    'Continue with DeepSeek',
  ].join('\n');
  const conv = parsePastedText(pasted, { timeZone: TZ, date: '2026-11-04' });
  assert.equal(conv.messages.length, 2);
  assert.equal(conv.messages[0].role, 'user');
  assert.equal(conv.messages[0].parts[0].content, '帮我起个标题');
  assert.match(conv.messages[1].parts[0].content, /Thought for 12 seconds/);
  assert.ok(!conv.messages[1].parts[0].content.includes('Continue with DeepSeek'));
});

test('粘贴模式：认不出角色也照样出文档', () => {
  const conv = parsePastedText('一段没有任何标记的对话内容。\n\n第二段。', { timeZone: TZ, date: '2026-11-04' });
  assert.equal(conv.messages.length, 1);
  assert.equal(conv.messages[0].role, 'unknown');
  assert.ok(conv.warnings.some((w) => w.includes('没有识别出角色')));
  const html = renderHtmlDocument(conv, groupByDate(conv));
  assert.ok(html.includes('未标注角色'));
});

test('文件名去掉非法字符并带上日期', () => {
  const base = safeFileBase('a/b:c*d?', '2026-04-26');
  assert.equal(base, 'a-b-c-d_2026-04-26');
});
