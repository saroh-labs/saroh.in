import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests against a RUNNING, SEEDED stack.
 *
 * This is the harness the cross-product UX epic has been deferring to. "Browser
 * verification (`agent-browser`, 320/390/1440px, keyboard, a11y)" is the
 * recurring remaining step on #121, #122 and #125; #50 asks for cross-subdomain
 * cookie, redirect, logout and CSRF coverage; B6 in the backlog says the
 * Playwright auth E2E is "currently manual-verified only". None of it could
 * move because nothing here ever started the apps together.
 *
 * WHY THIS CANNOT BE A JSDOM TEST. Every question it answers is about a real
 * browser: whether a session cookie set by one app is sent by another, whether
 * a layout overflows at 320px, whether two controls occupy the same pixels,
 * whether a touch pointer gets a 44px target. jsdom has no layout engine and
 * no cookie jar shared across origins, so it can answer none of them.
 *
 * ## Running it
 *
 * Locally, against portless (the normal dev setup — see docs/architecture/LOCAL_DEV.md):
 *
 *     pnpm dev
 *     pnpm --filter @saroh/e2e install:browsers   # once
 *     E2E_IGNORE_HTTPS_ERRORS=1 pnpm --filter @saroh/e2e test:e2e
 *
 * In CI, against bare ports, because there is no portless proxy on a runner:
 *
 *     E2E_APP_URL=http://localhost:3003 \
 *     E2E_ACCOUNTS_URL=http://localhost:3000 \
 *     E2E_API_URL=http://localhost:3333 \
 *     pnpm --filter @saroh/e2e test:e2e
 *
 * The default URLs are the portless hostnames because that is what a developer
 * has running; CI overrides all three.
 */

const APP_URL = process.env.E2E_APP_URL ?? "https://app.saroh.localhost";
const ACCOUNTS_URL =
    process.env.E2E_ACCOUNTS_URL ?? "https://accounts.saroh.localhost";
const API_URL = process.env.E2E_API_URL ?? "https://api.saroh.localhost";
/**
 * The renderer's apex, where draft previews are served.
 *
 * Read as an ORIGIN rather than taken from `NEXT_PUBLIC_ROOT_DOMAIN`, because
 * the app builds a preview address as `https://<root domain>/preview/<token>`
 * and a CI runner serves that app over plain http on a port. A test that used
 * the address as printed could never open it there; taking the token and
 * pointing it at this origin opens the same page on whichever host is running.
 */
const RENDERER_URL =
    process.env.E2E_RENDERER_URL ?? "https://saroh.app.localhost";

export const urls = { APP_URL, ACCOUNTS_URL, API_URL, RENDERER_URL };

/**
 * Whether a browser this suite opens should accept portless's local CA.
 *
 * Exported so a spec that makes its OWN context — the review flow needs a
 * second signed-in person — inherits the same answer as the config's `use`.
 */
export const ignoreHTTPSErrors = Boolean(process.env.E2E_IGNORE_HTTPS_ERRORS);

/**
 * The seeded demo owner (`pnpm --filter @saroh/database db:seed`). These are
 * fixture credentials for a throwaway database and are printed by the seed
 * itself; they are not a secret and must never be pointed at a real one — the
 * S0-003 guard and `DATABASE_TARGET_CONFIRM` exist to make that impossible.
 */
/**
 * A provider-paid order with three lines, for Order Detail's refund journey
 * (a dev stack takes no provider payments, so it is opt-in).
 */
export const refundOrder = {
    id: process.env.E2E_REFUND_ORDER_ID,
    org: process.env.E2E_REFUND_ORG,
};

/**
 * The run has its own seeded database (CI), so a spec may write on the
 * showcase businesses, which are film sets everywhere else (B14's Kavi
 * Dental visits).
 */
export const ownSeededDatabase = Boolean(process.env.CI);

export const demoUser = {
    email: "demo@saroh.dev",
    password: "demo-password-123",
};

