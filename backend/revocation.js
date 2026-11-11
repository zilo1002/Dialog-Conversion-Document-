// 撤销令牌（Worker 版）：与 src/revocation.js 同格式（32 字节随机 → base64url；SHA-256 hex 哈希），
// 但只用 Web Crypto（Worker 没有 node:crypto）。哈希是异步的，调用处 await。
// 令牌格式 /^[A-Za-z0-9_-]{43}$/，哈希格式 /^[a-f0-9]{64}$/，与 Node 版一致。

export function createRevocationToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function hashRevocationToken(token) {
  const data = new TextEncoder().encode(String(token || ''));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function matchesRevocationToken(token, expectedHash) {
  if (typeof expectedHash !== 'string' || !/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  const actual = await hashRevocationToken(token);
  if (actual.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  return diff === 0;
}
