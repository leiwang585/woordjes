'use strict';

/* Cartoon pictures for the back of flashcards (Basic 100 words, and the same words in other lists).
   Colors and shapes are drawn here as SVG, numbers 0–10 as dots, the rest are emoji. */

const pictureFor = (() => {
    const INK = '#2d2d2d';
    const svg = (body, viewBox = '0 0 100 100', cls = '') =>
        `<svg class="pic-svg ${cls}" viewBox="${viewBox}" aria-hidden="true" stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;

    // A friendly face: eyes with a shine, rosy cheeks and a smile, centred on (x, y).
    const face = (x, y, s = 1, eye = INK) => {
        const e = (dx) => `<circle cx="${x + dx * s}" cy="${y - 3 * s}" r="${3.4 * s}" fill="${eye}" stroke="none"/>`
            + `<circle cx="${x + dx * s + 1.1 * s}" cy="${y - 4.2 * s}" r="${1.1 * s}" fill="#fff" stroke="none"/>`;
        const cheek = (dx) => `<circle cx="${x + dx * s}" cy="${y + 4 * s}" r="${3 * s}" fill="#ff8a80" opacity=".55" stroke="none"/>`;
        return e(-8) + e(8) + cheek(-14) + cheek(14)
            + `<path d="M${x - 6 * s} ${y + 4 * s} Q${x} ${y + 10 * s} ${x + 6 * s} ${y + 4 * s}" fill="none" stroke="${eye}" stroke-width="${2.6 * s}"/>`;
    };

    const blob = (fill, eye = INK) => svg(
        `<path d="M50 9C71 8 91 24 89 47C87 71 73 91 50 90C27 89 10 73 11 49C12 25 29 10 50 9Z" fill="${fill}"/>`
        + `<circle cx="88" cy="83" r="5" fill="${fill}"/><circle cx="13" cy="17" r="4" fill="${fill}"/>`
        + face(50, 50, 1.1, eye));

    const shape = (body, fill, fx, fy, s = 1) => svg(body.replace('/>', ` fill="${fill}"/>`) + face(fx, fy, s));

    const PICTURES = {
        // Colors
        rood: blob('#e53935'), oranje: blob('#fb8c00'), geel: blob('#fdd835'), groen: blob('#43a047'),
        blauw: blob('#1e88e5'), paars: blob('#8e24aa'), roze: blob('#f48fb1'), bruin: blob('#8d6e63'),
        zwart: blob('#212121', '#fff'), wit: blob('#ffffff'),

        // Shapes
        'de cirkel': shape('<circle cx="50" cy="50" r="40"/>', '#4fc3f7', 50, 52),
        'het vierkant': shape('<rect x="13" y="13" width="74" height="74" rx="4"/>', '#ffb74d', 50, 52),
        'de driehoek': shape('<polygon points="50,10 92,86 8,86"/>', '#81c784', 50, 64, 0.85),
        'de rechthoek': shape('<rect x="5" y="25" width="90" height="50" rx="4"/>', '#ba68c8', 50, 52),
        'het ovaal': shape('<ellipse cx="50" cy="50" rx="45" ry="31"/>', '#f06292', 50, 52),
        'de ruit': shape('<polygon points="50,5 90,50 50,95 10,50"/>', '#4db6ac', 50, 52, 0.85),
        'de vijfhoek': shape('<polygon points="50,10 91.8,40.4 75.9,89.6 24.1,89.6 8.2,40.4"/>', '#ffd54f', 50, 58),
        'de zeshoek': shape('<polygon points="93,50 71.5,87.2 28.5,87.2 7,50 28.5,12.8 71.5,12.8"/>', '#7986cb', 50, 52),
        'de ster': shape('<polygon points="50,8 61.2,38.6 92.8,40.4 68.1,59.9 76.5,90.6 50,73 23.5,90.6 31.9,59.9 7.2,40.4 38.8,38.6"/>', '#ffca28', 50, 56, 0.7),
        'het hart': shape('<path d="M50 89C21 67 6 50 6 32C6 18 17 8 30 8C39 8 46 13 50 21C54 13 61 8 70 8C83 8 94 18 94 32C94 50 79 67 50 89Z"/>', '#ef5350', 50, 40, 0.9),

        // Playground
        'de speeltuin': '🛝',
        'de schommel': svg('<path d="M14 14L4 93M14 14L26 93M86 14L74 93M86 14L96 93" fill="none" stroke="#8d6e63" stroke-width="5"/>'
            + '<path d="M10 14H90" stroke="#6d4c41" stroke-width="6"/>'
            + '<path d="M40 14V68M60 14V68" stroke="#555" stroke-width="2.5"/>'
            + '<rect x="33" y="66" width="34" height="8" rx="2" fill="#ef5350"/>'),
        'de glijbaan': svg('<path d="M4 94H96" stroke="#8d6e63"/>'
            + '<path d="M14 30V93M28 30V93M14 46H28M14 60H28M14 74H28M14 88H28" fill="none" stroke="#1e88e5" stroke-width="4"/>'
            + '<rect x="10" y="24" width="32" height="8" rx="2" fill="#ffca28"/>'
            + '<path d="M38 26H46C60 26 66 44 74 62C80 76 84 82 94 82V92C80 92 74 84 66 66C60 50 56 36 38 36Z" fill="#ef5350"/>'),
        'de wip': svg('<path d="M4 89H96" stroke="#8d6e63"/>'
            + '<polygon points="50,62 38,88 62,88" fill="#ffca28"/>'
            + '<path d="M8 74L92 50" stroke="#1e88e5" stroke-width="9"/>'
            + '<path d="M18 71V60M82 53V42" stroke="#555" stroke-width="4"/>'),
        'de zandbak': svg('<rect x="7" y="60" width="86" height="30" rx="3" fill="#a1887f"/>'
            + '<path d="M13 61Q30 42 50 53Q68 40 87 61Z" fill="#ffe082"/>'
            + '<polygon points="61,40 79,40 76,58 64,58" fill="#29b6f6"/><path d="M61 40Q70 27 79 40" fill="none"/>'
            + '<path d="M27 28L35 50" stroke="#8d6e63"/><polygon points="31,48 39,46 42,57 34,59" fill="#ef5350"/>'),
        'het klimrek': svg('<polygon points="10,24 50,6 90,24" fill="#ef5350"/>'
            + '<path d="M16 24V92M84 24V92M39 24V92M61 24V92M16 46H84M16 69H84" fill="none" stroke="#43a047" stroke-width="5"/>'
            + '<path d="M4 93H96" stroke="#8d6e63"/>'),
        'de draaimolen': '🎠',
        'de trampoline': svg('<path d="M20 62L15 92M80 62L85 92M50 70V93" stroke="#555" stroke-width="4"/>'
            + '<ellipse cx="50" cy="60" rx="43" ry="13" fill="#37474f" stroke="#1e88e5" stroke-width="6"/>'
            + '<circle cx="50" cy="22" r="10" fill="#ef5350"/><path d="M30 18Q34 30 30 40M70 18Q66 30 70 40" fill="none" stroke="#999" stroke-width="2.5"/>'),
        'de bal': '⚽',
        'het bankje': svg('<rect x="16" y="26" width="6" height="64" rx="1" fill="#6d4c41"/><rect x="78" y="26" width="6" height="64" rx="1" fill="#6d4c41"/>'
            + '<rect x="8" y="26" width="84" height="8" rx="2" fill="#a1887f"/><rect x="8" y="38" width="84" height="8" rx="2" fill="#a1887f"/>'
            + '<rect x="6" y="54" width="88" height="10" rx="2" fill="#a1887f"/>'),

        // Animals
        'de hond': '🐶', 'de kat': '🐱', 'het paard': '🐴', 'de koe': '🐮', 'het varken': '🐷', 'het schaap': '🐑',
        'de kip': '🐔', 'de eend': '🦆', 'het konijn': '🐰', 'de muis': '🐭', 'de vogel': '🐦', 'de vis': '🐟',
        'de olifant': '🐘', 'de leeuw': '🦁', 'de tijger': '🐯', 'de beer': '🐻', 'de aap': '🐵', 'de giraf': '🦒',
        'de kikker': '🐸', 'de schildpad': '🐢', 'de vlinder': '🦋',

        // Household
        'het huis': '🏠', 'de deur': '🚪', 'het raam': '🪟',
        'de tafel': svg('<rect x="6" y="34" width="88" height="11" rx="3" fill="#a1887f"/>'
            + '<rect x="14" y="45" width="8" height="46" rx="2" fill="#8d6e63"/><rect x="78" y="45" width="8" height="46" rx="2" fill="#8d6e63"/>'
            + '<circle cx="62" cy="26" r="7" fill="#e53935"/><path d="M62 19Q64 13 69 12" fill="none" stroke-width="2.5"/>'),
        'de stoel': '🪑', 'het bed': '🛏️', 'de bank': '🛋️',
        'de kast': svg('<rect x="14" y="6" width="72" height="7" rx="2" fill="#8d6e63"/>'
            + '<rect x="18" y="13" width="64" height="76" rx="3" fill="#bcaaa4"/><path d="M50 13V89"/>'
            + '<circle cx="44" cy="52" r="3" fill="' + INK + '"/><circle cx="56" cy="52" r="3" fill="' + INK + '"/>'
            + '<rect x="22" y="89" width="7" height="6" fill="#6d4c41"/><rect x="71" y="89" width="7" height="6" fill="#6d4c41"/>'),
        'de spiegel': '🪞', 'de keuken': '🍳', 'de badkamer': '🛁', 'de lamp': '💡', 'het bord': '🍽️', 'het kopje': '☕',
        'de lepel': '🥄', 'de vork': '🍴', 'het mes': '🔪', 'de klok': '⏰', 'de televisie': '📺', 'het toilet': '🚽',
        'de sleutel': '🔑',

        // Food & drink
        'het brood': '🍞', 'de kaas': '🧀', 'de boter': '🧈', 'het ei': '🥚', 'de appel': '🍎', 'de banaan': '🍌',
        'de aardbei': '🍓', 'de melk': '🥛', 'het sap': '🧃', 'het water': '💧',
        'de peer': '🍐', 'de druif': '🍇', 'de wortel': '🥕', 'de tomaat': '🍅', 'het koekje': '🍪', 'het ijsje': '🍦',
        'de thee': '🍵',
    };

    const NUMBERS = {
        nul: 0, 'één': 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7, acht: 8, negen: 9, tien: 10,
    };

    // Ten-frame: two rows of five, with n of them filled.
    const tenFrame = (n) => {
        let dots = '';
        for (let i = 0; i < 10; i++) {
            const x = 11.6 + (i % 5) * 19.2;
            const y = i < 5 ? 12 : 32;
            dots += i < n
                ? `<circle cx="${x}" cy="${y}" r="7" fill="#ff7043" stroke-width="2"/>`
                : `<circle cx="${x}" cy="${y}" r="7" fill="none" stroke="#ddd" stroke-width="2"/>`;
        }
        return svg(`<rect x="2" y="2" width="96" height="40" rx="6" fill="#fff" stroke-width="2.5"/>${dots}`, '0 0 100 44', 'pic-frame');
    };

    // 'hond, de' and 'De hond' both become 'de hond'.
    const key = (dutch) => {
        let k = dutch.toLowerCase().replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
        const m = k.match(/^(.+?),\s*(de|het)$/);
        if (m) k = `${m[2]} ${m[1]}`;
        return k;
    };

    // Returns trusted HTML for the word's picture, or '' when there is none.
    return (dutch) => {
        const k = key(dutch);
        if (k in NUMBERS) return tenFrame(NUMBERS[k]);
        const pic = PICTURES[k];
        if (!pic) return '';
        return pic.startsWith('<') ? pic : `<span class="pic-emoji">${pic}</span>`;
    };
})();
