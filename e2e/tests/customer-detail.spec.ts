import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Browser, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { demoUser, ignoreHTTPSErrors, urls } from "../playwright.config";

/**
 * Customer Detail (plan 2026-09-23-003, U18): one page per person, rooted on
 * the contact, with tabs by business kind — Rye & Co. (a bakery) and Pulse
 * Fitness (a gym) — plus not found, notes with an allergy, a possible match
 * that a person links, and a Member who sees no money.
 *
 * Every change it makes is undone before it ends, so the demo businesses are
 * left as they were; desk and phone run one after the other on the same data.
 */

const RYE = "seed_sc_rc_org";
const PULSE = "seed_sc_pulse_org";
const NORTHWIND = "seed_org";
const PRIYA = "seed_sc_rc_contact_priya";
const PRIYA_STORE = "seed_sc_rc_customer_priya";
/** A Northwind contact whose same-email store customer nobody has linked. */
const KARTHIK = "seed_contact_7";

const member = {
    email: "nisha.kulkarni@saroh.dev",
    password: "demo-password-123",
};

/**
 * Sign in once per person and keep the session: signing in before every
 * test trips the accounts sign-in throttle long before the suite ends.
 */
const OWNER_STATE = path.join(os.tmpdir(), "e2e-customer-detail-owner.json");
const MEMBER_STATE = path.join(os.tmpdir(), "e2e-customer-detail-member.json");

async function saveSession(
    browser: Browser,
    who: { email: string; password: string },
    file: string,
) {
    const context = await browser.newContext({ ignoreHTTPSErrors });
    const page = await context.newPage();
    await page.goto(`${urls.ACCOUNTS_URL}/login`);
    await page.getByLabel("Email").fill(who.email);
    await page.getByLabel("Password", { exact: true }).fill(who.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 30_000,
    });
    await context.storageState({ path: file });
    await context.close();
}

/** Carry the saved session into this test's browser, then open the business. */
async function signIn(page: Page, org: string, file = OWNER_STATE) {
    const state = JSON.parse(fs.readFileSync(file, "utf8")) as {
        cookies: Parameters<ReturnType<Page["context"]>["addCookies"]>[0];
    };
    await page.context().addCookies(state.cookies);
    await page.goto(`/open/${org}`);
}

test.beforeAll(async ({ browser }) => {
    await saveSession(browser, demoUser, OWNER_STATE);
    await saveSession(browser, member, MEMBER_STATE);
});

const tab = (page: Page, name: RegExp) => page.getByRole("tab", { name });

/**
 * A Pulse member with an active membership, a late cancel or no-show behind
 * them, and a class to come.
 *
 * Found, not named. The showcase lays Pulse's diary out relative to NOW, so
 * which member has a class booked next changes with the day the seed runs:
 * the id this used to name (Meera, contact 38) had nothing upcoming on
 * 25 Sep, and the page rightly opened her bookings on Past. The claim is about
 * a member like that, so the test asks the API for one.
 */
async function memberWithClassesToCome(page: Page): Promise<string> {
    const headers = { "x-organization-id": PULSE };
    const base = `${urls.API_URL}/organizations/${PULSE}`;
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 14 * 86_400_000).toISOString();
    const diary = await page.request.get(
        `${base}/services/bookings?from=${from}&to=${to}`,
        { headers },
    );
    expect(diary.ok()).toBe(true);
    const { diaries } = (await diary.json()) as {
        diaries: {
            bookings: {
                status: string;
                contact: { id: string } | null;
            }[];
        }[];
    };
    const candidates = new Set<string>();
    for (const b of diaries.flatMap((d) => d.bookings)) {
        if (b.status === "CONFIRMED" && b.contact) candidates.add(b.contact.id);
    }
    for (const id of candidates) {
        const res = await page.request.get(`${base}/customers/${id}/detail`, {
            headers,
        });
        if (!res.ok()) continue;
        const detail = (await res.json()) as {
            bookings: {
                upcoming: unknown[];
                past: { cancelledLate: boolean; outcome: string | null }[];
            };
            subscriptions: { rows: { status: string }[] };
        };
        if (
            detail.bookings.upcoming.length > 0 &&
            detail.subscriptions.rows.some((s) => s.status === "ACTIVE") &&
            detail.bookings.past.some(
                (b) => b.cancelledLate || b.outcome === "NO_SHOW",
            )
        )
            return id;
    }
    throw new Error("No Pulse member with a late cancel and a class to come");
}

