/**
 * The invoice ledger's API (DEC-173, U2 #1114) against a real Postgres:
 * part payments and cheques, removing a payment, a cheque in the bank or
 * bounced, the invoice's status worked out from its payments in the same
 * transaction, every refusal, a double tap, two payments racing for the
 * same rupees, and one business never reaching another's ledger.
 *
 * Runs in the integration project, plain and under `TEST_RLS=on` (where
 * every service call runs in its business's RLS context).
 */
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
    UnprocessableEntityException,
} from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import { backendPid, gate, waitUntilBlockedBy } from "../../../test/lock-wait";
import { isRlsTestMode } from "../../../test/rls-mode";
import type { OrganizationContext } from "../../common/types/organization-context";
import { AuditAction } from "../audit/audit.service";
import {
    lockInvoiceForLedgerOr404,
    recordLedgerPaymentInTx,
} from "./invoice-ledger";
import { InvoicePaymentsService } from "./invoice-payments.service";
import { InvoicesService } from "./invoices.service";

const payments = new InvoicePaymentsService();
const invoices = new InvoicesService(payments);

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;
const DAY = 24 * 60 * 60 * 1000;

let rye: OrganizationContext;
let pulse: OrganizationContext;

async function business(name: string): Promise<OrganizationContext> {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("ledger-api") },
    });
    return { organizationId: org.id, userId: "user_owner", role: "OWNER" };
}

/** An issued invoice for `total`, due in a week unless told. */
async function issued(
    ctx: OrganizationContext,
    total: string,
    over: {
        status?: string;
        dueAt?: Date;
        orderId?: string;
        kind?: string;
    } = {},
): Promise<string> {
    const status = over.status ?? "ISSUED";
    const row = await prisma.invoice.create({
        data: {
            organizationId: ctx.organizationId,
            number: status === "DRAFT" ? null : uniq("RC"),
            status,
            kind: over.kind ?? "INVOICE",
            currency: "INR",
            subtotal: total,
            total,
            billToName: "Vivek Nair",
            billToEmail: "vivek.nair@example.com",
            issuedAt: status === "DRAFT" ? null : new Date(),
            dueAt: over.dueAt ?? new Date(Date.now() + 7 * DAY),
            orderId: over.orderId ?? null,
            source: over.orderId ? "ORDER" : "MANUAL",
        },
        select: { id: true },
    });
    return row.id;
}

async function orderOf(ctx: OrganizationContext) {
    const store = await prisma.store.create({
        data: {
            organizationId: ctx.organizationId,
            name: "Counter",
            slug: uniq("store"),
        },
    });
    return prisma.order.create({
        data: {
            storeId: store.id,
            organizationId: ctx.organizationId,
            orderId: uniq("ORD"),
            subtotal: "1200.00",
            total: "1200.00",
            currency: "INR",
        },
    });
}

const rowsOf = (invoiceId: string) =>
    prisma.invoicePayment.findMany({
        where: { invoiceId },
        orderBy: { createdAt: "asc" },
    });

const invoiceRow = (id: string) =>
    prisma.invoice.findUniqueOrThrow({
        where: { id },
        select: {
            status: true,
            paidCents: true,
            paidAt: true,
            paymentMethod: true,
            paymentReference: true,
        },
    });

const auditsOf = (invoiceId: string) =>
    prisma.auditEvent.findMany({
        where: { targetType: "invoice", targetId: invoiceId },
        orderBy: { createdAt: "asc" },
        select: {
            action: true,
            actorUserId: true,
            organizationId: true,
            metadata: true,
        },
    });

