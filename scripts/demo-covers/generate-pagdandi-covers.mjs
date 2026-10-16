#!/usr/bin/env node
/**
 * Generates the book covers (and a few other drawn images) for the Pagdandi
 * Books & Café demo shop, as small typographic SVGs, and writes them to
 * `packages/database/src/seed/showcase/pagdandi-covers.ts` as base64
 * `data:image/svg+xml` addresses keyed by product slug.
 *
 * Every cover is drawn here from a title, an author, a palette and a simple
 * geometric motif — no publisher's logo, no copy of a real cover. The book
 * list below must stay in step with `pagdandi-catalog.ts`.
 *
 *   node scripts/demo-covers/generate-pagdandi-covers.mjs [--svg-dir <dir>]
 *
 * `--svg-dir` also writes each SVG to that folder, to look at them.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "packages/database/src/seed/showcase/pagdandi-covers.ts");

/**
 * genre: indian | russian | english | poetry | children | local
 * motif: one of MOTIFS below. sub: an optional line under the title.
 */
export const BOOKS = [
    // Premchand
    { slug: "godaan", title: "Godaan", author: "Premchand", genre: "indian", motif: "fields" },
    { slug: "nirmala", title: "Nirmala", author: "Premchand", genre: "indian", motif: "diya" },
    { slug: "gaban", title: "Gaban", author: "Premchand", genre: "indian", motif: "ring" },
    { slug: "idgah-and-other-stories", title: "Idgah", sub: "and other stories", author: "Premchand", genre: "indian", motif: "moon" },
    { slug: "kafan-and-other-stories", title: "Kafan", sub: "and other stories", author: "Premchand", genre: "indian", motif: "lines" },
    // Tagore
    { slug: "gitanjali", title: "Gitanjali", sub: "Song Offerings", author: "Rabindranath Tagore", genre: "poetry", motif: "sun" },
    { slug: "the-home-and-the-world", title: "The Home and the World", author: "Rabindranath Tagore", genre: "indian", motif: "arch" },
    { slug: "gora", title: "Gora", author: "Rabindranath Tagore", genre: "indian", motif: "leaf" },
    { slug: "kabuliwala-and-other-stories", title: "Kabuliwala", sub: "and other stories", author: "Rabindranath Tagore", genre: "indian", motif: "mountains" },
    { slug: "the-post-office", title: "The Post Office", sub: "a play", author: "Rabindranath Tagore", genre: "indian", motif: "window" },
    { slug: "stray-birds", title: "Stray Birds", author: "Rabindranath Tagore", genre: "poetry", motif: "birds" },
    // Sarat Chandra, Bankim
    { slug: "devdas", title: "Devdas", author: "Sarat Chandra Chattopadhyay", genre: "indian", motif: "diya" },
    { slug: "parineeta", title: "Parineeta", author: "Sarat Chandra Chattopadhyay", genre: "indian", motif: "flower" },
    { slug: "srikanta", title: "Srikanta", author: "Sarat Chandra Chattopadhyay", genre: "indian", motif: "waves" },
    { slug: "anandamath", title: "Anandamath", author: "Bankim Chandra Chattopadhyay", genre: "indian", motif: "sun" },
    { slug: "kapalkundala", title: "Kapalkundala", author: "Bankim Chandra Chattopadhyay", genre: "indian", motif: "waves" },
    // Kalidasa
    { slug: "abhijnanashakuntalam", title: "Abhijnanashakuntalam", sub: "The Recognition of Shakuntala", author: "Kalidasa", genre: "indian", motif: "lotus" },
    { slug: "meghaduta", title: "Meghaduta", sub: "The Cloud Messenger", author: "Kalidasa", genre: "poetry", motif: "rain" },
    // Gandhi
    { slug: "the-story-of-my-experiments-with-truth", title: "The Story of My Experiments with Truth", sub: "An Autobiography", author: "M. K. Gandhi", genre: "indian", motif: "wheel" },
    { slug: "hind-swaraj", title: "Hind Swaraj", author: "M. K. Gandhi", genre: "indian", motif: "wheel" },
    // Marathi
    { slug: "shyamchi-aai", title: "Shyamchi Aai", author: "Sane Guruji", genre: "indian", motif: "moon" },
    { slug: "pan-lakshat-kon-gheto", title: "Pan Lakshat Kon Gheto", author: "Hari Narayan Apte", genre: "indian", motif: "window" },
    // Saints
    { slug: "songs-of-kabir", title: "Songs of Kabir", author: "Kabir", genre: "poetry", motif: "lotus" },
    { slug: "abhangas-of-tukaram", title: "Abhangas", sub: "of Tukaram", author: "Sant Tukaram", genre: "poetry", motif: "lines" },
    // English
    { slug: "pride-and-prejudice", title: "Pride and Prejudice", author: "Jane Austen", genre: "english", motif: "flower" },
    { slug: "emma", title: "Emma", author: "Jane Austen", genre: "english", motif: "leaf" },
    { slug: "persuasion", title: "Persuasion", author: "Jane Austen", genre: "english", motif: "waves" },
    { slug: "sense-and-sensibility", title: "Sense and Sensibility", author: "Jane Austen", genre: "english", motif: "circles" },
    { slug: "great-expectations", title: "Great Expectations", author: "Charles Dickens", genre: "english", motif: "star" },
    { slug: "a-tale-of-two-cities", title: "A Tale of Two Cities", author: "Charles Dickens", genre: "english", motif: "circles" },
    { slug: "a-christmas-carol", title: "A Christmas Carol", author: "Charles Dickens", genre: "english", motif: "star" },
    { slug: "oliver-twist", title: "Oliver Twist", author: "Charles Dickens", genre: "english", motif: "tree" },
    { slug: "the-picture-of-dorian-gray", title: "The Picture of Dorian Gray", author: "Oscar Wilde", genre: "english", motif: "frame" },
    { slug: "the-importance-of-being-earnest", title: "The Importance of Being Earnest", author: "Oscar Wilde", genre: "english", motif: "flower" },
    { slug: "the-happy-prince-and-other-tales", title: "The Happy Prince", sub: "and other tales", author: "Oscar Wilde", genre: "children", motif: "star" },
    { slug: "the-adventures-of-sherlock-holmes", title: "The Adventures of Sherlock Holmes", author: "Arthur Conan Doyle", genre: "english", motif: "lens" },
    { slug: "the-hound-of-the-baskervilles", title: "The Hound of the Baskervilles", author: "Arthur Conan Doyle", genre: "english", motif: "moon" },
    { slug: "jane-eyre", title: "Jane Eyre", author: "Charlotte Brontë", genre: "english", motif: "window" },
    { slug: "wuthering-heights", title: "Wuthering Heights", author: "Emily Brontë", genre: "english", motif: "mountains" },
    { slug: "frankenstein", title: "Frankenstein", author: "Mary Shelley", genre: "english", motif: "moon" },
    { slug: "kim", title: "Kim", author: "Rudyard Kipling", genre: "english", motif: "mountains" },
    { slug: "adventures-of-huckleberry-finn", title: "Adventures of Huckleberry Finn", author: "Mark Twain", genre: "english", motif: "waves" },
    { slug: "the-adventures-of-tom-sawyer", title: "The Adventures of Tom Sawyer", author: "Mark Twain", genre: "english", motif: "sun" },
    { slug: "little-women", title: "Little Women", author: "Louisa May Alcott", genre: "english", motif: "flower" },
    { slug: "strange-case-of-dr-jekyll-and-mr-hyde", title: "Strange Case of Dr Jekyll and Mr Hyde", author: "Robert Louis Stevenson", genre: "english", motif: "halfmoon" },
    // Russian
    { slug: "anna-karenina", title: "Anna Karenina", author: "Leo Tolstoy", genre: "russian", motif: "rails" },
    { slug: "war-and-peace", title: "War and Peace", author: "Leo Tolstoy", genre: "russian", motif: "star" },
    { slug: "the-death-of-ivan-ilyich", title: "The Death of Ivan Ilyich", author: "Leo Tolstoy", genre: "russian", motif: "moon" },
    { slug: "crime-and-punishment", title: "Crime and Punishment", author: "Fyodor Dostoevsky", genre: "russian", motif: "stairs" },
    { slug: "the-brothers-karamazov", title: "The Brothers Karamazov", author: "Fyodor Dostoevsky", genre: "russian", motif: "circles" },
    { slug: "white-nights", title: "White Nights", author: "Fyodor Dostoevsky", genre: "russian", motif: "halfmoon" },
    { slug: "the-lady-with-the-dog-and-other-stories", title: "The Lady with the Dog", sub: "and other stories", author: "Anton Chekhov", genre: "russian", motif: "waves" },
    { slug: "the-cherry-orchard", title: "The Cherry Orchard", author: "Anton Chekhov", genre: "russian", motif: "tree" },
    // Poetry
    { slug: "leaves-of-grass", title: "Leaves of Grass", author: "Walt Whitman", genre: "poetry", motif: "leaf" },
    // Children
    { slug: "the-jungle-book", title: "The Jungle Book", author: "Rudyard Kipling", genre: "children", motif: "leaf" },
    { slug: "panchatantra-tales", title: "Panchatantra Tales", sub: "retold for children", author: "Retold by the Pagdandi story hour", genre: "children", motif: "tree" },
    { slug: "jataka-tales", title: "Jataka Tales", sub: "retold for children", author: "Retold by the Pagdandi story hour", genre: "children", motif: "sun" },
    { slug: "grimms-fairy-tales", title: "Grimms’ Fairy Tales", author: "Jacob and Wilhelm Grimm", genre: "children", motif: "moon" },
    { slug: "alices-adventures-in-wonderland", title: "Alice’s Adventures in Wonderland", author: "Lewis Carroll", genre: "children", motif: "circles" },
    { slug: "treasure-island", title: "Treasure Island", author: "Robert Louis Stevenson", genre: "children", motif: "waves" },
    // Fictional Pune authors (local)
    { slug: "kasba-peth-rains", title: "Kasba Peth Rains", sub: "a novel", author: "Meghna Apte", genre: "local", motif: "rain" },
    { slug: "the-last-bus-to-sinhagad", title: "The Last Bus to Sinhagad", sub: "a novel", author: "Nikhil Bhave", genre: "local", motif: "mountains" },
    { slug: "prabhat-road-at-dusk", title: "Prabhat Road at Dusk", sub: "poems", author: "Rohan Deshpande", genre: "local", motif: "sun" },
    { slug: "a-hundred-wadas", title: "A Hundred Wadas", sub: "walks through old Pune", author: "Ketaki Paranjpe", genre: "local", motif: "arch" },
    { slug: "the-tea-stall-at-swargate", title: "The Tea Stall at Swargate", sub: "stories", author: "Aniruddha Mone", genre: "local", motif: "cup" },
    { slug: "aajis-kitchen-notebook", title: "Aaji’s Kitchen Notebook", sub: "recipes from a Sadashiv Peth home", author: "Vaishali Sathe", genre: "local", motif: "diya" },
    { slug: "the-paper-boats-of-parvati", title: "The Paper Boats of Parvati", author: "Sushma Kale", genre: "children", motif: "boat" },
    { slug: "gauri-and-the-dhol", title: "Gauri and the Dhol", author: "Sushma Kale", genre: "children", motif: "drum" },
];

