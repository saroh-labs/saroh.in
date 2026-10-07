import { describe, expect, it } from "vitest";

import { access, row } from "./fixtures.test-data";
import { importRoom, planMeter } from "./meter";

/** UX-036: the limit shown before the work, with made-up figures. */
describe("planMeter", () => {
    it("counts before the limit, with nothing off", () => {
        const m = planMeter(
            access({ modules: [row({ usage: 4 })] }),
            "products",
        );
        expect(m).toMatchObject({
            label: "4 of 10 products",
            full: false,
            room: 6,
            reason: null,
        });
    });

    it("says why New product is off at the limit, and where to get more", () => {
        const m = planMeter(
            access({ modules: [row({ usage: 10 })] }),
            "products",
        );
        expect(m?.full).toBe(true);
        expect(m?.reason).toContain("Your plan holds 10 products.");
        expect(m?.href).toBe("/settings/billing?plan=b#change-plan");
    });

    it("is nothing when limits aren't enforced, uncapped or soft", () => {
        expect(planMeter(access({ enforced: false }), "products")).toBeNull();
        expect(
            planMeter(access({ modules: [row({ limit: null })] }), "products"),
        ).toBeNull();
        expect(
            planMeter(access({ modules: [row({ soft: true })] }), "products"),
        ).toBeNull();
        expect(planMeter(null, "products")).toBeNull();
    });
});

describe("importRoom", () => {
    const at4 = planMeter(access({ modules: [row({ usage: 4 })] }), "products");

    it("offers the rows that fit, before the import", () => {
        expect(importRoom(at4, 7)).toEqual({
            fits: 6,
            over: true,
            words: "Your plan holds 10 products. You have 4, so 6 of these 7 can come in.",
        });
    });

    it("takes the whole file when it fits", () => {
        expect(importRoom(at4, 6)).toEqual({
            fits: 6,
            over: false,
            words: null,
        });
        expect(importRoom(null, 50)).toBeNull();
    });

    it("says none fit at the limit", () => {
        const full = planMeter(
            access({ modules: [row({ usage: 10 })] }),
            "products",
        );
        expect(importRoom(full, 3)?.fits).toBe(0);
    });
});
