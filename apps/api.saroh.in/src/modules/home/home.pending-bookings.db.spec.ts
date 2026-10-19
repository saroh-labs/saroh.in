/**
 * Bookings awaiting payment (DEC-170's words, Home plan U1) against a real
 * Postgres: a coming booking with its payment link out and unpaid shows
 * with Send payment link and Turn down for the owner; one being paid for
 * on the booking page right now shows with Turn down only; a Member gets
 * Turn down and no amount; a booking already paid, with no link, past, or
 * whose link is overdue (a bill now), a hold that ran out, a cancelled one
 * and another business's never show. Runs plain and with TEST_RLS=on.
 */
import { prisma, runInOrgContext } from "@saroh/database";

import type { HomeInput } from "./home-model";
import { readAwaitingPayment } from "./home-pending-bookings";

const tag = `${process.pid}-${Date.now()}`;
const ZONE = "Asia/Kolkata";
// Monday 19 Oct 2026, 14:30 in Mumbai.
const NOW = new Date("2026-10-19T09:00:00.000Z");
const ist = (iso: string) => new Date(`${iso}+05:30`);
const MIN = 60_000;
const clock = { now: NOW, zone: ZONE };

describe("Home A bookings awaiting payment (DB)", () => {
    let orgId = "";
    let otherOrgId = "";
    let noProviderOrgId = "";
    const ids: Record<string, string> = {};
    let n = 0;

    async function business(name: string) {
        return (
            await prisma.organization.create({
                data: { name, slug: `home-await-${name}-${tag}`.toLowerCase() },
            })
        ).id;
    }

    async function service(organizationId: string) {
        return prisma.service.create({
            data: {
                organizationId,
                name: "Cake tasting",
                durationMinutes: 30,
                capacity: 1,
                priceCents: 50_000,
                currency: "INR",
                timezone: ZONE,
            },
        });
    }

    async function book(
        name: string,
        organizationId: string,
        serviceId: string,
        startAt: Date,
        over: {
            status?: string;
            holdExpiresAt?: Date;
            paidWith?: string;
            invoice?: { status: string; dueAt?: Date | null } | null;
        } = {},
    ) {
        const booking = await prisma.booking.create({
            data: {
                organizationId,
                serviceId,
                startAt,
                endAt: new Date(startAt.getTime() + 30 * MIN),
                timezone: ZONE,
                status: over.status ?? "CONFIRMED",
                holdExpiresAt: over.holdExpiresAt ?? null,
                paidWith: over.paidWith ?? null,
                bookerName: `Kavya ${name}`,
                snapshot: {},
            },
        });
        ids[name] = booking.id;
        if (over.invoice) {
            n += 1;
            await prisma.invoice.create({
                data: {
                    organizationId,
                    bookingId: booking.id,
                    source: "BOOKING",
                    kind: "INVOICE",
                    status: over.invoice.status,
                    number:
                        over.invoice.status === "DRAFT"
                            ? null
                            : `AW-${n}-${tag}`,
                    currency: "INR",
                    subtotal: "500.00",
                    total: "500.00",
                    dueAt: over.invoice.dueAt ?? null,
                    issuedAt: NOW,
                },
            });
        }
    }

    async function provider(organizationId: string) {
        await prisma.merchantPaymentProvider.create({
            data: {
                organizationId,
                provider: "CASHFREE",
                encryptedCredentials: "x",
                credentialsIv: "x",
                credentialsAuthTag: "x",
            },
        });
    }

    beforeAll(async () => {
        orgId = await business("Rye");
        otherOrgId = await business("Elsewhere");
        noProviderOrgId = await business("Kettle");
        await provider(orgId);
        await provider(otherOrgId);
        const tasting = await service(orgId);
        const theirs = await service(otherOrgId);
        const kettle = await service(noProviderOrgId);
        const issued = { status: "ISSUED" };

        // Shows: a link out for Wednesday, and one for later today.
        await book("wed", orgId, tasting.id, ist("2026-10-21T12:00"), {
            invoice: issued,
        });
        await book("tonight", orgId, tasting.id, ist("2026-10-19T19:00"), {
            invoice: { status: "ISSUED", dueAt: ist("2026-10-19T19:00") },
        });
        // Shows: being paid for now, 10 minutes left on its hold.
        await book("held", orgId, tasting.id, ist("2026-10-24T09:30"), {
            status: "PENDING",
            holdExpiresAt: new Date(NOW.getTime() + 10 * MIN),
            invoice: { status: "DRAFT" },
        });
        // Never: the hold ran out; no link; paid; paid with a pack though a
        // link is out; yesterday's; a link already overdue; cancelled.
        await book("expired", orgId, tasting.id, ist("2026-10-24T10:30"), {
            status: "PENDING",
            holdExpiresAt: new Date(NOW.getTime() - MIN),
            invoice: { status: "DRAFT" },
        });
        await book("noLink", orgId, tasting.id, ist("2026-10-22T10:00"));
        await book("paid", orgId, tasting.id, ist("2026-10-22T11:00"), {
            invoice: { status: "PAID" },
        });
        await book("byPack", orgId, tasting.id, ist("2026-10-22T12:00"), {
            paidWith: "PACK",
            invoice: issued,
        });
        await book("yesterday", orgId, tasting.id, ist("2026-10-18T12:00"), {
            invoice: issued,
        });
        await book("overdue", orgId, tasting.id, ist("2026-10-23T12:00"), {
            invoice: { status: "ISSUED", dueAt: ist("2026-10-19T09:00") },
        });
        await book("cancelled", orgId, tasting.id, ist("2026-10-23T13:00"), {
            status: "CANCELLED",
            invoice: issued,
        });
        await book("theirs", otherOrgId, theirs.id, ist("2026-10-21T12:00"), {
            invoice: issued,
        });
        await book(
            "kettle",
            noProviderOrgId,
            kettle.id,
            ist("2026-10-21T12:00"),
            {
                invoice: issued,
            },
        );
    });

    afterAll(async () => {
        const all = [orgId, otherOrgId, noProviderOrgId];
        await prisma.invoice.deleteMany({
            where: { organizationId: { in: all } },
        });
        await prisma.booking.deleteMany({
            where: { organizationId: { in: all } },
        });
        await prisma.merchantPaymentProvider.deleteMany({
            where: { organizationId: { in: all } },
        });
        await prisma.organization.deleteMany({ where: { id: { in: all } } });
    });

    const owner = (organizationId: string): HomeInput => ({
        organizationId,
        organizationRole: "OWNER",
    });
    const read = (input: HomeInput) =>
        runInOrgContext(input.organizationId, () =>
            readAwaitingPayment(prisma, input, clock),
        );

    it("lists the coming bookings waiting for their money, soonest first", async () => {
        const action = await read(owner(orgId));
        expect(action?.code).toBe("APPOINTMENTS_AWAITING_PAYMENT");
        expect(action?.count).toBe(3);
        expect(action?.evidence?.map((e) => e.id)).toEqual([
            ids.tonight,
            ids.wed,
            ids.held,
        ]);
        expect(action?.totals).toEqual([
            { currency: "INR", amountMinor: 150_000 },
        ]);
    });

    it("offers the owner Send payment link and Turn down on a link out", async () => {
        const action = await read(owner(orgId));
        const wed = action?.evidence?.find((e) => e.id === ids.wed);
        expect(wed).toMatchObject({
            amountMinor: 50_000,
            currency: "INR",
            tag: "Awaiting payment",
            href: `/bookings/${ids.wed}`,
        });
        expect(wed?.inline?.kind).toBe("SEND_PAY_LINK");
        expect(wed?.second?.kind).toBe("TURN_DOWN");
    });

    it("offers only Turn down on a booking being paid for now", async () => {
        const action = await read(owner(orgId));
        const held = action?.evidence?.find((e) => e.id === ids.held);
        expect(held?.inline).toMatchObject({ kind: "TURN_DOWN", sends: false });
        expect(held?.second).toBeUndefined();
    });

    it("gives a Member Turn down and no amount", async () => {
        const action = await read({
            organizationId: orgId,
            organizationRole: "MEMBER",
        });
        expect(action?.count).toBe(3);
        expect(action?.totals).toBeNull();
        for (const ev of action?.evidence ?? []) {
            expect(ev.inline?.kind).toBe("TURN_DOWN");
            expect(ev.second).toBeUndefined();
            expect(ev.amountMinor).toBeNull();
        }
    });

    it("offers no payment link where no provider can open a checkout", async () => {
        const action = await read(owner(noProviderOrgId));
        expect(action?.evidence?.[0].inline?.kind).toBe("TURN_DOWN");
    });

    it("never shows another business's bookings", async () => {
        const action = await read(owner(otherOrgId));
        expect(action?.evidence?.map((e) => e.id)).toEqual([ids.theirs]);
    });
});
