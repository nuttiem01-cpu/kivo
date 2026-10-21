const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadThemes(values = {}) {
  const storage = {
    values: new Map(Object.entries(values)),
    getItem(key) { return this.values.get(key) ?? null; },
    setItem(key, value) { this.values.set(key, value); }
  };
  const root = { dataset: {} };
  const window = {};
  vm.runInNewContext(fs.readFileSync('themes.js', 'utf8'), { window, document: { documentElement: root } });
  return { Themes: window.KivoThemes, storage, root };
}

test('theme preference is saved and applied immediately', () => {
  const { Themes, storage, root } = loadThemes();
  const selected = Themes.save('arcade-86', storage);
  assert.equal(selected, 'arcade-86');
  assert.equal(storage.getItem(Themes.STORAGE_KEY), 'arcade-86');
  assert.equal(Themes.apply(selected, root), 'arcade-86');
  assert.equal(root.dataset.theme, 'arcade-86');
  assert.deepEqual(Array.from(Themes.themes, theme => theme.id), ['classic', 'arcade-86', 'maze', 'quest']);
});

test('missing or invalid preference safely falls back to Classic', () => {
  const { Themes, storage, root } = loadThemes({ 'kivo.theme': 'unknown' });
  assert.equal(Themes.read(storage), 'classic');
  assert.equal(Themes.normalize(undefined), 'classic');
  assert.equal(Themes.apply('invalid', root), 'classic');
  assert.equal(root.dataset.theme, 'classic');
  assert.equal(Themes.normalize('maze'), 'maze');
  assert.equal(Themes.normalize('quest'), 'quest');
});

test('theme preference storage failures do not break application setup', () => {
  const { Themes, root } = loadThemes();
  const blockedStorage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  assert.equal(Themes.read(blockedStorage), 'classic');
  assert.equal(Themes.save('arcade-86', blockedStorage), 'arcade-86');
  assert.equal(Themes.apply('arcade-86', root), 'arcade-86');
});
