import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
    cursor,
    decodeCursor,
    encodeCursor,
    errorEnvelope,
    money,
    page,
    pageQuery,
} from "./common";

describe("money", () => {
    it("takes whole minor units and an ISO 4217 code", () => {
        expect(money.parse({ amountMinor: 12_500, currency: "INR" })).toEqual({
            amountMinor: 12_500,
            currency: "INR",
        });
    });

    it("refuses a fractional minor unit", () => {
        expect(
            money.safeParse({ amountMinor: 125.5, currency: "INR" }).success,
        ).toBe(false);
    });

    it("refuses a currency that isn't three capitals", () => {
        expect(
            money.safeParse({ amountMinor: 100, currency: "inr" }).success,
        ).toBe(false);
    });
});

describe("cursor", () => {
    it("round-trips through encode and decode", () => {
        const encoded = encodeCursor("prod_42|2026-11-10");
        expect(cursor.safeParse(encoded).success).toBe(true);
        expect(decodeCursor(encoded)).toBe("prod_42|2026-11-10");
    });

    it.each(["not a cursor", "abc+/", "abcde", ""])("refuses %j", (value) => {
        expect(cursor.safeParse(value).success).toBe(false);
    });

    it("page query converts limit text and refuses unknown fields", () => {
        expect(pageQuery.parse({ limit: "10" })).toEqual({ limit: 10 });
        expect(pageQuery.parse({})).toEqual({ limit: 20 });
        expect(pageQuery.safeParse({ limit: "0" }).success).toBe(false);
        expect(pageQuery.safeParse({ offset: "5" }).success).toBe(false);
    });
});

describe("page", () => {
    it("wraps items with the next cursor or null", () => {
        const schema = page(z.object({ id: z.string() }));
        expect(schema.parse({ data: [{ id: "a" }], nextCursor: null })).toEqual(
            { data: [{ id: "a" }], nextCursor: null },
        );
        expect(schema.safeParse({ data: [], nextCursor: "%%" }).success).toBe(
            false,
        );
    });
});

describe("errorEnvelope", () => {
    it("knows only the documented codes", () => {
        const base = { message: "No", requestId: "req_1" };
        expect(
            errorEnvelope.safeParse({ error: { ...base, code: "not_found" } })
                .success,
        ).toBe(true);
        expect(
            errorEnvelope.safeParse({ error: { ...base, code: "NOT_FOUND" } })
                .success,
        ).toBe(false);
    });
});