beforeAll(async () => {
    rye = await business("Rye & Co.");
    pulse = await business("Pulse Fitness");
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe("recording part payments", () => {
    it("₹1,000 cash on ₹2,500 is partly paid, then ₹1,500 UPI pays it", async () => {
        const id = await issued(rye, "2500.00");
        const first = await payments.record(rye, id, {
            method: "CASH",
            amount: "1000",
            receivedAt: "2026-10-10T05:00:00.000Z",
        });
        expect(first).toMatchObject({
            status: "ISSUED",
            standing: "ISSUED",
            paidSoFar: "1000.00",
            leftToPay: "1500.00",
            partlyPaid: true,
            chequeWaiting: false,
            paidAt: null,
            payment: null,
            recorded: { replayed: false },
        });
        expect(await invoiceRow(id)).toMatchObject({
            status: "ISSUED",
            paidCents: 100000,
        });

        const second = await payments.record(rye, id, {
            method: "UPI",
            amount: "1500",
            reference: "UTR 4411",
            receivedAt: "2026-10-12T05:00:00.000Z",
        });
        expect(second).toMatchObject({
            status: "PAID",
            paidSoFar: "2500.00",
            leftToPay: "0.00",
            partlyPaid: false,
            paidAt: "2026-10-12T05:00:00.000Z",
            payment: { method: "UPI", reference: "UTR 4411" },
        });
        expect(second.payments).toHaveLength(2);
        expect(second.payments?.map((p) => [p.method, p.amount])).toEqual([
            ["CASH", "1000.00"],
            ["UPI", "1500.00"],
        ]);
        expect(await invoiceRow(id)).toMatchObject({
            status: "PAID",
            paidCents: 250000,
            paymentMethod: "UPI",
        });
    });

    it("records what is left when no amount is sent", async () => {
        const id = await issued(rye, "2500.00");
        await payments.record(rye, id, { method: "CASH", amount: "400" });
        const paid = await payments.record(rye, id, { method: "CARD" });
        expect(paid.status).toBe("PAID");
        expect((await rowsOf(id)).map((r) => r.amountCents)).toEqual([
            40000, 210000,
        ]);
    });

    it("still takes the old body (`paidAt`, no amount): the whole invoice", async () => {
        const id = await issued(rye, "1200.00");
        const paid = await invoices.recordPayment(rye, id, {
            method: "UPI",
            paidAt: "2026-09-22T11:00:00.000Z",
        });
        expect(paid).toMatchObject({
            status: "PAID",
            paidAt: "2026-09-22T11:00:00.000Z",
        });
        expect(await rowsOf(id)).toMatchObject([{ amountCents: 120000 }]);
    });

    it("refuses ₹9,000 on ₹8,400 left with a 422 that names what is left, and writes nothing", async () => {
        const id = await issued(rye, "8400.00");
        const refused = payments.record(rye, id, {
            method: "CASH",
            amount: "9000",
        });
        await expect(refused).rejects.toBeInstanceOf(
            UnprocessableEntityException,
        );
        await expect(refused).rejects.toMatchObject({
            response: {
                details: { leftToPay: "8400.00", amount: "9000.00" },
            },
        });
        expect(await rowsOf(id)).toEqual([]);
        expect(await invoiceRow(id)).toMatchObject({
            status: "ISSUED",
            paidCents: 0,
        });
        expect(await auditsOf(id)).toEqual([]);
    });

    it.each(["0", "0.00"])(
        "refuses %s as an amount with a 400",
        async (amount) => {
            const id = await issued(rye, "2500.00");
            await expect(
                payments.record(rye, id, { method: "CASH", amount }),
            ).rejects.toBeInstanceOf(BadRequestException);
            expect(await rowsOf(id)).toEqual([]);
        },
    );

    it("refuses one payment too big for the ledger with a 400", async () => {
        const id = await issued(rye, "2500.00");
        await expect(
            payments.record(rye, id, { method: "CASH", amount: "21474837" }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuses a received date more than a day ahead", async () => {
        const id = await issued(rye, "2500.00");
        await expect(
            payments.record(rye, id, {
                method: "CASH",
                receivedAt: new Date(Date.now() + 3 * DAY).toISOString(),
            }),
        ).rejects.toMatchObject({
            response: { details: { field: "receivedAt" } },
        });
    });

    it("refuses a cheque number on cash", async () => {
        const id = await issued(rye, "2500.00");
        await expect(
            payments.record(rye, id, {
                method: "CASH",
                chequeNumber: "004512",
            }),
        ).rejects.toMatchObject({
            response: { details: { field: "chequeNumber" } },
        });
    });

    it("notes the payment on the invoice's history: the recorded event", async () => {
        const id = await issued(rye, "2500.00");
        const { recorded } = await payments.record(rye, id, {
            method: "CASH",
            amount: "1000",
            reference: "Counter book p.12",
            note: "Paid by his brother",
        });
        expect(await auditsOf(id)).toEqual([
            {
                action: AuditAction.InvoicePaymentRecorded,
                actorUserId: "user_owner",
                organizationId: rye.organizationId,
                metadata: {
                    paymentId: recorded.paymentId,
                    amount: "1000.00",
                    currency: "INR",
                    method: "CASH",
                    paidInFull: false,
                },
            },
        ]);
        // Never the reference or the note.
        expect(JSON.stringify(await auditsOf(id))).not.toMatch(
            /Counter|brother/,
        );
        expect(await rowsOf(id)).toMatchObject([
            { recordedById: "user_owner", reference: "Counter book p.12" },
        ]);
    });
});

describe("cheques", () => {
    it("a ₹8,400 cheque pays the invoice while it waits for the bank", async () => {
        const id = await issued(rye, "8400.00");
        const paid = await payments.record(rye, id, {
            method: "CHEQUE",
            chequeNumber: "004512",
            chequeBank: "HDFC Bank",
        });
        expect(paid).toMatchObject({
            status: "PAID",
            chequeWaiting: true,
            payments: [
                {
                    method: "CHEQUE",
                    amount: "8400.00",
                    cheque: { number: "004512", bank: "HDFC Bank" },
                    bankStatus: "WAITING",
                    canRemove: true,
                },
            ],
        });
        // The list row says so too.
        const listed = await invoices.list(rye, {});
        expect(listed.find((i) => i.id === id)?.chequeWaiting).toBe(true);
    });

    it("in the bank: CLEARED with its date, still PAID; again is a 409", async () => {
        const id = await issued(rye, "8400.00");
        const { recorded } = await payments.record(rye, id, {
            method: "CHEQUE",
            chequeNumber: "004513",
        });
        const cleared = await payments.cleared(rye, id, recorded.paymentId, {
            clearedAt: new Date().toISOString(),
        });
        expect(cleared).toMatchObject({
            status: "PAID",
            chequeWaiting: false,
            payments: [{ bankStatus: "CLEARED" }],
        });
        expect(cleared.payments?.[0].clearedAt).not.toBeNull();
        await expect(
            payments.cleared(rye, id, recorded.paymentId, {}),
        ).rejects.toBeInstanceOf(ConflictException);
        await expect(
            payments.bounced(rye, id, recorded.paymentId, {}),
        ).rejects.toBeInstanceOf(ConflictException);
        expect((await auditsOf(id)).map((a) => a.action)).toEqual([
            AuditAction.InvoicePaymentRecorded,
            AuditAction.InvoiceChequeCleared,
        ]);
    });

    it("bounced: what it paid is owed again, Overdue when past due; bouncing again is a 409", async () => {
        const id = await issued(rye, "8400.00", {
            dueAt: new Date(Date.now() - 2 * DAY),
        });
        const { recorded } = await payments.record(rye, id, {
            method: "CHEQUE",
            chequeNumber: "004514",
            receivedAt: new Date(Date.now() - 3 * DAY).toISOString(),
        });
        const bounced = await payments.bounced(rye, id, recorded.paymentId, {
            reason: "Insufficient funds",
        });
        expect(bounced).toMatchObject({
            status: "ISSUED",
            standing: "OVERDUE",
            paidSoFar: "0.00",
            leftToPay: "8400.00",
            partlyPaid: false,
            chequeWaiting: false,
            paidAt: null,
            payment: null,
            payments: [
                {
                    bankStatus: "BOUNCED",
                    bounceReason: "Insufficient funds",
                },
            ],
        });
        expect(await invoiceRow(id)).toMatchObject({
            status: "ISSUED",
            paidCents: 0,
            paidAt: null,
        });
        await expect(
            payments.bounced(rye, id, recorded.paymentId, {}),
        ).rejects.toBeInstanceOf(ConflictException);
        // No bounce charge: the total stands as it was.
        expect(bounced.total).toBe("8400.00");
    });

    it("a bounce on a part payment reopens only what it paid", async () => {
        const id = await issued(rye, "2500.00");
        await payments.record(rye, id, { method: "CASH", amount: "1000" });
        const { recorded } = await payments.record(rye, id, {
            method: "CHEQUE",
            chequeNumber: "004515",
        });
        const bounced = await payments.bounced(rye, id, recorded.paymentId, {});
        expect(bounced).toMatchObject({
            status: "ISSUED",
            paidSoFar: "1000.00",
            leftToPay: "1500.00",
            partlyPaid: true,
        });
    });

    it("refuses a bounce dated before the cheque came in", async () => {
        const id = await issued(rye, "8400.00");
        const { recorded } = await payments.record(rye, id, {
            method: "CHEQUE",
        });
        await expect(
            payments.bounced(rye, id, recorded.paymentId, {
                bouncedAt: new Date(Date.now() - 5 * DAY).toISOString(),
            }),
        ).rejects.toMatchObject({
            response: { details: { field: "bouncedAt" } },
        });
    });

    it("refuses to clear or bounce a payment that isn't a cheque", async () => {
        const id = await issued(rye, "2500.00");
        const { recorded } = await payments.record(rye, id, {
            method: "UPI",
            amount: "500",
        });
        await expect(
            payments.cleared(rye, id, recorded.paymentId, {}),
        ).rejects.toThrow("Only a cheque goes to the bank.");
        await expect(
            payments.bounced(rye, id, recorded.paymentId, {}),
        ).rejects.toThrow("Only a cheque goes to the bank.");
    });

    it("refuses to clear or bounce a removed cheque", async () => {
        const id = await issued(rye, "8400.00");
        const { recorded } = await payments.record(rye, id, {
            method: "CHEQUE",
        });
        await payments.remove(rye, id, recorded.paymentId, {});
        await expect(
            payments.cleared(rye, id, recorded.paymentId, {}),
        ).rejects.toThrow("This payment was removed.");
        await expect(
            payments.bounced(rye, id, recorded.paymentId, {}),
        ).rejects.toThrow("This payment was removed.");
    });
});

describe("removing a payment", () => {
    it("removing the only payment leaves it owed; the line stays, marked removed", async () => {
        const id = await issued(rye, "2500.00");
        const { recorded } = await payments.record(rye, id, {
            method: "CASH",
        });
        const after = await payments.remove(rye, id, recorded.paymentId, {});
        expect(after).toMatchObject({
            status: "ISSUED",
            paidSoFar: "0.00",
            leftToPay: "2500.00",
            paidAt: null,
            payment: null,
            payments: [
                {
                    id: recorded.paymentId,
                    removed: { reason: "Recorded by mistake" },
                    canRemove: false,
                },
            ],
        });
        expect(await rowsOf(id)).toMatchObject([
            { removedById: "user_owner", removedReason: "Recorded by mistake" },
        ]);
        expect(await invoiceRow(id)).toMatchObject({
            status: "ISSUED",
            paidCents: 0,
        });
        expect((await auditsOf(id)).map((a) => a.action)).toEqual([
            AuditAction.InvoicePaymentRecorded,
            AuditAction.InvoicePaymentRemoved,
        ]);
    });

    it("keeps a reason given, and the invoice settles from what is left", async () => {
        const id = await issued(rye, "2500.00");
        await payments.record(rye, id, { method: "CASH", amount: "1000" });
        const { recorded } = await payments.record(rye, id, {
            method: "UPI",
        });
        const after = await payments.remove(rye, id, recorded.paymentId, {
            reason: "Wrong customer",
        });
        expect(after).toMatchObject({
            status: "ISSUED",
            paidSoFar: "1000.00",
            partlyPaid: true,
        });
        expect(after.payments?.[1].removed?.reason).toBe("Wrong customer");
    });

    it("removing twice is a 409", async () => {
        const id = await issued(rye, "2500.00");
        const { recorded } = await payments.record(rye, id, {
            method: "CASH",
        });
        await payments.remove(rye, id, recorded.paymentId, {});
        await expect(
            payments.remove(rye, id, recorded.paymentId, {}),
        ).rejects.toThrow("This payment was already removed.");
    });

    it("refuses an online payment: it is refunded instead", async () => {
        const id = await issued(rye, "2500.00");
        const paymentId = await prisma.$transaction(async (tx) => {
            const invoice = await lockInvoiceForLedgerOr404(
                tx,
                rye.organizationId,
                id,
            );
            return (
                await recordLedgerPaymentInTx(tx, invoice, {
                    amountCents: 250000,
                    method: "ONLINE",
                    receivedAt: new Date(),
                    actor: { userId: null, systemActor: "system:test-webhook" },
                })
            ).paymentId;
        });
        const read = await invoices.get(rye, id);
        expect(read.payments?.[0]).toMatchObject({
            method: "ONLINE",
            canRemove: false,
        });
        await expect(payments.remove(rye, id, paymentId, {})).rejects.toThrow(
            /Refund it instead/,
        );
        expect(await invoiceRow(id)).toMatchObject({ status: "PAID" });
        // Saroh's write names Saroh on the history.
        expect((await auditsOf(id))[0].actorUserId).toBe("system:test-webhook");
    });

    it("refuses a payment on a credited invoice", async () => {
        const id = await issued(rye, "2500.00");
        const { recorded } = await payments.record(rye, id, {
            method: "CASH",
        });
        await prisma.invoice.update({
            where: { id },
            data: { status: "CREDITED" },
        });
        await expect(
            payments.remove(rye, id, recorded.paymentId, {}),
        ).rejects.toThrow(/credited/);
    });

    it("answers a payment of another invoice with a 404", async () => {
        const one = await issued(rye, "2500.00");
        const other = await issued(rye, "2500.00");
        const { recorded } = await payments.record(rye, one, {
            method: "CASH",
        });
        await expect(
            payments.remove(rye, other, recorded.paymentId, {}),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe("what the ledger refuses", () => {
    it("an order's invoice: 409, as today", async () => {
        const order = await orderOf(rye);
        const id = await issued(rye, "1200.00", { orderId: order.id });
        await expect(
            payments.record(rye, id, { method: "CASH" }),
        ).rejects.toThrow(/Use the order/);
        expect(await rowsOf(id)).toEqual([]);
    });

    it.each(["DRAFT", "VOID", "CREDITED"])(
        "a %s invoice: 409",
        async (status) => {
            const id = await issued(rye, "2500.00", { status });
            await expect(
                payments.record(rye, id, { method: "CASH" }),
            ).rejects.toBeInstanceOf(ConflictException);
            expect(await rowsOf(id)).toEqual([]);
        },
    );

    it("a PAID invoice takes nothing more: 409", async () => {
        const id = await issued(rye, "2500.00");
        await payments.record(rye, id, { method: "CASH" });
        await expect(
            payments.record(rye, id, { method: "UPI", amount: "1" }),
        ).rejects.toThrow("This invoice is already paid.");
    });

    it("a credit note: 409", async () => {
        const id = await issued(rye, "2500.00", { kind: "CREDIT_NOTE" });
        await expect(
            payments.record(rye, id, { method: "CASH" }),
        ).rejects.toThrow("A credit note is not paid here.");
    });

    it("a ₹0 invoice: nothing is left to pay, 409", async () => {
        const id = await issued(rye, "0.00");
        await expect(
            payments.record(rye, id, { method: "CASH" }),
        ).rejects.toThrow("Nothing is left to pay on this invoice.");
    });

    it("an invoice that isn't the business's: 404", async () => {
        const theirs = await issued(pulse, "2500.00");
        await expect(
            payments.record(rye, theirs, { method: "CASH" }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(await rowsOf(theirs)).toEqual([]);
    });

    it("a partly paid invoice is not voided or credited until its payments are removed", async () => {
        const id = await issued(rye, "2500.00");
        const { recorded } = await payments.record(rye, id, {
            method: "CASH",
            amount: "1000",
        });
        await expect(
            invoices.voidInvoice(rye, id, { reason: "Wrong amount" }),
        ).rejects.toThrow(/Remove its payments/);
        await expect(
            invoices.credit(rye, id, { reason: "Wrong amount" }),
        ).rejects.toThrow(/Remove its payments/);
        await payments.remove(rye, id, recorded.paymentId, {});
        const voided = await invoices.voidInvoice(rye, id, {
            reason: "Wrong amount",
        });
        expect(voided.status).toBe("VOID");
    });
});

describe("a role without the money permission", () => {
    const member = (): OrganizationContext => ({ ...rye, role: "MEMBER" });

    it("is refused record, remove, in the bank and bounced alike (403)", async () => {
        const id = await issued(rye, "8400.00");
        const { recorded } = await payments.record(rye, id, {
            method: "CHEQUE",
        });
        const attempts = [
            payments.record(member(), id, { method: "CASH", amount: "1" }),
            payments.remove(member(), id, recorded.paymentId, {}),
            payments.cleared(member(), id, recorded.paymentId, {}),
            payments.bounced(member(), id, recorded.paymentId, {}),
        ];
        for (const attempt of attempts) {
            await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
        }
        expect(await rowsOf(id)).toMatchObject([
            { bankStatus: "WAITING", removedAt: null },
        ]);
    });
});

describe("repeats", () => {
    it("the same record twice within ten minutes is one payment", async () => {
        const id = await issued(rye, "2500.00");
        const first = await payments.record(rye, id, {
            method: "CASH",
            amount: "1000",
        });
        const again = await payments.record(rye, id, {
            method: "CASH",
            amount: "1000",
        });
        expect(again.recorded).toEqual({
            paymentId: first.recorded.paymentId,
            replayed: true,
        });
        expect(await rowsOf(id)).toHaveLength(1);
        expect(again.paidSoFar).toBe("1000.00");
    });

    it("a double tap on 'all that is left' answers as the first, not 'already paid'", async () => {
        const id = await issued(rye, "2500.00");
        const first = await payments.record(rye, id, { method: "UPI" });
        const again = await payments.record(rye, id, { method: "UPI" });
        expect(again.recorded).toEqual({
            paymentId: first.recorded.paymentId,
            replayed: true,
        });
        expect(await rowsOf(id)).toHaveLength(1);
    });

    it("'the rest' after a part payment by the same method is a new payment", async () => {
        const id = await issued(rye, "2500.00");
        await payments.record(rye, id, { method: "CASH", amount: "1000" });
        const rest = await payments.record(rye, id, { method: "CASH" });
        expect(rest.recorded.replayed).toBe(false);
        expect(rest.status).toBe("PAID");
    });

    it("a different reference, or an older payment, is not a repeat", async () => {
        const id = await issued(rye, "2500.00");
        const first = await payments.record(rye, id, {
            method: "UPI",
            amount: "500",
            reference: "UTR 1",
        });
        const other = await payments.record(rye, id, {
            method: "UPI",
            amount: "500",
            reference: "UTR 2",
        });
        expect(other.recorded.replayed).toBe(false);
        await prisma.invoicePayment.update({
            where: { id: first.recorded.paymentId },
            data: { createdAt: new Date(Date.now() - 11 * 60 * 1000) },
        });
        const later = await payments.record(rye, id, {
            method: "UPI",
            amount: "500",
            reference: "UTR 1",
        });
        expect(later.recorded.replayed).toBe(false);
        expect(await rowsOf(id)).toHaveLength(3);
    });

    it("a removed payment is not repeated: recording it again writes it again", async () => {
        const id = await issued(rye, "2500.00");
        const first = await payments.record(rye, id, {
            method: "CASH",
            amount: "1000",
        });
        await payments.remove(rye, id, first.recorded.paymentId, {});
        const again = await payments.record(rye, id, {
            method: "CASH",
            amount: "1000",
        });
        expect(again.recorded.replayed).toBe(false);
        expect(again.paidSoFar).toBe("1000.00");
    });
});

describe("two payments racing", () => {
    it("together over the total: one is recorded, the other is a 422", async () => {
        const id = await issued(rye, "2500.00");
        const results = await Promise.allSettled([
            payments.record(rye, id, { method: "CASH", amount: "1500" }),
            payments.record(rye, id, { method: "UPI", amount: "1500" }),
        ]);
        const kept = results.filter((r) => r.status === "fulfilled");
        const refused = results.filter(
            (r): r is PromiseRejectedResult => r.status === "rejected",
        );
        expect(kept).toHaveLength(1);
        expect(refused).toHaveLength(1);
        expect(refused[0].reason).toBeInstanceOf(UnprocessableEntityException);
        expect(refused[0].reason.response.details.leftToPay).toBe("1000.00");
        expect(await rowsOf(id)).toHaveLength(1);
        expect(await invoiceRow(id)).toMatchObject({
            status: "ISSUED",
            paidCents: 150000,
        });
    });

    it("the second waits on the invoice's row lock and reads what the first wrote", async () => {
        const id = await issued(rye, "2500.00");
        const held = gate();
        const locked = gate<number>();
        const first = prisma.$transaction(async (tx) => {
            const invoice = await lockInvoiceForLedgerOr404(
                tx,
                rye.organizationId,
                id,
            );
            locked.release(await backendPid(tx));
            await held.wait;
            await recordLedgerPaymentInTx(tx, invoice, {
                amountCents: 200000,
                method: "CASH",
                receivedAt: new Date(),
                actor: { userId: "user_owner" },
            });
        });
        const holder = await locked.wait;
        // Its outcome is caught at once, so the refusal is never unhandled.
        const second = payments
            .record(rye, id, { method: "UPI", amount: "1000" })
            .then(
                () => null,
                (e: unknown) => e,
            );
        // Reached the lock and waiting: the race is really run.
        await waitUntilBlockedBy(holder, "Invoice");
        held.release();
        await first;
        const refusal = await second;
        expect(refusal).toBeInstanceOf(UnprocessableEntityException);
        expect(refusal).toMatchObject({
            response: { details: { leftToPay: "500.00" } },
        });
        expect(await invoiceRow(id)).toMatchObject({ paidCents: 200000 });
    });

    it("a remove racing a payment settles from both: the cache matches the rows", async () => {
        const id = await issued(rye, "2500.00");
        const { recorded } = await payments.record(rye, id, {
            method: "CASH",
            amount: "1000",
        });
        await Promise.all([
            payments.remove(rye, id, recorded.paymentId, {}),
            payments.record(rye, id, { method: "UPI", amount: "700" }),
        ]);
        const live = (await rowsOf(id)).filter((r) => r.removedAt === null);
        expect(live.map((r) => r.amountCents)).toEqual([70000]);
        expect(await invoiceRow(id)).toMatchObject({
            status: "ISSUED",
            paidCents: 70000,
        });
    });
});

describe("one business's ledger", () => {
    it("is never reached from another's: its invoice and payments are 404s", async () => {
        const theirs = await issued(pulse, "8400.00");
        const { recorded } = await payments.record(pulse, theirs, {
            method: "CHEQUE",
        });
        await expect(
            payments.remove(rye, theirs, recorded.paymentId, {}),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            payments.cleared(rye, theirs, recorded.paymentId, {}),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            payments.bounced(rye, theirs, recorded.paymentId, {}),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(await rowsOf(theirs)).toMatchObject([
            { bankStatus: "WAITING", removedAt: null },
        ]);
    });

    it("writes its rows and history under its own business: another's context sees none", async () => {
        const id = await issued(rye, "2500.00");
        await payments.record(rye, id, { method: "CASH", amount: "1000" });
        const seen = (orgId: string) =>
            runInOrgContext(orgId, () =>
                Promise.all([
                    prisma.invoicePayment.count({ where: { invoiceId: id } }),
                    prisma.auditEvent.count({
                        where: { targetType: "invoice", targetId: id },
                    }),
                ]),
            );
        expect(await seen(rye.organizationId)).toEqual([1, 1]);
        // Only enforced where the policies exist (TEST_RLS=on); a plain run
        // connects as the owner and sees everything.
        if (isRlsTestMode()) {
            expect(await seen(pulse.organizationId)).toEqual([0, 0]);
        }
    });
});
