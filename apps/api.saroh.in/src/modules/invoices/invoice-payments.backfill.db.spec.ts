/**
 * The invoice ledger backfill (DEC-173, #1113;
 * packages/database/src/backfill/invoice-payments.ts) against a real
 * Postgres: every invoice paid before the ledger gets one payment for its
 * full total, with its method and date, and its `paidCents`; an order's
 * invoice, a credit note and anything not paid get none. A dry run first,
 * then for real, then again to prove the second run writes nothing.
 *
 * Runs in the integration project (TEST_DATABASE_URL), plain and under
 * TEST_RLS=on (the backfill runs with no business context, as jobs do).
 */
import { backfillInvoicePayments, prisma } from "@saroh/database";

import { backendPid, waitUntilBlockedBy } from "../../../test/lock-wait";

const tag = `${process.pid}-${Date.now()}`;
let seq = 0;
const uniq = (p: string) => `${p}-${tag}-${++seq}`;

const paidAt = new Date("2026-10-12T06:30:00.000Z");
const issuedAt = new Date("2026-10-05T04:00:00.000Z");

async function business(name: string) {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("ledger") },
    });
    return org.id;
}

async function invoice(
    organizationId: string,
    fields: {
        total: string;
        status: string;
        kind?: string;
        paymentMethod?: string | null;
        paymentReference?: string | null;
        paymentNote?: string | null;
        paidAt?: Date | null;
        issuedAt?: Date | null;
        orderId?: string | null;
        relatedInvoiceId?: string | null;
        source?: string;
    },
) {
    const { total, ...rest } = fields;
    return prisma.invoice.create({
        data: {
            organizationId,
            number: fields.status === "DRAFT" ? null : uniq("INV"),
            currency: "INR",
            subtotal: total,
            total,
            issuedAt: fields.status === "DRAFT" ? null : issuedAt,
            ...rest,
        },
    });
}

async function order(organizationId: string) {
    const store = await prisma.store.create({
        data: { organizationId, name: "Counter", slug: uniq("store") },
    });
    return prisma.order.create({
        data: {
            storeId: store.id,
            organizationId,
            orderId: uniq("ORD"),
            subtotal: "1200.00",
            total: "1200.00",
            currency: "INR",
            paymentStatus: "PAID",
        },
    });
}

const ledgerOf = (organizationId: string) =>
    prisma.invoicePayment.findMany({
        where: { organizationId },
        orderBy: { invoiceId: "asc" },
    });

afterAll(async () => {
    await prisma.$disconnect();
});

