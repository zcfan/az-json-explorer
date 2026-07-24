import assert from 'node:assert/strict';
import test from 'node:test';

import { resizeHistoryPanelWidth } from '../src/ui/historyPanelResize.js';

test('dragging the history divider resizes leftward and preserves viewer space', () => {
  assert.equal(
    resizeHistoryPanelWidth({
      startWidth: 320,
      startClientX: 900,
      clientX: 800,
      viewportWidth: 1200,
    }),
    420,
  );
  assert.equal(
    resizeHistoryPanelWidth({
      startWidth: 320,
      startClientX: 900,
      clientX: 1100,
      viewportWidth: 1200,
    }),
    240,
  );
  assert.equal(
    resizeHistoryPanelWidth({
      startWidth: 500,
      startClientX: 700,
      clientX: 100,
      viewportWidth: 1000,
    }),
    640,
  );
  assert.equal(
    resizeHistoryPanelWidth({
      startWidth: 320,
      startClientX: 400,
      clientX: 0,
      viewportWidth: 1600,
    }),
    720,
  );
});
