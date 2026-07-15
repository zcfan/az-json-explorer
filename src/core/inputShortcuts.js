function isMacPlatform(platform) {
  return /Mac|iPhone|iPad|iPod/i.test(String(platform || ''));
}

export function getRuntimePlatform() {
  if (typeof navigator === 'undefined') {
    return '';
  }

  return navigator.userAgentData?.platform || navigator.platform || '';
}

export function getParseShortcutLabel(platform = getRuntimePlatform()) {
  return `${isMacPlatform(platform) ? 'cmd' : 'ctrl'}+enter`;
}

export function getPasteShortcutLabel(platform = getRuntimePlatform()) {
  return `${isMacPlatform(platform) ? 'cmd' : 'ctrl'}+v`;
}

export function isParseShortcut(event, platform = getRuntimePlatform()) {
  const primaryModifier = isMacPlatform(platform)
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  return Boolean(
    event.key === 'Enter' && primaryModifier && !event.altKey && !event.shiftKey,
  );
}

export function shouldRedirectPaste(target) {
  const tagName = String(target?.tagName || '').toLowerCase();
  return tagName !== 'input' && tagName !== 'textarea';
}
