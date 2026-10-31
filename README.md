# Woordjes – Dutch Vocabulary Trainer

FastAPI + SQLite backend, vanilla HTML/CSS/JS frontend, installable as a PWA on iPhone.

## Run

```powershell
cd dutch-vocab-app
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

Open http://localhost:8000. The database is created at `data/vocab.db`.

## Accounts

Everyone signs in with a username and password (sign-up is open to anyone with the URL).

- **Word lists are shared**: every user can study every list. Only the person who created a
  list can add words to it, delete words from it or delete it.
- **Progress is personal**: right/wrong counts and "learned" status are stored per user.
- **Existing data**: in a database from before accounts existed, the first account created
  takes over all existing lists and progress.
- Passwords are stored as salted PBKDF2-SHA256 hashes. Sessions last a year (so the iPhone
  home-screen app stays signed in) and repeated failed sign-ins are rate-limited.

## PDF format

Text-based PDFs with one pair per line (Dutch first), e.g.

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
Sentences come from [Tatoeba](https://tatoeba.org) (CC BY 2.0 FR). Each one is looked up the
first time a word is shown and then saved in the database, so it also works offline later.
Words without a suitable sentence show none.

## iPhone

1. Find your PC's IP (`ipconfig`) and open `http://<PC-IP>:8000` in Safari on the same Wi-Fi
   (allow Python through Windows Firewall if asked).
2. Share → **Add to Home Screen**.

Offline caching (service worker) requires HTTPS. Either use a tunnel such as
`cloudflared tunnel --url http://localhost:8000`, or create a trusted certificate with
[mkcert](https://github.com/FiloSottile/mkcert) (install its root CA on the iPhone) and run:

```powershell
uvicorn backend.main:app --host 0.0.0.0 --port 8443 --ssl-keyfile key.pem --ssl-certfile cert.pem
```

## Deploy to Railway

Config lives in `railway.json` (Railpack build, uvicorn start command, health check) and
`.python-version`. SQLite needs a persistent volume, otherwise data is wiped on every deploy.

```bash
npm i -g @railway/cli
railway login
railway init                                # create a new project
railway up --detach                         # first deploy, creates the service
railway volume add --mount-path /data       # persistent storage for SQLite
railway variables --set DATA_DIR=/data
railway domain                              # generate a public https URL
```

Later deploys: `railway up`. The Railway URL is HTTPS, so the full PWA (offline mode) works on iPhone.
