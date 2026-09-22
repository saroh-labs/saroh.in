import { describe, expect, it } from "vitest";

import {
    balanceLabel,
    classesLeft,
    packOffer,
    packStanding,
    usableAt,
    usablePacks,
} from "./balance";

const NOW = new Date("2026-09-22T10:00:00Z");

const pack = (
    over: Partial<{ credits: number; used: number; expiresAt: string }> = {},
) => ({
    credits: 10,
    used: 3,
    expiresAt: "2026-10-12T00:00:00Z",
    ...over,
});

describe("a pack's balance", () => {
    it("reads 10 classes with 3 spent as 7 left", () => {
        expect(classesLeft(pack())).toBe(7);
        expect(balanceLabel(pack(), NOW)).toBe("7 left");
        expect(packStanding(pack(), NOW)).toBe("ACTIVE");
    });

    it("reads a pack past its date as expired, whatever it has left", () => {
        const old = pack({ expiresAt: "2026-09-01T00:00:00Z" });
        expect(balanceLabel(old, NOW)).toBe("Expired");
        expect(packStanding(old, NOW)).toBe("EXPIRED");
    });

    it("reads a pack with every class spent as used up", () => {
        const spent = pack({ used: 10 });
        expect(balanceLabel(spent, NOW)).toBe("Used up");
        expect(packStanding(spent, NOW)).toBe("USED_UP");
        expect(classesLeft(pack({ used: 12 }))).toBe(0);
    });
});

describe("which pack can pay for a session", () => {
    it("needs a class left", () => {
        expect(usableAt(pack({ used: 10 }), "2026-09-30T07:00:00Z")).toBe(
            false,
        );
    });

    it("needs the pack valid when the session starts, not just today", () => {
        // Valid until the 12th: fine for the 10th, not for the 15th.
        expect(usableAt(pack(), "2026-10-10T07:00:00Z")).toBe(true);
        expect(usableAt(pack(), "2026-10-15T07:00:00Z")).toBe(false);
    });

    it("offers the one expiring soonest first", () => {
        const later = {
            ...pack({ expiresAt: "2026-12-01T00:00:00Z" }),
            id: "b",
        };
        const sooner = { ...pack(), id: "a" };
        const spent = { ...pack({ used: 10 }), id: "c" };
        expect(
            usablePacks([later, spent, sooner], "2026-09-30T07:00:00Z").map(
                (p) => p.id,
            ),
        ).toEqual(["a", "b"]);
    });

    it("names it with its balance and date", () => {
        expect(
            packOffer({ ...pack(), pack: { name: "Morning pack" } }, "UTC"),
        ).toBe("Morning pack · 7 left, expires 12 Oct");
    });
});
