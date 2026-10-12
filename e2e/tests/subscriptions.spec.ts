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
        // Where each subscription stands is a dropdown in the toolbar; the
        // tabs above it are the two views, Subscribers and Plans.
        const standing = page.getByRole("combobox", {
            name: "Subscription status",
        });
        await expect(standing).toBeVisible();
        // Rye & Co. has a renewal that isn't paid, so the list opens on
        // who needs the owner and the header leads with it. Nothing is
        // said a second time under the tabs. (When renewals last ran is
        // said only when they are late, which this stack can't promise
        // either way.)
        await expect(standing).toContainText("Need you");
        await expect(page.getByRole("main")).toContainText(/\d+ needs? you/);
        await expect(
            page.getByRole("button", { name: "Show them" }),
        ).toHaveCount(0);
        await expect(
            page
                .locator("[data-list-table]")
                .locator("tr, li")
                .filter({ hasText: "Payment failed" })
                .filter({ visible: true })
                .first(),
        ).toContainText(/isn't paid|wasn't collected/);
        await standing.click();
        for (const view of [
            /^Need you/,
            /^Active/,
            /^Paused/,
            /^Cancelled/,
            /^All subscriptions/,
        ]) {
            await expect(
                page.getByRole("option", { name: view }),
            ).toBeVisible();
        }

        // A view someone chose is written to the address.
        await page.getByRole("option", { name: /^Active/ }).click();
        await expect(page).toHaveURL(/view=active/);
        // The list is searched by the subscriber's name.
        await page
            .getByRole("searchbox", { name: "Search subscriptions" })
            .fill("Priya");
        // The list has narrowed before the row is opened: a click that
        // lands while it is still narrowing meets a row being redrawn.
        await expect(page.getByText(/^1 of \d+ subscriptions$/)).toBeVisible();
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
            page.getByRole("heading", { name: "Subscription not found" }),
        ).toBeVisible();
        await expect(
            page.getByRole("link", { name: "Back to Subscriptions" }),
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
        // A row's words are its label's ("Plan · ₹1,200/month"): the radio
        // is named by them and holds none itself.
        const choice = sheet.getByRole("radio", { name: own.other.name });
        const text =
            (await sheet
                .locator("label")
                .filter({ hasText: own.other.name })
                .textContent()) ?? "";
        const [planName = "", price = ""] = text.split(" · ");
        expect(price).toMatch(/^₹/);
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
        const sheet = page.getByRole("dialog", { name: "Pause subscription" });
        await sheet
            .getByRole("button", { name: "Pause subscription", exact: true })
            .click();
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
        // The sentence about price changes left the tab for the editor.
        await expect(
            page.getByText(/Changing a price only changes what's sold next/),
        ).toHaveCount(0);

        // Plans are rows of the shared list, which opens on the live ones.
        // Every plan, so the row stays in view once it is archived; and
        // found by name, since Northwind has more plans than a page holds.
        const views = page.getByRole("combobox", { name: "Plan status" });
        await expect(views).toContainText("Live");
        await views.click();
        await page.getByRole("option", { name: /^All plans/ }).click();
        await expect(page).toHaveURL(/view=all/);
        await page
            .getByRole("searchbox", { name: "Search plans" })
            .fill(plan.name);
        // A table row at the desk, a list item on a phone.
        const row = page
            .locator("[data-list-table]")
            .locator("tr, li")
            .filter({ hasText: plan.name })
            .filter({ visible: true });
        await expect(row.locator("a").first()).toHaveAttribute(
            "href",
            /\/billing\/plans\/[^/]+$/,
        );
        // Archive is in the row's menu, never on its face.
        await expect(
            row.getByRole("button", { name: "Archive", exact: true }),
        ).toHaveCount(0);
        const more = row.getByRole("button", {
            name: `More actions for ${plan.name}`,
        });
        await more.click();
        await page.getByRole("menuitem", { name: "Archive" }).click();
        await expect(
            page.getByText(`${plan.name} archived.`, { exact: false }),
        ).toBeVisible();
        await expect(row.getByText("Archived", { exact: true })).toBeVisible();
        await more.click();
        await expect(
            page.getByRole("menuitem", { name: "Sell again" }),
        ).toBeVisible();
        await page.keyboard.press("Escape");
        await undo(page);
        await expect(row.getByText("Archived", { exact: true })).toHaveCount(0);
        await more.click();
        await expect(
            page.getByRole("menuitem", { name: "Archive" }),
        ).toBeVisible();
        await page.keyboard.press("Escape");
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
        await expect(
            page
                .locator("[data-list-table]")
                .locator("tr, li")
                .filter({ hasText: PLAN })
                .filter({ visible: true }),
        ).toBeVisible();
    });

    test("a plan's row opens its page: Overview, Subscribers, History (D4)", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto("/billing/subscriptions?tab=plans");
        // The row is the way in: its name at the desk, the whole row on a
        // phone.
        await page
            .locator("[data-list-table]")
            .locator("tr, li")
            .filter({ hasText: PLAN })
            .filter({ visible: true })
            .locator("a")
            .first()
            .click();
        await expect(page).toHaveURL(/\/billing\/plans\/[^/?]+$/);
        await expect(
            page.getByRole("heading", { level: 1, name: PLAN }),
        ).toBeVisible();
        await expect(
            page.getByRole("main").getByText("Live", { exact: true }),
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
            page.getByText(/^Archived. Nobody new can join/),
        ).toBeVisible();
        await expect(
            page.getByRole("button", { name: "Open to sign-ups" }),
        ).toBeVisible();
        await page.getByRole("tab", { name: "History" }).click();
        await expect(
            page.getByText("Archived, closed to new sign-ups").first(),
        ).toBeVisible();
        await undo(page);
        await expect(
            page.getByRole("button", { name: "Archive" }),
        ).toBeVisible();
        await expect(
            page.getByText(/^Archived. Nobody new can join/),
        ).toHaveCount(0);
        await archivePlan(page, plan.id);
    });

    test("a plan that isn't there says so (D4)", async ({ page }) => {
        await signIn(page);
        await page.goto("/billing/plans/no-such-plan");
        await expect(
            page.getByRole("heading", { name: "Plan not found" }),
        ).toBeVisible();
        await expect(
            page.getByRole("link", { name: "Back to Plans" }),
        ).toHaveAttribute("href", "/billing/subscriptions?tab=plans");
    });

    test("a Member is told they can't open it", async ({ page }) => {
        await signIn(page, member);
        await page.goto("/billing/subscriptions?tab=plans");
        await expect(
            page.getByRole("heading", {
                name: /You can't open (Payments|Subscriptions)/,
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
                name: /You can't open (Payments|Plans)/,
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
            page.getByText("Not saved yet. Start with a name"),
        ).toBeVisible();
        // The editor shell is the page's one main landmark; the page used
        // to wrap it in a second <main> (axe: landmark-no-duplicate-main).
        await expect(page.getByRole("main")).toHaveCount(1);

        await page.getByLabel("Name").fill(name);
        await expect(
            page.getByText(/^Saved as a draft. Nobody can join it yet/),
        ).toBeVisible();
        // The address waits while you type, and moves once you leave the
        // field (UX-080), so the page never jumps under the cursor.
        await expect(page).toHaveURL(/\/billing\/plans\/new$/);
        await page.getByLabel("Name").blur();
        await expect(page).toHaveURL(/\/billing\/plans\/[^/]+\/edit$/);
        await expect(
            page
                .getByRole("button", { name: "Publish" })
                .filter({ visible: true })
                .first(),
        ).toBeDisabled();

        await page.getByRole("textbox", { name: /^Price/ }).fill("999");
        await expect(
            page.getByText("Draft · saved, nobody can join it yet"),
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
                page.getByText(/^Archived. Nobody new can join/),
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
            page.getByText(/^Saved as a draft. Nobody can join it yet/),
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
