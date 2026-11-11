// Cloudflare Worker 入口：deepseek-to-doc 后端（Worker 版）。
// 复用仓库根 src/ 的纯逻辑模块（convert / render / parse），不依赖 Express / fs。
// 存档用 KV（./kv-archive.js），替代 Express 版的 data/ 文件。
// 接口与 Express 版一致：POST /api/convert、POST /api/convert/paste、GET /api/health、
// GET /share/<id>（.md/.txt/.json 多格式）、DELETE /api/share/:id（撤销，凭专属令牌）。
// 管理接口在 Worker 上未启用（没有 ADMIN_KEY 的注入渠道），返回与 Express 版未设
// ADMIN_KEY 时相同的 403；前端不调用这些接口。
// 撤销令牌用 Web Crypto（./revocation.js），与 src/revocation.js 同格式。

import { convertUrl, convertPaste, summarize } from '../src/convert.js';
import { KvArchive } from './kv-archive.js';
import { createRevocationToken, hashRevocationToken, matchesRevocationToken } from './revocation.js';

const MAX_BODY = 12 * 1024 * 1024;

function corsHeaders(req) {
  const origin = req.headers.get('origin');
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-key',
    'Access-Control-Max-Age': '86400',
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  } else {
    headers['Access-Control-Allow-Origin'] = '*';
  }
  return headers;
}

function json(body, status, req) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req) },
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

function shareFormat(rawId) {
  const m = String(rawId || '').match(/^(.+)\.(md|txt|json)$/i);
  return m ? { id: m[1], format: m[2].toLowerCase() } : { id: String(rawId || ''), format: 'html' };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (!env.DIALOG_KV) {
      return json({ ok: false, message: 'KV 未绑定：Worker 需要 DIALOG_KV 命名空间' }, 500, request);
    }
    const archive = new KvArchive(env.DIALOG_KV);
    const base = String(env.BASE_URL || url.origin).replace(/\/+$/, '');

    async function respondConverted(built) {
      const summary = summarize(built);
      const revokeToken = createRevocationToken();
      const entry = await archive.save({
        revokeTokenHash: await hashRevocationToken(revokeToken),
        summary,
        html: built.html,
        markdown: built.markdown,
        transcript: built.transcript,
        plaintext: built.plaintext,
        share: built.share,
      });
      return new Response(
        JSON.stringify({
          ok: true,
          id: entry.id,
          createdAt: entry.createdAt,
          summary,
          ...summary,
          shareUrl: `${base}/share/${entry.id}`,
          // 原始令牌仅交给生成此记录的浏览器；服务器只保存其 SHA-256 哈希
          revokeToken,
          // 完整记录随响应回给浏览器：存档进 IndexedDB（本机），页面不再依赖服务端读取接口
          html: built.html,
          markdown: built.markdown,
          transcript: built.transcript,
          plaintext: built.plaintext,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors },
        },
      );
    }

    async function readBody() {
      const len = Number(request.headers.get('content-length') || 0);
      if (len > MAX_BODY) {
        const err = new Error('请求体过大');
        err.code = 'BODY_TOO_LARGE';
        throw err;
      }
      try {
        return await request.json();
      } catch {
        const err = new Error('请求体不是有效 JSON');
        err.code = 'INVALID_BODY';
        throw err;
      }
    }

    function badBodyStatus(err) {
      return err.code === 'BODY_TOO_LARGE' || err.code === 'INVALID_BODY' ? 400 : statusFor(err);
    }

    // POST /api/convert：DeepSeek 分享链接模式
    if (url.pathname === '/api/convert' && request.method === 'POST') {
      try {
        const body = await readBody();
        return await respondConverted(await convertUrl(body?.url, body?.tz, body?.options));
      } catch (err) {
        return json(
          { ok: false, code: err.code || 'UNKNOWN', message: err.message || '抓取失败', fallback: true },
          badBodyStatus(err),
          request,
        );
      }
    }

    // POST /api/convert/paste：粘贴全文模式（不联网）
    if (url.pathname === '/api/convert/paste' && request.method === 'POST') {
      try {
        const body = await readBody();
        return await respondConverted(
          convertPaste({ text: body?.text, title: body?.title, date: body?.date, tz: body?.tz, options: body?.options }),
        );
      } catch (err) {
        return json(
          { ok: false, code: err.code || 'UNKNOWN', message: err.message || '转换失败' },
          badBodyStatus(err),
          request,
        );
      }
    }

    // 由生成该分享的浏览器凭专属 bearer token 撤销公开内容。令牌只放请求体，避免进入 URL 日志。
    // 对已不存在的记录返回成功，便于安全重试；不泄露 ID 是否曾经存在。
    const revokeMatch = url.pathname.match(/^\/api\/share\/(.+)$/);
    if (revokeMatch && request.method === 'DELETE') {
      let body = {};
      try {
        body = await request.json();
      } catch {
        body = {};
      }
      const entry = await archive.get(revokeMatch[1]);
      if (!entry) return new Response(null, { status: 204, headers: cors });
      if (!(await matchesRevocationToken(body?.token, entry.revokeTokenHash))) {
        return json({ ok: false, message: '无法验证这条分享的撤销凭据' }, 403, request);
      }
      const removed = await archive.remove(revokeMatch[1]);
      if (!removed) return json({ ok: false, message: '服务端删除失败，请稍后重试' }, 500, request);
      return new Response(null, { status: 204, headers: cors });
    }

    // GET /api/health
    if (url.pathname === '/api/health' && request.method === 'GET') {
      return json({ ok: true, runtime: 'cloudflare-worker' }, 200, request);
    }

    // GET /share/<id>：公开分享出口（主入口 HTML；.md/.txt/.json 同一份内容）
    const shareMatch = url.pathname.match(/^\/share\/(.+)$/);
    if (shareMatch && request.method === 'GET') {
      const { id, format } = shareFormat(shareMatch[1]);
      const entry = await archive.get(id);
      if (!entry) {
        const msg = '分享不存在或已被删除。';
        if (format === 'json') return json({ error: msg }, 404, request);
        return new Response(msg, { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...cors } });
      }
      if (format === 'md') {
        return new Response(entry.transcript || '', { headers: { 'Content-Type': 'text/markdown; charset=utf-8', ...cors } });
      }
      if (format === 'txt') {
        return new Response(entry.plaintext || '', { headers: { 'Content-Type': 'text/plain; charset=utf-8', ...cors } });
      }
      if (format === 'json') {
        return json({ id: entry.id, createdAt: entry.createdAt, ...(entry.share || {}) }, 200, request);
      }
      return new Response(entry.html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...cors },
      });
    }

    // 管理接口：Worker 上未启用（与 Express 版未设 ADMIN_KEY 时一致）
    if (
      url.pathname.startsWith('/api/archive') ||
      url.pathname.startsWith('/api/backup') ||
      url.pathname.startsWith('/api/result/')
    ) {
      return json(
        {
          ok: false,
          message: '服务端存档管理接口未启用：部署时设置 ADMIN_KEY 环境变量后才能访问（存档列表/预览/删除/备份）',
        },
        403,
        request,
      );
    }

    return json({ ok: false, message: '不存在的接口' }, 404, request);
  },
};
