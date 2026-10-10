// @covers accounts:/login app:/onboarding app:/ api:organizations api:capabilities
import AxeBuilder from "@axe-core/playwright";
import type { Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * Setup is one screen (UX audit, 10 Oct): "What are you setting up?"
 * (DEC-070, K2) is a small choice with "A business" chosen, every field is
 * there from the start, and "What will you do first?" is on the same
 * screen. The answer sets the words the form speaks in and is stored as the
 * business's kind.
 *
 * As Asha (`founder`): each test sets up a business of its own, with a
 * stamped name, and reads its kind back from the API. Nothing of the demo
 * owner's is touched, so it runs beside everything else. Each picks "Decide
 * later", so it lands on Home whatever the stack has rolled out; what each
 * goal turns on and where it lands is the unit tests'
 * (`apps/app.saroh.in/lib/modules/first-goal.test.ts`).
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

/** Name it, wait for its web address to be free, and set it up. */
async function setUp(page: Page, label: string, name: string, button: string) {
    await page.getByLabel(label).fill(name);
    await expect(
        page.getByText("Available. Your website will live here."),
    ).toBeVisible();
    await page.getByRole("radio", { name: /Decide later/ }).click();
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

test.describe("setup is one screen (DEC-070, UX audit 10 Oct)", () => {
    test("A business is chosen, the whole form is open, and the goal is asked here", async ({
        page,
    }, testInfo) => {
        await openSetup(page);
        const choices = page
            .getByRole("radiogroup", { name: "What are you setting up?" })
            .getByRole("radio");
        await expect(choices).toHaveText([
            /A business/,
            /Just me/,
            /A site for my work/,
        ]);
        await expect(choices.nth(0)).toHaveAttribute("aria-checked", "true");

        // Nothing waits for an answer.
        await expect(page.getByLabel("What is it called?")).toBeVisible();
        await expect(page.getByLabel("Web address")).toBeVisible();
        await expect(page.getByText("Its address on Saroh")).toHaveCount(0);
        await expect(
            page.getByText("Is it registered as a company?"),
        ).toHaveCount(0);
        await expect(
            page
                .getByRole("radiogroup", { name: "Where does it trade?" })
                .getByRole("radio", { name: /India/ }),
        ).toHaveAttribute("aria-checked", "true");

        // Asha has businesses already, so this is "Set up another" and
        // carries no step count (a new account's does:
        // `signup-from-marketing.spec.ts`). Nothing calls it the last step.
        await expect(page.getByText(/last step/i)).toHaveCount(0);

        // The goals, in Home's words, with Sell chosen for a business.
        const goals = page
            .getByRole("radiogroup", { name: "What will you do first?" })
            .getByRole("radio");
        await expect(goals).toHaveText([
            /^Sell things/,
            /^Take bookings/,
            /^Put up a website/,
            /^Keep track of people/,
            /^Decide later/,
        ]);
        await expect(goals.nth(0)).toHaveAttribute("aria-checked", "true");

        // An empty name is refused on its field, and nothing is made.
        await page.getByRole("button", { name: "Create the business" }).click();
        await expect(page.getByText("It needs a name")).toBeVisible();
        await expect(page).toHaveURL(/\/onboarding/);

        // axe on the choices.
        const violations = (
            await new AxeBuilder({ page })
                .include('[role="radiogroup"]')
                .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
                .analyze()
        ).violations.map((v) => `${v.id}: ${v.help}`);
        expect(violations).toEqual([]);

        // The page never scrolls sideways, at the width it was set to (on a
        // phone `innerWidth` grows with the overflow, so it can't be used).
        const width = page.viewportSize()?.width ?? 0;
        await expect
            .poll(() =>
                page.evaluate(() => document.documentElement.scrollWidth),
            )
            .toBeLessThanOrEqual(width);

        const name = aName("Rye Bakery", testInfo);
        await setUp(page, "What is it called?", name, "Create the business");
        expect(await kindOf(page, name)).toEqual({
            listed: "BUSINESS",
            summary: "BUSINESS",
        });
    });

    test("Just me is asked for a name or brand, and is stored as SOLO", async ({
        page,
    }, testInfo) => {
        await openSetup(page);
        await page.getByRole("radio", { name: /Just me/ }).click();

        await expect(page.getByLabel("Your name or brand")).toHaveAttribute(
            "placeholder",
            "Asha Rao",
        );
        // Its own order of goals, bookings first.
        await expect(
            page
                .getByRole("radiogroup", { name: "What will you do first?" })
                .getByRole("radio")
                .first(),
        ).toHaveText(/^Take bookings/);

        const name = aName("Asha Rao", testInfo);
        await setUp(page, "Your name or brand", name, "Set it up");
        expect(await kindOf(page, name)).toEqual({
            listed: "SOLO",
            summary: "SOLO",
        });
    });

    test("A site for my work starts with the website, and is stored as WORK", async ({
        page,
    }, testInfo) => {
        await openSetup(page);
        await page.getByRole("radio", { name: /A site for my work/ }).click();

        await expect(page.getByLabel("Your name or brand")).toHaveAttribute(
            "placeholder",
            "Asha Rao Studio",
        );
        await expect(
            page
                .getByRole("radiogroup", { name: "What will you do first?" })
                .getByRole("radio")
                .first(),
        ).toHaveText(/^Put up a website/);

        const name = aName("Asha Rao Studio", testInfo);
        await setUp(page, "Your name or brand", name, "Set it up");
        expect(await kindOf(page, name)).toEqual({
            listed: "WORK",
            summary: "WORK",
        });
    });
});
