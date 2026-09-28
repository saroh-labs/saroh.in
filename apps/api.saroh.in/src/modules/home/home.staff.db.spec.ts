/**
 * The staff landing against a real Postgres (round 2, F11): a Member on
 * Hill Road sees Hill Road's open orders, pick-ups and new orders only; a
 * Member with no storefront role sees every storefront; a staff member on
 * the diary sees their own bookings on Today; and the takings figure is
 * `payment:read`'s, so a person given it as an extra permission sees it and
 * one without it doesn't.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import type { OrgAction } from "../organizations/organization-actions";
import { readSince } from "./home-last-day";
import type { HomeInput } from "./home-model";
import { readOpenOrders } from "./home-open-orders";
import { readSchedule } from "./home-schedule";
import { readStaffNarrow } from "./home-staff";
import { readToday } from "./home-today";
import { readWeek, weekScope } from "./home-week";

const tag = `${process.pid}-${Date.now()}`;
const ZONE = "Asia/Kolkata";
const NOW = new Date("2026-09-18T04:00:00.000Z"); // Friday 09:30 IST
const HOUR = 60 * 60_000;

const MEMBER = new Set<OrgAction>([
    "org:read",
    "store:read",
    "product-review:read",
    "booking:read",
    "contact:read",
    "order:stage",
] as OrgAction[]);

let orgId = "";
let hillId = "";
let onlineId = "";
let arjunId = "";
let sanaId = "";
let arunUserId = "";
let arunStaffId = "";
let otherStaffId = "";
const orders: Record<string, string> = {};
const bookings: Record<string, string> = {};

function viewer(userId: string, extra: OrgAction[] = []): HomeInput {
    return {
        organizationId: orgId,
        userId,
        organizationRole: "MEMBER",
        organizationActions: new Set([...MEMBER, ...extra]),
    };
}

async function user(name: string) {
    const u = await prisma.user.create({
        data: { email: `${name}-f11-${tag}@example.com`, name },
    });
    const m = await prisma.membership.create({
        data: { organizationId: orgId, userId: u.id, role: "MEMBER" },
    });
    return { userId: u.id, membershipId: m.id };
}

async function order(name: string, storeId: string, agoHours: number) {
    const customer = await prisma.customer.create({
        data: {
            storeId,
            organizationId: orgId,
            email: `${name}-${tag}@example.in`,
            firstName: name,
        },
    });
    const o = await prisma.order.create({
        data: {
            storeId,
            organizationId: orgId,
            orderId: `F11-${name}-${tag}`.slice(0, 40),
            customerId: customer.id,
            subtotal: "610.00",
            total: "610.00",
            currency: "INR",
            status: "PENDING",
            paymentStatus: "PAID",
            stage: "NEW",
            fulfilment: "PICKUP",
            placedOnline: false,
            createdAt: new Date(NOW.getTime() - agoHours * HOUR),
        },
    });
    orders[name] = o.id;
}

beforeAll(async () => {
    orgId = (
        await prisma.organization.create({
            data: { name: "Rye & Co.", slug: `home-f11-${tag}` },
        })
    ).id;
    hillId = (
        await prisma.store.create({
            data: {
                name: "Hill Road",
                slug: `home-f11-hill-${tag}`,
                organizationId: orgId,
            },
        })
    ).id;
    onlineId = (
        await prisma.store.create({
            data: {
                name: "Online",
                slug: `home-f11-online-${tag}`,
                organizationId: orgId,
            },
        })
    ).id;

    // Arjun works on Hill Road; Sana on no storefront at all.
    arjunId = (await user("arjun")).userId;
    sanaId = (await user("sana")).userId;
    await prisma.storeMembers.create({
        data: { storeId: hillId, userId: arjunId, role: "VIEWER" },
    });

    // An open pick-up at each storefront, placed an hour ago: today's.
    await order("hill", hillId, 1);
    await order("online", onlineId, 1);

    // Dr. Arun is on the diary; another dentist takes the other chair.
    const arun = await user("arun");
    arunUserId = arun.userId;
    arunStaffId = (
        await prisma.staffMember.create({
            data: {
                organizationId: orgId,
                name: "Dr. Arun",
                membershipId: arun.membershipId,
            },
        })
    ).id;
    otherStaffId = (
        await prisma.staffMember.create({
            data: { organizationId: orgId, name: "Dr. Meera" },
        })
    ).id;
    const cleaning = await prisma.service.create({
        data: {
            organizationId: orgId,
            name: "Cleaning",
            durationMinutes: 30,
            capacity: 1,
            priceCents: 50_000,
            currency: "INR",
            timezone: ZONE,
        },
    });
    const filling = await prisma.service.create({
        data: {
            organizationId: orgId,
            name: "Filling",
            durationMinutes: 30,
            capacity: 1,
            priceCents: 80_000,
            currency: "INR",
            timezone: ZONE,
        },
    });
    await prisma.staffService.create({
        data: {
            organizationId: orgId,
            staffId: arunStaffId,
            serviceId: cleaning.id,
        },
    });
    const book = async (
        name: string,
        serviceId: string,
        staffId: string | null,
        inHours: number,
    ) => {
        const startAt = new Date(NOW.getTime() + inHours * HOUR);
        const b = await prisma.booking.create({
            data: {
                organizationId: orgId,
                serviceId,
                staffId,
                startAt,
                endAt: new Date(startAt.getTime() + HOUR / 2),
                timezone: ZONE,
                status: "CONFIRMED",
                bookerName: name,
                snapshot: {},
            },
        });
        bookings[name] = b.id;
    };
    await book("Arun's patient", filling.id, arunStaffId, 1);
    await book("Meera's patient", filling.id, otherStaffId, 2);
    // Nobody put on it, for a service Arun takes: his to see.
    await book("Unassigned cleaning", cleaning.id, null, 3);
    // Nobody put on it, for a service he doesn't take: not his.
    await book("Unassigned filling", filling.id, null, 4);

    // Money in this week, for the takings figure.
    for (const hoursAgo of [2, 5]) {
        await prisma.invoice.create({
            data: {
                organizationId: orgId,
                status: "PAID",
                currency: "INR",
                subtotal: "1000",
                total: "1000",
                issuedAt: new Date(NOW.getTime() - hoursAgo * HOUR),
                paidAt: new Date(NOW.getTime() - hoursAgo * HOUR),
            },
        });
    }
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe("a staff member's storefronts (F11)", () => {
    it("narrows a Member on Hill Road to Hill Road", async () => {
        const read = await readStaffNarrow(prisma, viewer(arjunId));
        expect(read.staff.stores).toEqual([{ id: hillId, name: "Hill Road" }]);
        expect(read.narrow.storeIds).toEqual([hillId]);
    });

    it("shows a Member on Hill Road Hill Road's open orders only", async () => {
        const { narrow } = await readStaffNarrow(prisma, viewer(arjunId));
        const open = await readOpenOrders(prisma, orgId, {
            now: NOW,
            zone: ZONE,
            money: false,
            storeIds: narrow.storeIds,
        });
        expect(open.count).toBe(1);
        expect(open.evidence.map((e) => e.id)).toEqual([orders.hill]);
    });

    it("shows a Member with no storefront role every storefront's", async () => {
        const read = await readStaffNarrow(prisma, viewer(sanaId));
        expect(read.staff.stores).toBeNull();
        const open = await readOpenOrders(prisma, orgId, {
            now: NOW,
            zone: ZONE,
            money: false,
            storeIds: read.narrow.storeIds,
        });
        expect(open.evidence.map((e) => e.id).sort()).toEqual(
            [orders.hill, orders.online].sort(),
        );
    });

    it("counts Hill Road's new orders only, and links the list to it", async () => {
        const { narrow } = await readStaffNarrow(prisma, viewer(arjunId));
        const since = new Date(NOW.getTime() - 24 * HOUR).toISOString();
        const items = await readSince(
            prisma,
            orgId,
            { orders: true, bookings: false, reviews: false, money: false },
            since,
            narrow.storeIds,
        );
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({ kind: "ORDERS", count: 1 });
        expect(items[0].href).toContain(`storefront=${hillId}`);
    });

    it("puts only Hill Road's pick-ups on Today", async () => {
        const input = viewer(arjunId);
        const { narrow } = await readStaffNarrow(prisma, input);
        const today = await readToday(
            prisma,
            input,
            { bookings: false, pickUps: true, canMark: false, flags: false },
            { now: NOW, zone: ZONE },
            narrow,
        );
        expect(today.items.map((i) => i.id)).toEqual([orders.hill]);
    });
});

describe("a staff member's diary (F11)", () => {
    it("puts Dr. Arun's own bookings on Today, and the unassigned ones for his services", async () => {
        const input = viewer(arunUserId);
        const { narrow, staff } = await readStaffNarrow(prisma, input);
        expect(staff.ownDiary).toBe(true);
        const today = await readToday(
            prisma,
            input,
            { bookings: true, pickUps: false, canMark: false, flags: false },
            { now: NOW, zone: ZONE },
            narrow,
        );
        expect(today.items.map((i) => i.id).sort()).toEqual(
            [
                bookings["Arun's patient"],
                bookings["Unassigned cleaning"],
            ].sort(),
        );
        const schedule = await readSchedule(prisma, orgId, NOW, narrow);
        expect(schedule.total).toBe(2);
    });

    it("gives someone not on the diary the whole day", async () => {
        const input = viewer(sanaId);
        const { narrow } = await readStaffNarrow(prisma, input);
        const today = await readToday(
            prisma,
            input,
            { bookings: true, pickUps: false, canMark: false, flags: false },
            { now: NOW, zone: ZONE },
            narrow,
        );
        expect(today.items.filter((i) => i.kind === "BOOKING")).toHaveLength(4);
    });
});

describe("the takings figure follows payment:read (F11)", () => {
    const ALL = new Set(["COMMERCE", "PAYMENTS", "APPOINTMENTS"]);

    it("shows it to a person given payment:read as an extra permission", async () => {
        const scope = weekScope(viewer(sanaId, ["payment:read"]), ALL);
        expect(scope?.takings).toBe(true);
        const week = await readWeek(prisma, orgId, scope!, {
            now: NOW,
            zone: ZONE,
        });
        expect(week.takings).toHaveLength(1);
        expect(week.takings?.[0]).toMatchObject({
            currency: "INR",
            amountMinor: 200_000,
        });
        // No invoice:read: the figure opens the Calendar's money.
        expect(week.takings?.[0].href).toBe("/calendar");
        expect(week.owed).toBeUndefined();
    });

    it("leaves it out for one without it", async () => {
        const scope = weekScope(viewer(sanaId), ALL);
        expect(scope?.takings).toBe(false);
        const week = await readWeek(prisma, orgId, scope!, {
            now: NOW,
            zone: ZONE,
        });
        expect(week.takings).toBeUndefined();
    });
});
