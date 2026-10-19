/**
 * Home's `week.chequesWaiting` (DEC-173, invoices U4 #1116) against a real
 * Postgres: two cheques waiting for the bank, ₹8,400 and ₹5,600, read
 * 2 · ₹14,000 in minor units with a link to the list's cheques view; a
 * cleared, bounced or removed cheque isn't counted; none waiting is null;
 * a role without `payment:read` gets null; and it says what the Invoices
 * money strip says. Only this business's cheques count.
 *
 * Runs in the integration project, plain and under `TEST_RLS=on`.
 */
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { InvoicePaymentsService } from "../invoices/invoice-payments.service";
import { InvoiceSummaryService } from "../invoices/invoice-summary.service";
import { readWeek, weekScope } from "./home-week";

const payments = new InvoicePaymentsService();
const summaries = new InvoiceSummaryService();

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;
const ZONE = "Asia/Kolkata";
const ALL = new Set(["PAYMENTS", "APPOINTMENTS", "COMMERCE"]);

async function business(name: string): Promise<OrganizationContext> {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("home-cheques") },
    });
    return { organizationId: org.id, userId: "user_owner", role: "OWNER" };
}

async function issued(ctx: OrganizationContext, total: string) {
    const row = await prisma.invoice.create({
        data: {
            organizationId: ctx.organizationId,
            number: uniq("RC"),
            status: "ISSUED",
            currency: "INR",
            subtotal: total,
            total,
            billToName: "Vivek Nair",
            issuedAt: new Date(),
            dueAt: new Date(Date.now() + 7 * 86_400_000),
        },
        select: { id: true },
    });
    return row.id;
}

async function cheque(ctx: OrganizationContext, total: string) {
    const invoiceId = await issued(ctx, total);
    const { recorded } = await payments.record(ctx, invoiceId, {
        method: "CHEQUE",
        chequeNumber: uniq("00"),
    });
    return { invoiceId, paymentId: recorded.paymentId };
}

const owner = (ctx: OrganizationContext) => ({
    organizationId: ctx.organizationId,
    organizationRole: "OWNER" as const,
});

async function weekFor(
    ctx: OrganizationContext,
    input: Parameters<typeof weekScope>[0] = owner(ctx),
) {
    const scope = weekScope(input, ALL);
    if (!scope) throw new Error("no week for this viewer");
    return readWeek(prisma, ctx.organizationId, scope, {
        now: new Date(),
        zone: ZONE,
    });
}

let rye: OrganizationContext;

beforeAll(async () => {
    rye = await business("Rye & Co.");
    await cheque(rye, "8400.00");
    await cheque(rye, "5600.00");
    const cleared = await cheque(rye, "700.00");
    await payments.cleared(rye, cleared.invoiceId, cleared.paymentId, {});
    const bounced = await cheque(rye, "900.00");
    await payments.bounced(rye, bounced.invoiceId, bounced.paymentId, {});
    const removed = await cheque(rye, "650.00");
    await payments.remove(rye, removed.invoiceId, removed.paymentId, {});
    // Cash is not a cheque.
    await payments.record(rye, await issued(rye, "500.00"), {
        method: "CASH",
    });
    // Another business's waiting cheque.
    await cheque(await business("Pulse Fitness"), "4000.00");
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe("Home week.chequesWaiting (DEC-173, U4)", () => {
    it("says 2 · ₹14,000 for two waiting cheques, linked to the list's cheques view", async () => {
        const week = await weekFor(rye);
        expect(week.chequesWaiting).toEqual({
            count: 2,
            totals: [{ currency: "INR", amountMinor: 1_400_000 }],
            href: "/billing/invoices?view=cheques",
        });
    });

    it("says what the Invoices money strip says", async () => {
        const [week, summary] = await Promise.all([
            weekFor(rye),
            summaries.summary(rye),
        ]);
        expect(summary.chequesWaiting?.count).toBe(week.chequesWaiting?.count);
        expect(summary.chequesWaiting?.totals).toEqual(
            week.chequesWaiting?.totals,
        );
    });

    it("is null while no cheque waits", async () => {
        const quiet = await business("Quiet");
        const done = await cheque(quiet, "8400.00");
        await payments.cleared(quiet, done.invoiceId, done.paymentId, {});
        expect((await weekFor(quiet)).chequesWaiting).toBeNull();
    });

    it("is null for a role without payment:read", async () => {
        const week = await weekFor(rye, {
            organizationId: rye.organizationId,
            organizationRole: "MEMBER",
            organizationActions: new Set(["invoice:read", "booking:read"]),
        });
        expect(week.chequesWaiting).toBeNull();
    });
});
