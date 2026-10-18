import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Walking setup (`app:/onboarding`), in one place.
 *
 * Setup is a stepper (DEC-130, amended 11 Oct 2026): what is being set up,
 * then its name and web address, then what to do first, whose button
 * creates the business. Every spec that sets a business up through the
 * screen goes through here, so the next change to the steps is made once.
 *
 * An owner who has a billing profile (Asha, `founder`, is seeded with one)
 * is also asked who Saroh bills for it, between the name and what to do
 * first (DEC-167, R7). `answerName` answers it with the first profile
 * listed, unless the spec answers it itself (`answerBilling`).
 *
 * `walkSetup` answers all three and waits to be out of setup. The three
 * `answer…` steps are there for a spec that looks at a step on the way.
 */

export type SetupKind = "A business" | "Just me" | "A site for my work";

/** The words each kind's steps speak in (`lib/organizations/setup-steps.ts`). */
export const SETUP_WORDS: Record<
    SetupKind,
    { nameHeading: string; nameLabel: string; create: string }
> = {
    "A business": {
        nameHeading: "Name your business",
        nameLabel: "What is it called?",
        create: "Create the business",
    },
    "Just me": {
        nameHeading: "Name it",
        nameLabel: "Your name or brand",
        create: "Set it up",
    },
    "A site for my work": {
        nameHeading: "Name your site",
        nameLabel: "Your name or brand",
        create: "Set it up",
    },
};

export const SETUP_QUESTIONS = {
    kind: "What are you setting up?",
    billing: "Who does Saroh bill for this business?",
    first: "What will you do first?",
} as const;

export interface SetupAnswers {
    /** Left on "A business", which is chosen, unless said. */
    kind?: SetupKind;
    /** For an account made with a code, which has no name yet. */
    yourName?: string;
    name: string;
    /** A goal's card, by its title. Left on the one chosen unless said. */
    goal?: string | RegExp;
}

/** The step on show, by its heading. */
export function setupHeading(page: Page, name: string) {
    return page.getByRole("heading", { level: 1, name, exact: true });
}

/** The step's main button, until the last step. */
export async function continueSetup(page: Page) {
    await page.getByRole("button", { name: "Continue", exact: true }).click();
}

/** Step one: say what is being set up, and continue. */
export async function answerKind(page: Page, kind?: SetupKind) {
    await expect(setupHeading(page, SETUP_QUESTIONS.kind)).toBeVisible();
    if (kind) {
        await page
            .getByRole("radiogroup", { name: SETUP_QUESTIONS.kind })
            .getByRole("radio", { name: new RegExp(`^${kind}`) })
            .click();
    }
    await continueSetup(page);
    await expect(
        setupHeading(page, SETUP_WORDS[kind ?? "A business"].nameHeading),
    ).toBeVisible();
}

/**
 * Step two: name it, wait for its web address to be free, and continue.
 * Continue itself waits for the address's answer. The wait here is so a
 * spec fails on the line that says why when the address is not free.
 */
export async function answerName(
    page: Page,
    answers: Pick<SetupAnswers, "kind" | "yourName" | "name">,
) {
    const words = SETUP_WORDS[answers.kind ?? "A business"];
    await expect(setupHeading(page, words.nameHeading)).toBeVisible();
    if (answers.yourName !== undefined) {
        await page
            .getByLabel("Your name", { exact: true })
            .fill(answers.yourName);
    }
    await page.getByLabel(words.nameLabel).fill(answers.name);
    await expect(
        page.getByText("Available. Your website will live here."),
    ).toBeVisible();
    await continueSetup(page);
    const billing = setupHeading(page, SETUP_QUESTIONS.billing);
    await expect(
        billing.or(setupHeading(page, SETUP_QUESTIONS.first)),
    ).toBeVisible();
    if (await billing.isVisible()) await answerBilling(page);
    await expect(setupHeading(page, SETUP_QUESTIONS.first)).toBeVisible();
}

/** The billing step's choices: the owner's profiles, then a new one. */
export function billingChoices(page: Page) {
    return page
        .getByRole("radiogroup", { name: SETUP_QUESTIONS.billing })
        .getByRole("radio");
}

/**
 * Who Saroh bills (DEC-167): a profile by its legal name, or the first
 * listed, and continue to what to do first.
 */
export async function answerBilling(page: Page, legalName?: string) {
    await expect(setupHeading(page, SETUP_QUESTIONS.billing)).toBeVisible();
    const choice = legalName
        ? billingChoices(page).filter({ hasText: legalName })
        : billingChoices(page).first();
    await choice.click();
    await continueSetup(page);
    await expect(setupHeading(page, SETUP_QUESTIONS.first)).toBeVisible();
}

/** Step three: pick what to do first, create, and wait to be out of setup. */
export async function answerFirst(
    page: Page,
    answers: Pick<SetupAnswers, "kind" | "goal"> = {},
) {
    await expect(setupHeading(page, SETUP_QUESTIONS.first)).toBeVisible();
    if (answers.goal) {
        await page
            .getByRole("radiogroup", { name: SETUP_QUESTIONS.first })
            .getByRole("radio", { name: answers.goal })
            .click();
    }
    await page
        .getByRole("button", {
            name: SETUP_WORDS[answers.kind ?? "A business"].create,
            exact: true,
        })
        .click();
    await page.waitForURL((url) => !url.pathname.startsWith("/onboarding"), {
        timeout: 20_000,
    });
}

/** Answer every step and wait to be in the product. */
export async function walkSetup(page: Page, answers: SetupAnswers) {
    await answerKind(page, answers.kind);
    await answerName(page, answers);
    await answerFirst(page, answers);
}
