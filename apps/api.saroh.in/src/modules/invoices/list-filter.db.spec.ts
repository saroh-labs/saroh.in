/**
 * D18 against a real Postgres: the Invoices list narrowed by what each
 * paper was for — every source now in the data (an online order, one taken
 * at the counter, a walk-in's, a booking, a subscription, a pack, a course,
 * one written by hand) — and by one pack, course or order. A correction
 * follows its original, and the unnumbered drafts the list never shows
 * (a pay-now hold, a pack being bought online) stay hidden under every
 * filter.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";
import { DateTime } from "luxon";

import { analyzeAsOwner } from "../../../test/analyze";
import type { OrganizationContext } from "../../common/types/organization-context";
import { InvoicePaymentsService } from "./invoice-payments.service";
import { InvoicesService } from "./invoices.service";

const service = new InvoicesService();

let org: OrganizationContext;
let contactId: string;
let seq = 0;
const next = () => `${process.pid}-${++seq}`;

/** Every paper made below, by what it stands for. */
const ids: Record<string, string> = {};
let morningPack: string;
let eveningPack: string;
let pottery: string;
let counterOrder: string;

beforeAll(async () => {
    const created = await prisma.organization.create({
        data: { name: "Pulse Test", slug: `d18-${next()}` },
    });
    org = { organizationId: created.id, userId: "user_1", role: "OWNER" };
    contactId = (
        await prisma.contact.create({
            data: {
                organizationId: created.id,
                email: `asha-${next()}@example.in`,
                firstName: "Asha",
            },
        })
    ).id;
});

interface Paper {
    source: string;
    number?: string | null;
    status?: string;
    kind?: string;
    relatedInvoiceId?: string;
    orderId?: string;
    packPurchaseId?: string;
    courseEnrollmentId?: string;
    billToName?: string;
    contactId?: string | null;
}

async function paper(p: Paper): Promise<string> {
    const numbered = p.number !== null;
    const inv = await prisma.invoice.create({
        data: {
            organizationId: org.organizationId,
            contactId: p.contactId === undefined ? contactId : p.contactId,
            number: numbered ? (p.number ?? `INV-${next()}`) : null,
            status: p.status ?? (numbered ? "ISSUED" : "DRAFT"),
            kind: p.kind ?? "INVOICE",
            source: p.source,
            relatedInvoiceId: p.relatedInvoiceId ?? null,
            orderId: p.orderId ?? null,
            packPurchaseId: p.packPurchaseId ?? null,
            courseEnrollmentId: p.courseEnrollmentId ?? null,
            billToName: p.billToName ?? "Asha",
            issuedAt: numbered ? new Date() : null,
            currency: "INR",
            subtotal: "500.00",
            total: "500.00",
        },
    });
    return inv.id;
}

async function pack(name: string): Promise<{ pack: string; sold: string }> {
    const created = await prisma.classPack.create({
        data: {
            organizationId: org.organizationId,
            name,
            credits: 10,
            validityDays: 90,
            price: "4500.00",
            currency: "INR",
            status: "ACTIVE",
        },
    });
    const sold = await prisma.packPurchase.create({
        data: {
            organizationId: org.organizationId,
            packId: created.id,
            contactId,
            credits: 10,
            price: "4500.00",
            currency: "INR",
            expiresAt: new Date(Date.now() + 90 * 86_400_000),
        },
    });
    return { pack: created.id, sold: sold.id };
}

async function order(
    storeId: string,
    over: { placedOnline?: boolean; walkInName?: string } = {},
): Promise<string> {
    const customer = over.walkInName
        ? null
        : await prisma.customer.create({
              data: {
                  storeId,
                  organizationId: org.organizationId,
                  email: `shop-${next()}@example.in`,
              },
          });
    return (
        await prisma.order.create({
            data: {
                storeId,
                organizationId: org.organizationId,
                orderId: `ORD-${next()}`,
                customerId: customer?.id ?? null,
                walkInName: over.walkInName ?? null,
                placedOnline: over.placedOnline ?? false,
                subtotal: "500",
                total: "500",
                currency: "INR",
                paymentStatus: "PAID",
            },
        })
    ).id;
}

