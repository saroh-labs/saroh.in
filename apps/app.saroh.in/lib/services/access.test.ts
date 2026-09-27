import { describe, expect, it } from "vitest";

import { canReadBookings } from "./access";

describe("canReadBookings", () => {
    it("follows the actions the API resolved", () => {
        expect(
            canReadBookings({ role: "MEMBER", actions: ["booking:read"] }),
        ).toBe(true);
        // A role the business made, without bookings.
        expect(
            canReadBookings({ role: "MEMBER", actions: ["site:read"] }),
        ).toBe(false);
    });

    it("locks a Reviewer out, and no one else, without resolved actions", () => {
        expect(canReadBookings({ role: "REVIEWER" })).toBe(false);
        expect(canReadBookings({ role: "MEMBER" })).toBe(true);
        expect(canReadBookings({ role: "OWNER" })).toBe(true);
    });

    it("doesn't lock when there is no organization to judge by", () => {
        expect(canReadBookings(null)).toBe(true);
    });
});
