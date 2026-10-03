/**
 * A treatment's order is fulfilled by its visits (B14, R16, DEC-050),
 * against a real Postgres:
 *
 * - the order read carries its visits (the Visits card) and what the header
 *   offers next, and the quick view says "1 of 3";
 * - "Mark visit N attended" only once the visit has started, never on a
 *   visit not booked, a cancelled order or another business's;
 * - the last visit attended fulfils the order (DELIVERED, a STATUS step the
 *   kitchen's Undo never offers), from the order's card or the booking's
 *   own Arrived; a correction takes it back;
 * - the order's paper is named as the invoice read names it (D15): a
 *   registered clinic's exempt treatment is a bill of supply;
 * - a Member reads the customer's email with `contact:read` alone.
 *
 * Only the app env is stubbed. Runs in the integration project.
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import { ConflictException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { BookingsService } from "../bookings/bookings.service";
import { OrderKitchenService } from "./order-kitchen.service";
import { listOrderRows } from "./order-list";
import { quickViewOf } from "./order-row";
import { markVisitAttended, visitNotStartedText } from "./order-visit-attend";
import { nextVisitsFor } from "./order-visits";
import { REOPENED_NOTE } from "./treatment-fulfil";

const tag = `${process.pid}-${Date.now()}`;
const kitchen = new OrderKitchenService();
const bookings = new BookingsService();

let owner: OrganizationContext;
let member: OrganizationContext;
let stranger: OrganizationContext;
let orgId: string;
let storeId: string;
let serviceId: string;
let staffId: string;
let customerId: string;
let orderSeq = 0;

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Kavi Dental", slug: `b14-${tag}` },
    });
    orgId = org.id;
    const other = await prisma.organization.create({
        data: { name: "Elsewhere", slug: `b14-other-${tag}` },
    });
    const user = await prisma.user.create({
        data: { email: `b14-${tag}@example.in`, name: "Meera Iyer" },
    });
    owner = { organizationId: org.id, userId: user.id, role: "OWNER" };
    member = { organizationId: org.id, userId: null, role: "MEMBER" };
    stranger = { organizationId: other.id, userId: null, role: "OWNER" };
    storeId = (
        await prisma.store.create({
            data: {
                name: "Indiranagar clinic",
                slug: `b14-store-${tag}`,
                organizationId: org.id,
            },
        })
    ).id;
    serviceId = (
        await prisma.service.create({
            data: {
                organizationId: org.id,
                name: "Root canal treatment",
                durationMinutes: 60,
                capacity: 1,
                priceCents: 1_200_000,
                currency: "INR",
                gstRate: "0",
                sacCode: "9993",
                timezone: "Asia/Kolkata",
                visits: 3,
            },
        })
    ).id;
    staffId = (
        await prisma.staffMember.create({
            data: { organizationId: org.id, name: "Dr. Meenakshi Rao" },
        })
    ).id;
    customerId = (
        await prisma.customer.create({
            data: {
                storeId,
                organizationId: org.id,
                email: "rahul@example.in",
                firstName: "Rahul",
                lastName: "Verma",
                phone: "+91 98450 00002",
            },
        })
    ).id;
});

/** A 3-visit treatment's order, paid, with its visits booked as given. */
async function treatment(
    starts: (Date | null)[],
    over: { status?: string } = {},
): Promise<{ id: string; visits: string[] }> {
    orderSeq += 1;
    const order = await prisma.order.create({
        data: {
            storeId,
            organizationId: orgId,
            orderId: `ORD-${String(orderSeq).padStart(3, "0")}`,
            customerId,
            currency: "INR",
            subtotal: "12000.00",
            tax: "0.00",
            total: "12000.00",
            fulfilment: "APPOINTMENT_IN_PERSON",
            paymentStatus: "PAID",
            status: over.status ?? "PENDING",
            items: {
                create: {
                    serviceId,
                    quantity: 1,
                    price: "12000.00",
                    stockRow: "NONE",
                },
            },
        },
        select: { id: true },
    });
    const visits: string[] = [];
    for (const [i, start] of starts.entries()) {
        if (!start) continue;
        const b = await prisma.booking.create({
            data: {
                organizationId: orgId,
                serviceId,
                staffId,
                startAt: start,
                endAt: new Date(start.getTime() + HOUR),
                timezone: "Asia/Kolkata",
                snapshot: {},
                status: "CONFIRMED",
                bookerName: "Rahul Verma",
                bookerEmail: "rahul@example.in",
                orderId: order.id,
                visitNumber: i + 1,
            },
            select: { id: true },
        });
        visits.push(b.id);
    }
    return { id: order.id, visits };
}

