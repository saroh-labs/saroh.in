import { createHmac, randomBytes } from "node:crypto";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { demoUser, urls } from "../playwright.config";
import { signInOnSheet } from "./site-codes";

/**
 * A customer's session on a merchant's site (ADR-011; round-2 plan A, A3),
 * against the running stack.
 *
 * What runs now is the server side of it: the API's customer routes answer
 * only a site's own server (the signed relay), a token that isn't a live
 * session for that site signs nobody in, and a workspace session never
 * signs anyone in on a site. The browser flow (A9) signs in at the last step
 * of booking on Northwind, reloads and is recognised, and checks another
 * business's site never gets the cookie. The code comes from the fake
 * transport's outbox (`site-codes.ts`).
 *
 * Runs on Northwind Supply, the base seed's site. The browser flow makes
 * one booking there and cancels it again; nothing else writes.
 */

const renderer = new URL(urls.RENDERER_URL);
const SITE_HOST = `northwind.${renderer.hostname}`;
const SITE = `${renderer.protocol}//northwind.${renderer.host}`;

/**
 * The stack's relay secret: CI sets it (its built apps have no development
 * fallback); a local stack runs on the API's development value.
 */
const RELAY_SECRET =
    process.env.SITE_RELAY_SECRET ??
    "saroh-dev-insecure-site-relay-secret-not-for-production";

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
    const ORG = "seed_org";
    const SERVICE = "Warehouse walkthrough";
    const OTHER_SITE = `${renderer.protocol}//monsoon.${renderer.host}`;

    async function signInStaff(page: Page) {
        await page.goto(`${urls.ACCOUNTS_URL}/login`);
        await page.getByLabel("Email").fill(demoUser.email);
        await page
            .getByLabel("Password", { exact: true })
            .fill(demoUser.password);
        await page.getByRole("button", { name: "Log in" }).click();
        await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
            timeout: 30_000,
        });
    }

    /** The booking page, a service and its first free time. */
    async function chooseTime(page: Page) {
        await page.goto(`${SITE}/book`);
        await page.getByRole("radio", { name: new RegExp(SERVICE) }).click();
        const times = page.locator('[role="radiogroup"] button[role="radio"]', {
            hasText: /^\d{2}:\d{2}$/,
        });
        await expect(times.first()).toBeVisible({ timeout: 15_000 });
        await times.first().click();
    }

    test("signs in at the last step of booking on Northwind, stays signed in on reload, and is not signed in on another site (A9)", async ({
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        const email = `signin-${testInfo.project.name}-${Date.now()}@example.in`;

        await chooseTime(page);
        await page.getByLabel("Name").fill("Asha Rao");
        const desk = page.getByRole("radio", { name: /Pay at the desk/ });
        if (await desk.count()) await desk.click();
        await page
            .getByRole("button", { name: "Continue to sign in" })
            .first()
            .click();
        await expect(
            page.getByText(
                "Last step: confirm it's you, then we'll finish. No password.",
            ),
        ).toBeVisible();
        await signInOnSheet(page, email);
        await expect(
            page.getByRole("heading", { name: "You're booked, Asha." }),
        ).toBeVisible({ timeout: 15_000 });

        // The session: host-only, Secure, HttpOnly, Lax.
        const cookies = await page.context().cookies(SITE);
        const session = cookies.find((c) => c.name === "__Host-saroh_session");
        expect(session?.secure).toBe(true);
        expect(session?.httpOnly).toBe(true);
        expect(session?.sameSite).toBe("Lax");
        expect(session?.domain).toBe(SITE_HOST);

        // A reload: still signed in, and recognised.
        await chooseTime(page);
        await expect(page.getByText(/Booking as/)).toContainText("Asha Rao");
        await expect(
            page.getByRole("button", { name: "Not you?" }),
        ).toBeVisible();

        // Another business's site never receives the cookie.
        await page.goto(OTHER_SITE);
        expect(
            (await page.context().cookies(OTHER_SITE)).some(
                (c) => c.name === "__Host-saroh_session",
            ),
        ).toBe(false);

        // Leave Northwind's calendar as it was.
        await signInStaff(page);
        const from = new Date(Date.now() - 86_400_000).toISOString();
        const to = new Date(Date.now() + 15 * 86_400_000).toISOString();
        const res = await page.request.get(
            `${urls.API_URL}/organizations/${ORG}/services/bookings?from=${from}&to=${to}`,
        );
        const calendar = (await res.json()) as {
            diaries: {
                bookings: { id: string; bookerEmail: string | null }[];
            }[];
        };
        const mine = calendar.diaries
            .flatMap((d) => d.bookings)
            .filter((b) => b.bookerEmail === email);
        expect(mine).toHaveLength(1);
        for (const booking of mine) {
            await page.request.delete(
                `${urls.API_URL}/organizations/${ORG}/services/bookings/${booking.id}`,
                { headers: { origin: urls.APP_URL } },
            );
        }
    });
});
