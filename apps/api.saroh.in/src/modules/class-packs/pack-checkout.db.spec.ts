/**
 * A class pack bought online (DEC-174 U22, #1153) against a real Postgres:
 * the money landing writes the pack's "Sold" row by the customer, as a
 * desk sale writes one; and the payment's receipt (DEC-173) says what was
 * bought, "10-class pack: 10 classes, use them by ‹date›", in the
 * business's zone. No second email. With Pack credits off the Sold row is
 * still written.
 *
 * Runs in the integration project, plain and under `TEST_RLS=on`. Only the
 * app env is stubbed (the credential key).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
        RENDERER_URL: "https://saroh.app",
    },
}));

import { prisma } from "@saroh/database";

import type { PackStudio } from "../../../test/fixtures/packs";
import {
    comms,
    emailsOf,
    makePack,
    packStudio,
} from "../../../test/fixtures/packs";
import { toMinor } from "../../common/money";
import { dayWords } from "../../common/words-format";
import { recordOnlinePaymentInTx } from "../invoices/invoice-ledger";
import { INVOICE_RECEIPT_TYPE } from "../invoices/invoice-receipt";
import { InvoiceReceiptHandler } from "../invoices/invoice-receipt.handler";
import {
    completePackDraftInTx,
    createPackDraftInTx,
    packTermsOf,
} from "./pack-checkout";
import { listPackEvents } from "./pack-events";

const receipts = new InvoiceReceiptHandler(comms);

afterAll(async () => {
    await prisma.$disconnect();
});

/** Asha starts paying for the pack online, and the money lands. */
async function buyOnline(s: PackStudio, packId: string) {
    const pack = await prisma.classPack.findUniqueOrThrow({
        where: { id: packId },
    });
    const contact = await prisma.contact.findUniqueOrThrow({
        where: { id: s.contactId },
    });
    const draft = await prisma.$transaction((tx) =>
        createPackDraftInTx(tx, {
            organizationId: s.organizationId,
            contactId: s.contactId,
            billToName: "Asha Rao",
            billToEmail: contact.email,
            terms: packTermsOf(pack),
        }),
    );
    const amountCents = toMinor(draft.total);
    const intent = await prisma.paymentIntent.create({
        data: {
            organizationId: s.organizationId,
            invoiceId: draft.id,
            provider: "RAZORPAY",
            amountCents,
            currency: "INR",
            status: "SUCCEEDED",
        },
    });
    const now = new Date();
    const outcome = await prisma.$transaction((tx) =>
        completePackDraftInTx(tx, {
            invoiceId: draft.id,
            organizationId: s.organizationId,
            now,
            payment: {
                paymentIntentId: intent.id,
                amountCents,
                reference: "pay_u22_1",
                note: "Paid online through Razorpay",
                receivedAt: now,
            },
        }),
    );
    expect(outcome).toBe("bought");
    const invoice = await prisma.invoice.findUniqueOrThrow({
        where: { id: draft.id },
        select: { id: true, status: true, packPurchaseId: true },
    });
    return { invoice, intentId: intent.id };
}

describe("a pack bought online", () => {
    it("writes its Sold row by the customer, as the desk's sale does", async () => {
        const s = await packStudio();
        const pack = await makePack(s, 10);
        const { invoice } = await buyOnline(s, pack.id);
        expect(invoice.status).toBe("PAID");

        const events = await prisma.packEvent.findMany({
            where: { organizationId: s.organizationId, packId: pack.id },
        });
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            kind: "SOLD",
            purchaseId: invoice.packPurchaseId,
            actorKind: "CUSTOMER",
            actorUserId: null,
            details: {
                price: "4500.00",
                currency: "INR",
                credits: 10,
                paidBy: "ONLINE",
            },
        });

        // Pack Detail's Activity names the holder, and no team member.
        const page = await listPackEvents(s.organizationId, pack.id);
        expect(page.events[0]).toMatchObject({
            kind: "SOLD",
            holder: { contactId: s.contactId, name: "Asha Rao" },
            actor: { kind: "CUSTOMER", userId: null, name: null },
        });
    });

    it("its receipt says what was bought and the use-by date, and nothing else is sent", async () => {
        const s = await packStudio();
        const pack = await makePack(s, 10);
        const { invoice, intentId } = await buyOnline(s, pack.id);
        const payment = await prisma.invoicePayment.findUniqueOrThrow({
            where: { paymentIntentId: intentId },
        });
        const job = (
            await prisma.job.findMany({
                where: {
                    organizationId: s.organizationId,
                    type: INVOICE_RECEIPT_TYPE,
                },
            })
        ).find(
            (j) =>
                (j.payload as { paymentId?: string }).paymentId === payment.id,
        );
        await receipts.handle(job!);

        const purchase = await prisma.packPurchase.findUniqueOrThrow({
            where: { id: invoice.packPurchaseId! },
        });
        const by = dayWords(purchase.expiresAt, "Asia/Kolkata", {
            year: true,
        });
        const [receipt, ...more] = await emailsOf(
            s.organizationId,
            "INVOICE_PAYMENT_RECEIVED",
        );
        expect(more).toHaveLength(0);
        expect(receipt!.body).toContain(
            `<p>10-class pack: 10 classes, use them by ${by}.</p>`,
        );
        // No second email: the receipt is the only message about it.
        expect(
            await prisma.message.count({
                where: { organizationId: s.organizationId },
            }),
        ).toBe(1);
    });

    it("with Pack credits off the Sold row is still written", async () => {
        const s = await packStudio({ packCredits: false });
        const pack = await makePack(s, 5);
        await buyOnline(s, pack.id);
        expect(
            await prisma.packEvent.count({
                where: { packId: pack.id, kind: "SOLD" },
            }),
        ).toBe(1);
    });

    it("a receipt for anything that isn't a pack carries no pack line", async () => {
        const s = await packStudio();
        const contact = await prisma.contact.findUniqueOrThrow({
            where: { id: s.contactId },
        });
        const issued = await prisma.invoice.create({
            data: {
                organizationId: s.organizationId,
                number: `U22/${process.pid}`,
                status: "ISSUED",
                currency: "INR",
                subtotal: "1800.00",
                total: "1800.00",
                contactId: s.contactId,
                billToName: "Asha Rao",
                billToEmail: contact.email,
                issuedAt: new Date(),
                dueAt: new Date(),
                source: "MANUAL",
            },
        });
        const intent = await prisma.paymentIntent.create({
            data: {
                organizationId: s.organizationId,
                invoiceId: issued.id,
                provider: "RAZORPAY",
                amountCents: 180000,
                currency: "INR",
                status: "SUCCEEDED",
            },
        });
        await prisma.$transaction((tx) =>
            recordOnlinePaymentInTx(tx, s.organizationId, issued.id, {
                paymentIntentId: intent.id,
                amountCents: 180000,
                reference: "pay_u22_2",
                note: "Paid online through Razorpay",
                receivedAt: new Date(),
            }),
        );
        const [job] = await prisma.job.findMany({
            where: {
                organizationId: s.organizationId,
                type: INVOICE_RECEIPT_TYPE,
            },
        });
        await receipts.handle(job!);
        const [receipt] = await emailsOf(
            s.organizationId,
            "INVOICE_PAYMENT_RECEIVED",
        );
        expect(receipt!.body).not.toContain("use them by");
    });
});
