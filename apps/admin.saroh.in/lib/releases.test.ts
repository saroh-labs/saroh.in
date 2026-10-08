import { describe, expect, it } from "vitest";

import { flag, orgs } from "@/test/releases-fixture";
import {
    effectiveSummary,
    globalChange,
    globalImpact,
    groupReleases,
    inverseOf,
    reviewOverdue,
    stateChip,
    undoReason,
    whoHasIt,
} from "./releases";

const payments = flag("MODULE_PAYMENTS", "Payments", "module");
const shop = flag("SITE_SHOP", "Shop on your website", "feature");
const limits = flag("PLAN_ENFORCEMENT", "Plan limits", "safety");
const roles = flag("ORG_AUTHORIZATION", "Team roles", "migration");

describe("groupReleases", () => {
    it("groups modules, features, safety switches and migrations in order", () => {
        const sections = groupReleases([roles, shop, limits, payments]);
        expect(sections.map((s) => s.label)).toEqual([
            "Modules",
            "Features",
            "Safety switches",
            "Migrations",
        ]);
    });

    it("searches the code key and the name a business sees", () => {
        const all = [payments, shop, limits, roles];
        expect(groupReleases(all, "shop on").flatMap((s) => s.flags)).toEqual([
            shop,
        ]);
        expect(groupReleases(all, "plan_enf").flatMap((s) => s.flags)).toEqual([
            limits,
        ]);
        expect(
            groupReleases(all, "module payments").flatMap((s) => s.flags),
        ).toEqual([payments]);
        expect(groupReleases(all, "nothing like it")).toEqual([]);
    });
});

describe("stateChip and effectiveSummary", () => {
    it("says on for everyone", () => {
        const f = { ...payments, enabledByDefault: true };
        expect(stateChip(f)).toBe("On for everyone");
        expect(effectiveSummary(f)).toBe("On for everyone.");
    });

    it("counts the businesses set off when the default is on", () => {
        const f = {
            ...payments,
            enabledByDefault: true,
            overrides: [
                { organizationId: "o1", organizationName: "A", enabled: false },
                { organizationId: "o2", organizationName: "B", enabled: false },
                { organizationId: "o3", organizationName: "C", enabled: true },
            ],
        };
        expect(stateChip(f)).toBe("Off for 2");
        expect(effectiveSummary(f)).toBe(
            "On for everyone, off for 2 businesses set on their own.",
        );
    });

    it("counts the businesses set on when the default is off", () => {
        const f = {
            ...payments,
            enabledByDefault: false,
            overrides: [
                { organizationId: "o1", organizationName: "A", enabled: true },
            ],
        };
        expect(stateChip(f)).toBe("On for 1");
        expect(effectiveSummary(f)).toBe(
            "Off for everyone, on for 1 business set on their own.",
        );
    });

    it("says off for everyone, and never switched on (R12)", () => {
        expect(stateChip({ ...payments, enabledByDefault: false })).toBe(
            "Off for everyone",
        );
        expect(stateChip(payments)).toBe("Never switched on");
        expect(effectiveSummary(payments)).toBe(
            "Off for everyone · never switched on.",
        );
    });

    it("flags a review date that has passed", () => {
        expect(reviewOverdue(payments, "2027-04-01")).toBe(true);
        expect(reviewOverdue(payments, "2026-10-08")).toBe(false);
    });
});

describe("globalImpact", () => {
    // Six businesses: two set on, one set off, three with no setting.
    const f = {
        ...payments,
        enabledByDefault: false,
        overrides: [
            { organizationId: "o1", organizationName: "Org 1", enabled: true },
            { organizationId: "o2", organizationName: "Org 2", enabled: true },
            { organizationId: "o3", organizationName: "Org 3", enabled: false },
        ],
    };

    it("says who already has it and who will get it", () => {
        expect(globalChange(f)).toBe(true);
        expect(globalImpact(f, orgs(6), true)).toBe(
            "2 businesses already have it; 3 more will get it. 1 business stays off because it's set on its own.",
        );
    });

    it("says who loses it and who keeps it", () => {
        const on = { ...f, enabledByDefault: true };
        expect(globalChange(on)).toBe(false);
        expect(globalImpact(on, orgs(6), false)).toBe(
            "3 businesses lose Payments; 2 keep it because they're set on their own.",
        );
    });
});

describe("whoHasIt", () => {
    it("marks an own setting that matches the default", () => {
        const f = {
            ...payments,
            enabledByDefault: true,
            overrides: [
                {
                    organizationId: "o2",
                    organizationName: "Org 2",
                    enabled: true,
                },
            ],
        };
        const rows = whoHasIt(f, orgs(2));
        expect(rows[0]).toMatchObject({
            organizationId: "o2",
            on: true,
            override: true,
            sameAsDefault: true,
        });
        expect(rows[1]).toMatchObject({ override: null, on: true });
    });
});

describe("inverseOf", () => {
    const before = {
        ...payments,
        enabledByDefault: null,
        overrides: [
            { organizationId: "o1", organizationName: "Org 1", enabled: false },
        ],
    };

    it("puts the default back, off when it had never been set", () => {
        expect(inverseOf({ kind: "global", enabled: true }, before)).toEqual({
            kind: "global",
            enabled: false,
        });
    });

    it("clears a new own setting and restores a changed or cleared one", () => {
        expect(
            inverseOf(
                { kind: "set", organizationId: "o2", enabled: true },
                before,
            ),
        ).toEqual({ kind: "clear", organizationId: "o2" });
        expect(
            inverseOf({ kind: "clear", organizationId: "o1" }, before),
        ).toEqual({ kind: "set", organizationId: "o1", enabled: false });
    });

    it("records an Undo with the original reason", () => {
        expect(undoReason("Rolling out")).toBe("Undo: Rolling out");
        expect(undoReason("x".repeat(600))).toHaveLength(500);
    });
});
