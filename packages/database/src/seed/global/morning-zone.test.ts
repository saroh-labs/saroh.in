import { describe, expect, it } from "vitest";

import { morningZone } from "./morning-zone";

describe("morningZone", () => {
    it("is mid-morning there at any hour here", () => {
        for (let hour = 0; hour < 24; hour++) {
            const now = new Date(Date.UTC(2026, 10, 4, hour, 30));
            const local = new Intl.DateTimeFormat("en-GB", {
                timeZone: morningZone(now),
                hour: "numeric",
                hourCycle: "h23",
            }).format(now);
            expect(Number(local), `${hour}:30 UTC`).toBeGreaterThanOrEqual(9);
            expect(Number(local), `${hour}:30 UTC`).toBeLessThanOrEqual(12);
        }
    });
});
