// @covers accounts:/login app:/onboarding app:/ api:organizations api:capabilities
import AxeBuilder from "@axe-core/playwright";
import type { Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import {
    answerFirst,
    answerKind,
    answerName,
    continueSetup,
    SETUP_QUESTIONS,
    SETUP_WORDS,
    setupHeading,
    walkSetup,
} from "../fixtures/walk-setup";
import { urls } from "../playwright.config";

/**
 * Setup is a stepper (DEC-130, amended 11 Oct 2026): one question to a
 * screen, with Back and Continue. "What are you setting up?" (DEC-070, K2)
 * comes first with "A business" chosen, then the name and web address, then
 * "What will you do first?", whose button creates the business. The answer
 * to the first sets the words the others speak in and is stored as the
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
        page.getByRole("radiogroup", { name: SETUP_QUESTIONS.kind }),
    ).toBeVisible();
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

/** The goals on the last step, in order. */
const goals = (page: Page) =>
    page
        .getByRole("radiogroup", { name: SETUP_QUESTIONS.first })
        .getByRole("radio");

test.describe("setup is three short steps (DEC-070, DEC-130)", () => {
    test("A business: one question to a screen, Back keeps every answer, and the last step creates it", async ({
        page,
    }, testInfo) => {
        await openSetup(page);

        // Step one, and only step one.
        const choices = page
            .getByRole("radiogroup", { name: SETUP_QUESTIONS.kind })
            .getByRole("radio");
        await expect(choices).toHaveText([
            /A business/,
            /Just me/,
            /A site for my work/,
        ]);
        await expect(choices.nth(0)).toHaveAttribute("aria-checked", "true");
        await expect(page.getByLabel("What is it called?")).toHaveCount(0);
        await expect(page.getByLabel("Web address")).toHaveCount(0);
        await expect(
            page.getByRole("radiogroup", { name: SETUP_QUESTIONS.first }),
        ).toHaveCount(0);
        // Asha has businesses already, so this is "Set up another" and
        // counts setup's own three steps (a new account's counts four:
        // `signup-from-marketing.spec.ts`). Nothing calls it the last step.
        await expect(
            page.getByText("Set up another · Step 1 of 3", { exact: true }),
        ).toBeVisible();
        await expect(page.getByText(/last step/i)).toHaveCount(0);
        await expect(page.getByRole("progressbar")).toHaveAttribute(
            "aria-valuetext",
            "Step 1 of 3",
        );
        await expect(page.getByText(/Signed in as/)).toBeVisible();

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
        const sideways = () =>
            expect
                .poll(() =>
                    page.evaluate(() => document.documentElement.scrollWidth),
                )
                .toBeLessThanOrEqual(width);
        await sideways();

        // Step two: the step is in the address, and its heading has the
        // keyboard.
        await answerKind(page);
        await expect(page).toHaveURL(/[?&]step=name/);
        await expect(
            setupHeading(page, SETUP_WORDS["A business"].nameHeading),
        ).toBeFocused();
        await expect(
            page.getByRole("radiogroup", { name: SETUP_QUESTIONS.kind }),
        ).toHaveCount(0);
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
        await expect(page.getByText(/Signed in as/)).toBeVisible();
        await sideways();

        // Continue is the step's gate: an empty name is refused on its
        // field, and the step stays.
        await continueSetup(page);
        await expect(page.getByText("It needs a name")).toBeVisible();
        await expect(page).toHaveURL(/[?&]step=name/);
        await expect(page.getByLabel("What is it called?")).toBeFocused();

        const name = aName("Rye Bakery", testInfo);
        await answerName(page, { name });
        await expect(page).toHaveURL(/[?&]step=first/);

        // Step three: the goals, in Home's words, with Sell chosen for a
        // business.
        await expect(goals(page)).toHaveText([
            /^Sell things/,
            /^Take bookings/,
            /^Put up a website/,
            /^Keep track of people/,
            /^Decide later/,
        ]);
        await expect(goals(page).nth(0)).toHaveAttribute(
            "aria-checked",
            "true",
        );
        await expect(page.getByText(/Signed in as/)).toBeVisible();
        await sideways();

        // The browser's own Back is the step before, with what was typed,
        // and a reload keeps both.
        await page.goBack();
        await expect(page.getByLabel("What is it called?")).toHaveValue(name);
        await page.reload();
        await expect(page).toHaveURL(/[?&]step=name/);
        await expect(page.getByLabel("What is it called?")).toHaveValue(name);

        // The form's Back, too, and it asks nothing.
        await page.getByRole("button", { name: "Back", exact: true }).click();
        await expect(choices.nth(0)).toHaveAttribute("aria-checked", "true");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await continueSetup(page);
        await expect(page.getByLabel("What is it called?")).toHaveValue(name);
        await continueSetup(page);

        await answerFirst(page, { goal: /Decide later/ });
        expect(await kindOf(page, name)).toEqual({
            listed: "BUSINESS",
            summary: "BUSINESS",
        });
    });

    test("Just me is asked for a name or brand, and is stored as SOLO", async ({
        page,
    }, testInfo) => {
        await openSetup(page);
        await answerKind(page, "Just me");

        await expect(page.getByLabel("Your name or brand")).toHaveAttribute(
            "placeholder",
            "Asha Rao",
        );
        const name = aName("Asha Rao", testInfo);
        await answerName(page, { kind: "Just me", name });
        // Its own order of goals, bookings first.
        await expect(goals(page).first()).toHaveText(/^Take bookings/);

        await answerFirst(page, { kind: "Just me", goal: /Decide later/ });
        expect(await kindOf(page, name)).toEqual({
            listed: "SOLO",
            summary: "SOLO",
        });
    });

    test("A site for my work starts with the website, and is stored as WORK", async ({
        page,
    }, testInfo) => {
        await openSetup(page);
        const kind = "A site for my work";
        await answerKind(page, kind);
        await expect(page.getByLabel("Your name or brand")).toHaveAttribute(
            "placeholder",
            "Asha Rao Studio",
        );
        await page.getByRole("button", { name: "Back", exact: true }).click();

        // The whole walk in one call, as any other spec would make it.
        const name = aName("Asha Rao Studio", testInfo);
        await walkSetup(page, { kind, name, goal: /Decide later/ });
        expect(await kindOf(page, name)).toEqual({
            listed: "WORK",
            summary: "WORK",
        });
    });
});
