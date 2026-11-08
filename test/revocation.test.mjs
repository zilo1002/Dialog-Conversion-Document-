import test from 'node:test';
import assert from 'node:assert/strict';
import { createRevocationToken, hashRevocationToken, matchesRevocationToken } from '../src/revocation.js';

test('撤销令牌随机且服务端只需保存哈希', () => {
  const first = createRevocationToken();
  const second = createRevocationToken();
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
  const hash = hashRevocationToken(first);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(matchesRevocationToken(first, hash), true);
  assert.equal(matchesRevocationToken(second, hash), false);
});

test('缺失或格式错误的撤销凭据不会通过', () => {
  assert.equal(matchesRevocationToken('', 'bad-hash'), false);
  assert.equal(matchesRevocationToken(undefined, 'a'.repeat(64)), false);
  assert.equal(matchesRevocationToken('anything', null), false);
});
