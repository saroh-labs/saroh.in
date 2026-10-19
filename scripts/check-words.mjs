// One word each (UX-078, docs/patterns/saroh-product.md): a merchant or a
// customer reads "Move", "Closed" and "booking", never "Reschedule", "Shut"
// or "reservation". This fails on those three in what people read — string
// literals that read as words, JSX text, and Help pages — in the workspace,
// merchant sites, the customer emails and Help. Comments, identifiers
// (`rescheduleBooking`), stored values ("rescheduled") and import paths
// ("./reservation") are not words anyone reads, so they are left alone.
//
// Bookings' retired words (DEC-113 as amended by DEC-170, U18 of the
// bookings plan, #1034) are phrases, checked in the workspace only: "To
// confirm" is "Awaiting payment", "No-show" is "Didn't come", "Check in" is
// "Mark arrived", "Pay link" is "Payment link", and the rest in RETIRED.
// The shared words live in `apps/app.saroh.in/lib/services/booking-words.ts`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(import.meta.dirname, "..");

const SOURCES = [
    "apps/app.saroh.in/app",
    "apps/app.saroh.in/components",
    "apps/app.saroh.in/lib",
    "apps/saroh.app/app",
    "apps/saroh.app/components",
    "apps/saroh.app/lib",
    "packages/site-blocks/src",
    "apps/api.saroh.in/src/modules/site-accounts/notify-templates.ts",
];
const HELP = ["apps/help.saroh.in/content", "apps/saroh.in/content/help"];

/** The words, as whole words; the right one is in saroh-product.md. */
const BANNED = new Map([
    ...["Reschedule", "Rescheduled", "Reschedules", "Rescheduling"].map((w) => [
        w,
        "Move",
    ]),
    ...["reschedule", "rescheduled", "reschedules", "rescheduling"].map((w) => [
        w,
        "move",
    ]),
    ["Shut", "Closed"],
    ["shut", "closed"],
    ["Reservation", "Booking"],
    ["Reservations", "Bookings"],
    ["reservation", "booking"],
    ["reservations", "bookings"],
]);

/**
 * Bookings' retired phrases, in what a merchant reads in the workspace
 * (DEC-170, U18). Each: the pattern, the word as written, what to say.
 */
