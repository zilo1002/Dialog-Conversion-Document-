import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseShareInput } from '../src/shareUrl.js';
import { parseChatGPTShare } from '../src/parseChatGPT.js';
import { parseClaudeShare } from '../src/parseClaude.js';
import { groupByDate } from '../src/groupByDate.js';
import { renderMarkdown } from '../src/renderMarkdown.js';
import { renderHtmlDocument } from '../src/renderHtml.js';
import { parsePastedText } from '../src/paste.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const TZ = 'Asia/Shanghai';
const meta = { shareId: 'x', sourceUrl: 'https://example.com/share/x', fetchedAt: 1777151747965, timeZone: TZ };

test('三个平台的链接都能分发', () => {
  assert.equal(parseShareInput('https://chat.deepseek.com/share/abc123').platform, 'deepseek');
  assert.equal(parseShareInput('https://chatgpt.com/share/693df0fb-ab38-800f-83b2-96f4cc74826b').platform, 'chatgpt');
  assert.equal(parseShareInput('https://chat.openai.com/share/693df0fb-ab38-800f-83b2-96f4cc74826b').platform, 'chatgpt');
  assert.equal(parseShareInput('https://claude.ai/share/55718b5b-22de-4d58-96a3-f4718c9bea4a').platform, 'claude');
  assert.throws(() => parseShareInput('https://example.com/share/abc123'), /暂不支持/);
});

test('ChatGPT 合成样本：标题、角色、逐条时间、代码块、附件不丢', () => {
  const html = readFileSync(path.join(here, '../samples/sample-chatgpt-share.html'), 'utf8');
  const conv = parseChatGPTShare(html, meta);
  assert.equal(conv.platform, 'chatgpt');
  assert.equal(conv.title, 'Go board prompt');
  assert.equal(conv.messages.length, 2);
  assert.equal(conv.messages[0].role, 'user');
  assert.equal(conv.messages[1].role, 'assistant');
  assert.equal(conv.timeSource, 'message');
  const groups = groupByDate(conv);
  assert.equal(groups[0].key, '2026-04-26');
  const answer = conv.messages[1].parts[0].content;
  assert.match(answer, /```text/);
  assert.match(answer, /image_asset_pointer 附件：file-service:\/\/file-abc/);
  const md = renderMarkdown(conv, groups);
  assert.match(md, /> 来源：ChatGPT/);
  assert.match(md, /> 对话日期：2026-04-26/);
  assert.match(md, /> 原始链接：https:\/\/example.com\/share\/x/);
  const htmlDoc = renderHtmlDocument(conv, groups);
  assert.ok(htmlDoc.includes('来源：ChatGPT'));
  assert.ok(htmlDoc.includes('对话日期：2026-04-26'));
});

test('ChatGPT 没时间戳时明确写「日期未知」不编造', () => {
  const html = readFileSync(path.join(here, '../samples/sample-chatgpt-share.html'), 'utf8').replace(/"create_time":\s*\d+/g, '"create_time": 0');
  const conv = parseChatGPTShare(html, meta);
  assert.equal(conv.timeSource, 'unknown');
  const groups = groupByDate(conv);
  assert.match(groups[0].label, /对话日期未知（导入日期 \d{4}-\d{2}-\d{2}）/);
  const md = renderMarkdown(conv, groups);
  assert.match(md, /> 对话日期：未知（导入日期 \d{4}-\d{2}-\d{2}）/);
});

test('Claude 合成样本：sender/content 块、ISO 时间、图片附件保留链接', () => {
  const html = readFileSync(path.join(here, '../samples/sample-claude-share.html'), 'utf8');
  const conv = parseClaudeShare(html, meta);
  assert.equal(conv.platform, 'claude');
  assert.equal(conv.title, '快速排序实现');
  assert.equal(conv.messages.length, 2);
  assert.equal(conv.messages[0].role, 'user');
  assert.equal(conv.timeSource, 'message');
  const groups = groupByDate(conv);
  assert.equal(groups[0].key, '2026-04-26');
  const answer = conv.messages[1].parts[0].content;
  assert.match(answer, /```python/);
  assert.match(answer, /image 附件：https:\/\/example.com\/diagram\.png/);
  const md = renderMarkdown(conv, groups);
  assert.match(md, /> 来源：Claude/);
});

test('Claude 解析失败给明确原因', () => {
  assert.throws(() => parseClaudeShare('<html><body>empty</body></html>', meta), /粘贴全文/);
});

test('粘贴模式认 ChatGPT / Claude 的标记行', () => {
  const conv = parsePastedText('You said: 写个标题\nChatGPT said: 标题叫《慢一点》。\n\nClaude：另一种思路是给副标题。', { timeZone: TZ, date: '2026-11-04' });
  assert.equal(conv.messages.length, 3);
  assert.equal(conv.messages[0].role, 'user');
  assert.equal(conv.messages[1].role, 'assistant');
  assert.equal(conv.messages[2].role, 'assistant');
  assert.match(conv.sourceLabel, /ChatGPT/);
  const md = renderMarkdown(conv, groupByDate(conv));
  assert.match(md, /## 2026-11-04 星期三/);
});
