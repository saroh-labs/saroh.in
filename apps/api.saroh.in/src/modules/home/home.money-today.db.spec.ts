/**
 * Home A's "Money in today" (DEC-171) against a real Postgres: today is the
 * business's day in its zone — a payment at 00:10 IST counts, one at 23:50
 * IST the night before doesn't, though UTC puts both on the same date —
 * compared with the same weekday last week to the same time of day; another
 * business's money never counts. Runs plain and with TEST_RLS=on (the read
 * runs in the business's RLS context, as a request would).
 */
import { prisma, runInOrgContext } from "@saroh/database";

import { readMoneyToday } from "./home-money-today";

const tag = `${process.pid}-${Date.now()}`;
const ZONE = "Asia/Kolkata";
// Monday 19 Oct 2026, 14:30 in Mumbai.
const NOW = new Date("2026-10-19T09:00:00.000Z");
const ist = (iso: string) => new Date(`${iso}+05:30`);

describe("Home A money in today (DB)", () => {
    let orgId = "";
    let otherOrgId = "";
    let n = 0;

    async function paid(organizationId: string, paidAt: Date, total: string) {
        n += 1;
        await prisma.invoice.create({
            data: {
                organizationId,
                status: "PAID",
                number: `MT-${n}-${tag}`,
                currency: "INR",
                subtotal: total,
                total,
                issuedAt: paidAt,
                paidAt,
            },
        });
    }

    beforeAll(async () => {
        orgId = (
            await prisma.organization.create({
                data: { name: "Rye", slug: `home-money-today-${tag}` },
            })
        ).id;
        otherOrgId = (
            await prisma.organization.create({
                data: { name: "Elsewhere", slug: `home-money-other-${tag}` },
            })
        ).id;
        // Today: just after midnight, and at noon.
        await paid(orgId, ist("2026-10-19T00:10"), "1000.00");
        await paid(orgId, ist("2026-10-19T12:00"), "500.00");
        // Last night, 23:50: yesterday's, though UTC says 18 Oct for both.
        await paid(orgId, ist("2026-10-18T23:50"), "2000.00");
        // Last Monday by this time of day: three payments.
        await paid(orgId, ist("2026-10-12T10:00"), "600.00");
        await paid(orgId, ist("2026-10-12T11:00"), "600.00");
        await paid(orgId, ist("2026-10-12T12:00"), "600.00");
        // Last Monday after this time of day: not "so far".
        await paid(orgId, ist("2026-10-12T16:00"), "5000.00");
        // Another business, today.
        await paid(otherOrgId, ist("2026-10-19T10:00"), "9999.00");
    });

    afterAll(async () => {
        await prisma.invoice.deleteMany({
            where: { organizationId: { in: [orgId, otherOrgId] } },
        });
        await prisma.organization.deleteMany({
            where: { id: { in: [orgId, otherOrgId] } },
        });
    });

    it("counts today's money in the business's zone, against last Monday so far", async () => {
        const money = await runInOrgContext(orgId, () =>
            readMoneyToday(
                prisma,
                orgId,
                { now: NOW, zone: ZONE },
                { calendar: false },
            ),
        );
        expect(money.payments).toBe(2);
        expect(money.totals).toEqual([
            {
                currency: "INR",
                amountMinor: 150_000,
                lastWeekMinor: 180_000,
                change: { kind: "DOWN", percent: 17 },
            },
        ]);
        expect(money.href).toBe(
            `/billing/invoices?since=${encodeURIComponent(
                "2026-10-18T18:30:00.000Z",
            )}`,
        );
    });

    it("turns the day at midnight in Mumbai", async () => {
        // 23:55 IST on Sunday: the 23:50 payment is today's, not tomorrow's.
        const money = await runInOrgContext(orgId, () =>
            readMoneyToday(
                prisma,
                orgId,
                { now: ist("2026-10-18T23:55"), zone: ZONE },
                { calendar: true },
            ),
        );
        expect(money.totals.map((t) => t.amountMinor)).toEqual([200_000]);
        expect(money.payments).toBe(1);
        expect(money.href).toBe("/calendar");
    });

    it("never counts another business's money", async () => {
        const money = await runInOrgContext(otherOrgId, () =>
            readMoneyToday(
                prisma,
                otherOrgId,
                { now: NOW, zone: ZONE },
                { calendar: false },
            ),
        );
        expect(money.totals.map((t) => t.amountMinor)).toEqual([999_900]);
    });
});
