import { ForbiddenException } from "@nestjs/common";

import type { OrganizationContext } from "../../common/types/organization-context";
import { resolveCapabilities } from "../organizations/organization-policy";
import { CANT_USE_PACKS, requireBookingPower } from "./booking-access";

const role = (actions: string[]): OrganizationContext => ({
    organizationId: "org",
    userId: "u",
    role: "MEMBER",
    roleKey: "custom",
    actions: resolveCapabilities("custom", actions),
});

/** What the refusal says, or null when it lets the caller through. */
function refusal(run: () => void): string | null {
    try {
        run();
        return null;
    } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        return (error as ForbiddenException).message;
    }
}

describe("requireBookingPower (E26)", () => {
    it("lets through whoever holds the power, implied holds included", () => {
        const lead = role(["pack:write", "booking:write", "service:write"]);
        for (const action of [
            "pack:read",
            "pack:sell",
            "pack:write",
            "booking:read",
            "service:read",
        ] as const) {
            expect(refusal(() => requireBookingPower(lead, action))).toBeNull();
        }
    });

    it.each([
        ["booking:read", "Your role can't see bookings."],
        ["booking:write", "Your role can't change bookings."],
        ["service:read", "Your role can't see services."],
        [
            "service:write",
            "Your role can't change services, hours, time off or booking rules.",
        ],
        ["pack:read", "Your role can't see class packs."],
        ["pack:sell", "Your role can't sell class packs."],
        ["pack:write", "Your role can't change class packs."],
        ["subscription:write", "Your role can't book with a membership."],
    ] as const)("refuses %s in words", (action, words) => {
        const site = role(["site:read"]);
        const said = refusal(() => requireBookingPower(site, action));
        expect(said).toBe(words);
        expect(said).not.toMatch(/:|may not perform/);
    });

    it("says what a borrowed power is for when the caller names it", () => {
        const reader = role(["pack:read", "booking:write"]);
        expect(
            refusal(() =>
                requireBookingPower(reader, "pack:sell", CANT_USE_PACKS),
            ),
        ).toBe("Your role can't pay for bookings with class packs.");
    });

    it("falls back to a plain sentence for a power it has no words for", () => {
        expect(refusal(() => requireBookingPower(role([]), "org:delete"))).toBe(
            "Your role can't do this.",
        );
    });
});
