const fs = require("node:fs");
const path = require("node:path");

const { DOC_PAGE_PATH } = require("@saroh/search-pages/kinds");

const buildState = require("./build-state.config");

/**
 * Which /for/ pages and free tools are live (DEC-193, #1253), read from the
 * API once per build.
 *
 * `pnpm build` runs this file before `next build`: it reads
 * `GET ${API_URL}/public/search-pages` and writes the answer, with whether
 * this build is a preview, to `.search-pages.json`. `next.config.js` reads
 * that file back, inlines it as `SAROH_SEARCH_PAGES` (`lib/search-pages.ts`)
 * and builds the /solutions/ and taken-off redirects from it
 * (`redirects.js`), so the pages, sitemap, menus and redirects agree.
 *
 * - A production deployment (`VERCEL_ENV=production`) builds only live
 *   pages. If the list can't be read (after riding out an API restart), it
 *   uses the live site's snapshot of the list it was last built with
 *   (`build-state.config.js`) and warns; with neither, the build fails: it never
 *   guesses (DEC-193).
 * - Any other build is a preview when `RESOURCES_PREVIEW` is on (dev, CI,
 *   prepush) or the list can't be read (local work without an API): every
 *   page in the code is built, and those not live say Draft and `noindex`.
 *   With the list read and the flag off, it builds as production does.
 */

/** @typedef {{ path: string; at: string }} TakenOff */
/** @typedef {{ preview: boolean; live: string[]; takenOff: TakenOff[] }} PublishList */

const FILE = path.join(__dirname, ".search-pages.json");
const CONTENT = path.join(__dirname, "../../packages/search-pages/content/for");
const TOOLS_CONTENT = path.join(
    __dirname,
    "../../packages/search-pages/content/tools",
);
const PAGE_PATH = /^\/(for|tools)\/[a-z0-9-]+$/;
/**
 * A path the publish list may hold: /for/ or /tools/, or a page of a group
 * on the shared kit (`@saroh/search-pages/kinds`, the list the API's path
 * rule copies), so a page the API accepts never fails a production build.
 * @param {string} p
 */
const pagePath = (p) => PAGE_PATH.test(p) || DOC_PAGE_PATH.test(p);
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
    const live = b.live.filter((p) => typeof p === "string" && pagePath(p));
    const takenOff = b.takenOff.filter(
        (t) =>
            t &&
            typeof t.path === "string" &&
            pagePath(t.path) &&
            typeof t.at === "string",
    );
    if (
        live.length !== b.live.length ||
        takenOff.length !== b.takenOff.length
    ) {
        throw new Error(
            "the answer has a path that isn't a search page's (/for/<slug>, /tools/<slug>, /gst/<slug>…)",
        );
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
 * @param {{ get(): Promise<{ searchPages: unknown }> }} [state] the live
 *   site's snapshot (`build-state.config.js` liveState), a production build's
 *   fallback
 * @returns {Promise<PublishList>}
 */
async function readPublishList(
    env,
    fetcher = fetch,
    delays = RETRY_DELAYS_MS,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    state = undefined,
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
                    let fallback = "no snapshot to fall back to";
                    if (state) {
                        try {
                            const snap = await state.get();
                            return {
                                preview: false,
                                ...parseAnswer(snap.searchPages),
                            };
                        } catch (e) {
                            fallback = `the live site's snapshot can't be used: ${e instanceof Error ? e.message : String(e)}`;
                        }
                    }
                    throw new Error(
                        `saroh.in: GET /public/search-pages failed (${why}; ${fallback}). A production build never guesses which /for/ pages are live (DEC-193); fix the API and deploy again.`,
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

/**
 * Whether the code has a free tool by this slug (a content file, its own
 * page or the app's), so a redirect never lands on a tool this commit lacks.
 * @param {string} slug
 * @returns {boolean}
 */
function toolExists(slug) {
    return fs.existsSync(path.join(TOOLS_CONTENT, `${slug}.mdx`));
}

module.exports = {
    FILE,
    parseAnswer,
    readPublishList,
    loadPublishList,
    familyOf,
    toolExists,
    prebuild,
};

/**
 * The prebuild: the publish list, and in production the pricing too, from
 * the API or (when it's down) the live site's snapshot; then the files the
 * build reads and the snapshot the next build may need (`build-state.config.js`).
 * @param {Record<string, string | undefined>} env
 * @param {typeof fetch} [fetcher]
 * @param {readonly number[]} [delays]
 * @param {(ms: number) => Promise<void>} [sleep]
 * @param {Parameters<typeof buildState.writeBuildState>[4]} [at]
 */
async function prebuild(
    env,
    fetcher = fetch,
    delays = RETRY_DELAYS_MS,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    at = {},
) {
    const production = env.VERCEL_ENV === "production";
    const state = buildState.liveState(env, fetcher);
    const list = await readPublishList(
        env,
        fetcher,
        delays,
        sleep,
        production ? state : undefined,
    );
    const pricing = production
        ? await buildState.readBuildPricing(env, state, fetcher, delays, sleep)
        : null;
    buildState.writeBuildState(production, list, pricing, env, {
        ...at,
        dataAsOf: state.usedFrom,
    });
    if (state.usedFrom) console.log(buildState.fallbackWarning(state.usedFrom));
    return list;
}

if (require.main === module) {
    prebuild(process.env).then(
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
