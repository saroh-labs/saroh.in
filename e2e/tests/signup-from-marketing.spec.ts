// @covers accounts:/signup app:/onboarding app:/ app:/choose api:organizations api:billing pkg:auth
import type { Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { stamp } from "../fixtures/own-data";
import { people, useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";
import { lastCode, readSiteCode } from "./site-codes";

/**
 * Open sign-up with plan intent (plan U27): what a visitor gets from a
 * "start" button on saroh.in once it runs with `NEXT_PUBLIC_LAUNCH_MODE=open`.
 * The stack under test runs the site in waitlist mode, so each test opens
 * the address the CTA builder makes in open mode (`apps/saroh.in/lib/
 * links.ts`, pinned by its own tests) on accounts directly.
 *
 * Every test makes an account of its own, with a stamped email, and the
 * business it sets up; the code comes from the API's fake code outbox (no
 * SMTP on a test stack). No checkout reaches a payment provider: the seeded
 * catalogue's paid plans have no provider plan synced, so the API refuses the
 * change before it calls one, and the business stays on Free, which is the
 * path this checks for a paid plan. The step that follows the provider's
 * page is the unit tests' (`apps/app.saroh.in/lib/saroh-billing/
 * plan-checkout.test.ts`).
 */

/**
 * Sign up from the CTA's address with an email and the code sent to it (no
 * name, no password: owner, 10 Oct 2026), and land on onboarding.
 */
async function signUp(
    page: Page,
    testInfo: TestInfo,
    query: string,
): Promise<string> {
    const email = `u27-${stamp(testInfo)}@e2e.saroh.dev`.toLowerCase();
    await page.goto(`${urls.ACCOUNTS_URL}/signup?${query}`);
    // The email is the whole form.
    await expect(page.getByLabel("Your name")).toHaveCount(0);
    await expect(page.getByLabel("Password")).toHaveCount(0);
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Email me a code" }).click();
    await expect(
        page.getByRole("heading", { name: "Check your email", level: 1 }),
    ).toBeVisible();
    const code = await readSiteCode(email);
    // The sixth digit sends the code: nothing is pressed.
    await page.getByLabel("Code").fill(code);
    await page.waitForURL((url) => url.pathname === "/onboarding", {
        timeout: 20_000,
    });
    await expect(page).toHaveTitle(/Set up Saroh/);
    return email;
}

/** Set up a business, and wait to be in the workspace. */
async function setUp(page: Page, name: string) {
    await page.getByRole("radio", { name: /A business/ }).click();
    await page.getByLabel("What is it called?").fill(name);
    await expect(
        page.getByText("Available. Your website will live here."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Create the business" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/onboarding"), {
        timeout: 20_000,
    });
}

/** The plan key the business is on, from the API. */
async function planOf(page: Page, name: string): Promise<string | undefined> {
    let id: string | undefined;
    await expect
        .poll(async () => {
            const res = await page.request.get(`${urls.API_URL}/organizations`);
            const rows = (await res.json()) as { id: string; name: string }[];
            id = rows.find((r) => r.name === name)?.id;
            return id;
        })
        .toBeTruthy();
    const res = await page.request.get(
        `${urls.API_URL}/organizations/${id}/billing/subscription`,
    );
    expect(res.ok()).toBe(true);
    const text = await res.text();
    const sub = text ? (JSON.parse(text) as { plan?: { key?: string } }) : null;
    return sub?.plan?.key;
}

test.describe("sign-up from the marketing site (U27)", () => {
    test("Start free: sign-up, onboarding, and the workspace on Free", async ({
        page,
    }, testInfo) => {
        await signUp(page, testInfo, "plan=free&src=home-hero");
        await expect(page.getByTestId("plan-intent")).toHaveCount(0);
        const name = `Free ${stamp(testInfo)}`;
        await setUp(page, name);
        expect(new URL(page.url()).origin).toBe(new URL(urls.APP_URL).origin);
        expect(await planOf(page, name)).toBe("catalog.free");
    });

    test("a paid plan: named in onboarding, then its checkout; refused, it stays on Free", async ({
        page,
    }, testInfo) => {
        await signUp(page, testInfo, "plan=grow&cycle=month&src=pricing-plans");
        await expect(page).toHaveURL(/[?&]plan=grow/);
        await expect(page.getByTestId("plan-intent")).toContainText(
            /^You picked .+, billed monthly\./,
        );
        const name = `Paid ${stamp(testInfo)}`;
        await setUp(page, name);
        // The checkout couldn't start (no provider plan on a test stack):
        // said, and the business is on Free.
        await expect(
            page.getByText(`${name} is set up, but`, { exact: false }),
        ).toBeVisible();
        expect(await planOf(page, name)).toBe("catalog.free");
    });

    test("a plan Saroh doesn't offer: Free, and onboarding says so", async ({
        page,
    }, testInfo) => {
        await signUp(page, testInfo, "plan=no-such-plan&src=pricing-plans");
        await expect(page.getByTestId("plan-intent")).toHaveText(
            "The plan in your link isn't one Saroh offers, so this starts on Free.",
        );
        const name = `Unknown ${stamp(testInfo)}`;
        await setUp(page, name);
        expect(await planOf(page, name)).toBe("catalog.free");
    });

    test("already signed in: Start free goes to the workspace", async ({
        page,
    }) => {
        await useSession(page, "founder");
        await page.goto(`${urls.ACCOUNTS_URL}/signup?plan=free&src=nav`);
        // Saroh itself, whose front door picks Home or which business. It
        // was accounts' `/apps`, a list of Saroh's own hosts.
        await page.waitForURL((url) => url.origin === urls.APP_URL, {
            timeout: 20_000,
        });
        expect(new URL(page.url()).pathname).not.toBe("/apps");
        expect(new URL(page.url()).pathname).not.toMatch(/^\/login/);
    });

    /**
     * An address that already has an account gets the same "Check your
     * email" as a new one (the page must not say who is registered), and
     * the same code email. The code signs that account in, and it lands in
     * its own business, not in setup for another.
     */
    test("signing up with an address that has an account: the same page, and the code signs it in", async ({
        page,
    }, testInfo) => {
        // Desk and phone run side by side, and a new code replaces the one
        // before it: each uses a seeded person no other code test does.
        const who = testInfo.project.name.startsWith("phone")
            ? people.storefront
            : people.desk;
        await page.goto(`${urls.ACCOUNTS_URL}/signup`);
        await page.getByLabel("Email").fill(who.email);
        const before = lastCode(who.email);
        await page.getByRole("button", { name: "Email me a code" }).click();
        await expect(
            page.getByRole("heading", { name: "Check your email", level: 1 }),
        ).toBeVisible();
        // Nothing on the step says an account was found.
        await expect(page.getByText(/already have an account/)).toHaveCount(0);
        await expect(
            page.getByRole("button", { name: "Change email" }),
        ).toBeVisible();
        // Privacy, Terms and Help are one tap away on every one of these.
        await expect(
            page
                .getByRole("navigation", { name: "Legal and help" })
                .getByRole("link", { name: "Help" }),
        ).toBeVisible();

        await page
            .getByLabel("Code")
            .fill(await readSiteCode(who.email, before));
        await page.waitForURL((url) => url.origin === urls.APP_URL, {
            timeout: 30_000,
        });
        await expect(page).not.toHaveURL(/\/onboarding/);
    });

    test("signed in with a business, a plan link to onboarding goes to the workspace", async ({
        page,
    }) => {
        await useSession(page, "founder");
        await page.goto("/onboarding?plan=grow&cycle=month");
        await expect(page).toHaveURL(
            (url) => !url.pathname.startsWith("/onboarding"),
        );
    });
});
