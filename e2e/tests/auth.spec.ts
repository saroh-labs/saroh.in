import { expect, test } from "@playwright/test";

import { demoUser, urls } from "../playwright.config";

/**
 * The auth cases from #50 / S1-008, which the backlog records as
 * "manual-verified only" (B6).
 *
 * All of them are cross-ORIGIN questions: the sign-in form is served by
 * accounts.saroh.in, the session is issued by api.saroh.in, and the workspace
 * that must see it is app.saroh.in. Whether that works is a property of a real
 * browser's cookie jar, so nothing short of a browser can test it — which is
 * why it has been verified by hand for as long as it has existed.
 */

async function signIn(page: import("@playwright/test").Page) {
    await page.goto(`${urls.ACCOUNTS_URL}/login`);
    await page.getByLabel("Email").fill(demoUser.email);
    await page.getByLabel("Password", { exact: true }).fill(demoUser.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 30_000,
    });
}

test.describe("cross-origin session", () => {
    test("a session issued at accounts is honoured by the workspace", async ({
        page,
    }) => {
        await signIn(page);

        await page.goto(`${urls.APP_URL}/`);

        // Landing anywhere under /login means the cookie did not travel.
        await expect(page).toHaveURL(new RegExp(`^${urls.APP_URL}/?$`));
        await expect(
            page.getByRole("heading", { name: "Home", level: 1 }),
        ).toBeVisible();
    });

    test("an anonymous visitor is sent to sign in", async ({ page }) => {
        await page.goto(`${urls.APP_URL}/bookings`);

        await expect(page).toHaveURL(/\/login/);
    });

    /**
     * #222. Being returned to the front door after signing in is the bug this
     * closed: a merchant who followed a link to one booking had to find it
     * again.
     */
    test("signing in returns the visitor to the page they asked for", async ({
        page,
    }) => {
        await page.goto(`${urls.APP_URL}/bookings`);
        await expect(page).toHaveURL(/\/login/);

        await page.getByLabel("Email").fill(demoUser.email);
        await page
            .getByLabel("Password", { exact: true })
            .fill(demoUser.password);
        await page.getByRole("button", { name: "Log in" }).click();

        await page.waitForURL(/\/bookings/, { timeout: 30_000 });

        /*
         * The claim is about the DESTINATION, so that is what is asserted.
         *
         * This used to check for the "Bookings" heading, which passed locally
         * and failed in CI — because a freshly seeded database has no
         * `MODULE_*` rollout flags, so Appointments is unavailable and
         * `/bookings` correctly renders "Appointments is turned off". That is
         * still the page the visitor asked for, which is the whole of #222;
         * tying the test to one module's content made it a test of the seed.
         */
        expect(new URL(page.url()).pathname).toBe("/bookings");
        await expect(
            page.getByRole("button", { name: "Your account" }),
        ).toBeVisible();
    });

    test("signing out drops the session everywhere, not just where it was dropped", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`${urls.APP_URL}/`);

        await page.getByRole("button", { name: "Your account" }).click();
        await page.getByRole("menuitem", { name: /sign out|log out/i }).click();

        await page.waitForURL(/\/login/, { timeout: 30_000 });

        // The workspace must not still let them in on a fresh navigation.
        await page.goto(`${urls.APP_URL}/`);
        await expect(page).toHaveURL(/\/login/);
    });
});

test.describe("CSRF origin checks", () => {
    /**
     * B3: a mutating request carrying an untrusted `Origin` is refused.
     *
     * Sent through Playwright's request API rather than the page's `fetch`,
     * because a browser will not let a page forge its own Origin — a fetch
     * from the workspace carries the workspace's origin, which is TRUSTED, so
     * the request succeeds and proves nothing. (It also creates whatever it
     * was asked to create, which is how the first draft of this test left a
     * stray Organization in the seeded database.)
     *
     * A no-op path is used deliberately: an untrusted origin must be refused
     * BEFORE the handler runs, so a rejection leaves nothing behind and a
     * regression here fails loudly rather than quietly writing a row.
     */
    test("the API refuses a mutation from an untrusted origin", async ({
        request,
    }) => {
        const response = await request.post(`${urls.API_URL}/organizations`, {
            headers: {
                "content-type": "application/json",
                origin: "https://not-saroh.example",
            },
            data: { name: "origin guard probe" },
            failOnStatusCode: false,
        });

        expect(response.status()).toBe(403);
    });

    test("an unauthenticated mutation is refused even from a trusted origin", async ({
        request,
    }) => {
        const response = await request.post(`${urls.API_URL}/organizations`, {
            headers: {
                "content-type": "application/json",
                origin: urls.APP_URL,
            },
            data: { name: "unauthenticated probe" },
            failOnStatusCode: false,
        });

        expect([401, 403]).toContain(response.status());
    });
});
