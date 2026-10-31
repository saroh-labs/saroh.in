const fs = require("node:fs");
const path = require("node:path");

/**
 * What a production build of saroh.in read from the API, kept with the site
 * so the next build can reuse it when the API is down (DEC-193).
 *
 * `search-pages.config.js` (run before `next build`) reads the publish list
 * and, once early access is open, the published pricing. A production build
 * writes both answers to `public/_build/state.json`, served at
 * `https://www.saroh.in/_build/state.json` (robots-disallowed, noindex in
 * `public/_headers`, not in the sitemap). Only the public endpoints' answers
 * are in it.
 *
 * When a production build can't read the API after its retries, it reads
 * that file from the live site instead (once, for both lists), and warns.
 * Neither answering, the build fails as before. Other builds never use it.
 *
 * The pricing answer the build used is also written to `.build-pricing.json`,
 * which `lib/pricing.ts` reads (and validates) during a production
 * `next build`, so pricing and the /for/ pages come from the same read.
 */

/** @typedef {{ live: string[]; takenOff: { path: string; at: string }[] }} Lists */
/** `dataAsOf` is when the lists were last read from the API: a build that
 * fell back carries its snapshot's date forward, so a second fallback in a
 * row still names the real age of the data.
 * `docs` is which GST pages, guides and downloads this build drew, and the
 * live ones it held back for failing their checks (`docs-content.config.ts`).
 * @typedef {{ built: string[]; held: { path: string; why: string[] }[] }} DocsBuilt
 * @typedef {{ v: 1; builtAt: string; dataAsOf?: string; commit: string | null; searchPages: Lists; pricing: unknown; docs?: DocsBuilt }} BuildState */

/** The live production site (`lib/seo.ts` SITE_URL); `LIVE_SITE_URL` overrides it, for a dry run. */
const LIVE_SITE_URL = "https://www.saroh.in";
const STATE_PATH = "/_build/state.json";
const STATE_FILE = path.join(__dirname, "public", STATE_PATH);
const PRICING_FILE = path.join(__dirname, ".build-pricing.json");
const TIMEOUT_MS = 5000;

/**
 * The live site's snapshot, fetched at most once per build. `usedFrom` is
 * the snapshot's `builtAt` once a reader has fallen back to it.
 * @param {Record<string, string | undefined>} env
 * @param {typeof fetch} [fetcher]
 */
function liveState(env, fetcher = fetch) {
    const url = `${env.LIVE_SITE_URL || LIVE_SITE_URL}${STATE_PATH}`;
    /** @type {Promise<BuildState> | undefined} */
    let read;
    const state = {
        url,
        /** @type {string | null} */
        usedFrom: null,
        /** @returns {Promise<BuildState>} */
        get() {
            read ??= (async () => {
                const res = await fetcher(url, {
                    headers: { accept: "application/json" },
                    signal: AbortSignal.timeout(TIMEOUT_MS),
                });
                if (!res.ok) throw new Error(`${url}: status ${res.status}`);
                const body = await res.json();
                if (
                    !body ||
                    body.v !== 1 ||
                    typeof body.builtAt !== "string" ||
                    !("pricing" in body)
                ) {
                    throw new Error(`${url} is not a build snapshot`);
                }
                return body;
            })();
            return read.then((s) => {
                state.usedFrom = s.dataAsOf ?? s.builtAt;
                return s;
            });
        },
    };
    return state;
}

/**
 * The GitHub Actions annotation a build that fell back prints.
 * @param {string} builtAt
 */
function fallbackWarning(builtAt) {
    return `::warning title=API unreachable::API unreachable: built with the live site's last published lists from ${builtAt}. Publishes made since then are not in this build; deploy again when the API is back.`;
}

/**
 * `GET /public/pricing` as a production build reads it: the raw answer, or
 * null when there is nothing to show (not open yet, or no version: 404).
 * After the retries it falls back to the live snapshot's pricing. The
 * catalogue itself is validated by `lib/pricing.ts` (`parsePricingResponse`)
 * when `next build` reads the file this is written to.
 * @param {Record<string, string | undefined>} env
 * @param {ReturnType<typeof liveState>} state
 * @param {typeof fetch} fetcher
 * @param {readonly number[]} delays
 * @param {(ms: number) => Promise<void>} sleep
 * @returns {Promise<unknown>}
 */
async function readBuildPricing(env, state, fetcher, delays, sleep) {
    if (env.NEXT_PUBLIC_LAUNCH_MODE !== "open") return null;
    const once = async () => {
        const res = await fetcher(`${env.API_URL}/public/pricing`, {
            headers: { accept: "application/json" },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`status ${res.status}`);
        const body = await res.json();
        if (!body || typeof body.catalog !== "object" || !body.catalog) {
            throw new Error("the answer has no catalogue");
        }
        return body;
    };
    for (let attempt = 0; ; attempt++) {
        try {
            return await once();
        } catch (err) {
            const why = err instanceof Error ? err.message : String(err);
            if (attempt < delays.length) {
                console.warn(`[pricing] read failed (${why}); retrying`);
                await sleep(delays[attempt]);
                continue;
            }
            try {
                return (await state.get()).pricing;
            } catch (fallbackErr) {
                throw new Error(
                    `saroh.in: GET /public/pricing failed (${why}), and the live site's snapshot can't be used (${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}); fix the API and deploy again.`,
                );
            }
        }
    }
}

/**
 * Write what this build used: the snapshot for the next build (production
 * only) and the pricing for `next build`. Anything else removes both, so a
 * preview never ships or reads a production snapshot.
 * @param {boolean} production
 * @param {Lists} searchPages
 * @param {unknown} pricing
 * @param {Record<string, string | undefined>} env
 * @param {{ stateFile?: string; pricingFile?: string; now?: Date; dataAsOf?: string | null }} [at]
 */
function writeBuildState(production, searchPages, pricing, env, at = {}) {
    const stateFile = at.stateFile ?? STATE_FILE;
    const pricingFile = at.pricingFile ?? PRICING_FILE;
    if (!production) {
        fs.rmSync(stateFile, { force: true });
        fs.rmSync(pricingFile, { force: true });
        return;
    }
    /** @type {BuildState} */
    const builtAt = (at.now ?? new Date()).toISOString();
    const state = {
        v: 1,
        builtAt,
        dataAsOf: at.dataAsOf ?? builtAt,
        commit: env.GITHUB_SHA ?? null,
        searchPages: { live: searchPages.live, takenOff: searchPages.takenOff },
        pricing,
    };
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, `${JSON.stringify(state)}\n`);
    fs.writeFileSync(pricingFile, `${JSON.stringify({ pricing })}\n`);
}

/**
 * Add what the docs step built to this build's snapshot, so admin can show
 * a live page the build held back. Only a production build has a snapshot;
 * elsewhere this does nothing.
 * @param {DocsBuilt} docs
 * @param {string} [stateFile]
 */
function recordDocs(docs, stateFile = STATE_FILE) {
    if (!fs.existsSync(stateFile)) return;
    const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    fs.writeFileSync(stateFile, `${JSON.stringify({ ...state, docs })}\n`);
}

module.exports = {
    STATE_FILE,
    PRICING_FILE,
    liveState,
    fallbackWarning,
    readBuildPricing,
    writeBuildState,
    recordDocs,
};
