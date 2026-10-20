// @covers accounts:/login app:/open app:/billing/invoices api:invoices
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectNothingHiddenSideways } from "../fixtures/hidden-sideways";
import { makeContact, northwind, stamp } from "../fixtures/own-data";
import { pressUntil } from "../fixtures/press";
import { onPhone } from "../fixtures/roles";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * The Invoices list (DEC-173, U8 #1120, INVListAC and INVListACPhone): the
 * money strip whose figures are filters, the search, the one GST line, the
 * cheques line, the phone's slim rows and its compact top bar.
 *
 * - Read on Rye & Co. (GST-registered, a film set nothing writes to): the
 *   strip, a figure pressed, a search, the GST line's rates sheet, opened
 *   and closed without saving.
 * - The cheques line on Northwind, with its own invoice paid by a cheque,
 *   `@serial`: the line is business-wide.
 * - An empty business on Asha's first-run business, read only.
 *
 * Desk and phone run the same steps; what differs is said where it does.
 */

const RYE = "seed_sc_rc_org";
/** Asha's sole-trader business: nothing invoiced yet (`seed/founder.ts`). */
const EMPTY = "seed_org_first-run_solo";

interface Figure {
    count: number;
    totals?: { currency: string; amountMinor: number }[];
    filter: { view?: string; paidFrom?: string };
}

interface Summary {
    monthStart: string;
    money: boolean;
    owed: Figure;
    overdue: Figure;
    paidThisMonth: Figure;
    drafts: Figure;
    chequesWaiting: Figure | null;
}

/** A business's API as the signed-in owner. */
function api(request: APIRequestContext, org: string) {
    const headers = { "x-organization-id": org, origin: urls.APP_URL };
    return {
        get: async <T>(path: string): Promise<T> => {
            const res = await request.get(
                `${urls.API_URL}/organizations/${org}${path}`,
                { headers },
            );
            expect(res.ok(), `${res.url()}: ${await res.text()}`).toBe(true);
            return (await res.json()) as T;
        },
    };
}

async function open(
    page: Page,
    org: string,
    who: "owner" | "founder" = "owner",
) {
    await useSession(page, who);
    await page.goto(`/open/${org}`);
    await page.goto("/billing/invoices");
    await expect(
        page.getByRole("heading", { level: 1, name: "Invoices" }),
    ).toBeVisible();
}

const figure = (page: Page, key: string): Locator =>
    page.locator(`[data-figure="${key}"]`);

/** The rows on screen. */
const rows = (page: Page): Locator =>
    page.locator("[data-invoice-row]").filter({ visible: true });

const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

test.describe("invoices list: Rye & Co., read only", () => {
    test("the strip's figures are labelled, and Overdue filters the list and reads as on", async ({
        page,
    }) => {
        await open(page, RYE);
        const summary = await api(page.request, RYE).get<Summary>(
            "/invoices/summary",
        );
        const month = MONTHS[Number(summary.monthStart.slice(5, 7)) - 1];
        await expect(figure(page, "owed")).toContainText("Owed to you");
        await expect(figure(page, "overdue")).toContainText("Overdue");
        await expect(figure(page, "paid")).toContainText(`Paid in ${month}`);
        await expect(figure(page, "drafts")).toContainText("Drafts");
        // The owner sees money; the figures never read as a failed ₹0 row.
        expect(summary.money).toBe(true);
        await expect(figure(page, "owed")).toContainText("₹");
        await expect(page.getByText("Couldn't load totals")).toHaveCount(0);
        // The overdue banner is gone: the strip says it.
        await expect(
            page.getByRole("button", { name: "Show them" }),
        ).toHaveCount(0);

        const overdue = figure(page, "overdue");
        await expect(overdue).toHaveAttribute("aria-pressed", "false");
        await pressUntil(
            overdue,
            async () => (await overdue.getAttribute("aria-pressed")) === "true",
        );
        await expect(page).toHaveURL(/[?&]tab=overdue\b/);
        await expect(
            page.getByRole("combobox", { name: "Invoice status" }),
        ).toContainText("Overdue");
        if (summary.overdue.count > 0) {
            await expect(rows(page).first()).toBeVisible();
            // Every row left is late: its own line says how late.
            await expect
                .poll(() =>
                    rows(page).evaluateAll((els) =>
                        els.every((el) => /late|Overdue/.test(el.textContent)),
                    ),
                )
                .toBe(true);
        }

        // Pressed again, the whole list.
        await overdue.click();
        await expect(overdue).toHaveAttribute("aria-pressed", "false");
        await expect(page).not.toHaveURL(/tab=overdue/);
    });

    test("searching an invoice's number finds that one", async ({ page }) => {
        await open(page, RYE);
        const issued = await api(page.request, RYE).get<
            { number: string | null; kind?: string }[]
        >("/invoices?view=paid");
        const one = issued.find(
            (i) => i.number && (i.kind ?? "INVOICE") === "INVOICE",
        )?.number;
        test.skip(!one, "Rye has no paid invoice to search for");
        const number = one ?? "";

        const field = page.getByRole("searchbox", { name: "Search invoices" });
        if (!onPhone(page)) {
            // "/" jumps to the search at a desk.
            await expect(async () => {
                await page.keyboard.press("/");
                await expect(field).toBeFocused({ timeout: 1_000 });
            }).toPass({ timeout: 15_000 });
        }
        await field.fill(number);
        await field.press("Enter");
        // In the address, so a reload or a shared link keeps it.
        await expect
            .poll(() => new URL(page.url()).searchParams.get("q"))
            .toBe(number);
        await expect(rows(page)).toHaveCount(1);
        await expect(rows(page).first()).toContainText(
            onPhone(page) ? (number.split("/").at(-1) ?? number) : number,
        );

        // Nothing matches: said so, with the way back.
        await field.fill("no such invoice zz");
        await field.press("Enter");
        await expect(
            page.getByText("No invoices match “no such invoice zz”"),
        ).toBeVisible();
        await page
            .getByRole("button", { name: "Clear search" })
            .first()
            .click();
        await expect(page).not.toHaveURL(/[?&]q=/);
    });

    test("one GST line, whose count opens the rates sheet", async ({
        page,
    }) => {
        await open(page, RYE);
        const line = page.locator("[data-gst-line]");
        await expect(line).toContainText("GST tax invoices · GSTIN");
        // No notice under it: the count is part of the line.
        await expect(
            page.getByRole("button", { name: "Choose rates" }),
        ).toHaveCount(0);
        const missing = await api(page.request, RYE).get<{
            registered: boolean;
            items: { canSet?: boolean }[];
        }>("/gst-rates/missing");
        const count = line.getByRole("button", { name: /needs? a GST rate$/ });
        if (
            !missing.registered ||
            !missing.items.some((i) => i.canSet !== false)
        ) {
            await expect(count).toHaveCount(0);
            return;
        }
        await pressUntil(
            count,
            page.getByRole("dialog", { name: "GST rates to choose" }),
        );
        // Closed without saving: Rye is only read.
        await page.keyboard.press("Escape");
        await expect(
            page.getByRole("dialog", { name: "GST rates to choose" }),
        ).toHaveCount(0);
    });

    test("on a phone: a compact top bar, rows 64 to 72px, nothing hidden sideways", async ({
        page,
    }) => {
        test.skip(!onPhone(page), "the phone's own layout");
        await page.setViewportSize({ width: 390, height: 844 });
        await open(page, RYE);
        // No breadcrumb: the shell's bar already says where this is.
        await expect(
            page.getByRole("navigation", { name: "Breadcrumb" }),
        ).toBeHidden();
        // The title, the count and New on one line.
        const title = page.getByRole("heading", { level: 1, name: "Invoices" });
        const add = page.getByRole("link", { name: "New invoice" });
        await expect(add).toBeVisible();
        await expect(add).toHaveText("New", { useInnerText: true });
        const [t, a] = await Promise.all([
            title.boundingBox(),
            add.boundingBox(),
        ]);
        expect(
            Math.abs(
                (t?.y ?? 0) +
                    (t?.height ?? 0) / 2 -
                    ((a?.y ?? 0) + (a?.height ?? 0) / 2),
            ),
        ).toBeLessThan(12);

        await expect(rows(page).first()).toBeVisible();
        // To the nearest pixel: a row laid out at 64px can measure
        // 63.9999 after the browser's sub-pixel rounding (20 Oct).
        const heights = await rows(page).evaluateAll((els) =>
            els
                .slice(0, 10)
                .map((el) => Math.round(el.getBoundingClientRect().height)),
        );
        expect(heights.length).toBeGreaterThan(0);
        for (const h of heights) {
            expect(h).toBeGreaterThanOrEqual(64);
            expect(h).toBeLessThanOrEqual(72);
        }
        await expectNothingHiddenSideways(page);

        // The floor.
        await page.setViewportSize({ width: 320, height: 740 });
        await expect
            .poll(() =>
                page.evaluate(() => ({
                    vw: window.innerWidth,
                    over:
                        document.documentElement.scrollWidth >
                        window.innerWidth,
                })),
            )
            .toEqual({ vw: 320, over: false });
        await expectNothingHiddenSideways(page);
    });
});

test.describe("invoices list: an empty business", () => {
    test("says no invoices yet, with New invoice", async ({ page }) => {
        await open(page, EMPTY, "founder");
        await expect(page.getByText("No invoices yet")).toBeVisible();
        await expect(
            page
                .getByRole("link", { name: "New invoice" })
                .filter({ visible: true }),
        ).not.toHaveCount(0);
        await expect(page.locator("[data-cheques-line]")).toHaveCount(0);
    });
});

interface Recorded {
    recorded: { paymentId: string };
}

test.describe(
    "invoices list: cheques not in the bank",
    { tag: "@serial" },
    () => {
        test("the line shows while a cheque waits, filters to it, and goes once it is in the bank", async ({
            page,
        }, testInfo) => {
            test.setTimeout(120_000);
            await useSession(page);
            await page.goto(`/open/${NORTHWIND_ORG}`);
            const nw = northwind(page.request);
            const s = stamp(testInfo);
            const contact = await makeContact(page.request, {
                firstName: "Kiran",
                lastName: `List ${s}`,
                email: `inv-list-${s}@example.com`,
            });
            const made = await nw.post<{ id: string; number: string | null }>(
                "/invoices",
                {
                    contactId: contact.id,
                    currency: "INR",
                    lines: [
                        {
                            description: `Shelving (${s})`,
                            quantity: 1,
                            unitPrice: "8400",
                        },
                    ],
                    dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
                },
            );
            const issued = await nw.post<{ number: string }>(
                `/invoices/${made.id}/issue`,
            );
            const paid = await nw.post<Recorded>(
                `/invoices/${made.id}/payments`,
                {
                    method: "CHEQUE",
                    chequeNumber: `00${s.slice(-4)}`,
                    chequeBank: "HDFC Bank",
                },
            );
            try {
                await page.goto("/billing/invoices");
                const line = page.locator("[data-cheques-line]");
                await expect(line).toContainText("Cheques not in the bank");
                await expect(line).toContainText("₹");
                await pressUntil(
                    line,
                    async () =>
                        (await line.getAttribute("aria-pressed")) === "true",
                );
                await expect(page).toHaveURL(/[?&]view=cheques\b/);
                const ours = rows(page).filter({ hasText: contact.name });
                await expect(ours).toHaveCount(1);
                await expect(ours).toContainText(
                    onPhone(page)
                        ? "Paid · cheque not in the bank"
                        : issued.number,
                );

                // Home's link lands on the same view.
                await page.goto("/billing/invoices?view=cheques");
                await expect(line).toHaveAttribute("aria-pressed", "true");
                await expect(
                    rows(page).filter({ hasText: contact.name }),
                ).toHaveCount(1);

                // In the bank, as the invoice will mark it: no longer listed.
                await nw.post(
                    `/invoices/${made.id}/payments/${paid.recorded.paymentId}/cleared`,
                );
                const after = await nw.get<Summary>("/invoices/summary");
                await page.reload();
                await expect(
                    page.getByRole("heading", { level: 1, name: "Invoices" }),
                ).toBeVisible();
                await expect(
                    rows(page).filter({ hasText: contact.name }),
                ).toHaveCount(0);
                if (after.chequesWaiting === null) {
                    // None waits now: the line is gone, and the list says why.
                    await expect(line).toHaveCount(0);
                    await expect(
                        page.getByText("No cheques waiting for the bank"),
                    ).toBeVisible();
                }
            } finally {
                // Never leave a cheque waiting for the next test: cleared, even
                // when a step above failed. A second clear is refused, and fine.
                await page.request.post(
                    `${urls.API_URL}/organizations/${NORTHWIND_ORG}/invoices/${made.id}/payments/${paid.recorded.paymentId}/cleared`,
                    { headers: nw.headers, data: {}, failOnStatusCode: false },
                );
            }
        });
    },
);
