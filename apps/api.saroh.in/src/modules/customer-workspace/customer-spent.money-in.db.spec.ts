/**
 * A customer's "Spent" is the money-in rule (DEC-173, `invoices/money-in.ts`)
 * read per customer: an invoice that isn't an order's counts the payments on
 * its ledger that count, and an order counts its total. Against a real
 * Postgres, each case below is its own business, and the Customers list,
 * Customer Detail and Insights' best customers must each say what the
 * money-in rule says came in:
 *
 * - **a part-paid invoice:** ₹4,000 of ₹8,400 is ₹4,000 spent, not nothing
 *   until the last rupee;
 * - **a bounced cheque on a paid invoice:** ₹500 cash and a ₹1,000 cheque
 *   pay ₹1,500; the cheque bounces, and ₹500 is spent, not nothing;
 * - **an order:** its paper has no ledger, so the order's ₹1,000 counts
 *   once.
 *
 * Runs in the integration project, plain and under `TEST_RLS=on`.
 */
import { prisma, runInOrgContext } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { SellsService } from "../analytics/sells.service";
import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { InvoicePaymentsService } from "../invoices/invoice-payments.service";
import { readMoneyIn } from "../invoices/money-in";
import { CustomerDetailService } from "./customer-detail.service";
import { CustomersListService } from "./customers-list.service";

const availability = {
    listViews: jest.fn().mockResolvedValue(
        ["CRM", "COMMERCE", "APPOINTMENTS", "PAYMENTS"].map((key) => ({
            key,
            readiness: "ACTIVE",
        })),
    ),
} as unknown as ModuleAvailabilityService;

const list = new CustomersListService();
const details = new CustomerDetailService(availability);
const sells = new SellsService();
const payments = new InvoicePaymentsService();

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${Date.now()}-${++n}`;

async function business(name: string) {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("spent-in") },
    });
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: "Asia/Kolkata" },
    });
    // The store whose currency Insights reads (`businessCurrency`).
    const store = await prisma.store.create({
        data: {
            name: "Hill Road",
            slug: uniq("store"),
            organizationId: org.id,
            settings: { create: { currency: "INR" } },
        },
    });
    const ctx: OrganizationContext = {
        organizationId: org.id,
        userId: "user_owner",
        role: "OWNER",
    };
    const contactId = (
        await prisma.contact.create({
            data: {
                organizationId: org.id,
                email: `${uniq("vivek")}@example.com`,
                firstName: "Vivek",
            },
        })
    ).id;
    return { ctx, contactId, storeId: store.id };
}

async function issued(
    ctx: OrganizationContext,
    contactId: string,
    total: string,
) {
    return (
        await prisma.invoice.create({
            data: {
                organizationId: ctx.organizationId,
                contactId,
                number: uniq("INV"),
                status: "ISSUED",
                kind: "INVOICE",
                source: "MANUAL",
                currency: "INR",
                subtotal: total,
                total,
                billToName: "Vivek Nair",
                issuedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
            },
            select: { id: true },
        })
    ).id;
}

/** What each surface says the contact spent, and what came in, in paise. */
async function everySurface(ctx: OrganizationContext, contactId: string) {
    const now = new Date(Date.now() + 1000);
    const inr = (totals?: { currency: string; amount: string }[] | null) => {
        const amount = totals?.find((t) => t.currency === "INR")?.amount;
        return amount === undefined ? 0 : Math.round(Number(amount) * 100);
    };
    return runInOrgContext(ctx.organizationId, async () => {
        const [page, detail, insights, moneyIn] = await Promise.all([
            list.list(ctx, {}),
            details.detail(ctx, contactId),
            sells.read(ctx, "7d", now),
            readMoneyIn(prisma, ctx.organizationId, new Date(0)),
        ]);
        const row = page.rows.find((r) => r.contactId === contactId);
        const best = insights.customers.rows.find(
            (r) => r.contactId === contactId,
        );
        return {
            list: inr(row?.spent),
            detail: inr(detail.stats.spent),
            insights: best?.amountMinor ?? 0,
            moneyIn: moneyIn.totals.get("INR") ?? 0,
        };
    });
}

function allSay(amountMinor: number) {
    return {
        list: amountMinor,
        detail: amountMinor,
        insights: amountMinor,
        moneyIn: amountMinor,
    };
}

describe("Spent is the money-in rule, per customer (DEC-173)", () => {
    it("counts what came in on a part-paid invoice", async () => {
        const { ctx, contactId } = await business("Rye & Co.");
        const invoiceId = await issued(ctx, contactId, "8400.00");
        await payments.record(ctx, invoiceId, {
            method: "CASH",
            amount: "4000",
        });

        expect(await everySurface(ctx, contactId)).toEqual(allSay(400_000));
    });

    it("takes only a bounced cheque out of a paid invoice", async () => {
        const { ctx, contactId } = await business("Pulse Fitness");
        const invoiceId = await issued(ctx, contactId, "1500.00");
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
        expect(await everySurface(ctx, contactId)).toEqual(allSay(150_000));

        await payments.bounced(ctx, invoiceId, recorded.paymentId, {
            reason: "Signature didn't match",
        });

        expect(await everySurface(ctx, contactId)).toEqual(allSay(50_000));
    });

    it("counts an order's total once, its paper by its paid date", async () => {
        const { ctx, contactId, storeId } = await business("Kettle");
        const org = ctx.organizationId;
        const shopper = await prisma.customer.create({
            data: {
                storeId,
                organizationId: org,
                email: `${uniq("shop")}@example.com`,
            },
        });
        await prisma.customerIdentityLink.create({
            data: { organizationId: org, contactId, customerId: shopper.id },
        });
        const paidAt = new Date(Date.now() - 60 * 60 * 1000);
        const order = await prisma.order.create({
            data: {
                storeId,
                organizationId: org,
                customerId: shopper.id,
                orderId: uniq("ORD"),
                subtotal: "1000",
                total: "1000",
                currency: "INR",
                paymentStatus: "PAID",
                status: "DELIVERED",
                paidAt,
            },
        });
        // The order's paper: no ledger rows, the order is its ledger.
        await prisma.invoice.create({
            data: {
                organizationId: org,
                contactId,
                orderId: order.id,
                number: uniq("INV"),
                status: "PAID",
                kind: "INVOICE",
                source: "ORDER",
                currency: "INR",
                subtotal: "1000",
                total: "1000",
                issuedAt: paidAt,
                paidAt,
            },
        });

        expect(await everySurface(ctx, contactId)).toEqual(allSay(100_000));
    });
});
