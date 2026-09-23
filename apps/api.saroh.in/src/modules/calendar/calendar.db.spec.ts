/**
 * The Business Calendar's month (U4) against a real Postgres: orders on
 * their day in the business's zone, an overdue invoice to act on, a weekly
 * collection with its skipped week left out, another business's rows never
 * seen, and a Member given the diary only. Runs in the integration project
 * (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
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
    });

    afterAll(async () => {
        const orgIds = [ctx.organizationId, otherOrgId];
        const where = { organizationId: { in: orgIds } };
        await prisma.subscriptionSkip.deleteMany({ where });
        await prisma.invoice.deleteMany({ where });
        await prisma.customerSubscription.deleteMany({ where });
        await prisma.subscriptionPlan.deleteMany({ where });
        await prisma.contact.deleteMany({ where });
        await prisma.order.deleteMany({ where });
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
