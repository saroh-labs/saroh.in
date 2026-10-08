import { describe, expect, it } from "vitest";

import { access, row } from "@/lib/billing/fixtures.test-data";

import {
    TRACKERS_KEPT_LINE,
    TRACKERS_LOCKED_LINE,
    trackersLock,
    trackersLockOfRefusal,
} from "./trackers-lock";

const trackers = (state: "on" | "locked" | "hidden", withUp = true) =>
    row({
        moduleId: "site-trackers",
        name: "Your own trackers",
        state,
        limit: null,
        usage: null,
        menu: null,
        child: null,
        upgradeTo: withUp
            ? { planId: "b", name: "Plan B", pricePaise: 11_100 }
            : null,
    });

describe("trackersLock (DEC-108, U7)", () => {
    it("locks a locked or hidden row, with the plan only on the link", () => {
        for (const state of ["locked", "hidden"] as const) {
            expect(
                trackersLock(access({ modules: [trackers(state)] })),
            ).toEqual({
                line: TRACKERS_LOCKED_LINE,
                kept: TRACKERS_KEPT_LINE,
                cta: "See Plan B",
                href: "/settings/billing?plan=b#change-plan",
            });
        }
    });

    it("points at the plans when no plan above is named", () => {
        const lock = trackersLock(
            access({ modules: [trackers("locked", false)] }),
        );
        expect(lock?.cta).toBe("See plans");
        expect(lock?.href).toBe("/settings/billing#change-plan");
    });

    it("names no plan, module or row in its words", () => {
        const lock = trackersLock(access({ modules: [trackers("locked")] }));
        for (const words of [lock?.line, lock?.kept]) {
            expect(words).not.toMatch(/module|site-trackers|Plan [A-Z]/i);
        }
    });

    it("locks nothing when the plan has it, or nothing enforces it", () => {
        expect(trackersLock(access({ modules: [trackers("on")] }))).toBeNull();
        expect(
            trackersLock(
                access({ enforced: false, modules: [trackers("locked")] }),
            ),
        ).toBeNull();
        expect(trackersLock(access({ source: "legacy" }))).toBeNull();
        expect(trackersLock(null)).toBeNull();
        // A version without the row: the API lets the write through.
        expect(trackersLock(access({ modules: [] }))).toBeNull();
    });

    it("reads a MODULE_LOCKED refusal as the lock", () => {
        expect(
            trackersLockOfRefusal({
                code: "MODULE_LOCKED",
                title: "Not on your plan",
                body: "",
                cta: "See Plan B",
                upgradeTo: { planId: "b", name: "Plan B", pricePaise: 11_100 },
                limit: null,
                used: null,
            }),
        ).toEqual({
            line: TRACKERS_LOCKED_LINE,
            kept: TRACKERS_KEPT_LINE,
            cta: "See Plan B",
            href: "/settings/billing?plan=b#change-plan",
        });
        expect(trackersLockOfRefusal(undefined)).toBeNull();
        expect(
            trackersLockOfRefusal({
                code: "PLAN_LIMIT_REACHED",
                title: "Full",
                body: "",
                cta: "See plans",
                upgradeTo: null,
                limit: 1,
                used: 1,
            }),
        ).toBeNull();
    });
});
