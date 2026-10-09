// One word each (UX-078, docs/patterns/saroh-product.md): a merchant or a
// customer reads "Move", "Closed" and "booking", never "Reschedule", "Shut"
// or "reservation". This fails on those three in what people read — string
// literals that read as words, JSX text, and Help pages — in the workspace,
// merchant sites, the customer emails and Help. Comments, identifiers
// (`rescheduleBooking`), stored values ("rescheduled") and import paths
// ("./reservation") are not words anyone reads, so they are left alone.
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
            if (reads(s)) words.push(...bannedIn(s));
        }
        for (const m of code.matchAll(/>([^<>{}]+)</g)) {
            words.push(...bannedIn(m[1]));
        }
        if (JSX_TEXT.test(code)) words.push(...bannedIn(code));
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
        `${relative(root, join(root, file))}:${line}: "${word}" — say "${BANNED.get(word)}" (one word each, saroh-product.md)`,
    );
}
if (found.length > 0) {
    process.exitCode = 1;
} else {
    console.log(`words: ${scanned} files, no Reschedule, Shut or reservation`);
}
