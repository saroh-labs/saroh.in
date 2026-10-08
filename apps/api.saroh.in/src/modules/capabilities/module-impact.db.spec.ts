/**
 * F13 — turning a module off names what it touches, with real counts,
 * against a real Postgres:
 *
 * - Appointments counts the upcoming bookings that stand (confirmed, or a
 *   pay-now hold still holding), not past, cancelled or lapsed ones, and
 *   none of another business's;
 * - Courses, on and needing it, goes with it and is named;
 * - Class packs isn't offered (DEC-099): a business that had it on keeps its
 *   setting and packs, but it is never named as going with Appointments nor
 *   there to ask about; its line still counts purchases with classes and
 *   time left, for when it is offered again;
 * - a viewer without `booking:read` is told what stops without a number;
 * - a module Saroh hasn't rolled out is not there to ask about (DEC-057);
 * - the Commerce blocker still refuses, and still names its count.
 */
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { ModuleLifecycleService } from "./module-lifecycle.service";
import { ModuleReadinessRegistry } from "./readiness/module-readiness.registry";

const tag = `${process.pid}-${Date.now()}`;
const ZONE = "Asia/Kolkata";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const readiness = new ModuleReadinessRegistry();
const lifecycle = new ModuleLifecycleService(
    readiness,
    prisma,
    undefined,
    new FeatureFlagService(),
);

let userId: string;
let studio: string;
let other: string;

const owner = (organizationId: string): OrganizationContext => ({
    organizationId,
    userId,
    role: "OWNER",
});

async function business(name: string, modules: string[]) {
    const org = await prisma.organization.create({
        data: {
            name,
            slug: `f13-${name.toLowerCase().replace(/\W+/g, "-")}-${tag}`,
        },
    });
    for (const moduleKey of modules) {
        await prisma.organizationModule.create({
            data: { organizationId: org.id, moduleKey, status: "ENABLED" },
        });
    }
    return org.id;
}

async function rollOut(keys: string[], on = true) {
    for (const key of keys) {
        await prisma.featureFlag.upsert({
            where: { key },
            create: { key, enabledByDefault: on },
            update: { enabledByDefault: on },
        });
    }
}

async function booking(
    organizationId: string,
    serviceId: string,
    startAt: Date,
    status: string,
    holdExpiresAt?: Date,
) {
    return prisma.booking.create({
        data: {
            organizationId,
            serviceId,
            startAt,
            endAt: new Date(startAt.getTime() + 30 * 60_000),
            timezone: ZONE,
            status,
            holdExpiresAt,
            snapshot: {},
        },
    });
}

beforeAll(async () => {
    await rollOut([
        "MODULE_CRM",
        "MODULE_APPOINTMENTS",
        "MODULE_COURSES",
        "MODULE_CLASS_PACKS",
        "MODULE_COMMERCE",
    ]);
    userId = (
        await prisma.user.create({ data: { email: `f13-${tag}@example.com` } })
    ).id;

    studio = await business("Pulse Studio", [
        "CRM",
        "APPOINTMENTS",
        "COURSES",
        "CLASS_PACKS",
        "COMMERCE",
    ]);
    other = await business("Elsewhere", ["CRM", "APPOINTMENTS"]);

    const now = Date.now();
    const service = await prisma.service.create({
        data: {
            organizationId: studio,
            name: "Yoga",
            durationMinutes: 30,
            timezone: ZONE,
        },
    });
    // Three that stand.
    await booking(studio, service.id, new Date(now + DAY), "CONFIRMED");
    await booking(studio, service.id, new Date(now + 2 * DAY), "CONFIRMED");
    await booking(
        studio,
        service.id,
        new Date(now + 3 * DAY),
        "PENDING",
        new Date(now + HOUR),
    );
    // And three that don't: past, cancelled, a hold that lapsed.
    await booking(studio, service.id, new Date(now - DAY), "CONFIRMED");
    await booking(studio, service.id, new Date(now + DAY), "CANCELLED");
    const spent = await booking(
        studio,
        service.id,
        new Date(now + 4 * DAY),
        "PENDING",
        new Date(now - HOUR),
    );
    // Another business's booking is never counted here.
    const otherService = await prisma.service.create({
        data: {
            organizationId: other,
            name: "Pilates",
            durationMinutes: 30,
            timezone: ZONE,
        },
    });
    await booking(other, otherService.id, new Date(now + DAY), "CONFIRMED");

    // Packs: one with classes left, one used up, one expired.
    const pack = await prisma.classPack.create({
        data: {
            organizationId: studio,
            name: "2-class pack",
            credits: 2,
            validityDays: 90,
            price: "900.00",
            currency: "INR",
            status: "ACTIVE",
        },
    });
    const contact = await prisma.contact.create({
        data: {
            organizationId: studio,
            email: `asha-${tag}@example.com`,
            firstName: "Asha",
        },
    });
    const purchase = (expiresAt: Date) =>
        prisma.packPurchase.create({
            data: {
                organizationId: studio,
                packId: pack.id,
                contactId: contact.id,
                credits: 2,
                price: "900.00",
                currency: "INR",
                expiresAt,
            },
        });
    await purchase(new Date(now + 30 * DAY));
    const usedUp = await purchase(new Date(now + 30 * DAY));
    await purchase(new Date(now - DAY));
    const past = await booking(
        studio,
        service.id,
        new Date(now - 2 * DAY),
        "CONFIRMED",
    );
    for (const b of [past, spent]) {
        await prisma.packRedemption.create({
            data: {
                organizationId: studio,
                purchaseId: usedUp.id,
                bookingId: b.id,
            },
        });
    }
});

