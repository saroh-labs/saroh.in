/**
 * The Business Calendar's month (U4) against a real Postgres: orders on
 * their day in the business's zone, an overdue invoice to act on, a weekly
 * collection with its skipped week left out, another business's rows never
 * seen, and a Member given the diary only; pay-now holds on the diary only
 * while they last (#508 U9), and takings dated when the money moved — a
 * pay-later order on the day it was paid, cash on the day it was recorded, a
 * refund taken off on its credit note's day. Runs in the integration project
 * (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import {
    ensureOrderInvoice,
    issueCreditNote,
} from "../invoices/order-invoicing";
import { CalendarService } from "./calendar.service";

const tag = `${process.pid}-${Date.now()}`;
const NOW = new Date("2026-09-20T06:00:00Z");

const availability = {
    listViews: jest.fn().mockResolvedValue(
        ["COMMERCE", "APPOINTMENTS", "PAYMENTS"].map((key) => ({
            key,
            readiness: "ACTIVE",
        })),
    ),
} as unknown as ModuleAvailabilityService;

const calendar = new CalendarService(availability);

describe("Business Calendar month (DB)", () => {
    let ownerId = "";
    let ctx: OrganizationContext;
    let otherOrgId = "";
    let subscriptionId = "";

    beforeAll(async () => {
        ownerId = (
            await prisma.user.create({
                data: { email: `calendar-owner-${tag}@example.com` },
            })
        ).id;
        const org = await prisma.organization.create({
            data: { name: "Rye & Co.", slug: `calendar-org-${tag}` },
        });
        ctx = { organizationId: org.id, userId: ownerId, role: "OWNER" };
        otherOrgId = (
            await prisma.organization.create({
                data: { name: "Elsewhere", slug: `calendar-other-${tag}` },
            })
        ).id;
        await prisma.businessProfile.create({
            data: { organizationId: org.id, timezone: "Asia/Kolkata" },
        });

        for (const [organizationId, slug] of [
            [org.id, `calendar-rye-${tag}`],
            [otherOrgId, `calendar-else-${tag}`],
        ]) {
            const store = await prisma.store.create({
                data: { name: slug, slug, organizationId },
            });
            const customer = await prisma.customer.create({
                data: {
                    storeId: store.id,
                    organizationId,
                    email: `buyer-${slug}@example.com`,
                    firstName: "Asha",
                },
            });
            // Three orders on the 5th in India — the first at 00:30 IST,
            // which is still the 4th in UTC.
            for (const [i, at] of [
                "2026-09-04T19:00:00Z",
                "2026-09-05T06:00:00Z",
                "2026-09-05T12:00:00Z",
            ].entries()) {
                await prisma.order.create({
                    data: {
                        storeId: store.id,
                        organizationId,
                        orderId: `ORD-${slug}-${i}`,
                        customerId: customer.id,
                        subtotal: "250",
                        total: "250",
                        currency: "INR",
                        paymentStatus: "PAID",
                        createdAt: new Date(at),
                    },
                });
            }
        }

        await prisma.invoice.create({
            data: {
                organizationId: org.id,
                number: `INV-${tag}`,
                status: "ISSUED",
                billToName: "Café Mocha",
                currency: "INR",
                subtotal: "4000",
                total: "4000",
                issuedAt: new Date("2026-09-03T06:00:00Z"),
                dueAt: new Date("2026-09-10T06:00:00Z"),
            },
        });

        const contact = await prisma.contact.create({
            data: {
                organizationId: org.id,
                email: `subscriber-${tag}@example.com`,
                firstName: "Meera",
            },
        });
        const plan = await prisma.subscriptionPlan.create({
            data: {
                organizationId: org.id,
                name: "Sourdough weekly",
                price: "300",
                currency: "INR",
                interval: "WEEK",
            },
        });
        subscriptionId = (
            await prisma.customerSubscription.create({
                data: {
                    organizationId: org.id,
                    planId: plan.id,
                    contactId: contact.id,
                    price: "300",
                    currency: "INR",
                    interval: "WEEK",
                    timezone: "Asia/Kolkata",
                    anchorAt: new Date("2026-08-28T18:30:00Z"),
                    currentPeriodStart: new Date("2026-09-17T18:30:00Z"),
                    currentPeriodEnd: new Date("2026-09-24T18:30:00Z"),
                    createdAt: new Date("2026-08-28T18:30:00Z"),
                    // Saturday.
                    collectionWeekday: 6,
                },
            })
        ).id;
        await prisma.subscriptionSkip.create({
            data: {
                organizationId: org.id,
                subscriptionId,
                date: new Date("2026-09-12T00:00:00Z"),
            },
        });

        // Orders whose money moved on another day than they were placed.
        const store = await prisma.store.create({
            data: {
                name: "Rye counter",
                slug: `calendar-counter-${tag}`,
                organizationId: org.id,
            },
        });
        const buyer = await prisma.customer.create({
            data: {
                storeId: store.id,
                organizationId: org.id,
                email: `counter-${tag}@example.com`,
                firstName: "Ravi",
            },
        });
        const loaf = await prisma.product.create({
            data: {
                storeId: store.id,
                organizationId: org.id,
                name: "Hamper",
                slug: `calendar-hamper-${tag}`,
                price: "100",
            },
        });
        const placeOrder = async (
            ref: string,
            rupees: number,
            placedAt: string,
        ) =>
            prisma.order.create({
                data: {
                    storeId: store.id,
                    organizationId: org.id,
                    orderId: `ORD-${ref}-${tag}`,
                    customerId: buyer.id,
                    subtotal: String(rupees),
                    total: String(rupees),
                    currency: "INR",
                    paymentStatus: "UNPAID",
                    createdAt: new Date(placedAt),
                    items: {
                        create: {
                            productId: loaf.id,
                            quantity: rupees / 100,
                            price: "100",
                        },
                    },
                },
            });
        const pay = async (
            orderId: string,
            at: string,
            method: string,
        ): Promise<string> => {
            await prisma.order.update({
                where: { id: orderId },
                data: { paymentStatus: "PAID" },
            });
            const invoice = await prisma.$transaction((tx) =>
                ensureOrderInvoice(tx, orderId, { at: new Date(at), method }),
            );
            return invoice!.id;
        };

        // Pay later: placed on 30 Sep (IST), paid online on 2 Oct.
        const later = await placeOrder("later", 1000, "2026-09-30T10:00:00Z");
        await pay(later.id, "2026-10-02T06:00:00Z", "ONLINE");
        // Paid in cash at the counter on 3 Oct, recorded by hand.
        const cash = await placeOrder("cash", 400, "2026-10-03T04:00:00Z");
        await pay(cash.id, "2026-10-03T08:00:00Z", "CASH");
        // ₹1,000 paid on 6 Oct, ₹300 of it refunded the same day.
        const refunded = await placeOrder(
            "refund",
            1000,
            "2026-10-06T04:00:00Z",
        );
        const invoiceId = await pay(
            refunded.id,
            "2026-10-06T05:00:00Z",
            "ONLINE",
        );
        await prisma.$transaction((tx) =>
            issueCreditNote(tx, {
                invoiceId,
                amountCents: 30_000,
                note: "One jar broken",
                at: new Date("2026-10-06T09:00:00Z"),
            }),
        );

        // Pay-now holds on the diary: one still inside its time, one run
        // out, beside a confirmed booking — for a one-to-one and a class.
        const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);
        for (const [name, capacity] of [
            ["Physio", 1],
            ["Spin", 3],
        ] as const) {
            const service = await prisma.service.create({
                data: {
                    organizationId: org.id,
                    name,
                    durationMinutes: 45,
                    capacity,
                    priceCents: 50_000,
                    currency: "INR",
                    timezone: "Asia/Kolkata",
                },
            });
            for (const [i, [who, status, holdExpiresAt]] of (
                [
                    ["Booked", "CONFIRMED", null],
                    ["Holding", "PENDING", minutes(10)],
                    ["Lapsed", "PENDING", minutes(-1)],
                ] as const
            ).entries()) {
                // A class is one start; one-to-ones an hour apart.
                const start =
                    capacity > 1
                        ? new Date("2026-09-22T01:30:00Z")
                        : new Date(Date.UTC(2026, 8, 22, 4 + i));
                await prisma.booking.create({
                    data: {
                        organizationId: org.id,
                        serviceId: service.id,
                        startAt: start,
                        endAt: new Date(start.getTime() + 45 * 60_000),
                        timezone: "Asia/Kolkata",
                        status,
                        holdExpiresAt,
                        paidWith: "PAID",
                        bookerName: `${who} ${name}`,
                        snapshot: {},
                    },
                });
            }
        }
    });

    afterAll(async () => {
        const orgIds = [ctx.organizationId, otherOrgId];
        const where = { organizationId: { in: orgIds } };
        await prisma.subscriptionSkip.deleteMany({ where });
        await prisma.booking.deleteMany({ where });
        await prisma.service.deleteMany({ where });
        await prisma.invoice.deleteMany({ where });
        await prisma.customerSubscription.deleteMany({ where });
        await prisma.subscriptionPlan.deleteMany({ where });
        await prisma.contact.deleteMany({ where });
        await prisma.order.deleteMany({ where });
        await prisma.product.deleteMany({ where });
        await prisma.customer.deleteMany({ where });
        await prisma.store.deleteMany({ where });
        await prisma.businessProfile.deleteMany({ where });
        await prisma.auditEvent.deleteMany({ where });
        await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
        await prisma.user.deleteMany({ where: { id: ownerId } });
    });

    it("lays the month out in the business's zone, its own rows only", async () => {
        const month = await calendar.month(ctx, "2026-09", NOW);
        const day = (d: string) => month.days.find((x) => x.date === d);

        expect(month.timezone).toBe("Asia/Kolkata");
        expect(day("2026-09-05")?.layers.orders?.count).toBe(3);
        expect(day("2026-09-04")?.layers.orders?.count).toBe(0);
        expect(day("2026-09-05")?.takings).toEqual([
            { currency: "INR", amount: "750.00" },
        ]);
        expect(month.toActOn).toEqual([
            expect.objectContaining({
                kind: "invoice_overdue",
                date: "2026-09-10",
            }),
        ]);
        expect(month.unavailable).toEqual([]);
    });

    it("dates the weekly collections, the skipped week left out", async () => {
        const month = await calendar.month(ctx, "2026-09", NOW);
        const collected = month.days
            .filter((d) => (d.layers.collections?.count ?? 0) > 0)
            .map((d) => d.date);
        expect(collected).toEqual(["2026-09-05", "2026-09-19", "2026-09-26"]);
        expect(
            month.days.find((d) => d.date === "2026-09-25")?.layers
                .subscriptions?.items[0]?.link,
        ).toEqual({ type: "subscription", id: subscriptionId });
    });

    it("a pay-later order is on the day it was placed, its money on the day it was paid", async () => {
        const september = await calendar.month(ctx, "2026-09", NOW);
        const thirtieth = september.days.find((d) => d.date === "2026-09-30");
        expect(thirtieth?.layers.orders?.count).toBe(1);
        expect(thirtieth?.takings).toEqual([]);

        const october = await calendar.month(ctx, "2026-10", NOW);
        const day = (d: string) => october.days.find((x) => x.date === d);
        expect(day("2026-10-02")?.layers.orders?.count).toBe(0);
        expect(day("2026-10-02")?.takings).toEqual([
            { currency: "INR", amount: "1000.00" },
        ]);
        // Cash recorded by hand is dated like money taken online.
        expect(day("2026-10-03")?.takings).toEqual([
            { currency: "INR", amount: "400.00" },
        ]);
        // ₹1,000 in, ₹300 back the same day: ₹700 taken.
        expect(day("2026-10-06")?.takings).toEqual([
            { currency: "INR", amount: "700.00" },
        ]);
        expect(october.takings?.total).toEqual([
            { currency: "INR", amount: "2100.00" },
        ]);
        // The order's own paper never shows on the Invoices layer.
        expect(october.totals.invoices).toBe(0);
    });

    it("a hold shows as held while it lasts and is gone once it has run out", async () => {
        const month = await calendar.month(ctx, "2026-09", NOW);
        const day = month.days.find((d) => d.date === "2026-09-22");

        const bookings = day?.layers.bookings?.items ?? [];
        expect(bookings.map((b) => [b.title, b.kind])).toEqual([
            ["Physio · Booked Physio", "booked"],
            ["Physio · Holding Physio", "held"],
        ]);
        // Both are to be paid online; only the confirmed one has been.
        expect(bookings[0].subtitle).toBe("Paid online");
        expect(bookings[1].subtitle).toBeNull();
        expect(day?.layers.bookings?.kinds).toEqual({ booked: 1, held: 1 });

        expect(day?.layers.classes?.items).toEqual([
            expect.objectContaining({
                kind: "class",
                title: "Spin",
                subtitle: "1 of 3 booked · 1 held",
            }),
        ]);
    });

    it("a Member gets the diary layers and no money", async () => {
        const month = await calendar.month(
            { ...ctx, role: "MEMBER" },
            "2026-09",
            NOW,
        );
        expect(month.layers).toEqual(["bookings", "classes"]);
        expect(month).not.toHaveProperty("takings");
        expect(month.toActOn).toEqual([]);
    });
});
