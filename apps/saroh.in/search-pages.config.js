const fs = require("node:fs");
const path = require("node:path");

/**
 * Which /for/ pages are live (DEC-193), read from the API once per build.
 *
 * `pnpm build` runs this file before `next build`: it reads
 * `GET ${API_URL}/public/search-pages` and writes the answer, with whether
 * this build is a preview, to `.search-pages.json`. `next.config.js` reads
 * that file back, inlines it as `SAROH_SEARCH_PAGES` (`lib/search-pages.ts`)
 * and builds the /solutions/ and taken-off redirects from it
 * (`redirects.js`), so the pages, sitemap, menus and redirects agree.
 *
 * - A production deployment (`VERCEL_ENV=production`) builds only live
 *   pages. If the list can't be read (after riding out an API restart), the
 *   build fails: it never guesses (DEC-193).
 * - Any other build is a preview when `RESOURCES_PREVIEW` is on (dev, CI,
 *   prepush) or the list can't be read (local work without an API): every
 *   page in the code is built, and those not live say Draft and `noindex`.
 *   With the list read and the flag off, it builds as production does.
 */

/** @typedef {{ path: string; at: string }} TakenOff */
/** @typedef {{ preview: boolean; live: string[]; takenOff: TakenOff[] }} PublishList */

const FILE = path.join(__dirname, ".search-pages.json");
const CONTENT = path.join(__dirname, "../../packages/search-pages/content/for");
const PAGE_PATH = /^\/for\/[a-z0-9-]+$/;
const TIMEOUT_MS = 5000;
/** As `lib/build-retry.ts`: about a minute, to ride out an API restart. */
const RETRY_DELAYS_MS = [3000, 8000, 15000, 30000];

/**
 * The API's answer, checked.
 * @param {unknown} body
 * @returns {{ live: string[]; takenOff: TakenOff[] }}
 */
function parseAnswer(body) {
    const b = /** @type {Record<string, unknown> | null} */ (body);
    if (!b || !Array.isArray(b.live) || !Array.isArray(b.takenOff)) {
        throw new Error("the answer is not { live, takenOff }");
    }
    const live = b.live.filter(
        (p) => typeof p === "string" && PAGE_PATH.test(p),
    );
    const takenOff = b.takenOff.filter(
        (t) =>
            t &&
            typeof t.path === "string" &&
            PAGE_PATH.test(t.path) &&
            typeof t.at === "string",
    );
    if (
        live.length !== b.live.length ||
        takenOff.length !== b.takenOff.length
    ) {
        throw new Error("the answer has a path that isn't /for/<slug>");
    }
    return {
        live,
        takenOff: takenOff
            .filter((t) => !live.includes(t.path))
            .map((t) => ({ path: t.path, at: t.at })),
    };
}

/**
 * The publish list for a build with `env`.
 * @param {Record<string, string | undefined>} env
 * @param {typeof fetch} [fetcher]
 * @param {readonly number[]} [delays]
 * @param {(ms: number) => Promise<void>} [sleep]
 * @returns {Promise<PublishList>}
 */
async function readPublishList(
    env,
    fetcher = fetch,
    delays = RETRY_DELAYS_MS,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
) {
    const production = env.VERCEL_ENV === "production";
    const once = async () => {
        const res = await fetcher(`${env.API_URL}/public/search-pages`, {
            headers: { accept: "application/json" },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        return parseAnswer(await res.json());
    };
    if (production) {
        if (!env.API_URL) {
            throw new Error(
                "saroh.in: API_URL must be set to build production: which /for/ pages are live comes from the API (DEC-193).",
            );
        }
        for (let attempt = 0; ; attempt++) {
            try {
                return { preview: false, ...(await once()) };
            } catch (err) {
                const why = err instanceof Error ? err.message : String(err);
                if (attempt >= delays.length) {
                    throw new Error(
                        `saroh.in: GET /public/search-pages failed (${why}). A production build never guesses which /for/ pages are live (DEC-193); fix the API and deploy again.`,
                    );
                }
                console.warn(`[search-pages] read failed (${why}); retrying`);
                await sleep(delays[attempt]);
            }
        }
    }
    const flag = env.RESOURCES_PREVIEW?.toLowerCase();
    let read = null;
    if (env.API_URL) {
        try {
            read = await once();
        } catch (err) {
            console.warn(
                `[search-pages] the publish list could not be read (${err instanceof Error ? err.message : String(err)}); building every page as a draft`,
            );
        }
    }
    return {
        preview: flag === "1" || flag === "true" || read === null,
        ...(read ?? { live: [], takenOff: [] }),
    };
}

/**
 * The list the last `readPublishList` run wrote, or null without one
 * (`next dev`, a test, a build that skipped it).
 * @param {string} [file]
 * @returns {PublishList | null}
 */
function loadPublishList(file = FILE) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return null;
    }
}

/**
 * A page's family, from its content file's frontmatter, or null when the
 * code has no such page (a live record for a file not in this commit).
 * @param {string} slug
 * @returns {string | null}
 */
function familyOf(slug) {
    try {
        const source = fs.readFileSync(
            path.join(CONTENT, `${slug}.mdx`),
            "utf8",
        );
        const m = /^family:\s*["']?(.+?)["']?\s*$/m.exec(source);
        return m ? m[1] : null;
    } catch {
        return null;
    }
}

module.exports = {
    FILE,
    parseAnswer,
    readPublishList,
    loadPublishList,
    familyOf,
};

if (require.main === module) {
    readPublishList(process.env).then(
        (list) => {
            fs.writeFileSync(FILE, `${JSON.stringify(list, null, 2)}\n`);
            console.log(
                `[search-pages] ${list.live.length} live, ${list.takenOff.length} taken off${list.preview ? "; preview: every page built, drafts noindex" : ""}`,
            );
        },
        (err) => {
            console.error(err instanceof Error ? err.message : err);
            process.exit(1);
        },
    );
}
