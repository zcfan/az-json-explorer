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

export function isSearchShortcut(event, platform = getRuntimePlatform()) {
  const primaryModifier = isMacPlatform(platform)
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  return Boolean(
    String(event.key).toLowerCase() === 'f' &&
      primaryModifier &&
      !event.altKey &&
      !event.shiftKey,
  );
}

export function isSelectAllShortcut(event, platform = getRuntimePlatform()) {
  const primaryModifier = isMacPlatform(platform)
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  return Boolean(
    String(event.key).toLowerCase() === 'a' &&
      primaryModifier &&
      !event.altKey &&
      !event.shiftKey,
  );
}

export function shouldRedirectSelectAll(target) {
  return !isEditableTarget(target);
}

export function isManualInputToggleShortcut(event) {
  return Boolean(
    (event.code === 'Backquote' || event.key === '`') &&
      event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.shiftKey &&
      !event.repeat,
  );
}

export function getSearchNavigationDelta(event) {
  if (
    event.key !== 'Enter' ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.isComposing
  ) {
    return 0;
  }

  return event.shiftKey ? -1 : 1;
}

export function getPasteAction(target, manualInput) {
  if (target === manualInput) {
    return 'insert-and-parse';
  }
  return isEditableTarget(target) ? 'native' : 'replace-and-parse';
}

function isEditableTarget(target) {
  const tagName = String(target?.tagName || '').toUpperCase();
  return (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    Boolean(target?.isContentEditable)
  );
}
