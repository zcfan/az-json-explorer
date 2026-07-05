import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ParseCache,
  canParseStringAsJson,
} from '../src/core/parseCache.js';

test('detects strings that are plausible JSON containers', () => {
  assert.equal(canParseStringAsJson('{"ok":true}'), true);
  assert.equal(canParseStringAsJson('\n [1, 2, 3] '), true);
  assert.equal(canParseStringAsJson('"plain json string"'), false);
  assert.equal(canParseStringAsJson('not json'), false);
  assert.equal(canParseStringAsJson(''), false);
});

test('parsed string cache preserves original value while toggling display mode', () => {
  const cache = new ParseCache();
  const path = ['payload'];
  const original = '{"nested":{"count":2}}';
  const parsed = { nested: { count: 2 } };

  cache.storeParsed(path, original, parsed);

  assert.equal(cache.hasParsed(path), true);
  assert.deepEqual(cache.getParsed(path), parsed);
  assert.equal(cache.getOriginal(path), original);
  assert.equal(cache.getDisplayMode(path), 'parsed');

  assert.equal(cache.toggleDisplayMode(path), 'raw');
  assert.equal(cache.getDisplayMode(path), 'raw');
  assert.deepEqual(cache.getParsed(path), parsed);
  assert.equal(cache.getOriginal(path), original);

  assert.equal(cache.toggleDisplayMode(path), 'parsed');
  assert.equal(cache.getDisplayMode(path), 'parsed');
});

test('parse errors do not discard the last successful parsed value', () => {
  const cache = new ParseCache();
  const path = ['payload'];

  cache.storeParsed(path, '{"ok":true}', { ok: true });
  cache.storeError(path, '{"bad":', 'Unexpected end of JSON input');

  assert.deepEqual(cache.getParsed(path), { ok: true });
  assert.equal(cache.getOriginal(path), '{"bad":');
  assert.equal(cache.getDisplayMode(path), 'raw');
  assert.equal(cache.getError(path), 'Unexpected end of JSON input');
});

test('cache display toggling treats falsy parsed values as valid cache entries', () => {
  const cache = new ParseCache();
  const path = ['payload'];

  cache.storeParsed(path, 'false', false);

  assert.equal(cache.hasParsed(path), true);
  assert.equal(cache.toggleDisplayMode(path), 'raw');
  assert.equal(cache.toggleDisplayMode(path), 'parsed');
});
