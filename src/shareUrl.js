const ID_RE = /^[A-Za-z0-9_-]{6,80}$/;

const PLATFORMS = [
  { id: 'deepseek', label: 'DeepSeek', hosts: ['chat.deepseek.com', 'deepseek.com'] },
  { id: 'chatgpt', label: 'ChatGPT', hosts: ['chatgpt.com', 'chat.openai.com', 'openai.com'] },
  { id: 'claude', label: 'Claude', hosts: ['claude.ai', 'claude.com', 'anthropic.com'] },
];

function platformForHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^www\./, '');
  return PLATFORMS.find((p) => p.hosts.some((h) => host === h || host.endsWith(`.${h}`)));
}

export function supportedPlatforms() {
  return PLATFORMS.map(({ id, label, hosts }) => ({ id, label, hosts }));
}

/** 把粘贴内容解析成 { platform, platformLabel, shareId, canonicalUrl }；支持完整链接/带参数链接/裸 id（裸 id 按 DeepSeek 处理）。 */
export function parseShareInput(raw) {
  const input = String(raw ?? '').trim();
  if (!input) {
    const err = new Error('请先粘贴对话分享链接');
    err.code = 'EMPTY_INPUT';
    throw err;
  }

  let platform = null;
  let candidate = input;

  const urlMatch = input.match(/https?:\/\/[^\s"'<>]+/i);
  if (urlMatch) {
    let u;
    try {
      u = new URL(urlMatch[0]);
    } catch {
      const err = new Error('链接格式不正确，请检查是否复制完整');
      err.code = 'INVALID_URL';
      throw err;
    }
    platform = platformForHost(u.hostname);
    if (!platform) {
      const err = new Error(
        `暂不支持「${u.hostname}」的分享链接，目前支持 DeepSeek（chat.deepseek.com）、ChatGPT（chatgpt.com）、Claude（claude.ai）。`,
      );
      err.code = 'UNSUPPORTED_SITE';
      throw err;
    }
    const parts = u.pathname.split('/').filter(Boolean);
    const idx = parts.findIndex((p) => ['share', 's'].includes(p.toLowerCase()));
    if (idx === -1 || !parts[idx + 1]) {
      const err = new Error('链接里没有找到分享 id，请确认是「分享」生成的链接（形如 https://chat.deepseek.com/share/xxxx）');
      err.code = 'NO_SHARE_ID';
      throw err;
    }
    candidate = decodeURIComponent(parts[idx + 1]);
  } else {
    platform = PLATFORMS[0];
  }

  candidate = candidate.replace(/[?#].*$/, '').replace(/\/+$/, '');
  if (!ID_RE.test(candidate)) {
    const err = new Error('分享 id 格式不正确，请重新复制分享链接');
    err.code = 'NO_SHARE_ID';
    throw err;
  }

  return {
    platform: platform.id,
    platformLabel: platform.label,
    shareId: candidate,
    canonicalUrl: `https://${platform.hosts[0]}/share/${candidate}`,
  };
}
