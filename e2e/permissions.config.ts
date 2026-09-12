import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const appURL = "https://permissions-app.saroh.localhost";
const apiURL = "https://permissions-api.saroh.localhost";

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
            command:
                "pnpm exec portless permissions-api.saroh node e2e/fixtures/permissions-api.mjs",
            cwd: root,
            url: `${apiURL}/health`,
            ignoreHTTPSErrors: true,
            gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
        },
        {
            command:
                "pnpm exec turbo run build --filter=application && pnpm --filter application exec portless permissions-app.saroh next start",
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
