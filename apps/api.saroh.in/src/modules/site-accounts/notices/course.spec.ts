// Courses and classes (DEC-174 U17, #1148): the enrolment lists every
// session in the business's zone, a cancel says where the money stands, and
// a class the business cancelled says so, with what happened to the money.
// The reads and the queueing are `courses.db.spec.ts` and
// `bookings/class-cancel-notices.db.spec.ts`.
import type { NoticeVars } from ".";
import { noticeSentence, renderNotice } from ".";
import type { BookingNoticeVars } from "./booking";
import { classCancelMoneyWords } from "./class-cancel";
import type { CourseNoticeVars } from "./course";
import {
    courseMoneyWords,
    courseNotice,
    courseNoticeKey,
    courseSentence,
} from "./course";

// 31 Oct 2026, 7:00 pm UTC: already Sun 1 Nov, 12:30 am in Kolkata.
const LATE = new Date("2026-10-31T19:00:00.000Z");
const WEEK = 7 * 86_400_000;

function course(over: Partial<CourseNoticeVars> = {}): CourseNoticeVars {
    return {
        business: "Rye Studio",
        firstName: "Asha",
        course: "Beginners' wheel",
        sessions: Array.from(
            { length: 8 },
            (_, i) => new Date(LATE.getTime() + i * WEEK),
        ),
        timeZone: "Asia/Kolkata",
        online: false,
        money: null,
        ...over,
    };
}

describe("course enrolment notice", () => {
    it("names the course and its span, in the business's zone", () => {
        expect(courseSentence("COURSE_ENROLLED", course())).toBe(
            "You're enrolled in Beginners' wheel: 8 sessions, from Sun 1 Nov at 12:30 am to Sun 20 Dec at 12:30 am.",
        );
    });

    it("the email lists every one of the 8 sessions", () => {
        const vars: NoticeVars = { kind: "COURSE_ENROLLED", course: course() };
        const email = renderNotice(vars);
        expect(email.subject).toBe(
            "You're enrolled in Beginners' wheel at Rye Studio",
        );
        expect(email.body).toContain("<p>Your sessions:</p>");
        expect(email.body.match(/<li>/g)).toHaveLength(8);
        expect(email.body).toContain("<li>Sun 1 Nov at 12:30 am</li>");
        expect(email.body).toContain("<li>Sun 20 Dec at 12:30 am</li>");
    });

    it("one session, and an online course", () => {
        expect(
            courseSentence(
                "COURSE_ENROLLED",
                course({ sessions: [LATE], online: true }),
            ),
        ).toBe(
            "You're enrolled in Beginners' wheel: 1 session, on Sun 1 Nov at 12:30 am. Every session is online.",
        );
    });

    it("is behind the COURSE switch, and keyed once per enrolment and kind", () => {
        expect(courseNotice.setting).toBe("COURSE");
        expect(courseNoticeKey("COURSE_ENROLLED", "e1")).toBe(
            "course-enrolled:e1",
        );
        expect(courseNoticeKey("COURSE_CANCELLED", "e1")).toBe(
            "course-cancelled:e1",
        );
    });
});

describe("course cancel notice", () => {
    it("says what is cancelled and where the money stands", () => {
        const paid = course({
            sessions: [LATE, LATE],
            money: { state: "PAID", amountMinor: 800050, currency: "INR" },
        });
        expect(courseSentence("COURSE_CANCELLED", paid)).toBe(
            "Your place in Beginners' wheel is cancelled. Its 2 sessions still to come are cancelled. The ₹8,000.50 you paid hasn't been refunded. Ask Rye Studio if you have a question about it.",
        );
        const vars: NoticeVars = { kind: "COURSE_CANCELLED", course: paid };
        expect(renderNotice(vars).subject).toBe(
            "Your place in Beginners' wheel at Rye Studio is cancelled",
        );
        // No list on a cancel.
        expect(renderNotice(vars).body).not.toContain("<li>");
    });

    it("every money state, and none", () => {
        expect(
            courseMoneyWords(
                { state: "OPEN", amountMinor: 400000, currency: "INR" },
                "Rye Studio",
            ),
        ).toBe(
            "Its ₹4,000 invoice is still open. Ask Rye Studio what you owe now.",
        );
        expect(courseMoneyWords({ state: "VOID" }, "Rye Studio")).toBe(
            "Its invoice has been cancelled, so nothing is owed.",
        );
        expect(courseMoneyWords({ state: "CREDITED" }, "Rye Studio")).toBe(
            "Its invoice has been cancelled with a credit note.",
        );
        expect(
            courseSentence("COURSE_CANCELLED", course({ sessions: [] })),
        ).toBe("Your place in Beginners' wheel is cancelled.");
        expect(
            courseSentence("COURSE_CANCELLED", course({ sessions: [LATE] })),
        ).toBe(
            "Your place in Beginners' wheel is cancelled. Its 1 session still to come is cancelled.",
        );
    });

    it("a load for another kind's payload reads nothing", async () => {
        await expect(
            courseNotice.load(
                {} as never,
                "org_1",
                { kind: "WAITLIST_OFFER", eventKey: "x" },
                LATE,
            ),
        ).resolves.toBeNull();
        await expect(
            courseNotice.load(
                {} as never,
                "org_1",
                { kind: "COURSE_ENROLLED", eventKey: "x" },
                LATE,
            ),
        ).resolves.toBeNull();
    });
});

