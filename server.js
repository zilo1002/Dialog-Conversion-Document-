import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertUrl, convertPaste, summarize } from './src/convert.js';
import { Archive } from './src/archive.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5178);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const MAX_BODY = 12 * 1024 * 1024;

const app = express();
app.use(express.json({ limit: MAX_BODY }));
app.use(express.static(path.join(__dirname, 'public')));

// 识别过的文档持久化到 data/（重启不丢；Render 免费实例磁盘重置除外）
const archive = new Archive(DATA_DIR);

async function respondConverted(res, built) {
  const summary = summarize(built);
  const entry = await archive.save({ summary, html: built.html, markdown: built.markdown });
  res.json({
    ok: true,
    id: entry.id,
    createdAt: entry.createdAt,
    ...summary,
    previewUrl: `/api/result/${entry.id}/preview`,
    download: {
      html: `/api/result/${entry.id}/download?format=html`,
      markdown: `/api/result/${entry.id}/download?format=md`,
    },
  });
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

app.post('/api/convert', async (req, res) => {
  try {
    const { url, tz } = req.body || {};
    await respondConverted(res, await convertUrl(url, tz));
  } catch (err) {
    res.status(statusFor(err)).json({ ok: false, code: err.code || 'UNKNOWN', message: err.message || '抓取失败', fallback: true });
  }
});

app.post('/api/convert/paste', async (req, res) => {
  try {
    const { text, title, date, tz } = req.body || {};
    await respondConverted(res, convertPaste({ text, title, date, tz }));
  } catch (err) {
    res.status(statusFor(err)).json({ ok: false, code: err.code || 'UNKNOWN', message: err.message || '转换失败' });
  }
});

app.get('/api/archive', async (_req, res) => {
  try {
    res.json({ ok: true, items: await archive.list() });
  } catch {
    res.status(500).json({ ok: false, message: '读取存档失败' });
  }
});

app.delete('/api/result/:id', async (req, res) => {
  const ok = await archive.remove(req.params.id);
  res.status(ok ? 200 : 404).json({ ok });
});

async function loadEntry(req, res) {
  const entry = await archive.get(req.params.id);
  if (!entry) {
    res.status(404).json({ ok: false, message: '存档不存在或已删除' });
    return null;
  }
  return entry;
}

app.get('/api/result/:id/preview', async (req, res) => {
  const entry = await loadEntry(req, res);
  if (!entry) return;
  res.type('html').send(entry.html);
});

app.get('/api/result/:id/markdown', async (req, res) => {
  const entry = await loadEntry(req, res);
  if (!entry) return;
  res.type('text/plain; charset=utf-8').send(entry.markdown);
});

app.get('/api/result/:id/download', async (req, res) => {
  const entry = await loadEntry(req, res);
  if (!entry) return;
  const format = req.query.format === 'md' ? 'md' : 'html';
  const filename = format === 'md' ? entry.summary.filenames.markdown : entry.summary.filenames.html;
  const body = format === 'md' ? entry.markdown : entry.html;
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
  console.log(`存档目录：${DATA_DIR}`);
});
