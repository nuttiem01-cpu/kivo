/* Local list storage and portable CSV helpers. No file-system or network APIs. */
(() => {
  'use strict';

  const WORKSPACE_KEY = 'kivo.workspace.v1';
  const LEGACY_PROGRESS_KEY = 'kivo.progress.v1';
  const LEGACY_MISTAKES_KEY = 'kivo.mistakes.v1';
  const DIRECTIONS = ['key-value', 'value-key', 'mixed'];

  function createId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }

  function safeRead(storage, key, fallback) {
    try {
      const value = storage?.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  }

  function createWorkspace() {
    return { version: 1, activeListId: null, lists: [], progress: {}, mistakes: {}, legacyProgress: {}, activity: { days: {} }, migrationNotice: '' };
  }

  function normalizeActivity(activity) {
    const days = {};
    if (!activity?.days || typeof activity.days !== 'object' || Array.isArray(activity.days)) return { days };
    for (const [date, record] of Object.entries(activity.days)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || localDateKey(new Date(`${date}T12:00:00`)) !== date || !record || typeof record !== 'object') continue;
      const practiceMs = Math.max(0, Math.floor(Number(record.practiceMs) || 0));
      const cardsReviewed = Math.max(0, Math.floor(Number(record.cardsReviewed) || 0));
      const sessionsCompleted = Math.max(0, Math.floor(Number(record.sessionsCompleted) || 0));
      if (practiceMs || cardsReviewed || sessionsCompleted) days[date] = { practiceMs, cardsReviewed, sessionsCompleted };
    }
    return { days };
  }

  function activityDay(workspace, date) {
    workspace.activity ||= { days: {} };
    workspace.activity.days ||= {};
    return workspace.activity.days[date] ||= { practiceMs: 0, cardsReviewed: 0, sessionsCompleted: 0 };
  }

  function recordPracticeTime(workspace, date, milliseconds) {
    const amount = Math.max(0, Math.floor(Number(milliseconds) || 0));
    if (!amount) return;
    activityDay(workspace, date).practiceMs += amount;
  }

  function recordReviewedCard(workspace, date) {
    activityDay(workspace, date).cardsReviewed++;
  }

  function recordCompletedSession(workspace, date) {
    activityDay(workspace, date).sessionsCompleted++;
  }

  function localDateKey(date) {
    const value = date instanceof Date ? date : new Date(date);
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }

  function activitySummary(activity, today = new Date()) {
    const days = normalizeActivity(activity).days;
    const totals = Object.values(days).reduce((sum, day) => ({
      practiceMs: sum.practiceMs + day.practiceMs,
      cardsReviewed: sum.cardsReviewed + day.cardsReviewed,
      sessionsCompleted: sum.sessionsCompleted + day.sessionsCompleted
    }), { practiceMs: 0, cardsReviewed: 0, sessionsCompleted: 0 });
    const anchor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const recentDays = [];
    for (let offset = 6; offset >= 0; offset--) {
      const date = new Date(anchor);
      date.setDate(anchor.getDate() - offset);
      const key = localDateKey(date);
      recentDays.push({
        date: key,
        label: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()],
        practiceMs: days[key]?.practiceMs || 0,
        cardsReviewed: days[key]?.cardsReviewed || 0
      });
    }
    return { ...totals, activeDays: Object.keys(days).length, recentDays };
  }

  function pairSignature(key, value) {
    return JSON.stringify([String(key).normalize('NFC').trim(), String(value).normalize('NFC').trim()]);
  }

  function makeEntry(entry, idFactory = createId) {
    return { id: entry.id || idFactory(), key: String(entry.key ?? ''), value: String(entry.value ?? '') };
  }

  function uniqueName(workspace, name, omitId = null) {
    const base = String(name || 'Untitled list').trim() || 'Untitled list';
    const exists = candidate => workspace.lists.some(list => list.id !== omitId && list.name.toLowerCase() === candidate.toLowerCase());
    if (!exists(base)) return base;
    let suffix = 2;
    while (exists(`${base} (${suffix})`)) suffix++;
    return `${base} (${suffix})`;
  }

  function makeList(name, entries = [], idFactory = createId, options = {}) {
    return {
      id: options.id || idFactory(),
      name: String(name || 'Untitled list').trim() || 'Untitled list',
      keyLabel: String(options.keyLabel || 'Key'),
      valueLabel: String(options.valueLabel || 'Value'),
      entries: entries.map(entry => makeEntry(entry, idFactory))
    };
  }

  function validateEntries(entries) {
    const seen = new Set();
    for (const entry of entries) {
      if (!String(entry.key ?? '').trim() || !String(entry.value ?? '').trim()) {
        return 'Every entry needs both a key and a value.';
      }
      const signature = pairSignature(entry.key, entry.value);
      if (seen.has(signature)) return 'This list contains a duplicate key and value pair.';
      seen.add(signature);
    }
    return '';
  }

  function setListDraft(workspace, listId, draft, idFactory = createId) {
    const list = workspace.lists.find(item => item.id === listId);
    if (!list) throw new Error('The selected list no longer exists.');
    const error = validateEntries(draft.entries);
    if (error) throw new Error(error);
    list.name = uniqueName(workspace, draft.name, listId);
    list.keyLabel = String(draft.keyLabel || 'Key').trim() || 'Key';
    list.valueLabel = String(draft.valueLabel || 'Value').trim() || 'Value';
    list.entries = draft.entries.map(entry => makeEntry(entry, idFactory));
    return list;
  }

  function deleteEntry(list, entryId) {
    const length = list.entries.length;
    list.entries = list.entries.filter(entry => entry.id !== entryId);
    return list.entries.length !== length;
  }

  function addList(workspace, name, entries = [], idFactory = createId, options = {}) {
    const list = makeList(uniqueName(workspace, name), entries, idFactory, options);
    workspace.lists.push(list);
    workspace.activeListId = list.id;
    return list;
  }

  function duplicateList(workspace, listId, idFactory = createId) {
    const source = workspace.lists.find(list => list.id === listId);
    if (!source) return null;
    const copy = makeList(uniqueName(workspace, `${source.name} copy`), source.entries.map(({ key, value }) => ({ key, value })), idFactory, {
      keyLabel: source.keyLabel,
      valueLabel: source.valueLabel
    });
    workspace.lists.push(copy);
    workspace.activeListId = copy.id;
    return copy;
  }

  function deleteList(workspace, listId) {
    const length = workspace.lists.length;
    workspace.lists = workspace.lists.filter(list => list.id !== listId);
    delete workspace.progress[listId];
    delete workspace.mistakes[listId];
    if (workspace.activeListId === listId) workspace.activeListId = workspace.lists[0]?.id || null;
    return workspace.lists.length !== length;
  }

  function deleteLists(workspace, listIds) {
    const ids = new Set(listIds);
    let deleted = 0;
    for (const id of ids) if (deleteList(workspace, id)) deleted++;
    return deleted;
  }

  function parseCSV(text, idFactory = createId) {
    let separator = ',';
    const delimiterCounts = { ',': 0, ';': 0, '\t': 0 };
    let inFirstRow = false, firstRowStarted = false;
    for (let index = 0; index < text.length; index++) {
      const character = text[index];
      if (!firstRowStarted && !/\s/.test(character)) firstRowStarted = true;
      if (character === '"') {
        if (inFirstRow && text[index + 1] === '"') index++;
        else inFirstRow = !inFirstRow;
      } else if (!inFirstRow && (character === '\r' || character === '\n')) {
        if (firstRowStarted) break;
      } else if (!inFirstRow && delimiterCounts[character] !== undefined) delimiterCounts[character]++;
    }
    if (delimiterCounts[';'] > delimiterCounts[','] && delimiterCounts[';'] >= delimiterCounts['\t']) separator = ';';
    else if (delimiterCounts['\t'] > delimiterCounts[','] && delimiterCounts['\t'] > delimiterCounts[';']) separator = '\t';

    const rows = [];
    let row = [], field = '', quoted = false;
    for (let index = 0; index < text.length; index++) {
      const character = text[index];
      if (quoted) {
        if (character === '"' && text[index + 1] === '"') { field += '"'; index++; }
        else if (character === '"') quoted = false;
        else field += character;
      } else if (character === '"') {
        if (field.length) throw new Error('Unexpected quote in an unquoted field.');
        quoted = true;
      } else if (character === separator) {
        row.push(field); field = '';
      } else if (character === '\n' || character === '\r') {
        if (character === '\r' && text[index + 1] === '\n') index++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += character;
    }
    if (quoted) throw new Error('A quoted field was not closed.');
    if (field.length || row.length) { row.push(field); rows.push(row); }
    while (rows.length && rows[0].every(value => !value.trim())) rows.shift();
    if (!rows.length) throw new Error('The CSV is empty.');

    const originalHeaders = rows.shift().map(value => value.replace(/^\uFEFF/, '').trim());
    const normalizeHeader = value => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    const headers = originalHeaders.map(normalizeHeader);
    const keyHeaders = new Set(['key', 'term', 'terme', 'word', 'mot', 'fr', 'francais', 'frans', 'french', 'anglais', 'english', 'en', 'concept', 'question', 'prompt', 'source', 'capital', 'city', 'name', 'label', 'expression']);
    const valueHeaders = new Set(['value', 'answer', 'response', 'translation', 'translated', 'traduction', 'reponse', 'definition', 'meaning', 'description', 'nl', 'nederlands', 'neerlandais', 'dutch', 'country', 'target']);
    const matchesHeader = (header, aliases) => header.split(' ').some(part => aliases.has(part));
    let keyIndex = headers.findIndex(header => matchesHeader(header, keyHeaders));
    let valueIndex = headers.findIndex(header => matchesHeader(header, valueHeaders));
    if ((keyIndex < 0 || valueIndex < 0 || keyIndex === valueIndex) && originalHeaders.length === 2 && originalHeaders.every(Boolean)) {
      keyIndex = 0;
      valueIndex = 1;
    }
    if (keyIndex < 0 || valueIndex < 0 || keyIndex === valueIndex) throw new Error('The first row must include recognizable column headers, such as “key,value”, “French,Dutch” or “term,definition”.');

    const entries = [], seen = new Set();
    let duplicateCount = 0;
    for (const values of rows) {
      if (values.every(value => !value.trim())) continue;
      if (keyIndex >= values.length || valueIndex >= values.length) throw new Error('A row is missing a key or value.');
      const key = values[keyIndex], value = values[valueIndex];
      if (!key.trim() || !value.trim()) throw new Error('Every non-empty row must have both a key and a value.');
      const signature = pairSignature(key, value);
      if (seen.has(signature)) { duplicateCount++; continue; }
      seen.add(signature);
      entries.push({ id: idFactory(), key, value });
    }
    return {
      entries,
      duplicateCount,
      keyLabel: originalHeaders[keyIndex] || 'Key',
      valueLabel: originalHeaders[valueIndex] || 'Value'
    };
  }

  function encodeCSV(entries) {
    const cell = value => `"${String(value).replace(/"/g, '""')}"`;
    return `key,value\r\n${entries.map(entry => `${cell(entry.key)},${cell(entry.value)}`).join('\r\n')}`;
  }

  function hash(text) {
    let first = 0xdeadbeef ^ text.length, second = 0x41c6ce57 ^ text.length;
    for (let index = 0; index < text.length; index++) {
      const code = text.charCodeAt(index);
      first = Math.imul(first ^ code, 2654435761);
      second = Math.imul(second ^ code, 1597334677);
    }
    first = Math.imul(first ^ (first >>> 16), 2246822507) ^ Math.imul(second ^ (second >>> 13), 3266489909);
    second = Math.imul(second ^ (second >>> 16), 2246822507) ^ Math.imul(first ^ (first >>> 13), 3266489909);
    return (second >>> 0).toString(16).padStart(8, '0') + (first >>> 0).toString(16).padStart(8, '0');
  }

  function legacyFingerprint(entries, direction) {
    return hash(JSON.stringify([entries.map(({ key, value }) => ({ key, value })), direction]));
  }

  function migrateProgressForList(workspace, list) {
    let migrated = 0;
    for (const direction of DIRECTIONS) {
      if (workspace.progress[list.id]?.[direction]) continue;
      const old = workspace.legacyProgress?.[legacyFingerprint(list.entries, direction)];
      if (!old || !Array.isArray(old.remaining)) continue;
      const remaining = old.remaining.filter(index => Number.isInteger(index) && list.entries[index]).map(index => list.entries[index].id);
      workspace.progress[list.id] ||= {};
      workspace.progress[list.id][direction] = { remaining };
      migrated++;
    }
    return migrated;
  }

  function loadWorkspace(storage, idFactory = createId) {
    const stored = safeRead(storage, WORKSPACE_KEY, null);
    const hasWorkspace = stored?.version === 1 && Array.isArray(stored.lists);
    const workspace = hasWorkspace ? {
      ...createWorkspace(), ...stored,
      lists: stored.lists.map(list => makeList(list.name, list.entries || [], idFactory, list)),
      progress: stored.progress && typeof stored.progress === 'object' ? stored.progress : {},
      mistakes: stored.mistakes && typeof stored.mistakes === 'object' ? stored.mistakes : {},
      activity: normalizeActivity(stored.activity),
      legacyProgress: stored.legacyProgress && typeof stored.legacyProgress === 'object' ? stored.legacyProgress : {}
    } : createWorkspace();

    const oldProgress = safeRead(storage, LEGACY_PROGRESS_KEY, {});
    if (oldProgress && typeof oldProgress === 'object' && !Array.isArray(oldProgress)) {
      workspace.legacyProgress = { ...oldProgress, ...workspace.legacyProgress };
      if (Object.keys(oldProgress).length && !workspace.migrationNotice) {
        workspace.migrationNotice = 'Your earlier progress is preserved. Re-import the same CSV to restore its saved queue; the old format did not store list entries.';
      }
    }

    if (!hasWorkspace) {
      const oldMistakes = safeRead(storage, LEGACY_MISTAKES_KEY, []);
      if (Array.isArray(oldMistakes)) {
        const recovered = [], seen = new Set();
        for (const pair of oldMistakes) {
          if (!pair || !String(pair.key || '').trim() || !String(pair.value || '').trim()) continue;
          const signature = pairSignature(pair.key, pair.value);
          if (seen.has(signature)) continue;
          seen.add(signature); recovered.push({ key: String(pair.key), value: String(pair.value) });
        }
        if (recovered.length) {
          const list = addList(workspace, 'Recovered mistakes', recovered, idFactory);
          workspace.mistakes[list.id] = list.entries.map(entry => ({ ...entry }));
          const mistakeNotice = 'Your earlier mistake collection is available as the “Recovered mistakes” list. Previous storage keys were kept.';
          workspace.migrationNotice = workspace.migrationNotice ? `${workspace.migrationNotice} ${mistakeNotice}` : mistakeNotice;
        }
      }
    }
    workspace.lists = workspace.lists.map(list => ({
      ...list,
      keyLabel: list.keyLabel || 'Key',
      valueLabel: list.valueLabel || 'Value',
      entries: list.entries.map(entry => makeEntry(entry, idFactory))
    }));
    if (!workspace.lists.some(list => list.id === workspace.activeListId)) workspace.activeListId = workspace.lists[0]?.id || null;
    return workspace;
  }

  function saveWorkspace(storage, workspace) {
    try {
      storage?.setItem(WORKSPACE_KEY, JSON.stringify(workspace));
      return Boolean(storage);
    } catch {
      return false;
    }
  }

  function addMistake(workspace, listId, entry, idFactory = createId) {
    const items = workspace.mistakes[listId] ||= [];
    if (items.some(item => pairSignature(item.key, item.value) === pairSignature(entry.key, entry.value))) return false;
    items.push(makeEntry(entry, idFactory));
    return true;
  }

  function removeMistake(workspace, listId, entry) {
    const items = workspace.mistakes[listId] || [];
    workspace.mistakes[listId] = items.filter(item => pairSignature(item.key, item.value) !== pairSignature(entry.key, entry.value));
  }

  function saveProgress(workspace, listId, direction, queue) {
    workspace.progress[listId] ||= {};
    workspace.progress[listId][direction] = { remaining: queue.map(item => item.id) };
  }

  function progressQueue(workspace, list, direction) {
    const saved = workspace.progress[list.id]?.[direction];
    if (!saved || !Array.isArray(saved.remaining)) return null;
    const byId = new Map(list.entries.map(entry => [entry.id, entry]));
    return saved.remaining.map(id => byId.get(id)).filter(Boolean);
  }

  function restoreBackup(data, idFactory = createId) {
    if (data?.format !== 'kivo-workspace-v1' || data.workspace?.version !== 1 || !Array.isArray(data.workspace.lists)) {
      throw new Error('This is not a supported Kivo workspace backup.');
    }
    const source = data.workspace;
    const restored = createWorkspace();
    const listIds = new Set();
    for (const sourceList of source.lists) {
      if (!sourceList || typeof sourceList.id !== 'string' || !sourceList.id || listIds.has(sourceList.id)) {
        throw new Error('The backup contains a missing or duplicate list ID.');
      }
      if (!Array.isArray(sourceList.entries)) throw new Error(`The list “${sourceList.name || 'Untitled list'}” has invalid entries.`);
      if (sourceList.entries.some(entry => !entry || typeof entry.id !== 'string' || !entry.id)) {
        throw new Error(`The list “${sourceList.name || 'Untitled list'}” contains an entry without an ID.`);
      }
      const list = makeList(sourceList.name, sourceList.entries, idFactory, {
        id: sourceList.id,
        keyLabel: sourceList.keyLabel,
        valueLabel: sourceList.valueLabel
      });
      const entryIds = new Set();
      for (const entry of list.entries) {
        if (!entry.id || entryIds.has(entry.id)) throw new Error(`The list “${list.name}” contains a missing or duplicate entry ID.`);
        entryIds.add(entry.id);
      }
      const entriesError = validateEntries(list.entries);
      if (entriesError) throw new Error(`The list “${list.name}” is invalid: ${entriesError}`);
      listIds.add(list.id);
      restored.lists.push(list);
    }

    restored.activeListId = listIds.has(source.activeListId) ? source.activeListId : restored.lists[0]?.id || null;
    restored.legacyProgress = source.legacyProgress && typeof source.legacyProgress === 'object' && !Array.isArray(source.legacyProgress)
      ? { ...source.legacyProgress } : {};
    restored.migrationNotice = typeof source.migrationNotice === 'string' ? source.migrationNotice : '';
    restored.activity = normalizeActivity(source.activity);

    for (const list of restored.lists) {
      const entryIds = new Set(list.entries.map(entry => entry.id));
      const savedDirections = source.progress?.[list.id];
      if (savedDirections && typeof savedDirections === 'object' && !Array.isArray(savedDirections)) {
        for (const [direction, saved] of Object.entries(savedDirections)) {
          if (!DIRECTIONS.includes(direction) || !Array.isArray(saved?.remaining)) continue;
          const remaining = [...new Set(saved.remaining.filter(id => entryIds.has(id)))];
          saveProgress(restored, list.id, direction, remaining.map(id => ({ id })));
        }
      }
      const mistakes = source.mistakes?.[list.id];
      if (Array.isArray(mistakes)) {
        restored.mistakes[list.id] = [];
        for (const mistake of mistakes) {
          if (!mistake || !String(mistake.key ?? '').trim() || !String(mistake.value ?? '').trim()) continue;
          if (!restored.mistakes[list.id].some(item => pairSignature(item.key, item.value) === pairSignature(mistake.key, mistake.value))) {
            restored.mistakes[list.id].push(makeEntry(mistake, idFactory));
          }
        }
      }
    }
    return restored;
  }

  function mergeLegacyProgress(workspace, progress) {
    if (!progress || typeof progress !== 'object' || Array.isArray(progress)) throw new Error('This progress file is invalid.');
    workspace.legacyProgress = { ...workspace.legacyProgress, ...progress };
  }

  const api = {
    WORKSPACE_KEY, LEGACY_PROGRESS_KEY, LEGACY_MISTAKES_KEY,
    createId, createWorkspace, makeList, makeEntry, uniqueName, validateEntries, setListDraft,
    addList, duplicateList, deleteList, deleteLists, deleteEntry, pairSignature, parseCSV, encodeCSV, hash, legacyFingerprint,
    migrateProgressForList, loadWorkspace, saveWorkspace, addMistake, removeMistake,
    saveProgress, progressQueue, normalizeActivity, recordPracticeTime, recordReviewedCard,
    recordCompletedSession, localDateKey, activitySummary, restoreBackup, mergeLegacyProgress
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.KivoLists = api;
})();
