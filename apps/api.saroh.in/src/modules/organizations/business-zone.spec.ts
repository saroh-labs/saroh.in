import { businessZone } from "../bookings/staff-availability";
import { startingZone, zoneOf } from "./business-zone";

describe("startingZone", () => {
    it("never gives a US business its owner's Indian browser zone", () => {
        expect(startingZone("Asia/Kolkata", "US", "GLOBAL")).toBe(
            "America/New_York",
        );
    });

    it("keeps a sent zone that is in the country", () => {
        expect(startingZone("America/Denver", "US", "GLOBAL")).toBe(
            "America/Denver",
        );
        expect(startingZone("America/Indianapolis", "US", "GLOBAL")).toBe(
            "America/Indiana/Indianapolis",
        );
    });

    it("gives a one-zone country its zone, asked nothing", () => {
        expect(startingZone("Asia/Kolkata", "GB", "GLOBAL")).toBe(
            "Europe/London",
        );
    });

    it("gives an unlisted or unsaid country on Global the edition's default", () => {
        expect(startingZone(null, "ZZ", "GLOBAL")).toBe("UTC");
        expect(startingZone("America/Sao_Paulo", "BR", "GLOBAL")).toBe("UTC");
        expect(startingZone("Asia/Kolkata", "", "GLOBAL")).toBe("UTC");
    });

    it("keeps India's zone for India, whatever is sent", () => {
        expect(startingZone("America/Chicago", "IN", "INDIA")).toBe(
            "Asia/Kolkata",
        );
        expect(startingZone("Europe/London", null, "INDIA")).toBe(
            "Asia/Kolkata",
        );
        expect(startingZone(undefined, undefined, undefined)).toBe(
            "Asia/Kolkata",
        );
    });
});

describe("zoneOf", () => {
    it("keeps the business's own zone", () => {
        expect(zoneOf("America/Chicago", "GLOBAL")).toBe("America/Chicago");
        expect(zoneOf("Asia/Kolkata", "GLOBAL")).toBe("Asia/Kolkata");
    });

    it("falls back to the edition's default, never India's on Global", () => {
        expect(zoneOf(null, "GLOBAL")).toBe("UTC");
        expect(zoneOf("Mars/Olympus", "GLOBAL")).toBe("UTC");
        expect(zoneOf("", "INDIA")).toBe("Asia/Kolkata");
        expect(zoneOf(null, null)).toBe("Asia/Kolkata");
    });
});

describe("businessZone with no zone of its own", () => {
    const db = (edition: "INDIA" | "GLOBAL") =>
        ({
            businessProfile: { findUnique: jest.fn().mockResolvedValue(null) },
            service: { findFirst: jest.fn().mockResolvedValue(null) },
            organization: {
                findUnique: jest.fn().mockResolvedValue({ edition }),
            },
        }) as never;

    it("reads UTC for a Global business with no profile row", async () => {
        await expect(businessZone(db("GLOBAL"), "org_1")).resolves.toEqual({
            zone: "UTC",
            source: "fallback",
        });
    });

    it("still reads India's for an Indian business", async () => {
        await expect(businessZone(db("INDIA"), "org_1")).resolves.toEqual({
            zone: "Asia/Kolkata",
            source: "fallback",
        });
    });
});