describe("a class the business cancelled", () => {
    const booking: BookingNoticeVars = {
        business: "Pulse Fitness",
        firstName: "Asha",
        service: "HIIT",
        staff: null,
        startAt: LATE,
        fromStartAt: null,
        timeZone: "Asia/Kolkata",
        byCustomer: false,
        classCancelled: true,
        money: null,
    };

    it("says the business cancelled it, and the money", () => {
        const vars: NoticeVars = { kind: "BOOKING_CANCELLED", booking };
        expect(noticeSentence(vars)).toBe(
            "Pulse Fitness cancelled this class: HIIT on Sun 1 Nov at 12:30 am. Your place in it is cancelled.",
        );
        expect(renderNotice(vars).subject).toBe(
            "Pulse Fitness cancelled your class",
        );
        expect(
            noticeSentence({
                kind: "BOOKING_CANCELLED",
                booking: {
                    ...booking,
                    money: {
                        state: "REFUNDING",
                        amountMinor: 50000,
                        currency: "INR",
                    },
                },
            }),
        ).toBe(
            "Pulse Fitness cancelled this class: HIIT on Sun 1 Nov at 12:30 am. Your place in it is cancelled. ₹500 is being refunded to how you paid.",
        );
    });

    it("a booking cancelled on its own keeps its words", () => {
        expect(
            noticeSentence({
                kind: "BOOKING_CANCELLED",
                booking: { ...booking, classCancelled: false },
            }),
        ).toBe("Your HIIT on Sun 1 Nov at 12:30 am has been cancelled.");
    });

    it("every money line says what is true", () => {
        const amount = { amountMinor: 50000, currency: "INR" };
        const words = (m: Parameters<typeof classCancelMoneyWords>[0]) =>
            classCancelMoneyWords(m, "Pulse Fitness");
        expect(words({ state: "REFUNDED", ...amount })).toBe(
            "₹500 has been refunded to how you paid.",
        );
        expect(words({ state: "REFUND_FAILED", ...amount })).toBe(
            "The refund of ₹500 didn't go through. Ask Pulse Fitness about it.",
        );
        expect(words({ state: "NOT_REFUNDED", ...amount })).toBe(
            "The ₹500 you paid hasn't been refunded. Ask Pulse Fitness about it.",
        );
        expect(words({ state: "PACK_BACK", left: 1 })).toBe(
            "The class is back in your pack: 1 class left.",
        );
        expect(words({ state: "MEMBERSHIP_BACK" })).toBe(
            "It doesn't count against your membership.",
        );
        expect(words({ state: "NOTHING_TAKEN" })).toBe("No payment was taken.");
        expect(words(null)).toBeNull();
    });

    it("the waitlist hears the class is off", () => {
        const vars: NoticeVars = {
            kind: "WAITLIST_CLASS_CANCELLED",
            waitlist: {
                business: "Pulse Fitness",
                firstName: "Bina",
                service: "HIIT",
                startAt: LATE,
                timeZone: "Asia/Kolkata",
            },
        };
        expect(noticeSentence(vars)).toBe(
            "Pulse Fitness cancelled HIIT on Sun 1 Nov at 12:30 am, the class you were waiting for. You're no longer on its waitlist.",
        );
        expect(renderNotice(vars).subject).toBe("Pulse Fitness cancelled HIIT");
    });
});
