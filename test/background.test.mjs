import assert from 'node:assert/strict';
import test from 'node:test';

test('the global shortcut opens the viewer and brings its Chrome window forward', async (t) => {
  const events = [];
  let commandListener;

  globalThis.chrome = {
    action: {
      onClicked: {
        addListener() {},
      },
    },
    commands: {
      onCommand: {
        addListener(listener) {
          commandListener = listener;
        },
      },
    },
    runtime: {
      id: 'extension-id',
      getURL(path) {
        return `chrome-extension://extension-id/${path}`;
      },
      onMessage: {
        addListener() {},
      },
      onMessageExternal: {
        addListener() {},
      },
    },
    tabs: {
      async create(properties) {
        events.push(['create-tab', properties]);
        return { windowId: 73 };
      },
    },
    windows: {
      async update(windowId, properties) {
        events.push(['focus-window', windowId, properties]);
      },
    },
  };
  t.after(() => {
    delete globalThis.chrome;
  });

  await import('../src/background.js');
  await commandListener('open-standalone-viewer');

  assert.deepEqual(events, [
    [
      'create-tab',
      {
        active: true,
        url: 'chrome-extension://extension-id/src/viewer.html',
      },
    ],
    ['focus-window', 73, { focused: true }],
  ]);
});
