#!/usr/bin/env node
/**
 * Every page of the three signed-in apps (the workspace, accounts, the
 * operator console) says what its tab is, and none of them can be indexed.
 *
 * Until 12 Oct 2026 nothing checked either. Home had no title, a client
 * page showed "Sign in · Saroh" to someone signed in, and the apps stayed
 * out of search engines only because they redirect to sign-in
 * (DEV_LEARNINGS, "the signed-in apps were unindexed by accident").
 *
 * What it reads, off disk, for each app:
 *
 * - the root `app/layout.tsx` has `robots: { index: false, follow: false }`
 *   and a title template, so a page writes only its own name;
 * - every `page.tsx` exports `metadata` with a `title`, or
 *   `generateMetadata`. A page that only redirects or answers not-found
 *   draws no tab and needs none. A client page can't export either, so a
 *   `layout.tsx` beside it must;
 * - every `not-found.tsx` has a title too: without one the tab keeps the
 *   name of the page that wasn't found;
 * - no title ends in the app's own name, which the template adds.
 *
 * It can't read a title that is computed, so it can't see a person's name in
 * one. That rule is in `docs/patterns/frontend-app-structure.md` → Titles:
 * a record is named by its reference or the business's own nouns, never by
 * a person, an address, a phone number or an amount.
 *
 * Run from the repo root.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const APPS = [
    "apps/app.saroh.in",
    "apps/accounts.saroh.in",
    "apps/admin.saroh.in",
];

/**
 * Pages that draw something and still have no title of their own, each with
 * why. Keep it short: a title is one line.
 */
const ALLOWED = new Map([
    // (none)
]);

/** Walk a directory tree, yielding absolute file paths. */
function* walk(dir) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            if (entry === "node_modules" || entry.startsWith(".")) continue;
            yield* walk(full);
        } else {
            yield full;
        }
    }
}

/** The source with its comments taken out, so a commented-out export doesn't count. */
function code(file) {
    return readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
}

/** The text of `export const metadata… = { … };`, or null. */
function staticMetadata(source) {
    const start = /export const metadata\b[^=]*=\s*\{/.exec(source);
    if (!start) return null;
    const end = source.indexOf("};", start.index);
    return source.slice(start.index, end === -1 ? undefined : end + 2);
}

function hasGenerateMetadata(source) {
    return /export\s+(?:async\s+)?function\s+generateMetadata\b|export\s+const\s+generateMetadata\b/.test(
        source,
    );
}

/**
 * Whether a file names the tab: a static title, or a function that sets one
 * (`title:` written out, or the workspace's `recordTitle`, which always
 * answers with one).
 */
function namesTheTab(source) {
    const fixed = staticMetadata(source);
    if (fixed && /\btitle\s*:/.test(fixed)) return true;
    return (
        hasGenerateMetadata(source) &&
        /\btitle\s*:|\brecordTitle\(/.test(source)
    );
}

/**
 * A `generateMetadata` that can answer with nothing (`cond ? { title } : {}`,
 * `return {};`), which leaves the tab on the bare default. Settings › Plan
 * and billing did, while plans were hidden.
 */
function canAnswerEmpty(source) {
    const at = source.search(/\bgenerateMetadata\b/);
    if (at === -1) return false;
    const body = source.slice(at, at + 600);
    return /:\s*\{\s*\}\s*;|return\s*\{\s*\}\s*;/.test(body);
}

/** Draws nothing: no JSX is returned, and it redirects or answers not-found. */
function onlySendsOn(source) {
    const draws = /(?:return|=>)\s*\(?\s*<[A-Za-z>]/.test(source);
    return !draws && /\b(?:redirect|permanentRedirect|notFound)\(/.test(source);
}

const problems = [];
let pages = 0;
let sentOn = 0;

for (const app of APPS) {
    const appDir = join(ROOT, app, "app");
    const name = (file) => relative(ROOT, file);

    const root = join(appDir, "layout.tsx");
    const rootSource = code(root);
    if (
        !/robots\s*:\s*\{\s*index\s*:\s*false\s*,\s*follow\s*:\s*false\s*,?\s*\}/.test(
            rootSource,
        )
    )
        problems.push(
            `${name(root)}: the root layout's metadata must say robots: { index: false, follow: false }`,
        );
    if (!/\btemplate\s*:\s*["'`]%s · /.test(rootSource))
        problems.push(
            `${name(root)}: the root layout's title needs a template ("%s · …"), so a page writes only its own name`,
        );

    for (const file of walk(appDir)) {
        const isPage = /[/\\]page\.tsx$/.test(file);
        const isNotFound = /[/\\]not-found\.tsx$/.test(file);
        if (!isPage && !isNotFound) continue;
        const source = code(file);

        // The template adds the app's name; a page that writes it says it twice.
        // (`title: { absolute: … }` is how a page opts out, and isn't matched.)
        const doubled =
            /\btitle\s*:\s*["'`][^"'`\n]* · Saroh(?: console)?["'`]/.exec(
                source,
            );
        if (doubled)
            problems.push(
                `${name(file)}: the title ends in the app's name, which the root layout's template already adds`,
            );

        if (isNotFound) {
            if (!namesTheTab(source))
                problems.push(
                    `${name(file)}: a not-found page needs a title ("Page not found", "Order not found"), or the tab keeps the missing page's`,
                );
            continue;
        }

        pages += 1;
        if (canAnswerEmpty(source))
            problems.push(
                `${name(file)}: generateMetadata can answer with no title ({}); name the page in every case`,
            );
        if (namesTheTab(source)) continue;
        if (onlySendsOn(source)) {
            sentOn += 1;
            // `--list` names them, so what was let through can be read.
            if (process.argv.includes("--list"))
                console.log(`  only redirects: ${name(file)}`);
            continue;
        }
        // A client page can't export metadata; a layout beside it can.
        const beside = join(dirname(file), "layout.tsx");
        if (existsSync(beside) && namesTheTab(code(beside))) continue;
        if (ALLOWED.has(name(file))) continue;
        problems.push(
            `${name(file)}: no title. Export \`metadata = { title: "…" }\` or \`generateMetadata\` (a client page: in a layout.tsx beside it)`,
        );
    }
}

for (const file of ALLOWED.keys())
    if (!existsSync(join(ROOT, file)))
        problems.push(`ALLOWED names ${file}, which no longer exists`);

if (problems.length) {
    console.error(`check:titles:\n  ${problems.join("\n  ")}`);
    console.error(
        "\nA title says what the tab is: the page, or a record by its reference or name, never a person.\nSee docs/patterns/frontend-app-structure.md → Titles.\n",
    );
    process.exit(1);
}
console.log(
    `check:titles: ${pages} pages in ${APPS.length} apps (${sentOn} only redirect), every one titled and none indexable`,
);