beforeAll(async () => {
    const store = await prisma.store.create({
        data: {
            name: "Pulse",
            slug: `d18-store-${next()}`,
            organizationId: org.organizationId,
        },
    });
    const online = await order(store.id, { placedOnline: true });
    counterOrder = await order(store.id);
    const walkIn = await order(store.id, { walkInName: "Ravi" });
    ids.online = await paper({ source: "ORDER", orderId: online });
    ids.counter = await paper({ source: "ORDER", orderId: counterOrder });
    ids.counterCredit = await paper({
        source: "ORDER",
        kind: "CREDIT_NOTE",
        orderId: counterOrder,
        relatedInvoiceId: ids.counter,
    });
    ids.walkIn = await paper({
        source: "ORDER",
        orderId: walkIn,
        contactId: null,
        billToName: "Ravi (walk-in)",
    });

    ids.booking = await paper({ source: "BOOKING" });
    ids.subscription = await paper({ source: "SUBSCRIPTION" });
    // A credit note against a renewal is written MANUAL: it still files
    // under Subscriptions.
    ids.subscriptionCredit = await paper({
        source: "MANUAL",
        kind: "CREDIT_NOTE",
        relatedInvoiceId: ids.subscription,
    });
    ids.manual = await paper({ source: "MANUAL" });
    ids.manualDraft = await paper({ source: "MANUAL", number: null });

    const morning = await pack("Morning pack");
    const evening = await pack("Evening pack");
    morningPack = morning.pack;
    eveningPack = evening.pack;
    ids.morning = await paper({
        source: "PACK",
        packPurchaseId: morning.sold,
        status: "PAID",
    });
    ids.evening = await paper({
        source: "PACK",
        packPurchaseId: evening.sold,
    });

    const service0 = await prisma.service.create({
        data: {
            organizationId: org.organizationId,
            name: "Wheel",
            durationMinutes: 60,
            capacity: 8,
            priceCents: 60_000,
            currency: "INR",
            timezone: "Asia/Kolkata",
        },
    });
    const course = await prisma.course.create({
        data: {
            organizationId: org.organizationId,
            serviceId: service0.id,
            name: "Pottery",
            price: "6000",
            currency: "INR",
            seats: 8,
            status: "OPEN",
        },
    });
    pottery = course.id;
    const enrolment = await prisma.courseEnrollment.create({
        data: {
            organizationId: org.organizationId,
            courseId: course.id,
            contactId,
            price: "6000",
            currency: "INR",
        },
    });
    ids.course = await paper({
        source: "COURSE",
        courseEnrollmentId: enrolment.id,
    });

    // Never listed: a pay-now hold's draft and a pack being bought online.
    ids.holdDraft = await paper({ source: "BOOKING", number: null });
    ids.packDraft = await paper({ source: "PACK", number: null });
});

const listed = async (query: Parameters<InvoicesService["list"]>[1]) =>
    new Set((await service.list(org, query)).map((i) => i.id));

const only = (...keys: string[]) => new Set(keys.map((k) => ids[k]));

