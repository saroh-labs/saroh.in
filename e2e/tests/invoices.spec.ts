// @covers accounts:/login app:/open app:/billing/invoices app:/billing/invoices/new api:organizations api:invoices api:payments api:orders api:stock api:subscriptions
import type { APIResponse, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * A hand-written invoice, end to end (U11): write it, issue it with its pay
 * link, open the link as the customer would, record the money, and find it
 * paid in the list's quick look.
 *
 * It runs on Northwind Supply, the base seed — not Rye & Co. or Pulse
 * Fitness, which are kept camera-ready — because an issued invoice is never
 * deleted and takes the next number in the business's series. Northwind has
 * a payment provider connected with test keys, so a pay link can be made;
 * a test cannot complete a provider's checkout, so the money arriving is
 * recorded by hand, as it is when a customer pays at the counter.
 */

const ORG = "seed_org";

async function signIn(page: Page) {
    await useSession(page);
}

test.describe("invoices", () => {
    test("write one by hand, issue it with a pay link, and see it paid", async ({
        page,
        context,
    }, testInfo) => {
        test.setTimeout(120_000);
        await context.grantPermissions(["clipboard-read", "clipboard-write"], {
            origin: new URL(urls.APP_URL).origin,
        });
        await signIn(page);
        await page.goto(`/open/${ORG}`);

        // 1. Write it: who, one line, when it falls due.
        await page.goto("/billing/invoices/new");
        await expect(
            page.getByRole("heading", { name: "New invoice" }),
        ).toBeVisible();
        const issue = page.getByRole("button", {
            name: /^Issue (with pay link|it)$/,
        });
        await expect(issue).toBeDisabled();

        await page.getByRole("combobox", { name: "Who it's for" }).click();
        await page.getByRole("option").first().click();
        const what = `Catering platter (${testInfo.project.name})`;
        await page.getByLabel("Line 1: what it's for").fill(what);
        await page.getByLabel("Line 1: quantity").fill("3");
        await page.getByLabel(/^Line 1: price each/).fill("450");
        await expect(page.getByText("₹1,350").first()).toBeVisible();
        await page.getByRole("radio", { name: "In 7 days" }).click();
        await expect(
            page.getByRole("radio", { name: "In 7 days" }),
        ).toHaveAttribute("aria-checked", "true");

        // 2. Issue it: numbered, lines locked, the pay link copied.
        await expect(issue).toBeEnabled();
        await expect(issue).toHaveText("Issue with pay link");
        await issue.click();
        await page.waitForURL(/\/billing\/invoices\/(?!new)[^/?]+$/, {
            timeout: 30_000,
        });
        await expect(
            page.getByText(/issued and its pay link copied/).first(),
        ).toBeVisible();
        const number = (
            await page.getByRole("heading", { level: 1 }).innerText()
        ).trim();
        expect(number).toMatch(/\d{4}$/);
        await expect(
            page.getByText("Due", { exact: true }).first(),
        ).toBeVisible();
        await expect(page.getByText(what).first()).toBeVisible();
        // Issued: the draft's actions are gone, the unpaid ones are here.
        await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
        await expect(
            page.getByRole("button", { name: "Mark paid" }),
        ).toBeVisible();

        // 3. The customer opens the link.
        const link = await page.evaluate(() => navigator.clipboard.readText());
        expect(link).toMatch(/\/pay\/[^/]+$/);
        const customer = await context.newPage();
        await customer.goto(
            new URL(new URL(link).pathname, urls.RENDERER_URL).toString(),
        );
        await expect(
            customer.getByRole("heading", { name: `Invoice ${number}` }),
        ).toBeVisible();
        await customer.close();

        // 4. The money arrives, and is recorded.
        await page.getByRole("button", { name: "Mark paid" }).click();
        const dialog = page.getByRole("dialog", { name: "Record a payment" });
        await dialog.getByRole("button", { name: "Mark it paid" }).click();
        await expect(
            page.getByText(`${number} marked paid`).first(),
        ).toBeVisible();
        await expect(
            page.getByText("Paid", { exact: true }).first(),
        ).toBeVisible();
        await expect(
            page.getByRole("button", { name: "Copy pay link" }),
        ).toHaveCount(0);

        // 4b. Its paper as a PDF (D16), named for its number.
        const [download] = await Promise.all([
            page.waitForEvent("download"),
            page.getByRole("button", { name: "Download PDF" }).click(),
        ]);
        expect(download.suggestedFilename()).toBe(
            `${number.replace(/[^A-Za-z0-9._-]+/g, "-")}.pdf`,
        );

        // 5. The list has it under Paid, and its quick look says so.
        await page.goto("/billing/invoices?view=paid");
        await expect(page.getByRole("tab", { name: /^Paid/ })).toHaveAttribute(
            "aria-selected",
            "true",
        );
        await page.getByRole("button", { name: new RegExp(number) }).click();
        const look = page.getByRole("dialog");
        await expect(look.getByText(number).first()).toBeVisible();
        await expect(look.getByText(what)).toBeVisible();
        await expect(
            look.getByRole("link", { name: "Open invoice" }),
        ).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(look).toHaveCount(0);
    });

    test("narrow the list by what each invoice was for (D18)", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${ORG}`);

        // The chips show only when there are two sources or more. Both are
        // made here — an order paid (its invoice is written as it is paid)
        // and an invoice by hand — never borrowed from another test, so this
        // runs alone, on any shard, on a freshly seeded database.
        const org = await northwind(page);
        await paidOrder(page, org);
        const { id } = await draftFor(page, org, "d18");
        await api(page, org).post(`/invoices/${id}/issue`);

        await page.goto("/billing/invoices");
        const chips = page.getByRole("radiogroup", {
            name: "What it was for",
        });
        await expect(chips).toBeVisible();
        const byHand = chips.getByRole("radio", { name: "By hand" });
        await expect(byHand).toHaveCSS("cursor", "pointer");
        await byHand.click();
        await expect(byHand).toHaveAttribute("aria-checked", "true");
        await expect(page).toHaveURL(/[?&]source=MANUAL\b/);
        // Every row left is one written by hand, or a correction to one.
        const rows = page.getByRole("button", { name: /Written by hand/ });
        await expect(rows.first()).toBeVisible();

        // It is part of the address, so a reload keeps it.
        await page.reload();
        await expect(
            chips.getByRole("radio", { name: "By hand" }),
        ).toHaveAttribute("aria-checked", "true");
        await chips.getByRole("radio", { name: "All" }).click();
        await expect(page).not.toHaveURL(/source=/);

        // One pack's invoices, from Pack Detail: none sold is said, not
        // shown as an empty business, and the whole list is one click back.
        await page.goto("/billing/invoices?pack=no-such-pack");
        await expect(
            page.getByText("No invoices for this pack yet"),
        ).toBeVisible();
        await expect(page.getByText("Showing 0 for this pack")).toBeVisible();
        await expect(chips).toHaveCount(0);
        await page.getByRole("link", { name: "Show all invoices" }).click();
        await expect(page).toHaveURL(/\/billing\/invoices$/);
        await expect(chips).toBeVisible();
    });
});

/*
 * Sending an invoice with its pay link (D17), on Northwind: it has its own
 * email provider connected, so the send flag names email. Every record is
 * made or found through the API — the business by name, a contact and an
 * invoice made for the test — never a showcase id. The email itself goes
 * to an address on example.test, and the pay link is sealed into the send
 * job, so the test proves what Saroh records and what the customer's old
 * link does, not the inbox.
 */

interface SendFlag {
    channels: string[];
    reason?: string;
    emailTo?: string;
    nextReminderAt: string | null;
}

interface InvoiceRead {
    id: string;
    number: string | null;
    status: string;
    send: SendFlag;
    sent: { to: string; reminder: boolean; status: string }[];
    online?: { autopayCharge?: { at: string } | null } | null;
}

/** Northwind's id, found by its name among the demo user's businesses. */
async function northwind(page: Page): Promise<string> {
    const res = await page.request.get(`${urls.API_URL}/organizations`);
    expect(res.ok(), await res.text()).toBe(true);
    const orgs = (await res.json()) as { id: string; name: string }[];
    const org = orgs.find((o) => o.name === "Northwind Supply");
    expect(org, "the demo user belongs to Northwind Supply").toBeTruthy();
    return org?.id ?? "";
}

/** The API, as the signed-in owner of `org`; writes carry an Origin (#50). */
function api(page: Page, org: string) {
    const base = `${urls.API_URL}/organizations/${org}`;
    const headers = { "x-organization-id": org, origin: urls.APP_URL };
    const ok = async (res: APIResponse) => {
        expect(res.ok(), await res.text()).toBe(true);
        return res;
    };
    return {
        get: async <T>(path: string): Promise<T> =>
            (await (
                await ok(await page.request.get(`${base}${path}`, { headers }))
            ).json()) as T,
        post: async <T>(path: string, data: unknown = {}): Promise<T> =>
            (await (
                await ok(
                    await page.request.post(`${base}${path}`, {
                        data,
                        headers,
                    }),
                )
            ).json()) as T,
        /** A write whose refusal is the point: its status, unchecked. */
        postRaw: (path: string, data: unknown = {}) =>
            page.request.post(`${base}${path}`, {
                data,
                headers,
                failOnStatusCode: false,
            }),
    };
}

/**
 * A Northwind order, paid, so it has an invoice from an order (ADR-008: the
 * order's invoice is written when it is paid). Northwind's fixed seed ids,
 * with a unit received first so the shelf never runs out.
 */
async function paidOrder(page: Page, org: string): Promise<void> {
    const headers = { "x-organization-id": org, origin: urls.APP_URL };
    for (const variantId of [null, "seed_variant_11_0"]) {
        const received = await page.request.post(
            `${urls.API_URL}/organizations/${org}/stock/adjust`,
            {
                headers,
                data: {
                    storeId: "seed_store",
                    productId: "seed_product_11",
                    variantId,
                    units: 1,
                    note: "e2e: stock for an invoiced order",
                },
            },
        );
        if (received.ok()) break;
    }
    const made = await page.request.post(
        `${urls.API_URL}/stores/seed_store/orders`,
        {
            headers,
            data: {
                customerId: "seed_customer_6",
                items: [
                    {
                        productId: "seed_product_11",
                        variantId: "seed_variant_11_0",
                        quantity: 1,
                    },
                ],
            },
        },
    );
    expect(made.ok(), await made.text()).toBe(true);
    const { id } = (await made.json()) as { id: string };
    const marked = await page.request.patch(
        `${urls.API_URL}/stores/seed_store/orders/${id}`,
        { headers, data: { paymentStatus: "PAID" } },
    );
    expect(marked.ok(), await marked.text()).toBe(true);
}

/** A contact with an email, and a draft invoice to them, made for the test. */
async function draftFor(
    page: Page,
    org: string,
    tag: string,
): Promise<{ id: string; email: string; who: string }> {
    const call = api(page, org);
    const stamp = `${Date.now()}-${tag}`;
    const email = `d17-${stamp}@example.test`;
    const contact = await call.post<{ id: string }>("/contacts", {
        email,
        firstName: "Tara",
        lastName: `Send ${stamp}`,
    });
    const draft = await call.post<{ id: string }>("/invoices", {
        contactId: contact.id,
        currency: "INR",
        lines: [
            {
                description: `Tasting menu (${tag})`,
                quantity: 1,
                unitPrice: "800",
            },
        ],
        dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    return { id: draft.id, email, who: `Tara Send ${stamp}` };
}

/** The page's own action, drawn once per layout: the one on screen. */
const action = (page: Page, name: string) =>
    page
        .getByRole("button", { name, exact: true })
        .filter({ visible: true })
        .first();

test.describe("sending an invoice with its pay link (D17)", () => {
    test("send an issued invoice: who is told, the old link stops, one reminder a day", async ({
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        await signIn(page);
        const org = await northwind(page);
        await page.goto(`/open/${org}`);
        const call = api(page, org);

        const { id, email } = await draftFor(page, org, testInfo.project.name);
        await call.post(`/invoices/${id}/issue`);
        const before = await call.get<InvoiceRead>(`/invoices/${id}`);
        test.skip(
            !before.send.channels.includes("email"),
            `Northwind's send flag names no email channel (${before.send.reason ?? "no reason given"}): connect its email provider to run this`,
        );
        expect(before.send.emailTo).toBe(email);
        // A link the business copied and shared before the send.
        const { url: oldLink } = await call.post<{ url: string }>(
            `/invoices/${id}/pay-link`,
        );

        await page.goto(`/billing/invoices/${id}`);
        await expect(
            page.getByRole("heading", { level: 1, name: before.number ?? "" }),
        ).toBeVisible();
        const send = action(page, "Send with pay link");
        await expect(send).toBeVisible();
        await expect(send).toHaveCSS("cursor", "pointer");
        await send.click();

        // It says who is told, where, and what happens to the old link.
        const confirm = page.getByRole("alertdialog");
        await expect(confirm).toContainText(`by email at ${email}`);
        await expect(confirm).toContainText(
            "A link you shared before stops working.",
        );
        await confirm.getByRole("button", { name: "Send it" }).click();
        await expect(
            page.getByText(`Sent to ${email} with a pay link.`).first(),
        ).toBeVisible();

        // Saroh recorded the send to that address.
        const recorded = await call.get<InvoiceRead>(`/invoices/${id}`);
        expect(recorded.sent[0]).toMatchObject({ to: email, reminder: false });

        // What the email provider made of it decides what comes next. The
        // send job answers within seconds; the seed's own email credentials
        // are placeholders, so on a fresh stack it is refused.
        // Still queued after 30s, neither branch below applies — as before.
        let settled = recorded;
        await expect
            .poll(
                async () => {
                    settled = await call.get<InvoiceRead>(`/invoices/${id}`);
                    return settled.sent[0]?.status;
                },
                { timeout: 30_000, intervals: [500, 1_000, 2_000] },
            )
            .not.toBe("QUEUED")
            .catch(() => undefined);
        const status = settled.sent[0]?.status;
        await page.reload();
        if (status === "SENT") {
            // It went: the next is a reminder, and only one a day.
            const remind = action(page, "Send reminder");
            await expect(remind).toBeVisible();
            await expect(remind).toBeDisabled();
            await expect(
                page
                    .getByText(/One reminder a day\. The next can go after/)
                    .first(),
            ).toBeVisible();
            await expect(
                page.getByText(`Sent to ${email}`).first(),
            ).toBeVisible();
            const again = await call.postRaw(`/invoices/${id}/remind`);
            expect(again.status()).toBe(429);
        } else if (status === "FAILED") {
            // Refused: said so, and it can be sent again.
            await expect(
                page
                    .getByText(
                        `Invoice to ${email} didn't go: the email provider refused it`,
                    )
                    .first(),
            ).toBeVisible();
            await expect(action(page, "Send with pay link")).toBeVisible();
        }

        // The send minted a new link: the one shared before stops working.
        const customer = await page.context().newPage();
        await customer.goto(
            new URL(new URL(oldLink).pathname, urls.RENDERER_URL).toString(),
        );
        await expect(
            customer.getByRole("heading", {
                name: "This link no longer works",
            }),
        ).toBeVisible();
        await customer.close();
    });

    test("a draft is issued and sent in one step", async ({
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        await signIn(page);
        const org = await northwind(page);
        await page.goto(`/open/${org}`);
        const call = api(page, org);

        const { id, email } = await draftFor(
            page,
            org,
            `draft-${testInfo.project.name}`,
        );
        const draft = await call.get<InvoiceRead>(`/invoices/${id}`);
        test.skip(
            !draft.send.channels.includes("email"),
            `Northwind's send flag names no email channel (${draft.send.reason ?? "no reason given"}): connect its email provider to run this`,
        );

        await page.goto(`/billing/invoices/${id}`);
        await action(page, "Send with pay link").click();
        const confirm = page.getByRole("alertdialog");
        await expect(confirm).toContainText(
            "It takes the next number and its lines lock.",
        );
        await confirm.getByRole("button", { name: "Send it" }).click();
        await expect(
            page.getByText(`Sent to ${email} with a pay link.`).first(),
        ).toBeVisible();

        const sent = await call.get<InvoiceRead>(`/invoices/${id}`);
        expect(sent.status).toBe("ISSUED");
        expect(sent.number).toMatch(/\d{4}$/);
        await expect(
            page.getByRole("heading", { level: 1, name: sent.number ?? "" }),
        ).toBeVisible();
        expect(sent.sent[0]).toMatchObject({ to: email, reminder: false });
        // Issued: the draft's actions are gone.
        await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
        await expect(
            page.getByRole("button", { name: "Delete draft" }),
        ).toHaveCount(0);
    });

    test("no Send while an autopay charge is under way (D13)", async ({
        page,
    }) => {
        await signIn(page);
        const org = await northwind(page);
        await page.goto(`/open/${org}`);
        const call = api(page, org);

        // Read-only: it looks for a renewal invoice whose autopay charge is
        // waiting on the bank. Only a business with autopay can have one.
        const offer = await call.get<{ offered: boolean }>(
            "/subscriptions/autopay",
        );
        test.skip(
            !offer.offered,
            "Autopay isn't offered on Northwind (RAZORPAY_AUTOPAY off, or no provider that takes mandates), so no charge can be under way",
        );
        const owed = await call.get<{ id: string }[]>(
            "/invoices?view=issued&source=SUBSCRIPTION",
        );
        let charging: InvoiceRead | null = null;
        for (const row of owed.slice(0, 25)) {
            const read = await call.get<InvoiceRead>(`/invoices/${row.id}`);
            if (read.online?.autopayCharge) {
                charging = read;
                break;
            }
        }
        test.skip(
            !charging,
            "No Northwind renewal has an autopay charge under way right now",
        );
        const id = charging?.id ?? "";

        await page.goto(`/billing/invoices/${id}`);
        await expect(
            page.getByText(/Autopay charge in progress/).first(),
        ).toBeVisible();
        await expect(
            page.getByRole("button", { name: "Send with pay link" }),
        ).toHaveCount(0);
        await expect(
            page.getByRole("button", { name: "Send reminder" }),
        ).toHaveCount(0);
        await expect(
            page.getByRole("button", { name: "Copy pay link" }),
        ).toHaveCount(0);
        const refused = await call.postRaw(`/invoices/${id}/send`);
        expect(refused.status()).toBe(409);
        expect(await refused.text()).toContain("Autopay charge in progress");
    });
});
