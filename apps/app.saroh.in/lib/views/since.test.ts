import { describe, expect, it } from "vitest";

import { isSince, sinceParam, withoutSince } from "./since";

const NOW = new Date("2026-09-18T04:00:00.000Z");
const SINCE = "2026-09-17T04:00:00.000Z";

describe("sinceParam", () => {
    it("reads the instant Home put on the link", () => {
        expect(sinceParam({ since: SINCE }, NOW)?.toISOString()).toBe(SINCE);
        expect(sinceParam({ since: [SINCE, "x"] }, NOW)?.toISOString()).toBe(
            SINCE,
        );
    });

    it("is no filter for a missing, malformed or future instant", () => {
        expect(sinceParam({}, NOW)).toBeNull();
        expect(sinceParam(undefined, NOW)).toBeNull();
        expect(sinceParam({ since: "yesterday" }, NOW)).toBeNull();
        expect(
            sinceParam({ since: "2026-09-19T04:00:00.000Z" }, NOW),
        ).toBeNull();
    });
});

describe("isSince", () => {
    const since = new Date(SINCE);

    it("keeps the rows from the instant on, the instant included", () => {
        expect(isSince("2026-09-17T04:00:00.000Z", since)).toBe(true);
        expect(isSince("2026-09-18T01:00:00.000Z", since)).toBe(true);
        expect(isSince("2026-09-17T03:59:59.000Z", since)).toBe(false);
    });

    it("drops a row with no instant, and keeps everything without a window", () => {
        expect(isSince(null, since)).toBe(false);
        expect(isSince(null, null)).toBe(true);
    });

    // The same instants the API counted (home.since.db.spec.ts): two orders
    // in the window, one before it — the list opens on the two.
    it("opens on exactly the rows Home counted", () => {
        const placed = [
            "2026-09-18T02:00:00.000Z",
            "2026-09-17T05:00:00.000Z",
            "2026-09-16T22:00:00.000Z",
        ];
        expect(placed.filter((p) => isSince(p, since))).toHaveLength(2);
    });
});

describe("withoutSince", () => {
    it("keeps the rest of the address", () => {
        expect(
            withoutSince("/bookings/all", { view: "all", since: SINCE }),
        ).toBe("/bookings/all?view=all");
        expect(withoutSince("/commerce/orders", { since: SINCE })).toBe(
            "/commerce/orders",
        );
    });
});
