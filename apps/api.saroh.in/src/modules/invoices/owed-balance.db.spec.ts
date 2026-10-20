/**
 * Owed means what is left to pay (DEC-173, U3 #1115), against a real
 * Postgres: an invoice of ₹2,500 with ₹1,000 recorded on its ledger owes
 * ₹1,500 on Home's week, Home's overdue row, a customer's Owed and
 * `GET /owed`. An order's own invoice is still never owed (`OWED_WHERE`,
 * ADR-008).
 *
 * Runs in the integration project, plain and under `TEST_RLS=on`.
 */
import { prisma, runInOrgContext } from "@saroh/database";

import { isRlsTestMode } from "../../../test/rls-mode";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { CustomerDetailService } from "../customer-workspace/customer-detail.service";
import { overdueInvoices } from "../home/home-money-sources";
import { readOwed } from "../home/home-week";
import { InvoicesService } from "./invoices.service";

const DAY = 24 * 60 * 60 * 1000;
let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;

const availability = {
    listViews: jest.fn().mockResolvedValue(
        ["CRM", "COMMERCE", "APPOINTMENTS", "PAYMENTS"].map((key) => ({
            key,
            readiness: "ACTIVE",
        })),
    ),
} as unknown as ModuleAvailabilityService;

const invoices = new InvoicesService();
const details = new CustomerDetailService(availability);

let ctx: OrganizationContext;
let contactId: string;
let partId: string;

/** Run as the business: in its RLS context when the suite asks for one. */
function asBusiness<T>(run: () => Promise<T>): Promise<T> {
    return isRlsTestMode() ? runInOrgContext(ctx.organizationId, run) : run();
}

async function issued(
    total: string,
    over: { dueAt?: Date; orderId?: string } = {},
): Promise<string> {
    const row = await prisma.invoice.create({
        data: {
            organizationId: ctx.organizationId,
            contactId,
            number: uniq("RC"),
            status: "ISSUED",
            kind: "INVOICE",
            currency: "INR",
            subtotal: total,
            total,
            billToName: "Meera Iyer",
            billToEmail: "meera.iyer@example.com",
            issuedAt: new Date(Date.now() - 10 * DAY),
            dueAt: over.dueAt ?? new Date(Date.now() + 7 * DAY),
            orderId: over.orderId ?? null,
            source: over.orderId ? "ORDER" : "MANUAL",
        },
        select: { id: true },
    });
    return row.id;
}

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Saffron Tailors", slug: uniq("owed-balance") },
    });
    ctx = { organizationId: org.id, userId: "user_owner", role: "OWNER" };
    contactId = (
        await prisma.contact.create({
            data: {
                organizationId: org.id,
                email: "meera.iyer@example.com",
                firstName: "Meera",
                lastName: "Iyer",
            },
        })
    ).id;

    // ₹2,500, two days past due, ₹1,000 paid by hand: ₹1,500 owed.
    partId = await issued("2500.00", {
        dueAt: new Date(Date.now() - 2 * DAY),
    });
    await asBusiness(() =>
        invoices.recordPayment(ctx, partId, {
            method: "CASH",
            amount: "1000.00",
        }),
    );

    // An order's own invoice, issued and unpaid: the order owes it, never
    // the invoices (ADR-008).
    const store = await prisma.store.create({
        data: {
            organizationId: org.id,
            name: "Counter",
            slug: uniq("store"),
        },
    });
    const order = await prisma.order.create({
        data: {
            storeId: store.id,
            organizationId: org.id,
            orderId: uniq("ORD"),
            subtotal: "900.00",
            total: "900.00",
            currency: "INR",
        },
    });
    await issued("900.00", { orderId: order.id });
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe("what is owed is what is left to pay (DEC-173)", () => {
    it("the invoice reads ₹1,000 paid and ₹1,500 left", async () => {
        const view = await asBusiness(() => invoices.get(ctx, partId));
        expect(view).toMatchObject({
            status: "ISSUED",
            paidSoFar: "1000.00",
            leftToPay: "1500.00",
            partlyPaid: true,
        });
    });

    it("Home's week owes ₹1,500 on one bill, overdue, and leaves the order's invoice out", async () => {
        const owed = await asBusiness(() =>
            readOwed(prisma, ctx.organizationId, new Date()),
        );
        expect(owed).toEqual({
            totals: [{ currency: "INR", amountMinor: 150_000 }],
            bills: 1,
            overdue: 1,
            href: "/billing/invoices?view=overdue",
        });
    });

    it("Home's overdue row asks for ₹1,500", async () => {
        const action = await asBusiness(() =>
            overdueInvoices(prisma, ctx.organizationId, new Date()),
        );
        expect(action?.evidence).toEqual([
            expect.objectContaining({
                id: partId,
                amountMinor: 150_000,
                currency: "INR",
            }),
        ]);
    });

    it("GET /owed for the customer says ₹1,500", async () => {
        await expect(
            asBusiness(() => invoices.owed(ctx, { contactId })),
        ).resolves.toEqual({
            unpaidCount: 1,
            overdueCount: 1,
            totals: [{ currency: "INR", amount: "1500.00" }],
        });
    });

    it("the customer's Owed says ₹1,500", async () => {
        const detail = await asBusiness(() => details.detail(ctx, contactId));
        expect(detail.stats.owed).toEqual({
            totals: [{ currency: "INR", amount: "1500.00" }],
            unpaidCount: 1,
            overdueCount: 1,
        });
    });

    it("the rest paid by hand: nothing is owed any more", async () => {
        await asBusiness(() =>
            invoices.recordPayment(ctx, partId, { method: "UPI" }),
        );
        await expect(
            asBusiness(() => invoices.owed(ctx, { contactId })),
        ).resolves.toEqual({ unpaidCount: 0, overdueCount: 0, totals: [] });
        const owed = await asBusiness(() =>
            readOwed(prisma, ctx.organizationId, new Date()),
        );
        expect(owed).toMatchObject({ totals: [], bills: 0, overdue: 0 });
    });
});
