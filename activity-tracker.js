/* Counts focused practice time. Idle time and hidden tabs are excluded. */
(() => {
  'use strict';
  const IDLE_LIMIT = 60_000;

  function dateKey(timestamp) {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function createActivityTracker({ document = globalThis.document, eventTarget = globalThis, now = Date.now, setIntervalFn = globalThis.setInterval, clearIntervalFn = globalThis.clearInterval, onElapsed = () => {}, idleLimit = IDLE_LIMIT } = {}) {
    let active = false;
    let lastUpdate = 0;
    let lastInteraction = 0;
    let interval = null;
    let pending = new Map();

    function addRange(start, end) {
      while (start < end) {
        const date = new Date(start);
        const key = dateKey(start);
        const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
        const segmentEnd = Math.min(end, midnight);
        pending.set(key, (pending.get(key) || 0) + (segmentEnd - start));
        start = segmentEnd;
      }
    }
    function flush() {
      if (!pending.size) return;
      const segments = [...pending].map(([date, milliseconds]) => ({ date, milliseconds }));
      pending = new Map();
      onElapsed(segments);
    }
    function tick(timestamp = now(), countVisibleInterval = false) {
      if (!active) return;
      const visible = countVisibleInterval || document.visibilityState !== 'hidden';
      if (visible) {
        const effectiveEnd = Math.min(timestamp, lastInteraction + idleLimit);
        if (effectiveEnd > lastUpdate) addRange(lastUpdate, effectiveEnd);
      }
      lastUpdate = timestamp;
      if ([...pending.values()].reduce((sum, amount) => sum + amount, 0) >= 5000) flush();
    }
    function interact() {
      if (!active) return;
      const timestamp = now();
      tick(timestamp);
      lastInteraction = timestamp;
      lastUpdate = timestamp;
    }
    function onVisibilityChange() {
      const timestamp = now();
      if (document.visibilityState === 'hidden') {
        tick(timestamp, true);
        flush();
        lastUpdate = timestamp;
      } else {
        lastInteraction = timestamp;
        lastUpdate = timestamp;
      }
    }
    function onPageHide() {
      tick(now());
      flush();
    }
    function begin() {
      stop();
      active = true;
      lastUpdate = now();
      lastInteraction = lastUpdate;
      interval = setIntervalFn(() => tick(), 1000);
    }
    function stop() {
      if (active) tick();
      flush();
      active = false;
      if (interval !== null) clearIntervalFn(interval);
      interval = null;
    }

    document.addEventListener('keydown', interact, true);
    document.addEventListener('pointerdown', interact, true);
    document.addEventListener('touchstart', interact, true);
    document.addEventListener('visibilitychange', onVisibilityChange);
    eventTarget.addEventListener?.('pagehide', onPageHide);
    return { begin, stop, isActive: () => active, destroy() { stop(); } };
  }

  const api = { IDLE_LIMIT, createActivityTracker };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.KivoActivity = api;
})();
