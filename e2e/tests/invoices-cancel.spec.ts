// @covers app:/billing/invoices app:/billing/invoices/[invoiceId] api:invoices
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { makeBusiness } from "../fixtures/own-business";
import { makeContact, northwind, stamp } from "../fixtures/own-data";
import { onPhone } from "../fixtures/roles";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * Cancel or correct (DEC-173, U13 #1125, INVCancelA and INVCancelAPhone):
 * every path of the old Cancel invoice dialog, once each, in the one sheet.
 *
 * - GST-registered, on a business of this test's own (Asha's, registered
 *   here, so nothing another spec reads changes): Cancel all of it, with
 *   the reason asked for on the press and the credit note shown first;
 *   then Cancel and write a correct one, which opens the draft.
 * - Not registered, on Northwind with this test's own contact and
 *   invoices: Void it, then Write again on the void one; and Void and
 *   write again.
 * - A partly paid invoice is refused, and says why.
 *
 * Desk and phone run the same steps. On a phone the sheet is the screen
 * and "Keep invoice" sits under the destructive button; at a desk it sits
 * to its left. Issued invoices are never deleted, so each is the test's own.
 */

const GSTIN = "06ABCDE1234N1ZN";
const DAY = 86_400_000;

/** A business's API as the signed-in person; writes carry an Origin (#50). */
function api(request: APIRequestContext, org: string) {
    const headers = { "x-organization-id": org, origin: urls.APP_URL };
    const url = (path: string) => `${urls.API_URL}/organizations/${org}${path}`;
    return {
        post: async <T>(path: string, data: unknown = {}): Promise<T> => {
            const res = await request.post(url(path), { headers, data });
            expect(res.ok(), `${res.url()}: ${await res.text()}`).toBe(true);
            return (await res.json()) as T;
        },
        patch: async (path: string, data: unknown) => {
            const res = await request.patch(
                path === ""
                    ? `${urls.API_URL}/organizations/${org}`
                    : url(path),
                { headers, data },
            );
            expect(res.ok(), `${res.url()}: ${await res.text()}`).toBe(true);
        },
    };
}

/** What writes a business's invoices: `api` here, or `northwind`. */
interface Poster {
    post: <T>(path: string, data?: unknown) => Promise<T>;
}

/** A draft for `contactId`, issued: one line, due in a week. */
async function issuedInvoice(
    biz: Poster,
    contactId: string,
    what: string,
    registered: boolean,
): Promise<{ id: string; number: string }> {
    const draft = await biz.post<{ id: string }>("/invoices", {
        contactId,
        currency: "INR",
        lines: [
            {
                description: what,
                quantity: 1,
                unitPrice: "1000",
                ...(registered ? { gstRate: "18", hsnSac: "9983" } : {}),
            },
        ],
        dueAt: new Date(Date.now() + 7 * DAY).toISOString(),
    });
    const issued = await biz.post<{ number: string }>(
        `/invoices/${draft.id}/issue`,
    );
    return { id: draft.id, number: issued.number };
}

/** The page's own action, drawn once per layout: the one on screen. */
const action = (page: Page, name: string) =>
    page
        .getByRole("button", { name, exact: true })
        .filter({ visible: true })
        .first();

/**
 * Open "Cancel or correct" from the invoice: a button on today's page, or
 * an item in More on the details view (U9). Answers the control pressed,
 * or null when it is off — it then says why beside it.
 */
async function openCancel(page: Page): Promise<Locator | null> {
    const direct = action(page, "Cancel or correct");
    if (await direct.isVisible().catch(() => false)) {
        if (await direct.isDisabled()) return null;
        await direct.click();
        return direct;
    }
    await action(page, "More").click();
    const item = page.getByRole("menuitem", { name: /^Cancel or correct/ });
    if ((await item.getAttribute("aria-disabled")) === "true") return null;
    await item.click();
    return item;
}

const sheetOf = (page: Page, number: string) =>
    page.getByRole("dialog", { name: `Cancel or correct ${number}` });

/** Keep invoice is quiet and first: left at a desk, under it on a phone. */
async function expectFoot(page: Page, sheet: Locator, main: RegExp | string) {
    const keep = sheet.getByRole("button", { name: "Keep invoice" });
    const go = sheet.getByRole("button", { name: main });
    await expect(keep).toBeVisible();
    await expect(go).toBeVisible();
    const [k, g] = [await keep.boundingBox(), await go.boundingBox()];
    expect(k && g).toBeTruthy();
    if (!k || !g) return;
    if (onPhone(page)) {
        expect(k.y).toBeGreaterThan(g.y);
        // The sheet is the screen.
        const box = await sheet.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(
            (page.viewportSize()?.width ?? 390) - 1,
        );
    } else {
        expect(k.x).toBeLessThan(g.x);
    }
}

