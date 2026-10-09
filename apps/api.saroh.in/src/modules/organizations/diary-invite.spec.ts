import { BadRequestException, ConflictException } from "@nestjs/common";

import { countSeatKind } from "../billing/metering";
import { CALENDAR_ONLY_ACTIONS } from "./calendar-only-role";
import {
    assertDiaryInvitable,
    countedOnDiary,
    inviteRoleFor,
    joinsBookable,
    linkDiaryPerson,
} from "./diary-invite";

/**
 * Giving someone on the diary a login (#868; owner decision 2026-10-08):
 * Calendar only by default, and counted once.
 */

const ROLES = [{ key: "calendar-only", actions: [...CALENDAR_ONLY_ACTIONS] }];
const loginless = { status: "ACTIVE", membershipId: null };

describe("the role an invite asks for", () => {
    it("is Calendar only for someone on the diary when none is picked", () => {
        expect(inviteRoleFor({ staffId: "staff_1" })).toBe("calendar-only");
        expect(inviteRoleFor({ role: "", staffId: "staff_1" })).toBe(
            "calendar-only",
        );
    });

    it("is whatever the owner picked, diary or not", () => {
        expect(inviteRoleFor({ role: "MEMBER", staffId: "staff_1" })).toBe(
            "MEMBER",
        );
        expect(inviteRoleFor({ role: "ADMIN" })).toBe("ADMIN");
    });

    it("must be picked for someone not on the diary", () => {
        expect(() => inviteRoleFor({})).toThrow(BadRequestException);
    });
});

describe("who on the diary can be invited", () => {
    const person = { id: "staff_1", name: "Priya", ...loginless };

    it("takes someone with no login and no invite out", () => {
        expect(() => assertDiaryInvitable(person, null)).not.toThrow();
    });

    it("refuses someone not on the diary, or who has a login", () => {
        expect(() => assertDiaryInvitable(null, null)).toThrow(
            BadRequestException,
        );
        expect(() =>
            assertDiaryInvitable({ ...person, membershipId: "m_1" }, null),
        ).toThrow("Priya already has a login here.");
    });

    it("refuses a second invite for the same person, naming the first", () => {
        expect(() => assertDiaryInvitable(person, "priya@example.com")).toThrow(
            ConflictException,
        );
        expect(() => assertDiaryInvitable(person, "priya@example.com")).toThrow(
            /sent to priya@example.com/,
        );
    });
});

describe("seat counting with a diary invite (DEC-105)", () => {
    it("counts the invite as the diary person it names, once", () => {
        // The person on the diary with no login holds one seat; the invite
        // that gives them a login is them, not one more.
        const invites = [{ role: "calendar-only", staffMember: loginless }];
        expect(countSeatKind("seat", ROLES, [], invites, 1)).toBe(1);
        expect(countSeatKind("viewOnly", ROLES, [], invites, 1)).toBe(0);
    });

    it("counts it at its role once they have a login, or are archived", () => {
        const linked = { status: "ACTIVE", membershipId: "m_1" };
        const archived = { status: "ARCHIVED", membershipId: null };
        expect(
            countSeatKind(
                "seat",
                ROLES,
                [],
                [
                    { role: "calendar-only", staffMember: linked },
                    { role: "calendar-only", staffMember: archived },
                ],
            ),
        ).toBe(2);
    });

    it("counts an ordinary invite as before", () => {
        expect(countSeatKind("seat", ROLES, [], [{ role: "MEMBER" }])).toBe(1);
        expect(
            countSeatKind("viewOnly", ROLES, [], [{ role: "REVIEWER" }]),
        ).toBe(1);
    });

    it("says who is counted on the diary and who joins taking bookings", () => {
        expect(countedOnDiary(loginless)).toBe(true);
        expect(countedOnDiary({ status: "ACTIVE", membershipId: "m" })).toBe(
            false,
        );
        expect(countedOnDiary(null)).toBe(false);
        expect(joinsBookable(loginless)).toBe(true);
        expect(joinsBookable({ status: "ARCHIVED" })).toBe(false);
    });
});

describe("linking the diary person on accept", () => {
    function tx(already: { id: string } | null, updated = 1) {
        return {
            staffMember: {
                findUnique: jest.fn().mockResolvedValue(already),
                updateMany: jest.fn().mockResolvedValue({ count: updated }),
            },
        };
    }

    it("links someone still without a login, in this business", async () => {
        const t = tx(null);
        await expect(
            linkDiaryPerson(t as never, "org", "staff_1", "m_1"),
        ).resolves.toBe(true);
        expect(t.staffMember.updateMany).toHaveBeenCalledWith({
            where: { id: "staff_1", organizationId: "org", membershipId: null },
            data: { membershipId: "m_1" },
        });
    });

    it("leaves a login already on the diary as someone else", async () => {
        const t = tx({ id: "staff_9" });
        await expect(
            linkDiaryPerson(t as never, "org", "staff_1", "m_1"),
        ).resolves.toBe(false);
        expect(t.staffMember.updateMany).not.toHaveBeenCalled();
    });

    it("says so when someone linked them meanwhile", async () => {
        const t = tx(null, 0);
        await expect(
            linkDiaryPerson(t as never, "org", "staff_1", "m_1"),
        ).resolves.toBe(false);
    });
});
