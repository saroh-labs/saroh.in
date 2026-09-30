// @covers accounts:/login app:/onboarding api:organizations
import AxeBuilder from "@axe-core/playwright";
import type { Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * "What are you setting up?" (DEC-070, K2).
 *
 * Setup asks it first, with nothing chosen; the answer sets the words the
 * rest of the form speaks in, and is stored as the business's kind. As Asha
 * (`founder`), who is seeded with no business: each test sets up one of its
 * own, with a stamped name, and reads its kind back from the API. Nothing
 * of the demo owner's is touched, so it runs beside everything else.
 */

interface OrgRow {
    id: string;
    name: string;
    kind?: string;
}

async function openSetup(page: Page) {
    await useSession(page, "founder");
    await page.goto("/onboarding");
    await expect(page).toHaveTitle(/Set up Saroh/);
    await expect(
        page.getByRole("radiogroup", { name: "What are you setting up?" }),
    ).toBeVisible();
}

/** Name it, wait for its address to be free, and set it up. */
async function setUp(page: Page, name: string, button: string) {
    await page.getByLabel("Your name or brand").fill(name);
    await expect(
        page.getByText("Free — your website will live here."),
    ).toBeVisible();
    await page.getByRole("button", { name: button }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/onboarding"));
}

/** The business Asha just set up, as the API lists it and summarises it. */
async function kindOf(page: Page, name: string) {
    let listed: OrgRow | undefined;
    await expect
        .poll(async () => {
            const res = await page.request.get(`${urls.API_URL}/organizations`);
            const rows = (await res.json()) as OrgRow[];
            listed = rows.find((r) => r.name === name);
            return listed?.kind;
        })
        .toBeTruthy();
    // The summary wraps the organization beside the caller's role.
    const summary = (await (
        await page.request.get(`${urls.API_URL}/organizations/${listed?.id}`)
    ).json()) as { organization?: OrgRow };
    return { listed: listed?.kind, summary: summary.organization?.kind };
}

function aName(prefix: string, testInfo: TestInfo) {
    return `${prefix} ${stamp(testInfo)}`;
}

test.describe("What are you setting up? (DEC-070)", () => {
    test("nothing is chosen, and setup will not go on without an answer", async ({
        page,
    }) => {
        await openSetup(page);
        const choices = page
            .getByRole("radiogroup", { name: "What are you setting up?" })
            .getByRole("radio");
        await expect(choices).toHaveText([
            /A business/,
            /Just me/,
            /A site for my work/,
        ]);
        for (const choice of await choices.all()) {
            await expect(choice).toHaveAttribute("aria-checked", "false");
        }
        // The rest of the form waits for the answer.
        await expect(page.getByLabel("What is it called?")).toBeHidden();

        await page.getByRole("button", { name: "Set it up" }).click();
        await expect(
            page.getByText("Choose what you're setting up"),
        ).toBeVisible();
        await expect(page).toHaveURL(/\/onboarding/);

        // axe on the cards, answered and not.
        const axe = async () =>
            (
                await new AxeBuilder({ page })
                    .include('[role="radiogroup"]')
                    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
                    .analyze()
            ).violations.map((v) => `${v.id}: ${v.help}`);
        expect(await axe()).toEqual([]);
        await page.getByRole("radio", { name: /Just me/ }).click();
        expect(await axe()).toEqual([]);
    });

    test("Just me is asked for a name or brand, and is stored as SOLO", async ({
        page,
    }, testInfo) => {
        await openSetup(page);
        await page.getByRole("radio", { name: /Just me/ }).click();

        await expect(page.getByLabel("Your name or brand")).toBeVisible();
        await expect(page.getByLabel("Your name or brand")).toHaveAttribute(
            "placeholder",
            "Asha Rao",
        );
        await expect(
            page.getByText("Is it registered as a company?"),
        ).toBeVisible();

        const name = aName("Asha Rao", testInfo);
        await setUp(page, name, "Set it up");
        expect(await kindOf(page, name)).toEqual({
            listed: "SOLO",
            summary: "SOLO",
        });
    });

    test("A site for my work is not asked about a company, and is stored as WORK", async ({
        page,
    }, testInfo) => {
        await openSetup(page);
        await page.getByRole("radio", { name: /A site for my work/ }).click();

        await expect(page.getByLabel("Your name or brand")).toHaveAttribute(
            "placeholder",
            "Asha Rao Studio",
        );
        await expect(
            page.getByText("Is it registered as a company?"),
        ).toBeHidden();

        // The page never scrolls sideways, at the width it was set to (on a
        // phone `innerWidth` grows with the overflow, so it can't be used).
        const width = page.viewportSize()?.width ?? 0;
        await expect
            .poll(() =>
                page.evaluate(() => document.documentElement.scrollWidth),
            )
            .toBeLessThanOrEqual(width);

        const name = aName("Asha Rao Studio", testInfo);
        await setUp(page, name, "Set it up");
        expect(await kindOf(page, name)).toEqual({
            listed: "WORK",
            summary: "WORK",
        });
    });
});
