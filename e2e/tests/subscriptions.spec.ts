import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { demoUser, NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * Payments → Subscriptions (plan 2026-09-23-003, U12/U13) on Rye & Co., the
 * seeded GST bakery: the list and its quick look, then one subscription's
 * page — skip a collection and take it back, change plan from the next
 * renewal and keep the current one, pause and resume. Then Plans, a tab of
 * Subscriptions (plan 2026-09-26-004, D3): archive a plan and Undo, the old
 * address landing on the tab, and a Member told they can't open it. Then a
 * plan's own page (D4): its three tabs, Archive and Undo from there, an
 * unknown plan, and a Member kept out.
 *
 * Every change it makes is undone before it ends, so the demo business is
 * left as it was; desk and phone run one after the other on the same data.
 */

const ORG = "seed_sc_rc_org";
const PRIYA = "seed_sc_rc_sub_priya";
/** One of Rye & Co.'s two Sourdough plans. */
const PLAN = "Sourdough, monthly";

/** Nisha works Rye & Co.'s counter: a Member, who sees no money. */
const member = {
    email: "nisha.kulkarni@saroh.dev",
    password: "demo-password-123",
};

async function signIn(page: Page, who = demoUser) {
    await page.goto(`${urls.ACCOUNTS_URL}/login`);
    await page.getByLabel("Email").fill(who.email);
    await page.getByLabel("Password", { exact: true }).fill(who.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 30_000,
    });
    await page.goto(`/open/${ORG}`);
}

/** The toast's Undo, for the step just taken. */
async function undo(page: Page) {
    await page.getByRole("button", { name: "Undo" }).last().click();
}

test.describe("subscriptions", () => {
    test.beforeEach(async ({ page }) => {
        await signIn(page);
    });

    test("the list sorts by standing and opens a quick look", async ({
        page,
    }) => {
        await page.goto("/billing/subscriptions");
        await expect(
            page.getByRole("heading", { name: "Subscriptions" }),
        ).toBeVisible();
        const failedTab = page.getByRole("tab", { name: /Payment failed/ });
        await expect(failedTab).toBeVisible();
        await expect(page.getByText(/Renewals last ran/)).toBeVisible();

        // A failed renewal is counted, and the banner takes you to it.
        await page.getByRole("button", { name: "Show them" }).click();
        await expect(failedTab).toHaveAttribute("aria-selected", "true");
        await expect(page).toHaveURL(/tab=failed/);

        await page.getByRole("tab", { name: /^Active/ }).click();
        await page.getByRole("button", { name: /Priya Raman/ }).click();
        const look = page.getByRole("dialog", { name: "Priya Raman" });
        await expect(look.getByText("Next charge")).toBeVisible();
        await expect(look.getByText("Next collections")).toBeVisible();
        await expect(
            look.getByRole("link", { name: "Change plan" }),
        ).toHaveAttribute("href", `/billing/subscriptions/${PRIYA}?do=switch`);
        await look.getByRole("link", { name: "Open full details" }).click();
        await expect(page).toHaveURL(
            new RegExp(`/billing/subscriptions/${PRIYA}$`),
        );
        await expect(
            page.getByRole("heading", { name: "Priya Raman" }),
        ).toBeVisible();
    });

    test("skip a collection, then Undo brings it back", async ({ page }) => {
        await page.goto(`/billing/subscriptions/${PRIYA}`);
        const collections = page.getByRole("region", {
            name: "Next collections",
        });
        const skip = collections
            .getByRole("button", { name: /^Skip / })
            .first();
        const label = ((await skip.getAttribute("aria-label")) ?? "").replace(
            /^Skip /,
            "",
        );
        await skip.click();
        await expect(
            collections.getByRole("button", { name: `Undo skip ${label}` }),
        ).toBeVisible();
        await undo(page);
        await expect(
            collections.getByRole("button", { name: `Skip ${label}` }),
        ).toBeVisible();
    });

    test("?do=switch opens the change; the next charge takes the new price", async ({
        page,
    }) => {
        await page.goto(`/billing/subscriptions/${PRIYA}?do=switch`);
        const sheet = page.getByRole("dialog", { name: "Change plan" });
        await expect(sheet).toBeVisible();
        const choice = sheet.getByRole("radio").first();
        const text = (await choice.textContent()) ?? "";
        const [planName = "", price = ""] = text.split(" · ");
        await choice.click();
        await sheet
            .getByRole("button", { name: "Change from next renewal" })
            .click();
        try {
            await expect(
                page.getByText(new RegExp(`^Changes to ${planName} \\(`)),
            ).toBeVisible();
            await expect(
                page.getByRole("region", { name: "Next charge" }),
            ).toContainText(price.split("/")[0]);
        } finally {
            await page
                .getByRole("button", { name: "Keep current plan" })
                .click();
            await expect(
                page.getByRole("button", { name: "Keep current plan" }),
            ).toHaveCount(0);
        }
    });

    test("pause, then resume", async ({ page }) => {
        await page.goto(`/billing/subscriptions/${PRIYA}`);
        await page.getByRole("button", { name: "Pause", exact: true }).click();
        const sheet = page.getByRole("dialog", { name: "Pause" });
        await sheet.getByRole("button", { name: "Pause", exact: true }).click();
        try {
            await expect(
                page.getByRole("button", { name: "Resume now" }),
            ).toBeVisible();
        } finally {
            await page.getByRole("button", { name: "Resume now" }).click();
            await expect(
                page.getByRole("button", { name: "Change plan" }),
            ).toBeVisible();
        }
    });

    test("a subscription that isn't there says so", async ({ page }) => {
        await page.goto("/billing/subscriptions/no-such-subscription");
        await expect(
            page.getByRole("heading", { name: "No subscription here" }),
        ).toBeVisible();
        await expect(
            page.getByRole("link", { name: "Back to subscriptions" }),
        ).toBeVisible();
    });
});

