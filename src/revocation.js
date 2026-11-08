import crypto from 'node:crypto';

/** A one-time-to-store bearer credential used to revoke one public share. */
export function createRevocationToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashRevocationToken(token) {
  return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

export function matchesRevocationToken(token, expectedHash) {
  if (typeof expectedHash !== 'string' || !/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  const actual = Buffer.from(hashRevocationToken(token), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return crypto.timingSafeEqual(actual, expected);
}
