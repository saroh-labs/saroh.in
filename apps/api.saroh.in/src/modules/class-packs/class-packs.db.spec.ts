/**
 * Class packs against a real Postgres: the last class raced for, the balance
 * after bookings and cancels, expiry at the session's start, which pack is
 * spent, and that a refused booking leaves nothing behind. Runs in the
 * integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { BookingsService } from "../bookings/bookings.service";
import { InvoicesService } from "../invoices/invoices.service";
import { ClassPacksService } from "./class-packs.service";

const packs = new ClassPacksService(new InvoicesService());
const bookings = new BookingsService();

const DAY = 86_400_000;
let org: OrganizationContext;
let contactId: string;
let serviceId: string;
let people = 0;

/** 09:00 UTC, `days` from now: a slot the all-day rules accept. */
function slot(days: number): Date {
    const d = new Date(Date.now() + days * DAY);
    d.setUTCHours(9, 0, 0, 0);
    return d;
}

beforeAll(async () => {
    const created = await prisma.organization.create({
        data: { name: "Packs Org", slug: `packs-org-${process.pid}` },
    });
    // Booking history names the person who booked by hand, so they exist.
    const user = await prisma.user.create({
        data: { email: `packs-${process.pid}@example.com` },
    });
    org = { organizationId: created.id, userId: user.id, role: "OWNER" };
    const service = await prisma.service.create({
        data: {
            organizationId: org.organizationId,
            name: "Vinyasa",
            durationMinutes: 60,
            capacity: 20,
            timezone: "UTC",
            status: "ACTIVE",
        },
    });
    serviceId = service.id;
    await prisma.availabilityRule.createMany({
        data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
            organizationId: org.organizationId,
            serviceId,
            dayOfWeek,
            startMinute: 0,
            endMinute: 1440,
        })),
    });
});

// Each test sells to its own person, so one test's packs never answer another's.
beforeEach(async () => {
    people += 1;
    contactId = (
        await prisma.contact.create({
            data: {
                organizationId: org.organizationId,
                email: `person${people}@example.com`,
                firstName: "Asha",
            },
        })
    ).id;
});

async function makePack(credits: number, validityDays: number) {
    return packs.createPack(org, {
        name: `${credits}-class pack`,
        credits,
        validityDays,
        price: "4500",
        currency: "INR",
        serviceIds: [serviceId],
    });
}

async function booking(startAt: Date) {
    return prisma.booking.create({
        data: {
            organizationId: org.organizationId,
            serviceId,
            contactId,
            startAt,
            endAt: new Date(startAt.getTime() + 3_600_000),
            timezone: "UTC",
            status: "CONFIRMED",
            snapshot: {},
            bookerEmail: `person${people}@example.com`,
        },
    });
}

