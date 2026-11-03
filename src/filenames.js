export function safeFileBase(title, rangeLabel) {
  const cleanedTitle = String(title || 'deepseek-对话')
    .replace(/[\\/:*?"<>|\r\n\t]+/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 60) || 'deepseek-对话';
  const range = String(rangeLabel || '')
    .replace(/[\\/:*?"<>|\r\n\t]+/g, '-')
    .replace(/\s+/g, '')
    .slice(0, 40);
  return range ? `${cleanedTitle}_${range}` : cleanedTitle;
}
