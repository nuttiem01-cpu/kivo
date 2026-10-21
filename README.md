# Kivo

Kivo is a small, offline key-value practice tool built with HTML, CSS, and vanilla JavaScript.

## Launch

Open `index.html` directly in a current browser. Kivo runs from `file://`; it does not need a server or network connection. Select a CSV yourself with the file picker. Kivo does not scan the `vocabulary` folder.

## CSV lists

Use a UTF-8 CSV whose first row contains `key,value`. Quote a field when it contains a comma, quote, or line break; embedded quotes are doubled. Empty rows are ignored, incomplete non-empty rows are rejected, and exact duplicate pairs are included once. The original file is never changed. Sample lists are in `vocabulary/`.

## Practice

Choose Key → Value, Value → Key, or Mixed. Full always starts with all imported pairs. Progressive resumes the remaining pairs for that exact CSV content and direction. Use “Reset saved progress” to clear that list/direction's saved queue. Correct answers remove a pair; orange (accent-only) and red answers return later in the queue. Press Enter to check, then Enter again to continue. Mixed selects a direction per question, while each pair still counts as one unit.

## Mistakes and transfer

With “Collect mistakes for export” enabled, each pair with an orange or red answer is saved once, even if later answered correctly. Export mistakes as an importable `key,value` CSV, or clear the collection on the completion screen. Progress can be exported as JSON and imported on another computer; then select the same CSV and direction to resume. Nothing syncs automatically.

## Browser storage

Progress and the mistake collection use `localStorage`. Some browsers isolate or restrict storage for `file://` pages, and clearing browser data can erase it. Kivo continues to work for the open session when storage is unavailable; export progress JSON for a portable backup.
