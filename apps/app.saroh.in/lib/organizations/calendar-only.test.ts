import { describe, expect, it } from "vitest";

import {
    CALENDAR_ONLY_ROLE,
    diaryPeopleToInvite,
    roleAfterDiaryPick,
} from "./calendar-only";
import { teamCountLine, teamCounts } from "./invitations";

/** #868: someone on the diary given a login joins as Calendar only by default. */

const staff = [
    { id: "s_priya", name: "Priya", status: "ACTIVE", membership: null },
    { id: "s_ravi", name: "Ravi", status: "ACTIVE", membership: { id: "m" } },
    { id: "s_old", name: "Old", status: "ARCHIVED", membership: null },
    { id: "s_asha", name: "Asha", status: "ACTIVE", membership: null },
];

describe("who on the diary can be given a login", () => {
    it("is someone taking bookings, with no login and no invite waiting", () => {
        expect(
            diaryPeopleToInvite(staff, [{ staff: { id: "s_asha" } }]),
        ).toEqual([{ id: "s_priya", name: "Priya" }]);
    });

    it("is nobody when the diary couldn't be read", () => {
        expect(diaryPeopleToInvite(null, [])).toEqual([]);
    });
});

describe("the role picked with a diary person", () => {
    const base = { start: "MEMBER", hasCalendarOnly: true };

    it("is Calendar only once someone on the diary is chosen", () => {
        expect(
            roleAfterDiaryPick({
                ...base,
                staffId: "s_priya",
                current: "MEMBER",
            }),
        ).toBe(CALENDAR_ONLY_ROLE);
    });

    it("goes back to the usual start when the choice is cleared", () => {
        expect(
            roleAfterDiaryPick({
                ...base,
                staffId: "",
                current: CALENDAR_ONLY_ROLE,
            }),
        ).toBe("MEMBER");
        // A role the owner chose stays chosen.
        expect(
            roleAfterDiaryPick({ ...base, staffId: "", current: "ADMIN" }),
        ).toBe("ADMIN");
    });

    it("leaves the pick alone where the business has no Calendar only", () => {
        expect(
            roleAfterDiaryPick({
                ...base,
                hasCalendarOnly: false,
                staffId: "s_priya",
                current: "MEMBER",
            }),
        ).toBe("MEMBER");
    });
});

describe("Team's seat count with a diary invite (DEC-105)", () => {
    it("counts the invite once, as the person taking bookings", () => {
        const counts = teamCounts(
            [{ usesSeat: true }],
            [
                { usesSeat: true, countedOnDiary: true },
                { usesSeat: true },
                { usesSeat: false },
            ],
        );
        expect(counts).toEqual({ people: 1, waiting: 1, viewOnly: 1 });
        // Priya is said once: on the diary with no login, not as an invite.
        expect(
            teamCountLine(counts.people, counts.waiting, counts.viewOnly, 1),
        ).toBe(
            "Just you · 1 person taking bookings with no login · 1 invite waiting · 1 view-only person, no seat",
        );
    });
});
