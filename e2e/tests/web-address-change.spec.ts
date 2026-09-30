// @covers app:/settings/organization app:/open api:organizations
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { makeBusiness } from "../fixtures/own-business";
import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * Settings › Business › Web address (DEC-069, L4).
 *
 * The owner changes the business's web address with what it does said
 * first, and the row then shows the new address and until when the old one
 * is kept. It runs on a business the test sets up for itself
 * (`makeBusiness`, as Asha): Northwind's address is read by every other
 * spec, and the film sets are only read. The seed turns changing on for
 * every business (`WEB_ADDRESS_CHANGE`), since it can't know this one.
 *
 * A business set up here has no website — the seed's module flags reach
 * only its own businesses — so its old address is kept, not forwarded. The
 * forwarding half (the new host serves, the old one answers 307) is L3's,
 * which adds it to this spec on a business with a live site.
 *
 * An admin is checked on Prana Yoga, where the demo owner is an admin:
 * read only, as the film sets are.
 */

interface WebAddressView {
    address: string;
    previous: {
        address: string;
        redirectUntil: string | null;
        reservedUntil: string;
    }[];
    canChange: boolean;
}

const card = (page: Page) =>
    page.getByRole("region", { name: "Web address" }).filter({ visible: true });

/** "28 Dec" (or "28 Dec 2027"): a day, as the row names one. */
const DAY = String.raw`\d{1,2} [A-Z][a-z]{2}( \d{4})?`;

test("the owner changes the web address, and the old one is kept for them", async ({
    page,
}, testInfo) => {
    const business = await makeBusiness(page, testInfo, "wa");
    const next = `${business.address}-new`;

    await page.goto(`/open/${business.id}`);
    await page.goto("/settings/organization");
    const row = card(page);
    await expect(row).toContainText(`${business.address}.saroh.app`);
    // No website yet, so nothing to open.
    await expect(row.getByRole("link", { name: /Open/ })).toHaveCount(0);

    await row.getByRole("button", { name: "Change" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // What changing does is said before the button.
    await expect(dialog).toContainText(
        new RegExp(
            `${business.address}\\.saroh\\.app\\S* stays yours until ${DAY}, then it's released`,
        ),
    );

    const field = dialog.getByLabel("New web address");
    // Two hyphens in a row: the API's words, and Save stays off.
    await field.fill(`${business.address}--x`);
    await expect(dialog).toContainText(
        "An address can't have two hyphens in a row",
    );
    await expect(
        dialog.getByRole("button", { name: "Change web address" }),
    ).toBeDisabled();

    await field.fill(next);
    await expect(dialog.getByText("Free", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Change web address" }).click();

    await expect(
        page
            .getByText(
                new RegExp(`Your web address is now ${next}\\.saroh\\.app`),
            )
            .filter({ visible: true }),
    ).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(row).toContainText(`${next}.saroh.app`);
    await expect(row).toContainText(
        new RegExp(
            `${business.address}\\.saroh\\.app\\S* is kept for you until ${DAY}`,
        ),
    );

    // The API agrees: the new address, and the old one held for 90 days.
    const view = (await (
        await page.request.get(
            `${urls.API_URL}/organizations/${business.id}/web-address`,
            { headers: { "x-organization-id": business.id } },
        )
    ).json()) as WebAddressView;
    expect(view.address).toBe(next);
    expect(view.previous.map((p) => p.address)).toEqual([business.address]);
    const days =
        (new Date(view.previous[0].reservedUntil).getTime() - Date.now()) /
        86_400_000;
    expect(days).toBeGreaterThan(89);
    expect(days).toBeLessThanOrEqual(90);

    // Nobody else can set up at the old address while it is kept.
    const check = (await (
        await page.request.get(
            `${urls.API_URL}/organizations/address-availability?address=${business.address}`,
        )
    ).json()) as { available: boolean };
    expect(check.available).toBe(false);
});

test("an admin reads the web address, and has no Change", async ({ page }) => {
    await useSession(page);
    const orgs = (await (
        await page.request.get(`${urls.API_URL}/organizations`)
    ).json()) as { id: string; name: string; role?: string }[];
    const prana = orgs.find((o) => o.name === "Prana Yoga");
    expect(prana, "the demo owner is an admin of Prana Yoga").toBeDefined();

    await page.goto(`/open/${prana?.id}`);
    await page.goto("/settings/organization");
    const row = card(page);
    await expect(row).toContainText(".saroh.app");
    await expect(row).toContainText("Only the owner can change this.");
    await expect(row.getByRole("button", { name: "Change" })).toHaveCount(0);
});
