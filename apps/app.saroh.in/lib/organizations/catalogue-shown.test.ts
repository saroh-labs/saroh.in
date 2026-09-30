import { describe, expect, it } from "vitest";

import type { ModuleView } from "@/lib/modules/schema";

import { moduleOfAction, shownCatalogue } from "./catalogue-shown";
import type { RoleCatalogue } from "./roles";

/**
 * The permission lists hide a hidden module's permissions (DEC-073): no
 * "Manage automations" while DEC-068 hides Automations, and none of a
 * module Saroh hasn't rolled out (DEC-057).
 */

const catalogue: RoleCatalogue = {
    groups: ["business", "sell", "schedule", "contacts"],
    capabilities: [
        {
            action: "org:update",
            group: "business",
            label: "Change business details",
        },
        {
            action: "automation:manage",
            group: "business",
            label: "Manage automations",
        },
        { action: "order:read", group: "sell", label: "See orders" },
        { action: "pack:read", group: "schedule", label: "See class packs" },
        { action: "pack:sell", group: "schedule", label: "Sell class packs" },
        { action: "contact:read", group: "contacts", label: "See customers" },
    ],
};

const mod = (key: string, rolled = true) =>
    ({
        key,
        blockers: rolled ? [] : [{ code: "ROLLOUT_DISABLED" }],
    }) as unknown as ModuleView;

const labels = (c: RoleCatalogue | null) =>
    c?.capabilities.map((x) => x.label) ?? null;

describe("shownCatalogue (DEC-073)", () => {
    it("hides Manage automations while Automations has no screen (DEC-068)", () => {
        const shown = shownCatalogue(catalogue, [
            mod("AUTOMATIONS"),
            mod("COMMERCE"),
            mod("CLASS_PACKS"),
        ]);
        expect(labels(shown)).not.toContain("Manage automations");
        expect(labels(shown)).toContain("See orders");
    });

    it("hides every permission of a module Saroh hasn't rolled out", () => {
        const shown = shownCatalogue(catalogue, [
            mod("AUTOMATIONS"),
            mod("COMMERCE"),
            mod("CLASS_PACKS", false),
        ]);
        expect(labels(shown)).toEqual([
            "Change business details",
            "See orders",
            "See customers",
        ]);
        // The groups stay; a group left empty isn't drawn by the editor.
        expect(shown?.groups).toEqual(catalogue.groups);
    });

    it("hides only on evidence: a module the list doesn't name still shows", () => {
        // Sell isn't in the list at all: its permissions show. Automations
        // stays hidden whether it is listed or not (DEC-068).
        const shown = shownCatalogue(catalogue, [mod("CLASS_PACKS", false)]);
        expect(labels(shown)).toEqual([
            "Change business details",
            "See orders",
            "See customers",
        ]);
    });

    it("keeps a permission several parts share", () => {
        expect(moduleOfAction("contact:read")).toBeNull();
        expect(moduleOfAction("org:update")).toBeNull();
        expect(moduleOfAction("automation:manage")).toBe("AUTOMATIONS");
        expect(moduleOfAction("pack:sell")).toBe("CLASS_PACKS");
    });

    it("holds nothing back when the modules couldn't be read", () => {
        expect(shownCatalogue(catalogue, null)).toBe(catalogue);
        expect(shownCatalogue(catalogue, [])).toBe(catalogue);
        expect(shownCatalogue(null, [mod("COMMERCE")])).toBeNull();
    });
});
