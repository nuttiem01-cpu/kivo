const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('pomodoro.js', 'utf8');

class Element {
  constructor() { this.listeners = {}; this.attributes = {}; this.style = {}; this.hidden = false; this.disabled = false; this.dataset = {}; this.classes = new Set(); this.classList = { toggle: (name, on) => on ? this.classes.add(name) : this.classes.delete(name) }; }
  addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
  async dispatch(type, event = {}) { for (const callback of this.listeners[type] || []) await callback(event); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  focus() { this.focused = true; }
}
class Storage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
}
function harness(storage = new Storage(), initialTime = 1_000_000) {
  let time = initialTime, nextId = 0;
  const ids = ['pomodoro','pomodoro-trigger','pomodoro-trigger-time','pomodoro-panel','pomodoro-duration','pomodoro-time','pomodoro-fill','pomodoro-message','pomodoro-toggle','pomodoro-reset'];
  const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
  elements['pomodoro-panel'].hidden = true;
  elements['pomodoro-duration'].value = '20';
  elements['pomodoro'].contains = target => target === elements['pomodoro'] || target === elements['pomodoro-trigger'] || target === elements['pomodoro-panel'];
  const document = { listeners: {}, getElementById: id => elements[id], addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); } };
  const ticks = new Map();
  const clearIntervalFn = id => ticks.delete(id);
  const setIntervalFn = callback => { const id = ++nextId; ticks.set(id, callback); return id; };
  const window = {};
  vm.runInNewContext(source, { window });
  const timer = window.KivoPomodoro.createPomodoro({ document, storage, now: () => time, setIntervalFn, clearIntervalFn });
  return { timer, storage, elements, document, ticks, setTime: value => { time = value; }, tick: () => [...ticks.values()].forEach(callback => callback()) };
}

test('timer popover opens, closes with Escape or outside click, and returns focus', async () => {
  const app = harness();
  const { elements, document } = app;
  assert.equal(elements['pomodoro-panel'].hidden, true);
  await elements['pomodoro-trigger'].dispatch('click');
  assert.equal(elements['pomodoro-panel'].hidden, false);
  assert.equal(elements['pomodoro-trigger'].attributes['aria-expanded'], 'true');
  for (const callback of document.listeners.keydown) await callback({ key: 'Escape', stopPropagation() {} });
  assert.equal(elements['pomodoro-panel'].hidden, true);
  assert.equal(elements['pomodoro-trigger'].focused, true);
  await elements['pomodoro-trigger'].dispatch('click');
  for (const callback of document.listeners.pointerdown) await callback({ target: new Element() });
  assert.equal(elements['pomodoro-panel'].hidden, true);
});

test('duration, pause, resume, reset, and completion use elapsed time and only one ticker', async () => {
  const app = harness();
  const { timer, elements, ticks, setTime, tick } = app;
  elements['pomodoro-duration'].value = '10';
  await elements['pomodoro-duration'].dispatch('change');
  assert.equal(timer.getState().remainingMs, 600_000);
  await elements['pomodoro-toggle'].dispatch('click');
  assert.equal(timer.getState().status, 'running');
  assert.equal(ticks.size, 1);
  setTime(1_017_000); tick();
  assert.equal(elements['pomodoro-time'].textContent, '09:43');
  await elements['pomodoro-toggle'].dispatch('click');
  assert.equal(timer.getState().status, 'paused');
  assert.equal(ticks.size, 0);
  setTime(1_500_000);
  await elements['pomodoro-toggle'].dispatch('click');
  assert.equal(timer.getState().status, 'running');
  assert.equal(ticks.size, 1);
  await elements['pomodoro-reset'].dispatch('click');
  assert.equal(timer.getState().status, 'idle');
  assert.equal(timer.getState().remainingMs, 600_000);
  assert.equal(ticks.size, 0);
  await elements['pomodoro-toggle'].dispatch('click');
  setTime(2_100_001); tick();
  assert.equal(timer.getState().status, 'complete');
  assert.equal(elements['pomodoro-time'].textContent, '00:00');
  assert.equal(elements['pomodoro-message'].hidden, false);
  assert.equal(elements['pomodoro-trigger'].classes.has('is-complete'), true);
  assert.equal(ticks.size, 0);
});

test('a running timer resumes from its saved deadline after reload, including overdue completion', async () => {
  const storage = new Storage();
  const first = harness(storage, 2_000_000);
  first.timer.setDuration(10);
  first.timer.start();
  first.setTime(2_120_000);
  first.timer.destroy();

  const resumed = harness(storage, 2_120_000);
  assert.equal(resumed.timer.getState().status, 'running');
  assert.equal(resumed.timer.getState().remainingMs, 480_000);
  assert.equal(resumed.ticks.size, 1);
  resumed.timer.destroy();

  const overdue = harness(storage, 2_601_000);
  assert.equal(overdue.timer.getState().status, 'complete');
  assert.equal(overdue.elements['pomodoro-message'].hidden, false);
  assert.equal(overdue.ticks.size, 0);
});
