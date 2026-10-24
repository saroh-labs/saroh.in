// A saroh.in page's sitemap date lives beside its words (R3, #1187): each
// content module (`apps/saroh.in/content/*.ts`) exports `UPDATED`, and each
// provider page (`content/integrations/*.mdx`) has `updated:` in its
// frontmatter. `lib/site-pages.ts` dates the page by it, never by the build.
// This fails when such a file changed since the merge base with
// origin/development (or the base passed) but its date didn't, so the
// sitemap can't go on saying the old day. A file with no date is left alone.
// Skipped where the base isn't fetched.
//
// `node scripts/check-content-dates.mjs [base]`, run from inside the repo.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const git = (...args) =>
    execFileSync("git", args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
    }).trim();

function tryGit(...args) {
    try {
        return git(...args);
    } catch {
        return null;
    }
}

const base = process.argv[2] ?? "origin/development";
const root = git("rev-parse", "--show-toplevel");
const mb = tryGit("merge-base", base, "HEAD");
if (!mb) {
    console.log(`content-dates: ${base} not found, skipped`);
    process.exit(0);
}

const CONTENT =
    /^apps\/saroh\.in\/content\/(?:[^/]+\.ts|integrations\/[^/]+\.mdx)$/;
const TEST = /\.test\.ts$/;

/** The file's date, or null when it carries none. */
function dateOf(source) {
    const m =
        source.match(/^export const UPDATED(?::\s*\w+)?\s*=\s*"([^"]*)"/m) ??
        source.match(/^updated:\s*"?([^"\s#]+)"?/m);
    return m ? m[1] : null;
}

// Against the working tree, so an uncommitted edit counts too.
const changed = git("diff", "--name-only", mb, "--", "apps/saroh.in/content")
    .split("\n")
    .filter((p) => CONTENT.test(p) && !TEST.test(p));

const stale = [];
for (const path of changed) {
    const file = join(root, path);
    if (!existsSync(file)) continue;
    const now = dateOf(readFileSync(file, "utf8"));
    const before = tryGit("show", `${mb}:${path}`);
    const then = before === null ? null : dateOf(before);
    if (now === null && then === null) continue;
    if (now === null) {
        stale.push(`${path}: its date was removed (was ${then})`);
    } else if (now === then) {
        stale.push(`${path}: its words changed, its date is still ${now}`);
    }
}

if (stale.length > 0) {
    console.error(
        `content-dates: ${stale.length} page(s) changed without a new date:\n` +
            stale.map((s) => `  ${s}`).join("\n") +
            "\nSet the date (UPDATED, or updated: in the frontmatter) to the day " +
            "the words changed: it is the page's lastmod in the sitemap.",
    );
    process.exit(1);
}
console.log(
    `content-dates: ${changed.length} content file(s) changed since ${base}, all dated`,
);
