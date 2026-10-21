// @covers app:/settings/providers app:/open api:communications api:capabilities api:admin
import type { Browser, Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { OwnBusiness } from "../fixtures/own-business";
import { makeBusiness } from "../fixtures/own-business";
import { stamp } from "../fixtures/own-data";
import { pressUntil } from "../fixtures/press";
import { useSession } from "../fixtures/sessions";
import { ignoreHTTPSErrors, urls } from "../playwright.config";

/**
 * Settings › Providers' "Emails to your customers" (DEC-174, U4 #1135):
 * one switch for each automatic email Saroh sends the business's
 * customers from its own email, read first in a row and changed in a side
 * sheet, each switch saved as it is flipped with Undo.
 *
 * Each test sets up a business of its own (`makeBusiness`, as Asha, its
 * owner), so a switch flipped here is read by nothing else and the test
 * runs beside every other.
 *
 * What is listed is the API's (`communications/notice-settings.ts`): only
 * the emails Saroh sends today (`NOTICE_SENDS`, flipped by each unit that
 * ships a sender) whose module is on. The renewal invoice and the failed
 * autopay charge (U10 #1141) are the first: they are Payments', so each
 * test has Sam, Saroh staff, roll Payments out to its business and Asha
 * turn it on, as an operator and an owner would (`withPayments`). The
 * first test still pins that no row is drawn while nothing is offered,
 * and the second is skipped, saying why, if nothing is.
 *
 * Overdue reminders, once on, say when they go (DEC-178, #1169): the two
 * days after the due date and the hours, each choice saved as it is made
 * with Undo, on a desk and a phone.
 *
 * The words, the one-note rule, the read-only sheet and a refused save
 * are covered by `customer-emails*.test.ts(x)` beside the components; the
 * listing, the 403 and the 409 by the API's `notice-settings` specs.
 */

interface Timing {
    firstDay: number;
    secondDay: number;
    fromHour: number;
    untilHour: number;
}

interface Listed {
    notices: {
        kind: string;
        label: string;
        on: boolean;
        offered: boolean;
        timing?: Timing | null;
    }[];
    canChange: boolean;
    emailConnected: boolean;
}

const api = (b: OwnBusiness) =>
    `${urls.API_URL}/organizations/${b.id}/customer-notices/settings`;

const headers = (b: OwnBusiness) => ({
    origin: urls.APP_URL,
    "x-organization-id": b.id,
});

async function listed(page: Page, b: OwnBusiness): Promise<Listed> {
    const res = await page.request.get(api(b), { headers: headers(b) });
    expect(res.ok(), await res.text()).toBe(true);
    return (await res.json()) as Listed;
}

async function openProviders(page: Page, b: OwnBusiness) {
    await page.goto(`/open/${b.id}`);
    await page.goto("/settings/providers");
    await expect(
        page.getByRole("heading", { name: "Providers", level: 1 }),
    ).toBeVisible();
}

const block = (page: Page) =>
    page.getByRole("region", { name: "Emails to your customers" });

/**
 * Payments, rolled out to the business by Sam (a business set up here has
 * no module rolled out) and turned on by Asha, so its emails are offered.
 */
async function withPayments(
    browser: Browser,
    page: Page,
    b: OwnBusiness,
    testInfo: TestInfo,
) {
    const context = await browser.newContext({ ignoreHTTPSErrors });
    try {
        const staff = await context.newPage();
        await useSession(staff, "staff");
        const res = await staff.request.put(
            `${urls.API_URL}/admin/flags/MODULE_PAYMENTS/organizations/${b.id}`,
            {
                headers: { origin: urls.APP_URL },
                data: {
                    enabled: true,
                    reason: "Customer emails browser test (U10)",
                    idempotencyKey: `ce-pay-${stamp(testInfo)}`,
                },
            },
        );
        expect(res.ok(), `roll out Payments: ${await res.text()}`).toBe(true);
    } finally {
        await context.close();
    }
    const on = await page.request.put(
        `${urls.API_URL}/organizations/${b.id}/modules/PAYMENTS`,
        { headers: headers(b), data: { status: "ENABLED", setup: {} } },
    );
    expect(on.ok(), `turn on Payments: ${await on.text()}`).toBe(true);
}

/** Never sideways, at the width the project set. */
async function noSideways(page: Page) {
    const width = page.viewportSize()?.width ?? 0;
    // A phone widens innerWidth to fit content that overflows.
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);
    await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(width);
}

test("a row only while an email is offered, with a switch for exactly those", async ({
    page,
    browser,
}, testInfo) => {
    const b = await makeBusiness(page, testInfo, "ce-row");
    await withPayments(browser, page, b, testInfo);
    const read = await listed(page, b);
    expect(read.canChange).toBe(true);

    await openProviders(page, b);
    if (read.notices.length === 0) {
        // No email Saroh sends yet: no row, no switch that does nothing.
        await expect(block(page)).toHaveCount(0);
        await expect(page.getByText("Automatic emails")).toHaveCount(0);
        await noSideways(page);
        return;
    }

    await expect(block(page)).toBeVisible();
    const edit = block(page).getByRole("button", {
        name: "Edit emails to your customers",
    });
    const sheet = page.getByRole("dialog", {
        name: "Emails to your customers",
    });
    await pressUntil(edit, sheet);
    await expect(sheet.getByRole("switch")).toHaveCount(read.notices.length);
    for (const n of read.notices) {
        await expect(
            sheet.getByRole("switch", { name: n.label, exact: true }),
        ).toHaveAttribute("aria-checked", String(n.on));
    }
    await noSideways(page);
});

