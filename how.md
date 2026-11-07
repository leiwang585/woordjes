# How Woordjes works

A walkthrough of the project, explained with Python comparisons where possible.

## 1. The big picture

```
┌─────────────── Your laptop ───────────────┐        ┌──────── GitHub ────────┐
│  dutch-vocab-app/                         │  git   │  repo: leiwang585/     │
│   frontend/   ← the app itself ───────────┼──push─►│        woordjes        │
│   tools/      ← Python helpers            │        │  GitHub Actions copies │
│   backend/    ← old server (retired)      │        │  frontend/ to a website│
└───────────────────────────────────────────┘        └───────────┬────────────┘
                                                                 │ https
                                              ┌──────────────────▼──────────────┐
                                              │ iPhone Safari → "Add to Home    │
                                              │ Screen" → runs the app locally, │
                                              │ data stored on the phone        │
                                              └─────────────────────────────────┘
```

The key idea: **the app is just a few text files** (HTML, CSS, JavaScript). GitHub hosts them as
a website for free. Your iPhone downloads them once, keeps a copy, and **runs all the code on the
phone**. No Python runs anywhere when you study.

## 2. The three web languages

| Language | What it does | Python comparison |
|---|---|---|
| **HTML** | The page structure: header, buttons, tab bar | Like defining a GUI layout |
| **CSS** | How it looks: colours, sizes, the orange gradient, card flip animation | A big style sheet; no logic |
| **JavaScript (JS)** | All the behaviour: reacting to taps, quiz logic, saving data | The "Python" of the browser; the only language browsers run |

JavaScript reads quite similarly to Python:

```js
function checkAnswer(given, target) {        // def check_answer(given, target):
    const g = normalize(given);              //     g = normalize(given)
    if (!g) return 'wrong';                  //     if not g: return 'wrong'
    ...
}
const words = list.filter((w) => w.known);   // words = [w for w in lst if w.known]
```

`async`/`await` works just like Python's `asyncio`.

## 3. The files in `frontend/` (the actual app)

| File | Role | Python comparison |
|---|---|---|
| [index.html](frontend/index.html) | The skeleton: top bar, study selectors, empty `<main>` area, tab bar. Loads the scripts. | The window frame |
| [styles.css](frontend/styles.css) | All the visuals | — |
| [store.js](frontend/store.js) | **Data layer**: saving lists, words and progress; backup/restore; voice-pack storage; fetching example sentences | Like a small `models.py` + `db.py` |
| [app.js](frontend/app.js) | **Everything you see and tap**: screens, flashcards, quiz, auto play, pronunciation | `main.py` + all the UI code |
| [parser.js](frontend/parser.js) | Reads a PDF and finds word pairs and chapters. A direct translation of the old `pdf_parser.py`. | Same regexes, same logic |
| `frontend/vendor/pdfjs/` | Mozilla's PDF reading library (downloaded, not written by us) | Like a `pip install`ed package, copied in |
| [sw.js](frontend/sw.js) | **Service worker**: keeps a copy of the app on the phone so it works offline | A local cache that intercepts downloads |
| [manifest.json](frontend/manifest.json) | Tells the phone the app's name, icon and colours for "Add to Home Screen" | Like `setup.py` metadata |
| `frontend/icons/` | Home Screen icons | — |
| `frontend/demo/` | The built-in **Basic 100** and **Verb 100** demo lists (backup files) and their natural-voice packs, installed on first launch | Like fixture data shipped with a package |

### How `app.js` builds screens

There's one page; the app swaps what's inside `<main>`. The part after `#` in the URL decides
which screen to show (`#cards`, `#mc`…). This is the `routes` table near the bottom of
`app.js`:

```js
const routes = {
    lists: { title: 'Woordjes', render: renderLists },
    cards: { title: 'Flashcards', render: renderCards, study: true },
    ...
};
```

Python comparison: a dict mapping names to functions, like `{"cards": render_cards}[name](view)`.
Each `renderX` function creates the elements for that screen with a small helper `el(...)`:

```js
el('button', { class: 'btn success', onclick: () => next(true) }, '✓  Know it')
```

That means "make a button, with this style, call `next(True)` when tapped, labelled ✓ Know it".
The `onclick` is an **event handler**, a callback like in Tkinter or PyQt.

## 4. Where your data lives (on the phone)

Browsers give each website two storage areas:

| Storage | Used for | Python comparison |
|---|---|---|
| **localStorage** | Lists, words, progress, settings (order, chapter, voice) | A persistent `dict` of strings. We store one big JSON blob, like `json.dumps(data)` into a file. |
| **IndexedDB** | The voice pack (17 MB, too big for localStorage) | A small key–value database, a bit like `shelve` or `sqlite3` |

