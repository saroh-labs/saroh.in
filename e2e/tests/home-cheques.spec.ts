// @covers accounts:/login app:/open app:/ app:/billing/invoices api:home api:invoices
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { needsYou } from "../fixtures/home";
import { makeContact, northwind, stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * "Cheques not in the bank" on Home (DEC-173, Home plan U18, #1105): one
 * line in Needs you's money group while a cheque waits, at a desk and on
 * a phone, opening the invoices list filtered to those cheques. Home never
 * marks a cheque: once the cheques are in the bank (marked through the
 * API, as the invoice would), the line is gone. A Member, who holds no
 * `payment:read`, never sees it.
 *
 * It owns its data: a contact and two invoices made for the test, each
 * paid by a cheque (₹8,400 and ₹5,600). The cheques are marked in the bank
 * at the end and the invoices voided. `@serial`: the line and Needs you's
 * count are business-wide, so no other test may add a cheque meanwhile.
 */

interface ChequesWaiting {
    count: number;
    totals: { currency: string; amountMinor: number }[];
    href: string;
}

interface HomeRead {
    week: { chequesWaiting?: ChequesWaiting | null } | null;
}

interface Recorded {
    recorded: { paymentId: string };
}

/** What the API says waits: what Home must draw. */
async function waiting(
    request: APIRequestContext,
): Promise<ChequesWaiting | null> {
    const home = await northwind(request).get<HomeRead>("/home");
    return home.week?.chequesWaiting ?? null;
}

/** An issued invoice for this test's contact, paid by a cheque. */
async function paidByCheque(
    request: APIRequestContext,
    contactId: string,
    what: string,
    unitPrice: string,
    chequeNumber: string,
): Promise<{ id: string; paymentId: string }> {
    const nw = northwind(request);
    const made = await nw.post<{ id: string }>("/invoices", {
        contactId,
        currency: "INR",
        lines: [{ description: what, quantity: 1, unitPrice }],
        dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    await nw.post(`/invoices/${made.id}/issue`);
    const paid = await nw.post<Recorded>(`/invoices/${made.id}/payments`, {
        method: "CHEQUE",
        chequeNumber,
        chequeBank: "HDFC Bank",
    });
    return { id: made.id, paymentId: paid.recorded.paymentId };
}

/** The line on whichever layout is on screen. */
const chequesLine = (page: Page): Locator =>
    needsYou(page)
        .filter({ visible: true })
        .locator("[data-cheques-line]")
        .filter({ visible: true });

const said = (n: number) =>
    `${n} ${n === 1 ? "cheque" : "cheques"} not in the bank`;

test.describe("Home: cheques not in the bank (U18)", { tag: "@serial" }, () => {
    test("one line while cheques wait, opening the cheques list; gone once they are in the bank", async ({
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        await useSession(page);
        await page.goto(`/open/${NORTHWIND_ORG}`);
        const request = page.request;
        const nw = northwind(request);

        const s = stamp(testInfo);
        const contact = await makeContact(request, {
            firstName: "Ritu",
            lastName: `Cheque ${s}`,
            email: `cheques-${s}@example.com`,
        });
        const made: { id: string; paymentId: string }[] = [];
        try {
            made.push(
                await paidByCheque(
                    request,
                    contact.id,
                    `Shelving (${s})`,
                    "8400",
                    `00${s.slice(-4)}1`,
                ),
            );
            made.push(
                await paidByCheque(
                    request,
                    contact.id,
                    `Fitting (${s})`,
                    "5600",
                    `00${s.slice(-4)}2`,
                ),
            );

            // The API counts ours (and any a past run left waiting).
            const figure = await waiting(request);
            expect(figure, "the owner is sent the cheques").not.toBeNull();
            expect(figure?.count ?? 0).toBeGreaterThanOrEqual(2);
            expect(figure?.href).toBe("/billing/invoices?view=cheques");

            await page.goto("/");
            const line = chequesLine(page);
            await expect(line).toHaveCount(1);
            await expect(line).toContainText(said(figure?.count ?? 2));
            await expect(line).toContainText("₹");
            // Home never marks a cheque: the line only links.
            await expect(line.getByRole("button")).toHaveCount(0);
            const link = line.getByRole("link").first();
            await expect(link).toHaveAttribute(
                "href",
                "/billing/invoices?view=cheques",
            );
            await link.click();
            await expect(page).toHaveURL(/\/billing\/invoices\?view=cheques$/);

            // A Member holds no payment:read: no line, no figure.
            await useSession(page, "northwindMember");
            await page.goto(`/open/${NORTHWIND_ORG}`);
            expect(await waiting(page.request)).toBeNull();
            await page.goto("/");
            await expect(
                page.locator("[data-home-layout]").filter({ visible: true }),
            ).toBeVisible();
            await expect(page.locator("[data-cheques-line]")).toHaveCount(0);

            // In the bank, as the invoice marks it: the line is gone.
            await useSession(page);
            await page.goto(`/open/${NORTHWIND_ORG}`);
            for (const m of made) {
                await nw.post(
                    `/invoices/${m.id}/payments/${m.paymentId}/cleared`,
                );
            }
            const after = await waiting(request);
            await page.goto("/");
            await expect(
                page.locator("[data-home-layout]").filter({ visible: true }),
            ).toBeVisible();
            if (after) {
                // Cheques of a past run still wait: ours are out of it.
                await expect(chequesLine(page)).toContainText(
                    said(after.count),
                );
            } else {
                await expect(chequesLine(page)).toHaveCount(0);
            }
        } finally {
            await useSession(page);
            for (const m of made) {
                // A cheque still waiting is marked in the bank; then the
                // payment is removed and the invoice voided, so nothing of
                // the test's stays owed or paid on Northwind.
                await nw
                    .post(`/invoices/${m.id}/payments/${m.paymentId}/cleared`)
                    .catch(() => null);
                await nw.delete(`/invoices/${m.id}/payments/${m.paymentId}`);
                await request.post(
                    `${urls.API_URL}/organizations/${NORTHWIND_ORG}/invoices/${m.id}/void`,
                    {
                        headers: nw.headers,
                        data: { reason: "End of the cheques test" },
                    },
                );
            }
        }
    });
});
