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
    const count = 3;
    for (let i = 0; i < count; i++) select.append(new FakeElement('option'));
  }
  elements.get('direction').value = 'key-value';
  elements.get('mode').value = 'full';
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

test('practice progress uses the compact completed and status summary in responsive styling', () => {
  assert.match(html, /> completed<\/span>/);
  assert.match(html, /mastered-independent-count[^>]*>0<\/strong> ok/);
  assert.match(html, /mastered-helped-count[^>]*>0<\/strong> hint/);
  assert.match(html, /remaining-count[^>]*>0<\/strong> left/);
  assert.match(html, /mistake-count[^>]*>0<\/strong> errors/);
  assert.match(html, /aria-label="Entries completed"/);
  assert.match(styleSource, /\.progress-meta-tail\s*\{[\s\S]*?white-space:\s*nowrap/);
  assert.match(styleSource, /@media\(max-width:560px\)\s*\{\s*\.progress-meta\s*\{/);
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

test('imports French and Dutch labeled CSV and retains its column names for practice', async () => {
  const app = createApp();
  const input = app.elements.get('csv-file');
  input.files = [{ name: 'FR-01.csv', text: async () => '\uFEFFFrançais;Néerlandais\r\nbonjour;hallo' }];
  await input.dispatch('change', { target: input });
  const list = Lists.loadWorkspace(app.storage).lists.find(item => item.name === 'FR-01');
  assert.ok(list);
  assert.equal(list.keyLabel, 'Français');
  assert.equal(list.valueLabel, 'Néerlandais');
  assert.deepEqual(list.entries.map(({ key, value }) => ({ key, value })), [{ key: 'bonjour', value: 'hallo' }]);
});

test('near-match retry works in both directions across all themes without revealing the answer', async () => {
  const themes = ['classic', 'arcade-86', 'maze', 'quest'];
  for (let themeIndex = 0; themeIndex < themes.length; themeIndex++) {
    for (const direction of ['key-value', 'value-key']) {
      const workspace = Lists.createWorkspace();
      const list = Lists.addList(workspace, 'French practice', [{ key: 'bonjour', value: 'salut' }]);
      workspace.mistakes = {};
      const app = createApp(workspace);
      await app.elements.get('theme-picker').children[themeIndex].click();
      app.elements.get('direction').value = direction;
      app.elements.get('mode').value = 'full';
      await app.elements.get('start-button').click();
      assert.equal(app.document.documentElement.dataset.theme, themes[themeIndex]);
      assert.equal(app.elements.get('quest-world').hidden, themes[themeIndex] !== 'quest');

      app.elements.get('answer').value = direction === 'key-value' ? 'salutt' : 'bonjoue';
      await app.elements.get('answer-form').dispatch('submit', { preventDefault() {} });
      assert.match(app.elements.get('feedback-title').textContent, /try once more/i);
      assert.equal(app.elements.get('feedback-answer').hidden, true);
      assert.equal(app.elements.get('feedback-answer').textContent, '');
      assert.equal(app.elements.get('answer').disabled, false);
      assert.equal(app.elements.get('mistake-count').textContent, '0');
      assert.equal(app.elements.get('correct-count').textContent, '0');

      app.elements.get('answer').value = direction === 'key-value' ? 'salut' : 'bonjour';
      await app.elements.get('answer-form').dispatch('submit', { preventDefault() {} });
      assert.match(app.elements.get('feedback-title').textContent, /Correct!/);
      assert.equal(app.elements.get('feedback-answer').textContent, direction === 'key-value' ? 'salut' : 'bonjour');
      assert.equal(app.elements.get('mistake-count').textContent, '0');
      assert.equal(app.elements.get('correct-count').textContent, '1');
      await app.elements.get('answer-form').dispatch('submit', { preventDefault() {} });
      assert.equal(app.elements.get('completion').hidden, false);
      assert.equal(app.elements.get('final-correct').textContent, '1');
      assert.equal(app.elements.get('final-mistakes').textContent, '0');
      assert.equal(app.storage.getItem(Lists.WORKSPACE_KEY) !== null, true);
    }
  }
});

test('failed second near-match records one mistake and retains one queue entry', async () => {
  const workspace = Lists.createWorkspace();
  const list = Lists.addList(workspace, 'French practice', [{ key: 'bonjour', value: 'salut' }]);
  workspace.mistakes = {};
  const app = createApp(workspace);
  app.elements.get('collect-mistakes').checked = true;
  app.elements.get('direction').value = 'value-key';
  app.elements.get('mode').value = 'full';
  await app.elements.get('start-button').click();

  app.elements.get('answer').value = 'bonjoue';
  await app.elements.get('answer-form').dispatch('submit', { preventDefault() {} });
  app.elements.get('answer').value = 'wrong';
  await app.elements.get('answer-form').dispatch('submit', { preventDefault() {} });

  assert.equal(app.elements.get('feedback-title').textContent, 'Incorrect');
  assert.equal(app.elements.get('mistake-count').textContent, '1');
  const saved = JSON.parse(app.storage.getItem(Lists.WORKSPACE_KEY));
  assert.equal(saved.mistakes[list.id].length, 1);
  assert.deepEqual(saved.progress[list.id]['value-key'].remaining, [list.entries[0].id]);
  await app.elements.get('answer-form').dispatch('submit', { preventDefault() {} });
  assert.equal(app.elements.get('prompt').textContent, 'salut');
  assert.equal(app.elements.get('remaining-count').textContent, '1');
});

test('hint mastery stays strict by default and preserves retry feedback', async () => {
  const workspace = Lists.createWorkspace();
  const list = Lists.addList(workspace, 'French practice', [{ key: 'bonjour', value: 'salut' }]);
  workspace.mistakes = {};
  const app = createApp(workspace);
  assert.equal(app.elements.get('hint-counts-as-mastered').checked, false);
  app.elements.get('collect-mistakes').checked = true;
  app.elements.get('direction').value = 'key-value';
  await app.elements.get('start-button').click();
  await app.elements.get('answer').dispatch('keydown', { key: ' ', preventDefault() {} });
  app.elements.get('answer').value = 'salut';
  await app.elements.get('answer-form').dispatch('submit', { preventDefault() {} });

  assert.match(app.elements.get('feedback').className, /feedback near/);
  assert.equal(app.elements.get('feedback-title').textContent, 'Correct — hint used');
  assert.equal(app.elements.get('feedback-detail').hidden, true);
  assert.equal(app.elements.get('feedback-detail').textContent, '');
  assert.equal(app.elements.get('correct-count').textContent, '0');
  assert.equal(app.elements.get('remaining-count').textContent, '1');
  assert.equal(app.elements.get('mistake-count').textContent, '1');
  assert.equal(app.elements.get('mastered-helped-count').textContent, '0');

  await app.elements.get('answer-form').dispatch('submit', { preventDefault() {} });
  app.elements.get('answer').value = 'salut';
  await app.elements.get('answer-form').dispatch('submit', { preventDefault() {} });
  await app.elements.get('answer-form').dispatch('submit', { preventDefault() {} });
  assert.equal(app.elements.get('final-correct').textContent, '1');
  assert.equal(app.elements.get('final-independent').textContent, '1');
  assert.equal(app.elements.get('final-helped').textContent, '0');
  assert.equal(app.elements.get('final-mistakes').textContent, '1');
  assert.equal(JSON.parse(app.storage.getItem(Lists.WORKSPACE_KEY)).mistakes[list.id].length, 1);
});

test('enabled hint mastery is orange and works in both directions and all four themes', async () => {
  const themes = ['classic', 'arcade-86', 'maze', 'quest'];
  for (let themeIndex = 0; themeIndex < themes.length; themeIndex++) {
    for (const direction of ['key-value', 'value-key']) {
      const workspace = Lists.createWorkspace();
      const list = Lists.addList(workspace, 'French practice', [{ key: 'bonjour', value: 'salut' }]);
      workspace.mistakes = {};
      const app = createApp(workspace);
      await app.elements.get('theme-picker').children[themeIndex].click();
      app.elements.get('direction').value = direction;
      app.elements.get('hint-counts-as-mastered').checked = true;
      await app.elements.get('start-button').click();
      await app.elements.get('answer').dispatch('keydown', { key: ' ', preventDefault() {} });
      app.elements.get('answer').value = direction === 'key-value' ? 'salut' : 'bonjour';
      await app.elements.get('answer-form').dispatch('submit', { preventDefault() {} });

      assert.match(app.elements.get('feedback').className, /feedback near/);
      assert.equal(app.elements.get('feedback-title').textContent, 'Correct — hint used');
      assert.equal(app.elements.get('feedback-detail').hidden, true);
      assert.equal(app.elements.get('correct-count').textContent, '1');
      assert.equal(app.elements.get('mastered-independent-count').textContent, '0');
      assert.equal(app.elements.get('mastered-helped-count').textContent, '1');
      assert.equal(app.elements.get('remaining-count').textContent, '0');
      assert.equal(app.elements.get('progress-fill').style.width, '0%');
      assert.equal(app.elements.get('progress-fill-helped').style.width, '100%');
      assert.equal(app.elements.get('mistake-count').textContent, '0');

      await app.elements.get('answer-form').dispatch('submit', { preventDefault() {} });
      assert.equal(app.elements.get('final-correct').textContent, '1');
      assert.equal(app.elements.get('final-independent').textContent, '0');
      assert.equal(app.elements.get('final-helped').textContent, '1');
      assert.equal(app.elements.get('final-mistakes').textContent, '0');
      assert.equal(app.document.documentElement.dataset.theme, themes[themeIndex]);
      assert.equal(JSON.parse(app.storage.getItem(Lists.WORKSPACE_KEY)).mistakes[list.id], undefined);
    }
  }
});

test('earlier mistakes remain in the mistake tally when later mastered with help', async () => {
  const workspace = Lists.createWorkspace();
  const list = Lists.addList(workspace, 'French practice', [{ key: 'bonjour', value: 'salut' }]);
  workspace.mistakes = {};
  const app = createApp(workspace);
  app.elements.get('collect-mistakes').checked = true;
  app.elements.get('hint-counts-as-mastered').checked = true;
  app.elements.get('direction').value = 'key-value';
  await app.elements.get('start-button').click();

  app.elements.get('answer').value = 'xyz';
  await app.elements.get('answer-form').dispatch('submit', { preventDefault() {} });
  assert.equal(app.elements.get('mistake-count').textContent, '1');
  await app.elements.get('answer-form').dispatch('submit', { preventDefault() {} });
  await app.elements.get('answer').dispatch('keydown', { key: ' ', preventDefault() {} });
  app.elements.get('answer').value = 'salut';
  await app.elements.get('answer-form').dispatch('submit', { preventDefault() {} });

  assert.equal(app.elements.get('correct-count').textContent, '1');
  assert.equal(app.elements.get('mastered-independent-count').textContent, '0');
  assert.equal(app.elements.get('mastered-helped-count').textContent, '1');
  assert.equal(app.elements.get('mistake-count').textContent, '1');
  await app.elements.get('answer-form').dispatch('submit', { preventDefault() {} });
  assert.equal(app.elements.get('final-independent').textContent, '0');
  assert.equal(app.elements.get('final-helped').textContent, '1');
  assert.equal(app.elements.get('final-mistakes').textContent, '1');
  assert.equal(JSON.parse(app.storage.getItem(Lists.WORKSPACE_KEY)).mistakes[list.id].length, 1);
});

test('the third hint remains a red evaluated answer even when hint mastery is enabled', async () => {
  const workspace = Lists.createWorkspace();
  Lists.addList(workspace, 'French practice', [{ key: 'bonjour', value: 'salut' }]);
  workspace.mistakes = {};
  const app = createApp(workspace);
  app.elements.get('hint-counts-as-mastered').checked = true;
  app.elements.get('direction').value = 'key-value';
  await app.elements.get('start-button').click();
  for (let index = 0; index < 3; index++) await app.elements.get('answer').dispatch('keydown', { key: ' ', preventDefault() {} });
  app.elements.get('answer').value = 'salut';
  await app.elements.get('answer-form').dispatch('submit', { preventDefault() {} });

  assert.match(app.elements.get('feedback').className, /feedback wrong/);
  assert.equal(app.elements.get('feedback-title').textContent, 'Answer revealed');
  assert.equal(app.elements.get('correct-count').textContent, '0');
  assert.equal(app.elements.get('mastered-helped-count').textContent, '0');
  assert.equal(app.elements.get('remaining-count').textContent, '1');
  assert.equal(app.elements.get('mistake-count').textContent, '1');
});

test('oral practice reveals and advances once per Enter in both directions and every theme without changing progress', async () => {
  const themes = ['classic', 'arcade-86', 'maze', 'quest'];
  for (let themeIndex = 0; themeIndex < themes.length; themeIndex++) {
    for (const direction of ['key-value', 'value-key']) {
      const workspace = Lists.createWorkspace();
      const list = Lists.addList(workspace, 'Oral cards', [
        { key: 'cat', value: 'chat' }, { key: 'dog', value: 'chien' }
      ]);
      Lists.saveProgress(workspace, list.id, direction, [{ id: list.entries[0].id }]);
      Lists.addMistake(workspace, list.id, list.entries[1]);
      const app = createApp(workspace);
      const before = app.storage.getItem(Lists.WORKSPACE_KEY);
      await app.elements.get('theme-picker').children[themeIndex].click();
      app.elements.get('direction').value = direction;
      app.elements.get('mode').value = 'oral';
      app.elements.get('collect-mistakes').checked = true;
      app.elements.get('hint-counts-as-mastered').checked = true;
      await app.elements.get('mode').dispatch('change');
      assert.equal(app.elements.get('written-options').hidden, true);
      assert.match(app.elements.get('start-button').textContent, /Start oral practice/);
      await app.elements.get('start-button').click();

      assert.equal(app.document.documentElement.dataset.theme, themes[themeIndex]);
      assert.equal(app.document.activeElement, app.elements.get('check-button'));
      assert.equal(app.elements.get('answer').hidden, true);
      assert.equal(app.elements.get('oral-progress').hidden, false);
      assert.equal(app.elements.get('mastery-heading').hidden, true);
      assert.equal(app.elements.get('mastery-meta').hidden, true);
      assert.equal(app.elements.get('mastery-progress-row').hidden, false);
      assert.equal(app.elements.get('check-button').textContent, '↵');
      assert.equal(app.elements.get('check-button').attributes['aria-label'], 'Reveal answer');
      assert.equal(app.elements.get('progress-fill').style.width, '0%');
      assert.equal(app.elements.get('progress-percentage').textContent, '0%');
      const seen = new Set();
      const expectedByPrompt = direction === 'key-value' ? { cat: 'chat', dog: 'chien' } : { chat: 'cat', chien: 'dog' };

      for (let index = 0; index < 2; index++) {
        const prompt = app.elements.get('prompt').textContent;
        seen.add(prompt);
        await app.elements.get('answer-form').dispatch('submit', { preventDefault() {} });
        assert.equal(app.elements.get('feedback').className, 'feedback correct');
        assert.equal(app.elements.get('feedback-title').hidden, true);
        assert.equal(app.elements.get('feedback-detail').hidden, true);
        assert.equal(app.elements.get('feedback-title').textContent, '');
        assert.equal(app.elements.get('feedback-detail').textContent, '');
        assert.equal(app.elements.get('feedback-answer').textContent, expectedByPrompt[prompt]);
        assert.equal(app.elements.get('oral-reviewed-count').textContent, String(index));
        assert.equal(app.elements.get('progress-fill').style.width, `${index * 50}%`);
        assert.equal(app.elements.get('progress-percentage').textContent, `${index * 50}%`);
        assert.equal(app.elements.get('check-button').textContent, index === 1 ? 'Finish' : '↵');
        assert.equal(app.elements.get('check-button').attributes['aria-label'], index === 1 ? 'Finish oral practice' : 'Next card');
        assert.equal(app.document.activeElement, app.elements.get('check-button'));
        await app.elements.get('answer-form').dispatch('submit', { preventDefault() {} });
        assert.equal(app.elements.get('oral-reviewed-count').textContent, String(index + 1));
        assert.equal(app.elements.get('progress-percentage').textContent, `${(index + 1) * 50}%`);
      }

      assert.equal(seen.size, 2);
      assert.equal(app.elements.get('completion').hidden, false);
      assert.equal(app.elements.get('completion-title').textContent, '2 cards reviewed');
      assert.equal(app.elements.get('completion-eyebrow').textContent, 'ORAL PRACTICE COMPLETE');
      assert.equal(app.elements.get('completion-stats').hidden, true);
      assert.equal(app.elements.get('completion-mistakes-button').textContent, 'Practice again');
      assert.equal(app.storage.getItem(Lists.WORKSPACE_KEY), before);

      await app.elements.get('completion-mistakes-button').click();
      assert.equal(app.elements.get('practice').hidden, false);
      assert.equal(app.elements.get('oral-reviewed-count').textContent, '0');
      assert.equal(app.storage.getItem(Lists.WORKSPACE_KEY), before);
    }
  }
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
