import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { demoUser, NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * Pack Detail (round-2 E16) on Northwind, where browser checks may write:
 * a card's Open leads to the pack's page; Who has it lists the holder, and
 * extending them by 7 days moves their use-by date and logs an event; a
 * pack nobody holds offers Sell this pack.
 *
 * The test makes its own contact and packs through the API, and archives
 * the packs at the end (a sold pack can't be deleted). Skipped when
 * Northwind has Class packs off, or no service for a pack to pay for.
 */

const headers = { "x-organization-id": NORTHWIND_ORG, origin: urls.APP_URL };
const orgApi = (path: string) =>
    `${urls.API_URL}/organizations/${NORTHWIND_ORG}${path}`;

async function signIn(page: Page) {
    await page.goto(`${urls.ACCOUNTS_URL}/login`);
    await page.getByLabel("Email").fill(demoUser.email);
    await page.getByLabel("Password", { exact: true }).fill(demoUser.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 30_000,
    });
    await page.goto(`/open/${NORTHWIND_ORG}`);
}

/** A service and the kind of pack that pays for it (E13). */
async function aService(
    request: APIRequestContext,
): Promise<{ id: string; kind: "CLASSES" | "ONE_TO_ONE" } | null> {
    const res = await request.get(orgApi("/services"), { headers });
    if (!res.ok()) return null;
    const services = (await res.json()) as { id: string; capacity: number }[];
    const s = services.at(0);
    if (!s) return null;
    return { id: s.id, kind: s.capacity > 1 ? "CLASSES" : "ONE_TO_ONE" };
}

async function makePack(
    request: APIRequestContext,
    name: string,
    service: { id: string; kind: string },
): Promise<string> {
    const res = await request.post(orgApi("/class-packs"), {
        headers,
        data: {
            name,
            credits: 5,
            validityDays: 30,
            price: "1500",
            currency: "INR",
            serviceIds: [service.id],
            kind: service.kind,
        },
    });
    expect(res.ok(), await res.text()).toBe(true);
    return ((await res.json()) as { id: string }).id;
}

async function extendedEvents(
    request: APIRequestContext,
    packId: string,
): Promise<number> {
    const res = await request.get(orgApi(`/class-packs/${packId}/events`), {
        headers,
    });
    expect(res.ok()).toBe(true);
    const page = (await res.json()) as { events: { kind: string }[] };
    return page.events.filter((e) => e.kind === "EXTENDED").length;
}

test.describe("Pack Detail on Northwind (E16)", () => {
    test("Open a pack; extend a holder by 7 days; a pack nobody holds offers Sell", async ({
        page,
    }) => {
        await signIn(page);
        const request = page.request;
        const service = await aService(request);
        test.skip(!service, "Northwind has no service for a pack to pay for");
        if (!service) return;
        const on = await request.get(orgApi("/class-packs"), { headers });
        test.skip(!on.ok(), "Class packs aren't on for Northwind");

        const stamp = Date.now();
        const name = `E2E detail ${stamp}`;
        const emptyName = `E2E nobody ${stamp}`;
        const contact = await request.post(orgApi("/contacts"), {
            headers,
            data: {
                email: `e2e-pack-${stamp}@example.com`,
                firstName: "Asha",
                lastName: `Pack ${stamp}`,
            },
        });
        expect(contact.ok(), await contact.text()).toBe(true);
        const contactId = ((await contact.json()) as { id: string }).id;
        const packId = await makePack(request, name, service);
        const emptyId = await makePack(request, emptyName, service);

        try {
            const sold = await request.post(
                orgApi(`/class-packs/${packId}/sell`),
                { headers, data: { contactId, paidBy: "CASH" } },
            );
            expect(sold.ok(), await sold.text()).toBe(true);

            // The card's Open leads to the pack's own page.
            await page.goto("/class-packs");
            await page
                .getByRole("article", { name })
                .getByRole("link", { name: `Open ${name}` })
                .click();
            await page.waitForURL(`**/class-packs/${packId}`);
            await expect(
                page.getByRole("heading", { level: 1, name }),
            ).toBeVisible();
            await expect(page.getByText("Linked to this pack")).toBeVisible();

            // Who has it: the holder, and Extend.
            await page.getByRole("tab", { name: /^Who has it/ }).click();
            await expect(page).toHaveURL(/\?tab=who$/);
            await expect(page.getByText("Can still use · 1")).toBeVisible();
            await expect(
                page.getByRole("link", { name: `Open Asha Pack ${stamp}` }),
            ).toBeVisible();
            const before = await extendedEvents(request, packId);

            await page
                .getByRole("button", {
                    name: `Extend Asha Pack ${stamp}'s pack`,
                })
                .click();
            const dialog = page.getByRole("dialog", {
                name: `Extend Asha Pack ${stamp}'s pack`,
            });
            await expect(dialog).toBeVisible();
            const save = dialog.getByRole("button", {
                name: "Extend",
                exact: true,
            });
            await expect(save).toBeDisabled();
            await dialog.getByRole("radio", { name: "+7 days" }).click();
            await dialog.getByLabel("Reason").fill("E2E: away for a week");
            await save.click();
            await expect(
                page.getByText(/^Asha's pack now runs to /),
            ).toBeVisible();
            await expect(dialog).toBeHidden();
            await expect(
                page.getByText(/\+7 days on .*: E2E: away for a week/),
            ).toBeVisible();
            // The extension is in the pack's activity (E17 draws it).
            expect(await extendedEvents(request, packId)).toBe(before + 1);

            // A pack nobody holds: the empty state, with Sell this pack.
            await page.goto(`/class-packs/${emptyId}?tab=who`);
            await expect(
                page.getByText("Nobody has this pack yet"),
            ).toBeVisible();
            await page.getByRole("button", { name: "Sell this pack" }).click();
            await expect(
                page.getByRole("dialog", { name: `Sell ${emptyName}` }),
            ).toBeVisible();
        } finally {
            for (const id of [packId, emptyId]) {
                await request.post(orgApi(`/class-packs/${id}/archive`), {
                    headers,
                });
            }
        }
    });
});