describe("module turn-off impact (F13)", () => {
    it("Appointments names its 3 upcoming bookings, and Courses going with it, never Class packs (DEC-099)", async () => {
        const view = await lifecycle.impact(owner(studio), "APPOINTMENTS");
        expect(view.enabled).toBe(true);
        // Class packs is on for this business, but isn't offered, so it
        // isn't named (DEC-099, DEC-057).
        expect(view.goesWith).toEqual(["COURSES"]);
        expect(view.items.map((i) => i.moduleKey)).not.toContain("CLASS_PACKS");
        const bookings = view.items.find(
            (i) => i.code === "APPOINTMENTS_UPCOMING_BOOKINGS",
        );
        expect(bookings?.count).toBe(3);
        expect(bookings?.message).toBe(
            "3 upcoming bookings stay booked; the booking page stops taking new ones.",
        );
        expect(view.blockers).toEqual([]);
    });

    it("Class packs' line still counts purchases with classes and time left (data kept, DEC-099)", async () => {
        const items = await readiness.deactivationImpact("CLASS_PACKS", {
            organizationId: studio,
            may: () => true,
        });
        const packs = items.find((i) => i.code === "CLASS_PACKS_CREDITS_LEFT");
        expect(packs?.count).toBe(1);
        expect(packs?.moduleKey).toBe("CLASS_PACKS");
    });

    it("counts only the business's own bookings", async () => {
        const view = await lifecycle.impact(owner(other), "APPOINTMENTS");
        expect(
            view.items.find((i) => i.code === "APPOINTMENTS_UPCOMING_BOOKINGS")
                ?.count,
        ).toBe(1);
    });

    it("a viewer without booking:read is told what stops, without a number", async () => {
        const view = await lifecycle.impact(
            {
                ...owner(studio),
                role: "MEMBER",
                roleKey: "front-desk",
                actions: new Set(["module:read"]),
            },
            "APPOINTMENTS",
        );
        const bookings = view.items.find(
            (i) => i.code === "APPOINTMENTS_UPCOMING_BOOKINGS",
        );
        expect(bookings).not.toHaveProperty("count");
        expect(bookings?.message).toBe(
            "Bookings already made stay booked; the booking page stops taking new ones.",
        );
    });

    it("a module Saroh hasn't rolled out isn't there to ask about (DEC-057)", async () => {
        await rollOut(["MODULE_COURSES"], false);
        try {
            await expect(
                lifecycle.impact(owner(studio), "COURSES"),
            ).rejects.toMatchObject({ status: 404 });
            // Nor is it named as going with Appointments.
            const view = await lifecycle.impact(owner(studio), "APPOINTMENTS");
            expect(view.goesWith).toEqual([]);
            expect(view.items.map((i) => i.moduleKey)).not.toContain("COURSES");
        } finally {
            await rollOut(["MODULE_COURSES"], true);
        }
    });

    it("Class packs isn't there to ask about even with its flag on (DEC-099)", async () => {
        await expect(
            lifecycle.impact(owner(studio), "CLASS_PACKS"),
        ).rejects.toMatchObject({ status: 404 });
    });

    it("Commerce's open orders still block, and the confirm says how many", async () => {
        const store = await prisma.store.create({
            data: {
                name: "Hill Road",
                slug: `f13-hill-road-${tag}`,
                organizationId: studio,
            },
        });
        const customer = await prisma.customer.create({
            data: {
                storeId: store.id,
                email: `buyer-${tag}@example.com`,
            },
        });
        await prisma.order.create({
            data: {
                storeId: store.id,
                organizationId: studio,
                orderId: "ORD-001",
                customerId: customer.id,
                subtotal: "500.00",
                total: "500.00",
                currency: "INR",
                status: "PENDING",
            },
        });
        const view = await lifecycle.impact(owner(studio), "COMMERCE");
        expect(view.blockers).toEqual([
            expect.objectContaining({
                code: "COMMERCE_OPEN_ORDERS",
                message:
                    "1 open order needs sending or cancelling first. Orders already placed stay in Orders.",
            }),
        ]);
        expect(
            view.items.find((i) => i.code === "COMMERCE_STOREFRONTS")?.message,
        ).toBe("Hill Road stops taking orders.");
        await expect(
            lifecycle.disable(owner(studio), "COMMERCE"),
        ).rejects.toMatchObject({ status: 409 });
    });
});