The data in `store.js` looks like this (shown as Python):

```python
data = {
  "lists": [{"id": 1, "name": "Start1-…", "created_at": "…"}],
  "words": [{"id": 5, "list_id": 1, "dutch": "acht", "english": "eight",
             "chapter": "1", "example_nl": "…", "example_en": "…",
             "correct": 3, "incorrect": 1, "known": True}],
}
```

Every time you tap "Know it", `store.recordResult()` updates that word and saves the whole thing
again. **Backup** just writes this structure to a `.json` file; **Restore** reads it back.

## 5. What happens when you tap something: flashcards

1. You tap **Cards** in the tab bar. The URL becomes `#cards`, `router()` runs and calls
   `renderCards()`.
2. `renderCards` loads the words for the selected list and chapter, drops the **known** ones,
   and puts them in order: random, sequential (by chapter), or A–Z. With resume, it starts after
   the last word you answered.
3. It shows the first card and calls `speak("acht")`:
   - Is "acht" in the voice pack (IndexedDB)? Then play Fenna's MP3.
   - Otherwise, use the iPhone's built-in voice.
4. Meanwhile `loadExample()` checks whether the word already has a saved sentence. If not, it
   asks **Tatoeba's website** for one (an internet request, like `requests.get(...)`) and saves it.
5. You tap the card: a CSS class `flipped` is added, and the CSS animates the 3D flip.
6. You tap **Know it**: `recordResult(word, True)` sets `correct += 1, known = True`, saves,
   remembers your position, and shows the next card.

The Quiz screen works the same way. The **Auto** button on the Cards screen uses a timer
(`setTimeout`) to flip the card and move to the next one every 3 seconds. Swiping is handled with
touch events (`touchstart`/`touchmove`/`touchend`) that measure how far the finger moved sideways.

## 6. Offline & "installing": the PWA part

A **PWA (Progressive Web App)** is a website that behaves like an app:

- `manifest.json` lets the phone install it on the Home Screen with an icon, full screen,
  without Safari's address bar.
- `sw.js` (the **service worker**) runs in the background. On first visit it saves copies of all
  the app files. Later, when the app asks for `app.js`, the service worker answers from that copy
  right away, even with no internet, and quietly downloads a newer version for next time. That's
  why an update sometimes needs opening the app twice.
- `CACHE = 'woordjes-v12'` (or later): bump this number on each change so phones throw away the
  old copy.

## 7. Publishing: from your laptop to the phone

1. **git** tracks every version of the files (like save points). `git commit` makes a save point;
   `git push` uploads it to GitHub.
2. GitHub runs [pages.yml](.github/workflows/pages.yml) automatically (that's **GitHub Actions**).
   It's a small recipe: "take the `frontend/` folder and publish it as the website".
3. About a minute later https://leiwang585.github.io/woordjes/ serves the new files, and the
   phone picks them up the next time you open the app.

## 8. The Python parts

| File | What it does |
|---|---|
| [tools/export_backup.py](tools/export_backup.py) | Read the old SQLite database and write a backup JSON the app can restore |
| [tools/make_audio_pack.py](tools/make_audio_pack.py) | Read a backup and render every word with `edge-tts` (Fenna) using `asyncio` with 4 at a time. Writes all MP3s base64-encoded into one JSON file, keyed by the word text. |
| `backend/` | The **old server version** (FastAPI + SQLite, with accounts). The app no longer uses it; the two tools import a few helpers from it (`DB_PATH`, `clean`, `synthesize`). |

The old backend is worth a look because it's familiar territory:
[backend/main.py](backend/main.py) is a regular FastAPI app. The phone-only version simply moved
that logic into JavaScript on the phone.

## 9. How to change something yourself

1. **Run it locally:**

   ```powershell
   python -m http.server 8000 --directory frontend
   ```

   Open http://localhost:8000 in Edge or Chrome.
2. **Edit** a file, e.g. change a text in `app.js` or a colour in `styles.css`, then refresh the
   browser. You might need two refreshes because of the service worker.
3. **Debug** with **F12** (developer tools). The *Console* tab is like a Python REPL inside the
   page. Try `store.words().length` or `store.lists()`. Errors show up there in red.
4. **Publish:**

   ```powershell
   git add -A
   git commit -m "Describe the change"
   git push
   ```

   For bigger changes, also bump `CACHE` in `sw.js` so phones get the new version reliably.

**Good first experiments:**

- In `app.js`, find `isLearned` (`w.correct - w.incorrect >= 2`) and change what "learned" means.
- In `styles.css`, change `--orange` near the top to recolour the app.
- In the browser console, run `checkAnswer('de hnd', 'de hond')` to see the typo tolerance
  (it returns `'almost'`).
