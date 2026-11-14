/**
 * The period summaries (14 Nov): their definitions, what each says over an
 * in-memory read (a role's omissions, the period before, an empty period),
 * and the bucket fold. The SQL runs against Postgres in
 * `period-summary.tools.db.spec.ts`.
 */
const db = {
    $queryRaw: jest.fn(),
    businessProfile: { findUnique: jest.fn() },
    order: { groupBy: jest.fn(), count: jest.fn(), findMany: jest.fn() },
    invoice: { findMany: jest.fn() },
    stockEntry: { groupBy: jest.fn() },
};
jest.mock("@saroh/database", () => ({
    ...jest.requireActual("@saroh/database"),
    prisma: db,
}));
jest.mock("../../bookings/staff-availability", () => ({
    businessTimezone: () => Promise.resolve("Asia/Kolkata"),
}));

import { z } from "zod";

import type { OrganizationContext } from "../../../common/types/organization-context";
import type { OrgAction } from "../../organizations/organization-policy";
import type { McpCall, McpTool } from "../tool-registry";
import {
    foldBuckets,
    periodSummaryTools,
    standingWhere,
} from "./period-summary.tools";

const tools: McpTool[] = periodSummaryTools();
const tool = (name: string) => tools.find((t) => t.name === name) as McpTool;

const callAs = (...actions: OrgAction[]) =>
    ({
        ctx: {
            organizationId: "org1",
            userId: "u1",
            role: "MEMBER",
            roleKey: "custom",
            actions: new Set(actions),
        } as unknown as OrganizationContext,
    }) as McpCall;

beforeEach(() => jest.clearAllMocks());

describe("period summary definitions", () => {
    it("are the four summaries", () => {
        expect(tools.map((t) => t.name)).toEqual([
            "summarise_orders",
            "summarise_invoices",
            "summarise_stock",
            "summarise_bookings",
        ]);
    });

    it.each(tools.map((t) => [t.name, t]))(
        "%s: reads only, says when and when not, strict input with the shared period, small",
        (_name, t) => {
            expect(t.description).toMatch(/^Use this when/);
            expect(t.description).toMatch(/Example/);
            expect(t.description).toMatch(/Not for/);
            expect(t.hints.readOnlyHint).toBe(true);
            expect(t.contract.input.safeParse({ surprise: 1 }).success).toBe(
                false,
            );
            expect(
                t.contract.input.safeParse({ period: "last_3_months" }).success,
            ).toBe(true);
            expect(t.contract.input.safeParse({ from: "1 Aug" }).success).toBe(
                false,
            );
            const model = JSON.stringify({
                name: t.name,
                description: t.description,
                input: z.toJSONSchema(t.contract.input, { io: "input" }),
            });
            expect(model.length / 4).toBeLessThan(350);
        },
    );
});

