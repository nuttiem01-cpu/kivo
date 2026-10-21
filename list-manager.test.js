const test = require('node:test');
const assert = require('node:assert/strict');
const Lists = require('./list-manager.js');

function idFactory() {
  let index = 0;
  return () => `id-${++index}`;
}

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    values
  };
}

test('multiple lists keep progress and mistakes independent', () => {
  const makeId = idFactory(), workspace = Lists.createWorkspace();
  const first = Lists.addList(workspace, 'List A', [{ key: 'a', value: 'one' }, { key: 'b', value: 'two' }], makeId);
  const second = Lists.addList(workspace, 'List B', [{ key: 'a', value: 'uno' }], makeId);
  Lists.saveProgress(workspace, first.id, 'key-value', [{ id: first.entries[1].id }]);
  Lists.addMistake(workspace, first.id, first.entries[0], makeId);
  assert.deepEqual(Lists.progressQueue(workspace, first, 'key-value').map(entry => entry.id), [first.entries[1].id]);
  assert.equal(Lists.progressQueue(workspace, second, 'key-value'), null);
  assert.equal(workspace.mistakes[first.id].length, 1);
  assert.equal(workspace.mistakes[second.id], undefined);
});

test('CSV export and import round-trip Unicode, quotes, commas, and line breaks', () => {
  const entries = [
    { key: 'été, déjà', value: '夏 "quoted"' },
    { key: 'line\nbreak', value: 'être prêt' }
  ];
  const csv = Lists.encodeCSV(entries);
  const imported = Lists.parseCSV(csv, idFactory());
  assert.deepEqual(imported.entries.map(({ key, value }) => ({ key, value })), entries);
  assert.equal(imported.duplicateCount, 0);
});

test('CSV import skips normalized duplicate pairs and reports their count', () => {
  const parsed = Lists.parseCSV('key,value\r\nterm,answer\r\n term , answer \r\nother,value', idFactory());
  assert.equal(parsed.entries.length, 2);
  assert.equal(parsed.duplicateCount, 1);
  assert.match(Lists.validateEntries([{ key: 'a', value: '' }]), /both a key and a value/);
  assert.match(Lists.validateEntries([{ key: 'a', value: 'b' }, { key: ' a ', value: 'b' }]), /duplicate/);
});

test('list editing preserves entry IDs and entry deletion removes only the selected row', () => {
  const makeId = idFactory(), workspace = Lists.createWorkspace();
  const list = Lists.addList(workspace, 'Editable', [{ key: 'old', value: 'value' }, { key: 'keep', value: 'this' }], makeId);
  const originalId = list.entries[0].id;
  Lists.setListDraft(workspace, list.id, {
    name: 'Renamed', keyLabel: 'Concept', valueLabel: 'Definition',
    entries: [{ ...list.entries[0], key: 'new' }, list.entries[1]]
  }, makeId);
  assert.equal(list.name, 'Renamed');
  assert.equal(list.keyLabel, 'Concept');
  assert.equal(list.entries[0].id, originalId);
  assert.equal(Lists.deleteEntry(list, list.entries[1].id), true);
  assert.deepEqual(list.entries.map(entry => entry.key), ['new']);
});

test('duplicate and delete operations create separate list state without sharing progress or mistakes', () => {
  const makeId = idFactory(), workspace = Lists.createWorkspace();
  const source = Lists.addList(workspace, 'Terms', [{ key: 'key', value: 'value' }], makeId);
  Lists.saveProgress(workspace, source.id, 'key-value', [{ id: source.entries[0].id }]);
  Lists.addMistake(workspace, source.id, source.entries[0], makeId);
  const copy = Lists.duplicateList(workspace, source.id, makeId);
  assert.equal(copy.name, 'Terms copy');
  assert.notEqual(copy.id, source.id);
  assert.notEqual(copy.entries[0].id, source.entries[0].id);
  assert.equal(workspace.progress[copy.id], undefined);
  assert.equal(workspace.mistakes[copy.id], undefined);
  assert.equal(Lists.deleteList(workspace, source.id), true);
  assert.equal(workspace.progress[source.id], undefined);
  assert.equal(workspace.mistakes[source.id], undefined);
});

