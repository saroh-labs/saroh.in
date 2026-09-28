/**
 * Classes from the next renewal (round 2, D10) against a real Postgres: a
 * subscription keeps the classes a month it took at subscribe or at its last
 * renewal, and a booking paid with it counts against that; a row the
 * previous image wrote (never set) reads its plan's number, and the backfill
 * (packages/database/src/backfill/classes-per-period.ts) sets it without
 * moving anyone's allowance — twice is the same as once. Runs in the
 * integration project (TEST_DATABASE_URL).
 */
import { ConflictException } from "@nestjs/common";
import {
    backfillClassesPerPeriod,
    prisma,
    unsetClassesPerPeriod,
} from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { useMembershipInTx } from "../bookings/use-membership";
import { InvoicesService } from "../invoices/invoices.service";
import { SubscriptionsService } from "./subscriptions.service";

const service = new SubscriptionsService(new InvoicesService());
const tag = `${process.pid}-${Date.now()}`;

let org: OrganizationContext;
let serviceId: string;
let people = 0;

async function person(): Promise<string> {
    people += 1;
    return (
        await prisma.contact.create({
            data: {
                organizationId: org.organizationId,
                email: `d10-${people}-${tag}@example.com`,
            },
        })
    ).id;
}

async function plan(name: string, classesPerMonth: number | null) {
    return (
        await service.createPlan(org, {
            name,
            price: "1500",
            currency: "INR",
            interval: "MONTH",
            classesPerMonth,
        })
    ).id;
}

/** Push a subscription's period into the past so it is due now. */
async function makeDue(id: string): Promise<void> {
    const start = new Date(Date.now() - 40 * 86_400_000);
    await prisma.customerSubscription.update({
        where: { id },
        data: {
            anchorAt: start,
            currentPeriodStart: start,
            currentPeriodEnd: new Date(Date.now() - 86_400_000),
        },
    });
}

/** A class this month booked with the membership: it uses one. */
async function classBooked(subscriptionId: string, contactId: string) {
    const startAt = new Date();
    return prisma.booking.create({
        data: {
            organizationId: org.organizationId,
            serviceId,
            contactId,
            subscriptionId,
            paidWith: "MEMBERSHIP",
            startAt,
            endAt: new Date(startAt.getTime() + 3_600_000),
            timezone: "UTC",
            status: "CONFIRMED",
            snapshot: {},
        },
    });
}

/** Whether one more class this month may be paid with the membership. */
async function mayBookAnother(
    subscriptionId: string,
    contactId: string,
): Promise<boolean> {
    try {
        await prisma.$transaction((tx) =>
            useMembershipInTx(tx, {
                organizationId: org.organizationId,
                bookingId: "not-yet-made",
                contactId,
                subscriptionId,
                startAt: new Date(),
            }),
        );
        return true;
    } catch (err) {
        // Only "this month's are used" counts as a no.
        if (err instanceof ConflictException) return false;
        throw err;
    }
}

const row = (id: string) =>
    prisma.customerSubscription.findUniqueOrThrow({
        where: { id },
        select: {
            classesPerPeriod: true,
            classesPerPeriodSetAt: true,
            status: true,
        },
    });

/** As the previous image writes it: neither column set. */
const asOldImage = (id: string) =>
    prisma.customerSubscription.update({
        where: { id },
        data: { classesPerPeriod: null, classesPerPeriodSetAt: null },
    });

beforeAll(async () => {
    const created = await prisma.organization.create({
        data: { name: "Pulse", slug: `d10-${tag}` },
    });
    org = { organizationId: created.id, userId: "user_1", role: "OWNER" };
    serviceId = (
        await prisma.service.create({
            data: {
                organizationId: org.organizationId,
                name: "Spin",
                durationMinutes: 60,
                capacity: 10,
                priceCents: 50_000,
                currency: "INR",
                timezone: "UTC",
            },
        })
    ).id;
});

