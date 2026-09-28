import "reflect-metadata";

import { BadRequestException, ValidationPipe } from "@nestjs/common";

import { validationPipeOptions } from "../../common/validation";
import { ListOrdersQuery } from "./dto";
import { storedValuesOf } from "./fulfilment";
import {
    computedConditions,
    dayRange,
    lateSettingsJoin,
    lateSql,
    orderConditions,
    paymentStandingOf,
    searchSql,
    tabCondition,
    ts,
} from "./order-list-filters";

/**
 * The Orders list's filters (plan B, B1), without a database: what each one
 * turns into, and the rules that decide what a caller may search. The SQL
 * itself runs in `order-list.db.spec.ts`.
 */

describe("fulfilment words (read through fulfilment.ts, B2a)", () => {
    it("matches each type as itself, with no legacy word (B2d)", () => {
        expect(storedValuesOf(["PICKUP"])).toEqual(["PICKUP"]);
        expect(storedValuesOf(["LOCAL_DELIVERY"])).toEqual(["LOCAL_DELIVERY"]);
        expect(storedValuesOf(["SHIPPING"])).toEqual(["SHIPPING"]);
        expect(storedValuesOf(["SHIPPING", "PICKUP"])).toEqual([
            "PICKUP",
            "SHIPPING",
        ]);
    });

    it("judges late by the type's storefront column (B17)", () => {
        const s = lateSql(new Date("2026-09-01T00:00:00.000Z"));
        for (const column of [
            'ss."pickupLateAfterMinutes"',
            'ss."localDeliveryLateAfterMinutes"',
            'ss."shippingLateAfterMinutes"',
        ]) {
            expect(s.sql).toContain(column);
        }
        expect(lateSettingsJoin().sql).toBe(
            'LEFT JOIN "StoreSettings" ss ON ss."storeId" = o."storeId"',
        );
    });
});

describe("dayRange — days in the business's zone", () => {
    it("starts the 1st at midnight IST, so 00:30 IST on the 1st is on the 1st", () => {
        const { gte, lt } = dayRange(
            "2026-09-01",
            "2026-09-01",
            "Asia/Kolkata",
        );
        expect(gte?.toISOString()).toBe("2026-08-31T18:30:00.000Z");
        expect(lt?.toISOString()).toBe("2026-09-01T18:30:00.000Z");
        const halfPastMidnight = new Date("2026-08-31T19:00:00.000Z");
        expect(halfPastMidnight >= gte! && halfPastMidnight < lt!).toBe(true);
    });

    it("takes either end alone", () => {
        expect(dayRange("2026-09-01", undefined, "UTC")).toEqual({
            gte: new Date("2026-09-01T00:00:00.000Z"),
            lt: undefined,
        });
        expect(dayRange(undefined, "2026-09-01", "UTC")).toEqual({
            gte: undefined,
            lt: new Date("2026-09-02T00:00:00.000Z"),
        });
    });

    it("refuses a range that ends before it starts, and a day that isn't one", () => {
        expect(() => dayRange("2026-09-02", "2026-09-01", "UTC")).toThrow(
            BadRequestException,
        );
        expect(() => dayRange("2026-02-30", undefined, "UTC")).toThrow(
            BadRequestException,
        );
    });
});

describe("paymentStandingOf — the row's payment word", () => {
    it.each([
        ["PAID", 61000, 0, "PAID"],
        ["UNPAID", 0, 0, "UNPAID"],
        ["FAILED", 0, 0, "UNPAID"],
        ["PAID", 61000, 12000, "PARTLY_REFUNDED"],
        ["PAID", 61000, 61000, "REFUNDED"],
        ["REFUNDED", 0, 0, "REFUNDED"],
    ] as const)(
        "%s, took %d, gave back %d → %s",
        (status, took, back, word) => {
            expect(paymentStandingOf(status, took, back)).toBe(word);
        },
    );
});

describe("the search", () => {
    const text = (s: { sql: string }) => s.sql.replace(/\s+/g, " ");

    it("finds an order number or a name, and nothing else, without contact:read", () => {
        const s = searchSql("9876543210", { contact: false });
        expect(text(s)).toContain(`o."orderId" ILIKE`);
        expect(text(s)).toContain("firstName");
        expect(text(s)).not.toContain("email");
        expect(text(s)).not.toContain("phone");
    });

    it("adds email and the phone's digits with contact:read", () => {
        const s = searchSql("+91 98765 43210", { contact: true });
        expect(text(s)).toContain("c.email ILIKE");
        expect(text(s)).toContain("regexp_replace");
        expect(s.values).toContain("%919876543210%");
    });

    it("drops a leading # and takes % and _ literally", () => {
        const s = searchSql("#10_4%", { contact: false });
        expect(s.values[0]).toBe("%10\\_4\\%%");
    });

    it("never matches a phone on fewer than three digits", () => {
        const s = searchSql("98", { contact: true });
        expect(text(s)).not.toContain("regexp_replace");
    });
});

