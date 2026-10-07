import { describe, expect, it } from "vitest";

import type { ModuleView } from "@/lib/modules/schema";

import { alsoSellFeatures, alsoSellToast } from "./also-sell";

function view(key: string, over: Partial<ModuleView> = {}): ModuleView {
    return {
        key,
        label: key,
        lifecycle: "ENABLED",
        readiness: "ACTIVE",
        selectedForProject: true,
        canManage: true,
        dependencies: [],
        blockers: [],
        ...over,
    };
}

const off = (key: string, over: Partial<ModuleView> = {}) =>
    view(key, {
        lifecycle: "DISABLED",
        readiness: "DISABLED",
        blockers: [{ code: "ORG_MODULE_DISABLED" }],
        ...over,
    });

describe("Also sell (E12)", () => {
    // Class packs aren't offered on any plan for now (DEC-099).
    it("offers Courses as the business has it, never Class packs", () => {
        const features = alsoSellFeatures([
            view("APPOINTMENTS"),
            view("COURSES"),
            off("CLASS_PACKS"),
        ]);
        expect(features?.map((f) => [f.key, f.label, f.on])).toEqual([
            ["COURSES", "Courses", true],
        ]);
    });

    it("is there only for someone who may switch modules", () => {
        expect(
            alsoSellFeatures([
                view("COURSES", { canManage: false }),
                off("CLASS_PACKS", { canManage: false }),
            ]),
        ).toBeNull();
    });

    it("leaves the card out when the module list could not be read", () => {
        expect(alsoSellFeatures(null)).toBeNull();
    });

    it("leaves out a module Saroh hasn't rolled out here", () => {
        const features = alsoSellFeatures([
            view("COURSES"),
            off("CLASS_PACKS", {
                blockers: [
                    { code: "ROLLOUT_DISABLED" },
                    { code: "ORG_MODULE_DISABLED" },
                ],
            }),
        ]);
        expect(features?.map((f) => f.key)).toEqual(["COURSES"]);
        expect(
            alsoSellFeatures([
                off("COURSES", { blockers: [{ code: "ROLLOUT_DISABLED" }] }),
            ]),
        ).toBeNull();
    });

    it("an API from before Class packs was a module offers Courses alone", () => {
        expect(alsoSellFeatures([view("COURSES")])?.map((f) => f.key)).toEqual([
            "COURSES",
        ]);
    });

    it("says what changed, and that nothing sold is lost", () => {
        expect(alsoSellToast("Class packs", true)).toBe(
            "Class packs is on — it's in the Bookings menu now. Settings › Modules shows the same switch.",
        );
        expect(alsoSellToast("Class packs", false)).toContain(
            "nothing already sold changes",
        );
    });
});