test.describe("plans, a tab of subscriptions (D3)", () => {
    test("archive a plan, then Undo puts it back on sale", async ({ page }) => {
        await signIn(page);
        await page.goto("/billing/subscriptions");
        const plansTab = page.getByRole("tab", { name: /^Plans/ });
        await plansTab.click();
        await expect(plansTab).toHaveAttribute("aria-selected", "true");
        await expect(page).toHaveURL(/tab=plans/);
        await expect(
            page.getByText(/Changing a price only changes what's sold next/),
        ).toBeVisible();

        const card = page.getByRole("article", { name: PLAN });
        await expect(
            card.getByRole("link", { name: PLAN, exact: true }),
        ).toHaveAttribute("href", /\/billing\/plans\/[^/]+$/);
        await card.getByRole("button", { name: "Archive" }).click();
        try {
            await expect(
                page.getByText(new RegExp(`^${PLAN} archived\\.`)),
            ).toBeVisible();
            await expect(
                card.getByText("Archived", { exact: true }),
            ).toBeVisible();
            await expect(
                card.getByRole("button", { name: "Sell again" }),
            ).toBeVisible();
        } finally {
            await undo(page);
        }
        await expect(
            card.getByRole("button", { name: "Archive" }),
        ).toBeVisible();
        await expect(card.getByText("Archived", { exact: true })).toHaveCount(
            0,
        );
    });

    test("the old Plans address lands on the tab", async ({ page }) => {
        await signIn(page);
        await page.goto("/billing/plans");
        await expect(page).toHaveURL(/\/billing\/subscriptions\?tab=plans$/);
        await expect(page.getByRole("tab", { name: /^Plans/ })).toHaveAttribute(
            "aria-selected",
            "true",
        );
        await expect(page.getByRole("article", { name: PLAN })).toBeVisible();
    });

    test("a plan's card opens its page: Overview, Subscribers, History (D4)", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto("/billing/subscriptions?tab=plans");
        await page
            .getByRole("article", { name: PLAN })
            .getByRole("link", { name: PLAN, exact: true })
            .click();
        await expect(page).toHaveURL(/\/billing\/plans\/[^/?]+$/);
        await expect(
            page.getByRole("heading", { level: 1, name: PLAN }),
        ).toBeVisible();
        await expect(
            page.getByRole("main").getByText("Open", { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByRole("heading", { name: "Who pays what" }),
        ).toBeVisible();
        await expect(
            page.getByRole("heading", { name: "At a glance" }),
        ).toBeVisible();
        await expect(
            page.getByRole("link", { name: "Plans", exact: true }),
        ).toHaveAttribute("href", "/billing/subscriptions?tab=plans");

        await page.getByRole("tab", { name: /^Subscribers/ }).click();
        await expect(page).toHaveURL(/tab=subscribers/);
        const panel = page.getByRole("tabpanel");
        await expect(
            panel
                .getByRole("link")
                .or(panel.getByText("Nobody's on this plan yet")),
        ).not.toHaveCount(0);

        await page.getByRole("tab", { name: "History" }).click();
        await expect(page).toHaveURL(/tab=history/);
        await expect(panel.getByRole("listitem").first()).toBeVisible();
    });

    test("archive from a plan's page, then Undo opens it again (D4)", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto("/billing/subscriptions?tab=plans");
        await page
            .getByRole("article", { name: PLAN })
            .getByRole("link", { name: PLAN, exact: true })
            .click();
        await expect(
            page.getByRole("heading", { level: 1, name: PLAN }),
        ).toBeVisible();
        await page.getByRole("button", { name: "Archive" }).click();
        try {
            await expect(
                page.getByText(/^Archived — nobody new can join/),
            ).toBeVisible();
            await expect(
                page.getByRole("button", { name: "Open to sign-ups" }),
            ).toBeVisible();
            await page.getByRole("tab", { name: "History" }).click();
            await expect(
                page.getByText("Archived — closed to new sign-ups").first(),
            ).toBeVisible();
        } finally {
            await undo(page);
        }
        await expect(
            page.getByRole("button", { name: "Archive" }),
        ).toBeVisible();
        await expect(
            page.getByText(/^Archived — nobody new can join/),
        ).toHaveCount(0);
    });

    test("a plan that isn't there says so (D4)", async ({ page }) => {
        await signIn(page);
        await page.goto("/billing/plans/no-such-plan");
        await expect(
            page.getByRole("heading", { name: "That plan isn't here" }),
        ).toBeVisible();
        await expect(
            page.getByRole("link", { name: "Back to plans" }),
        ).toHaveAttribute("href", "/billing/subscriptions?tab=plans");
    });

    test("a Member is told they can't open it", async ({ page }) => {
        await signIn(page, member);
        await page.goto("/billing/subscriptions?tab=plans");
        await expect(
            page.getByRole("heading", {
                name: /You do not have access to Payments|You can't open subscriptions/,
            }),
        ).toBeVisible();
        await expect(page.getByRole("tab", { name: /^Plans/ })).toHaveCount(0);
        await expect(page.getByRole("main")).not.toContainText("₹");
    });

    test("a Member is told they can't open a plan's page (D4)", async ({
        page,
    }) => {
        await signIn(page, member);
        await page.goto("/billing/plans/any-plan");
        await expect(
            page.getByRole("heading", {
                name: /You do not have access to Payments|You can't open this plan/,
            }),
        ).toBeVisible();
        await expect(page.getByRole("main")).not.toContainText("₹");
    });
});

/**
 * The Plan Editor (plan 2026-09-26-004, D7) on Northwind, the demo business
 * whose data the suite may change: a new plan autosaves as a Draft and
 * Publish opens it; a price changed on the live plan waits as unpublished
 * changes until Publish changes; a change can be discarded; and a draft
 * nobody bought can be deleted. The plan it opens is archived at the end,
 * since a published plan is never deleted.
 */
test.describe("the Plan Editor (D7)", () => {
    async function onNorthwind(page: Page) {
        await signIn(page);
        await page.goto(`/open/${NORTHWIND_ORG}`);
    }

    test("create → publish; change the live plan → publish changes; discard", async ({
        page,
    }) => {
        const name = `E2E plan ${Date.now()}`;
        await onNorthwind(page);
        await page.goto("/billing/subscriptions?tab=plans");
        await page.getByRole("link", { name: "New plan" }).click();
        await expect(page).toHaveURL(/\/billing\/plans\/new$/);
        await expect(
            page.getByText("Not saved yet — start with a name"),
        ).toBeVisible();

        await page.getByLabel("Name").fill(name);
        await expect(
            page.getByText(/^Saved as a draft — nobody can join it yet/),
        ).toBeVisible();
        await expect(page).toHaveURL(/\/billing\/plans\/[^/]+\/edit$/);
        await expect(
            page.getByRole("button", { name: "Publish" }).first(),
        ).toBeDisabled();

        await page.getByLabel(/^Price/).fill("999");
        await expect(
            page.getByText("Draft · saved — nobody can join it yet"),
        ).toBeVisible();
        const editAddress = page.url();
        try {
            await page.getByRole("button", { name: "Publish" }).first().click();
            await expect(
                page.getByText(`${name} is open for sign-ups.`),
            ).toBeVisible();
            await expect(
                page.getByText("Open to new sign-ups · no changes"),
            ).toBeVisible();

            await page.getByLabel(/^Price/).fill("1099");
            await expect(page.getByText("Changes not live")).toBeVisible();
            await expect(
                page.getByText(/When you publish: price ₹999 → ₹1,099/),
            ).toBeVisible();
            await page
                .getByRole("button", { name: "Publish changes" })
                .first()
                .click();
            await expect(page.getByText("Changes published.")).toBeVisible();

            await page.getByLabel(/^Price/).fill("1299");
            await expect(page.getByText("Changes not live")).toBeVisible();
            await page
                .getByRole("button", { name: "Discard changes" })
                .first()
                .click();
            await page
                .getByRole("alertdialog")
                .getByRole("button", { name: "Discard changes" })
                .click();
            await expect(
                page.getByText("Open to new sign-ups · no changes"),
            ).toBeVisible();
            await expect(page.getByLabel(/^Price/)).toHaveValue("1099");
        } finally {
            // Nobody new can join it; the demo list is left as it was.
            await page.goto(editAddress.replace(/\/edit$/, ""));
            await page.getByRole("button", { name: "Archive" }).click();
            await expect(
                page.getByText(/^Archived — nobody new can join/),
            ).toBeVisible();
        }
    });

    test("a draft nobody bought can be deleted", async ({ page }) => {
        await onNorthwind(page);
        await page.goto("/billing/plans/new");
        await page.getByLabel("Name").fill(`E2E draft ${Date.now()}`);
        await expect(
            page.getByText(/^Saved as a draft — nobody can join it yet/),
        ).toBeVisible();
        await page
            .getByRole("button", { name: "Delete draft" })
            .first()
            .click();
        await page
            .getByRole("alertdialog")
            .getByRole("button", { name: "Delete draft" })
            .click();
        await expect(page).toHaveURL(/\/billing\/subscriptions\?tab=plans$/);
    });
});