describe("the conditions", () => {
    const text = (s: { sql: string }) => s.sql.replace(/\s+/g, " ");

    it("always scopes to the organization and leaves out abandoned checkouts", () => {
        const s = orderConditions("org_1", {}, { contact: false }, {});
        expect(text(s)).toContain(`o."organizationId" = ?`);
        expect(text(s)).toContain(
            `NOT (o."placedOnline" AND o."paymentStatus" = 'UNPAID')`,
        );
        expect(s.values).toEqual(["org_1"]);
    });

    it("narrows by storefront, customer, product, step and type as text", () => {
        const s = orderConditions(
            "org_1",
            {
                storeId: "s1",
                customerId: "c1",
                productId: "p1",
                stage: ["READY"],
                fulfilment: ["SHIPPING"],
            },
            { contact: false },
            {},
        );
        expect(text(s)).toContain(`o."storeId" =`);
        expect(text(s)).toContain(`o."customerId" =`);
        expect(text(s)).toContain(`FROM "OrderItem" oi`);
        expect(text(s)).toContain("o.stage::text = ANY");
        expect(text(s)).toContain("o.fulfilment::text = ANY");
        expect(s.values).toEqual(
            expect.arrayContaining(["s1", "c1", "p1", ["READY"], ["SHIPPING"]]),
        );
    });

    it("narrows to orders placed since an instant, bound as the stored wall-clock", () => {
        const s = orderConditions(
            "org_1",
            { since: new Date("2026-09-26T10:15:00.000Z") },
            { contact: false },
            {},
        );
        expect(text(s)).toContain(`o."createdAt" >= ?::timestamp`);
        expect(s.values).toContain("2026-09-26T10:15:00.000");
    });

    it("binds dates as the UTC wall-clock Prisma stores, never through the session zone", () => {
        const s = ts(new Date("2026-09-01T00:30:00.000Z"));
        expect(s.sql).toBe("?::timestamp");
        expect(s.values).toEqual(["2026-09-01T00:30:00.000"]);
    });

    it("reads payment, late and the tab from the computed columns", () => {
        expect(text(computedConditions({}))).toBe("TRUE");
        const s = computedConditions({ payment: "UNPAID", late: true });
        expect(text(s)).toContain("m.payment =");
        expect(text(s)).toContain("m.late =");
        expect(tabCondition("open").sql).toBe("m.open");
        expect(tabCondition("refunded").sql).toBe("m.payment = 'REFUNDED'");
        expect(tabCondition(undefined).sql).toBe("TRUE");
    });

    it("falls back to each type's default for a storefront without settings", () => {
        const s = lateSql(new Date("2026-09-01T00:00:00.000Z"));
        expect(s.values).toEqual(
            expect.arrayContaining([
                "PICKUP",
                120,
                "LOCAL_DELIVERY",
                1440,
                "SHIPPING",
                2880,
            ]),
        );
        expect(s.values).not.toContain("DIGITAL");
    });
});

describe("ListOrdersQuery", () => {
    const pipe = new ValidationPipe(validationPipeOptions);
    const parse = (value: Record<string, unknown>) =>
        pipe.transform(value, {
            type: "query",
            metatype: ListOrdersQuery,
        }) as Promise<ListOrdersQuery>;

    it("takes repeated and comma lists, in any case", async () => {
        const q = await parse({
            v: "2",
            stage: ["new", "ready"],
            fulfilment: "pickup,shipping",
            payment: "unpaid",
            tab: "Open",
        });
        expect(q.stage).toEqual(["NEW", "READY"]);
        expect(q.fulfilment).toEqual(["PICKUP", "SHIPPING"]);
        expect(q.payment).toBe("UNPAID");
        expect(q.tab).toBe("open");
    });

    it("takes since as an ISO instant, and a blank one as none", async () => {
        const q = await parse({ since: "2026-09-26T10:15:00.000Z" });
        expect(q.since).toBe("2026-09-26T10:15:00.000Z");
        expect((await parse({ since: "" })).since).toBeUndefined();
    });

    it("treats a blank storefront as every storefront", async () => {
        const q = await parse({ storeId: "" });
        expect(q.storeId).toBeUndefined();
    });

    it.each([
        { stage: "SHIPPED" },
        { fulfilment: "COURIER" },
        { payment: "SOMETIMES" },
        { tab: "abandoned" },
        { late: "yes" },
        { from: "1 Sep" },
        { since: "yesterday" },
        { since: "2026-02-30T10:00:00Z" },
        { v: "3" },
        // The bare array went in the contract release (B2d): nothing asks
        // for it by name.
        { v: "1" },
        // The legacy words went with it.
        { fulfilment: "COLLECT" },
        { fulfilment: "delivery" },
        { attention: "true" },
    ])("refuses %o", async (value) => {
        await expect(parse(value)).rejects.toThrow(BadRequestException);
    });
});
