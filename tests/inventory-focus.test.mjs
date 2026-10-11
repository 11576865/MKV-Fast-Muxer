import assert from 'node:assert/strict';
import test from 'node:test';
import { focusUpdatedInventoryItem } from '../src/inventory-focus.js';

function control(key, { disabled = false } = {}) {
  return {
    disabled,
    attributes: new Map([['data-asset-source', key]]),
    focusCalls: [],
    getAttribute(name) { return this.attributes.get(name) ?? null; },
    focus(options) { this.focusCalls.push(options); },
  };
}
const inventory = (controls) => ({ querySelectorAll: () => controls });

test('resource removal restores focus to the next stable row', () => {
  const a = control('a'), c = control('c');
  assert.equal(focusUpdatedInventoryItem(inventory([a,c]), {
    selector: 'button[data-asset-remove]', previousIndex: 1,
  }), true);
  assert.equal(c.focusCalls.length, 1);
  assert.deepEqual(c.focusCalls[0], { preventScroll: true });
});

test('removing the last resource returns focus to the import dropzone', () => {
  const fallback = control('fallback');
  assert.equal(focusUpdatedInventoryItem(inventory([]), {
    selector: 'button[data-asset-remove]', previousIndex: 0, fallback,
  }), true);
  assert.equal(fallback.focusCalls.length, 1);
});

test('switching source restores focus by stable content identity, not position', () => {
  const a = control('a'), b = control('b'), c = control('c');
  assert.equal(focusUpdatedInventoryItem(inventory([a,b,c]), {
    selector: '[data-asset-source]', keyAttribute: 'data-asset-source', key: 'c', previousIndex: 0,
  }), true);
  assert.equal(a.focusCalls.length, 0);
  assert.equal(c.focusCalls.length, 1);
});

test('missing or disabled focus targets never claim successful restoration', () => {
  const disabled = control('a', { disabled: true });
  assert.equal(focusUpdatedInventoryItem(null, { selector: '.x' }), false);
  assert.equal(focusUpdatedInventoryItem(inventory([disabled]), { selector: '.x' }), false);
  assert.equal(disabled.focusCalls.length, 0);
});
