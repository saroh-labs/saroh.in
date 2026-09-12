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
 * Locally, against portless (the normal dev setup — see the root AGENTS.md):
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

export default defineConfig({
    testDir: "./tests",
    // Serial by default: these share one seeded Organization, and a spec that
    // disables a module would otherwise race one that expects it enabled.
    workers: 1,
    fullyParallel: false,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
    timeout: 60_000,
    expect: { timeout: 15_000 },
    use: {
        baseURL: APP_URL,
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        // portless serves the `.localhost` names over HTTPS with its own local
        // CA, which a CI browser has no reason to trust. Opt-in, and never on
        // by default, so a real certificate problem is still a failure.
        ignoreHTTPSErrors: Boolean(process.env.E2E_IGNORE_HTTPS_ERRORS),
    },
    projects: [
        {
            name: "desk",
            use: {
                ...devices["Desktop Chrome"],
                viewport: { width: 1440, height: 900 },
            },
        },
        {
            // A real touch pointer, which is what makes `pointer: coarse`
            // match — the whole basis of the touch-target rules (#178).
            name: "phone",
            use: { ...devices["Pixel 7"] },
        },
    ],
});
