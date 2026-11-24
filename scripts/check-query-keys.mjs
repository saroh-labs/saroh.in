// React Query keys and fetchers in the workspace (DEC-259, KTD-2). A key
// that holds a business's rows starts `[domain, orgId, ...]` and is built by
// `domainKey` in `lib/<domain>/queries.ts` (or `lib/query/`), never inline
// in a component: an inline key can drop the org and hand business A's rows
// to business B. Every fetcher is `defineRead`'s, which sends the org from
// its own key (`x-organization-id`), never the cookie alone (U2 security
// review, 24 Nov 2026), so `apiRead` and `queryFn` live in `lib/query/`.
// The server QueryClient (`lib/query/server-client`) is per request and
// `server-only`; a "use client" file never imports it.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const APP = "apps/app.saroh.in/";

const isTest = (file) =>
    /\.(test|spec)\.tsx?$/.test(file) || file.endsWith("/test-utils.tsx");
const inQueryLib = (file) => file.startsWith(`${APP}lib/query/`);
const isQueriesFile = (file) =>
    new RegExp(`^${APP}lib/[^/]+/queries\\.ts$`).test(file);

const RULES = [
    {
        re: /\bdomainKey\s*\(/g,
        allowed: (f) => inQueryLib(f) || isQueriesFile(f),
        why: "build keys with domainKey in lib/<domain>/queries.ts, not here",
    },
    {
        re: /\bqueryKey\s*:\s*\[/g,
        allowed: () => false,
        why: "inline query key: use a key from lib/<domain>/queries.ts (domainKey)",
    },
    {
        re: /\bapiRead\s*(<[^>()]*>)?\s*\(/g,
        allowed: (f) =>
            f === `${APP}lib/query/define-read.ts` ||
            f === `${APP}lib/query/api-read.ts`,
        why: "fetch through defineRead, which sends the org from the query key",
    },
    {
        re: /\bqueryFn\s*:/g,
        allowed: inQueryLib,
        why: "a fetcher outside lib/query: use defineRead, which sends the org from the query key",
    },
];

const CLIENT = /^\s*(\/\/[^\n]*\n\s*)*["']use client["']/;
const SERVER_CLIENT =
    /from\s+["'](@\/lib\/query\/server-client|[./]+\/server-client)["']/g;

/** Problems in one app file: `{ line, why }`. */
export function keyProblems(file, text) {
    if (!file.startsWith(APP) || isTest(file)) return [];
    const out = [];
    const at = (index) => text.slice(0, index).split("\n").length;
    for (const rule of RULES) {
        if (rule.allowed(file)) continue;
        for (const m of text.matchAll(rule.re)) {
            out.push({ line: at(m.index), why: rule.why });
        }
    }
    if (CLIENT.test(text)) {
        for (const m of text.matchAll(SERVER_CLIENT)) {
            out.push({
                line: at(m.index),
                why: "a client file imports the per-request server QueryClient",
            });
        }
    }
    return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const files = execFileSync(
        "git",
        ["ls-files", "--", `${APP}*.ts`, `${APP}*.tsx`],
        { cwd: root, encoding: "utf8" },
    )
        .split("\n")
        .filter(Boolean);
    let found = 0;
    for (const file of files) {
        const path = join(root, file);
        if (!existsSync(path)) continue;
        for (const p of keyProblems(file, readFileSync(path, "utf8"))) {
            console.error(`${file}:${p.line}: ${p.why}`);
            found += 1;
        }
    }
    if (found) process.exitCode = 1;
    else
        console.log(
            `query-keys: ${files.length} files, every key and fetcher in its place`,
        );
}
