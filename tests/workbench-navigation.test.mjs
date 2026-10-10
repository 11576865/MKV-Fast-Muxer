import assert from 'node:assert/strict';
import test from 'node:test';
import { setupWorkbenchNavigation } from '../src/workbench-navigation.js';

function fixture() {
  const ids = ['source-title', 'workbench-editor-title', 'workbench-output-title', 'batch-title'];
  const tops = [0, 400, 800, 1200];
  const headings = Object.fromEntries(ids.map((id, i) => [
    id, { getBoundingClientRect: () => ({ top: tops[i] }) },
  ]));
  const links = ids.map((id) => {
    const attributes = new Map();
    return {
      hash: '#' + id,
      setAttribute: (key, value) => attributes.set(key, value),
      getAttribute: (key) => attributes.get(key) ?? null,
      removeAttribute: (key) => attributes.delete(key),
    };
  });
  const events = new Map();
  const add = (name, fn) => {
    if (!events.has(name)) events.set(name, new Set());
    events.get(name).add(fn);
  };
  const remove = (name, fn) => events.get(name)?.delete(fn);
  const fire = (name, event = {}) => {
    for (const fn of events.get(name) || []) fn(event);
  };
  const callbacks = new Map();
  let frameId = 0;
  let visible = true;
  const win = {
    innerHeight: 600,
    scrollY: 0,
    location: { hash: '' },
    getComputedStyle: () => ({ display: visible ? 'grid' : 'none' }),
    requestAnimationFrame(fn) { const id = ++frameId; callbacks.set(id, fn); return id; },
    cancelAnimationFrame(id) { callbacks.delete(id); },
    addEventListener: add,
    removeEventListener: remove,
  };
  const nav = {
    querySelectorAll: () => links,
    getBoundingClientRect: () => ({ bottom: 60 }),
    addEventListener: add,
    removeEventListener: remove,
  };
  const doc = {
    getElementById: (id) => headings[id],
    documentElement: { scrollHeight: 3000 },
  };
  return {
    win, nav, doc, links, tops,
    flush() {
      for (const [id, fn] of [...callbacks]) { callbacks.delete(id); fn(); }
    },
    scroll() { fire('scroll'); },
    resize() { fire('resize'); },
    click(link) { fire('click', { target: { closest: () => link } }); },
    visible(value) { visible = value; },
    active() { return links.findIndex((link) => link.getAttribute('aria-current') === 'location'); },
    handlers(name) { return events.get(name)?.size ?? 0; },
  };
}

test('active section tracks actual viewport without changing URL or keyboard focus', () => {
  const f = fixture();
  const dispose = setupWorkbenchNavigation(f.nav, f.win, f.doc);
  f.flush();
  assert.equal(f.active(), 0);

  f.win.scrollY = 550;
  f.tops.splice(0, 4, -550, -150, 250, 650);
  f.scroll();
  f.flush();
  assert.equal(f.active(), 1);
  assert.equal(f.links.filter(link => link.getAttribute('aria-current') === 'location').length, 1);

  f.click(f.links[2]);
  assert.equal(f.active(), 2, 'native link click must update current state immediately');
  f.win.scrollY = 900;
  f.tops.splice(0, 4, -900, -500, -150, 250);
  f.flush();
  assert.equal(f.active(), 2);

  f.win.scrollY = 2400;
  f.scroll();
  f.flush();
  assert.equal(f.active(), 3, 'last section remains active when its heading cannot reach top');
  dispose();
  assert.equal(f.handlers('scroll'), 0);
  assert.equal(f.handlers('click'), 0);
});

test('hidden desktop navigation is inert until the stacked breakpoint becomes active', () => {
  const f = fixture();
  f.visible(false);
  const dispose = setupWorkbenchNavigation(f.nav, f.win, f.doc);
  f.flush();
  assert.equal(f.active(), -1);
  f.visible(true);
  f.resize();
  f.flush();
  assert.equal(f.active(), 0);
  dispose();
});

test('native hash navigation remains current when scroll-margin places heading below sticky cutoff', () => {
  const f = fixture();
  const dispose = setupWorkbenchNavigation(f.nav, f.win, f.doc);
  f.flush();

  f.win.location.hash = '#workbench-editor-title';
  f.win.scrollY = 350;
  f.tops.splice(0, 4, -350, 132, 740, 1100);
  f.scroll();
  f.flush();
  assert.equal(f.active(), 1, 'editor target is visible near the top even if it missed sticky cutoff');

  // After the user manually scrolls farther, actual viewport ownership
  // supersedes the stale hash; the location is never locked to the URL.
  f.win.scrollY = 1050;
  f.tops.splice(0, 4, -1050, -340, 48, 560);
  f.scroll();
  f.flush();
  assert.equal(f.active(), 2);
  dispose();
});
