import test from 'node:test';
import assert from 'node:assert/strict';
import { dateKey, clockLabel, dateTimeLabel } from '../src/localtime.js';

// 以下 UTC 时刻与时区换算期望值经可信时钟工具核实（2026-11-06）
test('午夜边界：UTC+13（奥克兰夏令时）当地 00:00 归当天，不落前一天', () => {
  const ms = new Date('2026-03-31T11:00:00Z').getTime(); // = 奥克兰 2026-04-01T00:00(+13)
  assert.equal(dateKey(ms, 'Pacific/Auckland'), '2026-04-01');
  assert.equal(clockLabel(ms, 'Pacific/Auckland'), '00:00');
});

test('午夜边界：UTC+14（基里蒂马蒂）当地 00:00 归当天', () => {
  const ms = new Date('2026-01-14T10:00:00Z').getTime(); // = 当地 2026-01-15T00:00(+14)
  assert.equal(dateKey(ms, 'Pacific/Kiritimati'), '2026-01-15');
});

test('午夜边界：UTC-5（纽约冬令时）当地 00:00 归当天', () => {
  const ms = new Date('2026-11-06T05:00:00Z').getTime(); // = 纽约 2026-11-06T00:00(-05)
  assert.equal(dateKey(ms, 'America/New_York'), '2026-11-06');
});

test('午夜边界：UTC+8（上海）当地 00:00 归当天，同一时刻在 UTC 还是前一天', () => {
  const ms = new Date('2026-11-05T16:00:00Z').getTime();
  assert.equal(dateKey(ms, 'Asia/Shanghai'), '2026-11-06');
  assert.equal(dateKey(ms, 'UTC'), '2026-11-05');
});

test('西半球次日凌晨：UTC 00:01 在 UTC-10 仍是前一天 14:01', () => {
  const ms = new Date('2026-04-26T00:01:00Z').getTime();
  assert.equal(dateKey(ms, 'Etc/GMT+10'), '2026-04-25');
  assert.equal(clockLabel(ms, 'Etc/GMT+10'), '14:01');
});

test('.dateTimeLabel 与分组一致：跨日对话两侧的日期都对', () => {
  const before = new Date('2026-11-05T16:00:00Z').getTime(); // 上海 11-06 00:00
  const just = new Date('2026-11-05T15:59:00Z').getTime();  // 上海 11-05 23:59
  assert.equal(dateTimeLabel(just, 'Asia/Shanghai'), '2026-11-05 23:59');
  assert.equal(dateTimeLabel(before, 'Asia/Shanghai'), '2026-11-06 00:00');
});
