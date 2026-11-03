export const DEFAULT_TIME_ZONE = 'Asia/Shanghai';

const WEEKDAY_ZH = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

function partsOf(ms, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const out = {};
  for (const p of fmt.formatToParts(new Date(ms))) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }
  return out;
}

/** 校验时区是否可用，非法则回退到默认时区。 */
export function safeTimeZone(timeZone) {
  const tz = String(timeZone || '').trim() || DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** 毫秒时间戳 → 本地日期键 YYYY-MM-DD */
export function dateKey(ms, timeZone) {
  const p = partsOf(ms, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** 毫秒时间戳 → HH:mm */
export function clockLabel(ms, timeZone) {
  const p = partsOf(ms, timeZone);
  return `${p.hour}:${p.minute}`;
}

/** 毫秒时间戳 → 2026-04-26 星期日 */
export function dateLabel(ms, timeZone) {
  const p = partsOf(ms, timeZone);
  const idx = WEEKDAY_ZH.indexOf(
    { Sun: '星期日', Mon: '星期一', Tue: '星期二', Wed: '星期三', Thu: '星期四', Fri: '星期五', Sat: '星期六' }[p.weekday],
  );
  return `${p.year}-${p.month}-${p.day} ${WEEKDAY_ZH[idx] ?? ''}`.trim();
}

/** 毫秒时间戳 → 2026-04-26 05:15 */
export function dateTimeLabel(ms, timeZone) {
  return `${dateKey(ms, timeZone)} ${clockLabel(ms, timeZone)}`;
}
