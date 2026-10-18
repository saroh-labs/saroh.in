import { describe, expect, it } from "vitest";

import { flag, orgs } from "@/test/releases-fixture";
import {
    effectiveSummary,
    filterReleases,
    flagsRedirect,
    globalChange,
    globalImpact,
    inverseOf,
    releaseCounts,
    releaseState,
    reviewOverdue,
    sortReleases,
    undoReason,
    whoHasIt,
} from "./releases";

const payments = flag("MODULE_PAYMENTS", "Payments", "module");
const shop = flag("SITE_SHOP", "Shop on your website", "feature");
const limits = flag("PLAN_ENFORCEMENT", "Plan limits", "safety");
const roles = flag("ORG_AUTHORIZATION", "Team roles", "migration");

describe("sortReleases and filterReleases", () => {
    it("lists modules, features, safety switches and migrations in order", () => {
        expect(sortReleases([roles, shop, limits, payments])).toEqual([
            payments,
            shop,
            limits,
            roles,
        ]);
    });

    it("searches the code name and the name a business sees", () => {
        const all = [payments, shop, limits, roles];
        expect(filterReleases(all, "all", "shop on")).toEqual([shop]);
        expect(filterReleases(all, "all", "plan_enf")).toEqual([limits]);
        expect(filterReleases(all, "all", "module payments")).toEqual([
            payments,
        ]);
        expect(filterReleases(all, "all", "nothing like it")).toEqual([]);
    });

    it("narrows by state", () => {
        const on = { ...shop, enabledByDefault: true };
        const some = {
            ...payments,
            enabledByDefault: false,
            overrides: [
                { organizationId: "o1", organizationName: "A", enabled: true },
            ],
        };
        const all = [some, on, limits];
        expect(filterReleases(all, "everyone", "")).toEqual([on]);
        expect(filterReleases(all, "some", "")).toEqual([some]);
        expect(filterReleases(all, "off", "")).toEqual([limits]);
        expect(filterReleases(all, "off", "payments")).toEqual([]);
    });
});

describe("releaseState and effectiveSummary", () => {
    it("says on for everyone", () => {
        const f = { ...payments, enabledByDefault: true };
        expect(releaseState(f)).toBe("everyone");
        expect(effectiveSummary(f)).toBe("On for everyone.");
    });

    it("is on for some when the default is on and some are turned off", () => {
        const f = {
            ...payments,
            enabledByDefault: true,
            overrides: [
                { organizationId: "o1", organizationName: "A", enabled: false },
                { organizationId: "o2", organizationName: "B", enabled: false },
                { organizationId: "o3", organizationName: "C", enabled: true },
            ],
        };
        expect(releaseState(f)).toBe("some");
        expect(effectiveSummary(f)).toBe(
            "On for everyone except 2 businesses turned off for them alone.",
        );
    });

    it("is on for some when the default is off and some are turned on", () => {
        const f = {
            ...payments,
            enabledByDefault: false,
            overrides: [
                { organizationId: "o1", organizationName: "A", enabled: true },
            ],
        };
        expect(releaseState(f)).toBe("some");
        expect(effectiveSummary(f)).toBe(
            "Off for everyone except 1 business turned on for them alone.",
        );
    });

    it("says off, and never turned on, in plain words (R16)", () => {
        const off = { ...payments, enabledByDefault: false };
        expect(releaseState(off)).toBe("off");
        expect(effectiveSummary(off)).toBe("Off for everyone.");
        expect(releaseState(payments)).toBe("off");
        expect(effectiveSummary(payments)).toBe(
            "Off. It has never been turned on for anyone.",
        );
    });

    it("flags a review date that has passed", () => {
        expect(reviewOverdue(payments, "2027-04-01")).toBe(true);
        expect(reviewOverdue(payments, "2026-10-08")).toBe(false);
    });
});

describe("releaseCounts", () => {
    it("counts the default, who is turned on or off alone, and who follows it", () => {
        const f = {
            ...payments,
            enabledByDefault: false,
            overrides: [
                { organizationId: "o1", organizationName: "A", enabled: true },
                { organizationId: "o2", organizationName: "B", enabled: false },
            ],
        };
        expect(releaseCounts(f, orgs(5))).toEqual({
            defaultLabel: "Off",
            turnedOn: 1,
            turnedOff: 1,
            following: 3,
            followingLabel: "Would get it if turned on for everyone",
            have: 1,
            total: 5,
        });
        expect(releaseCounts(payments, orgs(2)).defaultLabel).toBe(
            "Off · never turned on",
        );
        expect(
            releaseCounts({ ...payments, enabledByDefault: true }, orgs(2)),
        ).toMatchObject({
            defaultLabel: "On",
            following: 2,
            followingLabel: "Would lose it if turned off for everyone",
            have: 2,
        });
    });
});

describe("flagsRedirect", () => {
    it("sends the old address to Releases, a release or its Who has it", () => {
        expect(flagsRedirect({})).toBe("/releases");
        expect(flagsRedirect({ release: "MODULE_PAYMENTS" })).toBe(
            "/releases/MODULE_PAYMENTS",
        );
        expect(flagsRedirect({ flag: "SITE_SHOP" })).toBe(
            "/releases/SITE_SHOP",
        );
        expect(
            flagsRedirect({ release: "SITE_SHOP", organizationId: "o 1" }),
        ).toBe("/releases/SITE_SHOP/who?organizationId=o%201");
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
            "2 businesses already have it; 3 more will get it. 1 business stays off, turned off for it alone.",
        );
    });

    it("says who loses it and who keeps it", () => {
        const on = { ...f, enabledByDefault: true };
        expect(globalChange(on)).toBe(false);
        expect(globalImpact(on, orgs(6), false)).toBe(
            "3 businesses lose Payments; 2 keep it, turned on for them alone.",
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