describe("class packs (real database)", () => {
    it("counts down with bookings and back up with a cancel", async () => {
        const pack = await makePack(10, 90);
        const sold = await packs.sell(org, pack.id, { contactId });
        expect(sold.invoiceId).not.toBeNull();

        const made = [];
        for (const days of [2, 3, 4]) {
            made.push(
                await bookings.bookByHand(org, serviceId, {
                    startAt: slot(days).toISOString(),
                    contactId,
                    packPurchaseId: sold.id,
                }),
            );
        }
        expect((await packs.getPurchase(org, sold.id)).left).toBe(7);

        await bookings.cancelBooking(org, made[0]!.id);
        expect((await packs.getPurchase(org, sold.id)).left).toBe(8);
    });

    it("gives the last class to one of two concurrent spends, and says why to the other", async () => {
        const pack = await makePack(1, 30);
        const sold = await packs.sell(org, pack.id, { contactId });
        const [a, b] = await Promise.all([booking(slot(5)), booking(slot(6))]);

        const results = await Promise.allSettled([
            packs.useOnBooking(org, a.id, { packPurchaseId: sold.id }),
            packs.useOnBooking(org, b.id, { packPurchaseId: sold.id }),
        ]);
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const refused = results.find(
            (r) => r.status === "rejected",
        ) as PromiseRejectedResult;
        expect(String(refused.reason)).toMatch(/no classes left/);
        expect((await packs.getPurchase(org, sold.id)).left).toBe(0);
    });

    it("never double-spends the last class when two bookings race for it", async () => {
        const pack = await makePack(1, 30);
        const sold = await packs.sell(org, pack.id, { contactId });
        const results = await Promise.allSettled([
            bookings.bookByHand(org, serviceId, {
                startAt: slot(7).toISOString(),
                contactId,
                packPurchaseId: sold.id,
            }),
            bookings.bookByHand(org, serviceId, {
                startAt: slot(8).toISOString(),
                contactId,
                packPurchaseId: sold.id,
            }),
        ]);
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        expect(
            await prisma.packRedemption.count({
                where: { purchaseId: sold.id, reversedAt: null },
            }),
        ).toBe(1);
        // The refused booking went with its transaction.
        expect(
            await prisma.booking.count({
                where: { serviceId, startAt: { in: [slot(7), slot(8)] } },
            }),
        ).toBe(1);
    });

    it("will not pay for a session after the pack runs out, even booked before then", async () => {
        const pack = await makePack(5, 10);
        const sold = await packs.sell(org, pack.id, { contactId });
        const late = await booking(slot(15));
        await expect(
            packs.useOnBooking(org, late.id, { packPurchaseId: sold.id }),
        ).rejects.toThrow("runs out before this session");
    });

    it("spends the pack that expires soonest when none is named", async () => {
        const long = await packs.sell(org, (await makePack(5, 120)).id, {
            contactId,
        });
        const soon = await packs.sell(org, (await makePack(5, 40)).id, {
            contactId,
        });
        const b = await booking(slot(9));
        const used = await packs.useOnBooking(org, b.id, {});
        expect(used.purchase.id).toBe(soon.id);
        expect(used.purchase.id).not.toBe(long.id);
    });

    it("leaves no redemption when the booking itself is refused", async () => {
        const pack = await makePack(5, 60);
        const sold = await packs.sell(org, pack.id, { contactId });
        const tiny = await prisma.service.create({
            data: {
                organizationId: org.organizationId,
                name: "Private session",
                durationMinutes: 60,
                capacity: 1,
                timezone: "UTC",
                status: "ACTIVE",
            },
        });
        await prisma.classPackService.create({
            data: {
                packId: pack.id,
                serviceId: tiny.id,
                organizationId: org.organizationId,
            },
        });
        await prisma.availabilityRule.createMany({
            data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
                organizationId: org.organizationId,
                serviceId: tiny.id,
                dayOfWeek,
                startMinute: 0,
                endMinute: 1440,
            })),
        });
        const when = slot(11).toISOString();
        await bookings.bookByHand(org, tiny.id, {
            startAt: when,
            bookerEmail: "other@example.com",
        });

        await expect(
            bookings.bookByHand(org, tiny.id, {
                startAt: when,
                contactId,
                packPurchaseId: sold.id,
            }),
        ).rejects.toThrow("fully booked");
        expect((await packs.getPurchase(org, sold.id)).left).toBe(5);
    });

    it("records a sale with no invoice when Payments is off", async () => {
        const off = await prisma.organization.create({
            data: { name: "No payments", slug: `no-payments-${process.pid}` },
        });
        const offCtx: OrganizationContext = {
            organizationId: off.id,
            userId: "u",
            role: "OWNER",
        };
        await prisma.organizationModule.create({
            data: {
                organizationId: off.id,
                moduleKey: "PAYMENTS",
                status: "DISABLED",
            },
        });
        const c = await prisma.contact.create({
            data: { organizationId: off.id, email: "b@example.com" },
        });
        const s = await prisma.service.create({
            data: {
                organizationId: off.id,
                name: "Hatha",
                durationMinutes: 60,
                timezone: "UTC",
                status: "ACTIVE",
            },
        });
        const pack = await packs.createPack(offCtx, {
            name: "5 classes",
            credits: 5,
            validityDays: 60,
            price: "2500",
            currency: "INR",
            serviceIds: [s.id],
        });
        expect(await packs.sellingTerms(offCtx)).toEqual({
            invoicesOnSale: false,
        });
        const sold = await packs.sell(offCtx, pack.id, { contactId: c.id });
        expect(sold.invoiceId).toBeNull();
        expect(sold.price).toBe("2500.00");
        expect(
            await prisma.invoice.count({ where: { organizationId: off.id } }),
        ).toBe(0);
    });

    it("says on the booking which pack pays for it, and stops saying so once it is taken off", async () => {
        const pack = await makePack(5, 60);
        const sold = await packs.sell(org, pack.id, { contactId });
        const b = await booking(slot(12));
        await packs.useOnBooking(org, b.id, { packPurchaseId: sold.id });

        const paid = await bookings.getBooking(org, b.id);
        expect(paid.packRedemption).toMatchObject({
            reversedAt: null,
            purchase: { id: sold.id, pack: { name: "5-class pack" } },
        });

        await packs.removeFromBooking(org, b.id);
        const unpaid = await bookings.getBooking(org, b.id);
        expect(unpaid.packRedemption?.reversedAt).toBeInstanceOf(Date);
    });

    it("lists only the packs that cover a service when asked, and counts sales", async () => {
        const covering = await makePack(5, 60);
        const other = await prisma.service.create({
            data: {
                organizationId: org.organizationId,
                name: "Yin",
                durationMinutes: 60,
                timezone: "UTC",
                status: "ACTIVE",
            },
        });
        const elsewhere = await packs.createPack(org, {
            name: "Yin pack",
            credits: 3,
            validityDays: 30,
            price: "900",
            currency: "INR",
            serviceIds: [other.id],
        });
        await packs.sell(org, covering.id, { contactId });
        await packs.sell(org, elsewhere.id, { contactId });

        const forVinyasa = await packs.listPurchases(org, {
            contactId,
            serviceId,
        });
        expect(forVinyasa.map((p) => p.pack.id)).toEqual([covering.id]);
        expect(
            (await packs.listPurchases(org, { contactId })).map(
                (p) => p.pack.id,
            ),
        ).toHaveLength(2);
        expect(await packs.getPack(org, covering.id)).toMatchObject({
            sold: 1,
            activeHolders: 1,
        });
        expect(await packs.sellingTerms(org)).toEqual({ invoicesOnSale: true });
    });
});
