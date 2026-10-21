# Kivo

Kivo is a small vocabulary and concept practice app. It helps you recall a paired answer from a prompt, using lists that you can import, create and edit yourself. It runs in a browser without an installation, server or account.

## Features

- Keep multiple lists in the browser and choose one before practice.
- Create, rename, duplicate, edit and delete lists.
- Edit entries in a simple searchable table; add or remove rows and customize the displayed column labels.
- Import and export UTF-8 CSV files.
- Practice either direction or mix directions, with full and progressive modes.
- Request up to three progressive hints with Space while the answer field is empty.
- Use the optional Pomodoro focus timer; it runs independently of practice and resumes from local browser storage.
- Review collected mistakes in the app, practice them again, or export them as CSV.
- Choose between Classic, Arcade '86, Maze and the illustrated Quest adventure theme.
- Save lists, per-list progress and mistakes in browser storage. Download a workspace backup when you want a portable copy.
- See a quiet activity summary for practice time, cards reviewed, completed sessions and active days.
- Optionally use the independent Pomodoro focus timer.

## Quick start

1. On GitHub, choose **Code → Download ZIP** and extract the archive into a folder.
2. Open `index.html` in a current browser.
3. Choose **New list** to make a list, or **Import CSV** to load one or more files at once. Each CSV becomes a separate list. Public examples are in `vocabulary/examples/`; select files with the file picker.
4. Select a list, choose a direction and practice mode, then start.

Kivo uses relative, classic JavaScript files and does not need a build step, package manager, local server or internet connection for its core features.

Choose the visual style in **About → Appearance**:

- **Classic** — Calm and focused
- **Arcade '86** — Retro game energy
- **Maze** — Chase your next word
- **Quest** — Travel through a word adventure

Your choice is saved as a separate browser preference and does not change lists or learning progress.

All four styles keep the same lists, practice rules and controls. Maze adds a blue maze frame and yellow dotted progress display. Quest gives the practice screen an illustrated landscape, a traveling pixel adventurer and a mission finishline. All styles use the same slightly enlarged text scale.

## Create and manage lists

Choose **New list** to open the editor. Add rows, enter a list name and optionally change the two display labels. Search filters the visible rows. **Save changes** stores your edits in this browser. **Discard changes** asks before dropping unsaved edits; leaving the editor also asks whether to save or stay.

The **Manage lists** tab shows every list with direct Edit, Duplicate, Export CSV and Delete actions. Select checkboxes to delete several lists, or choose **Delete all**. Deleting lists also deletes their browser-stored progress and collected mistakes. Importing one or more CSV files creates a separate list for each valid file and keeps existing lists unchanged. If a list name is already in use, Kivo adds a number to the imported or duplicated name. If a selected file is invalid, Kivo reports it and continues importing the other selected files.

An imported CSV remains unchanged. Lists and edits made in Kivo are local browser working copies. **Export CSV** downloads a portable copy; to update a repository CSV, replace that file yourself and commit it with Git. Kivo cannot write edits back into the extracted project folder.

### Public examples and personal lists

The repository keeps public, generic sample lists in `vocabulary/examples/`. The `vocabulary/personal/` folder is for your own CSV files and is excluded by `.gitignore`. A GitHub ZIP will not include that private folder, so create it after extraction if needed. To save an edited list there, export it from Kivo and move the downloaded CSV into that folder yourself. You can import a CSV from either folder using the same browser file picker; Kivo does not need to discover or scan either folder.

`.gitignore` only prevents new, untracked personal files from being added by default. It does not untrack files already in Git or remove files from commits that have already been published. If you add a personal file to Git by mistake, remove it from tracking while preserving your local copy, and review the repository's public history and any copies or forks. Do not place sensitive data in a public repository. The earlier `vocabulary/business-fr.csv` list was already published; its local copy is now in `vocabulary/personal/business-fr.csv`, but its previous public history has not been rewritten. Review that history separately if the contents should no longer be public.

## CSV format

CSV files use UTF-8 and a header row. Kivo reads comma, semicolon or tab separated files, including common labels such as `key,value`, `French,Dutch`, `Français,Néerlandais` and `term,definition`. For other two-column headings, Kivo uses the first column as the term and the second as its answer, keeping their names as display labels. You can change the labels in the list editor. Fields containing delimiters, quotes or line breaks should be quoted. A quote inside a quoted field is doubled. Exported files use the portable `key,value` header format.

```csv
key,value
"Capital city","Country"
"Paris","France"
"avoir l’air","to seem"
```

