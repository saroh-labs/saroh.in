// One copy of each block (DEC-195): a line-window clone check.
//
// Every run of MIN non-trivial lines that appears in two or more files of
// saroh.in or @saroh/search-pages is a clone. Today's clones are recorded in
// scripts/dupes-baseline.json; the check fails on a new one, or on a known one
// that has reached another file, so the baseline only shrinks. When clones go,
// it says so: `--update` rewrites the baseline.
//
// Lines are compared with their whitespace collapsed; blank lines, imports,
// comments and lines of only brackets or closing tags are left out first.
// Names are not normalised: a renamed copy is not caught here, and a redraw
// (the /for/ plan teaser, 27 Oct) shares no lines at all. Those are the
// shared-pieces scan's job (apps/saroh.in/lib/consistency/shared-pieces.test.ts).
//
//   node scripts/check-dupes.mjs [--update] [--root DIR] [--baseline FILE]
import { createHash } from "node:crypto";
import {
    existsSync,
    readdirSync,
    readFileSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const MIN = 6;

export const SCOPE = [
    "apps/saroh.in/app",
    "apps/saroh.in/components",
    "apps/saroh.in/lib",
    "apps/saroh.in/content",
    "packages/search-pages/src",
];

const SKIP_DIRS = new Set(["node_modules", ".next", ".turbo", ".open-next"]);
// Tests and fixtures repeat by design; generated files aren't written by hand.
// The share-card routes wait for A24 (Next reads their exports by name).
const SKIP_FILE =
    /\.(test|spec|fixture|test-kit)\.[cm]?[jt]sx?$|\.gen\.ts$|\.d\.ts$|(^|\/)opengraph-image\.tsx$/;
const SOURCE = /\.(tsx?|css)$/;

function walk(root, dir, out) {
    const full = join(root, dir);
    if (!existsSync(full)) return out;
    for (const name of readdirSync(full)) {
        if (SKIP_DIRS.has(name)) continue;
        const rel = `${dir}/${name}`;
        if (statSync(join(root, rel)).isDirectory()) walk(root, rel, out);
        else if (SOURCE.test(name) && !SKIP_FILE.test(rel)) out.push(rel);
    }
    return out;
}

const TRIVIAL = /^(?:[()[\]{};,]+|<\/[\w.]*>[);,]*|\/>[);,]*|<>|<\/>)$/;

