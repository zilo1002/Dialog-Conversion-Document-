import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Archive } from '../src/archive.js';
import { convertPaste, summarize } from '../src/convert.js';

const dir = await mkdtemp(path.join(os.tmpdir(), 'd2d-archive-'));
const archive = new Archive(dir);

const sampleSummary = () => {
  const built = convertPaste({ text: '用户：帮我总结\nDeepSeek：总结如下。', date: '2026-11-04', tz: 'Asia/Shanghai' });
  return { summary: summarize(built), html: built.html, markdown: built.markdown };
};

test('存档：保存后能读回完整内容（HTML 与 Markdown 都在）', async () => {
  const entry = await archive.save(sampleSummary());
  assert.match(entry.id, /^[0-9a-f-]{36}$/);
  const got = await archive.get(entry.id);
  assert.equal(got.summary.title, entry.summary.title);
  assert.ok(got.html.includes('2026-11-04'));
  assert.ok(got.markdown.includes('### 用户'));
});

test('存档：列表按时间倒序，可多次重复读取下载', async () => {
  const e2 = await archive.save(sampleSummary());
  const list = await archive.list();
  assert.equal(list.length, 2);
  assert.equal(list[0].id, e2.id);
  // 同一份文档反复下载，内容一致
  const a = await archive.get(e2.id);
  const b = await archive.get(e2.id);
  assert.equal(a.markdown, b.markdown);
  assert.equal(a.html, b.html);
});

test('存档：删除单条后读不到，列表同步减少；再删返回 false', async () => {
  const list = await archive.list();
  const target = list[0];
  assert.equal(await archive.remove(target.id), true);
  assert.equal(await archive.get(target.id), null);
  assert.equal((await archive.list()).length, 1);
  assert.equal(await archive.remove(target.id), false);
});

test('存档：非法 id 与损坏文件都不炸', async () => {
  assert.equal(await archive.get('../../etc/passwd'), null);
  assert.equal(await archive.get(''), null);
  assert.equal(await archive.remove('nope'), false);
  const { writeFile } = await import('node:fs/promises');
  await writeFile(path.join(dir, 'broken.json'), '{oops');
  const list = await archive.list();
  assert.equal(list.length, 1);
});
