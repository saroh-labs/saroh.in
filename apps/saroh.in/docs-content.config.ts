import fs from "node:fs";
import path from "node:path";

import type { DocPage } from "@saroh/search-pages/docs";
import { docLinks, docPageChecks } from "@saroh/search-pages/docs";
import { embeddedDocs as embedText } from "@saroh/search-pages/embed-docs";
import { DOC_PAGE_PATH } from "@saroh/search-pages/kinds";

import { recordDocs } from "./build-state.config.js";
import { loadPublishList } from "./search-pages.config.js";

/**
 * The GST pages', guides' and downloads' words this build may carry (plan
 * 2026-10-31-002, U3; R3, R9). `pnpm build` runs it after
 * `search-pages.config.js`, from the publish list that wrote (or its
 * snapshot fallback), with tsx: the checks are the package's TypeScript.
 *
 * - A build with the list and no preview (production) writes only live
 *   pages into `lib/docs-content.gen.ts` and copies only live downloads'
 *   files and preview pictures to `public/downloads/<slug>/`, so a draft's words and files are
 *   in neither the Worker nor the static files. A live page whose checks
 *   fail (unconfirmed facts, an old GST check date) is left out with a
 *   `::warning`; the build still goes out (an unrelated urgent deploy must).
 *   So is a live page whose words link to a search page that would be a
 *   404 here: neither live in this build nor taken off (which redirects).
 * - A preview, or a build without the list (`next dev`, tests), writes every
 *   page; those not live say Draft and `noindex`.
 *
 * What it built, and what it held, goes in the production snapshot
 * (`build-state.config.js`), so admin can show "Held by checks".
 */

/** What search-pages.config.js wrote (its PublishList). */
interface PublishList {
    preview: boolean;
    live: string[];
    /** Were live, now redirect: a link to one still lands somewhere. */
    takenOff?: { path: string }[];
}

export interface DocsPlan {
    /** Every page in the code (a preview), or only `built`. */
    all: boolean;
    built: string[];
    held: { path: string; why: string[]; detail: string[] }[];
}

const SEARCH_PAGES = path.join(__dirname, "../../packages/search-pages");
export const GEN_FILE = path.join(__dirname, "lib/docs-content.gen.ts");
export const DOWNLOADS_DIR = path.join(__dirname, "public/downloads");

/** The held reason for a page whose words link to a page that isn't live (admin's words). */
export const LINKS_LIVE = "Every page it links to is live";

/** Which pages this build carries, from the publish list and each live page's checks. */
export function planDocs(
    list: PublishList | null,
    pages: readonly DocPage[],
    { production, today }: { production: boolean; today?: string },
): DocsPlan {
    if (!list) {
        if (production)
            throw new Error(
                "saroh.in: no publish list (.search-pages.json): run search-pages.config.js first. A production build never guesses which pages are live (DEC-193).",
            );
        return { all: true, built: pages.map((p) => p.path), held: [] };
    }
    if (list.preview)
        return { all: true, built: pages.map((p) => p.path), held: [] };
    const plan: DocsPlan = { all: false, built: [], held: [] };
    for (const path of list.live.filter((p) => DOC_PAGE_PATH.test(p))) {
        // A live record for a page this commit doesn't have: nothing to build.
        const page = pages.find((p) => p.path === path);
        if (!page) continue;
        const failed = docPageChecks(page, { today }).filter(
            (c) => !c.ok && c.severity === "error",
        );
        if (failed.length)
            plan.held.push({
                path,
                why: failed.map((c) => c.title),
                detail: failed.map((c) => c.detail),
            });
        else plan.built.push(path);
    }
    // Links: a held page isn't live either, so repeat until nothing more is held (U12).
    const lands = new Set([
        ...list.live.filter((p) => !DOC_PAGE_PATH.test(p)),
        ...(list.takenOff ?? []).map((t) => t.path),
    ]);
    for (let changed = true; changed;) {
        changed = false;
        for (const path of plan.built) {
            const page = pages.find((p) => p.path === path);
            const dead = page
                ? docLinks(page).required.filter(
                      (l) => !lands.has(l) && !plan.built.includes(l),
                  )
                : [];
            if (!dead.length) continue;
            plan.built = plan.built.filter((p) => p !== path);
            plan.held.push({
                path,
                why: [LINKS_LIVE],
                detail: dead.map((l) => `It links to ${l}, which isn't live.`),
            });
            changed = true;
        }
    }
    return plan;
}

/** The generated module and the downloads' files, as `plan` says. */
export function writeDocs(
    plan: DocsPlan,
    { genFile = GEN_FILE, downloadsDir = DOWNLOADS_DIR } = {},
) {
    const typesFrom = "@saroh/search-pages/docs";
    const text = embedText(
        plan.all ? { typesFrom } : { live: plan.built, typesFrom },
    );
    fs.writeFileSync(
        genFile,
        `${text}\n/** Only some pages (a production build's live ones): a related pin to one left out is dropped. */\nexport const DOC_PARTIAL: boolean = ${!plan.all};\n`,
    );
    fs.rmSync(downloadsDir, { recursive: true, force: true });
    // A download's files and its preview pictures, side by side at /downloads/<slug>/.
    const sources = ["files", "previews"].map((d) =>
        path.join(SEARCH_PAGES, "content/downloads", d),
    );
    for (const p of plan.built.filter((p) => p.startsWith("/downloads/"))) {
        const slug = p.slice("/downloads/".length);
        for (const from of sources.map((d) => path.join(d, slug))) {
            if (!fs.existsSync(from)) continue;
            fs.cpSync(from, path.join(downloadsDir, slug), {
                recursive: true,
                filter: (src) => !path.basename(src).startsWith("."),
            });
        }
    }
}

/** The GitHub Actions annotation for a live page left out. */
export function heldWarning(h: DocsPlan["held"][number]): string {
    return `::warning title=Page held by checks::${h.path} is live but left out of this build: ${h.detail.join(" ")} Fix it, then deploy again.`;
}

/** Every page in the code, drafts too: read here, at build time, never bundled. */
async function codePages(): Promise<DocPage[]> {
    const { embeddedDocs } = await import("@saroh/search-pages/docs-embedded");
    return embeddedDocs.all();
}

/** The unit tests' copy (vitest globalSetup): every page, written only when no build has written one. */
export async function ensureDocs() {
    if (fs.existsSync(GEN_FILE)) return;
    writeDocs(planDocs(null, await codePages(), { production: false }));
}

async function main() {
    const plan = planDocs(loadPublishList(), await codePages(), {
        production: process.env.VERCEL_ENV === "production",
    });
    writeDocs(plan);
    for (const h of plan.held) console.log(heldWarning(h));
    recordDocs({
        built: plan.built,
        held: plan.held.map(({ path, why }) => ({ path, why })),
    });
    console.log(
        `[docs-content] ${plan.all ? "every page (preview)" : `${plan.built.length} live`}${plan.held.length ? `, ${plan.held.length} held by checks` : ""}`,
    );
}

if (process.argv[1]?.endsWith("docs-content.config.ts")) {
    main().catch((err: unknown) => {
        console.error(err instanceof Error ? err.message : err);
        process.exit(1);
    });
}