const ago = (ms: number) => new Date(Date.now() - ms);
const ahead = (ms: number) => new Date(Date.now() + ms);

async function orderNow(id: string) {
    return prisma.order.findUniqueOrThrow({
        where: { id },
        select: {
            stage: true,
            status: true,
            events: {
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                select: {
                    kind: true,
                    toStage: true,
                    toStatus: true,
                    note: true,
                },
            },
        },
    });
}

describe("the Visits card's read (B14)", () => {
    it("visit 1 attended, visit 2 booked: 1 of 3, and visit 2 waits for its start", async () => {
        const t = await treatment([ago(7 * DAY), ahead(DAY), null]);
        await markVisitAttended(owner, t.id, 1);

        const read = await kitchen.read(owner, t.id);
        expect(read.visits).toBeDefined();
        const visits = read.visits;
        expect(visits?.total).toBe(3);
        expect(visits?.attended).toBe(1);
        expect(visits?.visits.map((v) => v.state)).toEqual([
            "ATTENDED",
            "BOOKED",
            "TO_BOOK",
        ]);
        expect(visits?.visits[0]).toMatchObject({
            staffName: "Dr. Meenakshi Rao",
            where: "IN_PERSON",
            attendedBy: { id: owner.userId, name: "Meera Iyer" },
        });
        expect(visits?.next.attend).toBeNull();
        expect(visits?.next.upcoming?.number).toBe(2);
        expect(visits?.service).toMatchObject({
            id: serviceId,
            name: "Root canal treatment",
            timezone: "Asia/Kolkata",
        });
        // No kitchen step, and nothing for Undo.
        expect(read.stage).toBe("NEW");
        expect(read.next.stages).toEqual([]);
        expect(read.next.undo).toBeNull();

        // The quick view reads the same: "1 of 3".
        const quick = quickViewOf(read, { contact: false });
        expect(quick.visits?.attended).toBe(1);
        expect(quick.visits?.total).toBe(3);
    });

    it("an order that isn't a treatment carries no visits", async () => {
        const plain = await prisma.order.create({
            data: {
                storeId,
                organizationId: orgId,
                orderId: `PLAIN-${tag}`,
                customerId,
                currency: "INR",
                subtotal: "0.00",
                total: "0.00",
            },
            select: { id: true },
        });
        const read = await kitchen.read(owner, plain.id);
        expect(read).not.toHaveProperty("visits");
    });

    it("a Member reads the customer's email with contact:read alone", async () => {
        const t = await treatment([ahead(DAY)]);
        const read = await kitchen.read(member, t.id);
        // No money for the counter, but who to reach.
        expect(read.money).toBeNull();
        expect(read.customer?.email).toBe("rahul@example.in");
        expect(read.customer?.phone).toBe("+91 98450 00002");
        expect(read.visits?.total).toBe(3);
    });
});

