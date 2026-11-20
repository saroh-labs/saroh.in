import { describe, expect, it } from "vitest";

import { calendarByUser } from "./team";
import type { CalendarMember } from "./types";

const member = (staffId: string | null): CalendarMember => ({
    membershipId: `m_${staffId}`,
    staffId,
    name: "Ritika Sharma",
    accounts: [{ id: "a", googleEmail: "r@example.com", state: "CONNECTED" }],
    bookingsGoToGoogle: true,
    pausedBecause: null,
});

describe("calendarByUser", () => {
    it("joins the API's people to the roster through the diary", () => {
        const byUser = calendarByUser(
            [member("st_1"), member("st_2"), member(null)],
            [
                { id: "st_1", membership: { userId: "u_1" } },
                { id: "st_2", membership: null },
            ],
        );
        expect(Object.keys(byUser)).toEqual(["u_1"]);
        expect(byUser.u_1.membershipId).toBe("m_st_1");
    });

    it("joins nobody when the diary couldn't be read", () => {
        expect(calendarByUser([member("st_1")], null)).toEqual({});
    });
});
