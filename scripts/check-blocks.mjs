#!/usr/bin/env node
/**
 * Gates G2 and G6 (#252) — the two rules that keep merchant sites merchant-
 * coloured, and keep there being exactly one renderer.
 *
 * G2  No Saroh design token may be drawn by a site block.
 * G6  No component outside packages/site-blocks may draw the --site-* layer.
 *
 * Both encode failures this repository has already had, which is the only
 * reason they are worth a script:
 *
 *   - `apps/app.saroh.in`'s section preview was built from 35 usages of Saroh's
 *     own palette, so a merchant previewing their bakery saw Saroh's colours
 *     and nothing they chose could change them.
 *   - Two renderers drifted apart until #189 shipped: the editor honoured a
 *     per-section padding the live site ignored.
 *
 * Run from the repo root. Follows `check-app-routes.mjs`.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const BLOCKS = join(ROOT, "packages/site-blocks/src");

/**
 * Saroh's own token utilities. A block writing one of these is painting a
 * merchant's website in Saroh's colours.
 */
const SAROH_TOKENS = [
    "primary",
    "secondary",
    "muted",
    "accent",
    "card",
    "popover",
    "brand",
    "brand-surface",
    "highlight",
    "ring",
    "input",
    "foreground",
    "background",
    "border",
    "destructive",
];
const SAROH_TOKEN_RE = new RegExp(
    `\\b(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline|placeholder|shadow)-(?:${SAROH_TOKENS.join("|")})\\b(?![\\w-])`,
    "g",
);

/**
 * The one sanctioned exception, and it is deliberate.
 *
 * `destructiveAlertClasses` is Saroh's OWN chrome — a rejected form, a receipt
 * that would not load — appearing on a page whose palette is not ours. Red text
 * cannot survive an arbitrary merchant ground: `--destructive` measures 5.43:1
 * on the light one and 3.87:1 on the dark. So the alert brings its own opaque
 * ground, measured against itself, and reads identically whatever the merchant
 * picked. See the note in `packages/site-blocks/src/alert.ts`.
 *
 * Narrow on purpose: this file and this token pair only.
 */
const G2_EXCEPTIONS = new Map([
    [
        "packages/site-blocks/src/alert.ts",
        /^(?:bg|text)-destructive(?:-foreground)?$/,
    ],
    /*
     * KNOWN ISSUE, not a sanctioned exception — see #263.
     *
     * These two are a bare `text-destructive` on a required-field asterisk,
     * drawn straight onto the merchant's page ground. That is precisely what
     * `alert.ts` explains cannot be done: `--destructive` measures 5.43:1 on
     * the merchant light ground and only 3.87:1 on the dark one, which is why
     * the alert a few lines away brings its OWN opaque ground and is measured
     * against itself. The asterisks were missed because nothing was checking.
     *
     * Listed rather than fixed because #252 Step 2 moved these files verbatim,
     * and changing what a published merchant site draws is not something to
     * smuggle into a move. Remove both entries with the fix.
     */
    ["packages/site-blocks/src/blocks/enquiry.tsx", /^text-destructive$/],
    ["packages/site-blocks/src/blocks/booking.tsx", /^text-destructive$/],
]);

/** `--site-*` drawn either as a `site-` utility or as an arbitrary value. */
const SITE_LAYER_RE =
    /(?:\b(?:bg|text|border|ring|divide|from|to|via)-site-[\w-]+\b)|(?:var\(--site-[\w-]+\))/;

/**
 * Source with comments removed.
 *
 * The first run of this script failed on its own documentation: a comment in
 * `lib/utils.ts` explaining why blocks must not use `bg-primary` contains the
 * string `bg-primary`. A checker that cannot tell a warning from a violation
 * teaches people to ignore it.
 */
function code(source) {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

async function* walk(dir) {
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (
                ["node_modules", ".next", "dist", ".turbo"].includes(entry.name)
            )
                continue;
            yield* walk(full);
        } else if (
            /\.tsx?$/.test(entry.name) &&
            !/\.test\.tsx?$/.test(entry.name)
        ) {
            yield full;
        }
    }
}

const failures = [];

// ---- G2: no Saroh tokens inside the blocks package -------------------------
for await (const file of walk(BLOCKS)) {
    const rel = relative(ROOT, file);
    const source = await readFile(file, "utf8");
    const allowed = G2_EXCEPTIONS.get(rel);
    for (const match of code(source).matchAll(SAROH_TOKEN_RE)) {
        if (allowed?.test(match[0])) continue;
        const line = code(source).slice(0, match.index).split("\n").length;
        failures.push(
            `G2  ${rel}:${line}  "${match[0]}" is a Saroh design token. Merchant sites render off --site-* only (#252).`,
        );
    }
}

