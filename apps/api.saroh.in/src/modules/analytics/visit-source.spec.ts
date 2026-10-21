import {
    isVisitSource,
    VISIT_SOURCES,
    visitOriginOf,
    visitRefOf,
} from "./visit-source";

describe("visit-source — what a visit's source may be (U15)", () => {
    it("has the five groups the merchant reads", () => {
        expect(VISIT_SOURCES).toEqual([
            "instagram",
            "google",
            "whatsapp",
            "direct",
            "other",
        ]);
        expect(isVisitSource("google")).toBe(true);
        expect(isVisitSource("Google")).toBe(false);
        expect(isVisitSource("facebook")).toBe(false);
        expect(isVisitSource(undefined)).toBe(false);
    });

    it("keeps a merchant's label lower-cased in its short shape", () => {
        expect(visitRefOf("Diwali-Post")).toBe("diwali-post");
        expect(visitRefOf("  story2  ")).toBe("story2");
        expect(visitRefOf("a")).toBe("a");
        expect(visitRefOf("x".repeat(32))).toBe("x".repeat(32));
    });

    it("refuses anything that could carry an address, an email or a number", () => {
        for (const value of [
            "",
            "x".repeat(33),
            "someone@example.com",
            "flowers.saroh.app",
            "has space",
            "under_score",
            "-start",
            "end-",
            "order-123456",
            "9876543210",
            "%20",
            null,
            7,
        ]) {
            expect(visitRefOf(value)).toBeNull();
        }
        // Five digits is a label ("sale-2026"), six is a number.
        expect(visitRefOf("sale-2026")).toBe("sale-2026");
        expect(visitRefOf("pin-12345")).toBe("pin-12345");
    });

    it("cleans what a checkout sent: a label only beside a group", () => {
        expect(visitOriginOf("instagram", "Diwali")).toEqual({
            source: "instagram",
            ref: "diwali",
        });
        expect(visitOriginOf("direct", "bad label")).toEqual({
            source: "direct",
            ref: null,
        });
        expect(visitOriginOf(undefined, "diwali")).toBeNull();
        expect(visitOriginOf("tiktok", "diwali")).toBeNull();
    });

    it("refuses seven or more digits in all, however they are split (privacy review)", () => {
        expect(visitRefOf("98765-43210")).toBeNull();
        expect(visitRefOf("call-987-654-3")).toBeNull();
        expect(visitRefOf("a1b2c3d4e5f6g7")).toBeNull();
        expect(visitRefOf("sale-2026-10")).toBe("sale-2026-10");
    });

    it("refuses a record's id, as the booking page's own ref carries (privacy review)", () => {
        expect(visitRefOf("cmh2k9x0a0001qz8l3v5d7f9b")).toBeNull();
        expect(visitRefOf("CMH2K9X0A0001QZ8L3V5D7F9B")).toBeNull();
        expect(visitOriginOf("direct", "cmh2k9x0a0001qz8l3v5d7f9b")).toEqual({
            source: "direct",
            ref: null,
        });
        // An id with few digits is refused by its shape alone.
        expect(visitRefOf("ckzqmabcdefghijklmnopqrst")).toBeNull();
        // A label that only starts with c, or is one letter short, is kept.
        expect(visitRefOf("christmas-sale")).toBe("christmas-sale");
        expect(visitRefOf("ckzqmabcdefghijklmnopqrs")).toBe(
            "ckzqmabcdefghijklmnopqrs",
        );
    });
});
