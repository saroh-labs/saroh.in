/**
 * What onboarding makes of an opening-day invite (plan U31): the API's
 * answer turned into a line under the heading and a token to take the
 * offer with. Every value is made up.
 */
import { describe, expect, it } from "vitest";

import { inviteIntentFrom, inviteNote, inviteToTake } from "./launch-offer";

const TOKEN = "t".repeat(43);

describe("inviteIntentFrom", () => {
    it("reads a ready invite, with the plan's name and the offer's length from the API", () => {
        const intent = inviteIntentFrom(TOKEN, {
            status: "ready",
            businessName: "Asha Salon",
            planKey: "grow",
            days: 37,
        });
        expect(intent).toEqual({
            kind: "ready",
            token: TOKEN,
            businessName: "Asha Salon",
            planName: "Grow",
            days: 37,
        });
        expect(inviteNote(intent)).toContain("Grow for 37 days");
        expect(inviteToTake(intent)).toBe(TOKEN);
    });

    it("keeps the API's words for an invite it refuses, and takes nothing", () => {
        const intent = inviteIntentFrom(TOKEN, {
            status: "used",
            message: "This invite has already been used. Ask for a new invite.",
        });
        expect(inviteNote(intent)).toBe(
            "This invite has already been used. Ask for a new invite. You can still set up, on Free.",
        );
        expect(inviteToTake(intent)).toBeNull();
    });

    it("tries the invite after setup when the API couldn't be asked", () => {
        const intent = inviteIntentFrom(TOKEN, null);
        expect(intent).toEqual({ kind: "unchecked", token: TOKEN });
        expect(inviteToTake(intent)).toBe(TOKEN);
    });

    it("says nothing without an invite", () => {
        expect(inviteNote({ kind: "none" })).toBeNull();
        expect(inviteToTake({ kind: "none" })).toBeNull();
    });
});