// ---- G6: no SECOND implementation of a block ------------------------------
/**
 * Files outside the blocks package that may legitimately draw `--site-*`.
 *
 * The first draft of this gate banned the merchant token layer everywhere but
 * `packages/site-blocks`, and it immediately flagged seven files. It was wrong,
 * and usefully so: the site layer is not only for blocks. Saroh renders several
 * surfaces ON a merchant's page — their header and footer, a checkout, a blog
 * post, a 404 — and every one of them SHOULD wear the merchant's palette rather
 * than Saroh's. That is the same principle as the blocks, not an exception to
 * it.
 *
 * What the gate actually protects is that there is one implementation of a
 * BLOCK. So this is an allowlist, and it is the list of Saroh surfaces that
 * live on a merchant's page. Adding to it should require saying why.
 */
const SITE_LAYER_ALLOWED = new Set([
    // The merchant's own header and footer. Chrome, not sections — #253 decides
    // whether that changes.
    "apps/saroh.app/components/site-chrome.tsx",
    // Saroh surfaces on a merchant's page, in the merchant's palette.
    "apps/saroh.app/components/checkout.tsx",
    "apps/saroh.app/components/post-view.tsx",
    "apps/saroh.app/app/[domain]/[slug]/not-found.tsx",
    "apps/saroh.app/app/[domain]/layout.tsx",
    "apps/saroh.app/app/preview/[token]/layout.tsx",
    // The error and loading boundaries, same category as the 404 above: a
    // Saroh surface on a merchant's page, which should wear the merchant's
    // palette rather than ours. They draw no block — a heading, a line of
    // copy, and a CTA from ctaClasses() — so there is still one implementation
    // of every block.
    //
    // The root boundary is in this app but not under [domain], because a throw
    // inside [domain]/layout.tsx belongs to the parent segment. That is also
    // the case where SiteTheme has not mounted, so it mounts SiteTheme itself
    // on the neutral defaults: a visitor on a merchant's domain must not be
    // shown Saroh's brand just because we could not load the merchant's.
    "apps/saroh.app/app/error.tsx",
    "apps/saroh.app/app/[domain]/error.tsx",
    "apps/saroh.app/app/[domain]/loading.tsx",
    "apps/saroh.app/app/preview/[token]/error.tsx",
    "apps/saroh.app/app/preview/[token]/loading.tsx",
    // The catalog's preview document. Same category as the layouts above: it
    // supplies the merchant's page GROUND so a block has one to sit on, and
    // without it every palette would look identical behind the section. It
    // draws no block of its own — it renders SectionRenderer from the package.
    "apps/ui.saroh.in/app/preview/[type]/page.tsx",
    // The site editor's preview frame. Same category: it supplies the
    // merchant's page ground and the selection outlines around each block, and
    // delegates every block to @saroh/site-blocks rather than drawing one.
    "apps/app.saroh.in/components/sites/section-preview.tsx",
    // Version history's preview of a past version (#283). The same category as
    // the editor's frame directly above: it supplies the merchant's page ground
    // — in the palette THAT version was published with, read from its snapshot —
    // and hands every section to PageSections. It draws no block of its own,
    // which is the point: a past version has to be shown by the renderer that
    // served it, or the preview is a second opinion about what went live.
    "apps/app.saroh.in/components/sites/past-version-preview.tsx",
]);

/**
 * Files that once held a second implementation of the blocks.
 *
 * `apps/app.saroh.in/components/sites/section-preview.tsx` was 362 lines, of
 * which 240 drew the same six designs `saroh.app` drew, in different code. #189
 * is the two of them disagreeing in production. #252 Step 4 deleted that half:
 * the editor previews with `@saroh/site-blocks` now, and what is left in the
 * file is the editing chrome that was never duplicated.
 *
 * Empty, and it should stay empty. A new entry here means someone has started
 * drawing blocks a second time.
 */
const PENDING_REMOVAL = new Set([]);

const SEARCH_ROOTS = ["apps", "packages"];
for (const root of SEARCH_ROOTS) {
    for await (const file of walk(join(ROOT, root))) {
        const rel = relative(ROOT, file);
        if (rel.startsWith("packages/site-blocks/")) continue;
        if (SITE_LAYER_ALLOWED.has(rel) || PENDING_REMOVAL.has(rel)) continue;
        // The Tailwind configs must name the namespace; that is what makes the
        // classes exist. Declaring is not drawing.
        if (/tailwind\.config\.ts$/.test(rel)) continue;
        // The style resolvers produce the variable NAMES; they draw nothing.
        if (/site-style\.ts$|lib\/sites\/style\.ts$/.test(rel)) continue;
        const source = await readFile(file, "utf8");
        if (SITE_LAYER_RE.test(code(source))) {
            failures.push(
                `G6  ${rel}  draws the --site-* layer outside packages/site-blocks. There is one renderer (#252); a second one drifts, and #189 is what that costs.`,
            );
        }
    }
}

if (failures.length > 0) {
    console.error(`check-blocks: ${failures.length} problem(s)\n`);
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
}
console.log(
    `check-blocks: blocks draw only merchant tokens; ${SITE_LAYER_ALLOWED.size} allowed Saroh surface(s) on merchant pages, ${PENDING_REMOVAL.size} second renderer(s) still pending removal.`,
);
