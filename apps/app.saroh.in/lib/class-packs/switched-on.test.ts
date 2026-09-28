import { describe, expect, it } from "vitest";

import type { ModuleView } from "@/lib/modules/schema";

import { packsOn } from "./switched-on";

const packs = (readiness: ModuleView["readiness"]): ModuleView => ({
    key: "CLASS_PACKS",
    label: "Class packs",
    lifecycle: readiness === "DISABLED" ? "DISABLED" : "ENABLED",
    readiness,
    selectedForProject: true,
    canManage: true,
    dependencies: ["APPOINTMENTS"],
    blockers: [],
});

describe("whether packs can be spent here (E12)", () => {
    it("follows the Class packs module, as the rail does", () => {
        expect(packsOn([packs("ACTIVE")])).toBe(true);
        // Switched on with no pack yet is still on.
        expect(packsOn([packs("SETUP_REQUIRED")])).toBe(true);
        expect(packsOn([packs("DISABLED")])).toBe(false);
    });

    it("fails open when it can't tell", () => {
        expect(packsOn(null)).toBe(true);
        // An API from before Class packs was its own module.
        expect(packsOn([])).toBe(true);
    });
});
