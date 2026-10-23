/**
 * The Invoices money strip's one read (DEC-173, invoices U4 #1116) against
 * a real Postgres: Owed is what is left to pay, Overdue uses `isPastDue`,
 * Paid this month counts payments received from the 1st in the business's
 * zone (a payment at 00:30 IST on the 1st counts, one at 23:30 the night
 * before doesn't) plus an order's paper paid this month, each rupee once;
 * Drafts leave out a pay-now hold; and "Cheques not in the bank" counts
 * only waiting cheques — never a cleared, bounced or removed one. Without
 * `payment:read` every figure is a count. One business never sees
 * another's.
 *
 * Runs in the integration project, plain and under `TEST_RLS=on`.
 */
import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { DateTime } from "luxon";

import type { OrganizationContext } from "../../common/types/organization-context";
import { InvoicePaymentsService } from "./invoice-payments.service";
import { InvoiceSummaryService } from "./invoice-summary.service";

const payments = new InvoicePaymentsService();
const summaries = new InvoiceSummaryService();

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;
const DAY = 24 * 60 * 60 * 1000;
const ZONE = "Asia/Kolkata";

// The 1st of this month in Mumbai, and 30 minutes either side of it.
const FIRST = DateTime.now().setZone(ZONE).startOf("month");
const HALF_PAST_MIDNIGHT_ON_THE_1ST = FIRST.plus({ minutes: 30 }).toJSDate();
const HALF_PAST_ELEVEN_THE_NIGHT_BEFORE = FIRST.minus({
    minutes: 30,
}).toJSDate();

let rye: OrganizationContext;
let pulse: OrganizationContext;

async function business(name: string): Promise<OrganizationContext> {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("inv-summary") },
    });
    return { organizationId: org.id, userId: "user_owner", role: "OWNER" };
}

