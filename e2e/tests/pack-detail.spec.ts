// @covers accounts:/login app:/open app:/class-packs api:class-packs api:bookings
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { stamp as ownStamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG, urls } from "../playwright.config";

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
    await useSession(page);
    await page.goto(`/open/${NORTHWIND_ORG}`);
}

/**
 * A service and the kind of pack that pays for it (E13): one of the seed's,
 * never a service another test is making and deleting ("E2E …"), nor the
 * walkthrough, whose times the booking-page specs are taking.
 */
async function aService(
    request: APIRequestContext,
): Promise<{ id: string; kind: "CLASSES" | "ONE_TO_ONE" } | null> {
    const res = await request.get(orgApi("/services"), { headers });
    if (!res.ok()) return null;
    const services = (await res.json()) as {
        id: string;
        name: string;
        capacity: number;
    }[];
    const s = services.find(
        (x) => !x.name.startsWith("E2E ") && x.name !== "Warehouse walkthrough",
    );
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
    // Class packs aren't offered on any plan for now (DEC-099): their pages
    // are no page (class-packs-list.spec.ts checks it), so this waits for
    // packs to be offered again.
    test.skip(
        true,
        "Class packs aren't offered on any plan for now (DEC-099).",
    );
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

        const stamp = ownStamp(test.info());
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

/** Northwind's day, "YYYY-MM-DD", in the zone its services are booked in. */
const northwindDay = (at: Date | string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
        new Date(at),
    );

/**
 * Pack Detail's Used this week, Sales and Activity (round-2 E17): a sale
 * with no payment shows "None" as its method and is in the activity; the
 * Receipts card's Open narrows Invoices to the pack; a class booked today
 * with the pack shows under Used this week.
 */
test.describe("Pack Detail's other tabs on Northwind (E17)", () => {
    // Class packs aren't offered on any plan for now (DEC-099): their pages
    // are no page (class-packs-list.spec.ts checks it), so this waits for
    // packs to be offered again.
    test.skip(
        true,
        "Class packs aren't offered on any plan for now (DEC-099).",
    );
    test("Sales says None for no payment; Activity has the sale; Used this week has today's class", async ({
        page,
    }) => {
        await signIn(page);
        const request = page.request;
        const service = await aService(request);
        test.skip(!service, "Northwind has no service for a pack to pay for");
        if (!service) return;
        const on = await request.get(orgApi("/class-packs"), { headers });
        test.skip(!on.ok(), "Class packs aren't on for Northwind");

        const stamp = ownStamp(test.info());
        const name = `E2E tabs ${stamp}`;
        const contact = await request.post(orgApi("/contacts"), {
            headers,
            data: {
                email: `e2e-pack-tabs-${stamp}@example.com`,
                firstName: "Meera",
                lastName: `Tabs ${stamp}`,
            },
        });
        expect(contact.ok(), await contact.text()).toBe(true);
        const contactId = ((await contact.json()) as { id: string }).id;
        const who = `Meera Tabs ${stamp}`;
        const packId = await makePack(request, name, service);
        let bookingId: string | null = null;

        try {
            const sold = await request.post(
                orgApi(`/class-packs/${packId}/sell`),
                { headers, data: { contactId, paidBy: "NONE" } },
            );
            expect(sold.ok(), await sold.text()).toBe(true);
            const purchaseId = ((await sold.json()) as { id: string }).id;

            // Sales: the sale, with "None" as how it was paid.
            await page.goto(`/class-packs/${packId}?tab=sales`);
            await expect(page.getByText("Sales and takings")).toBeVisible();
            const row = page.getByRole("listitem").filter({
                has: page.getByRole("link", { name: `Open ${who}` }),
            });
            await expect(row).toContainText("₹1,500");
            await expect(row).toContainText("None");

            // Activity: the sale is there, newest first.
            await page.getByRole("tab", { name: /^Activity/ }).click();
            await expect(page).toHaveURL(/\?tab=activity$/);
            await expect(
                page.getByText(`Sold to ${who} · ₹1,500 · None`),
            ).toBeVisible();

            // Used this week: a class booked today with the pack.
            const now = new Date();
            const slots = await request.get(
                orgApi(
                    `/services/${service.id}/availability?from=${encodeURIComponent(now.toISOString())}&to=${encodeURIComponent(new Date(now.getTime() + 86_400_000).toISOString())}`,
                ),
                { headers },
            );
            const today = slots.ok()
                ? ((await slots.json()) as { startAt: string }[]).filter(
                      (s) => northwindDay(s.startAt) === northwindDay(now),
                  )
                : [];
            test.skip(
                today.length === 0,
                "No open slot left today for the service",
            );
            // The first of today's times still free when it is asked for:
            // the other project's copy of this test books from the same list
            // at the same moment, and one of them is refused the time.
            let refused = "";
            for (const slot of today) {
                const booked = await request.post(
                    orgApi(`/services/${service.id}/bookings`),
                    {
                        headers,
                        data: {
                            startAt: slot.startAt,
                            contactId,
                            useClassPack: true,
                            packPurchaseId: purchaseId,
                        },
                    },
                );
                if (!booked.ok()) {
                    refused = `${booked.status()} ${await booked.text()}`;
                    continue;
                }
                bookingId = ((await booked.json()) as { id: string }).id;
                break;
            }
            expect(
                bookingId,
                `no time today could be booked: ${refused}`,
            ).toBeTruthy();

            await page.goto(`/class-packs/${packId}?tab=used`);
            const use = page.getByRole("listitem").filter({ hasText: who });
            await expect(use).toBeVisible();
            await expect(use).toContainText("Booked");
        } finally {
            if (bookingId) {
                await request.delete(
                    orgApi(`/services/bookings/${bookingId}?returnCredit=true`),
                    { headers },
                );
            }
            await request.post(orgApi(`/class-packs/${packId}/archive`), {
                headers,
            });
        }
    });
});
