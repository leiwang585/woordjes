// Extract Dutch-English word pairs from vocabulary-list PDFs, entirely in the browser.
// Port of the original Python parser. Supported line formats (one pair per line), e.g.:
//   de hond - the dog      de hond = the dog      de hond : the dog
//   de hond | the dog      de hond <TAB> the dog  de hond      the dog (table columns)
//   1. de hond – the dog   • de hond -> the dog
// An optional trailing chapter number in its own column is kept: "de hond    the dog    4".

const MAX_FIELD_LEN = 120;
const MAX_FIELD_WORDS = 12;

const PREFIX = /^\s*(?:\d{1,4}\s*[.)]\s*|\d{1,4}\s+|[-•*·▪●◦]\s+)/u;

// Tried in order; the first separator that yields two valid parts wins.
const SEPARATORS = [
    /\t+/u,
    /\s*(?:=>|->|→|=|\|)\s*/u,
    /\s+[-–—]+\s+|\s*[–—]\s*/u,
    /\s*[:;]\s+/u,
    /\s{2,}/u,
];

const HEADER_WORDS = new Set([
    'dutch', 'english', 'nederlands', 'engels', 'woord', 'woorden', 'word', 'words',
    'vertaling', 'translation', 'nl', 'en', 'betekenis', 'meaning',
]);

const LETTER = /\p{L}/u;
const CHAPTER = /^(.*\S)(?:\t|\s{2,})(\d{1,3})\s*$/u;

const trimChars = (s) => s.replace(/^[ \t.,]+|[ \t.,]+$/g, '');

const valid = (part) => LETTER.test(part)
    && part.length <= MAX_FIELD_LEN
    && part.split(/\s+/).filter(Boolean).length <= MAX_FIELD_WORDS;

function splitLine(line) {
    const text = line.trim().replace(PREFIX, '').trim();
    if (!text) return null;
    for (const sep of SEPARATORS) {
        const parts = text.split(sep).map(trimChars).filter(Boolean);
        if (parts.length >= 2 && valid(parts[0]) && valid(parts[1])) return [parts[0], parts[1]];
    }
    return null;
}

function splitChapter(line) {
    const m = CHAPTER.exec(line);
    if (m && splitLine(m[1])) return [m[1], m[2]];
    return [line, null];
}

function englishFirst(line) {
    const low = line.toLowerCase();
    const first = (...words) => {
        const found = words.map((w) => low.indexOf(w)).filter((i) => i >= 0);
        return found.length ? Math.min(...found) : -1;
    };
    const en = first('english', 'engels');
    const nl = first('dutch', 'nederlands');
    return en >= 0 && nl >= 0 ? en < nl : null;
}

export function parseText(text) {
    const pairs = [];
    const seen = new Set();
    let swap = false;
    for (const raw of text.split(/\r?\n/)) {
        const [line, chapter] = splitChapter(raw);
        const result = splitLine(line);
        if (!result) continue;
        const [a, b] = result;
        if (HEADER_WORDS.has(a.toLowerCase()) && HEADER_WORDS.has(b.toLowerCase())) {
            const order = englishFirst(raw);
            if (order !== null) swap = order;
            continue;
        }
        const key = `${a.toLowerCase()}\u0000${b.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push([a, b, chapter]);
    }
    return pairs.map(([a, b, chapter]) => {
        const pair = swap ? { dutch: b, english: a } : { dutch: a, english: b };
        if (chapter) pair.chapter = chapter;
        return pair;
    });
}

// Rebuild text lines from positioned text items. With `columns`, wide horizontal gaps
// become tabs so table columns stay apart (like pypdf's layout mode).
function pageText(items, columns) {
    const rows = [];
    for (const item of items) {
        if (!item.str) continue;
        const [, , , d, x, y] = item.transform;
        const size = Math.abs(d) || item.height || 10;
        let row = rows.find((r) => Math.abs(r.y - y) <= size * 0.4);
        if (!row) rows.push((row = { y, items: [] }));
        row.items.push({ x, end: x + item.width, str: item.str, size });
    }
    rows.sort((a, b) => b.y - a.y);
    return rows.map((row) => {
        row.items.sort((a, b) => a.x - b.x);
        let line = '';
        let prev = null;
        for (const it of row.items) {
            if (prev) {
                const gap = it.x - prev.end;
                if (columns && gap > it.size * 1.2) line += '\t';
                else if (gap > it.size * 0.15 && !/\s$/.test(line) && !/^\s/.test(it.str)) line += ' ';
            }
            line += it.str;
            prev = it;
        }
        return line;
    }).join('\n');
}

let pdfjsPromise;
function loadPdfjs() {
    if (!pdfjsPromise) {
        const base = new URL('./vendor/pdfjs/', import.meta.url);
        pdfjsPromise = import(new URL('pdf.min.mjs', base).href).then((pdfjs) => {
            pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', base).href;
            return pdfjs;
        });
    }
    return pdfjsPromise;
}

export async function extractPairs(data, pdfjs) {
    pdfjs = pdfjs || await loadPdfjs();
    const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        pages.push((await page.getTextContent()).items);
    }
    await doc.destroy();
    // Try column-aware and plain text; keep whichever finds more pairs.
    let best = [];
    for (const columns of [true, false]) {
        const pairs = parseText(pages.map((items) => pageText(items, columns)).join('\n'));
        if (pairs.length > best.length) best = pairs;
    }
    return best;
}
