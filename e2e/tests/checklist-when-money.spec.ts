// @covers app:/settings/organization api:organizations api:invoices api:contacts
import type { Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { ownAddress } from "../fixtures/own-business";
import { stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * The address, business type and logo only once something invoices or
 * takes money (DEC-070, K4).
 *
 * As Asha (`founder`), on "a site for my work" she sets up for the test:
 * nothing on that sells, and no invoice, so Settings › Business asks for
 * none of them. Once she drafts a first invoice — invoicing needs no module
 * — it asks for "your address" (her kind's words), the type and the logo.
 *
 * A business made at test time can't turn a module on (DEV_LEARNINGS), so
 * the one-step "Publish your site" list of a WORK business with Website on,
 * and Home's copy of the list (Home shows no dashboard while nothing is
 * on), are covered in vitest (`ready.test.ts`). The business is Asha's
 * alone, so this runs beside everything else.
 */

interface Made {
    id: string;
}

/** A WORK business of Asha's own, set up the way onboarding does. */
async function makeWork(page: Page, testInfo: TestInfo): Promise<string> {
    await useSession(page, "founder");
    const address = ownAddress("k4", testInfo);
    const res = await page.request.post(`${urls.API_URL}/organizations`, {
        headers: { origin: urls.APP_URL },
        data: {
            name: `Asha ${address}`,
            kind: "WORK",
            address,
            profile: { country: "IN", timezone: "Asia/Kolkata" },
        },
    });
    expect(res.ok(), await res.text()).toBe(true);
    return ((await res.json()) as Made).id;
}

/** Her API, on that business. */
function api(page: Page, org: string) {
    const headers = { "x-organization-id": org, origin: urls.APP_URL };
    return async (path: string, data: unknown): Promise<Made> => {
        const res = await page.request.post(
            `${urls.API_URL}/organizations/${org}${path}`,
            { headers, data },
        );
        expect(res.ok(), `${path}: ${await res.text()}`).toBe(true);
        return (await res.json()) as Made;
    };
}

/** Settings › Business's checklist card, whichever heading it has. */
const settingsCard = (page: Page) =>
    page
        .getByRole("region", {
            name: /Ready to take payments|Get your site live|Finish setting up/,
        })
        .filter({ visible: true });

test("the address, type and logo wait for a first invoice", async ({
    page,
}, testInfo) => {
    const org = await makeWork(page, testInfo);
    await page.goto(`/open/${org}`);

    // Nothing sells and nothing is invoiced: no card, and none of its asks.
    await page.goto("/settings/organization");
    // The page is drawn once its web address is: the card would be with it.
    await expect(
        page.getByRole("region", { name: "Web address" }).filter({
            visible: true,
        }),
    ).toBeVisible();
    await expect(settingsCard(page)).toHaveCount(0);
    await expect(page.getByText("Choose your business type")).toHaveCount(0);
    await expect(page.getByText("Add your logo")).toHaveCount(0);

    // A first invoice, a draft: now the business invoices.
    const post = api(page, org);
    const contact = await post("/contacts", {
        firstName: "Ravi",
        lastName: `Client ${testInfo.project.name}`,
        // A contact is reached somehow: an email, never a phone (own-data).
        email: `k4-${stamp(testInfo)}@example.test`,
    });
    await post("/invoices", {
        contactId: contact.id,
        currency: "INR",
        lines: [{ description: "Logo design", quantity: 1, unitPrice: "1200" }],
    });

    // The settings read counts it at once: no waiting on anything.
    await page.goto("/settings/organization");
    const card = settingsCard(page);
    await expect(card).toBeVisible();
    await expect(card).toHaveAccessibleName("Ready to take payments");
    // Her kind's words: "your address", not "your registered address".
    await expect(card).toContainText("Add your address");
    await expect(card).not.toContainText("registered address");
    await expect(card).toContainText("Choose your business type");
    await expect(card).toContainText("Add your logo");
    const add = card.getByRole("link", { name: "Add address" });
    await expect(add).toHaveAttribute(
        "href",
        "/settings/organization?section=address",
    );
    await expect(add).toHaveCSS("cursor", "pointer");
});