test('legacy mistakes are recovered and legacy progress restores when its CSV is re-imported', () => {
  const makeId = idFactory();
  const entries = [{ key: 'one', value: 'un' }, { key: 'two', value: 'deux' }];
  const fingerprint = Lists.legacyFingerprint(entries, 'key-value');
  const oldProgress = { [fingerprint]: { fileName: 'old.csv', direction: 'key-value', remaining: [1] } };
  const oldMistakes = [{ key: 'old miss', value: 'ancienne erreur' }, { key: 'old miss', value: 'ancienne erreur' }];
  const storage = memoryStorage({
    [Lists.LEGACY_PROGRESS_KEY]: JSON.stringify(oldProgress),
    [Lists.LEGACY_MISTAKES_KEY]: JSON.stringify(oldMistakes)
  });
  const workspace = Lists.loadWorkspace(storage, makeId);
  assert.equal(workspace.lists.length, 1);
  assert.equal(workspace.lists[0].name, 'Recovered mistakes');
  assert.equal(workspace.mistakes[workspace.lists[0].id].length, 1);
  assert.match(workspace.migrationNotice, /progress is preserved/);
  assert.ok(storage.values.has(Lists.LEGACY_PROGRESS_KEY));
  assert.ok(storage.values.has(Lists.LEGACY_MISTAKES_KEY));

  const imported = Lists.addList(workspace, 'old', entries, makeId);
  assert.equal(Lists.migrateProgressForList(workspace, imported), 1);
  assert.deepEqual(Lists.progressQueue(workspace, imported, 'key-value').map(entry => entry.key), ['two']);
});

test('workspace save and load preserve multiple lists, progress, and mistake collections', () => {
  const makeId = idFactory(), storage = memoryStorage(), workspace = Lists.createWorkspace();
  const first = Lists.addList(workspace, 'A', [{ key: 'a', value: '1' }], makeId);
  const second = Lists.addList(workspace, 'B', [{ key: 'b', value: '2' }], makeId);
  Lists.saveProgress(workspace, first.id, 'mixed', [{ id: first.entries[0].id }]);
  Lists.addMistake(workspace, second.id, second.entries[0], makeId);
  assert.equal(Lists.saveWorkspace(storage, workspace), true);
  const restored = Lists.loadWorkspace(storage, makeId);
  assert.deepEqual(restored.lists.map(list => list.name), ['A', 'B']);
  assert.equal(Lists.progressQueue(restored, restored.lists[0], 'mixed').length, 1);
  assert.equal(restored.mistakes[second.id].length, 1);
});

test('workspace backups import as separate lists without overwriting existing lists', () => {
  const makeId = idFactory(), workspace = Lists.createWorkspace();
  const original = Lists.addList(workspace, 'Shared name', [{ key: 'a', value: '1' }], makeId);
  const backup = JSON.parse(JSON.stringify({ format: 'kivo-workspace-v1', workspace }));
  const result = Lists.mergeBackup(workspace, backup, makeId);
  assert.equal(result.listsAdded, 1);
  assert.equal(workspace.lists.length, 2);
  assert.notEqual(workspace.lists[0].id, workspace.lists[1].id);
  assert.match(workspace.lists[1].name, /imported/);
});

test('file:// app assumptions use relative classic scripts and no network file loading', () => {
  const fs = require('node:fs');
  const html = fs.readFileSync('index.html', 'utf8');
  const app = fs.readFileSync('app.js', 'utf8');
  assert.match(html, /<script src="list-manager\.js/);
  assert.match(html, /<script src="app\.js/);
  assert.doesNotMatch(html, /type="module"|https?:\/\/.*\.js/);
  assert.doesNotMatch(app, /\bfetch\s*\(/);
  assert.match(html, /type="file" accept="\.csv,text\/csv"/);
});