test("an owner turns one off, Undo turns it back on, and the sheet fits", async ({
    page,
    browser,
}, testInfo) => {
    const b = await makeBusiness(page, testInfo, "ce-flip");
    await withPayments(browser, page, b, testInfo);
    const read = await listed(page, b);
    // Renewal invoices and failed autopay charges (U10) are offered.
    expect(read.notices.map((n) => n.kind)).toEqual(
        expect.arrayContaining(["RENEWAL_INVOICE", "AUTOPAY_FAILED"]),
    );
    const target = read.notices.find((n) => n.offered && n.on);
    test.skip(
        !target,
        "No automatic email Saroh sends is offered to a new business yet",
    );
    if (!target) return;

    await openProviders(page, b);
    const sheet = page.getByRole("dialog", {
        name: "Emails to your customers",
    });
    await pressUntil(
        block(page).getByRole("button", {
            name: "Edit emails to your customers",
        }),
        sheet,
    );
    const toggle = sheet.getByRole("switch", {
        name: target.label,
        exact: true,
    });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await noSideways(page);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(page.getByText(`${target.label} turned off.`)).toBeVisible();
    await expect
        .poll(
            async () =>
                (await listed(page, b)).notices.find(
                    (n) => n.kind === target.kind,
                )?.on,
        )
        .toBe(false);

    await page.getByRole("button", { name: "Undo" }).click();
    await expect
        .poll(
            async () =>
                (await listed(page, b)).notices.find(
                    (n) => n.kind === target.kind,
                )?.on,
        )
        .toBe(true);
    await expect(toggle).toHaveAttribute("aria-checked", "true");

    await sheet.getByRole("button", { name: "Done" }).click();
    await expect(sheet).toHaveCount(0);
    await expect(block(page)).toContainText(
        read.notices.every((n) => n.on) ? "All on" : "on",
    );
});

test("overdue reminders are listed off, an owner turns them on, and Undo turns them off again (U20)", async ({
    page,
}, testInfo) => {
    // Invoices belong to every business: no module to turn on first.
    const b = await makeBusiness(page, testInfo, "ce-overdue");
    const read = await listed(page, b);
    const overdue = read.notices.find((n) => n.kind === "OVERDUE_REMINDERS");
    expect(overdue).toMatchObject({ on: false, offered: true });

    await openProviders(page, b);
    const sheet = page.getByRole("dialog", {
        name: "Emails to your customers",
    });
    await pressUntil(
        block(page).getByRole("button", {
            name: "Edit emails to your customers",
        }),
        sheet,
    );
    const toggle = sheet.getByRole("switch", {
        name: "Overdue reminders",
        exact: true,
    });
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await noSideways(page);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("Overdue reminders turned on.")).toBeVisible();
    await expect
        .poll(
            async () =>
                (await listed(page, b)).notices.find(
                    (n) => n.kind === "OVERDUE_REMINDERS",
                )?.on,
        )
        .toBe(true);

    await page.getByRole("button", { name: "Undo" }).click();
    await expect
        .poll(
            async () =>
                (await listed(page, b)).notices.find(
                    (n) => n.kind === "OVERDUE_REMINDERS",
                )?.on,
        )
        .toBe(false);
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await noSideways(page);
});

test("with overdue reminders on, an owner chooses when they go, and Undo puts it back (DEC-178)", async ({
    page,
}, testInfo) => {
    const b = await makeBusiness(page, testInfo, "ce-timing");
    const timing = async () =>
        (await listed(page, b)).notices.find(
            (n) => n.kind === "OVERDUE_REMINDERS",
        )?.timing;
    expect(await timing()).toEqual({
        firstDay: 3,
        secondDay: 10,
        fromHour: 9,
        untilHour: 20,
    });

    await openProviders(page, b);
    const sheet = page.getByRole("dialog", {
        name: "Emails to your customers",
    });
    await pressUntil(
        block(page).getByRole("button", {
            name: "Edit emails to your customers",
        }),
        sheet,
    );
    const when = sheet.getByRole("group", {
        name: "When overdue reminders go",
    });
    // Off: no timing to choose.
    await expect(when).toHaveCount(0);

    await sheet
        .getByRole("switch", { name: "Overdue reminders", exact: true })
        .click();
    await expect(when).toBeVisible();
    await expect(
        when.getByRole("combobox", { name: "First reminder" }),
    ).toHaveText("3 days after it's due");
    await expect(when.getByRole("combobox", { name: "Until" })).toHaveText(
        "8 pm",
    );
    await noSideways(page);

    await when.getByRole("combobox", { name: "First reminder" }).click();
    await page
        .getByRole("option", { name: "5 days after it's due", exact: true })
        .filter({ visible: true })
        .click();
    await expect(
        page.getByText("Overdue reminder timing saved."),
    ).toBeVisible();
    await expect.poll(async () => (await timing())?.firstDay).toBe(5);
    await expect(
        when.getByRole("combobox", { name: "First reminder" }),
    ).toHaveText("5 days after it's due");
    // The switch's sentence follows the days.
    await expect(sheet).toContainText("5 and 10 days after it's due");

    // The timing's own Undo: turning reminders on left a toast with one too.
    await page
        .locator("[data-sonner-toast]")
        .filter({ hasText: "Overdue reminder timing saved." })
        .getByRole("button", { name: "Undo" })
        .click();
    await expect.poll(async () => (await timing())?.firstDay).toBe(3);
    await expect(
        when.getByRole("combobox", { name: "First reminder" }),
    ).toHaveText("3 days after it's due");
    await noSideways(page);
});
