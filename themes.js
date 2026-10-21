/* Small, data-driven theme registry for the standalone Kivo app. */
(() => {
  'use strict';
  const STORAGE_KEY = 'kivo.theme';
  const themes = [
    { id: 'classic', name: 'Classic', description: 'Calm and focused', completionEyebrow: 'SESSION COMPLETE', completionTitle: 'Nice work.' },
    { id: 'arcade-86', name: "Arcade '86", description: 'Retro game energy', completionEyebrow: 'LEVEL COMPLETE', completionTitle: 'LEVEL COMPLETE!' },
    { id: 'maze', name: 'Maze', description: 'Chase your next word', completionEyebrow: 'MAZE CLEARED', completionTitle: 'MAZE COMPLETE!' },
    { id: 'quest', name: 'Quest', description: 'Travel through a word adventure', completionEyebrow: 'MISSION COMPLETE', completionTitle: 'QUEST COMPLETE!' }
  ];
  const byId = new Map(themes.map(theme => [theme.id, theme]));

  function normalize(id) { return byId.has(id) ? id : 'classic'; }
  function read(storage) {
    try { return normalize(storage?.getItem(STORAGE_KEY)); }
    catch { return 'classic'; }
  }
  function apply(id, root = globalThis.document?.documentElement) {
    const theme = normalize(id);
    if (root) root.dataset.theme = theme;
    return theme;
  }
  function save(id, storage) {
    const theme = normalize(id);
    try { storage?.setItem(STORAGE_KEY, theme); } catch { /* Theme remains active for this session. */ }
    return theme;
  }

  window.KivoThemes = { STORAGE_KEY, themes, normalize, read, apply, save };
})();
