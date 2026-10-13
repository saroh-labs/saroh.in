// Which diary writes take a team seat (DEC-111, DEC-155, UX-053), without a
// database. The same against Postgres, with the plan's cap:
// plan-limits.db.spec.ts.
import { diarySeatDelta } from "./staff-seats";

const active = (membershipId: string | null = null) => ({
    status: "ACTIVE",
    membershipId,
});
const archived = (membershipId: string | null = null) => ({
    status: "ARCHIVED",
    membershipId,
});

describe("diarySeatDelta", () => {
    it("takes a seat for someone new who takes bookings with no login", () => {
        expect(diarySeatDelta(null, active())).toBe(1);
    });

    it("takes no second seat for a team member, whatever their role", () => {
        // An Admin or a Reviewer: their membership is their seat (DEC-155).
        expect(diarySeatDelta(null, active("m_admin"))).toBe(0);
        expect(diarySeatDelta(null, active("m_reviewer"))).toBe(0);
    });

    it("frees the seat when archived and takes it back when restored", () => {
        expect(diarySeatDelta(active(), archived())).toBe(-1);
        expect(diarySeatDelta(archived(), active())).toBe(1);
        // A team member's seat is their membership's, on the diary or off.
        expect(diarySeatDelta(active("m_admin"), archived("m_admin"))).toBe(0);
        expect(diarySeatDelta(archived("m_admin"), active("m_admin"))).toBe(0);
    });

    it("never counts a person twice when their login is linked or unlinked", () => {
        // No login to a team member's: the member's seat covers them.
        expect(diarySeatDelta(active(), active("m_admin"))).toBe(-1);
        // A login taken off: a seat of their own again.
        expect(diarySeatDelta(active("m_admin"), active())).toBe(1);
        // From one member to another: nobody added.
        expect(diarySeatDelta(active("m_admin"), active("m_reviewer"))).toBe(0);
    });
});