/** Ink colours sold in 30 ml bottles: name and hex. Keep in step with the catalogue. */
export const INKS = [
    ["Monsoon Grey", "#6b7680"],
    ["Kesari", "#e8731c"],
    ["Haldi", "#e2b322"],
    ["Neem Green", "#4f7a3a"],
    ["Mehendi", "#7a7b2c"],
    ["Peacock Blue", "#0f6f86"],
    ["Indigo Night", "#2b3a7a"],
    ["Jamun", "#5b2a5e"],
    ["Gulmohar", "#d0402e"],
    ["Sindoor Red", "#a8191f"],
    ["Tamarind Brown", "#6e4227"],
    ["Kajal Black", "#1d1d1f"],
];

/** Field-notebook cover colours. */
export const NOTEBOOK_COVERS = [
    ["Indigo", "#2c3d73"],
    ["Forest", "#2f4d3a"],
    ["Kesari", "#d9772b"],
    ["Charcoal", "#3a3a3c"],
];

// [background, ink (text), accent, frame]
const PALETTES = {
    indian: [
        ["#8c3b22", "#f6e7cf", "#e3a23b", "#f6e7cf"],
        ["#c9822f", "#2d1a0e", "#7a2e17", "#2d1a0e"],
        ["#5a2a1f", "#f2d9b0", "#d98b3a", "#f2d9b0"],
        ["#e8d3a8", "#4a2615", "#b5482a", "#4a2615"],
        ["#3f4a2a", "#efe0bd", "#d6a442", "#efe0bd"],
        ["#a24a2a", "#fbecd6", "#f2c063", "#fbecd6"],
    ],
    russian: [
        ["#1f3346", "#e6eef5", "#9fbfd8", "#e6eef5"],
        ["#dfe7ee", "#1c2e40", "#5d84a8", "#1c2e40"],
        ["#2c4157", "#f1f5f9", "#c7d6e3", "#f1f5f9"],
        ["#14202e", "#d9e4ee", "#7fa6c6", "#d9e4ee"],
    ],
    english: [
        ["#27443a", "#f1e9d6", "#c9a85c", "#c9a85c"],
        ["#5e1f2b", "#f3e6d4", "#d4ae6b", "#d4ae6b"],
        ["#efe6d2", "#3a2a1e", "#6f2633", "#6f2633"],
        ["#3b4f3a", "#f4ecd8", "#d9b979", "#d9b979"],
        ["#462231", "#f1e3cf", "#bf9a5a", "#bf9a5a"],
    ],
    poetry: [
        ["#f3eee3", "#3d3a33", "#c08a45", "#c9bfae"],
        ["#e9efe8", "#2f3d33", "#7d9a7a", "#bfcdbd"],
        ["#f2e9ea", "#3e2c30", "#b5737a", "#d6c3c5"],
        ["#eef0f4", "#2c3240", "#7f8fae", "#c4cad6"],
    ],
    children: [
        ["#f6c445", "#1d2b4f", "#e2533a", "#1d2b4f"],
        ["#3fa7a0", "#fffaf0", "#f6c445", "#fffaf0"],
        ["#e86a4a", "#fff6e6", "#ffd166", "#fff6e6"],
        ["#5b7fd6", "#fffaf0", "#ffcf5c", "#fffaf0"],
        ["#8cc152", "#203018", "#f6e05e", "#203018"],
    ],
    local: [
        ["#f1ede4", "#1e1e1e", "#2f5d62", "#1e1e1e"],
        ["#1e2a2f", "#f4f1ea", "#e07a3f", "#f4f1ea"],
        ["#e9e2d4", "#222222", "#c4462b", "#222222"],
        ["#2f5d62", "#f6f2ea", "#f2b950", "#f6f2ea"],
    ],
};

