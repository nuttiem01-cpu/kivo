const test = require('node:test');
const assert = require('node:assert/strict');
const Activity = require('./activity-tracker.js');

function harness(startAt = 1_000_000) {
  let time = startAt, intervalId = 0;
  const intervals = new Map(), document = { visibilityState: 'visible', listeners: {}, addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); } };
  const windowListeners = {};
  const segments = [];
  const tracker = Activity.createActivityTracker({
    document, eventTarget: { addEventListener(type, fn) { (windowListeners[type] ||= []).push(fn); } }, now: () => time,
    setIntervalFn(fn) { intervals.set(++intervalId, fn); return intervalId; },
    clearIntervalFn(id) { intervals.delete(id); },
    onElapsed(days) { segments.push(...days); }
  });
  return {
    tracker, document, intervals, segments,
    setTime(value) { time = value; },
    tick() { for (const fn of intervals.values()) fn(); },
    dispatchDocument(type) { for (const fn of document.listeners[type] || []) fn(); },
    dispatchWindow(type) { for (const fn of windowListeners[type] || []) fn(); },
    windowListeners
  };
}

test('practice clock counts focused elapsed time, then pauses after a minute of inactivity', () => {
  const app = harness();
  app.tracker.begin();
  assert.equal(app.intervals.size, 1);
  app.setTime(1_010_000); app.tick();
  app.setTime(1_080_000); app.tick();
  app.setTime(1_085_000); app.dispatchDocument('keydown');
  app.setTime(1_090_000); app.tick();
  app.tracker.stop();
  assert.equal(app.intervals.size, 0);
  assert.equal(app.segments.reduce((sum, item) => sum + item.milliseconds, 0), 65_000);
});

test('hidden tabs pause practice time and return to visible starts a fresh active window', () => {
  const app = harness();
  app.tracker.begin();
  app.setTime(1_010_000);
  app.document.visibilityState = 'hidden'; app.dispatchDocument('visibilitychange');
  app.setTime(1_050_000); app.tick();
  app.document.visibilityState = 'visible'; app.dispatchDocument('visibilitychange');
  app.setTime(1_055_000); app.tick();
  app.tracker.stop();
  assert.equal(app.segments.reduce((sum, item) => sum + item.milliseconds, 0), 15_000);
});

test('elapsed time is split across local calendar days and pagehide flushes short sessions', () => {
  const start = new Date(2026, 5, 18, 23, 59, 58).getTime();
  const app = harness(start);
  app.tracker.begin();
  app.setTime(start + 5000); app.tick();
  app.tracker.stop();
  assert.deepEqual(app.segments, [
    { date: '2026-06-18', milliseconds: 2000 },
    { date: '2026-06-19', milliseconds: 3000 }
  ]);
});

test('destroying an unfinished activity tracker flushes elapsed time without completing a session', () => {
  const app = harness();
  app.tracker.begin();
  app.setTime(1_004_000);
  app.tracker.destroy();
  assert.equal(app.tracker.isActive(), false);
  assert.equal(app.segments.reduce((sum, item) => sum + item.milliseconds, 0), 4000);
});
