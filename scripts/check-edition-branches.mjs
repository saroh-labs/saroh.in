// Settings over branches (DEC-204 item 7): code asks its edition's profile in
// `@saroh/edition` what it needs ("which tax system?"), never "is this India?".
// So no `=== "GLOBAL"`, `!== "INDIA"` or `case "GLOBAL":` outside the package,
// the identity files below and tests. A third edition then means a profile,
// not a hunt through every branch.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const SCOPE = ["apps", "packages"];

/**
 * Where naming an edition is the point, not a stand-in for a fact: each
 * reads which edition something is, rather than deciding what it does.
 */
export const IDENTITY = [
    // The package itself: the profiles, the country rule, the host tables.
    "packages/edition/",
    // A merchant site's footer reads which edition the API says it is in.
    "apps/saroh.app/lib/site-footer.ts",
    // The Global seed checks it made a Global business.
    "packages/database/src/seed/global/run.ts",
];

const TEST = /(\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)(__tests__|test|e2e)\/)/;
const SOURCE = /\.[cm]?[jt]sx?$/;

const NAME = String.raw`["'\`](GLOBAL|INDIA)["'\`]`;
const BRANCHES = [
    // x === "GLOBAL", with the left side kept to tell a country from an edition
    new RegExp(String.raw`([\w$.?\])]*)\s*[!=]==?\s*${NAME}`, "g"),
    new RegExp(String.raw`${NAME}\s*[!=]==?`, "g"),
    new RegExp(String.raw`\bcase\s+${NAME}`, "g"),
];

// A stored country written in full ("India") is a country, not an edition.
const COUNTRY = /(^|\.)(country|code)$/i;

/** Each edition branch in a file's text, as `line: text`. Pure. */
export function findBranches(text) {
    const found = [];
    for (const pattern of BRANCHES) {
        for (const m of text.matchAll(pattern)) {
            if (pattern === BRANCHES[0] && COUNTRY.test(m[1])) continue;
            const line = text.slice(0, m.index).split("\n").length;
            found.push(`${line}: ${m[0].replace(/\s+/g, " ").trim()}`);
        }
    }
    return found;
}

export function filesIn(root, scope = SCOPE) {
    return execFileSync("git", ["ls-files", "--", ...scope], {
        cwd: root,
        encoding: "utf8",
    })
        .split("\n")
        .filter(
            (f) =>
                SOURCE.test(f) &&
                !TEST.test(f) &&
                !IDENTITY.some((i) => f === i || f.startsWith(i)),
        );
}

function main() {
    const root = process.argv[2] ?? join(import.meta.dirname, "..");
    const files = filesIn(root);
    // A moved folder must not pass by scanning nothing.
    if (files.length === 0) {
        console.error(`edition-branches: nothing to check in ${SCOPE}`);
        process.exit(1);
    }
    let bad = 0;
    for (const file of files) {
        for (const hit of findBranches(
            readFileSync(join(root, file), "utf8"),
        )) {
            console.error(
                `${file}:${hit} — ask editionProfile() in @saroh/edition for the fact instead (DEC-204 item 7).`,
            );
            bad += 1;
        }
    }
    if (bad) process.exit(1);
    console.log(`edition-branches: ${files.length} files, no edition branch`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
    main();
