// @covers accounts:/login accounts:/account pkg:auth app:/ app:/choose app:/open app:/bookings api:organizations api:saved-views api:bookings
import { expect, test } from "@playwright/test";

import { people } from "../fixtures/sessions";
import { demoUser, NORTHWIND_ORG, urls } from "../playwright.config";
import { lastCode, readSiteCode } from "./site-codes";

/** Home's title is its greeting (F6): "Good morning, Priya", "Welcome, …". */
const HOME_GREETING = /^(Good (morning|afternoon|evening)|Welcome|Hello)\b/;

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
    // A code is the main way in. The seeded people have passwords.
    await page.goto(`${urls.ACCOUNTS_URL}/login?with=password`);
    await page.getByLabel("Email").fill(demoUser.email);
    await page.getByLabel("Password", { exact: true }).fill(demoUser.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 30_000,
    });
    // The landing page has finished loading: a `goto` made while sign-in
    // is still moving the page on is aborted (net::ERR_ABORTED).
    await page.waitForLoadState("load");
}

test.describe("cross-origin session", () => {
    test("a session issued at accounts is honoured by the workspace", async ({
        page,
    }) => {
        await signIn(page);

        await page.goto(`${urls.APP_URL}/`);

        // Landing anywhere under /login means the cookie did not travel. The
        // demo owner is in several businesses, so a first visit is asked which
        // one (`/choose`, since 9f2e8ee7) — which is itself only reachable
        // signed in — and choosing opens its Home.
        await expect(page).toHaveURL(new RegExp(`^${urls.APP_URL}/choose$`));
        await expect(
            page.getByRole("heading", { name: "Which business?", level: 1 }),
        ).toBeVisible();
        await page.getByRole("button", { name: /^Northwind Supply/ }).click();

        await expect(page).toHaveURL(new RegExp(`^${urls.APP_URL}/?$`));
        await expect(
            page.getByRole("heading", { name: HOME_GREETING, level: 1 }),
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

        // The page opens on "Email me a code". The password is one press away.
        await page
            .getByRole("button", { name: "Use a password instead" })
            .click();
        await page.getByLabel("Email").fill(demoUser.email);
        await page
            .getByLabel("Password", { exact: true })
            .fill(demoUser.password);
        await page.getByRole("button", { name: "Sign in" }).click();

        // Polled, not `waitForURL`: on the way to /bookings one navigation
        // replaces another, and `waitForURL` fails on the one cut short
        // (net::ERR_ABORTED) though the visitor lands where they asked.
        await expect(page).toHaveURL(/\/bookings/, { timeout: 30_000 });

        /*
         * The claim is about the DESTINATION, so that is what is asserted.
         *
         * This used to check for the "Bookings" heading, which passed locally
         * and failed in CI — because a freshly seeded database has no
         * `MODULE_*` rollout flags, so Bookings is unavailable and
         * `/bookings` correctly renders "Bookings is turned off". That is
         * still the page the visitor asked for, which is the whole of #222;
         * tying the test to one module's content made it a test of the seed.
         */
        expect(new URL(page.url()).pathname).toBe("/bookings");
        await expect(
            page.getByRole("button", { name: "Your account" }),
        ).toBeVisible();
    });

    /**
     * A code is the main way in (owner, 10 Oct 2026), and an account with a
     * password takes one too: the same step a merchant's customers meet on
     * their site. The code comes from the API's fake outbox.
     */
    test("an emailed code signs an existing account in, with no password", async ({
        page,
    }, testInfo) => {
        // A new code replaces the one before it, and desk and phone run
        // side by side: each asks for its own person's.
        const codeUser = testInfo.project.name.startsWith("phone")
            ? people.member
            : people.founder;
        await page.goto(`${urls.ACCOUNTS_URL}/login?redirect=/account`);
        await expect(
            page.getByRole("heading", { name: "Sign in", level: 1 }),
        ).toBeVisible();
        await expect(page.getByLabel("Password")).toHaveCount(0);
        await page.getByLabel("Email").fill(codeUser.email);
        // Left from an earlier run, a code would be read as this one.
        const before = lastCode(codeUser.email);
        await page.getByRole("button", { name: "Email me a code" }).click();

        await expect(
            page.getByRole("heading", { name: "Check your email", level: 1 }),
        ).toBeVisible();
        await expect(
            page.getByText(
                `We sent a 6-digit code to ${codeUser.email}. It lasts 10 minutes.`,
            ),
        ).toBeVisible();
        await expect(
            page.getByRole("button", { name: /^Resend code in \d+s$/ }),
        ).toBeDisabled();
        await expect(
            page.getByRole("button", { name: "Change email" }),
        ).toBeVisible();
        const field = page.getByLabel("Code");
        await expect(field).toHaveAttribute("autocomplete", "one-time-code");

        // The sixth digit sends it: nothing is pressed.
        await field.fill(await readSiteCode(codeUser.email, before));
        await page.waitForURL((url) => url.pathname === "/account", {
            timeout: 30_000,
        });
    });

    test("signing out drops the session everywhere, not just where it was dropped", async ({
        page,
    }) => {
        await signIn(page);
        // Opened by id: with no business chosen, `/` is the chooser.
        await page.goto(`${urls.APP_URL}/open/${NORTHWIND_ORG}`);
        await expect(
            page.getByRole("heading", { name: HOME_GREETING, level: 1 }),
        ).toBeVisible();

        await page.getByRole("button", { name: "Your account" }).click();
        await page.getByRole("menuitem", { name: "Sign out" }).click();

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

    /**
     * #50: a signed-in mutation that carries NO Origin (and no Referer) is
     * refused as well. That is the request a stripped or non-browser client
     * sends with a victim's cookie; a real browser always names its origin.
     *
     * Sent with the page's own request context, so the session cookie goes
     * with it and only the missing Origin can explain a refusal. The body is
     * deliberately invalid: had the guard let it through, validation would
     * answer 400 and nothing would be written.
     */
    test("the API refuses a signed-in mutation with no Origin", async ({
        page,
    }) => {
        await signIn(page);

        // The session is good: the same context reads fine.
        const read = await page.request.get(`${urls.API_URL}/organizations`);
        expect(read.status()).toBe(200);

        const response = await page.request.post(
            `${urls.API_URL}/organizations/${NORTHWIND_ORG}/saved-views`,
            {
                headers: { "content-type": "application/json" },
                data: {},
                failOnStatusCode: false,
            },
        );
        expect(response.status()).toBe(403);
        expect(await response.text()).toContain("Missing request origin");
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
