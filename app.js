/* Kivo: standalone local vocabulary practice. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const Lists = window.KivoLists;
  const Practice = window.KivoPractice;
  const ids = [
    'setup','editor','practice','completion','migration-note','storage-note','home-tabs','tab-practice','tab-manage','tab-review','tab-about','home-view-practice','home-view-manage','home-view-review','home-view-about','list-select','manage-list-select','list-status','new-list-button','import-list-button','csv-file',
    'selected-list','selected-name','entry-count','edit-list-button','duplicate-list-button','export-list-button','delete-list-button',
    'mistakes-review','mistake-total','mistake-empty','mistake-key-heading','mistake-value-heading','mistake-rows','practice-mistakes-button','export-mistakes','clear-mistakes',
    'practice-options','direction','mode','collect-mistakes','start-button','progress-hint','export-progress','progress-file','reset-progress',
    'editor-back-button','editor-name','editor-key-label','editor-value-label','entry-search','add-entry-button','editor-count','editor-status',
    'editor-key-heading','editor-value-heading','editor-rows','save-list-button','discard-list-button','editor-export-button',
    'leave-button','list-label','remaining-count','correct-count','mistake-count','session-total','progress-track','progress-fill','progress-percentage','prompt','answer-form','answer','check-button','hint-display','hint-text','hint-rating',
    'feedback','feedback-title','feedback-mark','feedback-answer','feedback-detail','lookup-answer','final-correct','final-mistakes','completion-mistakes-button','completion-back-button'
  ];
  const els = Object.fromEntries(ids.map(id => [id.replace(/-([a-z])/g, (_, character) => character.toUpperCase()), $(id)]));

  let storage = null;
  try { storage = window.localStorage; storage.getItem(Lists.WORKSPACE_KEY); } catch { storage = null; }
  let workspace = Lists.loadWorkspace(storage);
  let manageListId = workspace.activeListId || workspace.lists[0]?.id || null;
  let storageWorks = Boolean(storage);
  let queue = [], current = null, hintState = null, evaluated = false, correct = 0, sessionMistakes = 0, sessionTotal = 0;
  let currentListId = null, practiceDirection = 'key-value', mistakePractice = false;
  let draft = null, editorDirty = false;
  let homeView = 'practice';

  function shuffled(items) {
    const result = items.slice();
    for (let index = result.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [result[index], result[other]] = [result[other], result[index]];
    }
    return result;
  }
  function selectedList() { return workspace.lists.find(list => list.id === workspace.activeListId) || null; }
  function managedList() { return workspace.lists.find(list => list.id === manageListId) || null; }
  function show(section) {
    els.setup.hidden = section !== 'setup';
    els.editor.hidden = section !== 'editor';
    els.practice.hidden = section !== 'practice';
    els.completion.hidden = section !== 'completion';
  }
  function setHomeView(view) {
    const views = {
      practice: [els.homeViewPractice, els.tabPractice],
      manage: [els.homeViewManage, els.tabManage],
      review: [els.homeViewReview, els.tabReview],
      about: [els.homeViewAbout, els.tabAbout]
    };
    if (!views[view]) return;
    homeView = view;
    for (const [name, [panel, tab]] of Object.entries(views)) {
      panel.hidden = name !== view;
      tab.setAttribute('aria-selected', String(name === view));
      tab.tabIndex = name === view ? 0 : -1;
      tab.classList.toggle('active', name === view);
    }
  }
  function setListStatus(message, error = false) {
    els.listStatus.textContent = message;
    els.listStatus.hidden = false;
    els.listStatus.classList.toggle('error', error);
  }
  function persist() {
    storageWorks = Lists.saveWorkspace(storage, workspace);
    els.storageNote.hidden = storageWorks;
    return storageWorks;
  }
  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function fileBaseName(name) { return name.replace(/\.[^.]+$/, '').trim() || 'vocabulary'; }
  function safeFilename(name) { return (name || 'vocabulary').replace(/[\\/:*?"<>|]/g, '-').trim() || 'vocabulary'; }
  function exportList(list, entries = list.entries) {
    download(`${safeFilename(list.name)}.csv`, Lists.encodeCSV(entries), 'text/csv;charset=utf-8');
  }
  function directionFor() {
    return els.direction.value === 'mixed' ? (Math.random() < 0.5 ? 'key-value' : 'value-key') : els.direction.value;
  }
  function renderProgressHint() {
    const list = selectedList();
    if (!list) { els.progressHint.textContent = ''; els.resetProgress.disabled = true; return; }
    const saved = workspace.progress[list.id]?.[els.direction.value];
    els.progressHint.textContent = saved ? `${saved.remaining.length} item${saved.remaining.length === 1 ? '' : 's'} saved for this list and direction.` : 'Progressive mode will start with every entry.';
    els.resetProgress.disabled = !saved;
  }
  function renderMistakes(list) {
    const mistakes = list ? workspace.mistakes[list.id] || [] : [];
    els.mistakeTotal.textContent = String(mistakes.length);
    els.mistakeEmpty.hidden = mistakes.length > 0;
    els.mistakeEmpty.textContent = list ? 'No collected mistakes for this list.' : 'Choose a list to review its mistakes.';
    els.practiceMistakesButton.disabled = mistakes.length === 0;
    els.exportMistakes.disabled = mistakes.length === 0;
    els.clearMistakes.disabled = mistakes.length === 0;
    els.mistakeKeyHeading.textContent = list?.keyLabel || 'Key';
    els.mistakeValueHeading.textContent = list?.valueLabel || 'Value';
    els.mistakeRows.replaceChildren();
    for (const entry of mistakes) {
      const row = document.createElement('tr');
      const key = document.createElement('td'), value = document.createElement('td');
      key.textContent = entry.key; value.textContent = entry.value;
      row.append(key, value); els.mistakeRows.append(row);
    }
  }
  function renderSetup() {
    if (!workspace.lists.some(list => list.id === manageListId)) manageListId = workspace.lists[0]?.id || null;
    for (const select of [els.listSelect, els.manageListSelect]) {
      select.replaceChildren();
      const placeholder = document.createElement('option');
      placeholder.value = ''; placeholder.textContent = workspace.lists.length ? 'Choose a list' : 'No lists yet';
      select.append(placeholder);
      for (const list of workspace.lists) {
        const option = document.createElement('option');
        option.value = list.id; option.textContent = `${list.name} · ${list.entries.length}`; select.append(option);
      }
    }
    els.listSelect.value = workspace.activeListId || '';
    els.manageListSelect.value = manageListId || '';
    const list = managedList();
    els.selectedList.hidden = !list;
    els.practiceOptions.hidden = !list;
    els.startButton.disabled = !list || !list.entries.length;
    if (list) {
      els.selectedName.textContent = list.name;
      els.entryCount.textContent = `${list.entries.length} entr${list.entries.length === 1 ? 'y' : 'ies'}`;
      els.direction.options[0].textContent = `${list.keyLabel} → ${list.valueLabel}`;
      els.direction.options[1].textContent = `${list.valueLabel} → ${list.keyLabel}`;
      els.direction.options[2].textContent = 'Mixed';
      els.editorKeyHeading.textContent = list.keyLabel;
      els.editorValueHeading.textContent = list.valueLabel;
    }
    renderMistakes(list);
    els.migrationNote.textContent = workspace.migrationNotice;
    els.migrationNote.hidden = !workspace.migrationNotice;
    setHomeView(homeView);
    renderProgressHint();
  }
  function newList() {
    const practiceListId = workspace.activeListId;
    const list = Lists.addList(workspace, 'Untitled list');
    workspace.activeListId = practiceListId;
    manageListId = list.id;
    persist(); renderSetup(); openEditor(list.id);
  }
  async function importCSV(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const parsed = Lists.parseCSV(await file.text());
      if (!parsed.entries.length) throw new Error('This CSV has no entries.');
      const practiceListId = workspace.activeListId;
      const list = Lists.addList(workspace, fileBaseName(file.name), parsed.entries);
      workspace.activeListId = practiceListId;
      manageListId = list.id;
      const migrated = Lists.migrateProgressForList(workspace, list);
      persist(); renderSetup();
      const duplicateNote = parsed.duplicateCount ? ` Skipped ${parsed.duplicateCount} duplicate pair${parsed.duplicateCount === 1 ? '' : 's'}.` : '';
      const progressNote = migrated ? ` Restored saved progress for ${migrated} direction${migrated === 1 ? '' : 's'}.` : '';
      setListStatus(`Imported as a separate list. Existing lists were kept.${duplicateNote}${progressNote}`);
    } catch (error) {
      setListStatus(`Could not import CSV: ${error.message}`, true);
    }
    event.target.value = '';
  }
  function editorSnapshot(list) {
    return { id: list.id, name: list.name, keyLabel: list.keyLabel, valueLabel: list.valueLabel, entries: list.entries.map(entry => ({ ...entry })) };
  }
  function openEditor(listId) {
    const list = workspace.lists.find(item => item.id === listId);
    if (!list) return;
    manageListId = list.id;
    draft = editorSnapshot(list); editorDirty = false;
    els.editorName.value = draft.name;
    els.editorKeyLabel.value = draft.keyLabel;
    els.editorValueLabel.value = draft.valueLabel;
    els.entrySearch.value = '';
    els.editorStatus.textContent = '';
    els.saveListButton.disabled = true;
    renderEditorRows(); show('editor');
    els.editorName.focus();
  }
  function markEditorDirty() {
    editorDirty = true;
    els.saveListButton.disabled = false;
    els.editorStatus.textContent = 'Unsaved changes';
    els.editorStatus.classList.remove('error');
  }
  function renderEditorRows(focusEntryId = null) {
    const filter = els.entrySearch.value.trim().toLowerCase();
    const entries = draft.entries.filter(entry => !filter || `${entry.key}\n${entry.value}`.toLowerCase().includes(filter));
    els.editorCount.textContent = `${entries.length} of ${draft.entries.length} entr${draft.entries.length === 1 ? 'y' : 'ies'}`;
    els.editorRows.replaceChildren();
    if (!entries.length) {
      const row = document.createElement('tr'), cell = document.createElement('td');
      cell.colSpan = 3; cell.className = 'empty-cell'; cell.textContent = filter ? 'No matching entries.' : 'No entries yet. Add one to begin.';
      row.append(cell); els.editorRows.append(row); return;
    }
    for (const entry of entries) {
      const row = document.createElement('tr');
      for (const field of ['key', 'value']) {
        const cell = document.createElement('td'), input = document.createElement('input');
        input.type = 'text'; input.value = entry[field]; input.dataset.entryId = entry.id; input.dataset.field = field;
        input.setAttribute('aria-label', `${field === 'key' ? draft.keyLabel : draft.valueLabel} for entry`);
        input.addEventListener('input', () => {
          const target = draft.entries.find(item => item.id === input.dataset.entryId);
          if (target) target[input.dataset.field] = input.value;
          markEditorDirty();
        });
        if (field === 'value') input.addEventListener('keydown', event => {
          const isNextEntryKey = event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey);
          if (!isNextEntryKey) return;
          const target = draft.entries.find(item => item.id === input.dataset.entryId);
          if (!target) return;
          if (!String(target.key).trim() || !String(target.value).trim()) {
            if (event.key === 'Enter') {
              event.preventDefault();
              els.editorStatus.textContent = 'Fill in both fields before starting the next entry.';
            }
            return;
          }
          event.preventDefault();
          addEditorEntry();
        });
        cell.append(input); row.append(cell);
      }
      const actions = document.createElement('td'), remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'text-button danger-text row-delete'; remove.textContent = 'Delete';
      remove.setAttribute('aria-label', `Delete entry ${entry.key}`);
      remove.addEventListener('click', () => {
        Lists.deleteEntry(draft, entry.id);
        markEditorDirty(); renderEditorRows();
      });
      actions.append(remove); row.append(actions); els.editorRows.append(row);
    }
    if (focusEntryId) els.editorRows.querySelector(`[data-entry-id="${CSS.escape(focusEntryId)}"][data-field="key"]`)?.focus();
  }
  function saveEditor() {
    if (!draft) return false;
    draft.name = els.editorName.value;
    draft.keyLabel = els.editorKeyLabel.value;
    draft.valueLabel = els.editorValueLabel.value;
    if (!draft.name.trim()) { els.editorStatus.textContent = 'Enter a name for this list.'; els.editorStatus.classList.add('error'); return false; }
    const originalName = draft.name.trim();
    try {
      const list = Lists.setListDraft(workspace, draft.id, draft);
      persist(); draft = editorSnapshot(list); editorDirty = false;
      els.editorName.value = list.name; els.editorKeyLabel.value = list.keyLabel; els.editorValueLabel.value = list.valueLabel;
      els.saveListButton.disabled = true;
      els.editorStatus.textContent = originalName !== list.name ? `Saved as “${list.name}” because that name was already in use.` : storageWorks ? 'Saved.' : 'Saved for this session; browser storage is unavailable.';
      els.editorStatus.classList.toggle('error', !storageWorks);
      renderEditorRows(); renderSetup();
      return true;
    } catch (error) {
      els.editorStatus.textContent = error.message; els.editorStatus.classList.add('error');
      return false;
    }
  }
  function leaveEditor() {
    if (editorDirty) {
      if (!window.confirm('You have unsaved changes. Press OK to save them, or Cancel to stay in the editor.')) return;
      if (!saveEditor()) return;
    }
    draft = null; show('setup'); renderSetup();
  }
  function discardEditor() {
    if (editorDirty && !window.confirm('Discard all unsaved changes to this list?')) return;
    draft = null; editorDirty = false; show('setup'); renderSetup();
  }
  function addEditorEntry() {
    const entry = Lists.makeEntry({ key: '', value: '' });
    draft.entries.push(entry); els.entrySearch.value = ''; markEditorDirty(); renderEditorRows(entry.id);
  }
  function start(full = true, mistakesOnly = false) {
    const list = selectedList();
    if (!list) return;
    currentListId = list.id; practiceDirection = els.direction.value; mistakePractice = mistakesOnly;
    let entries;
    if (mistakesOnly) entries = (workspace.mistakes[list.id] || []).map(entry => ({ ...entry }));
    else {
      const saved = !full ? Lists.progressQueue(workspace, list, practiceDirection) : null;
      entries = saved === null ? list.entries : saved;
    }
    queue = shuffled(entries.map(entry => ({ id: entry.id, pair: { key: entry.key, value: entry.value } })));
    sessionTotal = queue.length;
    correct = 0; sessionMistakes = 0;
    if (!queue.length) {
      if (mistakesOnly) setListStatus('There are no collected mistakes for this list yet.');
      else finish();
      return;
    }
    els.listLabel.textContent = `${list.name} · ${queue.length} ${mistakesOnly ? 'mistake' : 'entry'}${queue.length === 1 ? '' : 's'}`;
    show('practice'); renderQuestion();
  }
  function savePracticeProgress() {
    if (mistakePractice || !currentListId) return;
    Lists.saveProgress(workspace, currentListId, practiceDirection, queue);
    persist();
  }
  function renderSessionProgress() {
    const progress = Practice.progressSummary(sessionTotal, queue);
    els.correctCount.textContent = String(progress.mastered);
    els.sessionTotal.textContent = String(progress.total);
    els.remainingCount.textContent = String(progress.remaining);
    els.mistakeCount.textContent = String(sessionMistakes);
    els.progressTrack.setAttribute('aria-valuemax', String(progress.total));
    els.progressTrack.setAttribute('aria-valuenow', String(progress.mastered));
    els.progressTrack.setAttribute('aria-valuetext', `${progress.mastered} of ${progress.total} mastered`);
    els.progressFill.style.width = `${progress.percentage}%`;
    els.progressPercentage.textContent = `${progress.percentage}%`;
  }
  function renderQuestion() {
    if (!queue.length) { finish(); return; }
    current = queue[0]; current.direction = directionFor(); evaluated = false;
    els.feedback.hidden = true; els.lookupAnswer.hidden = true; els.hintDisplay.hidden = true;
    els.hintDisplay.className = 'hint-display'; els.hintText.textContent = ''; els.hintRating.textContent = '';
    els.answer.value = ''; els.answer.disabled = false; els.checkButton.textContent = 'Check ↵';
    const list = workspace.lists.find(item => item.id === currentListId);
    const source = current.direction === 'key-value' ? current.pair.key : current.pair.value;
    const expected = current.direction === 'key-value' ? current.pair.value : current.pair.key;
    els.answer.placeholder = `Type ${current.direction === 'key-value' ? list.valueLabel : list.keyLabel}…`;
    hintState = Practice.createHintState(expected);
    els.prompt.textContent = source;
    renderSessionProgress();
    requestAnimationFrame(() => els.answer.focus());
  }
  function recordMistake(entry) {
    if (!els.collectMistakes.checked) return;
    Lists.addMistake(workspace, currentListId, entry);
    persist();
  }
  function checkAnswer() {
    if (evaluated) return;
    const expected = current.direction === 'key-value' ? current.pair.value : current.pair.key;
    const comparison = Practice.compareAnswers(els.answer.value, expected);
    const result = Practice.applyHintCap(comparison, hintState.level);
    const label = Practice.feedbackLabel(comparison, hintState.level);
    const detail = Practice.feedbackDetail(comparison, hintState.level);
    evaluated = true;
    els.feedback.className = `feedback ${result}`;
    if (result === 'correct' && hintState.level === 0) els.feedback.classList.add('is-reward');
    else if (result === 'wrong') els.feedback.classList.add('is-incorrect');
    els.feedback.hidden = false;
    els.feedbackTitle.textContent = `${label} ↵`; els.feedbackAnswer.textContent = expected;
    els.feedbackDetail.textContent = detail;
    els.feedbackMark.hidden = result !== 'correct' || hintState.level > 0;
    els.lookupAnswer.href = `https://translate.google.com/?sl=auto&tl=en&text=${encodeURIComponent(expected)}&op=translate`;
    els.lookupAnswer.hidden = false;
    if (hintState.level > 0) {
      els.hintDisplay.className = `hint-display ${result}`; els.hintRating.textContent = label;
    } else els.hintDisplay.hidden = true;

    if (result === 'correct') {
      correct++;
      if (mistakePractice) Lists.removeMistake(workspace, currentListId, current.pair);
    } else {
      sessionMistakes++;
      recordMistake(current.pair);
    }
    Practice.retainForRetry(queue, result);
    if (mistakePractice) persist(); else savePracticeProgress();
    renderSessionProgress();
    els.answer.disabled = true;
    els.checkButton.textContent = queue.length === 0 && result === 'correct' ? 'Finish ↵' : 'Continue ↵';
    els.checkButton.focus();
  }
  function advance() {
    if (!queue.length) { finish(); return; }
    renderQuestion();
  }
  function finish() {
    if (!mistakePractice) savePracticeProgress(); else persist();
    els.finalCorrect.textContent = correct; els.finalMistakes.textContent = sessionMistakes;
    show('completion');
  }

  els.homeTabs.addEventListener('click', event => {
    const tab = event.target.closest('[data-home-tab]');
    if (tab) setHomeView(tab.dataset.homeTab);
  });
  els.homeTabs.addEventListener('keydown', event => {
    const tabs = [...els.homeTabs.querySelectorAll('[role="tab"]')];
    const selected = tabs.indexOf(document.activeElement);
    if (selected < 0) return;
    let next = selected;
    if (event.key === 'ArrowRight') next = (selected + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (selected - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    tabs[next].focus();
    setHomeView(tabs[next].dataset.homeTab);
  });
  els.listSelect.addEventListener('change', () => {
    workspace.activeListId = els.listSelect.value || null; persist(); renderSetup();
  });
  els.manageListSelect.addEventListener('change', () => {
    manageListId = els.manageListSelect.value || null; renderSetup();
  });
  els.newListButton.addEventListener('click', newList);
  els.importListButton.addEventListener('click', () => els.csvFile.click());
  els.csvFile.addEventListener('change', importCSV);
  els.editListButton.addEventListener('click', () => { const list = managedList(); if (list) openEditor(list.id); });
  els.duplicateListButton.addEventListener('click', () => {
    const practiceListId = workspace.activeListId;
    const copy = Lists.duplicateList(workspace, manageListId);
    if (copy) { workspace.activeListId = practiceListId; manageListId = copy.id; persist(); renderSetup(); setListStatus(`Created “${copy.name}” as a separate list.`); }
  });
  els.deleteListButton.addEventListener('click', () => {
    const list = managedList();
    if (!list || !window.confirm(`Delete “${list.name}”, its progress and its collected mistakes from this browser?`)) return;
    Lists.deleteList(workspace, list.id); manageListId = workspace.activeListId || workspace.lists[0]?.id || null; persist(); renderSetup(); setListStatus(`Deleted “${list.name}”.`);
  });
  els.exportListButton.addEventListener('click', () => { const list = managedList(); if (list) exportList(list); });
  els.practiceMistakesButton.addEventListener('click', () => start(true, true));
  els.exportMistakes.addEventListener('click', () => {
    const list = selectedList(); if (list) download(`${safeFilename(list.name)}-mistakes.csv`, Lists.encodeCSV(workspace.mistakes[list.id] || []), 'text/csv;charset=utf-8');
  });
  els.clearMistakes.addEventListener('click', () => {
    const list = selectedList(); if (!list || !window.confirm(`Clear collected mistakes for “${list.name}”?`)) return;
    workspace.mistakes[list.id] = []; persist(); renderSetup();
  });
  els.direction.addEventListener('change', renderProgressHint);
  els.mode.addEventListener('change', renderProgressHint);
  els.startButton.addEventListener('click', () => start(els.mode.value === 'full'));
  els.editorBackButton.addEventListener('click', leaveEditor);
  els.discardListButton.addEventListener('click', discardEditor);
  els.saveListButton.addEventListener('click', saveEditor);
  els.addEntryButton.addEventListener('click', addEditorEntry);
  els.entrySearch.addEventListener('input', () => renderEditorRows());
  for (const input of [els.editorName, els.editorKeyLabel, els.editorValueLabel]) input.addEventListener('input', markEditorDirty);
  els.editorExportButton.addEventListener('click', () => {
    if (!draft) return;
    const name = els.editorName.value || draft.name;
    download(`${safeFilename(name)}.csv`, Lists.encodeCSV(draft.entries), 'text/csv;charset=utf-8');
  });
  els.leaveButton.addEventListener('click', () => { savePracticeProgress(); renderSetup(); show('setup'); });
  els.answer.addEventListener('keydown', event => {
    if (!Practice.shouldRequestHint(event.key, els.answer.value, evaluated)) return;
    event.preventDefault(); Practice.nextHint(hintState);
    els.hintDisplay.hidden = false; els.hintDisplay.className = `hint-display ${hintState.rating}`;
    els.hintText.textContent = hintState.display;
    els.hintRating.textContent = hintState.level < 3 ? `Almost · hint ${hintState.level}/3` : 'Not quite · answer revealed';
  });
  els.answerForm.addEventListener('submit', event => {
    event.preventDefault();
    if (Practice.enterAction(evaluated) === 'check') checkAnswer(); else advance();
  });
  els.completionBackButton.addEventListener('click', () => { renderSetup(); show('setup'); });
  els.completionMistakesButton.addEventListener('click', () => {
    renderSetup(); setHomeView('review'); show('setup'); els.mistakesReview.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  els.exportProgress.addEventListener('click', () => download('kivo-workspace-backup.json', JSON.stringify({ format: 'kivo-workspace-v1', workspace }, null, 2), 'application/json'));
  els.progressFile.addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.format === 'kivo-workspace-v1') {
        const result = Lists.mergeBackup(workspace, data);
        persist(); renderSetup(); setListStatus(`Imported ${result.listsAdded} separate list${result.listsAdded === 1 ? '' : 's'}. Existing lists were kept.`);
      } else if (data.format === 'kivo-progress-v1') {
        Lists.mergeLegacyProgress(workspace, data.progress);
        workspace.migrationNotice = 'Imported earlier progress is preserved. Re-import a matching CSV to restore its saved queue.';
        persist(); renderSetup(); setListStatus('Earlier progress saved. Import its matching CSV to restore a list queue.');
      } else throw new Error('This is not a Kivo workspace or progress backup.');
    } catch (error) { setListStatus(`Could not import backup: ${error.message}`, true); }
    event.target.value = '';
  });
  els.resetProgress.addEventListener('click', () => {
    const list = selectedList(); if (!list) return;
    if (workspace.progress[list.id]) delete workspace.progress[list.id][els.direction.value];
    persist(); renderSetup();
  });

  persist();
  renderSetup();
  window.Kivo = { ...Practice, ...Lists };
})();