async function openInvoice(page: Page, org: string, id: string) {
    await page.goto(`/open/${org}`);
    await page.goto(`/billing/invoices/${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/\d{4}$/);
}

test.describe("Cancel or correct", () => {
    test("GST-registered: Cancel all of it, then Cancel and write a correct one", async ({
        page,
    }, testInfo) => {
        test.setTimeout(150_000);
        const own = await makeBusiness(page, testInfo, "cancel");
        const biz = api(page.request, own.id);
        // Registered for GST, with the address a registration needs.
        await biz.patch("", {
            tax: { registered: true, state: "06" },
            profile: { taxId: GSTIN, country: "IN" },
            registeredAddress: {
                line1: "Plot 14, Sector 44",
                line2: "",
                city: "Gurugram",
                postalCode: "122001",
            },
        });
        const s = stamp(testInfo);
        const contact = await biz.post<{ id: string }>("/contacts", {
            firstName: "Vivek",
            lastName: `Nair ${s}`,
            email: `inv-cancel-${s}@example.com`,
        });
        const first = await issuedInvoice(
            biz,
            contact.id,
            `Trade bread (${s})`,
            true,
        );

        // 1. Cancel all of it.
        await openInvoice(page, own.id, first.id);
        expect(await openCancel(page)).not.toBeNull();
        const sheet = sheetOf(page, first.number);
        await expect(sheet).toBeVisible();
        await expect(sheet).toContainText(`Nair ${s} · not paid`);
        await expect(
            sheet.getByRole("radio", { name: /Cancel all of it/ }),
        ).toBeChecked();
        await expect(sheet).not.toContainText("Take some off");
        // The credit note is shown before it is made.
        const preview = sheet.getByText(/^Credit note · /);
        await expect(preview).toBeVisible();
        const noteNumber = (await preview.innerText())
            .replace(/^Credit note · /, "")
            .trim();
        expect(noteNumber).toMatch(/CN/);
        await expect(sheet).toContainText(`Against ${first.number}`);
        const issue = /^Issue credit note ₹/;
        await expectFoot(page, sheet, issue);

        // A missing reason is said on the press, with the keyboard on Why.
        await sheet.getByRole("button", { name: issue }).click();
        await expect(
            sheet.getByText("Say why it is being cancelled."),
        ).toBeVisible();
        const why = sheet.getByLabel("Why", { exact: true });
        await expect(why).toBeFocused();
        await why.fill("Wrong amount");
        await sheet.getByRole("button", { name: issue }).click();
        await expect(sheet).toBeHidden({ timeout: 30_000 });
        await expect(
            page
                .getByText(
                    `${first.number} cancelled with credit note ${noteNumber}.`,
                )
                .first(),
        ).toBeVisible();
        await expect(page.getByText("Cancelled").first()).toBeVisible();
        // The credit note sits in the list, under the invoice it cancels.
        await page.goto("/billing/invoices");
        await expect(page.getByText(noteNumber).first()).toBeVisible();

        // 2. Cancel and write a correct one: the draft opens, same lines.
        const second = await issuedInvoice(
            biz,
            contact.id,
            `Croissant trays (${s})`,
            true,
        );
        await openInvoice(page, own.id, second.id);
        expect(await openCancel(page)).not.toBeNull();
        const again = sheetOf(page, second.number);
        await again
            .getByRole("radio", { name: /Cancel and write a correct one/ })
            .click();
        await again.getByLabel("Why", { exact: true }).fill("Wrong person");
        await again.getByRole("button", { name: issue }).click();
        await page.waitForURL(/\/billing\/invoices\/[^/]+\/edit$/, {
            timeout: 30_000,
        });
        await expect(
            page.getByText("A corrected draft is open.").first(),
        ).toBeVisible();
        await expect(page.getByLabel("Line 1: what it's for")).toHaveValue(
            `Croissant trays (${s})`,
        );
    });

    test("not registered: Void it and Write again; Void and write again", async ({
        page,
    }, testInfo) => {
        test.setTimeout(150_000);
        await useSession(page);
        await page.goto(`/open/${NORTHWIND_ORG}`);
        const nw = northwind(page.request);
        const biz: Poster = { post: (path, data) => nw.post(path, data) };
        const s = stamp(testInfo);
        const contact = await makeContact(page.request, {
            firstName: "Sana",
            lastName: `Void ${s}`,
            email: `inv-void-${s}@example.com`,
        });

        // 1. Void it.
        const first = await issuedInvoice(
            biz,
            contact.id,
            `Shelving (${s})`,
            false,
        );
        await openInvoice(page, NORTHWIND_ORG, first.id);
        expect(await openCancel(page)).not.toBeNull();
        const sheet = sheetOf(page, first.number);
        await expect(
            sheet.getByRole("radio", { name: /^Void it/ }),
        ).toBeChecked();
        await expect(sheet).not.toContainText("The credit note");
        await expectFoot(page, sheet, "Void invoice");
        await sheet.getByRole("button", { name: "Void invoice" }).click();
        await expect(
            sheet.getByText("Say why it is being voided."),
        ).toBeVisible();
        await sheet.getByLabel("Why", { exact: true }).fill("Typo");
        await sheet.getByRole("button", { name: "Void invoice" }).click();
        await expect(sheet).toBeHidden({ timeout: 30_000 });
        await expect(
            page.getByText(`${first.number} voided.`).first(),
        ).toBeVisible();

        // 2. Write again on the void one: a draft with its lines opens.
        const write = action(page, "Write again");
        if (!(await write.isVisible().catch(() => false))) {
            await action(page, "More").click();
            await page.getByRole("menuitem", { name: "Write again" }).click();
        } else {
            await write.click();
        }
        await page.waitForURL(/\/billing\/invoices\/[^/]+\/edit$/, {
            timeout: 30_000,
        });
        await expect(page.getByLabel("Line 1: what it's for")).toHaveValue(
            `Shelving (${s})`,
        );

        // 3. Void and write again, in one press.
        const second = await issuedInvoice(
            biz,
            contact.id,
            `Bins (${s})`,
            false,
        );
        await openInvoice(page, NORTHWIND_ORG, second.id);
        expect(await openCancel(page)).not.toBeNull();
        const again = sheetOf(page, second.number);
        await again
            .getByRole("radio", { name: /Void and write again/ })
            .click();
        await again.getByLabel("Why", { exact: true }).fill("Wrong person");
        await again
            .getByRole("button", { name: "Void and write again" })
            .click();
        await page.waitForURL(/\/billing\/invoices\/[^/]+\/edit$/, {
            timeout: 30_000,
        });
        await expect(page.getByLabel("Line 1: what it's for")).toHaveValue(
            `Bins (${s})`,
        );
    });

    test("a partly paid invoice can't be cancelled, and says why", async ({
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        await useSession(page);
        await page.goto(`/open/${NORTHWIND_ORG}`);
        const nw = northwind(page.request);
        const s = stamp(testInfo);
        const contact = await makeContact(page.request, {
            firstName: "Kiran",
            lastName: `Part ${s}`,
            email: `inv-part-${s}@example.com`,
        });
        const inv = await issuedInvoice(
            { post: (path, data) => nw.post(path, data) },
            contact.id,
            `Racks (${s})`,
            false,
        );
        await nw.post(`/invoices/${inv.id}/payments`, {
            method: "CASH",
            amount: "100",
        });

        await openInvoice(page, NORTHWIND_ORG, inv.id);
        const why =
            "Part of this invoice is paid. Remove its payments before cancelling it.";
        const opened = await openCancel(page);
        if (opened === null) {
            // The details view (U9) says it before anyone presses.
            await expect(page.getByText(why).first()).toBeVisible();
            return;
        }
        const sheet = sheetOf(page, inv.number);
        await expect(sheet).toContainText("Part of this invoice is paid");
        await expect(sheet).toContainText("remove its payments first");
        await expect(sheet).toContainText(why);
        await expect(sheet.getByRole("radiogroup")).toHaveCount(0);
        await expect(
            sheet.getByRole("button", { name: "Void invoice" }),
        ).toBeDisabled();
        await sheet.getByRole("button", { name: "Keep invoice" }).click();
        await expect(sheet).toBeHidden();
        // Nothing changed: still owed.
        await expect(page.getByText("Cancelled")).toHaveCount(0);
    });
});
