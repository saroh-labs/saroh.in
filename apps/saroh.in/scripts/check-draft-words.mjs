// A production-like build of saroh.in carries no word or file of a GST
// page, guide or download that isn't live (plan 2026-10-31-002, R3, R9).
//
// It answers the build's publish-list read itself (a stand-in API on a free
// port) with only one GST page LIVE, a page with unconfirmed facts (so the
// build must hold it back), builds the site as a deploy does (`pnpm
// cf:build`: the prebuild steps, `next build`, OpenNext), and fails if a sentence
// of any of those pages, or a download's file, is anywhere in `.next`,
// `.open-next` or `public/`. A /for/ page's words, live in the same list,
// must be found: the scan proves it can see. The sitemap index and its
// group sitemaps must be static files, with no group for the held page.
//
// Run: pnpm run check:draft-words (prepush --int/--e2e/--all, when saroh.in
// or @saroh/search-pages changed). It rebuilds apps/saroh.in's .next, so
// stop `pnpm dev` first, and puts back the publish list it found.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE = path.join(APP, "../../packages/search-pages");
const LIST = path.join(APP, ".search-pages.json");
const HELD = "/gst/salon-and-beauty-services";
const LIVE_FOR = "/for/salons";

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---/;
const frontmatter = (file) =>
    parse(FENCE.exec(fs.readFileSync(file, "utf8"))?.[1] ?? "");

/** A page's sentences long enough to be its own, with nothing a page escapes (quotes, &, <). */
function markersOf(fm) {
    return [fm.h1, fm.description, fm.lead]
        .filter((t) => typeof t === "string")
        .flatMap((t) => t.split(/[.:;!?(),]/))
        .map((t) => t.trim())
        .filter((t) => t.length >= 25 && !/[&'"<>’]/.test(t));
}

/** The live /for/ and tool pages' words: a phrase they share isn't a draft's own. */
const liveText = ["for", "tools"]
    .flatMap((kind) => {
        const dir = path.join(PACKAGE, "content", kind);
        return fs
            .readdirSync(dir)
            .map((f) => fs.readFileSync(path.join(dir, f), "utf8"));
    })
    .join("\n")
    .toLowerCase();

/** Every GST page, guide and download in the code; none is live in this build. */
const docs = ["gst", "guides", "downloads"].flatMap((kind) => {
    const dir = path.join(PACKAGE, "content", kind);
    return fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".mdx"))
        .map((f) => ({
            path: `/${kind}/${f.slice(0, -4)}`,
            markers: markersOf(frontmatter(path.join(dir, f))).filter(
                (m) => !liveText.includes(m.toLowerCase()),
            ),
        }));
});
const files = fs.readdirSync(path.join(PACKAGE, "content/downloads/files"), {
    recursive: true,
});
const fileNames = files
    .filter((f) => path.extname(f))
    .map((f) => path.basename(f));
const seen = markersOf(
    frontmatter(path.join(PACKAGE, `content/for/${LIVE_FOR.slice(5)}.mdx`)),
)[0];
if (!seen) throw new Error(`${LIVE_FOR} has no sentence to look for`);
if (docs.some((d) => d.markers.length === 0))
    throw new Error(
        `no sentence to look for in ${docs.filter((d) => !d.markers.length).map((d) => d.path)}`,
    );

const run = (cmd, args, env = {}) =>
    execFileSync(cmd, args, {
        cwd: APP,
        stdio: "inherit",
        env: { ...process.env, ...env },
    });