const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "'Helvetica Neue',Arial,sans-serif";

function hash(s) {
    let h = 2166136261;
    for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return h >>> 0;
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const r1 = (n) => Math.round(n * 10) / 10;

/** Greedy word wrap with an average glyph-width estimate. */
function wrap(text, size, maxW, em) {
    const words = text.split(" ");
    const lines = [];
    let line = "";
    for (const w of words) {
        const next = line ? `${line} ${w}` : w;
        if (line && next.length * size * em > maxW) {
            lines.push(line);
            line = w;
        } else line = next;
    }
    if (line) lines.push(line);
    return lines;
}

/** The largest size from `start` down at which the title fits `maxLines` lines and `maxW`. */
function fit(text, start, maxW, maxLines, em) {
    for (let size = start; size > 18; size -= 2) {
        const lines = wrap(text, size, maxW, em);
        const widest = Math.max(...lines.map((l) => l.length * size * em));
        if (lines.length <= maxLines && widest <= maxW) return { size, lines };
    }
    return { size: 18, lines: wrap(text, 18, maxW, em) };
}

function textBlock(lines, { x, y, size, lead = 1.15, fill, family, weight, style, anchor = "middle", spacing }) {
    const attrs = [
        `x="${x}"`,
        `y="${r1(y)}"`,
        `font-size="${size}"`,
        `fill="${fill}"`,
        `font-family="${family}"`,
        anchor !== "start" ? `text-anchor="${anchor}"` : "",
        weight ? `font-weight="${weight}"` : "",
        style ? `font-style="${style}"` : "",
        spacing ? `letter-spacing="${spacing}"` : "",
    ]
        .filter(Boolean)
        .join(" ");
    if (lines.length === 1) return `<text ${attrs}>${esc(lines[0])}</text>`;
    const spans = lines
        .map((l, i) => `<tspan x="${x}"${i ? ` dy="${r1(size * lead)}"` : ""}>${esc(l)}</tspan>`)
        .join("");
    return `<text ${attrs}>${spans}</text>`;
}

// --- motifs: each draws around (cx, cy) at scale s, colour c, accent a, background b
const MOTIFS = {
    sun: (cx, cy, s, c, a) =>
        `<circle cx="${cx}" cy="${cy}" r="${r1(s * 0.42)}" fill="${a}"/>` +
        `<circle cx="${cx}" cy="${cy}" r="${r1(s * 0.72)}" fill="none" stroke="${a}" stroke-width="${r1(s * 0.2)}" stroke-dasharray="3 9"/>`,
    moon: (cx, cy, s, c, a) => {
        const R = s * 0.6;
        const dx = r1(R * 0.35);
        const dy = r1(R * 0.94);
        return `<path d="M${r1(cx + dx)} ${r1(cy - dy)}A${r1(R)} ${r1(R)} 0 1 0 ${r1(cx + dx)} ${r1(cy + dy)}A${r1(R * 1.05)} ${r1(R * 1.05)} 0 0 1 ${r1(cx + dx)} ${r1(cy - dy)}z" fill="${a}"/>`;
    },
    halfmoon: (cx, cy, s, c, a) =>
        `<circle cx="${cx}" cy="${cy}" r="${r1(s * 0.6)}" fill="none" stroke="${a}" stroke-width="3"/>` +
        `<path d="M${cx} ${r1(cy - s * 0.6)}a${r1(s * 0.6)} ${r1(s * 0.6)} 0 0 1 0 ${r1(s * 1.2)}z" fill="${a}"/>`,
    waves: (cx, cy, s, c, a) => {
        const w = s * 1.6;
        const x0 = cx - w / 2;
        const seg = w / 6;
        let d = "";
        for (let i = 0; i < 4; i++) {
            d += `M${r1(x0)} ${r1(cy - s * 0.45 + i * s * 0.3)}q${r1(seg / 2)} ${r1(-s * 0.16)} ${r1(seg)} 0t${r1(seg)} 0t${r1(seg)} 0t${r1(seg)} 0t${r1(seg)} 0t${r1(seg)} 0`;
        }
        return `<path d="${d}" fill="none" stroke="${a}" stroke-width="${r1(s * 0.06)}" stroke-linecap="round"/>`;
    },
    leaf: (cx, cy, s, c, a) =>
        `<path d="M${cx} ${r1(cy + s * 0.75)}C${r1(cx - s * 0.7)} ${r1(cy + s * 0.2)} ${r1(cx - s * 0.45)} ${r1(cy - s * 0.55)} ${cx} ${r1(cy - s * 0.8)}C${r1(cx + s * 0.45)} ${r1(cy - s * 0.55)} ${r1(cx + s * 0.7)} ${r1(cy + s * 0.2)} ${cx} ${r1(cy + s * 0.75)}z" fill="${a}"/>` +
        `<path d="M${cx} ${r1(cy + s * 0.95)}V${r1(cy - s * 0.55)}M${cx} ${r1(cy)}l${r1(s * 0.3)} ${r1(-s * 0.3)}M${cx} ${r1(cy)}l${r1(-s * 0.3)} ${r1(-s * 0.3)}M${cx} ${r1(cy + s * 0.35)}l${r1(s * 0.32)} ${r1(-s * 0.3)}M${cx} ${r1(cy + s * 0.35)}l${r1(-s * 0.32)} ${r1(-s * 0.3)}" stroke="${c}" stroke-width="3" fill="none" opacity=".55"/>`,
    lines: (cx, cy, s, c, a) => {
        let d = "";
        for (let i = 0; i < 7; i++) d += `M${r1(cx - s * 0.8)} ${r1(cy - s * 0.6 + i * s * 0.2)}h${r1(s * 1.6)}`;
        return `<path d="${d}" stroke="${a}" stroke-width="${r1(s * 0.05)}"/>`;
    },
    fields: (cx, cy, s, c, a) => {
        let d = "";
        for (let i = 0; i < 5; i++) d += `M${r1(cx - s * 0.85)} ${r1(cy + s * 0.15 + i * s * 0.16)}h${r1(s * 1.7)}`;
        return `<circle cx="${cx}" cy="${r1(cy - s * 0.15)}" r="${r1(s * 0.42)}" fill="${a}"/><path d="${d}" stroke="${c}" stroke-width="${r1(s * 0.05)}"/>`;
    },
    mountains: (cx, cy, s, c, a) =>
        `<path d="M${r1(cx - s * 0.9)} ${r1(cy + s * 0.5)}L${r1(cx - s * 0.3)} ${r1(cy - s * 0.45)}L${r1(cx + s * 0.05)} ${r1(cy + s * 0.05)}L${r1(cx + s * 0.35)} ${r1(cy - s * 0.25)}L${r1(cx + s * 0.9)} ${r1(cy + s * 0.5)}z" fill="${a}"/>` +
        `<circle cx="${r1(cx + s * 0.45)}" cy="${r1(cy - s * 0.6)}" r="${r1(s * 0.14)}" fill="${c}"/>`,
    lotus: (cx, cy, s, c, a) => {
        let p = "";
        for (const deg of [-60, -30, 0, 30, 60]) {
            p += `<ellipse cx="${cx}" cy="${r1(cy - s * 0.35)}" rx="${r1(s * 0.16)}" ry="${r1(s * 0.42)}" transform="rotate(${deg} ${cx} ${r1(cy + s * 0.05)})"/>`;
        }
        return `<g fill="${a}" opacity=".9">${p}</g><path d="M${r1(cx - s * 0.7)} ${r1(cy + s * 0.18)}h${r1(s * 1.4)}" stroke="${c}" stroke-width="3"/>`;
    },
    arch: (cx, cy, s, c, a) =>
        `<path d="M${r1(cx - s * 0.5)} ${r1(cy + s * 0.7)}V${r1(cy - s * 0.1)}a${r1(s * 0.5)} ${r1(s * 0.5)} 0 0 1 ${r1(s)} 0V${r1(cy + s * 0.7)}z" fill="${a}"/>` +
        `<path d="M${r1(cx - s * 0.3)} ${r1(cy + s * 0.7)}V${r1(cy)}a${r1(s * 0.3)} ${r1(s * 0.3)} 0 0 1 ${r1(s * 0.6)} 0V${r1(cy + s * 0.7)}" fill="none" stroke="${c}" stroke-width="3"/>`,
    window: (cx, cy, s, c, a) =>
        `<rect x="${r1(cx - s * 0.45)}" y="${r1(cy - s * 0.6)}" width="${r1(s * 0.9)}" height="${r1(s * 1.2)}" fill="${a}"/>` +
        `<path d="M${cx} ${r1(cy - s * 0.6)}v${r1(s * 1.2)}M${r1(cx - s * 0.45)} ${cy}h${r1(s * 0.9)}" stroke="${c}" stroke-width="${r1(s * 0.06)}"/>`,
    wheel: (cx, cy, s, c, a) => {
        let d = "";
        for (let i = 0; i < 12; i++) {
            const t = (i * Math.PI) / 6;
            d += `M${cx} ${cy}L${r1(cx + Math.cos(t) * s * 0.6)} ${r1(cy + Math.sin(t) * s * 0.6)}`;
        }
        return `<circle cx="${cx}" cy="${cy}" r="${r1(s * 0.62)}" fill="none" stroke="${a}" stroke-width="${r1(s * 0.07)}"/><path d="${d}" stroke="${a}" stroke-width="3"/><circle cx="${cx}" cy="${cy}" r="${r1(s * 0.08)}" fill="${a}"/>`;
    },
    diya: (cx, cy, s, c, a) =>
        `<path d="M${r1(cx - s * 0.6)} ${r1(cy + s * 0.1)}Q${cx} ${r1(cy + s * 0.75)} ${r1(cx + s * 0.6)} ${r1(cy + s * 0.1)}z" fill="${a}"/>` +
        `<path d="M${cx} ${r1(cy - s * 0.65)}C${r1(cx + s * 0.22)} ${r1(cy - s * 0.3)} ${r1(cx + s * 0.18)} ${r1(cy)} ${cx} ${r1(cy + s * 0.02)}C${r1(cx - s * 0.18)} ${r1(cy)} ${r1(cx - s * 0.22)} ${r1(cy - s * 0.3)} ${cx} ${r1(cy - s * 0.65)}z" fill="${c}"/>`,
    ring: (cx, cy, s, c, a) =>
        `<circle cx="${cx}" cy="${r1(cy + s * 0.1)}" r="${r1(s * 0.5)}" fill="none" stroke="${a}" stroke-width="${r1(s * 0.1)}"/>` +
        `<path d="M${cx} ${r1(cy - s * 0.65)}l${r1(s * 0.16)} ${r1(s * 0.16)}l${r1(-s * 0.16)} ${r1(s * 0.16)}l${r1(-s * 0.16)} ${r1(-s * 0.16)}z" fill="${c}"/>`,
    birds: (cx, cy, s, c, a) => {
        const pts = [
            [-0.5, -0.2, 1],
            [0.1, -0.45, 0.8],
            [0.45, 0.05, 0.65],
            [-0.1, 0.3, 0.55],
        ];
        let d = "";
        for (const [dx, dy, k] of pts) {
            const x = cx + dx * s;
            const y = cy + dy * s;
            const w = s * 0.34 * k;
            d += `M${r1(x - w)} ${r1(y - w * 0.4)}q${r1(w / 2)} ${r1(-w * 0.2)} ${r1(w)} ${r1(w * 0.4)}q${r1(w / 2)} ${r1(-w * 0.6)} ${r1(w)} ${r1(-w * 0.4)}`;
        }
        return `<path d="${d}" fill="none" stroke="${a}" stroke-width="5" stroke-linecap="round"/>`;
    },
    rain: (cx, cy, s, c, a) => {
        let d = "";
        for (let i = 0; i < 7; i++) {
            const x = cx - s * 0.6 + i * s * 0.2;
            d += `M${r1(x)} ${r1(cy - s * 0.05 + (i % 2) * s * 0.12)}l${r1(-s * 0.1)} ${r1(s * 0.35)}`;
        }
        return `<path d="M${r1(cx - s * 0.7)} ${r1(cy - s * 0.2)}a${r1(s * 0.25)} ${r1(s * 0.25)} 0 0 1 ${r1(s * 0.3)} ${r1(-s * 0.35)}a${r1(s * 0.38)} ${r1(s * 0.38)} 0 0 1 ${r1(s * 0.72)} ${r1(-s * 0.05)}a${r1(s * 0.26)} ${r1(s * 0.26)} 0 0 1 ${r1(s * 0.38)} ${r1(s * 0.4)}z" fill="${a}"/><path d="${d}" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`;
    },
    star: (cx, cy, s, c, a) => {
        let pts = "";
        for (let i = 0; i < 16; i++) {
            const t = (i * Math.PI) / 8 - Math.PI / 2;
            const r = i % 2 ? s * 0.22 : s * 0.62;
            pts += `${r1(cx + Math.cos(t) * r)},${r1(cy + Math.sin(t) * r)} `;
        }
        return `<polygon points="${pts.trim()}" fill="${a}"/>`;
    },
    flower: (cx, cy, s, c, a) => {
        let p = "";
        for (let i = 0; i < 8; i++) {
            const t = (i * Math.PI) / 4;
            p += `<circle cx="${r1(cx + Math.cos(t) * s * 0.36)}" cy="${r1(cy + Math.sin(t) * s * 0.36)}" r="${r1(s * 0.2)}"/>`;
        }
        return `<g fill="${a}" opacity=".85">${p}</g><circle cx="${cx}" cy="${cy}" r="${r1(s * 0.16)}" fill="${c}"/>`;
    },
    circles: (cx, cy, s, c, a) =>
        `<circle cx="${r1(cx - s * 0.25)}" cy="${cy}" r="${r1(s * 0.45)}" fill="${a}" opacity=".9"/>` +
        `<circle cx="${r1(cx + s * 0.25)}" cy="${cy}" r="${r1(s * 0.45)}" fill="none" stroke="${c}" stroke-width="4"/>`,
    rails: (cx, cy, s, c, a) => {
        let d = `M${r1(cx - s * 0.7)} ${r1(cy + s * 0.7)}L${r1(cx - s * 0.05)} ${r1(cy - s * 0.6)}M${r1(cx + s * 0.7)} ${r1(cy + s * 0.7)}L${r1(cx + s * 0.05)} ${r1(cy - s * 0.6)}`;
        for (let i = 0; i < 6; i++) {
            const k = i / 6;
            const y = cy + s * 0.6 - k * k * s * 1.1;
            const half = s * (0.75 - k * 0.6);
            d += `M${r1(cx - half)} ${r1(y)}h${r1(half * 2)}`;
        }
        return `<path d="${d}" stroke="${a}" stroke-width="4"/>`;
    },
    tree: (cx, cy, s, c, a) =>
        `<path d="M${cx} ${r1(cy + s * 0.75)}V${r1(cy)}" stroke="${c}" stroke-width="${r1(s * 0.08)}"/>` +
        `<circle cx="${cx}" cy="${r1(cy - s * 0.2)}" r="${r1(s * 0.5)}" fill="${a}"/>` +
        `<circle cx="${r1(cx - s * 0.2)}" cy="${r1(cy - s * 0.3)}" r="${r1(s * 0.07)}" fill="${c}"/><circle cx="${r1(cx + s * 0.18)}" cy="${r1(cy - s * 0.05)}" r="${r1(s * 0.07)}" fill="${c}"/>`,
    frame: (cx, cy, s, c, a) =>
        `<ellipse cx="${cx}" cy="${cy}" rx="${r1(s * 0.5)}" ry="${r1(s * 0.68)}" fill="none" stroke="${a}" stroke-width="${r1(s * 0.08)}"/>` +
        `<ellipse cx="${cx}" cy="${cy}" rx="${r1(s * 0.38)}" ry="${r1(s * 0.55)}" fill="none" stroke="${a}" stroke-width="2"/>`,
    lens: (cx, cy, s, c, a) =>
        `<circle cx="${r1(cx - s * 0.12)}" cy="${r1(cy - s * 0.12)}" r="${r1(s * 0.42)}" fill="none" stroke="${a}" stroke-width="${r1(s * 0.08)}"/>` +
        `<path d="M${r1(cx + s * 0.2)} ${r1(cy + s * 0.2)}l${r1(s * 0.42)} ${r1(s * 0.42)}" stroke="${a}" stroke-width="${r1(s * 0.12)}" stroke-linecap="round"/>`,
    stairs: (cx, cy, s, c, a) => {
        let d = `M${r1(cx - s * 0.7)} ${r1(cy + s * 0.6)}`;
        for (let i = 0; i < 5; i++) d += `v${r1(-s * 0.24)}h${r1(s * 0.28)}`;
        return `<path d="${d}V${r1(cy + s * 0.6)}z" fill="${a}"/>`;
    },
    cup: (cx, cy, s, c, a) =>
        `<path d="M${r1(cx - s * 0.4)} ${r1(cy - s * 0.2)}h${r1(s * 0.8)}l${r1(-s * 0.1)} ${r1(s * 0.75)}h${r1(-s * 0.6)}z" fill="${a}"/>` +
        `<path d="M${r1(cx - s * 0.1)} ${r1(cy - s * 0.3)}q${r1(-s * 0.08)} ${r1(-s * 0.08)} 0 ${r1(-s * 0.16)}t0 ${r1(-s * 0.16)}M${r1(cx + s * 0.12)} ${r1(cy - s * 0.3)}q${r1(-s * 0.08)} ${r1(-s * 0.08)} 0 ${r1(-s * 0.16)}t0 ${r1(-s * 0.16)}" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`,
    boat: (cx, cy, s, c, a) =>
        `<path d="M${r1(cx - s * 0.75)} ${r1(cy)}h${r1(s * 1.5)}l${r1(-s * 0.3)} ${r1(s * 0.35)}h${r1(-s * 0.9)}z" fill="${a}"/>` +
        `<path d="M${r1(cx - s * 0.4)} ${r1(cy)}L${r1(cx)} ${r1(cy - s * 0.6)}L${r1(cx + s * 0.4)} ${r1(cy)}z" fill="${c}"/>` +
        `<path d="M${r1(cx - s * 0.9)} ${r1(cy + s * 0.55)}q${r1(s * 0.15)} ${r1(-s * 0.1)} ${r1(s * 0.3)} 0t${r1(s * 0.3)} 0t${r1(s * 0.3)} 0t${r1(s * 0.3)} 0t${r1(s * 0.3)} 0t${r1(s * 0.3)} 0" fill="none" stroke="${c}" stroke-width="3"/>`,
    drum: (cx, cy, s, c, a) =>
        `<rect x="${r1(cx - s * 0.6)}" y="${r1(cy - s * 0.35)}" width="${r1(s * 1.2)}" height="${r1(s * 0.7)}" rx="${r1(s * 0.25)}" fill="${a}"/>` +
        `<path d="M${r1(cx - s * 0.6)} ${r1(cy - s * 0.35)}l${r1(s * 0.3)} ${r1(s * 0.7)}l${r1(s * 0.3)} ${r1(-s * 0.7)}l${r1(s * 0.3)} ${r1(s * 0.7)}l${r1(s * 0.3)} ${r1(-s * 0.7)}" fill="none" stroke="${c}" stroke-width="3"/>`,
};

function svg(body, bg) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900" width="600" height="900"><rect width="600" height="900" fill="${bg}"/>${body}<rect width="14" height="900" fill="#000" opacity=".12"/></svg>`;
}

