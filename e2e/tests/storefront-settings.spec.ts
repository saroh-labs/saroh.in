// @covers accounts:/login app:/open app:/commerce/locations api:stores
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * A location's Delivery card (plan B, B17; the 9 Oct audit): a row per way
 * with its switch, and "Late after [N] [hours ▾]" on each way it offers.
 * (Storefronts in the API and in code; DEC-069 renamed only the words.)
 *
 * Walks it on Northwind Supply, the base seed — Rye & Co. and Pulse Fitness
 * are kept camera-ready — and puts its first location back as it found
 * it: the same ways and the same thresholds.
 */

const ORG = "seed_org";
// The API refuses a write with no Origin (#50).
const headers = { "x-organization-id": ORG, origin: urls.APP_URL };
const base = `${urls.API_URL}/organizations/${ORG}/storefronts`;

/** Northwind's locations, as the API lists them. */
async function locations(page: Page): Promise<{ id: string; name: string }[]> {
    const list = await page.request.get(base, { headers });
    expect(list.ok()).toBe(true);
    return (await list.json()) as { id: string; name: string }[];
}

/**
 * Sell › Locations (DEC-069, L9): the old `/commerce/storefronts` address
 * still lands, and the rail says Location(s), desk and phone. Read-only.
 */
test.describe("Locations (DEC-069)", () => {
    test("the old storefronts address lands on Locations, on the one asked for", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${ORG}`);
        const stores = await locations(page);
        const one = stores.at(-1);
        expect(one).toBeDefined();
        if (!one) return;

        await page.goto(`/commerce/storefronts?storefront=${one.id}`);
        await expect(page).toHaveURL(
            new RegExp(`/commerce/locations\\?storefront=${one.id}$`),
        );
        // Titled with the location's own name; the crumb keeps the word.
        await expect(
            page.getByRole("heading", { level: 1, name: one.name }),
        ).toBeVisible();
        await expect(
            page
                .getByRole("navigation", { name: "Breadcrumb" })
                .getByText(stores.length > 1 ? "Locations" : "Location", {
                    exact: true,
                }),
        ).toBeVisible();
        await expect(page.getByLabel("Location name")).toHaveValue(one.name);
        // The words changed, not only the address.
        await expect(
            page.getByText(/storefront/i).filter({ visible: true }),
        ).toHaveCount(0);

        // A deeper old address lands too.
        await page.goto(`/commerce/storefronts/${one.id}/details`);
        await expect(page).toHaveURL(
            new RegExp(`/commerce/locations/${one.id}/details$`),
        );
    });

    test("the tabs keep the open one in the address, and Back returns to the last", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${ORG}`);
        const one = (await locations(page)).at(0);
        expect(one).toBeDefined();
        if (!one) return;
        await page.goto(`/commerce/locations?storefront=${one.id}`);

        const tabs = page.getByRole("tablist", { name: "Location settings" });
        const placeTab = tabs.getByRole("tab", { name: "The place" });
        await expect(placeTab).toHaveAttribute("aria-selected", "true");
        // Pressed until it answers: a press before hydration does nothing.
        await expect(async () => {
            await tabs.getByRole("tab", { name: "Payments" }).click();
            await expect(page).toHaveURL(/[?&]section=payments/, {
                timeout: 2_000,
            });
        }).toPass({ timeout: 20_000 });
        await expect(
            page.getByRole("tabpanel").getByText("Online payments"),
        ).toBeVisible();
        // The title and the readiness line stay above every tab.
        await expect(
            page.getByRole("heading", { level: 1, name: one.name }),
        ).toBeVisible();

        await page.goBack();
        await expect(page).not.toHaveURL(/section=/);
        await expect(placeTab).toHaveAttribute("aria-selected", "true");

        // A link straight to a tab opens it.
        await page.goto(
            `/commerce/locations?storefront=${one.id}&section=delivery`,
        );
        await expect(
            tabs.getByRole("tab", { name: "Delivery" }),
        ).toHaveAttribute("aria-selected", "true");
    });

    test("the rail names the row Location, or Locations once there are several", async ({
        page,
    }, testInfo) => {
        await signIn(page);
        await page.goto(`/open/${ORG}`);
        const label =
            (await locations(page)).length > 1 ? "Locations" : "Location";
        await page.goto("/commerce/locations");

        if (testInfo.project.name.startsWith("phone")) {
            // The phone keeps Sell's rows in More.
            const more = page
                .getByRole("navigation", { name: "Main" })
                .getByRole("button", { name: /^More/ });
            const sheet = page.getByRole("dialog", { name: "Everything else" });
            // Pressed until it opens: a press before hydration does nothing.
            await expect(async () => {
                await more.click();
                await expect(sheet).toBeVisible({ timeout: 2_000 });
            }).toPass({ timeout: 20_000 });
            await expect(
                sheet.getByRole("link", { name: label, exact: true }),
            ).toHaveAttribute("href", "/commerce/locations");
            await expect(sheet.getByText(/storefront/i)).toHaveCount(0);
            return;
        }

        const rail = page.getByRole("navigation", { name: "Primary" });
        await expect(
            rail.getByRole("link", { name: label, exact: true }),
        ).toHaveAttribute("href", "/commerce/locations");
        await expect(rail.getByText(/storefront/i)).toHaveCount(0);
    });
});

