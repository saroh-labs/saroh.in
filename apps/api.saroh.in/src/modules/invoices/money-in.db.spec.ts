/**
 * Money in is one rule (DEC-173, `money-in.ts`), and every surface that
 * says how much came in reads it: the Invoices strip's Paid this month,
 * Home's Money in today, This week and How it's going, and Insights'
 * money in and today. Against a real Postgres, each case below is its own
 * business, and every surface must say the same figure for it:
 *
 * - **a part-paid invoice:** ₹400 of ₹1,000 in today counts ₹400 today,
 *   not nothing until the last rupee and then the whole ₹1,000;
 * - **a bounced cheque on a paid invoice:** ₹500 cash and a ₹1,000 cheque
 *   pay ₹1,500; the cheque bounces, and ₹500 is what came in;
 * - **a back-dated payment:** ₹600 today, then ₹400 recorded today as
 *   received 40 days ago: ₹600 came in today, never the whole ₹1,000.
 *
 * Runs in the integration project, plain and under `TEST_RLS=on`.
 */
import { prisma, runInOrgContext } from "@saroh/database";
import { DateTime } from "luxon";

import type { OrganizationContext } from "../../common/types/organization-context";
import { TakingsService } from "../analytics/takings.service";
import { readGoing } from "../home/home-going";
import { readMoneyToday } from "../home/home-money-today";
import { readWeek } from "../home/home-week";
import { InvoicePaymentsService } from "./invoice-payments.service";
import { InvoiceSummaryService } from "./invoice-summary.service";

const payments = new InvoicePaymentsService();
const summaries = new InvoiceSummaryService();
const insights = new TakingsService();

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${Date.now()}-${++n}`;
const ZONE = "Asia/Kolkata";
const DAY = 24 * 60 * 60 * 1000;

async function business(name: string): Promise<OrganizationContext> {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("money-in") },
    });
    // The zone every surface reads (`businessTimezone`).
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: ZONE },
    });
    return { organizationId: org.id, userId: "user_owner", role: "OWNER" };
}

async function issued(ctx: OrganizationContext, total: string) {
    const row = await prisma.invoice.create({
        data: {
            organizationId: ctx.organizationId,
            number: uniq("RC"),
            status: "ISSUED",
            kind: "INVOICE",
            source: "MANUAL",
            currency: "INR",
            subtotal: total,
            total,
            billToName: "Vivek Nair",
            issuedAt: new Date(Date.now() - 60 * DAY),
            dueAt: new Date(Date.now() + 7 * DAY),
        },
        select: { id: true },
    });
    return row.id;
}

/** Every surface's money in for one business, today, in paise. */
async function everySurface(ctx: OrganizationContext) {
    // A moment after the payments, so "to now" windows hold them.
    const now = new Date(Date.now() + 1000);
    const clock = { now, zone: ZONE };
    const id = ctx.organizationId;
    const scope = {
        takings: true,
        bookings: false,
        orders: false,
        owed: false,
    };
    const inr = (totals: { currency: string; amountMinor: number }[] = []) =>
        totals.find((t) => t.currency === "INR")?.amountMinor ?? 0;
    return runInOrgContext(id, async () => {
        const [strip, today, week, going, money] = await Promise.all([
            summaries.summary(ctx, now),
            readMoneyToday(prisma, id, clock, { calendar: false }),
            readWeek(prisma, id, scope, clock),
            readGoing(prisma, id, scope, clock, { money: true }),
            insights.money(ctx, "7d", now),
        ]);
        return {
            strip: inr(strip.paidThisMonth.totals),
            homeToday: inr(today.totals),
            homeThisWeek: inr(week.takings),
            homeGoing: inr(going.sales),
            insightsToday: money.today.amountMinor,
            insights7Days: money.moneyIn.amountMinor,
        };
    });
}

function allSay(amountMinor: number) {
    return {
        strip: amountMinor,
        homeToday: amountMinor,
        homeThisWeek: amountMinor,
        homeGoing: amountMinor,
        insightsToday: amountMinor,
        insights7Days: amountMinor,
    };
}

describe("money in, one rule on every surface (DEC-173)", () => {
    it("counts a part payment on the day it came in, everywhere", async () => {
        const ctx = await business("Rye & Co.");
        const invoiceId = await issued(ctx, "1000.00");
        await payments.record(ctx, invoiceId, {
            method: "CASH",
            amount: "400",
        });

        expect(await everySurface(ctx)).toEqual(allSay(40_000));
    });

    it("takes a bounced cheque out of a paid invoice's money, everywhere", async () => {
        const ctx = await business("Pulse Fitness");
        const invoiceId = await issued(ctx, "1500.00");
        await payments.record(ctx, invoiceId, {
            method: "CASH",
            amount: "500",
        });
        const { recorded } = await payments.record(ctx, invoiceId, {
            method: "CHEQUE",
            amount: "1000",
            chequeNumber: "004512",
            chequeBank: "HDFC Bank",
        });
        const paid = await prisma.invoice.findUniqueOrThrow({
            where: { id: invoiceId },
            select: { status: true },
        });
        expect(paid.status).toBe("PAID");
        await payments.bounced(ctx, invoiceId, recorded.paymentId, {
            reason: "Signature didn't match",
        });

        expect(await everySurface(ctx)).toEqual(allSay(50_000));
    });

    it("counts a back-dated payment on the day it was received, never today", async () => {
        const ctx = await business("Kettle");
        const invoiceId = await issued(ctx, "1000.00");
        await payments.record(ctx, invoiceId, { method: "UPI", amount: "600" });
        // Recorded now, received 40 days ago: outside every window here.
        const longAgo = DateTime.now()
            .setZone(ZONE)
            .minus({ days: 40 })
            .toJSDate();
        await payments.record(ctx, invoiceId, {
            method: "CASH",
            amount: "400",
            receivedAt: longAgo.toISOString(),
        });
        const paid = await prisma.invoice.findUniqueOrThrow({
            where: { id: invoiceId },
            select: { status: true },
        });
        expect(paid.status).toBe("PAID");

        expect(await everySurface(ctx)).toEqual(allSay(60_000));
    });
});