/**
 * The seeded REVIEWER, invited to the first site and nothing else (#276).
 *
 * A second signed-in actor is the only way to test the review loop as a
 * product rather than as a set of endpoints: a reviewer asks for changes, and
 * the OWNER — a different person, in a different session — publishes past it.
 * One browser context cannot tell that story.
 */
export const demoReviewer = {
    email: "reviewer@saroh.dev",
    password: "demo-password-123",
};

/** The site the reviewer was invited to, by name. */
export const REVIEWED_SITE = "Northwind Supply";

/**
 * Northwind, the base seed's business, whose site the reviewer was invited to.
 *
 * The demo owner is in several businesses (the base seed's site-only ones, and
 * the showcase's), so a signed-in owner with no business chosen is asked which
 * one at `/choose` — and org-scoped pages fall back to whichever membership the
 * list returns first. A spec about Northwind opens it by id first, the way
 * accounts' "Your businesses" does.
 */
export const NORTHWIND_ORG = "seed_org";

/**
 * A test that changes something every other test reads — a business
 * setting, a storefront's ways, a service's deposit, Northwind's one site —
 * is tagged `@serial`. It runs in the `*-serial` projects, one test at a
 * time, after every parallel test has finished (`run.mjs`).
 */
const SERIAL = /@serial/;

/**
 * Workers for the parallel projects. The stack under test runs on the same
 * machine as the browsers, so it is sized to the machine: two on a 2-vCPU
 * CI runner, four on a laptop. `PW_WORKERS` overrides either.
 */
const workers = Number(process.env.PW_WORKERS) || (process.env.CI ? 2 : 4);

/**
 * `run.mjs` runs the suite in phases (setup, parallel, serial) and names
 * the phase, so each keeps its own traces: Playwright empties its output
 * folder when a run starts, and the serial phase would otherwise delete
 * the parallel phase's failures.
 */
const phase = process.env.E2E_PHASE;

const desk = {
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
};
// A real touch pointer, which is what makes `pointer: coarse` match — the
// whole basis of the touch-target rules (#178).
const phone = { ...devices["Pixel 7"] };

export default defineConfig({
    testDir: "./tests",
    outputDir: phase ? `test-results/${phase}` : "test-results",
    // Every test owns the records it changes (fixtures/own-data.ts), so any
    // two can run at once; the few that change what everyone reads are
    // `@serial` and wait for the rest.
    fullyParallel: true,
    workers,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
    timeout: 60_000,
    expect: { timeout: 15_000 },
    use: {
        baseURL: APP_URL,
        trace: "retain-on-failure",
        // A click that cannot land fails in seconds, not at the test timeout.
        actionTimeout: 15_000,
        screenshot: "only-on-failure",
        // portless serves the `.localhost` names over HTTPS with its own local
        // CA, which a CI browser has no reason to trust. Opt-in, and never on
        // by default, so a real certificate problem is still a failure.
        ignoreHTTPSErrors: Boolean(process.env.E2E_IGNORE_HTTPS_ERRORS),
    },
    projects: [
        {
            // Signs each seeded person in through the real form once and
            // saves the session to e2e/.auth/ (fixtures/sessions.ts). Every
            // spec that only needs to BE signed in reuses it.
            name: "setup",
            testMatch: /auth\.setup\.ts$/,
        },
        {
            name: "desk",
            dependencies: ["setup"],
            grepInvert: SERIAL,
            use: desk,
        },
        {
            name: "phone",
            dependencies: ["setup"],
            grepInvert: SERIAL,
            use: phone,
        },
        /*
         * The `@serial` tests, one at a time, once the parallel ones are
         * done. `run.mjs` runs these as a phase of their own with
         * `--workers=1 --no-deps`, which is what lets CI shard them; a bare
         * `playwright test` (no shard) gets the same order from the
         * dependencies below.
         */
        {
            name: "desk-serial",
            dependencies: ["desk", "phone"],
            grep: SERIAL,
            workers: 1,
            use: desk,
        },
        {
            name: "phone-serial",
            dependencies: ["desk-serial"],
            grep: SERIAL,
            workers: 1,
            use: phone,
        },
    ],
});