function cover(book) {
    const pals = PALETTES[book.genre];
    const [bg, ink, accent, frame] = pals[hash(book.slug) % pals.length];
    const motif = MOTIFS[book.motif];
    const author = book.author.toUpperCase();
    const authorSize = author.length > 24 ? 17 : 20;
    let body = "";

    switch (book.genre) {
        case "indian": {
            body += `<rect x="34" y="34" width="532" height="832" fill="none" stroke="${frame}" stroke-width="2" opacity=".6"/>`;
            const t = fit(book.title, 76, 470, 3, 0.53);
            const top = 150;
            body += textBlock(t.lines, { x: 300, y: top, size: t.size, fill: ink, family: SERIF });
            let y = top + (t.lines.length - 1) * t.size * 1.15;
            if (book.sub) {
                body += textBlock([book.sub], { x: 300, y: y + 46, size: 24, fill: ink, family: SERIF, style: "italic" });
                y += 46;
            }
            const my = Math.max(500, y + 230);
            body += motif(300, my, 230, ink, accent, bg);
            body += `<path d="M250 770h100" stroke="${accent}" stroke-width="2"/>`;
            body += textBlock([author], { x: 300, y: 812, size: authorSize, fill: ink, family: SANS, spacing: 3 });
            break;
        }
        case "russian": {
            body += motif(300, 290, 280, ink, accent, bg);
            const t = fit(book.title, 64, 480, 3, 0.53);
            const top = 580;
            body += textBlock(t.lines, { x: 60, y: top, size: t.size, fill: ink, family: SERIF, anchor: "start" });
            let y = top + (t.lines.length - 1) * t.size * 1.12;
            if (book.sub) body += textBlock([book.sub], { x: 60, y: y + 40, size: 24, fill: ink, family: SERIF, style: "italic", anchor: "start" });
            body += `<path d="M60 790h480" stroke="${accent}" stroke-width="2"/>`;
            body += textBlock([author], { x: 60, y: 830, size: authorSize, fill: ink, family: SANS, spacing: 3, anchor: "start" });
            break;
        }
        case "english": {
            body += `<rect x="30" y="30" width="540" height="840" fill="none" stroke="${frame}" stroke-width="3"/><rect x="42" y="42" width="516" height="816" fill="none" stroke="${frame}" stroke-width="1"/>`;
            const t = fit(book.title, 64, 440, 4, 0.52);
            const block = (t.lines.length - 1) * t.size * 1.15;
            const top = 250 - block / 2;
            body += textBlock(t.lines, { x: 300, y: top, size: t.size, fill: ink, family: SERIF });
            let y = top + block;
            if (book.sub) {
                body += textBlock([book.sub], { x: 300, y: y + 44, size: 24, fill: ink, family: SERIF, style: "italic" });
                y += 44;
            }
            body += `<path d="M230 ${r1(y + 50)}h140" stroke="${frame}" stroke-width="1.5"/><circle cx="300" cy="${r1(y + 50)}" r="4" fill="${frame}"/>`;
            body += textBlock([book.author], { x: 300, y: y + 100, size: 26, fill: ink, family: SERIF, style: "italic" });
            body += motif(300, 640, 200, ink, accent, bg);
            break;
        }
        case "poetry": {
            body += motif(300, 330, 170, ink, accent, bg);
            const t = fit(book.title, 50, 420, 2, 0.52);
            body += textBlock(t.lines, { x: 300, y: 560, size: t.size, fill: ink, family: SERIF });
            let y = 560 + (t.lines.length - 1) * t.size * 1.15;
            if (book.sub) {
                body += textBlock([book.sub], { x: 300, y: y + 40, size: 22, fill: ink, family: SERIF, style: "italic" });
                y += 40;
            }
            body += `<path d="M285 ${r1(y + 45)}h30" stroke="${accent}" stroke-width="2"/>`;
            body += textBlock([author], { x: 300, y: y + 90, size: authorSize - 2, fill: ink, family: SANS, spacing: 3 });
            body += `<rect x="40" y="40" width="520" height="820" fill="none" stroke="${frame}" stroke-width="1"/>`;
            break;
        }
        case "children": {
            const t = fit(book.title, 72, 500, 3, 0.6);
            const top = 140;
            body += textBlock(t.lines, { x: 300, y: top, size: t.size, fill: ink, family: SANS, weight: 700, lead: 1.08 });
            let y = top + (t.lines.length - 1) * t.size * 1.08;
            if (book.sub) {
                body += textBlock([book.sub], { x: 300, y: y + 44, size: 24, fill: ink, family: SANS });
                y += 44;
            }
            body += `<circle cx="300" cy="${r1(Math.max(530, y + 260))}" r="200" fill="${ink}" opacity=".1"/>`;
            body += motif(300, Math.max(530, y + 260), 260, ink, accent, bg);
            body += textBlock([book.author], { x: 300, y: 835, size: book.author.length > 26 ? 18 : 22, fill: ink, family: SANS, weight: 700 });
            break;
        }
        case "local": {
            body += `<rect x="0" y="0" width="600" height="520" fill="${accent}"/>`;
            body += motif(300, 270, 260, bg, ink, accent);
            const t = fit(book.title, 56, 490, 3, 0.58);
            const top = 600;
            body += textBlock(t.lines, { x: 52, y: top, size: t.size, fill: ink, family: SANS, weight: 700, anchor: "start", lead: 1.08 });
            let y = top + (t.lines.length - 1) * t.size * 1.08;
            if (book.sub) body += textBlock([book.sub], { x: 52, y: y + 38, size: 22, fill: ink, family: SERIF, style: "italic", anchor: "start" });
            body += textBlock([book.author], { x: 52, y: 840, size: 22, fill: ink, family: SANS, anchor: "start", spacing: 1 });
            break;
        }
        default:
            throw new Error(`unknown genre ${book.genre}`);
    }
    return svg(body, bg);
}