async function issued(
    ctx: OrganizationContext,
    total: string,
    over: {
        status?: string;
        dueAt?: Date;
        orderId?: string;
        kind?: string;
        paidAt?: Date;
        number?: string | null;
        source?: string;
    } = {},
): Promise<string> {
    const status = over.status ?? "ISSUED";
    const row = await prisma.invoice.create({
        data: {
            organizationId: ctx.organizationId,
            number:
                over.number !== undefined
                    ? over.number
                    : status === "DRAFT"
                      ? null
                      : uniq("RC"),
            status,
            kind: over.kind ?? "INVOICE",
            currency: "INR",
            subtotal: total,
            total,
            billToName: "Vivek Nair",
            issuedAt: status === "DRAFT" ? null : new Date(),
            dueAt: over.dueAt ?? new Date(Date.now() + 7 * DAY),
            paidAt: over.paidAt ?? null,
            orderId: over.orderId ?? null,
            source: over.source ?? (over.orderId ? "ORDER" : "MANUAL"),
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

async function cheque(
    ctx: OrganizationContext,
    invoiceId: string,
    amount?: string,
) {
    const { recorded } = await payments.record(ctx, invoiceId, {
        method: "CHEQUE",
        chequeNumber: uniq("00"),
        chequeBank: "HDFC Bank",
        ...(amount ? { amount } : {}),
    });
    return recorded.paymentId;
}

beforeAll(async () => {
    rye = await business("Rye & Co.");
    pulse = await business("Pulse Fitness");

    // Owed, part paid: ₹1,000 of ₹2,500 at 00:30 IST on the 1st.
    const partly = await issued(rye, "2500.00");
    await payments.record(rye, partly, {
        method: "CASH",
        amount: "1000",
        receivedAt: HALF_PAST_MIDNIGHT_ON_THE_1ST.toISOString(),
    });
    // Owed and overdue: ₹3,000, due two days ago.
    await issued(rye, "3000.00", { dueAt: new Date(Date.now() - 2 * DAY) });
    // Paid in full at 23:30 IST the night before the 1st: last month.
    const lastMonth = await issued(rye, "1200.00");
    await payments.record(rye, lastMonth, {
        method: "UPI",
        receivedAt: HALF_PAST_ELEVEN_THE_NIGHT_BEFORE.toISOString(),
    });
    // Two cheques waiting for the bank: ₹8,400 pays one in full, ₹5,600
    // pays part of ₹10,000 (₹4,400 left).
    await cheque(rye, await issued(rye, "8400.00"));
    await cheque(rye, await issued(rye, "10000.00"), "5600");
    // Cheques that aren't waiting: one in the bank, one bounced (owed
    // again), one removed (owed again).
    const clearedOn = await issued(rye, "700.00");
    await payments.cleared(rye, clearedOn, await cheque(rye, clearedOn), {});
    const bouncedOn = await issued(rye, "900.00");
    await payments.bounced(rye, bouncedOn, await cheque(rye, bouncedOn), {});
    const removedOn = await issued(rye, "650.00");
    await payments.remove(rye, removedOn, await cheque(rye, removedOn), {});
    // A draft, and a pay-now hold the list never shows.
    await issued(rye, "700.00", { status: "DRAFT" });
    await issued(rye, "450.00", {
        status: "DRAFT",
        number: null,
        source: "BOOKING",
    });
    // An order's paper: paid this month (its order is its ledger), and one
    // still open, which is owed on the order, not here.
    await issued(rye, "1200.00", {
        status: "PAID",
        orderId: (await orderOf(rye)).id,
        paidAt: new Date(),
    });
    await issued(rye, "999.00", { orderId: (await orderOf(rye)).id });
    // A credit note is never owed.
    await issued(rye, "300.00", { kind: "CREDIT_NOTE" });

    // Another business's cheque and money never reach Rye's strip.
    const theirs = await issued(pulse, "4000.00");
    await cheque(pulse, theirs);
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe("GET invoices/summary (DEC-173, U4)", () => {
    it("adds up Owed, Overdue, Paid this month, Drafts and the cheques, each with its filter", async () => {
        const summary = await summaries.summary(rye);
        expect(summary).toEqual({
            zone: ZONE,
            monthStart: FIRST.toISODate(),
            money: true,
            // Left to pay: 1,500 + 3,000 + 4,400 + 900 (bounced) + 650
            // (removed).
            owed: {
                count: 5,
                totals: [{ currency: "INR", amountMinor: 1_045_000 }],
                filter: { view: "owed" },
            },
            overdue: {
                count: 1,
                totals: [{ currency: "INR", amountMinor: 300_000 }],
                filter: { view: "overdue" },
            },
            // 1,000 (00:30 IST on the 1st) + 8,400 + 5,600 (waiting
            // cheques count as received) + 700 (cleared) + 1,200 (an
            // order's paper), on five invoices.
            paidThisMonth: {
                count: 5,
                totals: [{ currency: "INR", amountMinor: 1_690_000 }],
                filter: { paidFrom: FIRST.toISODate() },
            },
            drafts: {
                count: 1,
                totals: [{ currency: "INR", amountMinor: 70_000 }],
                filter: { view: "draft" },
            },
            chequesWaiting: {
                count: 2,
                totals: [{ currency: "INR", amountMinor: 1_400_000 }],
                filter: { view: "cheques" },
            },
        });
    });

    it("gives counts only to a role without payment:read (DEC-098)", async () => {
        const summary = await summaries.summary({
            ...rye,
            role: "MEMBER",
            actions: new Set(["invoice:read"]),
        });
        expect(summary.money).toBe(false);
        expect(summary.owed).toEqual({ count: 5, filter: { view: "owed" } });
        expect(summary.chequesWaiting).toEqual({
            count: 2,
            filter: { view: "cheques" },
        });
        expect(JSON.stringify(summary)).not.toContain("amountMinor");
    });

    it("refuses someone who can't read invoices", async () => {
        await expect(
            summaries.summary({
                ...rye,
                role: "MEMBER",
                actions: new Set(["payment:read"]),
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("sends no cheques line while none waits, and zeros for a new business", async () => {
        const fresh = await business("Fresh");
        const summary = await summaries.summary(fresh);
        expect(summary.chequesWaiting).toBeNull();
        expect(summary.owed).toEqual({
            count: 0,
            totals: [],
            filter: { view: "owed" },
        });
        expect(summary.paidThisMonth.count).toBe(0);
    });

    it("sees only its own business's cheques and money", async () => {
        const summary = await summaries.summary(pulse);
        expect(summary.chequesWaiting).toEqual({
            count: 1,
            totals: [{ currency: "INR", amountMinor: 400_000 }],
            filter: { view: "cheques" },
        });
        expect(summary.owed.count).toBe(0);
        expect(summary.paidThisMonth.totals).toEqual([
            { currency: "INR", amountMinor: 400_000 },
        ]);
    });

    it("keeps the month in the business's own zone", async () => {
        const nyc = await business("Brooklyn");
        await prisma.businessProfile.create({
            data: {
                organizationId: nyc.organizationId,
                timezone: "America/New_York",
            },
        });
        // 03:00 UTC on 1 Nov is still 31 Oct in New York.
        const summary = await summaries.summary(
            nyc,
            new Date("2026-11-01T03:00:00.000Z"),
        );
        expect(summary).toMatchObject({
            zone: "America/New_York",
            monthStart: "2026-10-01",
        });
    });
});
