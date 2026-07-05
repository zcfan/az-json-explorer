import { pathKey } from './path.js';

export function canParseStringAsJson(value) {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

export class ParseCache {
  #entries = new Map();

  storeParsed(path, originalValue, parsedValue) {
    const key = pathKey(path);
    this.#entries.set(key, {
      originalValue,
      parsedValue,
      displayMode: 'parsed',
      error: null,
    });
  }

  storeError(path, originalValue, error) {
    const key = pathKey(path);
    const existing = this.#entries.get(key);
    this.#entries.set(key, {
      originalValue,
      parsedValue: existing?.parsedValue,
      displayMode: 'raw',
      error,
    });
  }

  hasParsed(path) {
    return this.#entries.get(pathKey(path))?.parsedValue !== undefined;
  }

  getParsed(path) {
    return this.#entries.get(pathKey(path))?.parsedValue;
  }

  getOriginal(path) {
    return this.#entries.get(pathKey(path))?.originalValue;
  }

  getDisplayMode(path) {
    return this.#entries.get(pathKey(path))?.displayMode ?? 'raw';
  }

  getError(path) {
    return this.#entries.get(pathKey(path))?.error ?? null;
  }

  setDisplayMode(path, displayMode) {
    const key = pathKey(path);
    const existing = this.#entries.get(key);
    if (!existing || existing.parsedValue === undefined) {
      return 'raw';
    }

    existing.displayMode = displayMode === 'parsed' ? 'parsed' : 'raw';
    existing.error = null;
    return existing.displayMode;
  }

  toggleDisplayMode(path) {
    const current = this.getDisplayMode(path);
    return this.setDisplayMode(path, current === 'parsed' ? 'raw' : 'parsed');
  }
}
