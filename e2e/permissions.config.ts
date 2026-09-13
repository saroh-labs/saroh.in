import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const root = path.resolve(__dirname, "..");

/**
 * Where this suite's two servers live.
 *
 * Locally: portless hostnames, the same way every other app is reached (see
 * the root AGENTS.md). On a CI runner there is no portless — no proxy, no
 * wildcard DNS, nothing listening on 443 — so the ports are plain, exactly as
 * `playwright.config.ts` already does for the seeded stack.
 *
 * Setting `PERMISSIONS_APP_URL` is what switches the mode: it changes the URLs
 * the tests open AND how the two servers below are started.
 */
const portless = process.env.PERMISSIONS_APP_URL === undefined;
const appURL =
    process.env.PERMISSIONS_APP_URL ??
    "https://permissions-app.saroh.localhost";
const apiURL =
    process.env.PERMISSIONS_API_URL ??
    "https://permissions-api.saroh.localhost";

/** The port a bare-port run listens on, taken from the URL it was given. */
function portOf(url: string, fallback: string): string {
    return new URL(url).port || fallback;
}

// Uses the production server: next dev preserves errors that production redacts.
// The fake API controls only responses. Next renders real routes and boundaries.
export default defineConfig({
    testDir: "./permissions",
    workers: 1,
    timeout: 30_000,
    expect: { timeout: 15_000 },
    use: {
        baseURL: appURL,
        ignoreHTTPSErrors: true,
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
    projects: [
        { name: "desk", use: { ...devices["Desktop Chrome"] } },
        { name: "phone", use: { ...devices["Pixel 7"] } },
    ],
    webServer: [
        {
            command: portless
                ? "pnpm exec portless permissions-api.saroh node e2e/fixtures/permissions-api.mjs"
                : "node e2e/fixtures/permissions-api.mjs",
            cwd: root,
            url: `${apiURL}/health`,
            ignoreHTTPSErrors: true,
            gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
            // The fixture binds `process.env.PORT`; portless sets it, and
            // without portless this is where it comes from.
            env: portless ? {} : { PORT: portOf(apiURL, "3334") },
        },
        {
            command: portless
                ? "pnpm exec turbo run build --filter=application && pnpm --filter application exec portless permissions-app.saroh next start"
                : `pnpm exec turbo run build --filter=application && pnpm --filter application exec next start -p ${portOf(appURL, "3004")}`,
            cwd: root,
            url: `${appURL}/favicon.ico`,
            ignoreHTTPSErrors: true,
            timeout: 180_000,
            gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
            env: {
                SKIP_ENV_VALIDATION: "1",
                API_URL: apiURL,
                NEXT_PUBLIC_BETTER_AUTH_URL: apiURL,
                NEXT_PUBLIC_API_URL: apiURL,
                NEXT_PUBLIC_ACCOUNTS_URL: appURL,
            },
        },
    ],
});

/** The host the tests set their cookies on, derived from the URL in use. */
export const appHost = new URL(appURL).hostname;

/** Cookies are `secure` only where the suite is served over HTTPS. */
export const appIsSecure = new URL(appURL).protocol === "https:";