/** The lines that count, each with its line number. */
export function meaningful(source) {
    const kept = [];
    let inComment = false;
    let inImport = false;
    source.split("\n").forEach((raw, i) => {
        let line = raw.trim().replace(/\s+/g, " ");
        if (inComment) {
            if (line.includes("*/")) inComment = false;
            return;
        }
        // A multi-line import's names are the import too.
        if (inImport) {
            if (/^} from ["']/.test(line)) inImport = false;
            return;
        }
        if (/^import (?:type )?{$/.test(line)) {
            inImport = true;
            return;
        }
        if (line.startsWith("/*")) {
            if (!line.includes("*/")) inComment = true;
            return;
        }
        if (!line || line.startsWith("//") || line.startsWith("*")) return;
        if (/^import\b/.test(line) || /^} from ["']/.test(line)) return;
        line = line.replace(/[;,]$/, "");
        if (!line || TRIVIAL.test(line)) return;
        kept.push({ text: line, at: i + 1 });
    });
    return kept;
}

const hash = (lines) =>
    createHash("sha1").update(lines.join("\n")).digest("hex").slice(0, 12);

/**
 * The clone groups under `root`: runs of duplicated windows, each with the
 * files it appears in, its line count, its windows' hashes and where it is.
 */
export function findClones(root, scope = SCOPE, min = MIN) {
    const files = scope.flatMap((d) => walk(root, d, [])).sort();
    const windows = new Map(); // hash → Set(file)
    const perFile = new Map(); // file → [{ hash, from, to }]
    for (const file of files) {
        const lines = meaningful(readFileSync(join(root, file), "utf8"));
        const list = [];
        for (let i = 0; i + min <= lines.length; i++) {
            const h = hash(lines.slice(i, i + min).map((l) => l.text));
            list.push({
                hash: h,
                from: lines[i].at,
                to: lines[i + min - 1].at,
            });
            if (!windows.has(h)) windows.set(h, new Set());
            windows.get(h).add(file);
        }
        perFile.set(file, list);
    }
    const shared = (h) => windows.get(h).size > 1;
    const key = (h) => [...windows.get(h)].sort().join("\n");

    const groups = [];
    for (const [file, list] of perFile) {
        let run = null;
        const close = () => {
            if (run) groups.push(run);
            run = null;
        };
        list.forEach((w, i) => {
            const cloned = shared(w.hash);
            // Each group is read once, from the first of its files.
            const owner = cloned && [...windows.get(w.hash)].sort()[0] === file;
            if (!owner) return close();
            const k = key(w.hash);
            const prev = list[i - 1];
            if (
                run &&
                run.key === k &&
                prev &&
                run.windows.at(-1) === prev.hash
            ) {
                run.windows.push(w.hash);
                run.to = w.to;
                return;
            }
            close();
            run = {
                key: k,
                files: k.split("\n"),
                windows: [w.hash],
                from: w.from,
                to: w.to,
            };
        });
        close();
    }
    return groups.map((g) => {
        const set = new Set(g.windows);
        const where = g.files.map((f) => {
            const at = perFile.get(f).filter((w) => set.has(w.hash));
            return `${f}:${Math.min(...at.map((w) => w.from))}-${Math.max(...at.map((w) => w.to))}`;
        });
        return {
            lines: g.windows.length + min - 1,
            files: g.files,
            windows: g.windows,
            where,
        };
    });
}

export function toBaseline(groups) {
    return {
        note: "Clone groups that already exist (DEC-195). Only ever shrinks: node scripts/check-dupes.mjs --update after removing one.",
        minLines: MIN,
        groups: groups
            .map(({ lines, files, windows }) => ({ lines, files, windows }))
            .sort(
                (a, b) =>
                    b.lines - a.lines ||
                    a.files.join().localeCompare(b.files.join()),
            ),
    };
}

/** Groups with a window the baseline doesn't hold in all of its files, and what the baseline holds that is gone. */
export function compare(groups, baseline) {
    const known = new Map(); // window → Set(file)
    for (const g of baseline.groups) {
        for (const w of g.windows) {
            if (!known.has(w)) known.set(w, new Set());
            for (const f of g.files) known.get(w).add(f);
        }
    }
    const now = new Map();
    for (const g of groups)
        for (const w of g.windows) now.set(w, new Set(g.files));
    const fresh = groups.filter((g) =>
        g.windows.some((w) => !g.files.every((f) => known.get(w)?.has(f))),
    );
    const gone = baseline.groups.filter((g) =>
        g.windows.some(
            (w) => !now.has(w) || g.files.some((f) => !now.get(w).has(f)),
        ),
    );
    return { fresh, gone };
}

function main() {
    const args = process.argv.slice(2);
    const opt = (name, fallback) => {
        const i = args.indexOf(name);
        return i === -1 ? fallback : args[i + 1];
    };
    const root = opt("--root", join(import.meta.dirname, ".."));
    const file = opt("--baseline", join(root, "scripts/dupes-baseline.json"));
    const groups = findClones(root);
    const lines = groups.reduce((n, g) => n + g.lines, 0);

    if (args.includes("--update")) {
        writeFileSync(file, `${JSON.stringify(toBaseline(groups), null, 4)}\n`);
        console.log(
            `dupes: baseline written, ${groups.length} clone groups (${lines} lines)`,
        );
        return;
    }
    const baseline = existsSync(file)
        ? JSON.parse(readFileSync(file, "utf8"))
        : { groups: [] };
    const { fresh, gone } = compare(groups, baseline);
    for (const g of fresh) {
        console.error(
            `New copy of ${g.lines} lines (DEC-195: reuse the one, don't copy it):\n  ${g.where.join("\n  ")}`,
        );
    }
    if (fresh.length) {
        console.error(
            `\ndupes: ${fresh.length} new clone group(s). Move the block into one shared component or helper and import it.`,
        );
        process.exitCode = 1;
        return;
    }
    console.log(
        `dupes: ${groups.length} clone groups (${lines} lines), none new`,
    );
    if (gone.length) {
        console.log(
            `dupes: ${gone.length} baseline group(s) shrank or went: you can shrink the baseline (node scripts/check-dupes.mjs --update)`,
        );
    }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
