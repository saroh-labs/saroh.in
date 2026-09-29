// @covers accounts:/login app:/open app:/commerce/storefronts api:stores
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { demoUser, urls } from "../playwright.config";

/**
 * Storefronts, "How orders leave" (plan B, B17): the chips, and "Mark
 * pick-up orders late after [N] [hours ▾]" per way the storefront offers.
 *
 * Walks it on Northwind Supply, the base seed — Rye & Co. and Pulse Fitness
 * are kept camera-ready — and puts its first storefront back as it found
 * it: the same ways and the same thresholds.
 */

const ORG = "seed_org";
// The API refuses a write with no Origin (#50).
const headers = { "x-organization-id": ORG, origin: urls.APP_URL };
const base = `${urls.API_URL}/organizations/${ORG}/storefronts`;

type Way = "PICKUP" | "LOCAL_DELIVERY" | "SHIPPING";
interface Storefront {
    id: string;
    kind: "SHOP" | "ONLINE";
    fulfilmentTypes: Way[];
    lateAfterMinutes: Record<Way, number>;
}

async function signIn(page: Page) {
    await page.goto(`${urls.ACCOUNTS_URL}/login`);
    await page.getByLabel("Email").fill(demoUser.email);
    await page.getByLabel("Password", { exact: true }).fill(demoUser.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 30_000,
    });
}

async function read(
    request: APIRequestContext,
    id: string,
): Promise<Storefront> {
    const res = await request.get(`${base}/${id}`, { headers });
    expect(res.ok()).toBe(true);
    return (await res.json()) as Storefront;
}

async function write(
    request: APIRequestContext,
    id: string,
    data: Partial<Pick<Storefront, "fulfilmentTypes" | "lateAfterMinutes">> & {
        kind?: Storefront["kind"];
    },
) {
    const res = await request.patch(`${base}/${id}`, { headers, data });
    expect(res.ok()).toBe(true);
}

test.describe("storefront settings: when orders are late", () => {
    test("a counter sets pick-ups late after 20 minutes; a way it doesn't offer has no row", async ({
        page,
    }) => {
        test.setTimeout(120_000);
        await signIn(page);
        await page.goto(`/open/${ORG}`);

        const list = await page.request.get(base, { headers });
        expect(list.ok()).toBe(true);
        const stores = (await list.json()) as { id: string }[];
        expect(stores.length).toBeGreaterThan(0);
        const first = stores[0];
        const before = await read(page.request, first.id);

        try {
            // A shop that offers Pick-up and not Shipping.
            await write(page.request, first.id, {
                kind: "SHOP",
                fulfilmentTypes: ["PICKUP"],
            });
            await page.goto(`/commerce/storefronts?storefront=${first.id}`);
            const card = page.getByRole("region", {
                name: "How orders leave",
            });
            await expect(
                card.getByRole("button", { name: "Pick-up" }),
            ).toHaveAttribute("aria-pressed", "true");
            await expect(
                card.getByRole("button", { name: "Shipping" }),
            ).toHaveAttribute("aria-pressed", "false");
            await expect(
                card.getByLabel("Mark shipping orders late after"),
            ).toHaveCount(0);

            // 20 minutes: a fraction of an hour, so in minutes.
            const field = card.getByLabel("Mark pick-up orders late after");
            await field.fill("20");
            await card
                .getByRole("combobox", { name: "Unit for pick-up orders" })
                .click();
            await page.getByRole("option", { name: "minutes" }).click();
            await card.getByRole("button", { name: "Save" }).click();
            await expect(
                page.getByText(
                    "Pick-up orders now count as late after 20 minutes",
                ),
            ).toBeVisible();
            expect(
                (await read(page.request, first.id)).lateAfterMinutes.PICKUP,
            ).toBe(20);

            // 3 minutes is refused before it is sent, with the bounds.
            await card.getByLabel("Mark pick-up orders late after").fill("3");
            await expect(
                card.getByText("5 minutes at the soonest.", { exact: false }),
            ).toBeVisible();
            await expect(
                card.getByRole("button", { name: "Save" }),
            ).toBeDisabled();

            // Shipping on: its row appears, on its default.
            await card.getByRole("button", { name: "Shipping" }).click();
            await expect(
                card.getByLabel("Mark shipping orders late after"),
            ).toHaveValue(String(before.lateAfterMinutes.SHIPPING / 60));
        } finally {
            await write(page.request, first.id, {
                kind: before.kind,
                fulfilmentTypes: before.fulfilmentTypes,
                lateAfterMinutes: before.lateAfterMinutes,
            });
        }
    });
});