describe("backfillInvoicePayments", () => {
    let rye: string;
    let upi: { id: string };
    let noMethod: { id: string };
    let online: { id: string };
    let intentId: string;
    let paidNoDate: { id: string };
    let leftOut: { id: string; why: string }[];

    beforeAll(async () => {
        rye = await business("Rye & Co.");
        upi = await invoice(rye, {
            total: "8400.00",
            status: "PAID",
            paymentMethod: "UPI",
            paymentReference: "UPI-4471",
            paymentNote: "Paid at the counter",
            paidAt,
        });
        noMethod = await invoice(rye, {
            total: "1250.50",
            status: "PAID",
            paymentMethod: null,
            paidAt,
        });
        online = await invoice(rye, {
            total: "2360.00",
            status: "PAID",
            paymentMethod: "ONLINE",
            paymentReference: "pay_123",
            paidAt,
        });
        intentId = (
            await prisma.paymentIntent.create({
                data: {
                    organizationId: rye,
                    invoiceId: online.id,
                    provider: "RAZORPAY",
                    amountCents: 236000,
                    currency: "INR",
                    status: "SUCCEEDED",
                },
            })
        ).id;
        // Paid before `paidAt` was always set: received when issued.
        paidNoDate = await invoice(rye, {
            total: "500.00",
            status: "PAID",
            paymentMethod: "CASH",
            paidAt: null,
        });

        const sale = await order(rye);
        const orderInvoice = await invoice(rye, {
            total: "1200.00",
            status: "PAID",
            paymentMethod: "ORDER",
            paidAt,
            orderId: sale.id,
            source: "ORDER",
        });
        const draft = await invoice(rye, { total: "900.00", status: "DRAFT" });
        const issued = await invoice(rye, {
            total: "900.00",
            status: "ISSUED",
        });
        const voided = await invoice(rye, { total: "900.00", status: "VOID" });
        const credited = await invoice(rye, {
            total: "900.00",
            status: "CREDITED",
        });
        const creditNote = await invoice(rye, {
            total: "900.00",
            status: "PAID",
            kind: "CREDIT_NOTE",
            relatedInvoiceId: credited.id,
        });
        leftOut = [
            { id: orderInvoice.id, why: "an order's invoice" },
            { id: draft.id, why: "a draft" },
            { id: issued.id, why: "an issued invoice" },
            { id: voided.id, why: "a voided invoice" },
            { id: credited.id, why: "a cancelled (credited) invoice" },
            { id: creditNote.id, why: "a credit note" },
        ];
    });

    it("reports what it would write on a dry run, and writes nothing", async () => {
        const report = await backfillInvoicePayments(prisma, {
            organizationIds: [rye],
            dryRun: true,
        });
        expect(report).toMatchObject({ written: 4, skipped: [], dryRun: true });
        expect(await ledgerOf(rye)).toEqual([]);
        expect(
            (await prisma.invoice.findUniqueOrThrow({ where: { id: upi.id } }))
                .paidCents,
        ).toBe(0);
    });

    it("gives a ₹8,400 invoice paid by UPI one ₹8,400 UPI payment, dated when it was paid", async () => {
        const report = await backfillInvoicePayments(prisma, {
            organizationIds: [rye],
        });
        expect(report).toMatchObject({
            organizations: 1,
            written: 4,
            skipped: [],
            dryRun: false,
        });

        const rows = await prisma.invoicePayment.findMany({
            where: { invoiceId: upi.id },
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            organizationId: rye,
            amountCents: 840000,
            currency: "INR",
            method: "UPI",
            reference: "UPI-4471",
            note: "Paid at the counter",
            receivedAt: paidAt,
            bankStatus: null,
            removedAt: null,
            recordedById: null,
            paymentIntentId: null,
        });
        const after = await prisma.invoice.findUniqueOrThrow({
            where: { id: upi.id },
        });
        expect(after.paidCents).toBe(840000);
        // The invoice itself reads exactly as before.
        expect(after).toMatchObject({
            status: "PAID",
            paidAt,
            paymentMethod: "UPI",
            paymentReference: "UPI-4471",
            paymentNote: "Paid at the counter",
        });
    });

    it("records a paid invoice with no method as Other, to the paisa", async () => {
        const [row] = await prisma.invoicePayment.findMany({
            where: { invoiceId: noMethod.id },
        });
        expect(row).toMatchObject({ amountCents: 125050, method: "OTHER" });
        expect(
            (
                await prisma.invoice.findUniqueOrThrow({
                    where: { id: noMethod.id },
                })
            ).paymentMethod,
        ).toBeNull();
    });

    it("keeps an online payment ONLINE, linked to the intent it came from", async () => {
        const [row] = await prisma.invoicePayment.findMany({
            where: { invoiceId: online.id },
        });
        expect(row).toMatchObject({
            amountCents: 236000,
            method: "ONLINE",
            reference: "pay_123",
            paymentIntentId: intentId,
        });
    });

    it("dates a payment with no paid date when the invoice was issued", async () => {
        const [row] = await prisma.invoicePayment.findMany({
            where: { invoiceId: paidNoDate.id },
        });
        expect(row).toMatchObject({ method: "CASH", receivedAt: issuedAt });
    });

    it("gives an order's invoice, a draft, a voided, a cancelled invoice and a credit note no payment", async () => {
        for (const { id, why } of leftOut) {
            const rows = await prisma.invoicePayment.count({
                where: { invoiceId: id },
            });
            const { paidCents } = await prisma.invoice.findUniqueOrThrow({
                where: { id },
            });
            expect({ why, rows, paidCents }).toEqual({
                why,
                rows: 0,
                paidCents: 0,
            });
        }
    });

    it("writes nothing the second time", async () => {
        const before = await ledgerOf(rye);
        const invoicesBefore = await prisma.invoice.findMany({
            where: { organizationId: rye },
            orderBy: { id: "asc" },
        });

        const report = await backfillInvoicePayments(prisma, {
            organizationIds: [rye],
        });

        expect(report).toMatchObject({ written: 0, skipped: [] });
        expect(await ledgerOf(rye)).toEqual(before);
        expect(
            await prisma.invoice.findMany({
                where: { organizationId: rye },
                orderBy: { id: "asc" },
            }),
        ).toEqual(invoicesBefore);
    });

    it("finds every business that needs it when none is named, and leaves a business with a payment already alone", async () => {
        const other = await business("Pulse Fitness");
        const paid = await invoice(other, {
            total: "2500.00",
            status: "PAID",
            paymentMethod: "CASH",
            paidAt,
        });
        // One already in the ledger, as the ledger API writes one.
        const recorded = await invoice(other, {
            total: "999.00",
            status: "PAID",
            paymentMethod: "CARD",
            paidAt,
        });
        await prisma.invoicePayment.create({
            data: {
                organizationId: other,
                invoiceId: recorded.id,
                amountCents: 99900,
                currency: "INR",
                method: "CARD",
                receivedAt: paidAt,
            },
        });
        await prisma.invoice.update({
            where: { id: recorded.id },
            data: { paidCents: 99900 },
        });

        const report = await backfillInvoicePayments(prisma);

        expect(report.written).toBe(1);
        expect(
            await prisma.invoicePayment.count({
                where: { invoiceId: paid.id },
            }),
        ).toBe(1);
        expect(
            await prisma.invoicePayment.count({
                where: { invoiceId: recorded.id },
            }),
        ).toBe(1);
        expect((await backfillInvoicePayments(prisma)).written).toBe(0);
    });

    it("leaves a paid invoice of nothing alone, and says so", async () => {
        const free = await business("Free trial");
        const zero = await invoice(free, {
            total: "0.00",
            status: "PAID",
            paymentMethod: "OTHER",
            paidAt,
        });

        const report = await backfillInvoicePayments(prisma, {
            organizationIds: [free],
        });

        expect(report.written).toBe(0);
        expect(report.skipped).toEqual([
            {
                organizationId: free,
                invoiceId: zero.id,
                number: zero.number,
                why: "nothing to pay",
            },
        ]);
        expect(
            await prisma.invoicePayment.count({
                where: { invoiceId: zero.id },
            }),
        ).toBe(0);
    });

    it("never doubles a payment the ledger records while it waits on the invoice", async () => {
        const desk = await business("Kavi Dental");
        const paid = await invoice(desk, {
            total: "1500.00",
            status: "PAID",
            paymentMethod: "CASH",
            paidAt,
        });

        // The ledger's write holds the invoice's lock and records a payment;
        // the backfill waits on that lock, then sees the row and skips it.
        let release!: () => void;
        const held = new Promise<void>((resolve) => (release = resolve));
        let locked!: (pid: number) => void;
        const isLocked = new Promise<number>((resolve) => (locked = resolve));
        const writer = prisma.$transaction(
            async (tx) => {
                await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${paid.id} FOR NO KEY UPDATE`;
                locked(await backendPid(tx));
                await held;
                await tx.invoicePayment.create({
                    data: {
                        organizationId: desk,
                        invoiceId: paid.id,
                        amountCents: 150000,
                        currency: "INR",
                        method: "CASH",
                        receivedAt: paidAt,
                    },
                });
                await tx.invoice.update({
                    where: { id: paid.id },
                    data: { paidCents: 150000 },
                });
            },
            { timeout: 20_000 },
        );
        const holder = await isLocked;
        const backfill = backfillInvoicePayments(prisma, {
            organizationIds: [desk],
        });
        // The backfill must be waiting on the writer's lock before it commits.
        await waitUntilBlockedBy(holder, "Invoice");
        release();
        await writer;

        expect((await backfill).written).toBe(0);
        expect(
            await prisma.invoicePayment.count({
                where: { invoiceId: paid.id },
            }),
        ).toBe(1);
    });
});
