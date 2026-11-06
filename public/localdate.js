/** 浏览器本机时区的今天（YYYY-MM-DD）。旧实现用 toISOString（UTC），
 * UTC+8 的凌晨 0-8 点和西半球的晚上都会错一天。可传 minutesEastOfUtc 便于测试。 */
export function localDateString(d = new Date(), minutesEastOfUtc = -d.getTimezoneOffset()) {
  const date = d instanceof Date ? d : new Date(d);
  return new Date(date.getTime() + minutesEastOfUtc * 60000).toISOString().slice(0, 10);
}
