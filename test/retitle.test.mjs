import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTitle } from '../public/retitle.js';
import { convertPaste } from '../src/convert.js';

const TZ = 'Asia/Shanghai';
const built = () => convertPaste({ text: '用户：Q1\nDeepSeek：A1', date: '2026-11-06', tz: TZ });

test('重命名：四份输出的标题同步替换，正文不动，原对象不被修改', () => {
  const entry = { id: 'x', summary: { title: '旧标题', filenames: { html: 'a.html', markdown: 'a.md', transcript: 'a_对话稿.md' } }, ...built() };
  const snapshot = JSON.stringify(entry);
  const renamed = applyTitle(entry, '新标题<测试>&$&');
  assert.equal(renamed.summary.title, '新标题<测试>&$&');
  assert.equal(renamed.title, '新标题<测试>&$&'); // 顶层 title 同步（结果页标题用）
  assert.match(renamed.html, /<title>新标题&lt;测试&gt;&amp;\$&amp; · DeepSeek 对话存档<\/title>/);
  assert.match(renamed.html, /<h1 class="doc-title">新标题&lt;测试&gt;&amp;\$&amp;<\/h1>/);
  assert.doesNotMatch(renamed.html, /旧标题/);
  assert.match(renamed.markdown, /^# 新标题<测试>&\$&$/m);
  assert.match(renamed.transcript, /^# DeepSeek 对话记录：新标题<测试>&\$&$/m);
  assert.match(renamed.plaintext, /^DeepSeek 对话记录：新标题<测试>&\$&$/m);
  // 正文未动
  assert.match(renamed.markdown, /Q1[\s\S]*A1/);
  assert.match(renamed.html, /Q1/);
  // 文件名同步且去掉非法字符
  assert.equal(renamed.summary.filenames.html, '新标题_测试_&$&.html');
  assert.equal(renamed.summary.filenames.markdown, '新标题_测试_&$&.md');
  assert.equal(renamed.summary.filenames.transcript, '新标题_测试_&$&_对话稿.md');
  // 原 entry 未被修改
  assert.equal(JSON.stringify(entry), snapshot);
  assert.equal(entry.summary.title, '旧标题');
});

test('重命名：标题为空或没变时原样返回；Markdown 的 ### 角色标题不受影响', () => {
  const entry = { id: 'x', summary: { title: 'T' }, ...built() };
  assert.equal(applyTitle(entry, ''), entry);
  assert.equal(applyTitle(entry, 'T'), entry);
  const renamed = applyTitle(entry, '改个名');
  assert.match(renamed.markdown, /^### 用户$/m);
  assert.match(renamed.markdown, /^### DeepSeek$/m);
});
