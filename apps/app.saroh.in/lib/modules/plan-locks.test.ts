import { describe, expect, it } from "vitest";

import type { ConnectLock, ConnectLocks } from "@/lib/providers/connect-lock";

import { asShown, rowPlanLock } from "./plan-locks";
import type { ModuleView } from "./schema";

/** A made-up plan lock: "Comes with Plan B". */
const LOCK: ConnectLock = {
    comesWith: "Comes with Plan B",
    cta: "See Plan B",
    href: "/settings/billing?plan=b#change-plan",
    upgrade: "Plan B",
    full: false,
};
const LOCKS: ConnectLocks = { payments: LOCK, messaging: LOCK };

const mod = (key: string, codes: string[]): ModuleView => ({
    key,
    label: key,
    lifecycle: "ENABLED",
    readiness: codes.length > 0 ? "SETUP_REQUIRED" : "ACTIVE",
    selectedForProject: true,
    canManage: true,
    dependencies: [],
    blockers: codes.map((code) => ({ code })),
});

describe("Modules on a plan that won't connect a provider (UX-017)", () => {
    it("Payments with an old provider disabled: the plan's line, never Go to Providers", () => {
        const m = mod("PAYMENTS", ["PAYMENTS_PROVIDER_DISABLED"]);
        const lock = rowPlanLock(m, LOCKS);
        expect(lock?.line).toBe(
            "Taking payment online comes with Plan B. Until then, customers pay you the ways you set in How to pay us.",
        );
        expect(asShown(m, lock)).toMatchObject({
            readiness: "ACTIVE",
            blockers: [],
        });
    });

    it("Communications with its old provider disabled: the same", () => {
        const m = mod("COMMUNICATIONS", ["COMMUNICATIONS_PROVIDER_DISABLED"]);
        const lock = rowPlanLock(m, LOCKS);
        expect(lock?.line).toBe("Connecting your own email comes with Plan B.");
        expect(asShown(m, lock).blockers).toEqual([]);
    });

    it("keeps a step the plan doesn't answer", () => {
        const m = mod("PAYMENTS", ["PAYMENTS_KEYS_REFUSED"]);
        const lock = rowPlanLock(m, LOCKS);
        expect(asShown(m, lock).blockers).toEqual([
            { code: "PAYMENTS_KEYS_REFUSED" },
        ]);
    });

    it("changes nothing with no lock", () => {
        const m = mod("PAYMENTS", ["PAYMENTS_PROVIDER_DISABLED"]);
        expect(rowPlanLock(m, { payments: null, messaging: null })).toBeNull();
        expect(asShown(m, null)).toBe(m);
    });
});
