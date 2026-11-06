import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDocStyle } from '../public/retitle.js';
import { mergedHtml, mergedMarkdown } from '../public/batchExport.js';
import { convertPaste, DEFAULT_OPTIONS } from '../src/convert.js';

const TZ = 'Asia/Shanghai';
const built = (title, text) => convertPaste({ text, title, date: '2026-11-06', tz: TZ });
const entry = (title, text) => ({ id: `id-${title}`, createdAt: Date.now(), summary: { title }, ...built(title, text) });

test('排版风格：normalizeOptions 校验 docStyle，默认 classic', () => {
  assert.equal(DEFAULT_OPTIONS.docStyle, 'classic');
  const c = built('默认', '用户：Q\nDeepSeek：A');
  assert.match(c.html, /<body class="doc-classic">/);
});

test('排版风格：三种风格按选项渲染到 body class，正文不受影响', () => {
  for (const style of ['classic', 'plain', 'bubbles']) {
        const r = convertPaste({ text: '用户：Q\nDeepSeek：A', title: '风格', date: '2026-11-06', tz: TZ, options: { docStyle: style } });
    assert.match(r.html, new RegExp(`<body class="doc-${style}">`));
    assert.match(r.html, /<h1 class="doc-title">风格<\/h1>/);
    assert.match(r.html, /Q[\s\S]*A/);
  }
});

test('排版风格：非法 docStyle 回落 classic，样式表三套主题都在', () => {
  const r = convertPaste({ text: '用户：Q\nDeepSeek：A', title: 'x', date: '2026-11-06', tz: TZ, options: { docStyle: 'hacker' } });
  assert.match(r.html, /<body class="doc-classic">/);
  assert.match(r.html, /body\.doc-plain/);
  assert.match(r.html, /body\.doc-bubbles/);
});

test('applyDocStyle：切换 body class 并同步 options / summary.options，原对象不变', () => {
  const e = entry('原名', '用户：Q1\nDeepSeek：A1');
  const snap = JSON.stringify(e);
  const renamed = applyDocStyle(e, 'bubbles');
  assert.match(renamed.html, /<body class="doc-bubbles">/);
  assert.doesNotMatch(renamed.html, /doc-classic">/);
  assert.equal(renamed.options.docStyle, 'bubbles');
  assert.equal(renamed.summary.options.docStyle, 'bubbles');
  assert.match(renamed.html, /<h1 class="doc-title">原名<\/h1>/); // 正文不动
  assert.equal(JSON.stringify(e), snap); // 原 entry 未被修改
  assert.equal(applyDocStyle(e, 'hacker'), e); // 非法风格原样返回
  assert.equal(applyDocStyle(e, 'classic'), e); // 没变原样返回
});

test('mergedMarkdown：封面 + 两篇内容齐全，按传入顺序保留各自标题', () => {
  const a = entry('甲篇', '用户：Q甲\nDeepSeek：A甲');
  const b = entry('乙篇', '用户：Q乙\nDeepSeek：A乙');
  const md = mergedMarkdown([a, b]);
  assert.match(md, /^# DeepSeek 对话合订本$/m);
  assert.match(md, /> 收录：2 篇/);
  const iA = md.indexOf('# 甲篇');
  const iB = md.indexOf('# 乙篇');
  assert.ok(iA > 0 && iB > iA);
  assert.match(md, /Q甲[\s\S]*A乙/);
  assert.equal(mergedMarkdown([]), null);
  assert.equal(mergedMarkdown(null), null);
});

test('mergedHtml：合订本用第一篇风格，两篇正文与分节齐全，只保留一份封面标题', () => {
  const a = { ...entry('甲篇', '用户：Q甲\nDeepSeek：A甲'), options: { docStyle: 'plain' }, summary: { title: '甲篇', options: { docStyle: 'plain' } } };
  const a2 = applyDocStyle(a, 'bubbles');
  const b = entry('乙篇', '用户：Q乙\nDeepSeek：A乙');
  const html = mergedHtml([a2, b]);
  assert.match(html, /<body class="doc-bubbles">/); // 沿用第一篇
  assert.match(html, /<h1 class="doc-title">DeepSeek 对话合订本<\/h1>/);
  assert.match(html, /收录 2 篇</);
  assert.match(html, /class="doc-item"/);
  assert.match(html, /<h1 class="doc-title">甲篇<\/h1>/);
  assert.match(html, /<h1 class="doc-title">乙篇<\/h1>/);
  assert.match(html, /Q甲[\s\S]*A乙/);
  // 只有一个 <style> 块、一个 body
  assert.equal((html.match(/<style>/g) || []).length, 1);
  assert.equal((html.match(/<body/g) || []).length, 1);
  assert.equal(mergedHtml([]), null);
});
