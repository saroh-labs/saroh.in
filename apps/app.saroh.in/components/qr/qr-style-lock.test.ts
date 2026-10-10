import { describe, expect, it } from "vitest";

import { access, row } from "@/lib/billing/fixtures.test-data";

import {
    QR_KEPT_LINE,
    QR_LOCKED_LINE,
    qrStyleLock,
    qrStyleLockOfRefusal,
} from "./qr-style-lock";

const branding = (state: "on" | "locked" | "hidden", withUp = true) =>
    row({
        moduleId: "qr-branding",
        name: "QR codes in your own style",
        state,
        limit: null,
        usage: null,
        menu: null,
        child: null,
        upgradeTo: withUp
            ? { planId: "b", name: "Plan B", pricePaise: 11_100 }
            : null,
    });

describe("qrStyleLock (plan U5, R6)", () => {
    it("locks a locked or hidden row, naming the plan only on the link", () => {
        for (const state of ["locked", "hidden"] as const) {
            expect(
                qrStyleLock(access({ modules: [branding(state)] }), false),
            ).toEqual({
                line: QR_LOCKED_LINE,
                plan: "Plan B",
                kept: QR_KEPT_LINE,
                cta: "See Plan B",
                href: "/settings/billing?plan=b#change-plan",
            });
        }
    });

    it("points at the plans when no plan above is named", () => {
        const lock = qrStyleLock(
            access({ modules: [branding("locked", false)] }),
        );
        expect(lock?.plan).toBe("a paid plan");
        expect(lock?.cta).toBe("See plans");
        expect(lock?.href).toBe("/settings/billing#change-plan");
    });

    it("names no plan, price or catalogue row in its words", () => {
        const lock = qrStyleLock(access({ modules: [branding("locked")] }));
        for (const words of [lock?.line, lock?.kept]) {
            expect(words).not.toMatch(/module|qr-branding|Plan [A-Z]|₹|\d/);
        }
        // The design's line, which the plan's name ends as a link.
        expect(lock?.line).toBe(
            "Logo, colours, print files and scan counts come with",
        );
    });

    it("locks nothing when the plan has it, or nothing enforces it", () => {
        expect(
            qrStyleLock(access({ modules: [branding("on")] }), true),
        ).toBeNull();
        expect(
            qrStyleLock(
                access({ enforced: false, modules: [branding("locked")] }),
                true,
            ),
        ).toBeNull();
        expect(qrStyleLock(access({ source: "legacy" }), true)).toBeNull();
        expect(qrStyleLock(null, true)).toBeNull();
        expect(qrStyleLock(null)).toBeNull();
        // A version without the row: the API lets the write through.
        expect(qrStyleLock(access({ modules: [] }), true)).toBeNull();
    });

    it("still locks for a role that can't read the plan, from the list", () => {
        // The codes read says the plan doesn't include it; nobody could
        // read which plan does.
        expect(qrStyleLock(null, false)).toEqual({
            line: QR_LOCKED_LINE,
            plan: "a paid plan",
            kept: QR_KEPT_LINE,
            cta: "See plans",
            href: "/settings/billing#change-plan",
        });
    });

    it("reads a MODULE_LOCKED refusal as the lock", () => {
        expect(
            qrStyleLockOfRefusal({
                code: "MODULE_LOCKED",
                title: "Not on your plan",
                body: "",
                cta: "See Plan B",
                upgradeTo: { planId: "b", name: "Plan B", pricePaise: 11_100 },
                limit: null,
                used: null,
            })?.cta,
        ).toBe("See Plan B");
        expect(qrStyleLockOfRefusal(undefined)).toBeNull();
        expect(
            qrStyleLockOfRefusal({
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
