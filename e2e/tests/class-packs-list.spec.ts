import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { demoUser, urls } from "../playwright.config";

/**
 * Bookings › Packs (round-2 E15): the cards and the sell dialog, on
 * Northwind Supply — the base seed's business, where writes are allowed
 * (Rye and Pulse are kept camera-ready). Class packs is on there with no
 * pack, so the test makes its own through the API: one live pack, sold
 * once with UPI at the desk, and one draft, which has no Sell button.
 *
 * It leaves the live pack archived (a sold pack can't be deleted; its sale
 * stays, as the holder's would) and deletes the draft.
 */

const ORG = "seed_org";
const headers = { "x-organization-id": ORG, origin: urls.APP_URL };
const orgApi = (path: string) => `${urls.API_URL}/organizations/${ORG}${path}`;

async function signIn(page: Page) {
    await page.goto(`${urls.ACCOUNTS_URL}/login`);
    await page.getByLabel("Email").fill(demoUser.email);
    await page.getByLabel("Password", { exact: true }).fill(demoUser.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 30_000,
    });
    await page.goto(`/open/${ORG}`);
}

/** Any of Northwind's services, for the pack to pay for. */
async function aService(request: APIRequestContext): Promise<string> {
    const res = await request.get(orgApi("/services"), { headers });
    expect(res.ok()).toBe(true);
    const services = (await res.json()) as { id: string }[];
    expect(services.length).toBeGreaterThan(0);
    return services[0].id;
}

test.describe("class packs list", () => {
    test.beforeEach(async ({ page }) => {
        await signIn(page);
    });

    test("sell a pack with UPI; it shows under Who holds one, and a draft has no Sell", async ({
        page,
    }) => {
        const request = page.request;
        const stamp = Date.now();
        const live = `E2E pack ${stamp}`;
        const draftName = `E2E draft ${stamp}`;
        const serviceId = await aService(request);

        const made = await request.post(orgApi("/class-packs"), {
            headers,
            data: {
                name: live,
                credits: 5,
                validityDays: 30,
                price: "1500",
                currency: "INR",
                serviceIds: [serviceId],
            },
        });
        expect(made.ok()).toBe(true);
        const pack = (await made.json()) as { id: string };
        const drafted = await request.post(orgApi("/class-packs/drafts"), {
            headers,
            data: {
                name: draftName,
                credits: 3,
                validityDays: 14,
                price: "600",
                currency: "INR",
                serviceIds: [serviceId],
            },
        });
        expect(drafted.ok()).toBe(true);
        const draft = (await drafted.json()) as {
            id: string;
            revision: number;
        };

        try {
            await page.goto("/class-packs");
            await expect(
                page.getByRole("heading", { name: "Class packs" }),
            ).toBeVisible();

            // The draft: a Draft badge, why it can't be sold, and no Sell.
            const draftCard = page.getByRole("article", { name: draftName });
            await expect(
                draftCard.getByText("Draft", { exact: true }),
            ).toBeVisible();
            await expect(
                draftCard.getByText(/not on sale until you publish/),
            ).toBeVisible();
            await expect(
                draftCard.getByRole("button", { name: "Sell at the desk" }),
            ).toHaveCount(0);

            // The live pack: its terms, then Sell at the desk.
            const card = page.getByRole("article", { name: live });
            await expect(
                card.getByText("₹1,500", { exact: true }),
            ).toBeVisible();
            await expect(
                card.getByText(/^5 classes · use within 30 days/),
            ).toBeVisible();
            await card
                .getByRole("button", { name: "Sell at the desk" })
                .click();

            const dialog = page.getByRole("dialog", { name: `Sell ${live}` });
            await expect(dialog).toBeVisible();
            const sell = dialog.getByRole("button", { name: /^(Take|Sell)/ });
            // Nothing chosen yet: the dialog says what it needs.
            await expect(sell).toBeDisabled();
            await expect(
                dialog.getByText("Choose a customer and how they paid."),
            ).toBeVisible();

            await dialog.getByRole("combobox").click();
            const first = page.getByRole("option").first();
            const who = (
                await first.locator("span > span").first().innerText()
            ).trim();
            await first.click();
            await dialog
                .getByRole("radio", { name: "UPI at the desk" })
                .click();
            await expect(
                dialog.getByRole("radio", { name: "UPI at the desk" }),
            ).toHaveAttribute("aria-checked", "true");
            await expect(sell).toHaveText("Take ₹1,500");
            await sell.click();
            await expect(
                page.getByText(new RegExp(`has 5 more classes, to use by`)),
            ).toBeVisible();

            // The card counts it; Who holds one lists them, paid by UPI.
            await expect(card.getByText("₹1,500 taken")).toBeVisible();
            await page.getByRole("link", { name: "Who holds one" }).click();
            await page.getByPlaceholder("Search people or packs").fill(live);
            await expect(
                page.getByRole("main").getByText(who).first(),
            ).toBeVisible();
            if (test.info().project.name === "desk") {
                // "Paid by" is a detail column: a phone's list leaves it out.
                const row = page.getByRole("row").filter({ hasText: live });
                await expect(
                    row.getByText("UPI", { exact: true }),
                ).toBeVisible();
            }
            // The sale itself records the method (E13's Sales read).
            const sales = await request.get(
                orgApi(`/class-packs/${pack.id}/sales`),
                { headers },
            );
            expect(sales.ok()).toBe(true);
            expect(
                ((await sales.json()) as { paidBy: string | null }[]).map(
                    (s) => s.paidBy,
                ),
            ).toEqual(["UPI"]);
        } finally {
            await request.post(orgApi(`/class-packs/${pack.id}/archive`), {
                headers,
            });
            await request.delete(
                orgApi(`/class-packs/${draft.id}?revision=${draft.revision}`),
                { headers },
            );
        }
    });
});