Blank rows are ignored. Rows without both values are rejected. Exact duplicate pairs are skipped on import and reported. In the editor, empty fields and duplicate pairs must be fixed before saving. Unicode, accents, punctuation and multiword values are supported.

## Practice, hints and progress

Choose Key → Value, Value → Key or Mixed. **Full** starts with all entries. **Progressive** resumes the remaining entries for that list and direction. Correct answers leave the queue; accent-only answers and incorrect answers return later in the queue.

Press Enter to check, then Enter again to continue. When the answer field is empty, Space reveals about 35%, 65% and then all of the answer. The first hint always includes the first letter. One or two hints limit an otherwise correct rating to orange; a full reveal is red. Once you have started typing, Space remains available for multiword answers.

Enable **Collect mistakes for review** before a session to add orange and red answers to that list's mistake collection. Open **Review mistakes** to see them or practice them again. A correct answer during mistake practice removes it from that review collection. Mistake export is available as an optional CSV.

Progress is kept independently for each list and direction. Mixed practice has its own queue. Editing a list preserves the identity of unchanged entries, so saved progress can continue around edits; deleted entries are removed from a saved queue when it is resumed.

## Storage, backup and migration

Kivo stores its local workspace, including lists, progress and mistakes, in `localStorage`. Nothing syncs automatically between browsers or devices. Choose **Download backup** to save one JSON file containing the complete workspace. **Restore backup** replaces the current lists, progress and mistakes with the contents of that file, after a confirmation. Restore keeps the backed-up list and entry IDs so saved progress remains attached to the correct entries. Use CSV export when you want to move or version individual lists. A merge or add-from-backup workflow is not currently provided.

The optional Pomodoro timer stores its duration and running deadline separately from the workspace. A running timer can resume after reloading the page; resetting it or choosing a different duration changes only the timer.

The Progress view records activity from the moment this feature is first used; Kivo does not invent historical totals from saved queues or mistake lists. Written cards count once when feedback first appears; the extra answer after a near-match stays part of that card review, while a later retry from the queue counts again. Oral cards count when **Next card** is pressed. A session counts only when its finish screen is reached. Practice time is measured independently from Pomodoro, pauses when the tab is hidden, and stops adding time after 60 seconds without keyboard or pointer activity. Older backups without activity data restore with empty activity totals.

Earlier Kivo versions stored progress by CSV fingerprint and kept one global mistake collection. On first launch after upgrading, the old keys are retained. Collected mistakes are copied to a local list named **Recovered mistakes**. Previous progress is retained and can be restored for a list by importing the same CSV again; the old format did not contain the list entries themselves. You may delete the recovered list after reviewing it.

Browser storage can be restricted or isolated for `file://` pages, and clearing browser data can erase local working copies. Kivo warns when storage cannot be written, but it can continue for the open session. Export CSV or a workspace backup regularly if you want to keep local edits.

## Offline use and optional lookup

The core app works offline and does not load external scripts or fetch files. Browsers cannot reliably let a page opened through `file://` discover all files in `vocabulary/`, so import example or personal CSVs with the file picker. The app does not write to those files automatically.

After feedback, the optional book icon opens Google Translate in a new tab. This requires internet access and includes the expected answer in the URL sent to Google. The lookup is not used unless you click the icon.

## Browser compatibility

Kivo uses standard HTML, CSS and browser JavaScript, including `File.text()`, `localStorage`, `Blob` downloads and `crypto.randomUUID()` when available (with a local ID fallback). The app was opened directly through `file://` and visually checked in Google Chrome 155 on desktop and a narrow mobile viewport. Automated checks run under Node.js. Local file storage availability and persistence still vary between browsers and profiles, so export a CSV or workspace backup for a portable copy.

## Project structure

```text
index.html                 App screens and controls
style.css                  Responsive layout and theme styles
app.js                     Browser UI and practice flow
themes.js                  Theme definitions and saved preference
list-manager.js            CSV, lists, migration and workspace storage
practice-helpers.js        Hint, rating and queue helpers
*.test.js                  Dependency-free Node.js tests
vocabulary/examples/        Public generic example CSV lists
vocabulary/personal/        Local personal CSVs; ignored by Git
```

## Development and tests

There is no build or install step. With Node.js installed, run:

```sh
node list-manager.test.js
node practice-helpers.test.js
node app-integration.test.js
node themes.test.js
node --check app.js
node --check themes.js
node --check list-manager.js
node --check practice-helpers.js
node --check list-manager.test.js
node --check practice-helpers.test.js
git diff --check
```
