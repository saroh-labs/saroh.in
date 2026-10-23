import type { NoticeVars } from "./index";
import { noticeSentence, renderNotice } from "./index";

/**
 * A class cancelled with a reason (DEC-178, #1172): the customer's email
 * reads "‹Business› cancelled this class: ‹reason›.", the waitlist's says
 * it too, both escaped as the business's typed words; a cancel with no
 * reason (made before #1172) keeps its words.
 */

const startAt = new Date("2026-11-02T07:00:00.000Z");

function place(classReason?: string | null): NoticeVars {
    return {
        kind: "BOOKING_CANCELLED",
        booking: {
            business: "Pulse Fitness",
            firstName: "Sneha",
            service: "HIIT",
            staff: null,
            startAt,
            fromStartAt: null,
            timeZone: "UTC",
            byCustomer: false,
            classCancelled: true,
            ...(classReason !== undefined ? { classReason } : {}),
            money: { state: "NOTHING_TAKEN" },
        },
    } as NoticeVars;
}

function waiting(reason?: string | null): NoticeVars {
    return {
        kind: "WAITLIST_CLASS_CANCELLED",
        waitlist: {
            business: "Pulse Fitness",
            firstName: "Bina",
            service: "HIIT",
            startAt,
            timeZone: "UTC",
            ...(reason !== undefined ? { reason } : {}),
        },
    } as NoticeVars;
}

describe("a class cancelled with a reason (#1172)", () => {
    it("the booked place's words lead with the reason", () => {
        expect(noticeSentence(place("The teacher is unwell"))).toMatch(
            /^Pulse Fitness cancelled this class: The teacher is unwell\. Your place in HIIT on Mon 2 Nov at 7:00 am is cancelled\./,
        );
    });

    it("keeps the business's own full stop, question or exclamation mark", () => {
        expect(noticeSentence(place("Power cut, sorry!"))).toContain(
            "cancelled this class: Power cut, sorry! Your place",
        );
        expect(noticeSentence(place("Flooded."))).toContain(
            "cancelled this class: Flooded. Your place",
        );
    });

    it("a cancel with no reason keeps today's words", () => {
        for (const none of [undefined, null, ""]) {
            expect(noticeSentence(place(none))).toMatch(
                /^Pulse Fitness cancelled this class: HIIT on Mon 2 Nov at 7:00 am\. Your place in it is cancelled\./,
            );
        }
    });

    it("the waitlist hears the reason too, and old cancels read as before", () => {
        expect(noticeSentence(waiting("Roof leak"))).toBe(
            "Pulse Fitness cancelled HIIT on Mon 2 Nov at 7:00 am, the class you were waiting for. Their reason: Roof leak. You're no longer on its waitlist.",
        );
        expect(noticeSentence(waiting())).toBe(
            "Pulse Fitness cancelled HIIT on Mon 2 Nov at 7:00 am, the class you were waiting for. You're no longer on its waitlist.",
        );
    });

    it("escapes the reason in both emails, and keeps it out of the subject", () => {
        const typed = `<script>alert("x")</script> & <b>sorry</b>`;
        for (const vars of [place(typed), waiting(typed)]) {
            const { subject, body } = renderNotice(vars);
            expect(body).not.toContain("<script>");
            expect(body).not.toContain("<b>");
            expect(body).toContain(
                "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;b&gt;sorry&lt;/b&gt;",
            );
            expect(subject).not.toContain("script");
        }
    });
});