describe("summarise_invoices", () => {
    it("says bills aren't shown to a role without invoice:read, reading nothing", async () => {
        const r = await tool("summarise_invoices").run(
            { period: "last_3_months" },
            callAs("order:read"),
        );
        expect(r.data).toMatchObject({ invoices: null, not_shown: ["bills"] });
        expect(r.text).toMatch(/role doesn't include bills/);
        expect(db.$queryRaw).not.toHaveBeenCalled();
    });

    it("totals by status, collected and owed, leaving money out without payment:read", async () => {
        db.$queryRaw.mockResolvedValueOnce([
            {
                standing: "paid",
                starts: "2026-09-01",
                currency: "INR",
                count: 3,
                amount: "300.00",
                collected: "300.00",
                owed: "0",
            },
            {
                standing: "overdue",
                starts: "2026-10-01",
                currency: "INR",
                count: 1,
                amount: "50.00",
                collected: "10.00",
                owed: "40.00",
            },
            {
                standing: "cancelled",
                starts: "2026-10-01",
                currency: "INR",
                count: 1,
                amount: "70.00",
                collected: "0",
                owed: "0",
            },
        ]);
        db.invoice.findMany.mockResolvedValueOnce([]);
        const r = await tool("summarise_invoices").run(
            { period: "last_3_months" },
            callAs("invoice:read", "payment:read"),
        );
        expect(r.data).toMatchObject({
            invoices: 5,
            collected: ["₹310"],
            owed: ["₹40"],
            span: { from: expect.any(String), to: expect.any(String) },
        });
        expect(r.text).toMatch(/Invoices: 5/);
        expect(r.text).toMatch(/Overdue 1/);
        // Not paid is said as one figure, of the bills issued in the period.
        expect(r.text).toMatch(
            /Of the 5 issued in these days: paid 3; not paid now 1 \(overdue 1, not due yet 0\)/,
        );

        db.$queryRaw.mockResolvedValueOnce([
            {
                standing: "paid",
                starts: "2026-09-01",
                currency: "INR",
                count: 3,
                amount: "300.00",
                collected: "300.00",
                owed: "0",
            },
        ]);
        db.invoice.findMany.mockResolvedValueOnce([]);
        const blind = await tool("summarise_invoices").run(
            {},
            callAs("invoice:read"),
        );
        expect(blind.data).toMatchObject({
            collected: null,
            owed: null,
            not_shown: ["payments"],
        });
        expect(blind.text).not.toMatch(/₹/);
    });

    it("names an empty period plainly", async () => {
        db.$queryRaw.mockResolvedValueOnce([]);
        db.invoice.findMany.mockResolvedValueOnce([]);
        const r = await tool("summarise_invoices").run(
            { period: "last_week" },
            callAs("invoice:read", "payment:read"),
        );
        expect(r.text).toMatch(/No invoices were issued in this period\./);
    });
});

describe("summarise_orders", () => {
    function read(
        now: { status: string; n: number }[],
        before: number,
        variants: unknown[] = [],
        stores: unknown[] = [],
    ) {
        db.order.groupBy
            .mockResolvedValueOnce(
                now.map((g) => ({ status: g.status, _count: { _all: g.n } })),
            )
            .mockResolvedValueOnce([{ currency: "INR", _sum: { total: 900 } }])
            .mockResolvedValueOnce([{ currency: "INR", _sum: { total: 400 } }]);
        db.order.count.mockResolvedValueOnce(before);
        db.$queryRaw
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce(variants)
            .mockResolvedValueOnce(stores);
        db.order.findMany.mockResolvedValueOnce([
            {
                id: "o1",
                orderId: "ORD-001",
                status: "DELIVERED",
                total: 900,
                currency: "INR",
                createdAt: new Date("2026-10-02T06:00:00Z"),
                walkInName: null,
                customer: { firstName: "Asha", lastName: null },
            },
        ]);
    }

    it("compares standing orders with the period before", async () => {
        read(
            [
                { status: "DELIVERED", n: 3 },
                { status: "CANCELLED", n: 1 },
            ],
            2,
        );
        const r = await tool("summarise_orders").run(
            { period: "last_3_months" },
            callAs("order:read", "payment:read"),
        );
        expect(r.data).toMatchObject({
            orders: 4,
            standing: 3,
            cancelled: 1,
            amount: ["₹900"],
            before: { orders: 2, amount: ["₹400"] },
        });
        expect(r.text).toMatch(/3 standing \(₹900\), 1 cancelled/);
        expect(r.text).toMatch(/up 50% on before \(2\)/);
        expect(r.text).toMatch(/Compared with/);
    });

    it("says the standing orders before even when the change rounds to 0%", async () => {
        read([{ status: "DELIVERED", n: 295 }], 294);
        const r = await tool("summarise_orders").run(
            { period: "last_3_months" },
            callAs("order:read", "payment:read"),
        );
        expect(r.text).toMatch(
            /Period before \(\d{4}-\d\d-\d\d to \d{4}-\d\d-\d\d\): 294 standing \(₹400\); standing orders the same as before/,
        );
        expect(r.text).toMatch(/Answer with: the orders placed \(295\)/);
    });

    it("leaves money out without payment:read and names it", async () => {
        read([{ status: "PENDING", n: 1 }], 0);
        const r = await tool("summarise_orders").run({}, callAs("order:read"));
        expect(r.data).toMatchObject({
            amount: null,
            before: { amount: null },
            not_shown: ["payments"],
        });
        expect(
            (r.data as { first: { total: unknown }[] }).first[0].total,
        ).toBeNull();
        expect(r.text).not.toMatch(/₹/);
    });

    it("names the best sizes or colours, and splits by store only when there are several", async () => {
        read(
            [{ status: "DELIVERED", n: 5 }],
            0,
            [
                {
                    id: "p1",
                    name: "Cotton kurta",
                    variant_id: "v1",
                    variant: "M",
                    sold: 7,
                },
            ],
            [
                { id: "s1", name: "Navrangpura", orders: 3, standing: 3 },
                { id: "s2", name: "Satellite", orders: 2, standing: 1 },
            ],
        );
        const r = await tool("summarise_orders").run(
            { period: "today" },
            callAs("order:read"),
        );
        expect(r.data).toMatchObject({
            top_variants: [
                { product_id: "p1", variant_id: "v1", variant: "M", sold: 7 },
            ],
            by_location: [
                { location_id: "s1", orders: 3 },
                { location_id: "s2", orders: 2, standing: 1 },
            ],
        });
        expect(r.text).toMatch(/"Cotton kurta M" 7/);
        expect(r.text).toMatch(
            /By store: "Navrangpura" \(location_id s1\) 3 \(3 standing\); "Satellite" \(location_id s2\) 2 \(1 standing\)/,
        );

        read(
            [{ status: "DELIVERED", n: 1 }],
            0,
            [],
            [{ id: "s1", name: "Navrangpura", orders: 1, standing: 1 }],
        );
        const one = await tool("summarise_orders").run(
            {},
            callAs("order:read"),
        );
        expect(one.text).not.toMatch(/By store/);
    });

    it("says an empty period plainly", async () => {
        read([], 0);
        const r = await tool("summarise_orders").run(
            { from: "2026-08-01", to: "2026-08-31" },
            callAs("order:read", "payment:read"),
        );
        expect(r.text).toMatch(/2026-08-01 to 2026-08-31, Asia\/Kolkata/);
        expect(r.text).toMatch(/No orders were placed in this period\./);
    });
});

describe("summarise_stock", () => {
    it("says so when the business doesn't track stock", async () => {
        db.businessProfile.findUnique.mockResolvedValueOnce({
            stockTracking: false,
        });
        const r = await tool("summarise_stock").run({}, callAs("store:read"));
        expect(r.data).toMatchObject({ tracked: false });
        expect(r.text).toMatch(/isn't tracked/);
        expect(db.$queryRaw).not.toHaveBeenCalled();
    });

    it("names each shelf needing stock, with its size or colour and store", async () => {
        db.businessProfile.findUnique.mockResolvedValueOnce(null);
        db.$queryRaw
            .mockResolvedValueOnce([
                {
                    id: "p1",
                    name: "Cotton kurta",
                    currency: "INR",
                    on_hand: 20,
                    value: null,
                    low: 1,
                    short: 0,
                    out: 1,
                },
            ])
            .mockResolvedValueOnce([
                {
                    product_id: "p1",
                    name: "Cotton kurta",
                    variant_id: "v4",
                    variant: "XL",
                    location_id: "s2",
                    location: "Satellite",
                    on_hand: 0,
                    alert_at: 3,
                    need: "out",
                },
                {
                    product_id: "p1",
                    name: "Cotton kurta",
                    variant_id: "v2",
                    variant: "M",
                    location_id: "s2",
                    location: "Satellite",
                    on_hand: 1,
                    alert_at: 3,
                    need: "low",
                },
            ]);
        db.stockEntry.groupBy.mockResolvedValueOnce([]);
        const r = await tool("summarise_stock").run({}, callAs("store:read"));
        expect(r.data).toMatchObject({
            low: 1,
            out: 1,
            needs: [
                { variant: "XL", need: "out" },
                { variant: "M", on_hand: 1, need: "low" },
            ],
        });
        expect(r.text).toMatch(
            /"Cotton kurta XL" at "Satellite" out; "Cotton kurta M" at "Satellite" low, 1 left \(alert at 3\)/,
        );
    });
});

describe("standingWhere", () => {
    const now = new Date("2026-11-14T00:00:00Z");
    it("splits unpaid from overdue by the due date, credit notes apart", () => {
        expect(standingWhere("overdue", now)).toMatchObject({
            status: "ISSUED",
            dueAt: { lt: now },
            kind: { not: "CREDIT_NOTE" },
        });
        expect(standingWhere("unpaid", now)).toMatchObject({
            OR: [{ dueAt: null }, { dueAt: { gte: now } }],
        });
        expect(standingWhere("credit_notes", now)).toEqual({
            kind: "CREDIT_NOTE",
        });
    });
});

describe("foldBuckets", () => {
    it("folds currencies into one bar each, in order, money only when shown", () => {
        const rows = [
            { starts: "2026-10-01", currency: "INR", count: 2, amount: "100" },
            { starts: "2026-09-01", currency: "INR", count: 1, amount: "50" },
            { starts: "2026-10-01", currency: "USD", count: 1, amount: "5" },
        ];
        expect(foldBuckets(rows, true)).toEqual([
            { starts: "2026-09-01", count: 1, amount: ["₹50"] },
            { starts: "2026-10-01", count: 3, amount: ["₹100", "$5"] },
        ]);
        expect(foldBuckets(rows, false)[1]).toEqual({
            starts: "2026-10-01",
            count: 3,
            amount: null,
        });
    });
});
