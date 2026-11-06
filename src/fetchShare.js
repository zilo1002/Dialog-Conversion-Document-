import { parseShareInput } from './shareUrl.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const TIMEOUT_MS = 20000;

class FetchError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    Object.assign(this, extra);
  }
}

async function request(url, { accept, referer } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': UA,
        accept: accept || 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
        ...(referer ? { referer } : {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchHtml(url, referer) {
  let res;
  try {
    res = await request(url, { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', referer });
  } catch (err) {
    const reason = err?.name === 'AbortError' ? '请求超时（20 秒）' : '网络请求失败';
    throw new FetchError('NETWORK', `${reason}，本机可能访问不了该站点。可以改用「粘贴全文」模式。`, { cause: err });
  }
  if (res.status === 401 || res.status === 403) {
    throw new FetchError('BLOCKED', `站点拒绝了这次抓取（HTTP ${res.status}），可能需要登录、被风控或地区不可用。请改用「粘贴全文」模式。`, { status: res.status });
  }
  if (res.status === 429) {
    throw new FetchError('BLOCKED', '触发频率限制（HTTP 429），稍等一会再试，或改用「粘贴全文」模式。', { status: 429 });
  }
  if (!res.ok) {
    throw new FetchError('HTTP_ERROR', `抓取失败：HTTP ${res.status}。请确认链接可公开访问，或改用「粘贴全文」模式。`, { status: res.status });
  }
  return res.text();
}

/**
 * 统一入口：抓 DeepSeek 分享数据。
 * 走公开接口 GET /api/v0/share/content?share_id=<id>（实测见 README）。
 */
export async function fetchShare(rawInput) {
  const { platform, shareId, canonicalUrl } = parseShareInput(rawInput);

  if (platform === 'deepseek') {
    const apiUrl = `https://chat.deepseek.com/api/v0/share/content?share_id=${encodeURIComponent(shareId)}`;
    let res;
    try {
      res = await request(apiUrl, { accept: 'application/json, text/plain, */*', referer: canonicalUrl });
    } catch (err) {
      const reason = err?.name === 'AbortError' ? '请求超时（20 秒）' : '网络请求失败';
      throw new FetchError('NETWORK', `${reason}，可能是本机网络无法访问 chat.deepseek.com。可以直接改用「粘贴全文」模式。`, { cause: err });
    }
    if (res.status === 403 || res.status === 429) {
      throw new FetchError('BLOCKED', `DeepSeek 拒绝了这次抓取（HTTP ${res.status}），可能触发了频率限制或风控。请稍后再试，或改用「粘贴全文」模式。`, { status: res.status });
    }
    if (!res.ok) {
      throw new FetchError('HTTP_ERROR', `抓取失败：DeepSeek 返回 HTTP ${res.status}。请确认链接可公开访问，或改用「粘贴全文」模式。`, { status: res.status });
    }
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new FetchError('BAD_RESPONSE', '返回内容不是预期的 JSON（可能是登录墙、验证页或接口改版）。请改用「粘贴全文」模式。', { sample: text.slice(0, 200) });
    }
    const biz = json?.data ?? {};
    if (json?.code !== 0 || biz?.biz_code !== 0) {
      const bizMsg = biz?.biz_msg || json?.msg || '';
      if (/not exist|不存在/i.test(bizMsg)) {
        throw new FetchError('SHARE_NOT_FOUND', '这条分享链接不存在或已被作者删除/关闭。请回到 DeepSeek 重新生成分享链接。', { bizMsg });
      }
      throw new FetchError('API_ERROR', `DeepSeek 接口返回异常：${bizMsg || '未知错误'}（biz_code ${biz?.biz_code ?? '?'}）。`, { bizMsg });
    }
    const bizData = biz.biz_data;
    if (!bizData || !Array.isArray(bizData.messages) || bizData.messages.length === 0) {
      throw new FetchError('EMPTY_SHARE', '分享内容为空或结构已变化，没有解析出任何消息。请改用「粘贴全文」模式。', { bizData: null });
    }
    return { platform, kind: 'api', shareId, canonicalUrl, raw: bizData };
  }

  return { platform, kind: 'api', shareId, canonicalUrl };
}

export async function fetchShareShellHtml(canonicalUrl) {
  return fetchHtml(canonicalUrl, canonicalUrl);
}

export { FetchError };
