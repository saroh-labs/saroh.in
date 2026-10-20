/**
 * The pay page's payments (DEC-173, U16 #1128) against a real Postgres:
 * the public read says what has been received, oldest first: a part
 * payment by cash, a cheque waiting for the bank, the same cheque in the
 * bank or returned, and a payment removed by mistake gone from the page.
 * Only the allow-listed fields travel: never a reference, a note, a bounce
 * reason or an id. Another business's payments never show.
 *
 * Runs in the integration project, plain and under `TEST_RLS=on`.
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import { prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { InvoicePaymentsService } from "../invoices/invoice-payments.service";
import { InvoicesService } from "../invoices/invoices.service";
import { PaymentsService } from "./payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "./providers/fake.provider";
import { PublicInvoicesService } from "./public-invoices.service";

const ledger = new InvoicePaymentsService();
const invoices = new InvoicesService(ledger);
const payments = new PaymentsService(
    new FakeProviderFactory(new FakeMerchantProvider("RAZORPAY")),
);
const publicInvoices = new PublicInvoicesService(payments);

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;

async function business(name: string): Promise<OrganizationContext> {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("pay-page-payments") },
    });
    await giveBusinessDetails(org.id);
    const ctx: OrganizationContext = {
        organizationId: org.id,
        userId: "user_owner",
        role: "OWNER",
    };
    // A pay link needs a provider to pay through.
    await payments.connectProvider(ctx, {
        provider: "RAZORPAY",
        publicKey: "rzp_test_Public1",
        keyId: "rzp_test_Public1",
        keySecret: "rzp_secret",
        webhookSecret: "whsec_db_test",
    });
    return ctx;
}

let rye: OrganizationContext;
let pulse: OrganizationContext;

beforeAll(async () => {
    rye = await business("Rye & Co.");
    pulse = await business("Pulse Studio");
});

/** An issued ₹8,400 invoice and its pay link's token. */
async function issued(
    ctx: OrganizationContext,
): Promise<{ id: string; token: string }> {
    const contact = await prisma.contact.create({
        data: {
            organizationId: ctx.organizationId,
            email: `${uniq("vivek")}@example.com`,
            firstName: "Vivek",
            lastName: "Nair",
        },
    });
    const draft = await invoices.createDraft(ctx, {
        contactId: contact.id,
        currency: "INR",
        lines: [{ description: "Catering", quantity: 1, unitPrice: "8400" }],
    });
    await invoices.issue(ctx, draft.id);
    const { token } = await invoices.createPayLink(ctx, draft.id);
    return { id: draft.id, token };
}

const ON_19_OCT = "2026-10-19T06:00:00.000Z";

