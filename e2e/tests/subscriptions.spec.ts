// @covers accounts:/login app:/open app:/billing/subscriptions app:/billing/plans app:/billing/plans/new app:/customers app:/contacts api:subscriptions api:customer-workspace
import type { Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
    makeContact,
    northwind,
    stamp as ownStamp,
} from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { demoUser, NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * Payments → Subscriptions (plan 2026-09-23-003, U12/U13): the list and its
 * quick look, then one subscription's page — skip a collection and take it
 * back, change plan from the next renewal and keep the current one, pause
 * and resume. Then Plans, a tab of Subscriptions (plan 2026-09-26-004, D3):
 * archive a plan and Undo, the old address landing on the tab, and a Member
 * told they can't open it. Then a plan's own page (D4): its three tabs,
 * Archive and Undo from there, an unknown plan, and a Member kept out.
 *
 * What is only read is read on Rye & Co., the seeded GST bakery, a film
 * set. What changes — a skip, a plan change, a pause, an archive — changes
 * a plan and a subscription each test makes for itself on Northwind, so
 * desk and phone, and every other spec, run beside it.
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

async function signIn(page: Page, who = demoUser, org = ORG) {
    await useSession(page, who);
    await page.goto(`/open/${org}`);
}

/** The toast's Undo, for the step just taken. */
async function undo(page: Page) {
    await page.getByRole("button", { name: "Undo" }).last().click();
}

interface Own {
    plan: { id: string; name: string };
    other: { id: string; name: string };
    subscription: string;
    who: string;
}

/**
 * On Northwind, for this test only: two live plans, and a contact
 * subscribed to the first who collects on Saturdays.
 */
async function ownSubscription(page: Page, testInfo: TestInfo): Promise<Own> {
    const nw = northwind(page.request);
    const s = ownStamp(testInfo);
    const mine = await ownPlan(page, testInfo, `E2E Loaf plan ${s}`, "800");
    const other = await ownPlan(page, testInfo, `E2E Cake plan ${s}`, "1200");
    const who = await makeContact(page.request, {
        firstName: "Subscriber",
        lastName: s,
        email: `sub-${s}@example.test`,
    });
    const subscribed = await nw.post<{
        id?: string;
        subscription?: { id: string };
    }>("/subscriptions", {
        contactId: who.id,
        planId: mine.id,
        collectionWeekday: 6,
        collectionNote: "1 loaf",
    });
    const subscription = subscribed.subscription?.id ?? subscribed.id ?? "";
    expect(subscription).toBeTruthy();
    return { plan: mine, other, subscription, who: who.name };
}

/** A live monthly plan on Northwind, made for this test. */
async function ownPlan(
    page: Page,
    testInfo: TestInfo,
    name = `E2E Plan ${ownStamp(testInfo)}`,
    price = "900",
): Promise<{ id: string; name: string }> {
    const made = await northwind(page.request).post<{ id: string }>(
        "/subscription-plans",
        { name, price, currency: "INR", interval: "MONTH" },
    );
    return { id: made.id, name };
}

/**
 * Nobody new can join a test's plan once it is done (a live plan is never
 * deleted). Best effort: one already archived just says so.
 */
async function archivePlan(page: Page, id: string) {
    await page.request.post(
        `${urls.API_URL}/organizations/${NORTHWIND_ORG}/subscription-plans/${id}/archive`,
        { headers: northwind(page.request).headers },
    );
}

async function archivePlans(page: Page, own: Own) {
    for (const plan of [own.plan, own.other]) await archivePlan(page, plan.id);
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

test.describe("a subscription's page, on Northwind", () => {
    let own: Own;

    test.beforeEach(async ({ page }, testInfo) => {
        await signIn(page, demoUser, NORTHWIND_ORG);
        own = await ownSubscription(page, testInfo);
    });

    test.afterEach(async ({ page }) => {
        await archivePlans(page, own);
    });

    test("skip a collection, then Undo brings it back", async ({ page }) => {
        await page.goto(`/billing/subscriptions/${own.subscription}`);
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
        await page.goto(`/billing/subscriptions/${own.subscription}?do=switch`);
        const sheet = page.getByRole("dialog", { name: "Change plan" });
        await expect(sheet).toBeVisible();
        // Its own other plan: every other on offer is some other test's,
        // which may be archived while this one is open.
        const choice = sheet
            .getByRole("radio")
            .filter({ hasText: own.other.name });
        const text = (await choice.textContent()) ?? "";
        const [planName = "", price = ""] = text.split(" · ");
        await choice.click();
        await sheet
            .getByRole("button", { name: "Change from next renewal" })
            .click();
        await expect(
            page.getByText(new RegExp(`^Changes to ${planName} \\(`)),
        ).toBeVisible();
        await expect(
            page.getByRole("region", { name: "Next charge" }),
        ).toContainText(price.split("/")[0]);
        await page.getByRole("button", { name: "Keep current plan" }).click();
        await expect(
            page.getByRole("button", { name: "Keep current plan" }),
        ).toHaveCount(0);
    });

    test("pause, then resume", async ({ page }) => {
        await page.goto(`/billing/subscriptions/${own.subscription}`);
        await page.getByRole("button", { name: "Pause", exact: true }).click();
        const sheet = page.getByRole("dialog", { name: "Pause" });
        await sheet.getByRole("button", { name: "Pause", exact: true }).click();
        await expect(
            page.getByRole("button", { name: "Resume now" }),
        ).toBeVisible();
        await page.getByRole("button", { name: "Resume now" }).click();
        await expect(
            page.getByRole("button", { name: "Change plan" }),
        ).toBeVisible();
    });
});

test.describe("plans, a tab of subscriptions (D3)", () => {
    test("archive a plan, then Undo puts it back on sale", async ({
        page,
    }, testInfo) => {
        // A plan of its own on Northwind: archiving one of Rye's would take
        // it off sale for every test (and film) reading Rye's plans.
        await signIn(page, demoUser, NORTHWIND_ORG);
        const plan = await ownPlan(page, testInfo);
        await page.goto("/billing/subscriptions");
        const plansTab = page.getByRole("tab", { name: /^Plans/ });
        await plansTab.click();
        await expect(plansTab).toHaveAttribute("aria-selected", "true");
        await expect(page).toHaveURL(/tab=plans/);
        await expect(
            page.getByText(/Changing a price only changes what's sold next/),
        ).toBeVisible();

        const card = page.getByRole("article", { name: plan.name });
        await expect(
            card.getByRole("link", { name: plan.name, exact: true }),
        ).toHaveAttribute("href", /\/billing\/plans\/[^/]+$/);
        await card.getByRole("button", { name: "Archive" }).click();
        await expect(
            page.getByText(new RegExp(`^${plan.name} archived\\.`)),
        ).toBeVisible();
        await expect(card.getByText("Archived", { exact: true })).toBeVisible();
        await expect(
            card.getByRole("button", { name: "Sell again" }),
        ).toBeVisible();
        await undo(page);
        await expect(
            card.getByRole("button", { name: "Archive" }),
        ).toBeVisible();
        await expect(card.getByText("Archived", { exact: true })).toHaveCount(
            0,
        );
        await archivePlan(page, plan.id);
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
    }, testInfo) => {
        await signIn(page, demoUser, NORTHWIND_ORG);
        const plan = await ownPlan(page, testInfo);
        await page.goto(`/billing/plans/${plan.id}`);
        await expect(
            page.getByRole("heading", { level: 1, name: plan.name }),
        ).toBeVisible();
        await page.getByRole("button", { name: "Archive" }).click();
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
        await undo(page);
        await expect(
            page.getByRole("button", { name: "Archive" }),
        ).toBeVisible();
        await expect(
            page.getByText(/^Archived — nobody new can join/),
        ).toHaveCount(0);
        await archivePlan(page, plan.id);
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
                name: /You do not have access to Payments|You can't open subscriptions|Only owners and admins see payments/,
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
                name: /You do not have access to Payments|You can't open this plan|Only owners and admins see payments/,
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
        const name = `E2E plan ${ownStamp(test.info())}`;
        await onNorthwind(page);
        await page.goto("/billing/subscriptions?tab=plans");
        await page.getByRole("link", { name: "New plan" }).click();
        await expect(page).toHaveURL(/\/billing\/plans\/new$/);
        await expect(
            page.getByText("Not saved yet — start with a name"),
        ).toBeVisible();
        // The editor shell is the page's one main landmark; the page used
        // to wrap it in a second <main> (axe: landmark-no-duplicate-main).
        await expect(page.getByRole("main")).toHaveCount(1);

        await page.getByLabel("Name").fill(name);
        await expect(
            page.getByText(/^Saved as a draft — nobody can join it yet/),
        ).toBeVisible();
        await expect(page).toHaveURL(/\/billing\/plans\/[^/]+\/edit$/);
        await expect(
            page
                .getByRole("button", { name: "Publish" })
                .filter({ visible: true })
                .first(),
        ).toBeDisabled();

        await page.getByRole("textbox", { name: /^Price/ }).fill("999");
        await expect(
            page.getByText("Draft · saved — nobody can join it yet"),
        ).toBeVisible();
        const editAddress = page.url();
        try {
            await page
                .getByRole("button", { name: "Publish" })
                .filter({ visible: true })
                .first()
                .click();
            await expect(
                page.getByText(`${name} is open for sign-ups.`),
            ).toBeVisible();
            await expect(
                page.getByText("Open to new sign-ups · no changes"),
            ).toBeVisible();

            await page.getByRole("textbox", { name: /^Price/ }).fill("1099");
            await expect(page.getByText("Changes not live")).toBeVisible();
            await expect(
                page.getByText(/When you publish: price ₹999 → ₹1,099/),
            ).toBeVisible();
            await page
                .getByRole("button", { name: "Publish changes" })
                .filter({ visible: true })
                .first()
                .click();
            await expect(page.getByText("Changes published.")).toBeVisible();

            await page.getByRole("textbox", { name: /^Price/ }).fill("1299");
            await expect(page.getByText("Changes not live")).toBeVisible();
            await page
                .getByRole("button", { name: "Discard changes" })
                .filter({ visible: true })
                .first()
                .click();
            await page
                .getByRole("alertdialog")
                .getByRole("button", { name: "Discard changes" })
                .click();
            await expect(
                page.getByText("Open to new sign-ups · no changes"),
            ).toBeVisible();
            await expect(
                page.getByRole("textbox", { name: /^Price/ }),
            ).toHaveValue("1099");
        } finally {
            // Nobody new can join it; the demo list is left as it was.
            await page.goto(editAddress.replace(/\/edit$/, ""));
            await page.getByRole("button", { name: "Archive" }).click();
            await expect(
                page.getByText(/^Archived — nobody new can join/),
            ).toBeVisible();
        }
    });

    test("a live plan's new classes reach a member at their next renewal (D10)", async ({
        page,
    }) => {
        const s = ownStamp(test.info());
        await onNorthwind(page);
        const nw = northwind(page.request);
        const plan = await nw.post<{ id: string }>("/subscription-plans", {
            name: `E2E classes ${s}`,
            price: "900",
            currency: "INR",
            interval: "MONTH",
            classesPerMonth: 8,
        });
        const who = await makeContact(page.request, {
            firstName: "Classes",
            lastName: s,
            email: `classes-${s}@example.test`,
        });
        await nw.post("/subscriptions", {
            contactId: who.id,
            planId: plan.id,
        });
        try {
            await page.goto(`/billing/plans/${plan.id}/edit`);
            await page
                .getByRole("radiogroup", { name: "Classes included" })
                .getByText("12", { exact: true })
                .click();
            await expect(page.getByText("Changes not live")).toBeVisible();
            await page
                .getByRole("button", { name: "Publish changes" })
                .filter({ visible: true })
                .first()
                .click();
            await expect(page.getByText("Changes published.")).toBeVisible();

            // The member keeps 8 until their renewal; the new number shows
            // with the day it starts.
            await page.goto(`/customers/${who.id}`);
            const card = page.getByRole("region", { name: "Classes left" });
            await expect(card).toContainText(/12 a month from \d+ \w{3}/);
            await expect(card).toContainText("8");
        } finally {
            await archivePlan(page, plan.id);
        }
    });

    test("a draft nobody bought can be deleted", async ({ page }) => {
        await onNorthwind(page);
        await page.goto("/billing/plans/new");
        await page
            .getByLabel("Name")
            .fill(`E2E draft ${ownStamp(test.info())}`);
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
