// @covers accounts:/login app:/open app:/customers app:/commerce/customers site:/[slug] site:/account/messages api:organizations api:customer-workspace api:contacts api:customers api:orders api:subscriptions api:invoices api:class-packs api:bookings api:enquiry api:site-accounts pkg:site-blocks
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Browser, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { demoUser, ignoreHTTPSErrors, urls } from "../playwright.config";
import { asNewVisitor, signInOnSheet } from "./site-codes";

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
    const headers = { "x-organization-id": PULSE, origin: urls.APP_URL };
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

    test("a note is text only; deleted, brought back, deleted (Z2a)", async ({
        page,
    }) => {
        await signIn(page, RYE);
        await page.goto(`/customers/${PRIYA}?tab=notes`);
        const text = `E2E note ${Date.now()}`;
        await page.getByLabel("New note").fill(text);
        // Allergies live on Needs attention, not on a note (Z2a).
        await expect(page.getByRole("group", { name: "Allergy" })).toHaveCount(
            0,
        );
        await page.getByRole("button", { name: "Add note" }).click();
        const note = page.getByRole("article").filter({ hasText: text });
        await expect(note).toBeVisible();
        await expect(note).not.toContainText("Allergy:");

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

/**
 * Needs attention on Customer Detail (C5, DEC-040). Writes happen on
 * Northwind; Kavi Dental is a film set, so it is only read — by Divya on the
 * desk, a Member, who sees Rahul's latex allergy and a count in place of his
 * sensitive medical note.
 */
const KAVI = "seed_sc_kavi_org";
const RAHUL = "seed_sc_kavi_contact_rahul";
/** A Northwind contact nothing else here changes. */
const NW_CONTACT = "seed_contact_2";
const desk = { email: "divya.kamath@saroh.dev", password: member.password };
const DESK_STATE = path.join(os.tmpdir(), "e2e-customer-detail-desk.json");

/** The row by the name: the heading and the tags beside it. */
const nameRow = (page: Page) => page.locator("h1").locator("..");

/** Take every "Wheelchair" entry this suite added off the contact. */
async function clearWheelchair(page: Page) {
    const base = `${urls.API_URL}/organizations/${NORTHWIND}/customers/${NW_CONTACT}/attention`;
    const res = await page.request.get(base);
    const body = (await res.json()) as {
        entries?: { id: string; label: string }[];
    };
    for (const e of body.entries ?? []) {
        if (e.label !== "Wheelchair") continue;
        await page.request.delete(`${base}/${e.id}`, {
            headers: { origin: urls.APP_URL },
        });
    }
}

test.describe("needs attention", () => {
    test("add Access 'Wheelchair': the tag shows by the name; Remove has Undo", async ({
        page,
    }) => {
        await signIn(page, NORTHWIND);
        await clearWheelchair(page);
        try {
            await page.goto(`/customers/${NW_CONTACT}`);
            const card = page.getByRole("region", { name: "Needs attention" });
            await card.getByRole("button", { name: "Add" }).click();
            const sheet = page.getByRole("dialog", {
                name: "Add to Needs attention",
            });
            await sheet.getByRole("radio", { name: "Access" }).click();
            // Access isn't sensitive unless someone ticks it.
            await expect(sheet.getByRole("checkbox")).not.toBeChecked();
            await sheet
                .getByLabel("Short label for the team")
                .fill("Wheelchair");
            await sheet
                .getByRole("button", { name: "Add to Needs attention" })
                .click();
            await expect(sheet).toHaveCount(0);

            await expect(
                nameRow(page).getByText("Access: Wheelchair"),
            ).toBeVisible();
            await expect(card).toContainText("Access: Wheelchair");

            await card
                .getByRole("button", { name: "Remove Access: Wheelchair" })
                .click();
            await expect(card).not.toContainText("Access: Wheelchair");
            await expect(
                nameRow(page).getByText("Access: Wheelchair"),
            ).toHaveCount(0);
            await page.getByRole("button", { name: "Undo" }).last().click();
            await expect(card).toContainText("Access: Wheelchair");
        } finally {
            await clearWheelchair(page);
        }
    });

    test("a save that fails keeps what was typed and says so", async ({
        page,
    }) => {
        await signIn(page, NORTHWIND);
        await page.goto(`/customers/${NW_CONTACT}`);
        await page
            .getByRole("region", { name: "Needs attention" })
            .getByRole("button", { name: "Add" })
            .click();
        const sheet = page.getByRole("dialog", {
            name: "Add to Needs attention",
        });
        await sheet.getByRole("radio", { name: "Access" }).click();
        await sheet.getByLabel("Short label for the team").fill("Wheelchair");
        // The Server Action's POST never reaches the server.
        await page.route(`**/customers/${NW_CONTACT}**`, (route) =>
            route.request().method() === "POST"
                ? route.abort()
                : route.continue(),
        );
        await sheet
            .getByRole("button", { name: "Add to Needs attention" })
            .click();
        await expect(sheet.getByRole("alert")).toContainText(
            "Nothing was saved",
        );
        await expect(sheet.getByLabel("Short label for the team")).toHaveValue(
            "Wheelchair",
        );
        await expect(
            sheet.getByRole("radio", { name: "Access" }),
        ).toHaveAttribute("aria-checked", "true");
    });

    test("a Member sees the allergy, and a count in place of the medical note", async ({
        browser,
        page,
    }) => {
        await saveSession(browser, desk, DESK_STATE);
        await signIn(page, KAVI, DESK_STATE);
        await page.goto(`/customers/${RAHUL}`);
        await expect(
            page.getByRole("heading", { name: "Rahul Verma" }),
        ).toBeVisible();
        await expect(nameRow(page).getByText("Allergy: Latex")).toBeVisible();
        await expect(
            nameRow(page).getByText("1 more note you can't see"),
        ).toBeVisible();
        const main = page.getByRole("main");
        await expect(main).not.toContainText("Blood thinners");
        await expect(main).not.toContainText("warfarin");
        // Reads, but can't change the record.
        const card = page.getByRole("region", { name: "Needs attention" });
        await expect(card.getByRole("button", { name: "Add" })).toHaveCount(0);
        await expect(card).toContainText(
            "Your role can read this but not change their record.",
        );
    });

    test("an Owner sees the medical note by the name", async ({ page }) => {
        await signIn(page, KAVI);
        await page.goto(`/customers/${RAHUL}`);
        await expect(
            nameRow(page).getByText("Medical: Blood thinners"),
        ).toBeVisible();
        await expect(nameRow(page).getByText("Allergy: Latex")).toBeVisible();
        await expect(page.getByRole("main")).not.toContainText("you can't see");
    });
});

/**
 * Customer Detail on a 375px phone (C14, default 28). Rye is a film set, so
 * nothing here is saved: the long name is drawn in place, and More actions
 * is only opened.
 */
test.describe("customer detail on a 375px phone", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    /** Whether the element shows whole across the 375px screen. */
    const whole = async (el: ReturnType<Page["locator"]>) => {
        const b = await el.boundingBox();
        return b !== null && b.x >= 0 && b.x + b.width <= 375;
    };

    /** The page itself never scrolls sideways. */
    const noSideways = (page: Page) =>
        page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        );

    test("the tabs are one row that scrolls, keeping the chosen one in view", async ({
        page,
    }) => {
        await signIn(page, RYE);
        await page.goto(`/customers/${PRIYA}?tab=notes`);
        const list = page.getByRole("tablist", { name: "Customer sections" });
        const notes = tab(page, /^Notes/);
        await expect(notes).toHaveAttribute("aria-selected", "true");

        // One row, never wrapped, wider than the screen.
        const tops = await list
            .getByRole("tab")
            .evaluateAll((els) =>
                els.map((e) => Math.round(e.getBoundingClientRect().top)),
            );
        expect(new Set(tops).size).toBe(1);
        expect(
            await list.evaluate((el) => el.scrollWidth > el.clientWidth),
        ).toBe(true);
        // Opened from the address, the chosen tab was scrolled into view.
        await expect.poll(() => whole(notes)).toBe(true);
        expect(await noSideways(page)).toBe(true);

        // The arrow keys go round to Overview, which comes back into view.
        await notes.focus();
        await page.keyboard.press("ArrowRight");
        const over = tab(page, /^Overview/);
        await expect(over).toHaveAttribute("aria-selected", "true");
        await expect(over).toBeFocused();
        await expect.poll(() => whole(over)).toBe(true);
    });

    test("a long name wraps without pushing the tags off-screen", async ({
        page,
    }) => {
        await signIn(page, RYE);
        await page.goto(`/customers/${PRIYA}`);
        const h1 = page.getByRole("heading", { level: 1 });
        await expect(h1).toHaveText("Priya Raman");
        // Far longer than any name the seed holds, and unbroken.
        await h1.evaluate((el) => {
            el.textContent = `${"Priyadarshini".repeat(4)} Venkataraghavan-Subramaniam`;
        });
        const row = nameRow(page);
        const edges = await row.locator(":scope > *").evaluateAll((els) =>
            els.map((e) => {
                const r = e.getBoundingClientRect();
                return { left: r.left, right: r.right };
            }),
        );
        for (const e of edges) {
            expect(e.left).toBeGreaterThanOrEqual(0);
            expect(e.right).toBeLessThanOrEqual(375);
        }
        await expect(
            row.getByText("Returning", { exact: true }),
        ).toBeInViewport();
        expect(await noSideways(page)).toBe(true);
    });

    test("More actions is the ⋯ button, and Delete says why it's off", async ({
        page,
    }) => {
        await signIn(page, RYE);
        await page.goto(`/customers/${PRIYA}`);
        const more = page
            .getByRole("main")
            .getByRole("button", { name: "More actions" });
        await expect(more).toBeEnabled();
        await more.click();
        await expect(
            page.getByRole("menuitem", { name: "Merge with a duplicate…" }),
        ).toBeVisible();
        // Priya has orders: the privacy removal is offered, and Delete stays
        // in the menu, off, with its reason.
        const del = page.getByRole("menuitem", { name: /Delete their record/ });
        await expect(del).toHaveAttribute("aria-disabled", "true");
        await expect(del).toContainText(
            "They have orders or invoices. Remove their details instead.",
        );
        await expect(
            page.getByRole("menuitem", {
                name: "Remove their details (privacy request)…",
            }),
        ).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(more).toBeFocused();
    });
});