describe("the Invoices list by what it was for (real database)", () => {
    it("Orders: online, at the counter and a walk-in's, with their corrections", async () => {
        expect(await listed({ source: "ORDER" })).toEqual(
            only("online", "counter", "counterCredit", "walkIn"),
        );
    });

    it("keeps a walk-in's bill-to as B13 wrote it", async () => {
        const rows = await service.list(org, { source: "ORDER" });
        expect(rows.find((r) => r.id === ids.walkIn)?.billTo?.name).toBe(
            "Ravi (walk-in)",
        );
    });

    it("Bookings: the paid booking only, never a hold's draft", async () => {
        expect(await listed({ source: "BOOKING" })).toEqual(only("booking"));
    });

    it("Subscriptions: the renewal and the credit note against it", async () => {
        expect(await listed({ source: "SUBSCRIPTION" })).toEqual(
            only("subscription", "subscriptionCredit"),
        );
    });

    it("Packs: what was sold, never a draft being bought online", async () => {
        expect(await listed({ source: "PACK" })).toEqual(
            only("morning", "evening"),
        );
    });

    it("Courses", async () => {
        expect(await listed({ source: "COURSE" })).toEqual(only("course"));
    });

    it("By hand: written by hand, drafts included, and no correction of another's", async () => {
        expect(await listed({ source: "MANUAL" })).toEqual(
            only("manual", "manualDraft"),
        );
    });

    it("every source together is the whole list", async () => {
        const all = await listed({});
        const bySource = new Set<string>();
        for (const source of [
            "ORDER",
            "BOOKING",
            "SUBSCRIPTION",
            "PACK",
            "COURSE",
            "MANUAL",
        ] as const) {
            for (const id of await listed({ source })) bySource.add(id);
        }
        expect(bySource).toEqual(all);
        expect(all.has(ids.holdDraft!)).toBe(false);
        expect(all.has(ids.packDraft!)).toBe(false);
    });

    it("?pack= lists only that pack's sales", async () => {
        expect(await listed({ packId: morningPack })).toEqual(only("morning"));
        expect(await listed({ packId: eveningPack })).toEqual(only("evening"));
    });

    it("a pack with nothing sold lists nothing, and so does another business's", async () => {
        expect(await listed({ packId: "no-such-pack" })).toEqual(new Set());
        const other = await prisma.organization.create({
            data: { name: "Elsewhere", slug: `d18-other-${next()}` },
        });
        const theirs = await service.list(
            { ...org, organizationId: other.id },
            { packId: morningPack },
        );
        expect(theirs).toEqual([]);
    });

    it("?pack= with a status tab narrows both ways", async () => {
        expect(await listed({ packId: morningPack, view: "paid" })).toEqual(
            only("morning"),
        );
        expect(await listed({ packId: morningPack, view: "issued" })).toEqual(
            new Set(),
        );
    });

    it("?course= and ?order= list that course's and that order's paper", async () => {
        expect(await listed({ courseId: pottery })).toEqual(only("course"));
        expect(await listed({ orderId: counterOrder })).toEqual(
            only("counter", "counterCredit"),
        );
    });
});

/**
 * DEC-173 (invoices U4 #1116): the list's search by name, number and
 * amount (the total, or what is left to pay), the Owed and Cheques views,
 * and Paid from a day in the business's zone. Each business sees only its
 * own invoices, plain and under `TEST_RLS=on`.
 */
