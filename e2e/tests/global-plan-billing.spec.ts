// @covers accounts:/login app:/open app:/settings/billing app:/settings/billing/plans api:billing api:pricing pkg:edition
import type { Browser, Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
    GLOBAL_SKIP_WHY,
    globalBusiness,
    globalStack,
    openGlobal,
} from "../fixtures/global";
import { makeBusiness } from "../fixtures/own-business";
import { stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { ignoreHTTPSErrors, urls } from "../playwright.config";

/**
 * Saroh's plans abroad (stage 9, U10; DEC-211), on desk and phone.
 *
 * `SAROH_BILLING_GLOBAL` is turned on for one Global business of Asha's
 * own, never by default, so it runs beside everything else. Saroh sells a
 * Global business its plans only with the switch on **and** a paid Global
 * catalogue live (KTD3); the seeded stack's Global catalogue is Free only,
 * so the switch alone opens nothing: the business stays on Free, in no
 * rupees, with no plan to buy, and the API refuses a quote in the same
 * words as with it off. The same owner's India business still has India's
 * plans, in rupees.
 *
 * Not here: buying a plan (a UK billing profile, Grow, its USD export
 * invoice). The stack has no fake for Saroh's own billing provider, and a
 * paid catalogue isn't live until Razorpay has its plans, so that journey is
 * proved on the fake provider against Postgres instead
 * (`apps/api.saroh.in/src/modules/billing/checkout-global.db.spec.ts`).
 */

/** Turn the switch on for this business alone, as Sam would in admin. */
async function switchOn(browser: Browser, orgId: string, testInfo: TestInfo) {
    const context = await browser.newContext({ ignoreHTTPSErrors });
    try {
        const staff = await context.newPage();
        await useSession(staff, "staff");
        const res = await staff.request.put(
            `${urls.API_URL}/admin/flags/SAROH_BILLING_GLOBAL/organizations/${orgId}`,
            {
                headers: { origin: urls.APP_URL },
                data: {
                    enabled: true,
                    reason: "Browser test of Saroh's plans abroad (stage 9)",
                    idempotencyKey: `sbg-${orgId}-${stamp(testInfo)}`,
                },
            },
        );
        expect(res.ok(), `switch on: ${await res.text()}`).toBe(true);
    } finally {
        await context.close();
    }
}

/** The business's own billing API, as its owner. */
function billing(page: Page, orgId: string) {
    const url = (path: string) =>
        `${urls.API_URL}/organizations/${orgId}/billing${path}`;
    const headers = { "x-organization-id": orgId, origin: urls.APP_URL };
    return {
        get: (path: string) => page.request.get(url(path), { headers }),
    };
}

test.describe("Saroh's plans abroad (stage 9)", () => {
    test.skip(!globalStack, GLOBAL_SKIP_WHY);

    test("the switch alone sells nothing: Free, in no rupees, with nothing to buy", async ({
        browser,
        page,
    }, testInfo) => {
        const b = await globalBusiness(page, testInfo, "gpb");
        await switchOn(browser, b.id, testInfo);

        // The API: not offered, and a quote refused as with the switch off.
        const api = billing(page, b.id);
        const offered = await api.get("/offered");
        expect(offered.ok(), await offered.text()).toBe(true);
        expect(await offered.json()).toEqual({ offered: false });
        const quote = await api.get("/change-plan?plan=grow&cycle=month");
        expect(quote.status()).toBe(409);
        expect(await quote.text()).toContain(
            "Saroh's plans aren't available for businesses outside India yet.",
        );

        // The screen: the Free note, never a price or GST.
        await openGlobal(page, b);
        await page.goto(`${urls.GLOBAL_APP_URL}/settings/billing`);
        await expect(page.getByText("You're on Free")).toBeVisible();
        await expect(
            page.getByText("Paid plans aren't available yet."),
        ).toBeVisible();
        const body = page.locator("body");
        await expect(body).not.toContainText("₹");
        await expect(body).not.toContainText("GST");
        await expect(
            page.locator('a[href^="/settings/billing/plans"]'),
        ).toHaveCount(0);
    });

    test("the same owner's India business still has India's plans, in rupees", async ({
        page,
    }, testInfo) => {
        const b = await makeBusiness(page, testInfo, "gpb-in");
        await page.goto(`${urls.APP_URL}/open/${b.id}`);
        await page.goto(`${urls.APP_URL}/settings/billing/plans`);
        const picker = page.getByRole("region", { name: "Plans" });
        await expect(picker.locator("[data-plan]").first()).toBeVisible();
        await expect(picker).toContainText("₹");
    });
});
