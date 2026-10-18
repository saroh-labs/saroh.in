// @covers app:/settings/billing app:/open api:billing
import type { Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectNothingHiddenSideways } from "../fixtures/hidden-sideways";
import type { OwnBusiness } from "../fixtures/own-business";
import { makeBusiness } from "../fixtures/own-business";
import { stamp } from "../fixtures/own-data";
import { urls } from "../playwright.config";

/**
 * Who Saroh bills, on Plan & billing (DEC-167, R8, R9, U5): the owner
 * reads the business's billing profile first, edits it in a side sheet
 * that says first how many businesses the edit changes, and bills a Free
 * business to another of their profiles in place.
 *
 * As Asha (`founder`). Each test sets up its own businesses (on Free) and
 * a stamped billing profile of its own, so it runs beside everything else.
 */

interface ProfileView {
    current: { id?: string; legalName: string; mine: boolean } | null;
    created?: string;
}

function names(testInfo: TestInfo) {
    const tag = stamp(testInfo);
    return {
        legalName: `Asha Studio ${tag}`,
        email: `bpp-${tag}@example.com`.toLowerCase(),
    };
}

/** A new billing profile of Asha's, made from a business's Plan & billing. */
async function newProfile(
    page: Page,
    business: OwnBusiness,
    n: { legalName: string; email: string },
    use: boolean,
): Promise<string> {
    const res = await page.request.post(
        `${urls.API_URL}/organizations/${business.id}/billing/profile`,
        {
            headers: { origin: urls.APP_URL },
            data: {
                legalName: n.legalName,
                billingEmail: n.email,
                addressLine1: "3 Hill Road",
                city: "Bengaluru",
                postalCode: "560038",
                gstState: "29",
                use,
            },
        },
    );
    expect(res.ok(), await res.text()).toBe(true);
    const made = ((await res.json()) as ProfileView).created;
    if (!made) throw new Error("no profile made");
    return made;
}

async function choose(page: Page, business: OwnBusiness, profileId: string) {
    const res = await page.request.post(
        `${urls.API_URL}/organizations/${business.id}/billing/profile/choose`,
        {
            headers: { origin: urls.APP_URL },
            data: { billingProfileId: profileId },
        },
    );
    expect(res.ok(), await res.text()).toBe(true);
}

async function openPlanBilling(page: Page, business: OwnBusiness) {
    await page.goto(`/open/${business.id}`);
    await page.goto("/settings/billing");
    return page.getByRole("region", { name: "Who Saroh bills" });
}

test.describe("who Saroh bills, on Plan & billing (DEC-167)", () => {
    test("editing a profile two businesses use says so first, then saves for both", async ({
        page,
    }, testInfo) => {
        const n = names(testInfo);
        const first = await makeBusiness(page, testInfo, "bpe");
        const profileId = await newProfile(page, first, n, true);
        const second = await makeBusiness(page, testInfo, "bpe2");
        await choose(page, second, profileId);

        const panel = await openPlanBilling(page, first);
        await expect(panel).toContainText("Billed to");
        await expect(panel).toContainText(n.legalName);
        await expect(panel).toContainText(n.email);
        await expectNothingHiddenSideways(page);

        await panel.getByRole("button", { name: "Edit" }).click();
        const sheet = page.getByRole("dialog", {
            name: "Edit billing profile",
        });
        await expect(sheet).toContainText(
            "This changes Saroh's invoices for 2 businesses.",
        );
        await sheet.getByLabel("Billing address").fill("4 Lake View");
        await sheet
            .getByRole("button", { name: "Save for 2 businesses" })
            .click();
        await expect(sheet).toBeHidden();
        await expect(panel).toContainText("4 Lake View");

        // The second business is billed to the same, changed profile.
        const panel2 = await openPlanBilling(page, second);
        await expect(panel2).toContainText("4 Lake View");
    });

    test("a Free business is billed to another of my profiles at once", async ({
        page,
    }, testInfo) => {
        const n = names(testInfo);
        const business = await makeBusiness(page, testInfo, "bpc");
        await newProfile(page, business, n, false);

        const panel = await openPlanBilling(page, business);
        await expect(panel).not.toContainText(n.legalName);
        await panel.getByRole("button", { name: "Change" }).click();
        const sheet = page.getByRole("dialog", {
            name: "Change who Saroh bills",
        });
        await sheet.getByRole("radio").filter({ hasText: n.legalName }).click();
        await sheet.getByRole("button", { name: "Save" }).click();
        await expect(sheet).toBeHidden();
        await expect(panel).toContainText(n.legalName);
        await expect(panel).toContainText(n.email);
        await expectNothingHiddenSideways(page);
    });
});