/**
 * Messages (round-2 A13): a customer signed in on Northwind's site writes
 * from the Contact page's form, the team reads it on Customer Detail's
 * Messages tab and replies, and the reply shows in the customer's account.
 * The account area ships dark, so this runs only on a stack started with
 * `SITE_ACCOUNT_AREA=on` in both the api and saroh.app. It makes a new
 * customer (a new email and address) and changes only that customer.
 */
test.describe("customer detail: Messages (A13)", () => {
    test.skip(
        process.env.SITE_ACCOUNT_AREA !== "on",
        "SITE_ACCOUNT_AREA is off on this stack",
    );

    test("the customer writes from the Contact page, the team replies, and the reply reaches their account", async ({
        page,
        browser,
    }, testInfo) => {
        test.setTimeout(120_000);
        const renderer = new URL(urls.RENDERER_URL);
        const site = `${renderer.protocol}//northwind.${renderer.host}`;
        const email = `a13-${testInfo.project.name}-${Date.now()}@example.in`;
        const asked = `Do you have 40 pallets of shrink wrap? (${Date.now()})`;
        const answer = `Yes — 40 are on the shelf. (${Date.now()})`;

        // The customer, in a browser of their own, signed in on the site.
        const customer = await browser.newContext({ ignoreHTTPSErrors });
        const visitor = await customer.newPage();
        await asNewVisitor(visitor);
        await visitor.goto(`${site}/contact`);
        await visitor
            .getByRole("banner")
            .getByRole("button", { name: "Sign in" })
            .filter({ visible: true })
            .click();
        await signInOnSheet(visitor, email);

        // Signed in, the Contact page's form asks only for the message.
        await visitor.goto(`${site}/contact`);
        await expect(
            visitor.getByText(
                `Signed in as ${email}. The reply comes to your Messages.`,
            ),
        ).toBeVisible();
        await expect(visitor.getByLabel(/Your name/)).toHaveCount(0);
        await visitor.getByLabel("What do you need?").fill(asked);
        await visitor
            .getByRole("button", { name: "Send enquiry" })
            .filter({ visible: true })
            .click();
        await expect(visitor.getByRole("status")).toContainText(
            /Sent\. .+ will reply in your Messages\./,
        );

        // The team: the customer found through the API by their email.
        await signIn(page, NORTHWIND);
        const found = await page.request.get(
            `${urls.API_URL}/organizations/${NORTHWIND}/customers?q=${encodeURIComponent(email)}`,
            { headers: { "x-organization-id": NORTHWIND } },
        );
        expect(found.ok()).toBe(true);
        const { rows } = (await found.json()) as {
            rows: { contactId: string }[];
        };
        expect(rows).toHaveLength(1);
        await page.goto(`/customers/${rows[0]?.contactId ?? ""}?tab=msg`);
        await expect(tab(page, /^Messages/)).toHaveAttribute(
            "aria-selected",
            "true",
        );
        await expect(
            page.getByRole("list", { name: /^Messages with / }),
        ).toContainText(asked);

        const reply = page.getByRole("textbox", { name: /^Reply to / });
        await reply.fill(answer);
        await page.getByRole("button", { name: "Send reply" }).click();
        await expect(
            page.getByRole("list", { name: /^Messages with / }),
        ).toContainText(answer, { timeout: 15_000 });

        // The customer sees the reply in their account's Messages.
        await visitor.goto(`${site}/account/messages`);
        const thread = visitor.getByRole("list", { name: /^Messages with / });
        await expect(thread).toContainText(asked);
        await expect(thread).toContainText(answer);
        await customer.close();
    });
});
