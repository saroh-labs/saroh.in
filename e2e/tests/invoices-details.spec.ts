// @covers accounts:/login app:/open app:/billing/invoices app:/billing/invoices/[invoiceId] api:invoices
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectNothingHiddenSideways } from "../fixtures/hidden-sideways";
import { closeMenu, menuItem } from "../fixtures/invoice-actions";
import { makeContact, northwind, stamp } from "../fixtures/own-data";
import { pressUntil } from "../fixtures/press";
import { onPhone } from "../fixtures/roles";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * An invoice's details (DEC-173, U9 #1121, INVListAC, INVPageA): a row on
 * the list opens them in a side sheet where every action finishes, and the
 * invoice's page shows the same view, so deep links still work.
 *
 * - Read on Rye & Co. (a film set nothing writes to): an overdue row opens
 *   the sheet, Escape gives focus back to the row, Next overdue walks the
 *   list without closing, and the page is the same view. On a phone the
 *   sheet is the whole screen with its foot at the bottom.
 * - Writes on Northwind, each on invoices the test makes: a draft deleted
 *   from the sheet, a paid one's actions, a payment removed, and a read
 *   that fails inside the sheet.
 */

const RYE = "seed_sc_rc_org";

interface Row {
    id: string;
    number: string | null;
    standing: string;
    kind?: string;
}

/** A business's API as the signed-in owner, read only. */
async function list(request: APIRequestContext, org: string, view: string) {
    const res = await request.get(
        `${urls.API_URL}/organizations/${org}/invoices?view=${view}`,
        { headers: { "x-organization-id": org, origin: urls.APP_URL } },
    );
    expect(res.ok(), await res.text()).toBe(true);
    return ((await res.json()) as Row[]).filter(
        (r) => (r.kind ?? "INVOICE") === "INVOICE",
    );
}

async function openList(page: Page, org: string, search = "") {
    await useSession(page);
    await page.goto(`/open/${org}`);
    await page.goto(`/billing/invoices${search}`);
    await expect(
        page.getByRole("heading", { level: 1, name: "Invoices" }),
    ).toBeVisible();
}

const sheet = (page: Page) =>
    page
        .getByRole("dialog")
        .filter({ has: page.locator("[data-invoice-sheet]") });
const row = (page: Page, id: string) =>
    page.locator(`[data-invoice-row="${id}"]`).filter({ visible: true });

/** A Northwind invoice for a contact of the test's own, issued or not. */
async function ownInvoice(
    page: Page,
    tag: string,
    { issue = true }: { issue?: boolean } = {},
): Promise<{ id: string; number: string | null; who: string }> {
    const nw = northwind(page.request);
    const s = `${stamp(test.info())}-${tag}`;
    const contact = await makeContact(page.request, {
        firstName: "Vivek",
        lastName: `Details ${s}`,
        email: `inv-details-${s}@example.com`,
    });
    const made = await nw.post<{ id: string; number: string | null }>(
        "/invoices",
        {
            contactId: contact.id,
            currency: "INR",
            lines: [
                {
                    description: `Shelving (${tag})`,
                    quantity: 1,
                    unitPrice: "8400",
                },
            ],
            dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        },
    );
    if (!issue) return { id: made.id, number: null, who: contact.name };
    const issued = await nw.post<{ number: string }>(
        `/invoices/${made.id}/issue`,
    );
    return { id: made.id, number: issued.number, who: contact.name };
}

