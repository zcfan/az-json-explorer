import assert from 'node:assert/strict';
import test from 'node:test';

import {
  detectJsonPageSource,
  extractLikelyRawJsonText,
  isLikelyJsonContentType,
  isLikelyRawJsonText,
} from '../src/core/pageJsonDetection.js';

test('recognizes JSON content types', () => {
  assert.equal(isLikelyJsonContentType('application/json'), true);
  assert.equal(isLikelyJsonContentType('application/vnd.api+json; charset=utf-8'), true);
  assert.equal(isLikelyJsonContentType('text/plain'), false);
  assert.equal(isLikelyJsonContentType('text/html'), false);
});

test('recognizes only object or array raw JSON text', () => {
  assert.equal(isLikelyRawJsonText('{"ok":true}'), true);
  assert.equal(isLikelyRawJsonText('\n [1,2,3]'), true);
  assert.equal(isLikelyRawJsonText('"just a string"'), false);
  assert.equal(isLikelyRawJsonText('<html></html>'), false);
  assert.equal(isLikelyRawJsonText(''), false);
});

test('extracts raw JSON from simple pre-only documents', () => {
  const documentLike = {
    body: {
      children: [{ tagName: 'PRE', textContent: '{"ok":true}' }],
      textContent: '{"ok":true}',
    },
    contentType: 'application/json',
  };

  assert.equal(extractLikelyRawJsonText(documentLike), '{"ok":true}');
});

test('does not extract from regular html documents with mixed content', () => {
  const documentLike = {
    body: {
      children: [
        { tagName: 'H1', textContent: 'Title' },
        { tagName: 'PRE', textContent: '{"ok":true}' },
      ],
      textContent: 'Title{"ok":true}',
    },
    contentType: 'text/html',
  };

  assert.equal(extractLikelyRawJsonText(documentLike), null);
});

test('detects local .json file pages by URL without reading the rendered text', () => {
  const preElement = { tagName: 'PRE' };
  Object.defineProperty(preElement, 'textContent', {
    get() {
      throw new Error('textContent should not be read for file URL detection');
    },
  });

  const documentLike = {
    body: {
      children: [preElement],
    },
    contentType: 'text/plain',
  };

  assert.deepEqual(
    detectJsonPageSource(documentLike, {
      href: 'file:///tmp/GetCompleteProject.json',
    }),
    {
      kind: 'url',
      url: 'file:///tmp/GetCompleteProject.json',
    },
  );
});
