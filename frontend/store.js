'use strict';

/* All data lives on this device, in localStorage. No server is involved. */

const store = (() => {
    const KEY = 'woordjes-data';
    const MAX_TEXT = 200;
    let data = load();

    function load() {
        try {
            const d = JSON.parse(localStorage.getItem(KEY));
            if (d && Array.isArray(d.lists) && Array.isArray(d.words)) {
                // Older data had no "known" flag: count words answered right more often than wrong.
                for (const w of d.words) if (typeof w.known !== 'boolean') w.known = w.correct > w.incorrect;
                return d;
            }
        } catch { /* corrupt or missing: start empty */ }
        return { version: 1, nextId: 1, lists: [], words: [] };
    }

    function save() {
        try {
            localStorage.setItem(KEY, JSON.stringify(data));
        } catch {
            throw new Error('Could not save: the storage on this device is full.');
        }
    }

    const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
    const newId = () => data.nextId++;
    const text = (s) => String(s ?? '').trim().slice(0, MAX_TEXT);
    const chapterOf = (c) => String(c ?? '').trim().slice(0, 20) || null;
    const count = (n) => Math.max(0, Math.floor(Number(n) || 0));
    const optional = (s) => (s == null ? null : String(s));
    const findWord = (id) => data.words.find((w) => w.id === id);

    function insertWords(listId, pairs) {
        let added = 0;
        for (const p of pairs) {
            const dutch = text(p.dutch);
            const english = text(p.english);
            if (!dutch || !english) continue;
            const correct = count(p.correct);
            const incorrect = count(p.incorrect);
            data.words.push({
                id: newId(), list_id: listId, dutch, english, chapter: chapterOf(p.chapter),
                example_nl: optional(p.example_nl), example_en: optional(p.example_en),
                correct, incorrect,
                known: typeof p.known === 'boolean' ? p.known : correct > incorrect,
            });
            added++;
        }
        return added;
    }

    return {
        lists() {
            const counts = new Map();
            for (const w of data.words) counts.set(w.list_id, (counts.get(w.list_id) || 0) + 1);
            return data.lists
                .map((l) => ({ ...l, word_count: counts.get(l.id) || 0 }))
                .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
        },

        // Copies, so callers can't accidentally change stored data.
        words(listId = null) {
            return data.words
                .filter((w) => listId == null || w.list_id === listId)
                .map((w) => ({ ...w }));
        },

        createList(name, pairs = []) {
            name = String(name ?? '').trim().slice(0, 100);
            if (!name) throw new Error('Please enter a list name');
            const list = { id: newId(), name, created_at: now() };
            data.lists.push(list);
            const added = insertWords(list.id, pairs);
            save();
            return { ...list, word_count: added };
        },

        deleteList(id) {
            data.lists = data.lists.filter((l) => l.id !== id);
            data.words = data.words.filter((w) => w.list_id !== id);
            save();
        },

        addWord(listId, pair) {
            if (!data.lists.some((l) => l.id === listId)) throw new Error('List not found');
            if (!insertWords(listId, [pair])) throw new Error('Enter both Dutch and English');
            save();
            return { ...data.words[data.words.length - 1] };
        },

        deleteWord(id) {
            data.words = data.words.filter((w) => w.id !== id);
            save();
        },

        // "Known" follows the latest answer: flashcards skip known words.
        recordResult(id, correct) {
            const w = findWord(id);
            if (!w) return;
            if (correct) w.correct++; else w.incorrect++;
            w.known = Boolean(correct);
            save();
        },

        // example_nl: null = not looked up yet, '' = no example found.
        setExample(id, exampleNl, exampleEn) {
            const w = findWord(id);
            if (!w) return;
            w.example_nl = exampleNl;
            w.example_en = exampleEn;
            save();
        },

        exportData() {
            return {
                app: 'woordjes',
                version: 1,
                exported_at: new Date().toISOString(),
                lists: data.lists.map((l) => ({
                    name: l.name,
                    created_at: l.created_at,
                    words: data.words.filter((w) => w.list_id === l.id).map((w) => ({
                        dutch: w.dutch, english: w.english, chapter: w.chapter,
                        example_nl: w.example_nl, example_en: w.example_en,
                        correct: w.correct, incorrect: w.incorrect, known: w.known,
                    })),
                })),
            };
        },

        // Lists in the backup replace lists with the same name; other lists are kept.
        importData(backup) {
            if (!backup || backup.app !== 'woordjes' || !Array.isArray(backup.lists)) {
                throw new Error('This is not a Woordjes backup file');
            }
            let lists = 0;
            let words = 0;
            for (const l of backup.lists) {
                const name = String(l?.name ?? '').trim().slice(0, 100);
                if (!name || !Array.isArray(l.words)) continue;
                const old = data.lists.find((x) => x.name === name);
                if (old) {
                    data.lists = data.lists.filter((x) => x !== old);
                    data.words = data.words.filter((w) => w.list_id !== old.id);
                }
                const created = typeof l.created_at === 'string' && l.created_at ? l.created_at : now();
                const list = { id: newId(), name, created_at: created };
                data.lists.push(list);
                words += insertWords(list.id, l.words);
                lists++;
            }
            save();
            return { lists, words };
        },
    };
})();

