export const STANDALONE_PERFORMANCE_HINT_DISMISSED_KEY =
  'json-tools.standalone-performance-hint-dismissed';

export function isStandalonePerformanceHintDismissed(storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    return target?.getItem(STANDALONE_PERFORMANCE_HINT_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissStandalonePerformanceHint(storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    target?.setItem(STANDALONE_PERFORMANCE_HINT_DISMISSED_KEY, '1');
    return Boolean(target);
  } catch {
    return false;
  }
}