describe("classes from the next renewal (D10, real database)", () => {
    it("keeps a member's 8 when the plan moves to 10, and gives 10 at their renewal", async () => {
        const planId = await plan("Monthly 8", 8);
        const contactId = await person();
        const s = await service.subscribe(org, { contactId, planId });
        expect(await row(s.id)).toMatchObject({
            classesPerPeriod: 8,
            classesPerPeriodSetAt: expect.any(Date),
        });

        await service.updatePlan(org, planId, { classesPerMonth: 10 });
        for (let i = 0; i < 8; i += 1) await classBooked(s.id, contactId);
        // Still 8 this period: the ninth is refused.
        expect((await row(s.id)).classesPerPeriod).toBe(8);
        expect(await mayBookAnother(s.id, contactId)).toBe(false);

        await makeDue(s.id);
        await expect(service.renewOne(s.id, new Date())).resolves.toBe(
            "renewed",
        );
        expect((await row(s.id)).classesPerPeriod).toBe(10);
        expect(await mayBookAnother(s.id, contactId)).toBe(true);
    });

    it("keeps no allowance as none, stamped, at renewal", async () => {
        const planId = await plan("Unlimited", null);
        const s = await service.subscribe(org, {
            contactId: await person(),
            planId,
        });
        await makeDue(s.id);
        const now = new Date();
        await service.renewOne(s.id, now);
        expect(await row(s.id)).toEqual({
            classesPerPeriod: null,
            classesPerPeriodSetAt: now,
            status: "ACTIVE",
        });
    });

    it("reads the plan's 8 for a row the previous image wrote, not unlimited", async () => {
        const planId = await plan("Monthly 8 (old image)", 8);
        const contactId = await person();
        const s = await service.subscribe(org, { contactId, planId });
        await asOldImage(s.id);
        for (let i = 0; i < 8; i += 1) await classBooked(s.id, contactId);
        expect(await mayBookAnother(s.id, contactId)).toBe(false);
        // Out of the next test's count.
        await prisma.customerSubscription.update({
            where: { id: s.id },
            data: { status: "CANCELLED", cancelledAt: new Date() },
        });
    });

    it("backfills the previous image's rows from their plan, once, and a booking behaves as before", async () => {
        const eightId = await plan("Backfill 8", 8);
        const noneId = await plan("Backfill none", null);
        const contactId = await person();
        const eight = await service.subscribe(org, {
            contactId,
            planId: eightId,
        });
        const none = await service.subscribe(org, {
            contactId: await person(),
            planId: noneId,
        });
        const paused = await service.subscribe(org, {
            contactId: await person(),
            planId: eightId,
        });
        await service.pause(org, paused.id);
        const cancelled = await service.subscribe(org, {
            contactId: await person(),
            planId: eightId,
        });
        await prisma.customerSubscription.update({
            where: { id: cancelled.id },
            data: { status: "CANCELLED", cancelledAt: new Date() },
        });
        for (const id of [eight.id, none.id, paused.id, cancelled.id]) {
            await asOldImage(id);
        }
        // Set by this release already: never touched.
        const current = await service.subscribe(org, {
            contactId: await person(),
            planId: eightId,
        });
        const before = await row(current.id);

        for (let i = 0; i < 7; i += 1) await classBooked(eight.id, contactId);
        expect(await mayBookAnother(eight.id, contactId)).toBe(true);

        const first = await backfillClassesPerPeriod(prisma);
        expect(first).toEqual({ unsetBefore: 3, filled: 3, unsetAfter: 0 });
        expect(await row(eight.id)).toMatchObject({
            classesPerPeriod: 8,
            classesPerPeriodSetAt: expect.any(Date),
        });
        expect(await row(none.id)).toMatchObject({
            classesPerPeriod: null,
            classesPerPeriodSetAt: expect.any(Date),
        });
        expect((await row(paused.id)).classesPerPeriod).toBe(8);
        // A cancelled one is left alone.
        expect(await row(cancelled.id)).toMatchObject({
            classesPerPeriod: null,
            classesPerPeriodSetAt: null,
        });
        expect(await row(current.id)).toEqual(before);

        // The same allowance as before the backfill.
        expect(await mayBookAnother(eight.id, contactId)).toBe(true);
        await classBooked(eight.id, contactId);
        expect(await mayBookAnother(eight.id, contactId)).toBe(false);

        // Twice changes nothing; the verify query reads 0.
        const stamp = (await row(eight.id)).classesPerPeriodSetAt;
        expect(await backfillClassesPerPeriod(prisma)).toEqual({
            unsetBefore: 0,
            filled: 0,
            unsetAfter: 0,
        });
        expect((await row(eight.id)).classesPerPeriodSetAt).toEqual(stamp);
        expect(await unsetClassesPerPeriod(prisma)).toBe(0);
    });
});
