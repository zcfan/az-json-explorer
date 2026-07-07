export function formatJsonText(text, spaces = 2) {
  return JSON.stringify(JSON.parse(String(text ?? '')), null, spaces);
}