/* ---------- Natural-voice audio pack (IndexedDB: too large for localStorage) ---------- */

const audioStore = (() => {
    let dbPromise = null;
    const open = () => {
        dbPromise = dbPromise || new Promise((resolve, reject) => {
            const req = indexedDB.open('woordjes-audio', 1);
            req.onupgradeneeded = () => req.result.createObjectStore('clips');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        return dbPromise;
    };
    // Runs fn(store) in one transaction; resolves with the request's result once committed.
    const run = async (mode, fn) => {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('clips', mode);
            const req = fn(tx.objectStore('clips'));
            tx.oncomplete = () => resolve(req ? req.result : undefined);
            tx.onerror = tx.onabort = () => reject(tx.error || new Error('Storage error'));
        });
    };

    function decode(b64) {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
    }

    return {
        count: () => run('readonly', (s) => s.count()),
        get: (text) => run('readonly', (s) => s.get(text)),
        clear: () => run('readwrite', (s) => s.clear()),

        // Stores clips as raw bytes (more reliable than Blobs in older iOS IndexedDB).
        async importPack(pack, onProgress) {
            if (!pack || pack.app !== 'woordjes-audio' || typeof pack.clips !== 'object') {
                throw new Error('This is not a Woordjes voice pack');
            }
            const entries = Object.entries(pack.clips);
            const CHUNK = 100;
            for (let i = 0; i < entries.length; i += CHUNK) {
                const chunk = entries.slice(i, i + CHUNK).map(([text, b64]) => [text, decode(b64)]);
                await run('readwrite', (s) => { for (const [text, bytes] of chunk) s.put(bytes, text); });
                onProgress?.(Math.min(i + CHUNK, entries.length), entries.length);
            }
            localStorage.setItem('voicePack', pack.voice || 'natural voice');
            return entries.length;
        },
    };
})();

/* ---------- Example sentences (Tatoeba.org, CC BY 2.0 FR) ---------- */

const TATOEBA_URL = 'https://api.tatoeba.org/unstable/sentences';

// 'aanbieding, de' -> 'aanbieding'; 'aankleden (zich -)' -> 'aankleden'.
function exampleSearchTerm(dutch) {
    let t = dutch.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ');
    t = t.split(/[,/;]/)[0].trim().replace(/^(?:de|het|een)\s+/i, '');
    return t.replace(/"/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[\s-]+|[\s-]+$/g, '');
}

async function tatoebaQuery(q) {
    const params = new URLSearchParams({
        lang: 'nld', q, 'trans:lang': 'eng', is_unapproved: 'no', sort: 'relevance', limit: '40',
    });
    const res = await fetch(`${TATOEBA_URL}?${params}`);
    if (!res.ok) throw new Error(`Tatoeba error ${res.status}`);
    return (await res.json()).data || [];
}

function pickExample(sentences) {
    let best = null;
    for (const s of sentences) {
        const translations = (s.translations || [])
            .filter((t) => t.lang === 'eng' && !t.is_unapproved)
            .sort((a, b) => Number(Boolean(b.is_direct)) - Number(Boolean(a.is_direct)));
        const words = s.text.split(/\s+/).filter(Boolean).length;
        if (!translations.length || words > 14) continue;
        // Prefer moderate length: long enough to show usage, short enough to read.
        const score = Math.abs(words - 7) + (words < 4 ? 2 : 0);
        if (!best || score < best.score || (score === best.score && s.text < best.dutch)) {
            best = { score, dutch: s.text, english: translations[0].text };
        }
    }
    return best && [best.dutch, best.english];
}

// Resolves to [dutch, english] or null if none exists; rejects on network errors.
async function findExample(dutch) {
    const term = exampleSearchTerm(dutch);
    if (!term) return null;
    const exact = term.includes(' ') ? `"${term}"` : `=${term}`;
    for (const q of new Set([exact, `"${term}"`])) {
        const found = pickExample(await tatoebaQuery(q));
        if (found) return found;
    }
    return null;
}
