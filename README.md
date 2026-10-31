# Woordjes – Dutch Vocabulary Trainer

A Dutch vocabulary app (flashcards, multiple choice, typing practice) that runs **entirely on
your phone**. It's a static web app (HTML/CSS/JS) that you install from Safari with
"Add to Home Screen". There's no server and no account: your words and progress are stored on
the device, and the app works offline.

## Install on iPhone (free, via GitHub Pages)

1. Create a free [GitHub](https://github.com) account and a new **public** repository,
   e.g. `woordjes`. GitHub Pages is free only for public repositories, so only the app's code
   goes there; your word lists and progress stay on your phone.
2. Push this project to the repository (branch `main`).
3. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
   The workflow in `.github/workflows/pages.yml` publishes the `frontend/` folder. After a
   minute the app is live at `https://<your-username>.github.io/woordjes/`.
4. On the iPhone, open that address in **Safari**, then tap **Share → Add to Home Screen**.
5. Open **Woordjes** from the Home Screen and add words: upload a PDF (from Files/iCloud
   Drive/OneDrive) or restore a backup.

Updates: push to `main`. The installed app picks up the new version the next time it's opened
(sometimes it takes opening it twice).

## Your data

- Everything is stored in the app's local storage on the device. Each phone or browser has its
  own words and progress.
- **Make backups**: Lists → **Backup & restore → Save backup** opens the share sheet. Choose
  "Save to Files" (e.g. iCloud Drive). **Restore backup** loads such a file. Lists in the
  backup replace lists with the same name; other lists are kept.
- The same backup file moves your data to another phone, or shares a list with a friend.
- Deleting the Home Screen app also deletes its data, so save a backup first.

### Moving data from the old server version

Earlier versions stored data in a server database (`data/vocab.db`). To turn that into a
backup file, including chapters, saved example sentences and one account's progress:

```powershell
.\.venv\Scripts\python.exe tools\export_backup.py woordjes-backup.json [--user USERNAME]
```

Then put the file on the phone (iCloud Drive, OneDrive, AirDrop…) and use **Restore backup**.

## Run locally

```powershell
python -m http.server 8000 --directory frontend
```

Open http://localhost:8000. Offline mode (the service worker) only works on `localhost` or
over HTTPS.

## PDF format

PDFs are read on the device with [pdf.js](https://mozilla.github.io/pdf.js/). Text-based PDFs
with one pair per line (Dutch first), e.g.

```
de hond - the dog
het huis = the house
lopen : to walk
```

or a two-column table. A header row like `English | Dutch` swaps the order automatically,
and you can swap/edit/uncheck rows before saving. Scanned (image-only) PDFs are not supported.

An optional third column with a chapter number (e.g. `de hond    the dog    4`) is stored too.
Lists with chapters get a chapter filter in the study bar.

## Study options

The study bar on the Words/Cards/Quiz/Type screens lets you choose:

- **Order**: *Random* (Quiz/Type favour words you often get wrong), *Sequential*
  (by chapter, then the order of the original list), or *A–Z* (alphabetical by the prompt word).
- **Chapter**: all chapters or a single chapter (shown only when the list has chapters).

## Example sentences

When you flip a flashcard, the back shows a Dutch example sentence with its English translation.
Sentences come from [Tatoeba](https://tatoeba.org) (CC BY 2.0 FR). The app looks one up the
first time a word is shown (this needs internet) and saves it on the device, so it also works
offline later. Words without a suitable sentence show none.

## Pronunciation

Words are spoken with the device's own Dutch voice. On iPhone you get a much better voice by
downloading one: **Settings → Accessibility → Read & Speak → Voices → Dutch** (on iOS 18 and
earlier this is called **Spoken Content**). Tap the download icon next to an "Enhanced" voice,
then restart the app. Turn off silent mode to hear it.

## Project layout

- `frontend/` – the app (published to GitHub Pages)
  - `store.js` – on-device storage, backup/restore, example-sentence lookup
  - `parser.js` – PDF word-list parser (loads `vendor/pdfjs/`, Apache-2.0)
  - `app.js`, `index.html`, `styles.css`, `sw.js` (offline cache), `manifest.json`
- `tools/export_backup.py` – converts the old server database into a backup file
- `backend/`, `requirements.txt`, `railway.json` – the earlier server version (FastAPI, with
  accounts). The current app doesn't use it; it's only needed by `tools/export_backup.py`.
