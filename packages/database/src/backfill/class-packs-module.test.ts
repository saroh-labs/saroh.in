import { describe, expect, it } from "vitest";

import type { ClassPacksEvidence } from "./class-packs-module";
import { decideClassPacks } from "./class-packs-module";

function org(over: Partial<ClassPacksEvidence>): ClassPacksEvidence {
    return {
        organizationId: "org_1",
        hasPacks: false,
        appointments: "ENABLED",
        existing: null,
        ...over,
    };
}

describe("the E12 Class packs backfill rule", () => {
    it("turns Class packs on for a business that sold packs", () => {
        expect(decideClassPacks(org({ hasPacks: true }))).toBe("enabled");
    });

    it("counts a missing Appointments row as on, as everywhere else", () => {
        expect(
            decideClassPacks(org({ hasPacks: true, appointments: null })),
        ).toBe("enabled");
    });

    it("holds it off while Appointments, which it needs, is switched off", () => {
        expect(
            decideClassPacks(org({ hasPacks: true, appointments: "DISABLED" })),
        ).toBe("held-off");
        expect(
            decideClassPacks(org({ hasPacks: true, appointments: "ARCHIVED" })),
        ).toBe("held-off");
    });

    it("leaves a business with no pack and no purchase off", () => {
        expect(decideClassPacks(org({}))).toBe("disabled");
    });

    it("never overwrites a row that is already there, on or off", () => {
        expect(
            decideClassPacks(org({ hasPacks: true, existing: "DISABLED" })),
        ).toBe("kept");
        expect(decideClassPacks(org({ existing: "ENABLED" }))).toBe("kept");
    });
});
