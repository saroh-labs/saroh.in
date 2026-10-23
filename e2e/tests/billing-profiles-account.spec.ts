// @covers accounts:/account/billing-profiles app:/settings/billing api:billing
import type { Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectNothingHiddenSideways } from "../fixtures/hidden-sideways";
import type { OwnBusiness } from "../fixtures/own-business";
import { makeBusiness } from "../fixtures/own-business";
import { stamp } from "../fixtures/own-data";
import { urls } from "../playwright.config";

/**
 * Billing profiles in the account (DEC-167 step 2, #1015): an owner with
 * two businesses, each on a billing profile of its own, opens the list in
 * accounts.saroh.in, opens one profile's page, and moves its Free business
 * to the other profile, which is at once (a paid one would wait for its
 * renewal). Then the way in from the business's Plan & billing.
 *
 * As Asha (`founder`). The test makes its own two businesses (on Free) and
 * two stamped profiles, and finds them by their stamp, so it runs beside
 * everything else on desk and phone.
 */

interface Made {
    created?: string;
}

/** A new profile of Asha's, made from a business's Plan & billing and used for it. */
async function profileFor(
    page: Page,
    business: OwnBusiness,
    legalName: string,
    email: string,
): Promise<string> {
    const res = await page.request.post(
        `${urls.API_URL}/organizations/${business.id}/billing/profile`,
        {
            headers: { origin: urls.APP_URL },
            data: {
                legalName,
                billingEmail: email,
                addressLine1: "3 Hill Road",
                city: "Bengaluru",
                postalCode: "560038",
                gstState: "29",
                use: true,
            },
        },
    );
    expect(res.ok(), await res.text()).toBe(true);
    const made = ((await res.json()) as Made).created;
    if (!made) throw new Error("no profile made");
    return made;
}

function names(testInfo: TestInfo) {
    const tag = stamp(testInfo);
    return {
        first: `Asha Rooms ${tag}`,
        second: `Asha Yoga ${tag}`,
        firstEmail: `bpa1-${tag}@example.com`.toLowerCase(),
        secondEmail: `bpa2-${tag}@example.com`.toLowerCase(),
    };
}

test.describe("Billing profiles in the account (DEC-167 step 2)", () => {
    test("an owner opens the list and a profile's page, and moves a Free business to another profile", async ({
        page,
    }, testInfo) => {
        const n = names(testInfo);
        const rooms = await makeBusiness(page, testInfo, "bpa");
        const firstId = await profileFor(page, rooms, n.first, n.firstEmail);
        const yoga = await makeBusiness(page, testInfo, "bpb");
        const secondId = await profileFor(page, yoga, n.second, n.secondEmail);

        // The list: both profiles, each with the business it pays for.
        await page.goto(`${urls.ACCOUNTS_URL}/account/billing-profiles`);
        await expect(
            page.getByRole("heading", { name: "Billing profiles", level: 1 }),
        ).toBeVisible();
        const nav = page.getByRole("navigation", { name: "Your account" });
        await expect(
            nav.getByRole("link", { name: "Billing profiles" }),
        ).toHaveAttribute("aria-current", "page");
        const first = page.getByRole("link", { name: `Open ${n.first}` });
        await expect(first).toContainText(rooms.name);
        await expect(
            page.getByRole("link", { name: `Open ${n.second}` }),
        ).toContainText(yoga.name);
        await expectNothingHiddenSideways(page);

        // Its page: what it pays for, its details, and Remove off with why.
        await first.click();
        await expect(page).toHaveURL(
            new RegExp(`/account/billing-profiles/${firstId}$`),
        );
        await expect(
            page.getByRole("heading", { name: n.first, level: 1 }),
        ).toBeVisible();
        const paysFor = page.getByRole("region", { name: "Pays for" });
        await expect(paysFor).toContainText(rooms.name);
        await expect(
            page.getByRole("region", { name: "On Saroh's invoices" }),
        ).toContainText(n.firstEmail);
        await expect(
            page
                .getByRole("region", { name: "Remove this profile" })
                .getByRole("button", { name: "Remove profile…" }),
        ).toBeDisabled();
        await expectNothingHiddenSideways(page);

        // Move the Free business: at once.
        const dialog = page.getByRole("dialog", { name: `Move ${rooms.name}` });
        await expect(async () => {
            await paysFor
                .getByRole("button", {
                    name: `Move ${rooms.name} to another profile`,
                })
                .click();
            await expect(dialog).toBeVisible({ timeout: 2_000 });
        }).toPass();
        await dialog.getByText(n.second, { exact: true }).click();
        await expect(dialog).toContainText("It moves now.");
        await dialog.getByRole("button", { name: "Move now" }).click();
        await expect(dialog).toBeHidden();
        await expect(paysFor).toContainText("No business is billed to it yet.");

        // It is on the other profile now, beside its own business.
        await page.goto(
            `${urls.ACCOUNTS_URL}/account/billing-profiles/${secondId}`,
        );
        const there = page.getByRole("region", { name: "Pays for" });
        await expect(there).toContainText(rooms.name);
        await expect(there).toContainText(yoga.name);
    });

    test("Plan & billing links an owner to all their billing profiles", async ({
        page,
    }, testInfo) => {
        const n = names(testInfo);
        const business = await makeBusiness(page, testInfo, "bpl");
        await profileFor(page, business, n.first, n.firstEmail);
        await page.goto(`/open/${business.id}`);
        await page.goto("/settings/billing");
        const panel = page.getByRole("region", { name: "Who Saroh bills" });
        const link = panel.getByRole("link", {
            name: "All your billing profiles ↗",
        });
        await expect(link).toHaveAttribute(
            "href",
            /\/account\/billing-profiles$/,
        );
        await link.click();
        await expect(page).toHaveURL(/\/account\/billing-profiles$/);
        await expect(
            page.getByRole("link", { name: `Open ${n.first}` }),
        ).toBeVisible();
    });
});
