// Every link inside docs.saroh.in must reach a page or a file the site
// serves (plan 2026-11-10-001, U16). Links to other sites aren't fetched.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const app = join(import.meta.dirname, "../apps/docs.saroh.in");
const content = join(app, "content");

// `](/path)` in Markdown and `href="/path"` in JSX; site-absolute only.
const LINK = /\]\((\/[^)\s]*)\)|href="(\/[^"]*)"/g;

export function linksIn(text) {
    return [...text.matchAll(LINK)].map((m) => m[1] ?? m[2]);
}

export function resolves(link) {
    const path = link.split(/[#?]/)[0].replace(/\/$/, "");
    // The Worker sends / to the API overview (worker/index.mjs).
    if (path === "") return existsSync(join(content, "api", "index.mdx"));
    return [
        join(app, "public", path),
        join(content, `${path}.mdx`),
        join(content, path, "index.mdx"),
    ].some((file) => existsSync(file));
}

function* pages(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const file = join(dir, entry.name);
        if (entry.isDirectory()) yield* pages(file);
        else if (entry.name.endsWith(".mdx")) yield file;
    }
}

// Self-check: both link forms are found, anchors are ignored, a gap fails.
console.assert(
    linksIn(
        '[a](/api/keys#x) <a href="/api/v1.json">b</a> [c](https://x.y)',
    ).join() === "/api/keys#x,/api/v1.json",
);
console.assert(resolves("/api/keys#x") && !resolves("/api/no-such-page"));

const broken = [];
for (const file of pages(content)) {
    for (const link of linksIn(readFileSync(file, "utf8"))) {
        if (!resolves(link)) broken.push(`${relative(app, file)}: ${link}`);
    }
}
if (broken.length) {
    console.error(`docs links that reach nothing:\n  ${broken.join("\n  ")}`);
    process.exit(1);
}
console.log("docs-links: every link resolves");
