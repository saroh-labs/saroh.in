// One formatter each (UX audit, 10 Oct 2026, docs/patterns/
// frontend-design-system.md → Numbers and dates): in the merchant app an
// amount, a number, a day, a time and a plural are written by
// `apps/app.saroh.in/lib/format` and nowhere else, and a toast is a plain
// sentence (docs/patterns/frontend-error-feedback.md → Toasts). This fails:
//
// - `Intl.NumberFormat`, `Intl.DateTimeFormat`, `toLocaleString`,
//   `toLocaleDateString` or `toLocaleTimeString` outside `lib/format`;
// - a plural built by hand: `n === 1 ? "" : "s"`;
// - "successfully" or an exclamation mark in what a toast says.
//
// Tests are left alone: a test may spell out the string it expects.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const APP = "apps/app.saroh.in";
const SOURCES = ["app", "components", "lib"];

/** The one place these calls belong. */
const FORMAT_MODULE = "lib/format/";

/**
 * A file that may call one of them anyway, with why. Keep this empty if you
 * can: a new need is nearly always a new option on a formatter.
 */
const ALLOWED = new Map([
    // ["lib/example.ts", "why the formatter can't do it"],
]);

const NATIVE = [
    [/\bIntl\.NumberFormat\b/, "Intl.NumberFormat", "formatMoney, formatNumber"],
    [
        /\bIntl\.DateTimeFormat\b/,
        "Intl.DateTimeFormat",
        "formatDate, formatTime, zoneParts",
    ],
    [/\.toLocaleDateString\(/, "toLocaleDateString", "formatDate"],
    [/\.toLocaleTimeString\(/, "toLocaleTimeString", "formatTime"],
    [/\.toLocaleString\(/, "toLocaleString", "formatNumber, formatDateTime"],
];

const HAND_PLURAL = /===\s*1\s*\?\s*""\s*:\s*"e?s"|!==\s*1\s*\?\s*"e?s"\s*:\s*""/;

const TOASTS = ["showSuccess", "showError", "showWarning", "showInfo", "showUndo"];
const TOAST_CALL = new RegExp(`(?<![\\w.])(${TOASTS.join("|")})\\(`, "g");

const isTest = (f) =>
    /\.(test|spec)\.[cm]?[jt]sx?$|__snapshots__|\.test-kit\.ts$/.test(f);

function walk(dir) {
    return readdirSync(join(root, APP, dir), { recursive: true })
        .map(String)
        .filter((f) => /\.tsx?$/.test(f))
        .filter((f) => !f.split("/").includes("node_modules"))
        .map((f) => join(dir, f))
        .filter((f) => !isTest(f));
}

/** The source with its comments blanked out, line for line. */
function withoutComments(src) {
    let out = "";
    let i = 0;
    let quote = null;
    while (i < src.length) {
        const c = src[i];
        const next = src[i + 1];
        if (quote) {
            out += c;
            if (c === "\\") {
                out += next ?? "";
                i += 2;
                continue;
            }
            if (c === quote) quote = null;
            i += 1;
            continue;
        }
        if (c === '"' || c === "'" || c === "`") {
            quote = c;
            out += c;
            i += 1;
            continue;
        }
        if (c === "/" && next === "/") {
            while (i < src.length && src[i] !== "\n") i += 1;
            continue;
        }
        if (c === "/" && next === "*") {
            const end = src.indexOf("*/", i + 2);
            const stop = end === -1 ? src.length : end + 2;
            out += src.slice(i, stop).replace(/[^\n]/g, " ");
            i = stop;
            continue;
        }
        out += c;
        i += 1;
    }
    return out;
}

/** Where a call's closing bracket is, given its opening one. */
function closeOf(src, open) {
    let depth = 0;
    let quote = null;
    for (let i = open; i < src.length; i += 1) {
        const c = src[i];
        if (quote) {
            if (c === "\\") i += 1;
            else if (c === quote) quote = null;
            continue;
        }
        if (c === '"' || c === "'" || c === "`") quote = c;
        else if (c === "(") depth += 1;
        else if (c === ")") {
            depth -= 1;
            if (depth === 0) return i;
        }
    }
    return -1;
}

/** The words of the string literals in a stretch of code. */
function stringsIn(code) {
    const found = [];
    const re = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
    for (const m of code.matchAll(re)) {
        // A template's own code (`${n > 0 ? "a" : "b"}`) is not its words.
        found.push((m[1] ?? m[2] ?? m[3] ?? "").replace(/\$\{[^}]*\}/g, " "));
    }
    return found;
}

const problems = [];
let scanned = 0;

for (const file of SOURCES.flatMap(walk)) {
    scanned += 1;
    const raw = readFileSync(join(root, APP, file), "utf8");
    const src = withoutComments(raw);
    const lines = src.split("\n");
    const lineOf = (index) => src.slice(0, index).split("\n").length;

    const inFormat = file.startsWith(FORMAT_MODULE);
    lines.forEach((line, i) => {
        if (!inFormat && !ALLOWED.has(file)) {
            for (const [pattern, name, instead] of NATIVE) {
                if (pattern.test(line)) {
                    problems.push(
                        `${APP}/${file}:${i + 1}  ${name}: use ${instead} from @/lib/format`,
                    );
                }
            }
        }
        if (!inFormat && HAND_PLURAL.test(line)) {
            problems.push(
                `${APP}/${file}:${i + 1}  a plural built by hand: use count() or plural() from @/lib/format/plural`,
            );
        }
    });

    for (const m of src.matchAll(TOAST_CALL)) {
        const open = m.index + m[1].length;
        const end = closeOf(src, open);
        if (end === -1) continue;
        for (const words of stringsIn(src.slice(open + 1, end))) {
            if (/successfully/i.test(words)) {
                problems.push(
                    `${APP}/${file}:${lineOf(m.index)}  ${m[1]}: "successfully" says nothing. Say what happened: "Booking moved."`,
                );
            }
            if (/[A-Za-z]!(\s|$)/.test(words)) {
                problems.push(
                    `${APP}/${file}:${lineOf(m.index)}  ${m[1]}: no exclamation mark in a toast`,
                );
            }
        }
    }
}

for (const file of ALLOWED.keys()) {
    try {
        readFileSync(join(root, APP, file));
    } catch {
        problems.push(`${APP}/${file}  is on the allow-list but no longer exists`);
    }
}

if (problems.length > 0) {
    console.error(
        `check:formats: ${problems.length} place(s) write a number, a date or a toast their own way\n`,
    );
    for (const p of problems) console.error(`  ${p}`);
    console.error(
        "\nSee docs/patterns/frontend-design-system.md → Numbers and dates, and frontend-error-feedback.md → Toasts.",
    );
    process.exit(1);
}
console.log(`check:formats: ${scanned} files, one formatter each`);
