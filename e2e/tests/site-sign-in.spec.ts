import { createHmac, randomBytes } from "node:crypto";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { demoUser, urls } from "../playwright.config";

/**
 * A customer's session on a merchant's site (ADR-011; round-2 plan A, A3),
 * against the running stack.
 *
 * What runs now is the server side of it: the API's customer routes answer
 * only a site's own server (the signed relay), a token that isn't a live
 * session for that site signs nobody in, and a workspace session never
 * signs anyone in on a site. The browser flow — sign in on Northwind, reload
 * and stay signed in, then open another site and not be — needs the sheet
 * on a page, which A9 puts at the last step of booking; it is written below
 * and marked `fixme` until then. The API's integration spec
 * (`customer-rls.db.spec.ts`) covers those same cases over HTTP today.
 *
 * Runs on Northwind Supply, the base seed's site. Nothing here writes.
 */

const renderer = new URL(urls.RENDERER_URL);
const SITE_HOST = `northwind.${renderer.hostname}`;
const SITE = `${renderer.protocol}//northwind.${renderer.host}`;

/** The API's development value: the stack under test runs unconfigured. */
const RELAY_SECRET = "saroh-dev-insecure-site-relay-secret-not-for-production";

/** The `x-saroh-relay` header, as saroh.app's `lib/site-relay.ts` signs it. */
function relay(host: string, address = "203.0.113.50"): string {
    const seconds = String(Math.floor(Date.now() / 1000));
    const b64 = (value: string | Buffer) =>
        Buffer.from(value).toString("base64url");
    const sig = createHmac("sha256", RELAY_SECRET)
        .update(`v1\n${seconds}\n${address}\n${host}`)
        .digest();
    return ["v1", seconds, b64(address), b64(host), b64(sig)].join(".");
}

const optionsUrl = `${urls.API_URL}/public/site-accounts/options`;
const sessionUrl = `${urls.API_URL}/public/site-accounts/session`;

test.describe("site sign-in: the API side", () => {
    test("refuses a call that didn't come from a site's server", async ({
        request,
    }) => {
        const res = await request.get(optionsUrl);
        expect(res.status()).toBe(401);
    });

    test("answers the site's own server for Northwind", async ({ request }) => {
        const res = await request.get(optionsUrl, {
            headers: { "x-saroh-relay": relay(SITE_HOST) },
        });
        expect(res.status()).toBe(200);
        const body = (await res.json()) as {
            businessName: string;
            phone: string | null;
        };
        expect(body.businessName).toBeTruthy();
    });

    test("a token that isn't a live session signs nobody in", async ({
        request,
    }) => {
        const res = await request.get(sessionUrl, {
            headers: {
                "x-saroh-relay": relay(SITE_HOST),
                "x-customer-session": randomBytes(32).toString("base64url"),
            },
        });
        expect(res.status()).toBe(401);
    });

    test("a workspace session doesn't sign anyone in on the site", async ({
        page,
    }) => {
        await page.goto(`${urls.ACCOUNTS_URL}/login`);
        await page.getByLabel("Email").fill(demoUser.email);
        await page
            .getByLabel("Password", { exact: true })
            .fill(demoUser.password);
        await page.getByRole("button", { name: "Log in" }).click();
        await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
            timeout: 30_000,
        });
        // The same browser, carrying the workspace cookies.
        const res = await page.request.get(sessionUrl, {
            headers: { "x-saroh-relay": relay(SITE_HOST) },
        });
        expect(res.status()).toBe(401);
    });

    test("visiting a site sets no session cookie", async ({ page }) => {
        const res = await page.goto(SITE);
        const setCookie = (await res?.allHeaders())?.["set-cookie"] ?? "";
        expect(setCookie).not.toContain("__Host-saroh_session");
    });
});

test.describe("site sign-in: in the browser", () => {
    /** Open the sheet from the booking page (A9 wires it). */
    async function signInOnNorthwind(page: Page) {
        await page.goto(`${SITE}/book`);
        // A9: choose a time, then "Continue to sign in" opens the sheet.
        await page.getByRole("button", { name: "Continue to sign in" }).click();
    }

    test.fixme("signs in on Northwind, stays signed in on reload, and is not signed in on another site (A9 opens the sheet)", async ({
        page,
    }) => {
        await signInOnNorthwind(page);
        const cookies = await page.context().cookies(SITE);
        const session = cookies.find((c) => c.name === "__Host-saroh_session");
        expect(session?.secure).toBe(true);
        expect(session?.httpOnly).toBe(true);
        expect(session?.sameSite).toBe("Lax");
        expect(session?.domain).toBe(SITE_HOST);
    });
});
