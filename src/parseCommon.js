export function firstMeaningfulLine(text) {
  return (
    String(text || '')
      .split('\n')
      .map((l) => l.replace(/^[#>\-*\s]+/, '').trim())
      .find((l) => l.length > 0) || ''
  );
}
