const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Lists = require('./list-manager.js');
const Practice = require('./practice-helpers.js');

const html = fs.readFileSync('index.html', 'utf8');
const appSource = fs.readFileSync('app.js', 'utf8');
const themeSource = fs.readFileSync('themes.js', 'utf8');
const styleSource = fs.readFileSync('style.css', 'utf8');

class FakeElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase(); this.id = id; this.children = []; this.listeners = {};
    this.attributes = {}; this.dataset = {}; this.style = { setProperty(name, value) { this[name] = value; } }; this.hidden = false; this.disabled = false;
    this.checked = false; this.textContent = ''; this.value = '';
    this.classList = {
      values: new Set(),
      add: (...names) => names.forEach(name => this.classList.values.add(name)),
      remove: (...names) => names.forEach(name => this.classList.values.delete(name)),
      toggle: (name, force) => {
        const enabled = force === undefined ? !this.classList.values.has(name) : force;
        if (enabled) this.classList.values.add(name); else this.classList.values.delete(name);
        return enabled;
      }
    };
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  async dispatch(type, event = {}) {
    event.target ||= this;
    for (const listener of this.listeners[type] || []) await listener(event);
  }
  click() { return this.dispatch('click'); }
  focus() { this.ownerDocument.activeElement = this; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  querySelectorAll(selector) {
    const all = [];
    const visit = element => {
      for (const child of element.children) {
        all.push(child); visit(child);
      }
    };
    visit(this);
    if (selector === 'input[type="checkbox"]:checked') return all.filter(item => item.tagName === 'INPUT' && item.type === 'checkbox' && item.checked);
    if (selector === 'input[type="checkbox"]') return all.filter(item => item.tagName === 'INPUT' && item.type === 'checkbox');
    if (selector === '[role="tab"]') return all.filter(item => item.attributes.role === 'tab');
    return [];
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  get options() { return this.children; }
  remove() { this.removed = true; }
  scrollIntoView() {}
}

class MemoryStorage {
  constructor(values = {}) { this.values = new Map(Object.entries(values)); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

class FakeBlob {
  constructor(parts, options) { this.parts = parts; this.type = options?.type || ''; }
  text() { return Promise.resolve(this.parts.join('')); }
}

function seededWorkspace() {
  const workspace = Lists.createWorkspace();
  const first = Lists.addList(workspace, 'Animals', [{ key: 'cat', value: 'chat' }]);
  Lists.addList(workspace, 'Food', [{ key: 'bread', value: 'pain' }]);
  Lists.addList(workspace, 'Places', [{ key: 'house', value: 'maison' }]);
  workspace.activeListId = first.id;
  Lists.saveProgress(workspace, first.id, 'key-value', [{ id: first.entries[0].id }]);
  Lists.addMistake(workspace, first.id, first.entries[0]);
  return workspace;
}

function createApp(workspace = seededWorkspace(), confirm = () => true) {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => id);
  const elements = new Map(ids.map(id => [id, new FakeElement(id === 'list-select' || id === 'direction' || id === 'mode' ? 'select' : 'div', id)]));
  const document = {
    activeElement: null,
    created: [],
    body: new FakeElement('body'),
    documentElement: { dataset: {} },
    getElementById: id => elements.get(id) || null,
    createElement(tagName) {
      const element = new FakeElement(tagName); element.ownerDocument = document; document.created.push(element); return element;
    }
  };
  for (const element of elements.values()) element.ownerDocument = document;
  for (const id of ['direction', 'mode']) {
    const select = elements.get(id);
    const count = id === 'direction' ? 3 : 2;
    for (let i = 0; i < count; i++) select.append(new FakeElement('option'));
  }
  const storage = new MemoryStorage({ [Lists.WORKSPACE_KEY]: JSON.stringify(workspace) });
  const confirmations = [];
  const window = {
    localStorage: storage,
    KivoLists: Lists,
    KivoPractice: Practice,
    confirm(message) { confirmations.push(message); return confirm(message); }
  };
  const anchors = [];
  const URL = { createObjectURL(blob) { URL.lastBlob = blob; return 'blob:test'; }, revokeObjectURL() {} };
  const originalCreateElement = document.createElement.bind(document);
  document.createElement = tag => {
    const element = originalCreateElement(tag);
    if (tag === 'a') anchors.push(element);
    return element;
  };
  const context = {
    window, document, Blob: FakeBlob, URL, setTimeout() {},
    CSS: { escape: value => value }, requestAnimationFrame(callback) { callback(); }
  };
  vm.runInNewContext(themeSource, context, { filename: 'themes.js' });
  vm.runInNewContext(appSource, context, { filename: 'app.js' });
  return { window, document, elements, storage, confirmations, anchors, URL };
}

test('all JavaScript DOM selectors map to elements in the current HTML', () => {
  const idsBlock = appSource.match(/const ids = \[([\s\S]*?)\];/)[1];
  const declared = new Set([...idsBlock.matchAll(/'([^']+)'/g)].map(([, id]) => id.replace(/-([a-z])/g, (_, character) => character.toUpperCase())));
  const referenced = new Set([...appSource.matchAll(/\bels\.([A-Za-z_$][\w$]*)/g)].map(([, name]) => name));
  assert.deepEqual([...referenced].filter(name => !declared.has(name)), []);
  for (const id of idsBlock.matchAll(/'([^']+)'/g)) assert.ok(html.includes(`id="${id[1]}"`), `missing HTML element #${id[1]}`);
});

test('standalone HTML loads its local theme module before app initialization', () => {
  const themeScript = html.indexOf('src="themes.js');
  const appScript = html.indexOf('src="app.js');
  assert.ok(themeScript >= 0 && appScript > themeScript);
  assert.doesNotMatch(html, /https?:\/\//);
});

test('celebration motion respects reduced-motion preferences', () => {
  assert.match(styleSource, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(styleSource, /\.celebration-piece\s*\{\s*display:none\s*\}/);
});

test('app initializes with existing lists and wires direct list actions', async () => {
  const workspace = seededWorkspace();
  const app = createApp(workspace);
  const overview = app.elements.get('list-overview');
  assert.equal(overview.children.length, 3);
  assert.deepEqual(overview.children[0].children[1].children.map(button => button.textContent), ['Edit', 'Duplicate', 'Export CSV', 'Delete']);
  assert.equal(app.elements.get('list-select').options.length, 4);

  const firstRow = overview.children[0];
  await firstRow.children[1].children[0].click();
  assert.equal(app.elements.get('editor').hidden, false);
  assert.equal(app.elements.get('editor-name').value, 'Animals');
  assert.equal(app.elements.get('editor-key-heading').textContent, 'Key');

  await app.elements.get('editor-back-button').click();
  const currentOverview = app.elements.get('list-overview');
  await currentOverview.children[1].children[1].children[1].click();
  const afterDuplicate = JSON.parse(app.storage.getItem(Lists.WORKSPACE_KEY));
  assert.equal(afterDuplicate.lists.length, 4);
  assert.equal(afterDuplicate.activeListId, workspace.activeListId);

  const rowByName = name => app.elements.get('list-overview').children.find(row => row.children[0].children[1].children[0].textContent === name);
  const foodRow = rowByName('Food');
  await foodRow.children[1].children[2].click();
  assert.equal(await app.URL.lastBlob.text(), Lists.encodeCSV(afterDuplicate.lists.find(list => list.name === 'Food').entries));
  assert.equal(app.anchors.at(-1).download, 'Food.csv');
  await rowByName('Places').children[1].children[3].click();
  assert.equal(JSON.parse(app.storage.getItem(Lists.WORKSPACE_KEY)).lists.length, 3);

  const checkbox = app.elements.get('list-overview').children[0].children[0].children[0];
  checkbox.checked = true;
  await checkbox.dispatch('change');
  assert.equal(app.elements.get('delete-selected-lists').disabled, false);
  await app.elements.get('delete-selected-lists').click();
  const afterDelete = JSON.parse(app.storage.getItem(Lists.WORKSPACE_KEY));
  assert.equal(afterDelete.lists.length, 2);
  assert.equal(afterDelete.lists.some(list => list.name === 'Animals'), false);
});

test('imports multiple CSV files as separate lists and reports individual failures', async () => {
  const workspace = seededWorkspace();
  const originalActiveListId = workspace.activeListId;
  const app = createApp(workspace);
  const input = app.elements.get('csv-file');
  const validFile = (name, text) => ({ name, async text() { return text; } });
  input.value = 'selected-files';
  input.files = [
    validFile('colors.csv', 'key,value\nred,rouge'),
    validFile('invalid.csv', 'not a valid pair'),
    validFile('numbers.csv', 'key,value\none,un')
  ];
  await input.dispatch('change');

  const saved = JSON.parse(app.storage.getItem(Lists.WORKSPACE_KEY));
  assert.equal(saved.lists.length, 5);
  assert.deepEqual(saved.lists.slice(3).map(list => list.name), ['colors', 'numbers']);
  assert.equal(saved.activeListId, originalActiveListId);
  assert.deepEqual(saved.progress[originalActiveListId]['key-value'], { remaining: [workspace.lists[0].entries[0].id] });
  assert.equal(saved.mistakes[originalActiveListId][0].key, 'cat');
  assert.equal(app.elements.get('list-overview').children.length, 5);
  assert.equal(app.elements.get('list-select').options.length, 6);
  assert.match(app.elements.get('list-status').textContent, /Imported 2 of 3 CSV files/);
  assert.match(app.elements.get('list-status').textContent, /invalid\.csv/);
  assert.equal(input.value, '');
  assert.match(html, /id="csv-file"[^>]*\bmultiple(?:\s|>)/);
});

test('About theme cards apply and persist the selected theme without reloading', async () => {
  const app = createApp();
  const cards = app.elements.get('theme-picker').children;
  assert.equal(cards.length, 4);
  assert.equal(cards[0].attributes['aria-pressed'], 'true');
  await cards[1].click();
  assert.equal(app.document.documentElement.dataset.theme, 'arcade-86');
  assert.equal(app.storage.getItem('kivo.theme'), 'arcade-86');
  assert.equal(cards[0].attributes['aria-pressed'], 'false');
  assert.equal(cards[1].attributes['aria-pressed'], 'true');
  await cards[2].click();
  assert.equal(app.document.documentElement.dataset.theme, 'maze');
  assert.equal(app.storage.getItem('kivo.theme'), 'maze');
  assert.equal(cards[1].attributes['aria-pressed'], 'false');
  assert.equal(cards[2].attributes['aria-pressed'], 'true');
  await cards[3].click();
  assert.equal(app.document.documentElement.dataset.theme, 'quest');
  assert.equal(app.storage.getItem('kivo.theme'), 'quest');
  assert.equal(cards[2].attributes['aria-pressed'], 'false');
  assert.equal(cards[3].attributes['aria-pressed'], 'true');
});

test('Quest map follows mastered entries and stays still for wrong answers and hints', async () => {
  const workspace = seededWorkspace();
  const list = workspace.lists[0];
  list.entries.push({ id: 'entry-two', key: 'dog', value: 'chien' });
  workspace.progress = {};
  workspace.mistakes = {};
  const app = createApp(workspace);
  await app.elements.get('theme-picker').children[3].click();
  app.elements.get('direction').value = 'key-value';
  app.elements.get('mode').value = 'full';
  await app.elements.get('start-button').click();
  assert.equal(app.elements.get('quest-world').hidden, false);
  assert.equal(app.elements.get('quest-world').style['--quest-hero-position'], '8%');
  await app.elements.get('answer').dispatch('keydown', { key: ' ', preventDefault() {} });
  assert.equal(app.elements.get('quest-world').style['--quest-hero-position'], '8%');

  app.elements.get('answer').value = 'not right';
  await app.elements.get('answer-form').dispatch('submit', { preventDefault() {} });
  assert.equal(app.elements.get('quest-world').style['--quest-hero-position'], '8%');
  await app.elements.get('answer-form').dispatch('submit', { preventDefault() {} });
  const answerFor = { cat: 'chat', dog: 'chien' };
  app.elements.get('answer').value = answerFor[app.elements.get('prompt').textContent];
  await app.elements.get('answer-form').dispatch('submit', { preventDefault() {} });
  assert.equal(app.elements.get('quest-world').style['--quest-hero-position'], '49%');
  assert.equal(app.elements.get('quest-score').textContent, '1');
  assert.equal(app.elements.get('quest-progress-label').textContent, '50%');
  assert.match(styleSource, /prefers-reduced-motion:reduce[\s\S]*?quest-hero/);
});

test('a completed session celebrates once and makes the useful finish action primary', async () => {
  const workspace = seededWorkspace();
  workspace.lists = [workspace.lists[0]];
  workspace.mistakes = {};
  const app = createApp(workspace);
  app.elements.get('direction').value = 'key-value';
  app.elements.get('mode').value = 'full';
  await app.elements.get('start-button').click();
  app.elements.get('answer').value = 'chat';
  await app.elements.get('answer-form').dispatch('submit', { preventDefault() {} });
  await app.elements.get('answer-form').dispatch('submit', { preventDefault() {} });

  assert.equal(app.elements.get('completion').hidden, false);
  assert.equal(app.elements.get('final-correct').textContent, '1');
  assert.equal(app.elements.get('final-mistakes').textContent, '0');
  assert.equal(app.elements.get('completion-eyebrow').textContent, 'SESSION COMPLETE');
  assert.equal(app.elements.get('celebration').children.length, 18);
  assert.equal(app.elements.get('completion-mistakes-button').disabled, true);
  assert.equal(app.elements.get('completion-back-button').classList.values.has('primary'), true);
  await app.elements.get('answer-form').dispatch('submit', { preventDefault() {} });
  assert.equal(app.elements.get('celebration').children.length, 18);
});

test('the finish message follows the selected Maze theme', async () => {
  const workspace = seededWorkspace();
  workspace.lists = [workspace.lists[0]];
  workspace.mistakes = {};
  const app = createApp(workspace);
  await app.elements.get('theme-picker').children[2].click();
  app.elements.get('direction').value = 'key-value';
  await app.elements.get('start-button').click();
  app.elements.get('answer').value = 'chat';
  await app.elements.get('answer-form').dispatch('submit', { preventDefault() {} });
  await app.elements.get('answer-form').dispatch('submit', { preventDefault() {} });
  assert.equal(app.elements.get('completion-eyebrow').textContent, 'MAZE CLEARED');
  assert.equal(app.elements.get('completion-title').textContent, 'MAZE COMPLETE!');
  assert.equal(app.elements.get('completion-mistakes-button').disabled, true);
  assert.equal(app.elements.get('completion-back-button').classList.values.has('primary'), true);
});

test('Quest finishline has its own adventure scene and completion title', async () => {
  const workspace = seededWorkspace();
  workspace.lists = [workspace.lists[0]];
  workspace.mistakes = {};
  const app = createApp(workspace);
  await app.elements.get('theme-picker').children[3].click();
  app.elements.get('direction').value = 'key-value';
  await app.elements.get('start-button').click();
  app.elements.get('answer').value = 'chat';
  await app.elements.get('answer-form').dispatch('submit', { preventDefault() {} });
  await app.elements.get('answer-form').dispatch('submit', { preventDefault() {} });
  assert.equal(app.elements.get('completion-eyebrow').textContent, 'MISSION COMPLETE');
  assert.equal(app.elements.get('completion-title').textContent, 'QUEST COMPLETE!');
  assert.match(html, /class="quest-finish"/);
  assert.match(styleSource, /@keyframes quest-arrive/);
});

test('download and restore handlers use the workspace format and replace saved state after confirmation', async () => {
  const app = createApp();
  await app.elements.get('export-progress').click();
  const downloaded = JSON.parse(await app.URL.lastBlob.text());
  assert.equal(downloaded.format, 'kivo-workspace-v1');
  assert.equal(downloaded.workspace.lists.length, 3);
  assert.equal(app.anchors.at(-1).download, 'kivo-workspace-backup.json');

  const backup = seededWorkspace();
  backup.lists[0].name = 'Clean restored list';
  const file = { async text() { return JSON.stringify({ format: 'kivo-workspace-v1', workspace: backup }); } };
  await app.elements.get('progress-file').dispatch('change', { target: { files: [file], value: 'backup.json' } });

  assert.match(app.confirmations[0], /This will replace your current lists, progress and mistakes/);
  const saved = JSON.parse(app.storage.getItem(Lists.WORKSPACE_KEY));
  assert.equal(saved.lists.length, 3);
  assert.equal(saved.lists[0].name, 'Clean restored list');
  assert.equal(saved.lists[0].id, backup.lists[0].id);
  assert.deepEqual(saved.progress[backup.lists[0].id]['key-value'], { remaining: [backup.lists[0].entries[0].id] });
  assert.equal(saved.mistakes[backup.lists[0].id][0].key, backup.lists[0].entries[0].key);
  assert.equal(app.elements.get('list-overview').children.length, 3);
  assert.equal(app.elements.get('progress-file').value, '');
});

test('cancelling restore leaves the existing workspace untouched', async () => {
  const app = createApp(seededWorkspace(), () => false);
  const before = app.storage.getItem(Lists.WORKSPACE_KEY);
  const replacement = seededWorkspace();
  replacement.lists[0].name = 'Must not replace';
  const file = { async text() { return JSON.stringify({ format: 'kivo-workspace-v1', workspace: replacement }); } };
  await app.elements.get('progress-file').dispatch('change', { target: { files: [file], value: 'backup.json' } });
  assert.equal(app.storage.getItem(Lists.WORKSPACE_KEY), before);
  assert.equal(app.elements.get('list-overview').children.length, 3);
  assert.equal(JSON.parse(app.storage.getItem(Lists.WORKSPACE_KEY)).lists[0].name === 'Must not replace', false);
});
