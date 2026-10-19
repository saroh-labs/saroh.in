/**
 * Home A's "How it's going" (DEC-171) against a real Postgres: on a Monday
 * the last 7 days run Tuesday to Monday — last week's busy days still count,
 * never "0 · 19 fewer" — against the 7 days before; days turn at midnight in
 * the business's zone; owed is split into not due, 1 to 30 days late and
 * more than 30, with amounts only for `payment:read`; another business's
 * rows never count. Runs plain and with TEST_RLS=on.
 */
import { prisma, runInOrgContext } from "@saroh/database";

import { readGoing } from "./home-going";

const tag = `${process.pid}-${Date.now()}`;
const ZONE = "Asia/Kolkata";
// Monday 19 Oct 2026, 09:00 in Mumbai: nothing booked yet this morning.
const NOW = new Date("2026-10-19T03:30:00.000Z");
const ist = (iso: string) => new Date(`${iso}+05:30`);
const DAY = 24 * 60 * 60 * 1000;
const EVERY = { takings: true, bookings: true, orders: true, owed: true };
const clock = { now: NOW, zone: ZONE };

describe("Home A How it's going (DB)", () => {
    let orgId = "";
    let otherOrgId = "";
    let n = 0;

    async function business(name: string) {
        return (
            await prisma.organization.create({
                data: { name, slug: `home-going-${name}-${tag}`.toLowerCase() },
            })
        ).id;
    }

    async function service(organizationId: string) {
        return prisma.service.create({
            data: {
                organizationId,
                name: "Sourdough basics",
                durationMinutes: 60,
                capacity: 1,
                priceCents: 50_000,
                currency: "INR",
                timezone: ZONE,
            },
        });
    }

    async function book(organizationId: string, serviceId: string, at: Date) {
        await prisma.booking.create({
            data: {
                organizationId,
                serviceId,
                startAt: at,
                endAt: new Date(at.getTime() + 60 * 60_000),
                timezone: ZONE,
                status: "CONFIRMED",
                bookerName: "Asha",
                snapshot: {},
            },
        });
    }

    async function invoice(
        organizationId: string,
        data: Record<string, unknown>,
    ) {
        n += 1;
        await prisma.invoice.create({
            data: {
                organizationId,
                number: `GO-${n}-${tag}`,
                currency: "INR",
                subtotal: "1000.00",
                total: "1000.00",
                issuedAt: new Date(NOW.getTime() - 60 * DAY),
                ...data,
            },
        });
    }

    beforeAll(async () => {
        orgId = await business("Rye");
        otherOrgId = await business("Elsewhere");
        const sourdough = await service(orgId);
        const theirs = await service(otherOrgId);

        // The last 7 days, Tue 13 to Mon 19: two on Tuesday just after
        // midnight, two on Saturday, one this evening.
        await book(orgId, sourdough.id, ist("2026-10-13T00:15"));
        await book(orgId, sourdough.id, ist("2026-10-13T10:00"));
        await book(orgId, sourdough.id, ist("2026-10-17T10:00"));
        await book(orgId, sourdough.id, ist("2026-10-17T11:00"));
        await book(orgId, sourdough.id, ist("2026-10-19T18:00"));
        // The 7 before, Tue 6 to Mon 12: Monday at 23:45 is still the 12th.
        await book(orgId, sourdough.id, ist("2026-10-12T23:45"));
        await book(orgId, sourdough.id, ist("2026-10-06T09:00"));
        // Before both windows.
        await book(orgId, sourdough.id, ist("2026-10-05T23:59"));
        // Another business, this week.
        await book(otherOrgId, theirs.id, ist("2026-10-15T10:00"));

        // Sales: ₹3,000 in the last 7 days, ₹2,000 in the 7 before.
        for (const at of [
            "2026-10-13T09:00",
            "2026-10-16T09:00",
            "2026-10-19T08:30",
        ]) {
            await invoice(orgId, { status: "PAID", paidAt: ist(at) });
        }
        for (const at of ["2026-10-07T09:00", "2026-10-12T22:00"]) {
            await invoice(orgId, { status: "PAID", paidAt: ist(at) });
        }

        // Owed by age: no due date and due next week (not due), due 5 days
        // ago, due 40 days ago; a draft and a credit note never.
        await invoice(orgId, {
            status: "ISSUED",
            dueAt: null,
            total: "500.00",
        });
        await invoice(orgId, {
            status: "ISSUED",
            dueAt: new Date(NOW.getTime() + 7 * DAY),
        });
        await invoice(orgId, {
            status: "ISSUED",
            dueAt: new Date(NOW.getTime() - 5 * DAY),
            total: "2000.00",
        });
        await invoice(orgId, {
            status: "ISSUED",
            dueAt: new Date(NOW.getTime() - 40 * DAY),
            total: "3000.00",
        });
        await invoice(orgId, { status: "DRAFT", number: null });
        await invoice(orgId, { status: "ISSUED", kind: "CREDIT_NOTE" });
        await invoice(otherOrgId, {
            status: "ISSUED",
            dueAt: new Date(NOW.getTime() - 40 * DAY),
        });
    });

    afterAll(async () => {
        const ids = [orgId, otherOrgId];
        await prisma.invoice.deleteMany({
            where: { organizationId: { in: ids } },
        });
        await prisma.booking.deleteMany({
            where: { organizationId: { in: ids } },
        });
        await prisma.organization.deleteMany({ where: { id: { in: ids } } });
    });

    const read = (money: boolean) =>
        runInOrgContext(orgId, () =>
            readGoing(prisma, orgId, EVERY, clock, { money }),
        );

    it("compares Tuesday to Monday with the 7 days before, on a Monday", async () => {
        const going = await read(true);
        expect(going).toMatchObject({
            zone: ZONE,
            from: "2026-10-13",
            to: "2026-10-19",
            beforeFrom: "2026-10-06",
            beforeTo: "2026-10-12",
            bookings: { count: 5, before: 2, href: "/bookings" },
        });
        expect(going.sales).toEqual([
            {
                currency: "INR",
                amountMinor: 300_000,
                beforeMinor: 200_000,
                // Two payments before: too few to compare.
                change: { kind: "THIN" },
                href: `/billing/invoices?since=${encodeURIComponent(
                    "2026-10-12T18:30:00.000Z",
                )}`,
            },
        ]);
    });

    it("splits what is owed by how late", async () => {
        const going = await read(true);
        expect(going.owed).toEqual({
            totals: [{ currency: "INR", amountMinor: 650_000 }],
            bills: 4,
            overdue: 2,
            byAge: {
                notDue: {
                    count: 2,
                    totals: [{ currency: "INR", amountMinor: 150_000 }],
                    href: "/billing/invoices?view=issued",
                },
                late1to30: {
                    count: 1,
                    totals: [{ currency: "INR", amountMinor: 200_000 }],
                    href: "/billing/invoices?view=overdue",
                },
                lateOver30: {
                    count: 1,
                    totals: [{ currency: "INR", amountMinor: 300_000 }],
                    href: "/billing/invoices?view=overdue",
                },
            },
            href: "/billing/invoices?view=overdue",
        });
    });

    it("gives a role without payment:read counts and no amounts", async () => {
        const going = await read(false);
        expect(going.sales).toBeUndefined();
        expect(going.bookings?.count).toBe(5);
        expect(going.owed?.totals).toBeNull();
        expect(going.owed?.bills).toBe(4);
        for (const age of Object.values(going.owed?.byAge ?? {})) {
            expect(age.totals).toBeNull();
        }
    });

    it("never counts another business's rows", async () => {
        const going = await runInOrgContext(otherOrgId, () =>
            readGoing(prisma, otherOrgId, EVERY, clock, { money: true }),
        );
        expect(going.bookings).toEqual({
            count: 1,
            before: 0,
            href: "/bookings",
        });
        expect(going.owed?.bills).toBe(1);
        expect(going.sales).toEqual([]);
    });
});
