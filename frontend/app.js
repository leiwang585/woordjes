'use strict';

const state = {
    lists: [],
    listWords: [], // every word in the selected list
    words: [], // listWords filtered by the selected chapter
    listId: localStorage.getItem('listId') || 'all',
    direction: localStorage.getItem('direction') || 'nl-en',
    order: localStorage.getItem('order') || 'random',
    chapter: localStorage.getItem('chapter') || 'all',
};

/* ---------- Helpers ---------- */

const $ = (sel, root = document) => root.querySelector(sel);

function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, val] of Object.entries(props)) {
        if (val == null || val === false) continue;
        if (key === 'class') node.className = val;
        else if (key === 'text') node.textContent = val;
        else if (key === 'value' || key === 'checked') node[key] = val;
        else if (key.startsWith('on')) node.addEventListener(key.slice(2), val);
        else node.setAttribute(key, val === true ? '' : val);
    }
    for (const child of children.flat()) {
        if (child == null || child === false) continue;
        node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
}

let toastTimer;
function toast(message) {
    const t = $('#toast');
    t.textContent = message;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2500);
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// Words answered wrong more often come up more often.
const weight = (w) => Math.max(0.5, 1 + w.incorrect * 2 - w.correct * 0.5);

function pickWord(words, avoidId) {
    const pool = words.length > 1 ? words.filter((w) => w.id !== avoidId) : words;
    const total = pool.reduce((sum, w) => sum + weight(w), 0);
    let r = Math.random() * total;
    for (const w of pool) {
        r -= weight(w);
        if (r <= 0) return w;
    }
    return pool[pool.length - 1];
}

const promptOf = (w) => (state.direction === 'nl-en' ? w.dutch : w.english);
const answerOf = (w) => (state.direction === 'nl-en' ? w.english : w.dutch);

/* ---------- Word order ---------- */

const collator = new Intl.Collator('nl', { numeric: true, sensitivity: 'base' });
const byChapter = (a, b) => (a.chapter == null) - (b.chapter == null)
    || collator.compare(a.chapter ?? '', b.chapter ?? '');
const alphaKey = (w) => stripArticle(normalize(promptOf(w)));

// 'seq' follows the chapters, then the original list order; 'alpha' sorts by the prompt word.
function orderWords(words, order = state.order) {
    if (order === 'random') return shuffle(words);
    if (order === 'alpha') return [...words].sort((a, b) => collator.compare(alphaKey(a), alphaKey(b)) || a.id - b.id);
    return [...words].sort((a, b) => byChapter(a, b) || a.id - b.id);
}

// Random favours weak words; other orders step through the list and wrap around.
function wordPicker(words) {
    if (state.order === 'random') {
        let last = null;
        return () => (last = pickWord(words, last?.id));
    }
    const seq = orderWords(words);
    let i = -1;
    return () => seq[(i = (i + 1) % seq.length)];
}

/* ---------- Pronunciation ---------- */
// Uses the device's own Dutch voice (on iPhone: Settings → Accessibility → Read & Speak → Voices).

const canSynth = 'speechSynthesis' in window;
let dutchVoice = null;
let activeSpeakBtn = null;

const cleanSpeech = (text) => text.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();

// Prefer high-quality Dutch voices (iOS Enhanced/Premium/Siri, Edge "Natural", Google).
function pickDutchVoice() {
    const score = (v) => (/^nl[-_]NL/i.test(v.lang) ? 2 : 1)
        + (/natural|neural|online|google|premium|enhanced|siri/i.test(v.name) ? 5 : 0);
    const dutch = speechSynthesis.getVoices().filter((v) => /^nl/i.test(v.lang));
    dutchVoice = dutch.sort((a, b) => score(b) - score(a))[0] || null;
}

if (canSynth) {
    pickDutchVoice();
    speechSynthesis.addEventListener('voiceschanged', pickDutchVoice);
}

function setSpeaking(on) {
    activeSpeakBtn?.classList.toggle('speaking', on);
    if (!on) activeSpeakBtn = null;
}

function stopSpeaking() {
    if (canSynth) speechSynthesis.cancel();
    setSpeaking(false);
}

function speak(text, btn = null) {
    const t = cleanSpeech(text);
    if (!t || !canSynth) return;
    stopSpeaking();
    activeSpeakBtn = btn;
    setSpeaking(true);
    const u = new SpeechSynthesisUtterance(t);
    u.lang = 'nl-NL';
    if (dutchVoice) u.voice = dutchVoice;
    u.rate = 0.85;
    u.onend = u.onerror = () => { if (speak.current === u) setSpeaking(false); };
    speak.current = u; // keep a reference so the utterance isn't garbage-collected mid-speech
    speechSynthesis.speak(u);
}

