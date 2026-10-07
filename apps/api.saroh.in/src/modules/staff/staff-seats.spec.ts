// Which diary writes take a team seat (DEC-105, UX-053), without a database.
// The same against Postgres, with the plan's cap: plan-limits.db.spec.ts.
import { diarySeatDelta } from "./staff-seats";

const active = (membershipId: string | null = null) => ({
    status: "ACTIVE",
    membershipId,
});
const archived = (membershipId: string | null = null) => ({
    status: "ARCHIVED",
    membershipId,
});
/** A view-only role the business made, and a member holding each. */
const roles = [{ key: "looker", actions: ["booking:read"] }];
const looker = { id: "m_look", role: "looker", extraActions: [] };
const admin = { id: "m_admin", role: "ADMIN", extraActions: [] };

describe("diarySeatDelta", () => {
    it("takes a seat for someone new who takes bookings with no login", () => {
        expect(diarySeatDelta(null, active(), [], roles)).toBe(1);
    });

    it("takes no second seat for a team member who already has one", () => {
        expect(diarySeatDelta(null, active("m_admin"), [admin], roles)).toBe(0);
    });

    it("puts a view-only member on a seat once they take bookings", () => {
        expect(diarySeatDelta(null, active("m_look"), [looker], roles)).toBe(1);
    });

    it("frees the seat when archived and takes it back when restored", () => {
        expect(diarySeatDelta(active(), archived(), [], roles)).toBe(-1);
        expect(diarySeatDelta(archived(), active(), [], roles)).toBe(1);
    });

    it("never counts a person twice when their login is linked or unlinked", () => {
        // No login to an admin's: the admin's seat covers them.
        expect(
            diarySeatDelta(active(), active("m_admin"), [admin], roles),
        ).toBe(-1);
        // An admin's login taken off: a seat of their own again.
        expect(
            diarySeatDelta(active("m_admin"), active(), [admin], roles),
        ).toBe(1);
        // No login to a view-only member's: still the one seat.
        expect(
            diarySeatDelta(active(), active("m_look"), [looker], roles),
        ).toBe(0);
    });
});
