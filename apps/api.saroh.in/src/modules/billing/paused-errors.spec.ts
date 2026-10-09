import { ConflictException, ForbiddenException } from "@nestjs/common";

import {
    diaryPaused,
    diaryPausedWords,
    isMemberPaused,
    memberPaused,
    notTakingOrders,
    PAUSED_BY_PLAN,
} from "./paused-errors";

/** The refusals a move to a lower plan gives (#800), as words and codes. */
describe("paused-errors", () => {
    it("knows the MEMBER_PAUSED refusal, and nothing else, as one", () => {
        expect(isMemberPaused(memberPaused("Rye"))).toBe(true);
        expect(isMemberPaused(new ForbiddenException("No"))).toBe(false);
        expect(
            isMemberPaused(
                new ForbiddenException({ message: "x", details: {} }),
            ),
        ).toBe(false);
        expect(isMemberPaused(notTakingOrders())).toBe(false);
        expect(isMemberPaused(new Error("boom"))).toBe(false);
        expect(isMemberPaused(null)).toBe(false);
    });

    it("says who on the diary is paused, why, and that their bookings are kept", () => {
        expect(diaryPausedWords(["Asha"])).toBe(
            "Asha is paused. Your plan includes fewer team members than you have, so the people who joined most recently take no new bookings. Bookings already made are kept. Choose a plan in Plan and billing to bring them back.",
        );
        expect(diaryPausedWords(["Asha", "Ravi", "Meena"])).toMatch(
            /^Asha, Ravi and Meena are paused\. /,
        );
        expect(diaryPausedWords([])).toMatch(/^This person is paused\. /);
    });

    it("refuses a booking with them as PAUSED_BY_PLAN, kind person, on the staff field", () => {
        const err = diaryPaused(["Asha"]);
        expect(err).toBeInstanceOf(ConflictException);
        expect(err.getResponse()).toEqual({
            message: diaryPausedWords(["Asha"]),
            details: { code: PAUSED_BY_PLAN, kind: "person", field: "staffId" },
        });
    });
});