// iOS only allows speech after a user gesture; unlock it on the first tap.
{
    const unlock = () => {
        if (canSynth) speechSynthesis.speak(new SpeechSynthesisUtterance(''));
        document.removeEventListener('touchend', unlock, true);
        document.removeEventListener('click', unlock, true);
    };
    document.addEventListener('touchend', unlock, true);
    document.addEventListener('click', unlock, true);
}

const SPEAKER_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor"/><path class="wave1" d="M15.5 8.5a5 5 0 0 1 0 7"/><path class="wave2" d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';

function speakButton(getText, extraClass = '') {
    const btn = el('button', {
        class: `speak-btn ${extraClass}`.trim(), type: 'button', 'aria-label': 'Play pronunciation',
        onclick: (e) => { e.stopPropagation(); speak(getText(), btn); },
    });
    btn.innerHTML = SPEAKER_SVG;
    return btn;
}

function recordResult(word, correct) {
    if (correct) word.correct++; else word.incorrect++;
    try {
        store.recordResult(word.id, correct);
    } catch (e) { toast(e.message); }
}

// Looks up (and saves) a word's example sentence; example_nl is '' when none exists.
const exampleRequests = new Map();
function loadExample(word) {
    if (word.example_nl != null) return Promise.resolve(word);
    if (!exampleRequests.has(word.id)) {
        exampleRequests.set(word.id, findExample(word.dutch)
            .then((found) => {
                const [nl, en] = found || ['', ''];
                Object.assign(word, { example_nl: nl, example_en: en });
                store.setExample(word.id, nl, en);
                return word;
            })
            .catch(() => word) // offline or service down: try again next time
            .finally(() => exampleRequests.delete(word.id)));
    }
    return exampleRequests.get(word.id);
}

/* ---------- Answer checking ---------- */

function normalize(s) {
    return s.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const stripArticle = (s) => s.replace(/^(de|het|een|the|a|an|to) /, '');

function variants(target) {
    const parts = target.split(/[,;/]/).map(normalize).filter(Boolean);
    parts.push(normalize(target));
    return parts;
}

function levenshtein(a, b) {
    const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let prev = dp[0];
        dp[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const tmp = dp[j];
            dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
            prev = tmp;
        }
    }
    return dp[b.length];
}

// Returns 'correct', 'almost' (typo or missing/wrong article) or 'wrong'.
function checkAnswer(given, target) {
    const g = normalize(given);
    if (!g) return 'wrong';
    const vs = variants(target);
    if (vs.includes(g)) return 'correct';
    const gs = stripArticle(g);
    const close = vs.some((v) => {
        const s = stripArticle(v);
        return s === gs || (s.length >= 4 && levenshtein(s, gs) <= 1);
    });
    return close ? 'almost' : 'wrong';
}

/* ---------- Data ---------- */

async function loadLists() {
    state.lists = store.lists();
    if (state.listId !== 'all' && !state.lists.some((l) => String(l.id) === state.listId)) {
        setList('all');
    }
    renderListSelect();
}

async function loadWords() {
    state.listWords = store.words(state.listId === 'all' ? null : Number(state.listId));
    const chapters = [...new Set(state.listWords.map((w) => w.chapter).filter(Boolean))].sort(collator.compare);
    if (state.chapter !== 'all' && !chapters.includes(state.chapter)) setChapter('all');
    state.words = state.chapter === 'all'
        ? state.listWords
        : state.listWords.filter((w) => w.chapter === state.chapter);
    renderChapterSelect(chapters);
}

function setList(id) {
    if (String(id) !== state.listId) setChapter('all');
    state.listId = String(id);
    localStorage.setItem('listId', state.listId);
}

function setChapter(chapter) {
    state.chapter = String(chapter);
    localStorage.setItem('chapter', state.chapter);
}

function renderChapterSelect(chapters) {
    const select = $('#chapter-select');
    const counts = new Map();
    for (const w of state.listWords) counts.set(w.chapter, (counts.get(w.chapter) || 0) + 1);
    select.replaceChildren(
        el('option', { value: 'all', text: 'All chapters' }),
        ...chapters.map((c) => el('option', { value: c, text: `Ch. ${c} (${counts.get(c)})` })));
    select.value = state.chapter;
    select.hidden = !chapters.length;
}

