// @covers app:/settings/organization app:/open api:organizations site:/[slug] site:/shop api:sites
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
 * forwarding half (L3) reads an old address the seed holds for Northwind,
 * as a change leaves one (`packages/database/src/seed/previous-address.ts`):
 * it answers 307 to the same page on Northwind's site, which serves, and an
 * address nobody holds still 404s. That a change writes such a row is
 * covered against a real database (`web-address.service.db.spec.ts`).
 *
 * An admin is checked on Prana Yoga, where the demo owner is an admin:
 * read only, as the film sets are.
 */

interface WebAddressView {
    address: string;
    platformOrigin: string;
    previous: {
        address: string;
        redirectUntil: string | null;
        reservedUntil: string;
    }[];
    canChange: boolean;
}

const card = (page: Page) =>
    page.getByRole("region", { name: "Web address" }).filter({ visible: true });

/** The business's web address, as the API reads it. */
async function viewOf(page: Page, org: string): Promise<WebAddressView> {
    const res = await page.request.get(
        `${urls.API_URL}/organizations/${org}/web-address`,
        { headers: { "x-organization-id": org } },
    );
    expect(res.ok()).toBe(true);
    return (await res.json()) as WebAddressView;
}

/**
 * What follows an address on this stack: `.saroh.app`, or the renderer's
 * own host where it runs on a bare port (CI).
 */
const suffixOf = (view: WebAddressView) =>
    new URL(view.platformOrigin).host.slice(view.address.length);

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "28 Dec" (or "28 Dec 2027"): a day, as the row names one. */
const DAY = String.raw`\d{1,2} [A-Z][a-z]{2}( \d{4})?`;

test("the owner changes the web address, and the old one is kept for them", async ({
    page,
}, testInfo) => {
    const business = await makeBusiness(page, testInfo, "wa");
    const next = `${business.address}-new`;
    const suffix = suffixOf(await viewOf(page, business.id));
    const oldHost = escape(`${business.address}${suffix}`);

    await page.goto(`/open/${business.id}`);
    await page.goto("/settings/organization");
    const row = card(page);
    await expect(row).toContainText(`${business.address}${suffix}`);
    // No website yet, so nothing to open.
    await expect(row.getByRole("link", { name: /Open/ })).toHaveCount(0);

    await row.getByRole("button", { name: "Change" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // What changing does is said before the button.
    await expect(dialog).toContainText(
        new RegExp(`${oldHost} stays yours until ${DAY}, then it's released`),
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
            .getByText(`Your web address is now ${next}${suffix}`)
            .filter({ visible: true }),
    ).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(row).toContainText(`${next}${suffix}`);
    await expect(row).toContainText(
        new RegExp(`${oldHost} is kept for you until ${DAY}`),
    );

    // The API agrees: the new address, and the old one held for 90 days.
    const view = await viewOf(page, business.id);
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
    const view = await viewOf(page, prana?.id ?? "");
    await expect(row).toContainText(`${view.address}${suffixOf(view)}`);
    await expect(row).toContainText("Only the owner can change this.");
    await expect(row.getByRole("button", { name: "Change" })).toHaveCount(0);
});

/** A host on the renderer, as this stack serves one. */
const renderer = new URL(urls.RENDERER_URL);
const hostOf = (address: string) =>
    `${renderer.protocol}//${address}.${renderer.host}`;

/** The old address the seed holds for Northwind (`previous-address.ts`). */
const NORTHWIND_BEFORE = "northwind-before";

test("an old address forwards to the same page on the new one (L3)", async ({
    request,
}) => {
    // Where the API says the old address forwards: Northwind's site.
    const moved = await request.get(
        `${urls.API_URL}/public/sites/moved/${NORTHWIND_BEFORE}`,
    );
    expect(moved.ok(), await moved.text()).toBe(true);
    const { to } = (await moved.json()) as { to: string };
    expect(new URL(to).hostname.startsWith("northwind.")).toBe(true);

    // The same path and query, with a temporary redirect: a browser must
    // not keep a hop that stops being true after 90 days.
    const old = await request.get(`${hostOf(NORTHWIND_BEFORE)}/shop?x=1`, {
        maxRedirects: 0,
    });
    expect(old.status()).toBe(307);
    expect(old.headers().location).toBe(`${to}/shop?x=1`);

    // A post, and the root, go the same way.
    const post = await request.get(`${hostOf(NORTHWIND_BEFORE)}/posts/a-b`, {
        maxRedirects: 0,
    });
    expect(post.status()).toBe(307);
    expect(post.headers().location).toBe(`${to}/posts/a-b`);

    // The new address serves.
    const live = await request.get(`${hostOf("northwind")}/`);
    expect(live.status()).toBe(200);

    // An address nobody holds is still a 404, not a redirect.
    const unknown = await request.get(`${hostOf("nobody-holds-this")}/shop`, {
        maxRedirects: 0,
    });
    expect(unknown.status()).toBe(404);
});
