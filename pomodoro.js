/* Small local Pomodoro timer, independent of practice state. */
(() => {
  'use strict';
  const STORAGE_KEY = 'kivo.pomodoro.v1';
  const DURATIONS = [10, 20, 25, 30];

  function createPomodoro({ document = globalThis.document, storage: suppliedStorage, now = Date.now, setIntervalFn = globalThis.setInterval, clearIntervalFn = globalThis.clearInterval } = {}) {
    let storage = suppliedStorage;
    if (storage === undefined) { try { storage = globalThis.localStorage; } catch { storage = null; } }
    const $ = id => document.getElementById(id);
    const els = {
      root: $('pomodoro'), trigger: $('pomodoro-trigger'), triggerTime: $('pomodoro-trigger-time'), panel: $('pomodoro-panel'),
      duration: $('pomodoro-duration'), time: $('pomodoro-time'), fill: $('pomodoro-fill'), message: $('pomodoro-message'),
      toggle: $('pomodoro-toggle'), reset: $('pomodoro-reset')
    };
    let state = readState();
    let interval = null;

    function defaultState() { return { duration: 20, status: 'idle', remainingMs: 20 * 60_000, endsAt: null }; }
    function readState() {
      try {
        const saved = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null');
        const duration = DURATIONS.includes(Number(saved?.duration)) ? Number(saved.duration) : 20;
        const fallback = defaultState();
        if (!saved || !['idle', 'running', 'paused', 'complete'].includes(saved.status)) return fallback;
        const next = { duration, status: saved.status, remainingMs: Math.max(0, Number(saved.remainingMs) || 0), endsAt: Number(saved.endsAt) || null };
        if (next.status === 'running') {
          next.remainingMs = Math.max(0, (next.endsAt || now()) - now());
          if (!next.remainingMs) { next.status = 'complete'; next.endsAt = null; }
        } else if (next.status === 'idle') next.remainingMs = duration * 60_000;
        else if (next.status === 'complete') next.remainingMs = 0;
        next.endsAt = next.status === 'running' ? next.endsAt : null;
        return next;
      } catch { return defaultState(); }
    }
    function persist() {
      try { storage?.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Timer remains available until this page closes. */ }
    }
    function remaining() {
      if (state.status === 'running') return Math.max(0, state.endsAt - now());
      return state.remainingMs;
    }
    function format(milliseconds) {
      const seconds = Math.ceil(milliseconds / 1000);
      return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    }
    function clearTicker() {
      if (interval !== null) clearIntervalFn(interval);
      interval = null;
    }
    function render() {
      const ms = remaining();
      const time = format(ms);
      const active = state.status !== 'idle';
      const percentage = state.status === 'complete' ? 100 : Math.max(0, Math.min(100, (1 - ms / (state.duration * 60_000)) * 100));
      els.duration.value = String(state.duration);
      els.duration.disabled = state.status === 'running' || state.status === 'paused';
      els.time.textContent = time;
      els.triggerTime.textContent = time;
      els.triggerTime.hidden = !active;
      els.trigger.setAttribute('aria-label', active ? `Pomodoro timer, ${time}. Open controls` : 'Open Pomodoro timer');
      els.trigger.classList.toggle('is-running', state.status === 'running');
      els.trigger.classList.toggle('is-paused', state.status === 'paused');
      els.trigger.classList.toggle('is-complete', state.status === 'complete');
      els.root.dataset.timerState = state.status;
      els.fill.style.width = `${percentage}%`;
      els.message.hidden = state.status !== 'complete';
      els.toggle.textContent = state.status === 'running' ? 'Pause' : state.status === 'paused' ? 'Resume' : 'Start';
    }
    function complete() {
      clearTicker();
      state.status = 'complete'; state.remainingMs = 0; state.endsAt = null;
      persist(); render();
    }
    function tick() {
      if (state.status !== 'running') return;
      if (state.endsAt - now() <= 0) complete(); else render();
    }
    function start() {
      if (state.status === 'running') {
        state.remainingMs = remaining(); state.status = 'paused'; state.endsAt = null; clearTicker();
      } else {
        if (state.status === 'idle' || state.status === 'complete') state.remainingMs = state.duration * 60_000;
        state.status = 'running'; state.endsAt = now() + state.remainingMs;
        clearTicker(); interval = setIntervalFn(tick, 1000);
      }
      persist(); render();
    }
    function reset() {
      clearTicker(); state.status = 'idle'; state.remainingMs = state.duration * 60_000; state.endsAt = null;
      persist(); render();
    }
    function setDuration(value) {
      const duration = Number(value);
      if (!DURATIONS.includes(duration) || state.status === 'running' || state.status === 'paused') return;
      state.duration = duration; state.status = 'idle'; state.remainingMs = duration * 60_000; state.endsAt = null;
      persist(); render();
    }
    function setOpen(open, returnFocus = false) {
      els.panel.hidden = !open;
      els.trigger.setAttribute('aria-expanded', String(open));
      if (!open && returnFocus) els.trigger.focus();
    }

    els.trigger.addEventListener('click', () => setOpen(els.panel.hidden));
    els.toggle.addEventListener('click', start);
    els.reset.addEventListener('click', reset);
    els.duration.addEventListener('change', () => setDuration(els.duration.value));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !els.panel.hidden) { setOpen(false, true); event.stopPropagation?.(); }
    });
    document.addEventListener('pointerdown', event => {
      if (!els.panel.hidden && !els.root.contains(event.target)) setOpen(false);
    });
    render();
    if (state.status === 'running') interval = setIntervalFn(tick, 1000);
    if (state.status === 'complete') persist();
    return { getState: () => ({ ...state, remainingMs: remaining() }), start, reset, setDuration, destroy: clearTicker };
  }

  window.KivoPomodoro = { STORAGE_KEY, DURATIONS, createPomodoro };
})();
