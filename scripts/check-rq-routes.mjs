// The workspace's read routes (DEC-259, KTD-3). Every
// `apps/app.saroh.in/app/api/**/route.ts` is built with `readRoute`, which
// owns the headers, the org check, the param allowlist and the generic
// error bodies, and nothing else is in the file:
//
//     export const dynamic = "force-dynamic";
//     export const GET = readRoute({ read, service }, access);
//     export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
//
// The routes below predate React Query and are not reads of a screen's
// data (a PDF, a print sheet, an image, a stream). They shrink, never grow:
// a listed route that is gone fails the check, so the list is kept true.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const API = "apps/app.saroh.in/app/api/";

export const ALLOWED = [
    "ask-ai/turns/[turnId]/stop/route.ts",
    "ask-ai/turns/route.ts",
    "invoices/[invoiceId]/pdf/route.ts",
    "qr-codes/[siteId]/[qrCodeId]/print/route.ts",
    "saroh-invoices/[invoiceId]/pdf/route.ts",
    "search/route.ts",
    "share/book/image/route.ts",
].map((f) => API + f);

const NEEDS = [
    [
        /^export const dynamic = ["']force-dynamic["'];?$/m,
        'export const dynamic = "force-dynamic"',
    ],
    [/^export const GET = readRoute\(/m, "export const GET = readRoute(…)"],
    [
        /^export const \{[^}]*\} = NOT_ALLOWED;?$/m,
        "export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED",
    ],
];

// Exports other than the three above.
const EXPORT =
    /^export\s+(?!const (dynamic|GET)\b|const \{[^}]*\} = NOT_ALLOWED)/gm;
const ANSWER = /\b(NextResponse|Response\.json|new Response)\b/g;

/** Problems in one route file's source: `{ line, why }`. */
export function routeProblems(text) {
    const out = [];
    const at = (index) => text.slice(0, index).split("\n").length;
    for (const [re, what] of NEEDS) {
        if (!re.test(text)) out.push({ line: 1, why: `needs ${what}` });
    }
    for (const m of text.matchAll(EXPORT)) {
        out.push({
            line: at(m.index),
            why: "exports something other than dynamic, GET = readRoute(…) and NOT_ALLOWED",
        });
    }
    for (const m of text.matchAll(ANSWER)) {
        out.push({
            line: at(m.index),
            why: `${m[1]}: answer only through readRoute`,
        });
    }
    return out;
}

/** Problems over the tree: route files and a stale allowlist. */
export function checkRoutes(root, files) {
    const out = [];
    for (const file of ALLOWED) {
        if (!files.includes(file)) {
            out.push(
                `${file}: listed in check-rq-routes ALLOWED but gone; drop it`,
            );
        }
    }
    for (const file of files) {
        if (ALLOWED.includes(file)) continue;
        const path = join(root, file);
        if (!existsSync(path)) continue;
        for (const p of routeProblems(readFileSync(path, "utf8"))) {
            out.push(`${file}:${p.line}: ${p.why}`);
        }
    }
    return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const files = execFileSync("git", ["ls-files", "--", `${API}*route.ts`], {
        cwd: root,
        encoding: "utf8",
    })
        .split("\n")
        .filter((f) => f.endsWith("/route.ts"));
    const problems = checkRoutes(root, files);
    for (const p of problems) console.error(p);
    if (problems.length) process.exitCode = 1;
    else
        console.log(
            `rq-routes: ${files.length} routes, ${files.length - ALLOWED.length} read routes all readRoute`,
        );
}