const RETIRED = [
    [/\bTo confirm\b/, "To confirm", "Awaiting payment"],
    [/\bNo[- ]shows?\b/i, "No-show", "Didn't come"],
    [
        /\b[Cc]heck(?:ed)? in\b/,
        "Check in",
        "Mark arrived (button), Came (status)",
    ],
    [/\b[Pp]ay links?\b/, "Pay link", "Payment link"],
    [/\bThey came\b|\bThey didn[’']t\b/, "They came", "Came, Didn't come"],
    [/\bNot said yet\b|\bNobody has said\b/, "Not said yet", "Not marked yet"],
    [/\b[Pp]ays? at the session\b/, "Pays at the session", "Pays at the visit"],
    [/\bCreate booking\b/, "Create booking", "Book"],
    [/\bDay by person\b/, "Day by person", "Day"],
    [/\bOne-off extra hours\b/, "One-off extra hours", "Extra opening hours"],
    [
        /\bGap after\b|\bBuffer before\b/,
        "Gap after",
        "Break after, Break before",
    ],
    [/\bWho takes it\b/, "Who takes it", "Who does it"],
];
const WORKSPACE = "apps/app.saroh.in/";

/**
 * A retired phrase still in a file another unit is rewriting: the file, the
 * phrase as RETIRED writes it, and why. An entry that no longer matches
 * fails the check, so it is taken out the day the file changes.
 */
const ALLOWED = [
    {
        file: "apps/app.saroh.in/components/bookings/bookings-view-switch.tsx",
        word: "Day by person",
        why: "U2 (bookings plan) replaces the view switch with Show as: Day, Week, List",
    },
    {
        file: "apps/app.saroh.in/components/bookings/calendar/calendar-screen.tsx",
        word: "Check in",
        why: "U2 owns calendar-screen.tsx: its toast says Came",
    },
    {
        file: "apps/app.saroh.in/components/bookings/calendar/calendar-screen.tsx",
        word: "No-show",
        why: "U2 owns calendar-screen.tsx: its toast says Didn't come",
    },
];
const usedAllowance = new Set();

function retiredIn(text, file) {
    if (!file.startsWith(WORKSPACE)) return [];
    const out = [];
    for (const [re, word] of RETIRED) {
        if (!re.test(text)) continue;
        const allow = ALLOWED.find((a) => a.file === file && a.word === word);
        if (allow) {
            usedAllowance.add(allow);
            continue;
        }
        out.push(word);
    }
    return out;
}
const SAY = new Map(RETIRED.map(([, word, say]) => [word, say]));

const isTest = (f) => /\.(test|spec)\.[cm]?[jt]sx?$|__snapshots__/.test(f);

function walk(path, exts) {
    const abs = join(root, path);
    if (statSync(abs).isFile()) return [path];
    return readdirSync(abs, { recursive: true })
        .map(String)
        .filter((f) => exts.some((e) => f.endsWith(e)))
        .filter((f) => !f.split("/").includes("node_modules"))
        .map((f) => join(path, f))
        .filter((f) => !isTest(f));
}

function bannedIn(text) {
    return (text.match(/[A-Za-z]+/g) ?? []).filter((w) => BANNED.has(w));
}

// A string that reads as words: it has a space, or starts with a capital.
// "./reservation" and "rescheduled" are paths and stored values.
const STRINGS = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
const reads = (s) => /\s/.test(s.trim()) || /^[A-Z]/.test(s);
// A JSX text line: words and punctuation, no code.
const JSX_TEXT = /^[A-Za-z&][^=;{}()<>`"]*$/;

const found = [];
let scanned = 0;

for (const file of SOURCES.flatMap((s) => walk(s, [".ts", ".tsx"]))) {
    scanned += 1;
    const lines = readFileSync(join(root, file), "utf8").split("\n");
    let inComment = false;
    lines.forEach((raw, i) => {
        let line = raw.trim();
        if (inComment) {
            const end = line.indexOf("*/");
            if (end === -1) return;
            inComment = false;
            line = line.slice(end + 2).trim();
        }
        if (line.startsWith("/*") || line.startsWith("{/*")) {
            if (!line.includes("*/")) inComment = true;
            return;
        }
        if (line.startsWith("//") || line.startsWith("*")) return;
        if (/^(import|export)\b.*\bfrom\b|^\} from /.test(line)) return;
        // An entity (`&apos;`) is a letter on the page, not code.
        const code = line.replace(/\s\/\/.*$/, "").replace(/&\w+;/g, "'");
        const words = [];
        for (const m of code.matchAll(STRINGS)) {
            const s = m[1] ?? m[2] ?? m[3] ?? "";
            if (reads(s)) words.push(...bannedIn(s), ...retiredIn(s, file));
        }
        for (const m of code.matchAll(/>([^<>{}]+)</g)) {
            words.push(...bannedIn(m[1]), ...retiredIn(m[1], file));
        }
        if (JSX_TEXT.test(code))
            words.push(...bannedIn(code), ...retiredIn(code, file));
        for (const w of new Set(words)) found.push([file, i + 1, w]);
    });
}

for (const file of HELP.flatMap((s) => walk(s, [".mdx", ".md"]))) {
    scanned += 1;
    const lines = readFileSync(join(root, file), "utf8").split("\n");
    let front = false;
    lines.forEach((line, i) => {
        if (line.trim() === "---") front = !front;
        // The front matter's own notes for whoever edits the page.
        if (front && line.trimStart().startsWith("#")) return;
        for (const w of new Set(bannedIn(line))) found.push([file, i + 1, w]);
    });
}

for (const [file, line, word] of found) {
    console.error(
        `${relative(root, join(root, file))}:${line}: "${word}" — say "${BANNED.get(word) ?? SAY.get(word)}" (one word each, saroh-product.md)`,
    );
}
for (const a of ALLOWED) {
    if (!usedAllowance.has(a)) {
        console.error(
            `scripts/check-words.mjs: ALLOWED ${a.file} ("${a.word}") no longer applies. Remove it.`,
        );
        process.exitCode = 1;
    }
}
if (found.length > 0) {
    process.exitCode = 1;
} else if (!process.exitCode) {
    console.log(
        `words: ${scanned} files, no Reschedule, Shut or reservation, and none of Bookings' retired words`,
    );
}
