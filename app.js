/* Kivo: standalone local vocabulary practice. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const Lists = window.KivoLists;
  const Practice = window.KivoPractice;
  const Themes = window.KivoThemes;
  const ids = [
    'setup','editor','practice','completion','completion-eyebrow','completion-title','completion-intro','celebration','theme-picker','storage-note','home-tabs','tab-practice','tab-manage','tab-review','tab-about','home-view-practice','home-view-manage','home-view-review','home-view-about','list-select','list-status','new-list-button','import-list-button','csv-file','list-count','list-overview','delete-selected-lists','delete-all-lists',
    'mistakes-review','mistake-total','mistake-empty','mistake-key-heading','mistake-value-heading','mistake-rows','practice-mistakes-button','export-mistakes','clear-mistakes',
    'practice-options','direction','mode','written-options','collect-mistakes','hint-counts-as-mastered','start-button','progress-hint','export-progress','progress-file','reset-progress',
    'editor-back-button','editor-name','editor-key-label','editor-value-label','entry-search','add-entry-button','editor-count','editor-status',
    'editor-key-heading','editor-value-heading','editor-rows','save-list-button','discard-list-button','editor-export-button',
    'leave-button','list-label','quest-world','quest-score','quest-hero','quest-progress-label','oral-progress','oral-reviewed-count','oral-total-count','mastery-heading','mastery-progress-row','mastery-meta','remaining-count','correct-count','mastered-independent-count','mastered-helped-count','mistake-count','session-total','progress-track','progress-fill','progress-fill-helped','progress-percentage','prompt','answer-form','answer','check-button','hint-display','hint-text','hint-rating',
    'feedback','feedback-title','feedback-mark','feedback-answer','feedback-detail','lookup-answer','completion-stats','final-correct','final-independent','final-helped','final-mistakes','completion-mistakes-button','completion-back-button'
  ];
  const els = Object.fromEntries(ids.map(id => [id.replace(/-([a-z])/g, (_, character) => character.toUpperCase()), $(id)]));

  let storage = null;
  try { storage = window.localStorage; storage.getItem(Lists.WORKSPACE_KEY); } catch { storage = null; }
  let activeTheme = Themes.apply(Themes.read(storage));
  let workspace = Lists.loadWorkspace(storage);
  let storageWorks = Boolean(storage);
  let queue = [], current = null, hintState = null, evaluated = false, masteredWithHelp = 0, allowHelpMastery = false, sessionMistakes = 0, sessionTotal = 0;
  let currentListId = null, practiceDirection = 'key-value', mistakePractice = false;
  let oralPractice = false, oralAnswerRevealed = false, oralReviewed = 0;
  let sessionFinished = false;
  let nearRetryUsed = false;
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
  function show(section) {
    els.setup.hidden = section !== 'setup';
    els.editor.hidden = section !== 'editor';
    els.practice.hidden = section !== 'practice';
    els.completion.hidden = section !== 'completion';
  }
  function setExerciseAction(accessibleLabel, isFinish = false) {
    els.checkButton.textContent = isFinish ? 'Finish' : '↵';
    els.checkButton.setAttribute('aria-label', accessibleLabel);
    els.checkButton.classList.toggle('has-label', isFinish);
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
    els.resetProgress.disabled = !saved;
    if (els.mode.value === 'oral') {
      els.progressHint.textContent = '';
      return;
    }
    els.progressHint.textContent = saved ? `${saved.remaining.length} item${saved.remaining.length === 1 ? '' : 's'} saved for this list and direction.` : 'Progressive mode will start with every entry.';
  }
  function renderPracticeMode() {
    const oralSelected = els.mode.value === 'oral';
    els.writtenOptions.hidden = oralSelected;
    els.progressHint.hidden = oralSelected;
    els.startButton.textContent = oralSelected ? 'Start oral practice ↗' : 'Start practice ↗';
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
  function renderListOverview() {
    els.listOverview.replaceChildren();
    const count = workspace.lists.length;
    els.listCount.textContent = `${count} list${count === 1 ? '' : 's'}`;
    els.deleteAllLists.disabled = count === 0;
    els.deleteSelectedLists.disabled = true;
    if (!count) {
      const empty = document.createElement('p');
      empty.className = 'hint list-overview-empty'; empty.textContent = 'No lists yet. Create a list or import a CSV to get started.';
      els.listOverview.append(empty);
      return;
    }
    for (const list of workspace.lists) {
      const row = document.createElement('article'); row.className = 'list-management-row';
      const selection = document.createElement('label'); selection.className = 'list-selection';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = list.id;
      checkbox.setAttribute('aria-label', `Select ${list.name} for deletion`);
      checkbox.addEventListener('change', updateBulkDeleteState);
      selection.append(checkbox);
      const description = document.createElement('span'); description.className = 'list-management-description';
      const name = document.createElement('strong'); name.textContent = list.name;
      const details = document.createElement('span'); details.className = 'hint';
      details.textContent = `${list.entries.length} entr${list.entries.length === 1 ? 'y' : 'ies'} · ${list.keyLabel} / ${list.valueLabel}`;
      description.append(name, details); selection.append(description); row.append(selection);
      const actions = document.createElement('div'); actions.className = 'list-management-actions';
      const addAction = (label, action, danger = false) => {
        const button = document.createElement('button'); button.type = 'button';
        button.className = danger ? 'text-button danger-text' : 'text-button'; button.textContent = label;
        button.addEventListener('click', () => action(list)); actions.append(button);
      };
      addAction('Edit', item => openEditor(item.id));
      addAction('Duplicate', item => {
        const activeListId = workspace.activeListId;
        const copy = Lists.duplicateList(workspace, item.id);
        if (copy) {
          workspace.activeListId = activeListId; persist(); renderSetup();
          setListStatus(`Created “${copy.name}” as a separate list.`);
        }
      });
      addAction('Export CSV', item => exportList(item));
      addAction('Delete', item => {
        if (!window.confirm(`Delete “${item.name}”, its progress and its collected mistakes from this browser?`)) return;
        Lists.deleteList(workspace, item.id); persist(); renderSetup(); setListStatus(`Deleted “${item.name}”.`);
      }, true);
      row.append(actions); els.listOverview.append(row);
    }
  }
  function updateBulkDeleteState() {
    els.deleteSelectedLists.disabled = !els.listOverview.querySelector('input[type="checkbox"]:checked');
  }
  function renderSetup() {
    els.listSelect.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = ''; placeholder.textContent = workspace.lists.length ? 'Choose a list' : 'No lists yet';
    els.listSelect.append(placeholder);
    for (const list of workspace.lists) {
      const option = document.createElement('option');
      option.value = list.id; option.textContent = `${list.name} · ${list.entries.length}`; els.listSelect.append(option);
    }
    els.listSelect.value = workspace.activeListId || '';
    const list = selectedList();
    els.practiceOptions.hidden = !list;
    els.startButton.disabled = !list || !list.entries.length;
    if (list) {
      els.direction.options[0].textContent = `${list.keyLabel} → ${list.valueLabel}`;
      els.direction.options[1].textContent = `${list.valueLabel} → ${list.keyLabel}`;
      els.direction.options[2].textContent = 'Mixed';
      els.editorKeyHeading.textContent = list.keyLabel;
      els.editorValueHeading.textContent = list.valueLabel;
    }
    renderMistakes(list);
    renderListOverview();
    setHomeView(homeView);
    renderProgressHint();
  }
  function renderThemePicker() {
    els.themePicker.replaceChildren();
    for (const theme of Themes.themes) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'theme-card';
      button.setAttribute('aria-pressed', String(theme.id === activeTheme));
      button.setAttribute('aria-label', `${theme.name}: ${theme.description}`);
      const swatches = document.createElement('span'); swatches.className = `theme-swatches theme-swatches-${theme.id}`; swatches.setAttribute('aria-hidden', 'true');
      const name = document.createElement('strong'); name.textContent = theme.name;
      const description = document.createElement('span'); description.className = 'hint'; description.textContent = theme.description;
      button.append(swatches, name, description);
      button.addEventListener('click', () => {
        activeTheme = Themes.save(theme.id, storage);
        Themes.apply(activeTheme);
        for (const card of els.themePicker.children) card.setAttribute('aria-pressed', String(card === button));
      });
      els.themePicker.append(button);
    }
  }
  function newList() {
    const practiceListId = workspace.activeListId;
    const list = Lists.addList(workspace, 'Untitled list');
    workspace.activeListId = practiceListId;
    persist(); renderSetup(); openEditor(list.id);
  }
  async function importCSV(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const practiceListId = workspace.activeListId;
    const failures = [];
    let imported = 0, skippedDuplicates = 0, restoredDirections = 0;
    for (const file of files) {
      try {
        const parsed = Lists.parseCSV(await file.text());
        if (!parsed.entries.length) throw new Error('This CSV has no entries.');
        const list = Lists.addList(workspace, fileBaseName(file.name), parsed.entries, undefined, {
          keyLabel: parsed.keyLabel,
          valueLabel: parsed.valueLabel
        });
        workspace.activeListId = practiceListId;
        imported++;
        skippedDuplicates += parsed.duplicateCount;
        restoredDirections += Lists.migrateProgressForList(workspace, list);
      } catch (error) {
        failures.push(`${file.name}: ${error.message}`);
      }
    }
    workspace.activeListId = practiceListId;
    if (imported) { persist(); renderSetup(); }
    const duplicateNote = skippedDuplicates ? ` Skipped ${skippedDuplicates} duplicate pair${skippedDuplicates === 1 ? '' : 's'}.` : '';
    const progressNote = restoredDirections ? ` Restored saved progress for ${restoredDirections} direction${restoredDirections === 1 ? '' : 's'}.` : '';
    if (failures.length) {
      const summary = imported ? `Imported ${imported} of ${files.length} CSV files.` : `Could not import ${files.length} CSV file${files.length === 1 ? '' : 's'}.`;
      setListStatus(`${summary}${duplicateNote}${progressNote} ${failures.join('; ')}`, imported === 0);
    } else {
      setListStatus(`Imported ${imported} separate list${imported === 1 ? '' : 's'} from ${files.length} CSV file${files.length === 1 ? '' : 's'}.${duplicateNote}${progressNote}`);
    }
    event.target.value = '';
  }
  function editorSnapshot(list) {
    return { id: list.id, name: list.name, keyLabel: list.keyLabel, valueLabel: list.valueLabel, entries: list.entries.map(entry => ({ ...entry })) };
  }
  function openEditor(listId) {
    const list = workspace.lists.find(item => item.id === listId);
    if (!list) return;
    draft = editorSnapshot(list); editorDirty = false;
    els.editorName.value = draft.name;
    els.editorKeyLabel.value = draft.keyLabel;
    els.editorValueLabel.value = draft.valueLabel;
    els.editorKeyHeading.textContent = draft.keyLabel;
    els.editorValueHeading.textContent = draft.valueLabel;
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
    oralPractice = !mistakesOnly && els.mode.value === 'oral';
    allowHelpMastery = !oralPractice && els.hintCountsAsMastered.checked;
    oralAnswerRevealed = false; oralReviewed = 0;
    let entries;
    if (mistakesOnly) entries = (workspace.mistakes[list.id] || []).map(entry => ({ ...entry }));
    else if (oralPractice) entries = list.entries;
    else {
      const saved = !full ? Lists.progressQueue(workspace, list, practiceDirection) : null;
      entries = saved === null ? list.entries : saved;
    }
    queue = shuffled(entries.map(entry => ({ id: entry.id, pair: { key: entry.key, value: entry.value } })));
    sessionTotal = queue.length;
    masteredWithHelp = 0; sessionMistakes = 0;
    sessionFinished = false;
    if (!queue.length) {
      if (mistakesOnly) setListStatus('There are no collected mistakes for this list yet.');
      else finish();
      return;
    }
    const itemLabel = oralPractice ? 'card' : mistakesOnly ? 'mistake' : 'entry';
    els.listLabel.textContent = `${list.name} · ${queue.length} ${itemLabel}${queue.length === 1 ? '' : 's'}`;
    show('practice'); renderQuestion();
  }
  function savePracticeProgress() {
    if (oralPractice || mistakePractice || !currentListId) return;
    Lists.saveProgress(workspace, currentListId, practiceDirection, queue);
    persist();
  }
  function renderSessionProgress() {
    if (oralPractice) {
      els.oralProgress.hidden = false;
      els.oralReviewedCount.textContent = String(oralReviewed);
      els.oralTotalCount.textContent = String(sessionTotal);
      els.masteryHeading.hidden = true;
      els.masteryProgressRow.hidden = false;
      els.masteryMeta.hidden = true;
      const percentage = sessionTotal ? Math.round(oralReviewed / sessionTotal * 100) : 0;
      els.progressTrack.setAttribute('aria-label', 'Cards reviewed');
      els.progressTrack.setAttribute('aria-valuemax', String(sessionTotal));
      els.progressTrack.setAttribute('aria-valuenow', String(oralReviewed));
      els.progressTrack.setAttribute('aria-valuetext', `${oralReviewed} of ${sessionTotal} cards reviewed`);
      els.progressFill.style.width = `${percentage}%`;
      els.progressFillHelped.style.width = '0%';
      els.progressPercentage.textContent = `${percentage}%`;
      els.questWorld.hidden = true;
      return;
    }
    els.oralProgress.hidden = true;
    els.masteryHeading.hidden = false;
    els.masteryProgressRow.hidden = false;
    els.masteryMeta.hidden = false;
    const progress = Practice.progressSummary(sessionTotal, queue, masteredWithHelp);
    els.correctCount.textContent = String(progress.mastered);
    els.masteredIndependentCount.textContent = String(progress.masteredIndependently);
    els.masteredHelpedCount.textContent = String(progress.masteredWithHelp);
    els.sessionTotal.textContent = String(progress.total);
    els.remainingCount.textContent = String(progress.remaining);
    els.mistakeCount.textContent = String(sessionMistakes);
    els.progressTrack.setAttribute('aria-label', 'Entries completed');
    els.progressTrack.setAttribute('aria-valuemax', String(progress.total));
    els.progressTrack.setAttribute('aria-valuenow', String(progress.mastered));
    const independentPercentage = progress.total ? progress.masteredIndependently / progress.total * 100 : 0;
    const helpedPercentage = progress.total ? progress.masteredWithHelp / progress.total * 100 : 0;
    els.progressFill.style.width = `${independentPercentage}%`;
    els.progressFillHelped.style.width = `${helpedPercentage}%`;
    els.progressTrack.setAttribute('aria-valuetext', `${progress.mastered} of ${progress.total} completed: ${progress.masteredIndependently} ok, ${progress.masteredWithHelp} with hint`);
    els.progressPercentage.textContent = `${progress.percentage}%`;
    els.questWorld.hidden = activeTheme !== 'quest';
    els.questWorld.style.setProperty('--quest-progress', `${progress.percentage}%`);
    els.questWorld.style.setProperty('--quest-hero-position', `${8 + progress.percentage * .82}%`);
    els.questScore.textContent = String(progress.mastered);
    els.questProgressLabel.textContent = `${progress.percentage}%`;
  }
  function renderQuestion() {
    if (!queue.length) { finish(); return; }
    current = queue[0]; current.direction = directionFor(); evaluated = false; nearRetryUsed = false;
    oralAnswerRevealed = false;
    els.practice.classList.toggle('oral-mode', oralPractice);
    els.feedback.hidden = true; els.lookupAnswer.hidden = true; els.hintDisplay.hidden = true;
    els.feedbackTitle.hidden = false; els.feedbackDetail.hidden = false;
    els.feedbackAnswer.hidden = false; els.feedbackAnswer.textContent = '';
    els.hintDisplay.className = 'hint-display'; els.hintText.textContent = ''; els.hintRating.textContent = '';
    els.answer.value = ''; els.answer.disabled = false; els.answer.hidden = oralPractice;
    setExerciseAction(oralPractice ? 'Reveal answer' : 'Check answer');
    const list = workspace.lists.find(item => item.id === currentListId);
    const source = current.direction === 'key-value' ? current.pair.key : current.pair.value;
    const expected = current.direction === 'key-value' ? current.pair.value : current.pair.key;
    els.answer.placeholder = `Type ${current.direction === 'key-value' ? list.valueLabel : list.keyLabel}…`;
    hintState = oralPractice ? null : Practice.createHintState(expected);
    els.prompt.textContent = source;
    renderSessionProgress();
    requestAnimationFrame(() => oralPractice ? els.checkButton.focus() : els.answer.focus());
  }
  function oralAction() {
    if (!oralPractice) return;
    if (!oralAnswerRevealed) {
      const expected = current.direction === 'key-value' ? current.pair.value : current.pair.key;
      oralAnswerRevealed = true;
      els.feedback.className = 'feedback correct';
      els.feedback.hidden = false;
      els.feedbackTitle.hidden = true;
      els.feedbackTitle.textContent = '';
      els.feedbackAnswer.hidden = false;
      els.feedbackAnswer.textContent = expected;
      els.feedbackDetail.hidden = true;
      els.feedbackDetail.textContent = '';
      els.feedbackMark.hidden = true;
      els.lookupAnswer.hidden = true;
      setExerciseAction(queue.length === 1 ? 'Finish oral practice' : 'Next card', queue.length === 1);
      els.checkButton.focus();
      return;
    }
    oralReviewed++;
    queue.shift();
    if (!queue.length) { renderSessionProgress(); finish(); return; }
    renderQuestion();
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
    if (comparison === 'near' && !nearRetryUsed && hintState.level < 3) {
      nearRetryUsed = true;
      els.feedback.className = 'feedback near';
      els.feedback.hidden = false;
      els.feedbackTitle.textContent = Practice.feedbackLabel('near', hintState.level);
      els.feedbackAnswer.textContent = '';
      els.feedbackAnswer.hidden = true;
      els.feedbackDetail.textContent = 'One more try. The correct answer stays hidden.';
      els.feedbackMark.hidden = true;
      els.lookupAnswer.hidden = true;
      els.answer.value = '';
      els.answer.disabled = false;
      setExerciseAction('Try again');
      els.answer.focus();
      return;
    }

    let result = Practice.applyHintCap(comparison, hintState.level);
    let feedbackComparison = comparison;
    if (comparison === 'near' && nearRetryUsed) {
      result = 'wrong';
      feedbackComparison = 'wrong';
    }
    const mastered = Practice.isMasteredAnswer(feedbackComparison, hintState.level, allowHelpMastery);
    const helpedMastery = mastered && hintState.level > 0;
    const label = Practice.feedbackLabel(feedbackComparison, hintState.level);
    evaluated = true;
    els.feedback.className = `feedback ${result}`;
    if (result === 'correct' && hintState.level === 0) els.feedback.classList.add('is-reward');
    else if (result === 'wrong') els.feedback.classList.add('is-incorrect');
    els.feedback.hidden = false;
    els.feedbackTitle.textContent = label; els.feedbackAnswer.hidden = false; els.feedbackAnswer.textContent = expected;
    els.feedbackDetail.hidden = true; els.feedbackDetail.textContent = '';
    els.feedbackMark.hidden = result !== 'correct' || hintState.level > 0;
    els.lookupAnswer.href = `https://translate.google.com/?sl=auto&tl=en&text=${encodeURIComponent(expected)}&op=translate`;
    els.lookupAnswer.hidden = false;
    if (hintState.level > 0) {
      els.hintDisplay.className = `hint-display ${result}`; els.hintRating.textContent = label;
    } else els.hintDisplay.hidden = true;

    if (mastered) {
      if (helpedMastery) masteredWithHelp++;
      if (mistakePractice) Lists.removeMistake(workspace, currentListId, current.pair);
    } else {
      sessionMistakes++;
      recordMistake(current.pair);
    }
    Practice.retainForRetry(queue, result, mastered);
    if (mistakePractice) persist(); else savePracticeProgress();
    renderSessionProgress();
    els.answer.disabled = true;
    const isFinish = queue.length === 0 && mastered;
    setExerciseAction(isFinish ? 'Finish practice' : 'Continue to next card', isFinish);
    els.checkButton.focus();
  }
  function advance() {
    if (!queue.length) { finish(); return; }
    renderQuestion();
  }
  function finish() {
    if (sessionFinished) return;
    sessionFinished = true;
    if (oralPractice) {
      els.completionStats.hidden = true;
      els.completionEyebrow.textContent = 'ORAL PRACTICE COMPLETE';
      els.completionTitle.textContent = `${oralReviewed} card${oralReviewed === 1 ? '' : 's'} reviewed`;
      els.completionIntro.textContent = 'Every card was shown once.';
      els.celebration.replaceChildren();
      els.completionMistakesButton.disabled = false;
      els.completionMistakesButton.hidden = false;
      els.completionMistakesButton.textContent = 'Practice again';
      els.completionMistakesButton.classList.add('primary');
      els.completionMistakesButton.classList.remove('secondary');
      els.completionBackButton.classList.remove('primary');
      els.completionBackButton.classList.add('secondary');
      show('completion');
      return;
    }
    els.completionStats.hidden = false;
    els.completionIntro.textContent = 'You reached the end of this practice queue.';
    els.completionMistakesButton.hidden = false;
    if (!mistakePractice) savePracticeProgress(); else persist();
    const summary = Practice.progressSummary(sessionTotal, queue, masteredWithHelp);
    els.finalCorrect.textContent = String(summary.mastered);
    els.finalIndependent.textContent = String(summary.masteredIndependently);
    els.finalHelped.textContent = String(summary.masteredWithHelp);
    els.finalMistakes.textContent = String(sessionMistakes);
    const theme = Themes.themes.find(item => item.id === activeTheme) || Themes.themes[0];
    els.completionTitle.textContent = theme.completionTitle;
    els.completionEyebrow.textContent = theme.completionEyebrow;
    els.celebration.replaceChildren();
    if (sessionTotal > 0) {
      for (let index = 0; index < 18; index++) {
        const piece = document.createElement('span'); piece.className = 'celebration-piece';
        piece.style.left = `${3 + Math.random() * 94}%`;
        piece.style.animationDelay = `${Math.random() * 180}ms`;
        piece.style.setProperty('--drift', `${Math.round((Math.random() - .5) * 110)}px`);
        els.celebration.append(piece);
      }
      setTimeout(() => els.celebration.replaceChildren(), 2300);
    }
    const hasReviewMistakes = (workspace.mistakes[currentListId] || []).length > 0;
    els.completionMistakesButton.disabled = !hasReviewMistakes;
    els.completionMistakesButton.textContent = hasReviewMistakes ? 'Review mistakes' : 'No mistakes to review';
    els.completionMistakesButton.classList.toggle('primary', hasReviewMistakes);
    els.completionMistakesButton.classList.toggle('secondary', !hasReviewMistakes);
    els.completionBackButton.classList.toggle('primary', !hasReviewMistakes);
    els.completionBackButton.classList.toggle('secondary', hasReviewMistakes);
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
  els.newListButton.addEventListener('click', newList);
  els.importListButton.addEventListener('click', () => els.csvFile.click());
  els.csvFile.addEventListener('change', importCSV);
  els.deleteSelectedLists.addEventListener('click', () => {
    const ids = [...els.listOverview.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
    if (!ids.length || !window.confirm(`Delete ${ids.length} selected list${ids.length === 1 ? '' : 's'}, including their progress and collected mistakes?`)) return;
    const deleted = Lists.deleteLists(workspace, ids); persist(); renderSetup();
    setListStatus(`Deleted ${deleted} selected list${deleted === 1 ? '' : 's'}.`);
  });
  els.deleteAllLists.addEventListener('click', () => {
    if (!workspace.lists.length || !window.confirm(`Delete all ${workspace.lists.length} lists, including all progress and collected mistakes?`)) return;
    const deleted = Lists.deleteLists(workspace, workspace.lists.map(list => list.id));
    persist(); renderSetup(); setListStatus(`Deleted all ${deleted} lists.`);
  });
  els.practiceMistakesButton.addEventListener('click', () => start(true, true));
  els.exportMistakes.addEventListener('click', () => {
    const list = selectedList(); if (list) download(`${safeFilename(list.name)}-mistakes.csv`, Lists.encodeCSV(workspace.mistakes[list.id] || []), 'text/csv;charset=utf-8');
  });
  els.clearMistakes.addEventListener('click', () => {
    const list = selectedList(); if (!list || !window.confirm(`Clear collected mistakes for “${list.name}”?`)) return;
    workspace.mistakes[list.id] = []; persist(); renderSetup();
  });
  els.direction.addEventListener('change', renderProgressHint);
  els.mode.addEventListener('change', () => { renderPracticeMode(); renderProgressHint(); });
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
  els.leaveButton.addEventListener('click', () => { if (!oralPractice) savePracticeProgress(); renderSetup(); show('setup'); });
  els.answer.addEventListener('keydown', event => {
    if (oralPractice) return;
    if (!Practice.shouldRequestHint(event.key, els.answer.value, evaluated)) return;
    event.preventDefault(); Practice.nextHint(hintState);
    els.hintDisplay.hidden = false; els.hintDisplay.className = `hint-display ${hintState.rating}`;
    els.hintText.textContent = hintState.display;
    els.hintRating.textContent = hintState.level < 3 ? `Almost · hint ${hintState.level}/3` : 'Not quite · answer revealed';
  });
  els.answerForm.addEventListener('submit', event => {
    event.preventDefault();
    if (oralPractice) { oralAction(); return; }
    if (Practice.enterAction(evaluated) === 'check') checkAnswer(); else advance();
  });
  els.completionBackButton.addEventListener('click', () => { renderSetup(); show('setup'); });
  els.completionMistakesButton.addEventListener('click', () => {
    if (oralPractice) { start(true, false); return; }
    renderSetup(); setHomeView('review'); show('setup'); els.mistakesReview.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  els.exportProgress.addEventListener('click', () => download('kivo-workspace-backup.json', JSON.stringify({ format: 'kivo-workspace-v1', workspace }, null, 2), 'application/json'));
  els.progressFile.addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const restored = Lists.restoreBackup(data);
      if (!window.confirm('This will replace your current lists, progress and mistakes. Continue?')) return;
      const previousWorkspace = workspace;
      workspace = restored;
      let saved;
      try {
        renderSetup();
        saved = persist();
      } catch (error) {
        workspace = previousWorkspace;
        renderSetup();
        throw error;
      }
      if (saved) {
        try {
          storage.removeItem(Lists.LEGACY_PROGRESS_KEY);
          storage.removeItem(Lists.LEGACY_MISTAKES_KEY);
        } catch { /* The restored workspace remains usable for this session. */ }
      }
      setListStatus(saved ? 'Workspace restored.' : 'Workspace restored for this session; browser storage is unavailable.');
    } catch (error) { setListStatus(`Could not import backup: ${error.message}`, true); }
    finally { event.target.value = ''; }
  });
  els.resetProgress.addEventListener('click', () => {
    const list = selectedList(); if (!list) return;
    if (workspace.progress[list.id]) delete workspace.progress[list.id][els.direction.value];
    persist(); renderSetup();
  });

  persist();
  renderSetup();
  renderPracticeMode();
  renderThemePicker();
  window.Kivo = { ...Practice, ...Lists };
})();