test.describe("customer detail", () => {
    test("a bakery customer: orders, subscription and invoices", async ({
        page,
    }) => {
        await signIn(page, RYE);
        await page.goto(`/customers/${PRIYA}`);
        await expect(
            page.getByRole("heading", { name: "Priya Raman" }),
        ).toBeVisible();
        await expect(
            page.getByText("Returning", { exact: true }),
        ).toBeVisible();
        for (const name of [/^Orders/, /^Subscriptions/, /^Invoices/, /^Notes/])
            await expect(tab(page, name)).toBeVisible();
        await expect(tab(page, /^Bookings/)).toHaveCount(0);
        await expect(page.getByText("Usually buys")).toBeVisible();

        await tab(page, /^Orders/).click();
        await expect(page).toHaveURL(/tab=ord/);
        await expect(
            page.getByRole("link", { name: /^#\d+/ }).first(),
        ).toBeVisible();

        await tab(page, /^Subscriptions/).click();
        await expect(
            page.getByRole("link", { name: /Sourdough/ }),
        ).toBeVisible();

        // An address opens its tab.
        await page.goto(`/customers/${PRIYA}?tab=inv`);
        await expect(tab(page, /^Invoices/)).toHaveAttribute(
            "aria-selected",
            "true",
        );
        await expect(page.getByText(/^Order #\d+/).first()).toBeVisible();
    });

    test("the store customer's page opens the linked person", async ({
        page,
    }) => {
        await signIn(page, RYE);
        await page.goto(`/commerce/customers/${PRIYA_STORE}`);
        await expect(page).toHaveURL(new RegExp(`/customers/${PRIYA}$`));
        await expect(
            page.getByRole("heading", { name: "Priya Raman" }),
        ).toBeVisible();
    });

    test("a gym member: classes left and what is booked", async ({ page }) => {
        await signIn(page, PULSE);
        await page.goto(`/customers/${await memberWithClassesToCome(page)}`);
        await expect(page.getByText("Member", { exact: true })).toBeVisible();
        for (const name of [/^Bookings/, /^Membership/, /^Invoices/])
            await expect(tab(page, name)).toBeVisible();
        await expect(tab(page, /^Orders/)).toHaveCount(0);
        const classes = page.getByRole("region", { name: "Classes left" });
        await expect(classes).toContainText(/membership/i);
        await expect(
            page.getByRole("region", { name: "Next booking" }),
        ).toContainText("Late cancels");

        await page.getByRole("button", { name: "See all bookings" }).click();
        await expect(page).toHaveURL(/tab=bk/);
        await expect(
            page.getByRole("button", { name: /^Upcoming · \d+/ }),
        ).toHaveAttribute("aria-pressed", "true");
        await page
            .getByRole("button", { name: /^No-shows and late cancels/ })
            .click();
        await expect(
            page.getByText(/Late cancel|No-show/).first(),
        ).toBeVisible();
    });

    test("an unknown customer is not found", async ({ page }) => {
        await signIn(page, RYE);
        await page.goto("/customers/not_a_contact");
        await expect(
            page.getByRole("heading", { name: "This customer isn't here" }),
        ).toBeVisible();
    });

    test("a note with an allergy, deleted, brought back, deleted", async ({
        page,
    }) => {
        await signIn(page, RYE);
        await page.goto(`/customers/${PRIYA}?tab=notes`);
        const text = `E2E note ${Date.now()}`;
        await page.getByLabel("New note").fill(text);
        await page
            .getByRole("group", { name: "Allergy" })
            .getByRole("button", { name: "Mustard" })
            .click();
        await page.getByRole("button", { name: "Add note" }).click();
        const note = page.getByRole("article").filter({ hasText: text });
        await expect(note).toBeVisible();
        await expect(note).toContainText("Allergy: Mustard");

        await note.getByRole("button", { name: "Delete" }).click();
        await expect(page.getByText(text)).toHaveCount(0);
        await page.getByRole("button", { name: "Undo" }).last().click();
        await expect(page.getByText(text)).toBeVisible();

        // Leave the customer as found.
        await page
            .getByRole("article")
            .filter({ hasText: text })
            .getByRole("button", { name: "Delete" })
            .click();
        await expect(page.getByText(text)).toHaveCount(0);
    });

    test("a possible match is linked by a person, and its orders come in", async ({
        page,
    }) => {
        await signIn(page, NORTHWIND);
        await page.goto(`/customers/${KARTHIK}`);
        await expect(page.getByText("Possible match — link?")).toBeVisible();
        await page.getByRole("button", { name: "Review and link" }).click();
        const dialog = page.getByRole("dialog", {
            name: "Link a commerce customer",
        });
        await dialog.getByRole("button", { name: "Link" }).first().click();
        try {
            await expect(page.getByText("Possible match — link?")).toHaveCount(
                0,
            );
            await tab(page, /^Orders/).click();
            await expect(
                page.getByRole("link", { name: /^#/ }).first(),
            ).toBeVisible();
        } finally {
            // Unlink, so the demo still offers the match.
            const detail = await page.request.get(
                `${urls.API_URL}/organizations/${NORTHWIND}/customers/${KARTHIK}/detail`,
            );
            const body = (await detail.json()) as {
                linkedCustomers?: { linkId: string }[];
            };
            for (const link of body.linkedCustomers ?? []) {
                await page.request.delete(
                    `${urls.API_URL}/organizations/${NORTHWIND}/customers/links/${link.linkId}`,
                    { headers: { origin: urls.APP_URL } },
                );
            }
        }
    });
});

test.describe("customer detail, as a Member", () => {
    test("a Member sees no billing tabs and no money", async ({ page }) => {
        await signIn(page, RYE, MEMBER_STATE);
        await page.goto(`/customers/${PRIYA}`);
        await expect(
            page.getByRole("heading", { name: "Priya Raman" }),
        ).toBeVisible();
        await expect(tab(page, /^Notes/)).toBeVisible();
        // Sell › Customers is refused to the counter (R7, #508): the crumb
        // leads back to Contacts instead.
        const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
        await expect(
            crumbs.getByRole("link", { name: "Contacts" }),
        ).toBeVisible();
        await expect(
            crumbs.getByRole("link", { name: "Customers" }),
        ).toHaveCount(0);
        for (const name of [/^Invoices/, /^Subscriptions/, /^Orders/])
            await expect(tab(page, name)).toHaveCount(0);
        await expect(page.getByRole("main")).not.toContainText("₹");
        await expect(
            page.getByRole("button", { name: "Edit details" }),
        ).toBeDisabled();
    });
});
