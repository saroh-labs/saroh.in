// @covers app:/open app:/ app:/calendar app:/contacts/[contactId] accounts:/login pkg:auth api:organizations api:contacts api:customer-workspace
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { makeContact, stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { demoUser, NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * The router keeps its own copy of a page for 30 s (`staleTimes.dynamic`,
 * next.config.js). That copy must never outlive what made it wrong: another
 * tab switching business, signing out, or a write on the page.
 *
 * Desk only: the claims are about the router, not the layout. Northwind is
 * the business written to; Rye & Co. is only opened (choosing a business is
 * this context's cookie, nothing more).
 */

const rail = (page: Page) => page.getByRole("navigation", { name: "Primary" });

/** Click a rail link: a client-side move the router may serve from its copy. */
async function railTo(page: Page, href: string) {
    await rail(page).locator(`a[href="${href}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`${href === "/" ? "/$" : href}`));
}

/** The next request for `path`'s page payload (not a prefetch). */
function payloadRequest(page: Page, path: string) {
    return page.waitForRequest((req) => {
        const h = req.headers();
        return (
            new URL(req.url()).pathname === path &&
            h.rsc === "1" &&
            !h["next-router-prefetch"] &&
            !h["next-router-segment-prefetch"]
        );
    });
}

test.describe("the router's copy of a page", () => {
    test.skip(({ isMobile }) => isMobile, "Desk only.");

    test("a switch in one tab: the other tab's next move reads the new business", async ({
        page,
    }) => {
        await useSession(page);
        await page.goto(`/open/${NORTHWIND_ORG}`);
        const other = await page.context().newPage();
        await useSession(other);
        await other.goto("/");
        await expect(
            other.getByRole("button", { name: /currently Northwind/ }),
        ).toBeVisible();
        // The other tab now holds Home and Calendar, both under 30 s old.
        await railTo(other, "/calendar");
        await railTo(other, "/");

        await page
            .getByRole("button", { name: /^Change business, currently/ })
            .click();
        await page.getByRole("button", { name: /^Rye/ }).click();
        await expect(
            page.getByRole("button", { name: /currently Rye/ }),
        ).toBeVisible();

        // It heard the switch and read itself again.
        await expect(
            other.getByRole("button", { name: /currently Rye/ }),
        ).toBeVisible();
        // And its copy of Calendar went with it: the move asks the server.
        const asked = payloadRequest(other, "/calendar");
        await railTo(other, "/calendar");
        await asked;
        await expect(
            other.getByRole("button", { name: /currently Rye/ }),
        ).toBeVisible();
    });

    test("signed out, then Back: no workspace", async ({ page }) => {
        // Through the form: signing out a saved session would sign every
        // later spec out with it.
        await page.goto(`${urls.ACCOUNTS_URL}/login?with=password`);
        await page.getByLabel("Email").fill(demoUser.email);
        await page
            .getByLabel("Password", { exact: true })
            .fill(demoUser.password);
        await page.getByRole("button", { name: "Sign in" }).click();
        await expect
            .poll(() => new URL(page.url()).pathname.startsWith("/login"), {
                timeout: 30_000,
            })
            .toBe(false);
        await page.waitForLoadState("load");

        // Sign-in may still be redirecting: a goto it interrupts is aborted.
        await page
            .goto(`${urls.APP_URL}/open/${NORTHWIND_ORG}`)
            .catch(() => page.goto(`${urls.APP_URL}/open/${NORTHWIND_ORG}`));
        await expect(rail(page)).toBeVisible();
        await railTo(page, "/calendar");

        await page.getByRole("button", { name: "Your account" }).click();
        await page.getByRole("menuitem", { name: "Sign out" }).click();
        await page.waitForURL(/\/login/, { timeout: 30_000 });

        await page.goBack();
        await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
        await expect(rail(page)).toHaveCount(0);
    });

    test("a write, a move away and Back within 30 s: the write shows", async ({
        page,
    }, testInfo) => {
        await useSession(page);
        await page.goto(`/open/${NORTHWIND_ORG}`);
        const s = stamp(testInfo);
        const who = await makeContact(page.request, {
            firstName: "Cache",
            lastName: s,
            email: `cache-${s}@example.test`,
        });
        await page.goto(`/contacts/${who.id}?tab=notes`);
        const text = `E2E cache note ${s}`;

        await page.getByRole("button", { name: "Add note" }).click();
        const sheet = page.getByRole("dialog", { name: "New note" });
        await sheet.getByLabel("Note", { exact: true }).fill(text);
        await sheet.getByRole("button", { name: "Add note" }).click();
        const note = page.getByRole("article").filter({ hasText: text });
        await expect(note).toBeVisible();

        await railTo(page, "/calendar");
        await page.goBack();
        await expect(page).toHaveURL(new RegExp(`/contacts/${who.id}`));
        await expect(note).toBeVisible();
    });
});
