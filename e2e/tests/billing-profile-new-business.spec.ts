// @covers app:/onboarding app:/ api:organizations api:billing
import type { Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import {
    answerFirst,
    answerKind,
    billingChoices,
    continueSetup,
    SETUP_QUESTIONS,
    setupHeading,
} from "../fixtures/walk-setup";
import { urls } from "../playwright.config";

/**
 * Who Saroh bills for a new business (DEC-167, R7, F2): an owner who has a
 * billing profile is asked while setting the business up, before it
 * exists. Nothing is chosen for them, and "New billing profile" takes a
 * legal name and a billing email of its own.
 *
 * As Asha (`founder`), who is seeded with businesses and one billing
 * profile. Each test sets up a business and a profile of its own, both
 * stamped, so it runs beside everything else.
 */

interface ProfileRow {
    id: string;
    legalName: string;
    billingEmail: string;
    businesses: number;
}

interface OrgRow {
    id: string;
    name: string;
}

async function openSetupToBilling(page: Page, name: string) {
    await useSession(page, "founder");
    await page.goto("/onboarding");
    await answerKind(page);
    await page.getByLabel("What is it called?").fill(name);
    await expect(
        page.getByText("Available. Your website will live here."),
    ).toBeVisible();
    await continueSetup(page);
    await expect(setupHeading(page, SETUP_QUESTIONS.billing)).toBeVisible();
}

async function myProfiles(page: Page): Promise<ProfileRow[]> {
    const res = await page.request.get(`${urls.API_URL}/billing-profiles`);
    expect(res.ok(), await res.text()).toBe(true);
    return (await res.json()) as ProfileRow[];
}

function names(testInfo: TestInfo) {
    const tag = stamp(testInfo);
    return {
        business: `Asha Gym ${tag}`,
        legalName: `Asha Fitness ${tag}`,
        // Short, so a phone shows it whole.
        email: `bp-${tag}@example.com`.toLowerCase(),
    };
}

test.describe("a second business chooses who Saroh bills (DEC-167)", () => {
    test("New billing profile: the business is made on it, and opens", async ({
        page,
    }, testInfo) => {
        const n = names(testInfo);
        await openSetupToBilling(page, n.business);
        await expect(
            page.getByText(/Set up another · Step 3 of 4/),
        ).toBeVisible();

        // Her profile is listed, and nothing is chosen for her.
        const choices = billingChoices(page);
        await expect(choices.first()).toContainText("Asha Rao");
        await expect(choices.last()).toContainText("New billing profile");
        await expect(
            page
                .getByRole("radiogroup", { name: SETUP_QUESTIONS.billing })
                .getByRole("radio", { checked: true }),
        ).toHaveCount(0);

        // Continue asks until one is chosen.
        await continueSetup(page);
        await expect(
            page.getByText("Choose who Saroh bills for this business."),
        ).toBeVisible();
        await expect(setupHeading(page, SETUP_QUESTIONS.billing)).toBeVisible();

        await choices.filter({ hasText: "New billing profile" }).click();
        await page.getByLabel("Legal name").fill(n.legalName);
        await page.getByLabel("Billing email").fill(n.email);

        // The page never scrolls sideways with the fields open.
        const width = page.viewportSize()?.width ?? 0;
        await expect
            .poll(() =>
                page.evaluate(() => document.documentElement.scrollWidth),
            )
            .toBeLessThanOrEqual(width);

        await continueSetup(page);
        await answerFirst(page, { goal: /Decide later/ });

        // In the new business, billed to the new profile.
        await expect(page).not.toHaveURL(/\/onboarding/);
        let made: OrgRow | undefined;
        await expect
            .poll(async () => {
                const res = await page.request.get(
                    `${urls.API_URL}/organizations`,
                );
                made = ((await res.json()) as OrgRow[]).find(
                    (o) => o.name === n.business,
                );
                return made?.id;
            })
            .toBeTruthy();
        const profile = (await myProfiles(page)).find(
            (p) => p.billingEmail === n.email,
        );
        expect(profile).toMatchObject({
            legalName: n.legalName,
            businesses: 1,
        });
        await expect(page.getByText(n.business).first()).toBeVisible();
    });

    test("New billing profile with an email she already uses is asked again, and nothing is made", async ({
        page,
    }, testInfo) => {
        const n = names(testInfo);
        await openSetupToBilling(page, n.business);
        const seeded = (await myProfiles(page)).at(0);
        if (!seeded) throw new Error("Asha is seeded with a billing profile");

        await billingChoices(page)
            .filter({ hasText: "New billing profile" })
            .click();
        await page.getByLabel("Legal name").fill(n.legalName);
        await page.getByLabel("Billing email").fill(seeded.billingEmail);
        await continueSetup(page);

        await expect(
            page.getByText(
                "You already have a billing profile with this email.",
                { exact: false },
            ),
        ).toBeVisible();
        await expect(setupHeading(page, SETUP_QUESTIONS.billing)).toBeVisible();
        await expect(page.getByLabel("Billing email")).toBeFocused();
        const res = await page.request.get(`${urls.API_URL}/organizations`);
        expect(
            ((await res.json()) as OrgRow[]).some((o) => o.name === n.business),
        ).toBe(false);
    });
});
