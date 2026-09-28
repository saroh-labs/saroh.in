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

import type { OrganizationContext } from "../../common/types/organization-context";
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