const before = fs.existsSync(LIST) ? fs.readFileSync(LIST) : null;
const api = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    // Anything else is "nothing published" (no catalogue, no offer), as the
    // API says it with a 404: a production build reads those too.
    if (req.url !== "/public/search-pages") res.statusCode = 404;
    res.end(
        req.url === "/public/search-pages"
            ? JSON.stringify({ live: [LIVE_FOR, HELD], takenOff: [] })
            : "{}",
    );
});
await new Promise((r) => api.listen(0, "127.0.0.1", () => r(undefined)));
const address = api.address();
const API_URL = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
let failed = [];
try {
    // Async: the stand-in API answers from this process while the build runs.
    await new Promise((resolve, reject) =>
        spawn("pnpm", ["cf:build"], {
            cwd: APP,
            stdio: "inherit",
            env: {
                ...process.env,
                API_URL,
                // A production deploy's build: only live pages, no preview.
                VERCEL_ENV: "production",
                SITE_RELAY_SECRET: "check-draft-words-not-a-real-secret",
                RESOURCES_PREVIEW: "",
                NEXT_TELEMETRY_DISABLED: "1",
            },
        }).on("exit", (code) =>
            code === 0
                ? resolve(undefined)
                : reject(new Error(`cf:build: exit ${code}`)),
        ),
    );
    const list = JSON.parse(fs.readFileSync(LIST, "utf8"));
    if (list.preview !== false)
        failed.push(
            ".search-pages.json says preview: the build didn't read the stand-in list",
        );

    /** @param {string} dir */
    const walk = (dir) =>
        !fs.existsSync(dir)
            ? []
            : fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
                  const p = path.join(dir, e.name);
                  // The compile cache and `next dev`'s output aren't what ships.
                  if (/[/\\]\.next[/\\](cache|dev)$/.test(p)) return [];
                  // A link points into node_modules (standalone output): not this build's own files.
                  if (e.isSymbolicLink()) return [];
                  return e.isDirectory() ? walk(p) : [p];
              });
    const shipped = [".next", ".open-next", "public"].flatMap((d) =>
        walk(path.join(APP, d)),
    );
    const markers = docs.flatMap((d) =>
        d.markers.map((m) => ({ page: d.path, m, buf: Buffer.from(m) })),
    );
    let sawLive = false;
    for (const file of shipped) {
        const base = path.basename(file);
        if (fileNames.includes(base))
            failed.push(`${path.relative(APP, file)}: a download's file`);
        const body = fs.readFileSync(file);
        if (!sawLive && body.includes(seen)) sawLive = true;
        for (const { page, m, buf } of markers)
            if (body.includes(buf))
                failed.push(`${path.relative(APP, file)}: "${m}" (${page})`);
    }
    if (!sawLive)
        failed.push(
            `the live ${LIVE_FOR}'s words ("${seen}") are in no output: the scan can't see`,
        );
    // The sitemap index and its groups are static files (plan U5): one per
    // group with a live page (/for/salons here), none for the held GST page.
    const out = (p) => path.join(APP, ".next/server/app", `${p}.body`);
    for (const p of ["sitemap.xml", "sitemap/pages.xml", "sitemap/for.xml"])
        if (!fs.existsSync(out(p)))
            failed.push(`${p} wasn't built as a static file`);
    if (fs.existsSync(out("sitemap/gst.xml")))
        failed.push("sitemap/gst.xml was built with no live GST page");
    if (
        fs.existsSync(out("sitemap.xml")) &&
        fs.readFileSync(out("sitemap.xml"), "utf8").includes("/sitemap/gst.xml")
    )
        failed.push("the sitemap index names gst.xml with no live GST page");
    const state = path.join(APP, ".open-next");
    if (!fs.existsSync(state)) failed.push(".open-next wasn't written");
} finally {
    api.close();
    if (before) fs.writeFileSync(LIST, before);
    else fs.rmSync(LIST, { force: true });
    // Back to the copy the next `pnpm dev` or build would write.
    run("pnpm", ["exec", "tsx", "docs-content.config.ts"]);
}

if (failed.length) {
    console.error(
        `check:draft-words: a page that isn't live reached the build:\n  ${failed.slice(0, 40).join("\n  ")}`,
    );
    process.exit(1);
}
console.log(
    `check:draft-words: ${docs.length} pages not live, none of their words or files in .next, .open-next or public/`,
);
