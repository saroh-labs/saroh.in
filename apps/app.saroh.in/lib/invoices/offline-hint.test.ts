import { describe, expect, it } from "vitest";

import { offlinePayHint } from "./offline-hint";

const base = {
    blocker: null,
    paymentsOn: true,
    providerConnected: false,
    who: "Asha Rao",
} as const;

describe("offlinePayHint (#835)", () => {
    it("on a plan without online payments, says it comes with a paid plan and links to the plans", () => {
        const hint = offlinePayHint({ ...base, blocker: "PLAN" });
        expect(hint.text).toContain("comes with a paid plan");
        expect(hint.text).not.toContain("Connect");
        expect(hint.fix).toEqual({
            href: "/settings/billing#change-plan",
            label: "See plans",
        });
    });

    it("keeps the provider hint for a plan that includes online payments", () => {
        expect(
            offlinePayHint({ ...base, blocker: "NO_PROVIDER" }).fix?.href,
        ).toBe("/settings/providers");
        // An API older than the blocker: read from what it sends.
        expect(offlinePayHint(base).text).toBe(
            "Connect a payment provider to take payment online.",
        );
    });

    it("with Payments off, the link only shows the invoice", () => {
        const hint = offlinePayHint({
            ...base,
            blocker: "PAYMENTS_OFF",
            paymentsOn: false,
        });
        expect(hint.fix).toBeNull();
        expect(hint.text).toContain("no Pay button");
    });
});
