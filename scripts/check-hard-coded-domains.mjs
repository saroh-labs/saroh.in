// A new address written into shared code would send one edition's people to
// the other's site (DEC-204). Addresses come from `@saroh/edition` or a
// deployment's env. The ones already there are counted in
// hard-coded-domains.json, which only goes down. Each edition's own marketing
// site and the docs, help, templates and UI sites aren't shared, so they aren't
// scanned.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const ADDRESS =
    /(?<![\w/-])(?:[\w-]+\.)*saroh\.(?:in|io|tech)(?![\w.-]*\.(?:ts|tsx|js|mjs|json))\b/;
const SKIP_FILE =
    /\.(spec|test|db\.spec)\.|\/(e2e|prisma|seed[^/]*)\/|\/seed[^/]*$|^packages\/edition\//;

// What only India reads. Formatters take these from the edition or the
// currency; the count here is what's left for stages 4 and 5.
const INDIA_ONLY = /en-IN|Asia\/Kolkata|₹|\+91/;

export function codeLines(text, pattern) {
    return text.split("\n").filter((line) => {
        const code = line.trim();
        if (/^(\/\/|\*|\/\*|\{\/\*)/.test(code)) return false;
        return pattern.test(code);
    }).length;
}

function scan(pattern) {
    const files = execFileSync(
        "git",
        [
            "ls-files",
            "apps/app.saroh.in",
            "apps/accounts.saroh.in",
            "apps/admin.saroh.in",
            "apps/api.saroh.in/src",
            "apps/saroh.app",
            "packages",
        ],
        { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 },
    )
        .split("\n")
        .filter((f) => /\.(ts|tsx|js|mjs|cjs)$/.test(f) && !SKIP_FILE.test(f));
    const counts = {};
    for (const file of files) {
        const n = codeLines(readFileSync(join(root, file), "utf8"), pattern);
        if (n > 0) counts[file] = n;
    }
    return counts;
}

// Self-check: a comment doesn't count, a link does, a file path doesn't.
console.assert(
    codeLines(
        '// see saroh.in\nconst a = "https://app.saroh.tech";\nimport "./apps.saroh.in.ts";',
        ADDRESS,
    ) === 1,
);

const KINDS = [
    { pattern: ADDRESS, file: "hard-coded-domains.json", what: "address" },
    {
        pattern: INDIA_ONLY,
        file: "hard-coded-india.json",
        what: "India-only format",
    },
];
let failed = false;
for (const { pattern, file, what } of KINDS) {
    const path = join(root, "scripts", file);
    const counts = scan(pattern);
    if (process.argv.includes("--write")) {
        writeFileSync(path, `${JSON.stringify(counts, null, 4)}\n`);
        console.log(`${file}: ${Object.keys(counts).length} files.`);
        continue;
    }
    const baseline = JSON.parse(readFileSync(path, "utf8"));
    for (const [name, n] of Object.entries(counts)) {
        if (n <= (baseline[name] ?? 0)) continue;
        failed = true;
        console.error(
            `${name}: ${n} hard-coded ${what} line(s), allowed ${baseline[name] ?? 0}. Use @saroh/edition, the currency or the deployment's env.`,
        );
    }
    if (!failed) {
        console.log(
            `No new hard-coded ${what} lines (${Object.keys(counts).length} files counted).`,
        );
    }
}
if (failed) process.exit(1);