describe("Mark visit N attended (B14)", () => {
    it("is refused before the visit starts", async () => {
        const t = await treatment([ahead(2 * HOUR)]);
        await expect(markVisitAttended(owner, t.id, 1)).rejects.toThrow(
            new ConflictException(visitNotStartedText(1)),
        );
        const booking = await prisma.booking.findUniqueOrThrow({
            where: { id: t.visits[0] },
        });
        expect(booking.outcome).toBeNull();
    });

    it("is refused on a visit not booked yet", async () => {
        const t = await treatment([ago(DAY)]);
        await expect(markVisitAttended(owner, t.id, 2)).rejects.toThrow(
            "Visit 2 isn't booked yet.",
        );
    });

    it("is refused on a cancelled order, and another business's is a 404", async () => {
        const cancelled = await treatment([ago(DAY)], { status: "CANCELLED" });
        await expect(
            markVisitAttended(owner, cancelled.id, 1),
        ).rejects.toBeInstanceOf(ConflictException);
        const t = await treatment([ago(DAY)]);
        await expect(
            markVisitAttended(stranger, t.id, 1),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("the last visit attended fulfils the order; saying it again changes nothing", async () => {
        const t = await treatment([ago(3 * DAY), ago(2 * DAY), ago(HOUR)]);
        // The counter marks them (order:stage).
        const one = await markVisitAttended(member, t.id, 1);
        expect(one).toMatchObject({ attended: 1, visits: 3, done: false });
        await markVisitAttended(member, t.id, 2);
        expect(await orderNow(t.id)).toMatchObject({
            stage: "NEW",
            status: "PENDING",
        });

        const last = await markVisitAttended(member, t.id, 3);
        expect(last).toMatchObject({ attended: 3, done: true });
        const done = await orderNow(t.id);
        expect(done).toMatchObject({ stage: "DELIVERED", status: "DELIVERED" });
        expect(done.events).toEqual([
            {
                kind: "STATUS",
                toStage: "DELIVERED",
                toStatus: "DELIVERED",
                note: "All 3 visits attended",
            },
        ]);

        const again = await markVisitAttended(member, t.id, 3);
        expect(again.done).toBe(true);
        expect((await orderNow(t.id)).events).toHaveLength(1);
        expect(
            await prisma.bookingEvent.count({
                where: { bookingId: t.visits[2], type: "ATTENDED" },
            }),
        ).toBe(1);

        const read = await kitchen.read(owner, t.id);
        expect(read.visits?.done).toBe(true);
        expect(read.next.undo).toBeNull();
    });

    it("the booking's own Arrived fulfils it too, and a correction takes it back", async () => {
        const t = await treatment([ago(3 * DAY), ago(2 * DAY), ago(HOUR)]);
        await markVisitAttended(owner, t.id, 1);
        await markVisitAttended(owner, t.id, 2);
        await bookings.recordOutcome(owner, t.visits[2], "ATTENDED");
        expect(await orderNow(t.id)).toMatchObject({
            stage: "DELIVERED",
            status: "DELIVERED",
        });

        // The last visit was a no-show after all.
        await bookings.recordOutcome(owner, t.visits[2], "NO_SHOW");
        const reopened = await orderNow(t.id);
        expect(reopened).toMatchObject({ stage: "NEW", status: "PENDING" });
        expect(reopened.events.at(-1)).toMatchObject({
            kind: "STATUS",
            toStage: "NEW",
            toStatus: "PENDING",
            note: REOPENED_NOTE,
        });
        const read = await kitchen.read(owner, t.id);
        expect(read.visits?.visits[2].state).toBe("MISSED");
        expect(read.visits?.done).toBe(false);
    });
});

describe("the order's paper is named (D15)", () => {
    it("a registered clinic's exempt treatment is a bill of supply", async () => {
        const t = await treatment([ago(DAY)]);
        const invoice = await prisma.invoice.create({
            data: {
                organizationId: orgId,
                orderId: t.id,
                kind: "INVOICE",
                status: "PAID",
                number: `KD-${tag}`,
                sellerGstin: "29ABCDE1234F1Z5",
                currency: "INR",
                subtotal: "12000.00",
                tax: "0.00",
                total: "12000.00",
                lines: {
                    create: {
                        organizationId: orgId,
                        position: 0,
                        description: "Root canal treatment",
                        quantity: 1,
                        unitPrice: "12000.00",
                        amount: "12000.00",
                        gstRate: "0.00",
                    },
                },
            },
            select: { id: true },
        });
        const read = await kitchen.read(owner, t.id);
        expect(read.invoices).toEqual([
            expect.objectContaining({
                id: invoice.id,
                kind: "INVOICE",
                title: "Bill of supply",
            }),
        ]);
    });
});

describe("the Orders row's next visit (B14, DEC-067)", () => {
    const full = { money: true, contact: true };
    const rowOf = async (id: string) => {
        const page = await listOrderRows(orgId, {}, full);
        return page.rows.find((r) => r.id === id);
    };

    it("names the first visit still waiting, in the clinic's zone", async () => {
        const next = ahead(2 * DAY);
        const t = await treatment([ago(7 * DAY), next, ahead(9 * DAY)]);
        await markVisitAttended(owner, t.id, 1);
        const row = await rowOf(t.id);
        expect(row?.nextVisit).toEqual({
            startAt: next,
            timezone: "Asia/Kolkata",
        });
    });

    it("is null when no visit is booked, and a cancelled booking doesn't count", async () => {
        const t = await treatment([ahead(DAY), null, null]);
        await prisma.booking.update({
            where: { id: t.visits[0] },
            data: { status: "CANCELLED" },
        });
        expect((await rowOf(t.id))?.nextVisit).toBeNull();
    });

    it("an order that isn't a treatment carries none", async () => {
        orderSeq += 1;
        const order = await prisma.order.create({
            data: {
                storeId,
                organizationId: orgId,
                orderId: `ORD-${String(orderSeq).padStart(3, "0")}`,
                customerId,
                currency: "INR",
                subtotal: "100.00",
                tax: "0.00",
                total: "100.00",
                fulfilment: "PICKUP",
            },
            select: { id: true },
        });
        const row = await rowOf(order.id);
        expect(row).toBeDefined();
        expect(row && "nextVisit" in row).toBe(false);
    });

    it("never reads another business's bookings", async () => {
        const t = await treatment([ahead(DAY)]);
        const visits = await nextVisitsFor(prisma, stranger.organizationId, [
            t.id,
        ]);
        expect(visits.get(t.id)).toBeNull();
    });
});
