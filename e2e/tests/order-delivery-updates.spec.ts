// @covers accounts:/login app:/open app:/commerce/orders api:orders api:site-accounts api:communications
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { makeOrder, northwind } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";

/**
 * Delivery updates on Order Detail (DEC-174 U16, #1147), desk and phone:
 *
 * - Mark delivered says what the customer hears, held ten seconds with an
 *   Undo that takes it back unsent;
 * - the Tracking sheet says what reaches the customer, never "Nothing is
 *   sent" where something is, nor a promise where nothing goes;
 * - tracking saved after the handover says they're told, and the same
 *   tracking saved again says nothing is sent.
 *
 * Each test makes its own Northwind order, paid by hand, and never turns a
 * business-wide switch, so it runs beside every other spec. What the
 * business can send (its email provider, its delivery updates switch) is
 * read from the order, and the words expected follow from it.
 */

const NORTHWIND = "seed_org";

type Reach = "EMAIL_AND_ACCOUNT" | "EMAIL" | "ACCOUNT" | "ON_SIGN_IN" | "NONE";

interface Read {
    customerNotice?: Reach | null;
    deliveryUpdates?: boolean | null;
}

/** Two Toasters are mounted (one per theme); only one is ever shown. */
const shown = (page: Page, text: string | RegExp) =>
    page.getByText(text).locator("visible=true").first();

/** A shipment of the test's own, handed to the courier with no number. */
async function handedOver(page: Page): Promise<string> {
    const { id } = await makeOrder(page.request, {
        fulfilment: "SHIPPING",
        stage: "READY",
    });
    await northwind(page.request).post(`/orders/${id}/stage`, {
        to: "HANDED_TO_COURIER",
        courierName: "Delhivery",
    });
    return id;
}

async function readOf(page: Page, id: string): Promise<Read> {
    return northwind(page.request).get<Read>(`/orders/${id}`);
}

const emailed = (r: Read) =>
    r.customerNotice === "EMAIL" || r.customerNotice === "EMAIL_AND_ACCOUNT";

test.describe("delivery updates on order detail (U16)", () => {
    test.beforeEach(async ({ page }) => {
        await useSession(page);
        await page.goto(`/open/${NORTHWIND}`);
    });

    test("the Tracking sheet says what reaches the customer, and the saved toast agrees", async ({
        page,
    }) => {
        test.setTimeout(90_000);
        const id = await handedOver(page);
        const read = await readOf(page, id);
        await page.goto(`/commerce/orders/${id}`);

        const card = page.getByRole("region", { name: "Customer" });
        await card
            .getByRole("button", { name: "Add the tracking number" })
            .click();
        const panel = page.getByRole("dialog", {
            name: "Tracking",
            exact: true,
        });
        if (read.deliveryUpdates === false) {
            await expect(
                panel.getByText(
                    /Nothing is sent to \w+: delivery updates are off\./,
                ),
            ).toBeVisible();
        } else if (emailed(read)) {
            await expect(
                panel.getByText(/gets new tracking by email\./),
            ).toBeVisible();
            await expect(panel.getByText(/Nothing is sent/)).toHaveCount(0);
        } else if (read.customerNotice === "NONE") {
            // No email connected: no promise.
            await expect(
                panel.getByText(/Nothing is sent to \w+\./),
            ).toBeVisible();
            await expect(panel.getByText(/by email/)).toHaveCount(0);
        }

        await panel.getByLabel("Tracking number").fill("AWB 7711 0042");
        await panel.getByRole("button", { name: "Save" }).click();
        await expect(panel).toBeHidden();
        await expect(shown(page, "Tracking number saved.")).toBeVisible();
        if (read.deliveryUpdates === true && emailed(read)) {
            await expect(
                shown(page, /is emailed the tracking\./),
            ).toBeVisible();
        } else {
            await expect(
                shown(page, /It stays on the order\. Nothing is sent to /),
            ).toBeVisible();
        }

        // Only the courier's name changed, the number the same: nobody is
        // told again.
        await card
            .getByRole("button", {
                name: "Change the courier or tracking number",
            })
            .click();
        const again = page.getByRole("dialog", {
            name: "Tracking",
            exact: true,
        });
        await again.getByRole("radio", { name: "Blue Dart" }).click();
        await again.getByRole("button", { name: "Save" }).click();
        await expect(again).toBeHidden();
        await expect(
            shown(page, /It stays on the order\. Nothing is sent to /),
        ).toBeVisible();
    });

    test("Mark delivered says what they hear, and Undo inside ten seconds takes it back", async ({
        page,
    }) => {
        test.setTimeout(90_000);
        const id = await handedOver(page);
        const read = await readOf(page, id);
        await page.goto(`/commerce/orders/${id}`);

        await page
            .getByRole("button", { name: "Mark delivered", exact: true })
            .click();
        await expect(shown(page, "Delivered.")).toBeVisible();
        if (read.deliveryUpdates === false) {
            await expect(
                shown(page, /isn't told: delivery updates are off\./),
            ).toBeVisible();
        } else if (emailed(read)) {
            await expect(
                shown(page, /will be told in 10 seconds\./),
            ).toBeVisible();
        }
        await page
            .getByRole("button", { name: "Undo" })
            .locator("visible=true")
            .first()
            .click();
        await expect(shown(page, /^Back to handed to courier\./)).toBeVisible();
        if (read.deliveryUpdates === true && emailed(read)) {
            await expect(shown(page, /Not sent\./)).toBeVisible();
        }
        // Nothing waits to go: the step and its notice are both undone.
        const after = await northwind(page.request).get<{ stage: string }>(
            `/orders/${id}`,
        );
        expect(after.stage).toBe("HANDED_TO_COURIER");
    });
});