function renderListSelect() {
    const total = state.lists.reduce((s, l) => s + l.word_count, 0);
    const select = $('#list-select');
    select.replaceChildren(
        el('option', { value: 'all', text: `All lists (${total})` }),
        ...state.lists.map((l) => el('option', { value: String(l.id), text: `${l.name} (${l.word_count})` }))
    );
    select.value = state.listId;
}

function renderDirection() {
    $('#direction-btn').textContent = state.direction === 'nl-en' ? 'NL → EN' : 'EN → NL';
    $('#order-select').value = state.order;
}

function emptyState(message) {
    return el('div', { class: 'card empty' },
        el('div', { class: 'empty-icon', text: '📚' }),
        el('p', { text: message }),
        el('a', { class: 'btn primary', href: '#upload' }, 'Add words'));
}

// A word counts as learned once it has been answered right clearly more often than wrong.
const isLearned = (w) => w.correct - w.incorrect >= 2;

const progressBar = (fraction, extraClass = '') => el('div', { class: `progress ${extraClass}`.trim() },
    el('span', { style: `width:${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` }));

/* ---------- Views ---------- */

async function renderLists(view) {
    await loadLists();
    if (!state.lists.length) {
        view.append(emptyState('No vocabulary yet. Upload a PDF word list, or restore a backup below.'), backupCard());
        return;
    }
    const words = store.words();
    const stats = new Map();
    for (const w of words) {
        const s = stats.get(w.list_id) || { total: 0, learned: 0 };
        s.total++;
        if (isLearned(w)) s.learned++;
        stats.set(w.list_id, s);
    }
    const learned = words.filter(isLearned).length;

    const study = (id) => { setList(id); location.hash = '#cards'; };
    const browse = (id) => { setList(id); location.hash = '#words'; };
    const stat = (value, label) => el('div', { class: 'stat-tile' },
        el('strong', { text: String(value) }), el('span', { text: label }));

    view.append(el('section', { class: 'hero' },
        el('div', { class: 'hero-stats' },
            stat(words.length, 'words'), stat(learned, 'learned'), stat(state.lists.length, state.lists.length === 1 ? 'list' : 'lists')),
        progressBar(words.length ? learned / words.length : 0, 'light'),
        el('button', { class: 'btn hero-btn', type: 'button', onclick: () => study('all') }, 'Study all words')));

    view.append(el('h2', { class: 'section-title', text: 'Your lists' }));

    for (const list of state.lists) {
        const s = stats.get(list.id) || { total: 0, learned: 0 };
        view.append(el('div', { class: 'list-card' },
            el('div', { class: 'list-top' },
                el('div', { class: 'avatar', style: `--hue:${(list.id * 67) % 360}`, text: list.name.trim()[0]?.toUpperCase() || '?' }),
                el('div', { class: 'info' },
                    el('div', { class: 'name', text: list.name }),
                    el('div', { class: 'muted', text: `${s.learned} / ${list.word_count} learned · ${list.created_at.slice(0, 10)}` })),
                el('button', {
                    class: 'icon-btn', type: 'button', 'aria-label': `Delete ${list.name}`,
                    onclick: () => {
                        if (!confirm(`Delete "${list.name}" and all its words?`)) return;
                        try {
                            store.deleteList(list.id);
                            toast('List deleted');
                            router();
                        } catch (e) { toast(e.message); }
                    },
                }, '×')),
            progressBar(s.total ? s.learned / s.total : 0),
            el('div', { class: 'row' },
                el('button', { class: 'btn small', type: 'button', onclick: () => browse(list.id) }, 'Words'),
                el('button', { class: 'btn small primary', type: 'button', onclick: () => study(list.id) }, 'Study'))));
    }
    view.append(backupCard());
}

/* ---------- Backup ---------- */