test.describe("invoice details: Rye & Co., read only", () => {
    test("an overdue row opens the sheet; Escape gives focus back; Next walks the list", async ({
        page,
    }) => {
        await openList(page, RYE, "?tab=overdue");
        const overdue = await list(page.request, RYE, "overdue");
        test.skip(overdue.length === 0, "Rye has nothing overdue to open");
        const first = row(page, overdue[0]?.id ?? "");
        await expect(first).toBeVisible();

        await pressUntil(first, sheet(page));
        const open = sheet(page);
        await expect(open.locator("[data-money-card]")).toContainText(
            "to collect",
        );
        await expect(
            open.getByRole("button", { name: "Record payment", exact: true }),
        ).toBeVisible();
        await expect(
            open.locator("[data-money-card]").getByRole("button", {
                name: /^(Share on WhatsApp|Send by email)$/,
            }),
        ).toBeVisible();
        // The paper is in the sheet, and the page is one link away.
        await expect(
            open.getByRole("article", { name: /as it prints$/ }),
        ).toBeVisible();
        await expect(
            open.getByRole("link", { name: "Open full page" }),
        ).toHaveAttribute("href", `/billing/invoices/${overdue[0]?.id}`);
        // Kept in the address: a reload opens it again.
        await expect
            .poll(() => new URL(page.url()).searchParams.get("invoice"))
            .toBe(overdue[0]?.id);

        // Next overdue moves to the next row's invoice without closing.
        if (overdue.length > 1) {
            const before = await open.getByRole("heading").first().innerText();
            await open.getByRole("button", { name: "Next overdue" }).click();
            await expect(open).toBeVisible();
            await expect(open.getByRole("heading").first()).not.toHaveText(
                before,
            );
            await open
                .getByRole("button", { name: "Previous invoice" })
                .click();
            await expect(open.getByRole("heading").first()).toHaveText(before);
        }

        // Escape closes it, and focus is back on the row that opened it.
        await page.keyboard.press("Escape");
        await expect(sheet(page)).toHaveCount(0);
        await expect(first).toBeFocused();
        await expect
            .poll(() => new URL(page.url()).searchParams.get("invoice"))
            .toBeNull();
    });

    test("a deep link draws the same view as a page, inside the shell", async ({
        page,
    }) => {
        await useSession(page);
        await page.goto(`/open/${RYE}`);
        const overdue = await list(page.request, RYE, "overdue");
        const pick: Row | undefined =
            overdue.at(0) ?? (await list(page.request, RYE, "paid")).at(0);
        test.skip(!pick?.number, "Rye has no issued invoice to open");
        if (!pick?.number) return;
        await page.goto(`/billing/invoices/${pick.id}`);
        await expect(
            page.getByRole("heading", { level: 1, name: pick.number }),
        ).toBeVisible();
        const card = page
            .locator("[data-money-card]")
            .filter({ visible: true });
        await expect(card).toBeVisible();
        await expect(
            page.getByRole("article", { name: /as it prints$/ }),
        ).toBeVisible();
        await expect(page.getByText("What happened").first()).toBeVisible();
        // The rail is there: a page of the shell, not a bare sheet.
        if (!onPhone(page)) {
            await expect(
                page.getByRole("navigation", { name: "Primary" }),
            ).toBeVisible();
        }
    });

    test("on a phone: the whole screen, its foot at the bottom, 44px targets", async ({
        page,
    }) => {
        test.skip(!onPhone(page), "the phone's own layout");
        await page.setViewportSize({ width: 390, height: 844 });
        await openList(page, RYE, "?tab=overdue");
        const overdue = await list(page.request, RYE, "overdue");
        test.skip(overdue.length === 0, "Rye has nothing overdue to open");
        await pressUntil(row(page, overdue[0]?.id ?? ""), sheet(page));
        const open = sheet(page);
        const box = await open.boundingBox();
        expect(Math.round(box?.width ?? 0)).toBe(390);
        // The foot sits at the bottom of the screen, within a thumb's reach.
        const foot = open.locator("[data-sheet-foot]");
        const f = await foot.boundingBox();
        expect((f?.y ?? 0) + (f?.height ?? 0)).toBeGreaterThan(844 - 4);
        const heights = await foot
            .getByRole("button")
            .evaluateAll((els) =>
                els.map((el) => el.getBoundingClientRect().height),
            );
        for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
        const main = open
            .locator("[data-money-card]")
            .getByRole("button", { name: "Record payment", exact: true });
        expect((await main.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(
            44,
        );
        await expectNothingHiddenSideways(page);
    });
});

test.describe("invoice details: Northwind, own invoices", () => {
    test("a draft: Issue, Edit, and Delete draft from More, after one confirm", async ({
        page,
    }) => {
        await useSession(page);
        await page.goto(`/open/${NORTHWIND_ORG}`);
        const draft = await ownInvoice(page, "draft", { issue: false });
        await page.goto(`/billing/invoices?tab=draft&invoice=${draft.id}`);
        const open = sheet(page);
        await expect(open).toBeVisible();
        await expect(
            open
                .locator("[data-money-card]")
                .getByRole("button", { name: /^Issue (and share|it)$/ }),
        ).toBeVisible();
        await expect(open.getByRole("link", { name: "Edit" })).toHaveAttribute(
            "href",
            `/billing/invoices/${draft.id}/edit`,
        );

        await (await menuItem(page, "More", "Delete draft")).click();
        const confirm = page.getByRole("alertdialog");
        await expect(confirm).toContainText("Delete this draft?");
        await confirm.getByRole("button", { name: "Delete draft" }).click();
        await expect(page.getByText("Draft deleted.").first()).toBeVisible();
        // The sheet closes and the list stays, without the row.
        await expect(sheet(page)).toHaveCount(0);
        await expect(page).toHaveURL(/\/billing\/invoices(\?|$)/);
        await expect(row(page, draft.id)).toHaveCount(0);
    });

    test("paid: Share receipt and Download PDF, with Refund… in More", async ({
        page,
    }) => {
        await useSession(page);
        await page.goto(`/open/${NORTHWIND_ORG}`);
        const paid = await ownInvoice(page, "paid");
        await northwind(page.request).post(`/invoices/${paid.id}/payments`, {
            method: "BANK_TRANSFER",
            reference: "UTR 4581",
        });
        await page.goto(`/billing/invoices?tab=paid&invoice=${paid.id}`);
        const open = sheet(page);
        const card = open.locator("[data-money-card]");
        await expect(card).toContainText("Paid ₹8,400");
        await expect(
            card.getByRole("button", { name: "Share receipt" }),
        ).toBeVisible();
        await expect(
            card.getByRole("button", { name: "Download PDF" }),
        ).toBeVisible();
        await expect(await menuItem(page, "More", "Refund…")).toBeVisible();
        await closeMenu(page);
        await expect(
            open.getByText("Payment recorded · bank transfer"),
        ).toBeVisible();
    });

    test("a payment recorded by mistake is removed: owed again, struck through in the history", async ({
        page,
    }) => {
        await useSession(page);
        await page.goto(`/open/${NORTHWIND_ORG}`);
        const inv = await ownInvoice(page, "remove");
        await northwind(page.request).post(`/invoices/${inv.id}/payments`, {
            method: "CASH",
            amount: "4000.00",
        });
        await page.goto(`/billing/invoices/${inv.id}`);
        const card = page
            .locator("[data-money-card]")
            .filter({ visible: true });
        await expect(card).toContainText("₹4,400 left to pay");

        const remove = page
            .getByRole("button", { name: "Remove this payment" })
            .filter({ visible: true });
        const dialog = page.getByRole("dialog", {
            name: "Remove this payment",
        });
        await pressUntil(remove, dialog);
        await dialog.getByLabel(/^Why/).fill("Typed the wrong invoice");
        await dialog.getByRole("button", { name: "Remove payment" }).click();
        await expect(dialog).toHaveCount(0);
        await expect(
            page.getByText("Payment of ₹4,000 removed.").first(),
        ).toBeVisible();

        await expect(card).toContainText("₹8,400 to collect");
        await expect(
            page
                .getByText(
                    "Payment of ₹4,000 removed · Typed the wrong invoice",
                )
                .first(),
        ).toBeVisible();
        await expect(
            page.locator(".line-through", { hasText: "Part payment ₹4,000" }),
        ).toBeVisible();
        await expect(remove).toHaveCount(0);
    });

    test("a read that fails is said inside the sheet, with Try again", async ({
        page,
    }) => {
        await openList(page, NORTHWIND_ORG, "?invoice=no-such-invoice");
        const open = page.getByRole("dialog");
        await expect(open).toContainText("Couldn't load this invoice");
        await expect(open).toContainText("Nothing has changed");
        await expect(
            open.getByRole("button", { name: "Try again" }),
        ).toBeVisible();
    });
});