type Way = "PICKUP" | "LOCAL_DELIVERY" | "SHIPPING";
interface Storefront {
    id: string;
    kind: "SHOP" | "ONLINE";
    fulfilmentTypes: Way[];
    lateAfterMinutes: Record<Way, number>;
}

async function signIn(page: Page) {
    await useSession(page);
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

// @serial: the ways Northwind's first storefront offers decide how every
// order test's orders may leave.
test.describe(
    "storefront settings: when orders are late",
    { tag: "@serial" },
    () => {
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
                // The Delivery tab, opened by its address.
                await page.goto(
                    `/commerce/locations?storefront=${first.id}&section=delivery`,
                );
                const card = page.getByRole("region", { name: "Delivery" });
                await expect(
                    card.getByRole("switch", { name: "Pick-up", exact: true }),
                ).toHaveAttribute("aria-checked", "true");
                await expect(
                    card.getByRole("switch", { name: "Shipping", exact: true }),
                ).toHaveAttribute("aria-checked", "false");
                await expect(
                    card.getByLabel("Shipping Late after", { exact: true }),
                ).toHaveCount(0);

                // 20 minutes: a fraction of an hour, so in minutes.
                const field = card.getByLabel("Pick-up Late after", {
                    exact: true,
                });
                await field.fill("20");
                await card
                    .getByRole("combobox", { name: "Pick-up late after, unit" })
                    .click();
                await page.getByRole("option", { name: "minutes" }).click();
                await card.getByRole("button", { name: "Save" }).click();
                await expect(
                    page.getByText(
                        "Pick-up orders now count as late after 20 minutes",
                    ),
                ).toBeVisible();
                expect(
                    (await read(page.request, first.id)).lateAfterMinutes
                        .PICKUP,
                ).toBe(20);

                // 3 minutes is refused before it is sent, with the bounds.
                await card
                    .getByLabel("Pick-up Late after", { exact: true })
                    .fill("3");
                await expect(
                    card.getByText("5 minutes at the soonest.", {
                        exact: false,
                    }),
                ).toBeVisible();
                await expect(
                    card.getByRole("button", { name: "Save" }),
                ).toBeDisabled();

                // Shipping on: its row appears, on its default.
                await card
                    .getByRole("switch", { name: "Shipping", exact: true })
                    .click();
                await expect(
                    card.getByLabel("Shipping Late after", { exact: true }),
                ).toHaveValue(String(before.lateAfterMinutes.SHIPPING / 60));
            } finally {
                await write(page.request, first.id, {
                    kind: before.kind,
                    fulfilmentTypes: before.fulfilmentTypes,
                    lateAfterMinutes: before.lateAfterMinutes,
                });
            }
        });
    },
);