describe("the pay page's payments (real database)", () => {
    it("says nothing was received on an invoice nobody has paid", async () => {
        const { token } = await issued(rye);
        const page = await publicInvoices.read(token);
        expect(page).toMatchObject({
            paidSoFar: "0.00",
            leftToPay: "8400.00",
            payments: [],
        });
    });

    it("says a part payment by cash, how much is left, and nothing private", async () => {
        const { id, token } = await issued(rye);
        await ledger.record(rye, id, {
            method: "CASH",
            amount: "4000",
            receivedAt: ON_19_OCT,
            reference: "Till slip 88",
            note: "Paid at the counter",
        });
        const page = await publicInvoices.read(token);
        expect(page).toMatchObject({
            status: "ISSUED",
            paidSoFar: "4000.00",
            leftToPay: "4400.00",
        });
        expect(page.payments).toEqual([
            {
                amount: "4000.00",
                method: "CASH",
                receivedAt: ON_19_OCT,
                cheque: null,
            },
        ]);
        const said = JSON.stringify(page);
        expect(said).not.toContain("Till slip");
        expect(said).not.toContain("counter");
    });

    it("says a cheque is waiting, then in the bank, and the invoice reads paid", async () => {
        const { id, token } = await issued(rye);
        const recorded = await ledger.record(rye, id, {
            method: "CHEQUE",
            receivedAt: ON_19_OCT,
            chequeNumber: "004512",
            chequeBank: "HDFC Bank",
        });
        const waiting = await publicInvoices.read(token);
        // A waiting cheque counts as received (DEC-173).
        expect(waiting).toMatchObject({
            status: "PAID",
            paidSoFar: "8400.00",
            leftToPay: "0.00",
        });
        expect(waiting.payments).toEqual([
            {
                amount: "8400.00",
                method: "CHEQUE",
                receivedAt: ON_19_OCT,
                cheque: {
                    number: "004512",
                    bank: "HDFC Bank",
                    status: "WAITING",
                    returnedAfterBanking: false,
                },
            },
        ]);

        await ledger.cleared(rye, id, recorded.recorded.paymentId, {});
        const cleared = await publicInvoices.read(token);
        expect(cleared.payments?.[0]?.cheque?.status).toBe("CLEARED");
        expect(cleared.status).toBe("PAID");
    });

    it("says a bounced cheque, and the amount is owed again, without its reason", async () => {
        const { id, token } = await issued(rye);
        const recorded = await ledger.record(rye, id, {
            method: "CHEQUE",
            receivedAt: ON_19_OCT,
            chequeNumber: "004513",
            chequeBank: "HDFC Bank",
        });
        await ledger.bounced(rye, id, recorded.recorded.paymentId, {
            reason: "Insufficient funds",
        });
        const page = await publicInvoices.read(token);
        expect(page).toMatchObject({
            status: "ISSUED",
            paidSoFar: "0.00",
            leftToPay: "8400.00",
        });
        expect(page.payments).toEqual([
            expect.objectContaining({
                amount: "8400.00",
                cheque: {
                    number: "004513",
                    bank: "HDFC Bank",
                    status: "BOUNCED",
                    returnedAfterBanking: false,
                },
            }),
        ]);
        expect(JSON.stringify(page)).not.toContain("Insufficient");
    });

    it("says a cheque the bank returned after it was banked (#7)", async () => {
        const { id, token } = await issued(rye);
        const recorded = await ledger.record(rye, id, {
            method: "CHEQUE",
            receivedAt: ON_19_OCT,
            chequeNumber: "004514",
            chequeBank: "HDFC Bank",
        });
        await ledger.cleared(rye, id, recorded.recorded.paymentId, {});
        await ledger.bounced(rye, id, recorded.recorded.paymentId, {});
        const page = await publicInvoices.read(token);
        expect(page).toMatchObject({ status: "ISSUED", leftToPay: "8400.00" });
        expect(page.payments?.[0]?.cheque).toEqual({
            number: "004514",
            bank: "HDFC Bank",
            status: "BOUNCED",
            returnedAfterBanking: true,
        });
    });

    it("leaves a payment removed by mistake off the page, oldest first otherwise", async () => {
        const { id, token } = await issued(rye);
        await ledger.record(rye, id, {
            method: "UPI",
            amount: "1000",
            receivedAt: "2026-10-10T06:00:00.000Z",
        });
        const wrong = await ledger.record(rye, id, {
            method: "CASH",
            amount: "500",
            receivedAt: "2026-10-12T06:00:00.000Z",
        });
        await ledger.record(rye, id, {
            method: "BANK_TRANSFER",
            amount: "2000",
            receivedAt: "2026-10-14T06:00:00.000Z",
        });
        await ledger.remove(rye, id, wrong.recorded.paymentId, {
            reason: "Typed on the wrong invoice",
        });
        const page = await publicInvoices.read(token);
        expect(page.payments?.map((p) => [p.method, p.amount])).toEqual([
            ["UPI", "1000.00"],
            ["BANK_TRANSFER", "2000.00"],
        ]);
        expect(page).toMatchObject({
            paidSoFar: "3000.00",
            leftToPay: "5400.00",
        });
        expect(JSON.stringify(page)).not.toContain("wrong invoice");
    });

    it("shows one business's payments on its own link only", async () => {
        const mine = await issued(rye);
        const theirs = await issued(pulse);
        await ledger.record(pulse, theirs.id, {
            method: "CASH",
            amount: "100",
        });
        expect((await publicInvoices.read(mine.token)).payments).toEqual([]);
        expect((await publicInvoices.read(theirs.token)).payments).toHaveLength(
            1,
        );
    });
});
