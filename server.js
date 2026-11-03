import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { fetchShare, fetchShareShellHtml } from './src/fetchShare.js';
import { parseShareInput } from './src/shareUrl.js';
import { parseSharePayload } from './src/parseShare.js';
import { parseConversationFromHtml } from './src/htmlFallback.js';
import { parseChatGPTShare } from './src/parseChatGPT.js';
import { parseClaudeShare } from './src/parseClaude.js';
import { parsePastedText } from './src/paste.js';
import { groupByDate, dateRangeLabel } from './src/groupByDate.js';
import { renderHtmlDocument } from './src/renderHtml.js';
import { renderMarkdown } from './src/renderMarkdown.js';
import { safeFileBase } from './src/filenames.js';
import { safeTimeZone } from './src/localtime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5178);
const MAX_HTML = 12 * 1024 * 1024;

const app = express();
app.use(express.json({ limit: MAX_HTML }));
app.use(express.static(path.join(__dirname, 'public')));

const store = new Map();
const TTL_MS = 60 * 60 * 1000;

function prune() {
  const now = Date.now();
  for (const [id, item] of store) {
    if (now - item.createdAt > TTL_MS) store.delete(id);
  }
  while (store.size > 40) store.delete(store.keys().next().value);
}

function buildResult(conversation) {
  const groups = groupByDate(conversation);
  const html = renderHtmlDocument(conversation, groups);
  const markdown = renderMarkdown(conversation, groups);
  const base = safeFileBase(conversation.title, dateRangeLabel(groups));
  return {
    conversation,
    groups,
    html,
    markdown,
    filenames: { html: `${base}.html`, markdown: `${base}.md` },
  };
}

async function convertFromUrl(rawUrl, tz) {
  const timeZone = safeTimeZone(tz);
  const parsed = parseShareInput(rawUrl);
  const meta = {
    shareId: parsed.shareId,
    sourceUrl: parsed.canonicalUrl,
    fetchedAt: Date.now(),
    timeZone,
  };

  if (parsed.platform === 'chatgpt') {
    const share = await fetchShare(rawUrl);
    return buildResult(parseChatGPTShare(share.html, meta));
  }
  if (parsed.platform === 'claude') {
    const share = await fetchShare(rawUrl);
    return buildResult(parseClaudeShare(share.html, meta));
  }

  let apiError = null;
  try {
    const share = await fetchShare(rawUrl);
    return buildResult(parseSharePayload(share.raw, meta));
  } catch (err) {
    apiError = err;
    if (err.code === 'SHARE_NOT_FOUND' || err.code === 'EMPTY_INPUT' || err.code === 'UNSUPPORTED_SITE' || err.code === 'NO_SHARE_ID') throw err;
  }

  try {
    const html = await fetchShareShellHtml(parsed.canonicalUrl);
    const fallback = parseConversationFromHtml(html, meta);
    if (fallback) return buildResult(fallback);
  } catch {
    /* 页面也抓不到，抛出原始接口错误 */
  }
  throw apiError;
}

app.post('/api/convert', async (req, res) => {
  try {
    const { url, tz } = req.body || {};
    const built = await convertFromUrl(url, tz);
    const id = crypto.randomUUID();
    store.set(id, { ...built, createdAt: Date.now() });
    prune();
    res.json({
      ok: true,
      id,
      ...summarize(id, built),
    });
  } catch (err) {
    res.status(statusFor(err)).json({
      ok: false,
      code: err.code || 'UNKNOWN',
      message: err.message || '抓取失败',
      fallback: true,
    });
  }
});

app.post('/api/convert/paste', (req, res) => {
  try {
    const { text, title, date, tz } = req.body || {};
    const timeZone = safeTimeZone(tz);
    const conversation = parsePastedText(text, { title, date, timeZone });
    const built = buildResult(conversation);
    const id = crypto.randomUUID();
    store.set(id, { ...built, createdAt: Date.now() });
    prune();
    res.json({ ok: true, id, ...summarize(id, built) });
  } catch (err) {
    res.status(statusFor(err)).json({ ok: false, code: err.code || 'UNKNOWN', message: err.message || '转换失败' });
  }
});

function summarize(id, built) {
  return {
    title: built.conversation.title,
    titleSource: built.conversation.titleSource,
    sourceUrl: built.conversation.sourceUrl,
    platform: built.conversation.platform,
    sourceLabel: built.conversation.sourceLabel,
    modelLabel: built.conversation.modelLabel,
    timeZone: built.conversation.timeZone,
    timeSource: built.conversation.timeSource,
    timeNote: built.conversation.timeNote,
    messageCount: built.conversation.messages.length,
    days: built.groups.map((g) => ({ key: g.key, label: g.label, count: g.messages.length })),
    warnings: built.conversation.warnings,
    filenames: built.filenames,
    previewUrl: `/api/result/${id}/preview`,
    download: {
      html: `/api/result/${id}/download?format=html`,
      markdown: `/api/result/${id}/download?format=md`,
    },
  };
}

function statusFor(err) {
  switch (err.code) {
    case 'EMPTY_INPUT':
    case 'INVALID_URL':
    case 'UNSUPPORTED_SITE':
    case 'NO_SHARE_ID':
      return 400;
    case 'SHARE_NOT_FOUND':
      return 404;
    case 'BLOCKED':
      return 429;
    case 'NETWORK':
    case 'HTTP_ERROR':
      return 502;
    default:
      return 500;
  }
}

function getResult(req, res) {
  const item = store.get(req.params.id);
  if (!item) {
    res.status(404).send('预览已过期，请重新转换一次。');
    return null;
  }
  return item;
}

app.get('/api/result/:id/preview', (req, res) => {
  const item = getResult(req, res);
  if (!item) return;
  res.type('html').send(item.html);
});

app.get('/api/result/:id/markdown', (req, res) => {
  const item = getResult(req, res);
  if (!item) return;
  res.type('text/plain; charset=utf-8').send(item.markdown);
});

app.get('/api/result/:id/download', (req, res) => {
  const item = getResult(req, res);
  if (!item) return;
  const format = req.query.format === 'md' ? 'md' : 'html';
  const filename = format === 'md' ? item.filenames.markdown : item.filenames.html;
  const body = format === 'md' ? item.markdown : item.html;
  res.setHeader('Content-Type', format === 'md' ? 'text/markdown; charset=utf-8' : 'text/html; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  res.send(body);
});

app.get('/api/health', (_req, res) => res.json({ ok: true, node: process.version }));

app.listen(PORT, () => {
  console.log(`deepseek-to-doc 已启动：http://localhost:${PORT}`);
  console.log('把 DeepSeek 分享链接粘进页面即可生成按日期排版的文档。');
});