function backupCard() {
    const fileInput = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
    fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        fileInput.value = '';
        if (!file) return;
        try {
            const backup = JSON.parse(await file.text());
            const names = (backup?.lists || []).map((l) => l?.name).filter(Boolean);
            const existing = new Set(store.lists().map((l) => l.name));
            const replaced = names.filter((n) => existing.has(n));
            if (replaced.length && !confirm(`Replace ${replaced.length === 1 ? `"${replaced[0]}"` : `${replaced.length} lists`} (including progress) with the version from the backup?`)) return;
            const { lists, words } = store.importData(backup);
            toast(`Restored ${lists} ${lists === 1 ? 'list' : 'lists'} (${words} words)`);
            setList('all');
            router();
        } catch (e) {
            toast(e instanceof SyntaxError ? 'This is not a Woordjes backup file' : e.message);
        }
    });

    return el('section', { class: 'card backup-card' },
        el('h2', { text: 'Backup & restore' }),
        el('p', { class: 'muted small-print', text: 'Your words and progress are stored only on this device. Save a backup now and then (e.g. to iCloud Drive) so you never lose them, or to move them to another phone.' }),
        el('div', { class: 'row' },
            el('button', { class: 'btn small', type: 'button', onclick: exportBackup }, 'Save backup'),
            el('button', { class: 'btn small', type: 'button', onclick: () => fileInput.click() }, 'Restore backup')),
        fileInput);
}