function inkChart() {
    let shapes = "";
    let labels = "";
    INKS.forEach(([name, hex], i) => {
        const x = 110 + (i % 3) * 190;
        const y = 220 + Math.floor(i / 3) * 175;
        shapes += `<rect x="${x - 15}" y="${y - 52}" width="30" height="22" rx="3" fill="#2a2622"/><rect x="${x - 36}" y="${y - 32}" width="72" height="80" rx="10" fill="${hex}"/>`;
        labels += `<text x="${x}" y="${y + 80}">${esc(name)}</text>`;
    });
    const head = `<text x="300" y="80" font-size="34" font-family="${SERIF}" text-anchor="middle" fill="#2a2622">Ink colours</text><text x="300" y="116" font-size="16" font-family="${SANS}" text-anchor="middle" fill="#6a625a" letter-spacing="2">30 ML BOTTLES</text>`;
    const body = `${head}${shapes}<g font-size="19" fill="#2a2622" font-family="${SANS}" text-anchor="middle">${labels}</g>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900" width="600" height="900"><rect width="600" height="900" fill="#f5f1e8"/>${body}</svg>`;
}

function notebookCovers() {
    let body = `<text x="300" y="90" font-size="34" fill="#2a2622" font-family="${SERIF}" text-anchor="middle">Four cover colours</text>`;
    NOTEBOOK_COVERS.forEach(([name, hex], i) => {
        const x = 70 + (i % 2) * 250;
        const y = 150 + Math.floor(i / 2) * 360;
        body += `<rect x="${x}" y="${y}" width="210" height="290" rx="8" fill="${hex}"/><rect x="${x + 172}" y="${y}" width="10" height="290" fill="#000" opacity=".18"/>`;
        body += `<text x="${x + 105}" y="${y + 328}" font-size="18" fill="#2a2622" font-family="${SANS}" text-anchor="middle">${name}</text>`;
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900" width="600" height="900"><rect width="600" height="900" fill="#f5f1e8"/>${body}</svg>`;
}

const toData = (s) => `data:image/svg+xml;base64,${Buffer.from(s, "utf8").toString("base64")}`;

const images = {};
for (const book of BOOKS) images[book.slug] = cover(book);
images["ink-colour-chart"] = inkChart();
images["notebook-cover-colours"] = notebookCovers();

const dirFlag = process.argv.indexOf("--svg-dir");
if (dirFlag > -1) {
    const dir = process.argv[dirFlag + 1];
    mkdirSync(dir, { recursive: true });
    for (const [k, s] of Object.entries(images)) writeFileSync(join(dir, `${k}.svg`), s);
}

let largest = 0;
const entries = Object.entries(images).map(([k, s]) => {
    largest = Math.max(largest, Buffer.byteLength(s));
    return `    "${k}":\n        "${toData(s)}",`;
});

const ts = `/**
 * GENERATED — do not edit by hand. Run
 * \`node scripts/demo-covers/generate-pagdandi-covers.mjs\` to rebuild.
 *
 * Book covers (keyed by product slug) and a few drawn product images for the
 * Pagdandi Books & Café demo shop: small typographic SVGs, drawn for this
 * seed from title, author and a geometric motif, as base64 data addresses.
 */

export const PAGDANDI_COVERS: Record<string, string> = {
${entries.join("\n")}
};
`;
writeFileSync(OUT, ts);
console.log(`wrote ${Object.keys(images).length} images to ${OUT} (largest SVG ${largest} bytes)`);
