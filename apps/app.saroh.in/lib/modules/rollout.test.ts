import { describe, expect, it } from "vitest";

import { isHiddenByRollout, rolledOut, rolledOutKeys } from "./rollout";

const dark = [{ code: "ROLLOUT_DISABLED" }];

describe("which modules are shown (DEC-057)", () => {
    it("never shows a module Saroh hasn't rolled out", () => {
        const views = [
            { key: "APPOINTMENTS", blockers: [] },
            { key: "CLASS_PACKS", blockers: dark },
            { key: "COMMERCE", blockers: [{ code: "ORG_MODULE_DISABLED" }] },
        ];
        expect(rolledOut(views).map((m) => m.key)).toEqual([
            "APPOINTMENTS",
            "COMMERCE",
        ]);
        expect(views.map(isHiddenByRollout)).toEqual([false, true, false]);
    });

    it("hides one that needs a hidden module which is off: it could never come on", () => {
        const views = [
            {
                key: "CRM",
                lifecycle: "DISABLED" as const,
                dependencies: [],
                blockers: dark,
            },
            {
                key: "APPOINTMENTS",
                lifecycle: "DISABLED" as const,
                dependencies: ["CRM"],
                blockers: [],
            },
            // Through Appointments, which is shown: still hidden.
            {
                key: "COURSES",
                lifecycle: "DISABLED" as const,
                dependencies: ["APPOINTMENTS"],
                blockers: [],
            },
            {
                key: "COMMERCE",
                lifecycle: "ENABLED" as const,
                dependencies: [],
                blockers: [],
            },
        ];
        expect(Array.from(rolledOutKeys(views))).toEqual(["COMMERCE"]);
    });

    it("keeps one whose hidden need is already on: it works, and it is never named", () => {
        const views = [
            {
                key: "CRM",
                lifecycle: "ENABLED" as const,
                dependencies: [],
                blockers: dark,
            },
            {
                key: "APPOINTMENTS",
                lifecycle: "ENABLED" as const,
                dependencies: ["CRM"],
                blockers: [],
            },
        ];
        expect(rolledOut(views).map((m) => m.key)).toEqual(["APPOINTMENTS"]);
    });

    it("returns every module when nothing is hidden", () => {
        const views = [
            { key: "A", blockers: [] },
            { key: "B", blockers: [{ code: "UNAUTHORIZED" }] },
        ];
        expect(rolledOut(views)).toEqual(views);
    });
});

describe("Automations until it has a screen (DEC-068)", () => {
    it("is never shown, rolled out or not", () => {
        const views = [
            { key: "CRM", blockers: [] },
            { key: "AUTOMATIONS", blockers: [] },
        ];
        expect(rolledOut(views).map((m) => m.key)).toEqual(["CRM"]);
        expect(isHiddenByRollout({ key: "AUTOMATIONS", blockers: [] })).toBe(
            true,
        );
    });
});

describe("class packs on no plan (DEC-099)", () => {
    it("is never shown, rolled out or not", () => {
        const views = [
            { key: "APPOINTMENTS", blockers: [] },
            { key: "CLASS_PACKS", blockers: [] },
        ];
        expect(rolledOut(views).map((m) => m.key)).toEqual(["APPOINTMENTS"]);
        expect(isHiddenByRollout({ key: "CLASS_PACKS", blockers: [] })).toBe(
            true,
        );
    });
});