describe("the Invoices list's search, Owed, Cheques and Paid from (DEC-173)", () => {
    const payments = new InvoicePaymentsService();
    const DAY = 86_400_000;
    let rye: OrganizationContext;
    let pulse: OrganizationContext;
    const made: Record<string, string> = {};

    async function business(name: string): Promise<OrganizationContext> {
        const o = await prisma.organization.create({
            data: { name, slug: `u4-${next()}` },
        });
        return { organizationId: o.id, userId: "user_1", role: "OWNER" };
    }

    async function invoice(
        ctx: OrganizationContext,
        p: {
            total: string;
            number?: string | null;
            status?: string;
            billToName?: string | null;
            contactId?: string | null;
            dueAt?: Date;
            orderId?: string;
            kind?: string;
            paidAt?: Date;
        },
    ): Promise<string> {
        const status = p.status ?? "ISSUED";
        const row = await prisma.invoice.create({
            data: {
                organizationId: ctx.organizationId,
                number:
                    p.number !== undefined
                        ? p.number
                        : status === "DRAFT"
                          ? null
                          : `INV-${next()}`,
                status,
                kind: p.kind ?? "INVOICE",
                source: p.orderId ? "ORDER" : "MANUAL",
                orderId: p.orderId ?? null,
                contactId: p.contactId ?? null,
                billToName: p.billToName === undefined ? "Asha" : p.billToName,
                issuedAt: status === "DRAFT" ? null : new Date(),
                dueAt: p.dueAt ?? new Date(Date.now() + 7 * DAY),
                paidAt: p.paidAt ?? null,
                currency: "INR",
                subtotal: p.total,
                total: p.total,
            },
        });
        return row.id;
    }

    async function orderIn(ctx: OrganizationContext): Promise<string> {
        const store = await prisma.store.create({
            data: {
                organizationId: ctx.organizationId,
                name: "Counter",
                slug: `u4-store-${next()}`,
            },
        });
        const o = await prisma.order.create({
            data: {
                storeId: store.id,
                organizationId: ctx.organizationId,
                orderId: `ORD-${next()}`,
                subtotal: "1200.00",
                total: "1200.00",
                currency: "INR",
            },
        });
        return o.id;
    }

    const ids = async (ctx: OrganizationContext, query: object) =>
        (await service.list(ctx, query)).map((i) => i.id).sort();

    beforeAll(async () => {
        rye = await business("Rye & Co.");
        pulse = await business("Pulse");
        const vivek = await prisma.contact.create({
            data: {
                organizationId: rye.organizationId,
                email: `vivek-${next()}@example.com`,
                firstName: "Vivek",
                lastName: "Nair",
            },
        });
        // Vivek's issued invoice, and a draft whose bill-to name isn't
        // copied until it is issued: found through the contact.
        made.vivekIssued = await invoice(rye, {
            total: "1500.00",
            billToName: "Vivek Nair",
            contactId: vivek.id,
        });
        made.vivekDraft = await invoice(rye, {
            total: "600.00",
            status: "DRAFT",
            billToName: null,
            contactId: vivek.id,
        });
        made.numbered = await invoice(rye, {
            total: "2200.00",
            number: "RC/26-27/0106",
        });
        made.exact = await invoice(rye, { total: "8400.00" });
        // ₹10,000 with ₹1,600 paid: ₹8,400 left.
        made.left = await invoice(rye, { total: "10000.00" });
        await payments.record(rye, made.left, {
            method: "UPI",
            amount: "1600",
        });
        // Overdue, owed too.
        made.overdue = await invoice(rye, {
            total: "3000.00",
            dueAt: new Date(Date.now() - 2 * DAY),
        });
        // Paid in full last month.
        made.paidLastMonth = await invoice(rye, { total: "500.00" });
        const first = DateTime.now().setZone("Asia/Kolkata").startOf("month");
        await payments.record(rye, made.paidLastMonth, {
            method: "CASH",
            receivedAt: first.minus({ minutes: 30 }).toJSDate().toISOString(),
        });
        // A cheque waiting, and one bounced.
        made.chequeWaiting = await invoice(rye, { total: "5600.00" });
        await payments.record(rye, made.chequeWaiting, {
            method: "CHEQUE",
            chequeNumber: "004512",
        });
        made.chequeBounced = await invoice(rye, { total: "900.00" });
        const bounced = await payments.record(rye, made.chequeBounced, {
            method: "CHEQUE",
            chequeNumber: "004513",
        });
        await payments.bounced(
            rye,
            made.chequeBounced,
            bounced.recorded.paymentId,
            {},
        );
        // An order's paper paid this month, an order's paper still open,
        // and a credit note.
        made.orderPaid = await invoice(rye, {
            total: "1200.00",
            status: "PAID",
            orderId: await orderIn(rye),
            paidAt: new Date(),
        });
        made.orderOpen = await invoice(rye, {
            total: "1200.00",
            orderId: await orderIn(rye),
        });
        made.credit = await invoice(rye, {
            total: "8400.00",
            kind: "CREDIT_NOTE",
        });
        // Another business's ₹8,400 invoice for "Vivek".
        made.theirs = await invoice(pulse, {
            total: "8400.00",
            billToName: "Vivek Nair",
        });
    });

    it('finds Vivek Nair\'s invoices by "vivek", the draft included', async () => {
        expect(await ids(rye, { q: "vivek" })).toEqual(
            [made.vivekIssued, made.vivekDraft].sort(),
        );
        expect(await ids(rye, { q: "VIVEK NAIR" })).toEqual(
            [made.vivekIssued, made.vivekDraft].sort(),
        );
    });

    it('finds RC/26-27/0106 by "0106"', async () => {
        expect(await ids(rye, { q: "0106" })).toEqual([made.numbered]);
    });

    it.each(["8400", "₹8,400", "8,400.00"])(
        "finds the ₹8,400 invoices, and the one with ₹8,400 left, by %s",
        async (q) => {
            expect(await ids(rye, { q })).toEqual(
                [made.exact, made.left, made.credit].sort(),
            );
        },
    );

    it('reads "8,40" as no amount, and it matches no number', async () => {
        expect(await ids(rye, { q: "8,40" })).toEqual([]);
    });

    it("searches inside a view", async () => {
        expect(await ids(rye, { q: "8400", view: "owed" })).toEqual(
            [made.exact, made.left].sort(),
        );
    });

    it("lists issued invoices for Owed, overdue ones included, never paid, drafts, an order's or a credit note", async () => {
        expect(await ids(rye, { view: "owed" })).toEqual(
            [
                made.vivekIssued,
                made.numbered,
                made.exact,
                made.left,
                made.overdue,
                made.chequeBounced,
            ].sort(),
        );
    });

    it("lists only invoices with a cheque waiting for Cheques", async () => {
        expect(await ids(rye, { view: "cheques" })).toEqual([
            made.chequeWaiting,
        ]);
    });

    it("lists money received from the 1st for Paid from, part payments and an order's paper included", async () => {
        const first = DateTime.now()
            .setZone("Asia/Kolkata")
            .startOf("month")
            .toISODate() as string;
        expect(await ids(rye, { paidFrom: first })).toEqual(
            [made.left, made.chequeWaiting, made.orderPaid].sort(),
        );
        // With the Paid tab, only those paid in full.
        expect(await ids(rye, { paidFrom: first, view: "paid" })).toEqual(
            [made.chequeWaiting, made.orderPaid].sort(),
        );
    });

    it("never finds another business's invoices", async () => {
        expect(await ids(pulse, { q: "vivek" })).toEqual([made.theirs]);
        expect(await ids(rye, { q: "8400" })).not.toContain(made.theirs);
    });

    it("finds an invoice older than the newest 500, and searches 1,500 quickly", async () => {
        const big = await business("Big");
        const old = await invoice(big, {
            total: "777.00",
            billToName: "Zubin Old",
        });
        await prisma.invoice.update({
            where: { id: old },
            data: { createdAt: new Date(Date.now() - 400 * DAY) },
        });
        const n = 1500;
        await prisma.invoice.createMany({
            data: Array.from({ length: n }, (_, i) => ({
                organizationId: big.organizationId,
                number: `BIG-${next()}-${i}`,
                status: i % 3 === 0 ? "PAID" : "ISSUED",
                source: "MANUAL",
                billToName: `Customer ${i}`,
                issuedAt: new Date(),
                dueAt: new Date(Date.now() + 7 * DAY),
                currency: "INR",
                subtotal: `${1000 + i}.00`,
                total: `${1000 + i}.00`,
            })),
        });
        // What autovacuum does after a bulk load, as the owner
        // (test/analyze.ts).
        analyzeAsOwner();

        const newest = await service.list(big, {});
        expect(newest).toHaveLength(500);
        expect(newest.map((i) => i.id)).not.toContain(old);

        const started = Date.now();
        const byName = await service.list(big, { q: "zubin" });
        const nameTook = Date.now() - started;
        const amountStarted = Date.now();
        const byAmount = await service.list(big, { q: "₹1,499" });
        const amountTook = Date.now() - amountStarted;
        expect(byName.map((i) => i.id)).toEqual([old]);
        expect(byAmount.map((i) => i.total)).toEqual(["1499.00"]);
        // Recorded for the PR; the budget is generous for CI's cold
        // Postgres.
        console.info(
            `invoices search over ${n + 1}: name ${nameTook}ms, amount ${amountTook}ms`,
        );
        expect(nameTook).toBeLessThan(1500);
        expect(amountTook).toBeLessThan(1500);
    });
});
