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
// Render 等平台在反向代理后面：信任 X-Forwarded-*，req.protocol 才是公网的 https
app.set('trust proxy', 1);
app.use(express.json({ limit: MAX_BODY }));
app.use(express.static(path.join(__dirname, 'public')));

// 识别过的文档持久化到 data/（重启不丢；Render 免费实例磁盘重置除外）
const archive = new Archive(DATA_DIR);

// 分享链接按「BASE_URL 环境变量优先，否则取本次请求的协议 + 域名」生成，
// 部署到 Render 后自动是 https://xxx.onrender.com/share/<id>，不会指向 localhost
function absoluteShareUrl(req, id) {
  // Render 在反代后面：优先 X-Forwarded-Host / X-Forwarded-Proto，本机直连时回退 Host（含端口）
  const host = req.get('x-forwarded-host') || req.get('host') || req.hostname;
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const base = String(process.env.BASE_URL || `${proto}://${host}`).replace(/\/+$/, '');
  return `${base}/share/${id}`;
}

async function respondConverted(req, res, built) {
  const summary = summarize(built);
  const entry = await archive.save({
    summary,
    html: built.html,
    markdown: built.markdown,
    transcript: built.transcript,
    plaintext: built.plaintext,
    share: built.share,
  });
  res.json({
    ok: true,
    id: entry.id,
    createdAt: entry.createdAt,
    ...summary,
    previewUrl: `/api/result/${entry.id}/preview`,
    shareUrl: absoluteShareUrl(req, entry.id),
    download: {
      html: `/api/result/${entry.id}/download?format=html`,
      markdown: `/api/result/${entry.id}/download?format=md`,
      transcript: `/api/result/${entry.id}/download?format=transcript`,
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
    const { url, tz, options } = req.body || {};
    await respondConverted(req, res, await convertUrl(url, tz, options));
  } catch (err) {
    res.status(statusFor(err)).json({ ok: false, code: err.code || 'UNKNOWN', message: err.message || '抓取失败', fallback: true });
  }
});

app.post('/api/convert/paste', async (req, res) => {
  try {
    const { text, title, date, tz, options } = req.body || {};
    await respondConverted(req, res, convertPaste({ text, title, date, tz, options }));
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

app.get('/api/result/:id/transcript', async (req, res) => {
  const entry = await loadEntry(req, res);
  if (!entry) return;
  res.type('text/plain; charset=utf-8').send(entry.transcript || '');
});

app.get('/api/result/:id/download', async (req, res) => {
  const entry = await loadEntry(req, res);
  if (!entry) return;
  const format = ['md', 'transcript'].includes(req.query.format) ? req.query.format : 'html';
  const filename = entry.summary.filenames[format === 'md' ? 'markdown' : format === 'transcript' ? 'transcript' : 'html'];
  const body = format === 'md' ? entry.markdown : format === 'transcript' ? entry.transcript : entry.html;
  res.setHeader('Content-Type', format === 'html' ? 'text/html; charset=utf-8' : 'text/markdown; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  res.send(body);
});

app.get('/api/health', (_req, res) => res.json({ ok: true, node: process.version }));

// —— 公开分享出口：一个内容 ID，多格式返回同一份内容 ——
// 主入口 /share/<id> 是服务端直接返回的完整 HTML（正文全在页面里，不依赖 JS）；
// .md / .txt / .json 是同一份内容的其他格式表示，不是独立文件。
function shareFormat(rawId) {
  const m = String(rawId || '').match(/^(.+)\.(md|txt|json)$/i);
  return m ? { id: m[1], format: m[2].toLowerCase() } : { id: String(rawId || ''), format: 'html' };
}

app.get('/share/:id', async (req, res) => {
  const { id, format } = shareFormat(req.params.id);
  const entry = await archive.get(id);
  if (!entry) {
    const msg = '分享不存在或已被删除。';
    if (format === 'json') return res.status(404).json({ error: msg });
    return res.status(404).type('text; charset=utf-8').send(msg);
  }
  if (format === 'md') return res.type('text/markdown; charset=utf-8').send(entry.transcript || '');
  if (format === 'txt') return res.type('text/plain; charset=utf-8').send(entry.plaintext || '');
  if (format === 'json') {
    return res.json({ id: entry.id, createdAt: entry.createdAt, ...(entry.share || {}) });
  }
  res.type('text/html; charset=utf-8').send(entry.html);
});

app.listen(PORT, () => {
  console.log(`deepseek-to-doc 已启动：http://localhost:${PORT}`);
  console.log(`存档目录：${DATA_DIR}`);
});
