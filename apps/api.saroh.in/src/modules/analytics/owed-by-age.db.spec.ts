/**
 * Who owes by how late (DEC-171) against a real Postgres: what is left to
 * pay on each issued bill (DEC-173), never its total; the ages add up to
 * the total; credit notes, drafts, paid bills and an order's own bill are
 * never owed; a business that has never billed outside an order owes
 * nothing at all (null); and Home's "How it's going" reads the very same
 * figures. Runs plain and under TEST_RLS=on.
 */
import { prisma } from "@saroh/database";

import { readGoing } from "../home/home-going";
import { readOwedByAge } from "./owed-by-age";

const tag = `${process.pid}-${Date.now()}`;
const ZONE = "Asia/Kolkata";
// Monday 19 Oct 2026, 09:00 in Mumbai.
const NOW = new Date("2026-10-19T03:30:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const clock = { now: NOW, zone: ZONE };
const OWED_ONLY = {
    takings: false,
    bookings: false,
    orders: false,
    owed: true,
} as const;

describe("Owed by age (DB)", () => {
    let orgId = "";
    let shopId = "";
    let n = 0;

    async function business(name: string) {
        return (
            await prisma.organization.create({
                data: { name, slug: `owed-age-${name}-${tag}`.toLowerCase() },
            })
        ).id;
    }

    async function invoice(
        organizationId: string,
        data: Record<string, unknown>,
    ) {
        n += 1;
        return prisma.invoice.create({
            data: {
                organizationId,
                number: `OA-${n}-${tag}`,
                status: "ISSUED",
                currency: "INR",
                subtotal: "0",
                total: "0",
                issuedAt: new Date(NOW.getTime() - 60 * DAY),
                ...data,
            },
        });
    }

    beforeAll(async () => {
        orgId = await business("Loom");
        shopId = await business("Shop");

        // Not due: ₹2,500 with ₹1,000 paid, and ₹300 with no due date.
        await invoice(orgId, {
            total: "2500",
            paidCents: 100_000,
            dueAt: new Date(NOW.getTime() + 3 * DAY),
        });
        await invoice(orgId, { total: "300", dueAt: null });
        // 1 to 30 days late: ₹1,200 with ₹200 paid.
        await invoice(orgId, {
            total: "1200",
            paidCents: 20_000,
            dueAt: new Date(NOW.getTime() - 10 * DAY),
        });
        // More than 30 days late.
        await invoice(orgId, {
            total: "700",
            dueAt: new Date(NOW.getTime() - 45 * DAY),
        });
        // Never owed: paid, a draft, a credit note.
        await invoice(orgId, {
            status: "PAID",
            total: "900",
            paidCents: 90_000,
            paidAt: new Date(NOW.getTime() - DAY),
        });
        await invoice(orgId, { status: "DRAFT", number: null, total: "400" });
        await invoice(orgId, { kind: "CREDIT_NOTE", total: "100" });
    });

    it("sums what is left to pay by age, and the ages add up to the total", async () => {
        const owed = await readOwedByAge(prisma, orgId, clock, true);
        expect(owed).not.toBeNull();
        if (!owed) return;
        expect(owed.byAge.notDue).toMatchObject({
            count: 2,
            totals: [{ currency: "INR", amountMinor: 150_000 + 30_000 }],
        });
        expect(owed.byAge.late1to30).toMatchObject({
            count: 1,
            totals: [{ currency: "INR", amountMinor: 100_000 }],
        });
        expect(owed.byAge.lateOver30).toMatchObject({
            count: 1,
            totals: [{ currency: "INR", amountMinor: 70_000 }],
        });
        expect(owed.totals).toEqual([
            { currency: "INR", amountMinor: 350_000 },
        ]);
        expect(owed.bills).toBe(4);
        expect(owed.overdue).toBe(2);
    });

    it("gives the counts without amounts to someone without money", async () => {
        const owed = await readOwedByAge(prisma, orgId, clock, false);
        expect(owed?.totals).toBeNull();
        expect(owed?.byAge.notDue.totals).toBeNull();
        expect(owed?.bills).toBe(4);
    });

    it("is null for a business that has never billed outside an order", async () => {
        expect(await readOwedByAge(prisma, shopId, clock, true)).toBeNull();
    });

    it("is what Home's How it's going says is owed", async () => {
        const going = await readGoing(prisma, orgId, OWED_ONLY, clock, {
            money: true,
        });
        expect(going.owed).toEqual(
            await readOwedByAge(prisma, orgId, clock, true),
        );
    });
});
