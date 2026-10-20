// @covers accounts:/login app:/open app:/billing/invoices app:/billing/invoices/new app:/billing/invoices/[invoiceId] site:/pay/[token] api:invoices api:payments
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { cardAction, menuItem } from "../fixtures/invoice-actions";
import { makeContact, northwind, phone, stamp } from "../fixtures/own-data";
import { pressUntil } from "../fixtures/press";
import { onPhone } from "../fixtures/roles";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * The whole invoice journey in one test (DEC-173, U17 #1129), on Northwind
 * with its own contact and invoice:
 *
 * 1. a new invoice written on the paper, in Band;
 * 2. issued (its pay link copied) and shared on WhatsApp;
 * 3. ₹1,000 recorded in cash: the list's Owed drops by ₹1,000, and the
 *    customer's pay page says what is paid and what is left;
 * 4. the rest recorded by cheque: the cheques line appears;
 * 5. the cheque marked as in the bank: Paid;
 * 6. the receipt shared on WhatsApp.
 *
 * WhatsApp is click-to-chat: `window.open` is caught in the page, so the
 * test reads the `wa.me` address it would open and no tab opens. The money
 * strip and the cheques line are business-wide, so the journey is
 * `@serial`, and it never leaves a cheque waiting behind it. Desk and phone
 * run the same steps; on a phone the style rail is behind Style.
 */

interface InvoiceRead {
    id: string;
    number: string | null;
    status: string;
    leftToPay?: string;
    partlyPaid?: boolean;
    chequeWaiting?: boolean;
    paper?: { style: string; colour: string | null };
    payments?: {
        id: string;
        removed: { reason: string | null } | null;
        bankStatus: string | null;
    }[];
    shared?: { channel: string; kind: string }[];
}

/** The colour the journey's paper goes out in. */
const COLOUR = "#2F5D50";

const read = (page: Page, id: string) =>
    northwind(page.request).get<InvoiceRead>(`/invoices/${id}`);

/** Catches `window.open`, so the test reads where WhatsApp would open. */
async function catchOpens(page: Page) {
    await page.addInitScript(() => {
        const w = window as unknown as { __opened: string[] };
        w.__opened = [];
        window.open = () => {
            const tab = {
                opener: null as unknown,
                close: () => undefined,
                location: {
                    set href(v: string) {
                        w.__opened.push(v);
                    },
                    get href() {
                        return w.__opened.at(-1) ?? "about:blank";
                    },
                },
            };
            return tab as unknown as Window;
        };
    });
}

const opened = (page: Page) =>
    page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);

/** The message the last WhatsApp address carried. */
async function lastWhatsApp(page: Page): Promise<string> {
    await expect
        .poll(async () => (await opened(page)).at(-1) ?? "")
        .toMatch(/^https:\/\/wa\.me\/91\d+\?text=/);
    const url = (await opened(page)).at(-1) ?? "";
    return new URL(url).searchParams.get("text") ?? "";
}

/** The style rail: beside the paper on the desk, behind Style on a phone. */
async function styleRail(page: Page): Promise<Locator> {
    if (onPhone(page)) {
        await page.getByRole("button", { name: "Style", exact: true }).click();
        return page.getByRole("dialog", { name: "Style" });
    }
    return page.getByRole("complementary", { name: "Style" });
}

/** The money strip's Owed figure, in rupees. */
async function owed(page: Page): Promise<number> {
    await page.goto("/billing/invoices");
    const figure = page.locator('[data-figure="owed"]');
    await expect(figure).toContainText("Owed to you");
    await expect(figure).toContainText("₹");
    // The amount's own line: the figure's text runs its label, amount and
    // count together ("Owed to you₹1,18,50019 invoices"), so read from the
    // whole of it the count's digits joined the amount's.
    const text = await figure.locator(":scope > span").nth(1).innerText();
    const match = /^₹\s?([\d,]+(?:\.\d{1,2})?)$/.exec(text.trim());
    expect(match, text).toBeTruthy();
    return Number((match?.[1] ?? "0").replace(/,/g, ""));
}

