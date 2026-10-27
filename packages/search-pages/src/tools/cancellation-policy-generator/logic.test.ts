import { describe, expect, it } from "vitest";

import type { CancelAnswers } from "./logic";
import { clashes, policy, whatsappVersion } from "./logic";

// The boards' sample: Rye Studio, 24 hours' notice, 25% deposit kept on
// late cancels, 15 minutes' grace.
const RYE: CancelAnswers = {
    name: "Rye Studio",
    notice: "24",
    deposit: "25",
    late: "kept",
    grace: "15",
    after: "shorter",
    move: "free",
    how: "Reply on WhatsApp to +91 99999 99999",
};

describe("cancellation policy", () => {
    it("writes the boards' website text to the letter", () => {
        expect(policy(RYE)).toEqual([
            {
                head: "Cancelling or moving.",
                text: "You can cancel or move your booking for free up to 24 hours before it starts. Reply on WhatsApp to +91 99999 99999.",
            },
            {
                head: "Deposit.",
                text: "We take a 25% deposit when you book. It counts towards your bill.",
            },
            {
                head: "Late cancels and no-shows.",
                text: "If you cancel within 24 hours of your booking, or don't come, we keep the deposit.",
            },
            {
                head: "Running late.",
                text: "We wait 15 minutes. After that we may shorten your service so the next person isn't kept waiting, and the full price still applies.",
            },
            {
                head: "Your money back.",
                text: "Cancel in time and your deposit comes back to the way you paid.",
            },
        ]);
    });

    it("writes the boards' WhatsApp version to the letter", () => {
        const wa = whatsappVersion(RYE);
        expect(wa).toBe(
            "Rye Studio's cancellation policy: you can cancel or move for free up to 24 hours before. Inside 24 hours, or if you don't come, we keep your 25% deposit. We wait 15 minutes for late arrivals; after that your service may be shorter, at full price.",
        );
        expect(wa.length).toBeLessThan(300);
    });

    it("finds the clash: no deposit, yet the deposit is kept", () => {
        const c = { ...RYE, deposit: "none", late: "kept" } as const;
        expect(clashes(c)).toBe(true);
        expect(
            policy(c).find((p) => p.head === "Late cancels and no-shows.")
                ?.text,
        ).toContain("[pick what happens]");
    });

    it("full price with no deposit says the full price is due", () => {
        const c = { ...RYE, deposit: "none", late: "due" } as const;
        expect(policy(c).map((p) => p.head)).not.toContain("Deposit.");
        expect(policy(c)[1]?.text).toBe(
            "If you cancel within 24 hours of your booking, or don't come, the full price of the booking is due.",
        );
    });

    it("leaves running late out with no grace", () => {
        expect(policy({ ...RYE, grace: "" }).map((p) => p.head)).not.toContain(
            "Running late.",
        );
    });
});