async function exportBackup() {
    const json = JSON.stringify(store.exportData(), null, 1);
    const name = `woordjes-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([json], name, { type: 'application/json' });
    // iPhone: the share sheet offers "Save to Files", AirDrop, etc.
    if (navigator.canShare?.({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title: 'Woordjes backup' });
            return;
        } catch (e) {
            if (e.name === 'AbortError') return;
        }
    }
    const a = el('a', { href: URL.createObjectURL(file), download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

async function renderUpload(view) {
    await loadLists();

    // --- PDF upload ---
    const fileInput = el('input', { type: 'file', accept: 'application/pdf,.pdf' });
    const status = el('p', { class: 'muted center' });
    const preview = el('section', { class: 'card', hidden: true });

    fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;
        status.textContent = `Reading ${file.name}…`;
        preview.hidden = true;
        try {
            if (file.size > 10 * 1024 * 1024) throw new Error('PDF is larger than 10 MB');
            const data = new Uint8Array(await file.arrayBuffer());
            if (new TextDecoder().decode(data.slice(0, 4)) !== '%PDF') throw new Error('File is not a valid PDF');
            const { extractPairs } = await import('./parser.js');
            let pairs;
            try {
                pairs = await extractPairs(data);
            } catch {
                throw new Error('Could not read this PDF');
            }
            if (!pairs.length) {
                throw new Error("No word pairs found. Use one pair per line, e.g. 'de hond - the dog' or a two-column table. Scanned (image-only) PDFs are not supported.");
            }
            const name = file.name.replace(/\.pdf$/i, '').trim().slice(0, 100) || 'Vocabulary';
            status.textContent = `Found ${pairs.length} word pairs. Review them below.`;
            showPreview({ suggested_name: name, pairs });
        } catch (e) {
            status.textContent = e.message;
        } finally {
            fileInput.value = '';
        }
    });

    function showPreview({ suggested_name: name, pairs }) {
        const nameInput = el('input', { type: 'text', value: name, maxlength: '100', 'aria-label': 'List name' });
        const hasChapters = pairs.some((p) => p.chapter);
        const rowClass = `preview-row${hasChapters ? ' with-chapter' : ''}`;
        const rows = el('div');
        const makeRow = (p) => el('div', { class: rowClass },
            el('input', { type: 'checkbox', checked: true, 'aria-label': 'Include' }),
            el('input', { type: 'text', value: p.dutch, maxlength: '200', 'aria-label': 'Dutch' }),
            el('input', { type: 'text', value: p.english, maxlength: '200', 'aria-label': 'English' }),
            hasChapters ? el('input', { type: 'text', value: p.chapter || '', maxlength: '20', 'aria-label': 'Chapter' }) : null);
        rows.append(...pairs.map(makeRow));

        const swap = () => {
            for (const row of rows.children) {
                const [, a, b] = row.querySelectorAll('input');
                [a.value, b.value] = [b.value, a.value];
            }
        };
        const toggleAll = () => {
            const boxes = [...rows.querySelectorAll('input[type="checkbox"]')];
            const allOn = boxes.every((b) => b.checked);
            boxes.forEach((b) => { b.checked = !allOn; });
        };
        const save = async (e) => {
            const btn = e.currentTarget;
            const selected = [...rows.children]
                .map((row) => row.querySelectorAll('input'))
                .filter(([box, nl, en]) => box.checked && nl.value.trim() && en.value.trim())
                .map(([, nl, en, ch]) => ({ dutch: nl.value.trim(), english: en.value.trim(), chapter: ch?.value.trim() || null }));
            if (!nameInput.value.trim()) return toast('Please enter a list name');
            if (!selected.length) return toast('No words selected');
            btn.disabled = true;
            try {
                const list = store.createList(nameInput.value.trim(), selected);
                toast(`Saved ${list.word_count} words`);
                setList(list.id);
                location.hash = '#words';
            } catch (err) {
                toast(err.message);
                btn.disabled = false;
            }
        };

        preview.replaceChildren(
            el('h2', { text: 'Review words' }),
            el('div', { class: 'stack' },
                nameInput,
                el('div', { class: 'row' },
                    el('button', { class: 'btn small', type: 'button', onclick: swap }, 'Swap columns'),
                    el('button', { class: 'btn small', type: 'button', onclick: toggleAll }, 'Toggle all'))),
            el('div', { class: rowClass + ' preview-head' }, el('span'), el('span', { text: 'Dutch' }), el('span', { text: 'English' }),
                hasChapters ? el('span', { text: 'Ch.' }) : null),
            rows,
            el('div', { style: 'margin-top:16px' },
                el('button', { class: 'btn primary', type: 'button', onclick: save }, 'Save list')));
        preview.hidden = false;
    }

    view.append(
        el('section', { class: 'card' },
            el('h2', { text: 'Upload a PDF word list' }),
            el('label', { class: 'file-drop' },
                el('strong', { text: 'Choose PDF' }),
                'One pair per line, e.g. "de hond – the dog", or a two-column table.',
                fileInput),
            status),
        preview,
        renderManualAdd());
}

function renderManualAdd() {
    const listSelect = el('select', { 'aria-label': 'List' },
        ...state.lists.map((l) => el('option', { value: String(l.id), text: l.name })),
        el('option', { value: 'new', text: '+ New list…' }));
    if (state.lists.some((l) => String(l.id) === state.listId)) listSelect.value = state.listId;
    const newName = el('input', { type: 'text', placeholder: 'New list name', maxlength: '100' });
    const nl = el('input', { type: 'text', placeholder: 'Dutch (e.g. de hond)', maxlength: '200', autocapitalize: 'off' });
    const en = el('input', { type: 'text', placeholder: 'English (e.g. the dog)', maxlength: '200', autocapitalize: 'off' });
    const ch = el('input', { type: 'text', placeholder: 'Chapter (optional)', maxlength: '20', autocapitalize: 'off' });
    const syncNew = () => { newName.hidden = listSelect.value !== 'new'; };
    listSelect.addEventListener('change', syncNew);
    syncNew();

    const form = el('form', { class: 'stack' }, listSelect, newName, nl, en, ch,
        el('button', { class: 'btn primary', type: 'submit' }, 'Add word'));

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pair = { dutch: nl.value.trim(), english: en.value.trim(), chapter: ch.value.trim() || null };
        if (!pair.dutch || !pair.english) return toast('Enter both Dutch and English');
        try {
            if (listSelect.value === 'new') {
                const name = newName.value.trim();
                if (!name) return toast('Enter a list name');
                const list = store.createList(name, [pair]);
                setList(list.id);
                await loadLists();
                listSelect.prepend(el('option', { value: String(list.id), text: list.name }));
                listSelect.value = String(list.id);
                newName.value = '';
                syncNew();
            } else {
                store.addWord(Number(listSelect.value), pair);
            }
            toast(`Added "${pair.dutch}"`);
            nl.value = '';
            en.value = '';
            nl.focus();
        } catch (err) { toast(err.message); }
    });

    return el('section', { class: 'card' }, el('h2', { text: 'Add a word manually' }), form);
}

async function renderWords(view) {
    await loadLists();
    await loadWords();
    if (!state.words.length) {
        view.append(emptyState('This list has no words yet.'));
        return;
    }
    const search = el('input', { type: 'search', placeholder: 'Search…', autocapitalize: 'off' });
    const container = el('div');
    const count = el('h2');
    // Shuffling a word list isn't useful to browse, so Random shows it sequentially here.
    let words = orderWords(state.words, state.order === 'random' ? 'seq' : state.order);

    const draw = () => {
        const q = normalize(search.value);
        const shown = q
            ? words.filter((w) => normalize(w.dutch).includes(q) || normalize(w.english).includes(q))
            : words;
        count.textContent = `${shown.length} words`;
        container.replaceChildren(...shown.map((w) => el('div', { class: 'word-row' },
            speakButton(() => w.dutch, 'small'),
            el('div', { class: 'texts' },
                el('span', { class: 'nl', text: w.dutch }),
                el('span', { class: 'en', text: w.english })),
            w.chapter ? el('span', { class: 'chapter-tag', title: `Chapter ${w.chapter}`, text: `Ch ${w.chapter}` }) : null,
            el('span', { class: `dot ${isLearned(w) ? 'learned' : w.incorrect > w.correct ? 'weak' : ''}`, title: `${w.correct} right · ${w.incorrect} wrong` }),
            el('button', {
                class: 'icon-btn', type: 'button', 'aria-label': `Delete ${w.dutch}`,
                onclick: () => {
                    try {
                        store.deleteWord(w.id);
                        words = words.filter((x) => x.id !== w.id);
                        draw();
                    } catch (e) { toast(e.message); }
                },
            }, '×'))));
    };
    search.addEventListener('input', draw);
    draw();
    view.append(el('section', { class: 'card' }, count, search, el('div', { style: 'margin-top:8px' }, container)));
}

async function renderCards(view) {
    await loadLists();
    await loadWords();
    if (!state.words.length) {
        view.append(emptyState('No words to study yet.'));
        return;
    }

    let deck = orderWords(state.words);
    let index = 0;
    let missed = [];

    const langLabel = (dutch) => (dutch ? 'Nederlands' : 'English');
    const frontLabel = el('span', { class: 'face-label' });
    const backLabel = el('span', { class: 'face-label' });
    const frontWord = el('span', { class: 'face-word' });
    const backWord = el('span', { class: 'face-word' });
    const exampleNl = el('span', { class: 'example-nl', lang: 'nl' });
    const exampleEn = el('span', { class: 'example-en' });
    const backExample = el('div', { class: 'face-example', hidden: true }, exampleNl, exampleEn);
    const front = el('div', { class: 'face front' }, frontLabel, frontWord);
    const back = el('div', { class: 'face back' }, backLabel, backWord, backExample);
    let backWordId = null;
    const renderExample = (w) => {
        if (w.id !== backWordId) return; // the card moved on meanwhile
        exampleNl.textContent = w.example_nl || '';
        exampleEn.textContent = w.example_en || '';
        backExample.hidden = !w.example_nl;
    };
    const isFlipped = () => card.classList.contains('flipped');
    // In EN → NL mode the speaker would give the answer away, so it appears after flipping.
    const syncSpeaker = () => { cardSpeaker.hidden = state.direction === 'en-nl' && !isFlipped(); };
    const flip = () => {
        card.classList.toggle('flipped');
        syncSpeaker();
        speak(deck[index].dutch, cardSpeaker);
    };
    const card = el('div', {
        class: 'flashcard', role: 'button', tabindex: '0', 'aria-label': 'Flip card',
        onclick: flip,
        onkeydown: (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } },
    }, el('div', { class: 'flashcard-inner' }, front, back));
    const cardSpeaker = speakButton(() => deck[index].dutch, 'on-card');
    const progress = el('div', { class: 'progress' }, el('span'));
    const counter = el('span', { class: 'muted' });
    const study = el('div', {},
        el('div', { class: 'progress-head' }, progress, counter),
        el('div', { class: 'flashcard-wrap' }, card, cardSpeaker),
        el('p', { class: 'hint', text: 'Tap the card to flip it' }),
        el('div', { class: 'row' },
            el('button', { class: 'btn danger-soft', type: 'button', onclick: () => next(false) }, '✗  Still learning'),
            el('button', { class: 'btn success', type: 'button', onclick: () => next(true) }, '✓  Know it')));
    const summary = el('div', { class: 'card center summary', hidden: true });

    function show() {
        const w = deck[index];
        const wasFlipped = isFlipped();
        const nlFirst = state.direction === 'nl-en';
        card.classList.remove('flipped');
        syncSpeaker();
        frontLabel.textContent = langLabel(nlFirst);
        frontWord.textContent = promptOf(w);
        // Delay the back so the next answer isn't visible while the card flips back.
        setTimeout(() => {
            backLabel.textContent = langLabel(!nlFirst);
            backWord.textContent = answerOf(w);
            backWordId = w.id;
            renderExample(w);
        }, wasFlipped ? 250 : 0);
        loadExample(w).then(renderExample);
        counter.textContent = `${index + 1} / ${deck.length}`;
        progress.firstChild.style.width = `${(index / deck.length) * 100}%`;
        if (nlFirst) speak(w.dutch, cardSpeaker);
        if (deck[index + 1]) loadExample(deck[index + 1]);
    }

    function next(known) {
        const w = deck[index];
        recordResult(w, known);
        if (!known) missed.push(w);
        index++;
        if (index < deck.length) return show();
        finish();
    }

    function finish() {
        stopSpeaking();
        study.hidden = true;
        const knew = deck.length - missed.length;
        const pct = Math.round((knew / deck.length) * 100);
        summary.replaceChildren(
            el('div', { class: 'ring', style: `--p:${pct}` }, el('span', { text: `${pct}%` })),
            el('h2', { text: pct === 100 ? 'Perfect! Goed gedaan!' : 'Round complete!' }),
            el('p', { class: 'muted', text: `You knew ${knew} of ${deck.length} words.` }),
            el('div', { class: 'stack' },
                missed.length ? el('button', { class: 'btn primary', type: 'button', onclick: () => restart(missed) }, `Practice ${missed.length} missed`) : null,
                el('button', { class: 'btn', type: 'button', onclick: () => restart(state.words) }, 'Start over')));
        summary.hidden = false;
    }

    function restart(words) {
        deck = orderWords(words);
        index = 0;
        missed = [];
        summary.hidden = true;
        study.hidden = false;
        show();
    }

    view.append(study, summary);
    show();
}

function scoreline() {
    const scoreEl = el('span', { class: 'pill' });
    const streakEl = el('span', { class: 'pill streak' });
    const node = el('div', { class: 'scoreline' }, scoreEl, streakEl);
    let correct = 0;
    let total = 0;
    let streak = 0;
    const update = () => {
        scoreEl.textContent = `✓ ${correct} / ${total}`;
        streakEl.textContent = `🔥 ${streak} in a row`;
        streakEl.hidden = streak < 2;
    };
    update();
    return {
        node,
        add(ok) { total++; if (ok) { correct++; streak++; } else streak = 0; update(); },
    };
}

// The question with its language label and a speaker for the Dutch word.
function promptBox() {
    let word = null;
    const label = el('span', { class: 'face-label' });
    const text = el('div', { class: 'prompt' });
    const speaker = speakButton(() => word.dutch, 'on-prompt');
    return {
        node: el('div', { class: 'prompt-box' }, label, text, speaker),
        speaker,
        set(w) {
            word = w;
            const nlFirst = state.direction === 'nl-en';
            label.textContent = nlFirst ? 'Nederlands' : 'English';
            text.textContent = promptOf(w);
            speaker.hidden = !nlFirst; // hidden until answered in EN → NL mode
            if (nlFirst) speak(w.dutch, speaker);
        },
        answered() {
            speaker.hidden = false;
            if (state.direction === 'en-nl') speak(word.dutch, speaker);
        },
    };
}

async function renderMC(view) {
    await loadLists();
    await loadWords();
    if (!state.words.length || state.listWords.length < 2) {
        view.append(emptyState('Multiple choice needs at least 2 words.'));
        return;
    }

    const score = scoreline();
    const prompt = promptBox();
    const options = el('div', { class: 'options' });
    const feedback = el('p', { class: 'feedback' });
    const nextBtn = el('button', { class: 'btn primary', type: 'button', hidden: true, onclick: ask }, 'Next →');
    const nextWord = wordPicker(state.words);
    // Small chapters borrow wrong answers from the rest of the list.
    const distractorPool = state.words.length >= 4 ? state.words : state.listWords;

    function ask() {
        const word = nextWord();
        const answer = answerOf(word);
        const distractors = shuffle([...new Set(
            distractorPool.filter((w) => w.id !== word.id).map(answerOf)
        )].filter((a) => normalize(a) !== normalize(answer))).slice(0, 3);

        prompt.set(word);
        feedback.textContent = '';
        feedback.className = 'feedback';
        nextBtn.hidden = true;

        options.replaceChildren(...shuffle([answer, ...distractors]).map((choice, i) => el('button', {
            class: 'option', type: 'button', 'data-correct': choice === answer ? '1' : null,
            onclick: (e) => {
                const ok = choice === answer;
                for (const b of options.children) {
                    b.disabled = true;
                    if (b.dataset.correct) b.classList.add('correct');
                }
                if (!ok) e.currentTarget.classList.add('wrong');
                feedback.textContent = ok ? 'Goed zo! Correct.' : `Correct answer: ${answer}`;
                feedback.className = `feedback ${ok ? 'ok' : 'bad'}`;
                score.add(ok);
                recordResult(word, ok);
                prompt.answered();
                nextBtn.hidden = false;
            },
        }, el('span', { class: 'letter', text: 'ABCD'[i] }), el('span', { text: choice }))));
    }

    view.append(el('section', { class: 'card quiz' }, score.node, prompt.node, options, feedback, nextBtn));
    ask();
}

async function renderTyping(view) {
    await loadLists();
    await loadWords();
    if (!state.words.length) {
        view.append(emptyState('No words to practise yet.'));
        return;
    }

    const score = scoreline();
    const prompt = promptBox();
    const input = el('input', {
        type: 'text', class: 'answer-input', autocomplete: 'off', autocorrect: 'off',
        autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'go',
        'aria-label': 'Your answer',
    });
    const feedback = el('p', { class: 'feedback' });
    const submitBtn = el('button', { class: 'btn primary', type: 'submit' }, 'Check');
    const skipBtn = el('button', { class: 'btn', type: 'button', onclick: () => reveal('wrong', true) }, 'Show answer');
    let word = null;
    let answered = false;
    const nextWord = wordPicker(state.words);

    function ask() {
        word = nextWord();
        answered = false;
        prompt.set(word);
        input.value = '';
        input.className = 'answer-input';
        input.readOnly = false;
        input.placeholder = state.direction === 'nl-en' ? 'Type the English…' : 'Type the Dutch…';
        feedback.textContent = '';
        feedback.className = 'feedback';
        submitBtn.textContent = 'Check';
        skipBtn.hidden = false;
        input.focus();
    }

    function reveal(result, skipped = false) {
        const answer = answerOf(word);
        const ok = result !== 'wrong';
        answered = true;
        input.readOnly = true;
        input.className = `answer-input ${ok ? 'ok' : 'bad'}`;
        if (result === 'correct') feedback.textContent = 'Goed zo! Correct.';
        else if (result === 'almost') feedback.textContent = `Almost! Exact answer: ${answer}`;
        else feedback.textContent = skipped ? `Answer: ${answer}` : `Wrong. Correct answer: ${answer}`;
        feedback.className = `feedback ${ok ? 'ok' : 'bad'}`;
        score.add(ok);
        recordResult(word, ok);
        prompt.answered();
        submitBtn.textContent = 'Next →';
        skipBtn.hidden = true;
        submitBtn.focus();
    }

    const form = el('form', { class: 'stack' }, input, el('div', { class: 'row' }, skipBtn, submitBtn));
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (answered) return ask();
        if (!input.value.trim()) return;
        reveal(checkAnswer(input.value, answerOf(word)));
    });

    view.append(el('section', { class: 'card quiz' }, score.node, prompt.node, form, feedback));
    ask();
}

/* ---------- Router ---------- */

const routes = {
    lists: { title: 'Woordjes', render: renderLists },
    upload: { title: 'Add words', render: renderUpload },
    words: { title: 'Words', render: renderWords, study: true },
    cards: { title: 'Flashcards', render: renderCards, study: true },
    mc: { title: 'Multiple choice', render: renderMC, study: true },
    type: { title: 'Typing quiz', render: renderTyping, study: true },
};

let renderToken = 0;

async function router() {
    const name = routes[location.hash.slice(1)] ? location.hash.slice(1) : 'lists';
    const route = routes[name];
    const token = ++renderToken;
    stopSpeaking();

    document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === name));
    $('#title').textContent = route.title;
    $('#study-bar').hidden = !route.study;
    renderDirection();

    const container = el('div');
    try {
        await route.render(container);
    } catch (e) {
        container.replaceChildren(el('div', { class: 'card error', text: e.message }));
    }
    if (token !== renderToken) return; // a newer navigation started meanwhile
    $('#view').replaceChildren(container);
    window.scrollTo(0, 0);
}

$('#list-select').addEventListener('change', (e) => {
    setList(e.target.value);
    router();
});

$('#direction-btn').addEventListener('click', () => {
    state.direction = state.direction === 'nl-en' ? 'en-nl' : 'nl-en';
    localStorage.setItem('direction', state.direction);
    router();
});

$('#order-select').addEventListener('change', (e) => {
    state.order = e.target.value;
    localStorage.setItem('order', state.order);
    router();
});

$('#chapter-select').addEventListener('change', (e) => {
    setChapter(e.target.value);
    router();
});

window.addEventListener('hashchange', router);
router();

// Ask the browser not to clear this app's data when storage runs low.
navigator.storage?.persist?.().catch(() => { });

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => { }));
}