async function openInvoice(page: Page, id: string) {
    await page.goto(`/billing/invoices/${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/\d{4}$/);
}

const shareSheet = (page: Page, number: string) =>
    page.getByRole("dialog", { name: `Share ${number}` });

/** The share sheet, from the money card's button or from Share. */
async function openShare(page: Page, number: string, button: string) {
    // Waited for, not counted: right after a payment the card is still the
    // one before it until the details are read again, and a count then
    // finds no button and goes to a menu that hasn't got it.
    const lead = cardAction(page, button);
    const inCard = await lead.waitFor({ timeout: 10_000 }).then(
        () => true,
        () => false,
    );
    if (inCard) {
        await pressUntil(lead, shareSheet(page, number));
    } else {
        const item = await menuItem(page, "Share", button);
        await item.click();
    }
    const sheet = shareSheet(page, number);
    await expect(sheet).toBeVisible();
    return sheet;
}

async function recordSheet(page: Page, button: string) {
    await page
        .getByRole("button", { name: button, exact: true })
        .filter({ visible: true })
        .first()
        .click();
    const sheet = page.getByRole("dialog", { name: "Record payment" });
    await expect(sheet).toBeVisible();
    return sheet;
}

test.describe("the invoice journey", { tag: "@serial" }, () => {
    test("write on the paper in Band, issue and share, take cash and a cheque, bank it, share the receipt", async ({
        page,
        context,
    }, testInfo) => {
        test.setTimeout(240_000);
        await context.grantPermissions(["clipboard-read", "clipboard-write"], {
            origin: new URL(urls.APP_URL).origin,
        });
        await catchOpens(page);
        await useSession(page);
        await page.goto(`/open/${NORTHWIND_ORG}`);

        const tag = stamp(testInfo);
        const who = await makeContact(page.request, {
            firstName: "Meera",
            lastName: `Journey ${tag}`,
            email: `inv-journey-${tag}@example.com`,
            phone: phone(),
        });
        const what = `Launch hamper ${tag}`;
        let id = "";

        try {
            // 1. Written on the paper, in Band.
            await page.goto(
                `/billing/invoices/new?mode=paper&contactId=${who.id}`,
            );
            const named = "The invoice: press a part to change it";
            await expect(
                page.getByRole("article", { name: named }),
            ).toBeVisible();
            // Read as the eye sees it from here: an editor or the phone's
            // Style sheet is modal and takes the rest of the page out of the
            // accessibility tree, while the paper stays on screen.
            const paper = page.getByRole("article", {
                name: named,
                includeHidden: true,
            });
            await pressUntil(
                page.getByRole("button", { name: /^Add a line/ }),
                page.getByRole("dialog", { name: "Add a line" }),
            );
            await page
                .getByRole("dialog", { name: "Add a line" })
                .getByRole("combobox")
                .fill(what);
            await page.getByRole("option", { name: /as a new line/ }).click();
            const editor = page.getByRole("dialog").last();
            await editor.getByLabel("Price each").fill("2500");
            await editor.getByRole("button", { name: "Done" }).click();
            await expect(paper).toContainText(what);
            // Saved as it is written: the draft has its own address.
            await expect(page).toHaveURL(
                /\/billing\/invoices\/[^/]+\/edit\?mode=paper$/,
                { timeout: 15_000 },
            );
            id =
                /\/billing\/invoices\/([^/]+)\/edit/.exec(page.url())?.[1] ??
                "";
            expect(id).toBeTruthy();

            const rail = await styleRail(page);
            await rail.getByRole("radio", { name: /^Band/ }).click();
            await rail.getByRole("radio", { name: `Colour ${COLOUR}` }).click();
            await expect(paper).toHaveAttribute("data-style", "BAND");
            await expect(paper.locator("[data-band]")).toHaveCSS(
                "background-color",
                "rgb(47, 93, 80)",
            );
            if (onPhone(page)) {
                await page.getByRole("button", { name: "Done" }).click();
            }
            await expect
                .poll(async () => (await read(page, id)).status)
                .toBe("DRAFT");

            // 2. Issued with its pay link copied, then shared on WhatsApp.
            await page
                .getByRole("button", { name: /^Issue (and share|it)$/ })
                .filter({ visible: true })
                .first()
                .click();
            await page.waitForURL(new RegExp(`/billing/invoices/${id}$`), {
                timeout: 30_000,
            });
            const heading = page.getByRole("heading", { level: 1 });
            await expect(heading).toHaveText(/\d{4}$/);
            const number = (await heading.innerText()).trim();
            const issued = await read(page, id);
            expect(issued.status).toBe("ISSUED");
            // The look it went out in is frozen on the paper.
            expect(issued.paper).toEqual({ style: "BAND", colour: COLOUR });
            const link = await page.evaluate(() =>
                navigator.clipboard.readText(),
            );
            expect(link).toMatch(/\/pay\/[^/]+$/);

            const share = await openShare(page, number, "Share on WhatsApp");
            await expect(share).toContainText("₹2,500");
            await share.getByRole("button", { name: "Open WhatsApp" }).click();
            await expect(share).toBeHidden();
            const sent = await lastWhatsApp(page);
            expect(sent).toContain("Hi Meera");
            expect(sent).toContain(number);
            // The message carries a link of its own: a link is shown only
            // once, so sharing makes a new one and the one copied at issue
            // stops working. The customer opens the one they were sent.
            const shared = /https?:\/\/\S+\/pay\/[\w-]+/.exec(sent)?.[0] ?? "";
            expect(shared).not.toBe("");
            expect(shared).not.toBe(link);
            await expect
                .poll(async () =>
                    ((await read(page, id)).shared ?? []).some(
                        (s) => s.channel === "WHATSAPP",
                    ),
                )
                .toBe(true);

            // 3. ₹1,000 in cash: Owed drops by ₹1,000.
            const owedBefore = await owed(page);
            await openInvoice(page, id);
            const cash = await recordSheet(page, "Record payment");
            await cash.getByLabel("Amount received").fill("1000");
            await cash.getByRole("radio", { name: "Cash" }).click();
            await cash.getByRole("button", { name: "Record ₹1,000" }).click();
            await expect(cash).toBeHidden();
            await expect(
                page
                    .getByText(`₹1,000 recorded on ${number}. ₹1,500 left.`)
                    .first(),
            ).toBeVisible();
            await expect(
                page.getByText("Partly paid", { exact: true }).first(),
            ).toBeVisible();
            await expect
                .poll(async () => (await read(page, id)).leftToPay)
                .toBe("1500.00");
            await expect
                .poll(async () => owedBefore - (await owed(page)), {
                    timeout: 20_000,
                })
                .toBe(1_000);

            // The customer's pay page says what is paid and what is left.
            const customer = await context.newPage();
            await customer.goto(
                new URL(new URL(shared).pathname, urls.RENDERER_URL).toString(),
            );
            await expect(
                customer.getByRole("heading", { name: `Invoice ${number}` }),
            ).toBeVisible();
            await expect(customer.getByText("Paid so far")).toBeVisible();
            await expect(customer.getByText("Left to pay")).toBeVisible();
            await expect(customer.getByText("₹1,500").first()).toBeVisible();
            await customer.close();

            // 4. The rest by cheque: the cheques line appears.
            const no = `00${String(Date.now()).slice(-4)}`;
            await openInvoice(page, id);
            const cheque = await recordSheet(page, "Record the rest");
            await expect(cheque.getByLabel("Amount received")).toHaveValue(
                "1500",
            );
            await cheque.getByRole("radio", { name: "Cheque" }).click();
            await cheque.getByLabel("Cheque no.").fill(no);
            await cheque
                .getByRole("textbox", { name: /^Bank/ })
                .fill("HDFC Bank");
            await cheque.getByRole("button", { name: "Record ₹1,500" }).click();
            await expect(cheque).toBeHidden();
            await expect(
                page
                    .getByText(
                        `Cheque for ₹1,500 recorded on ${number}. Not in the bank yet.`,
                    )
                    .first(),
            ).toBeVisible();
            await expect(
                page
                    .getByText("Paid · cheque not in the bank", { exact: true })
                    .first(),
            ).toBeVisible();
            await page.goto("/billing/invoices");
            const chequesLine = page.locator("[data-cheques-line]");
            await expect(chequesLine).toContainText("Cheques not in the bank");
            await expect(chequesLine).toContainText("₹");
            // A waiting cheque counts as received: nothing of it is owed.
            await expect
                .poll(async () => owedBefore - (await owed(page)), {
                    timeout: 20_000,
                })
                .toBe(2_500);

            // 5. In the bank: Paid.
            await openInvoice(page, id);
            await page
                .getByRole("button", { name: "Mark as in the bank" })
                .filter({ visible: true })
                .first()
                .click();
            const cleared = page.getByRole("dialog", {
                name: `Cheque ${no} is in the bank`,
            });
            await expect(cleared).toContainText("₹1,500 from");
            await cleared
                .getByRole("button", { name: "Mark as in the bank" })
                .click();
            await expect(cleared).toBeHidden();
            await expect(
                page.getByText(`Cheque ${no} is in the bank.`).first(),
            ).toBeVisible();
            await expect
                .poll(async () => {
                    const now = await read(page, id);
                    return `${now.status} ${String(now.chequeWaiting ?? false)}`;
                })
                .toBe("PAID false");
            await expect(
                page.getByText("Paid", { exact: true }).first(),
            ).toBeVisible();

            // 6. The receipt, shared on WhatsApp.
            const receipt = await openShare(page, number, "Share receipt");
            await expect(receipt.locator("[data-preview]")).toContainText(
                "It is now paid in full.",
            );
            await receipt
                .getByRole("button", { name: "Open WhatsApp" })
                .click();
            await expect(receipt).toBeHidden();
            const thanks = await lastWhatsApp(page);
            expect(thanks).toContain(
                `Thank you for your payment of ₹1,500 by cheque for invoice ${number}.`,
            );
            await expect
                .poll(async () =>
                    ((await read(page, id)).shared ?? []).some(
                        (s) => s.channel === "WHATSAPP" && s.kind === "RECEIPT",
                    ),
                )
                .toBe(true);
        } finally {
            if (id) await clearAnyWaiting(page, id);
        }
    });
});

/** Never leave a cheque waiting for the next test: in the bank, even after a failure. */
async function clearAnyWaiting(page: Page, invoiceId: string) {
    const nw = northwind(page.request);
    const res = await page.request.get(
        `${urls.API_URL}/organizations/${NORTHWIND_ORG}/invoices/${invoiceId}`,
        { headers: nw.headers, failOnStatusCode: false },
    );
    if (!res.ok()) return;
    const now = (await res.json()) as InvoiceRead;
    for (const p of now.payments ?? []) {
        if (p.removed || p.bankStatus !== "WAITING") continue;
        await page.request.post(
            `${urls.API_URL}/organizations/${NORTHWIND_ORG}/invoices/${invoiceId}/payments/${p.id}/cleared`,
            { headers: nw.headers, data: {}, failOnStatusCode: false },
        );
    }
}
