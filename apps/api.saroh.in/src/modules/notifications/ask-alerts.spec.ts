/**
 * The words of a permission request's email and its answer's (DEC-170,
 * #1038): who asked, what for and what stands now; approved, or turned
 * down with the reason, cleaned as Saroh's email may carry it.
 */
import { SAME_AS_BUSINESS } from "../bookings/person-rules";
import {
    answeredMail,
    askedAndNow,
    askedMail,
    cleanReason,
    hoursPath,
    REASON_MAX,
} from "./ask-alerts";
import { renderAlertEmail } from "./team-alert.handler";

describe("a booking rules request's email", () => {
    const words = askedAndNow(
        { latestBookingMinutes: 120, gapMinutes: 15 },
        { ...SAME_AS_BUSINESS, gapMinutes: 0 },
    );

    it("says the asked rules and the person's own as they stand, in the boards' order", () => {
        expect(words).toEqual({
            asked: [
                "Booking late: up to 2 hours before the start",
                "15 min between bookings",
            ],
            now: [
                "Booking late: same as the business",
                "No gap needed between bookings",
            ],
        });
    });

    it("names who asked, what they asked for and what it is now", () => {
        expect(askedMail("Arjun", words)).toEqual({
            heading: "Arjun asked to change their booking rules",
            body: "They asked for: Booking late: up to 2 hours before the start; 15 min between bookings. Now: Booking late: same as the business; No gap needed between bookings. Approve it or turn it down in Hours and time off.",
        });
    });

    it("goes out under the business's name, opening Hours and time off on the person", () => {
        const mail = renderAlertEmail(
            {
                event: "ask",
                mail: askedMail("Arjun", words),
                path: hoursPath("st_1"),
                cta: "Review the request",
                footer: "You get this because you can approve changes to booking rules at {business}.",
            },
            "Kaya Physio",
        );
        expect(mail.subject).toBe(
            "Kaya Physio: Arjun asked to change their booking rules",
        );
        expect(mail.url).toMatch(/\/bookings\/availability\?person=st_1$/);
        expect(mail.cta).toBe("Review the request");
        expect(mail.footer).toBe(
            "You get this because you can approve changes to booking rules at Kaya Physio.",
        );
    });
});

describe("the answer's email", () => {
    const asked = ["Booking late: up to 2 hours before the start"];

    it("says an approval and the rules now in force", () => {
        expect(answeredMail("APPROVED", asked, null)).toEqual({
            heading: "Your booking rules change was approved",
            body: "Your booking rules now say: Booking late: up to 2 hours before the start.",
        });
    });

    it("says a turn-down, that nothing changed, and the reason", () => {
        expect(answeredMail("TURNED_DOWN", asked, "Mornings are busy")).toEqual(
            {
                heading: "Your booking rules change was turned down",
                body: "You asked for: Booking late: up to 2 hours before the start. Nothing has changed. The reason given: “Mornings are busy”",
            },
        );
    });

    it("says so when no reason was given", () => {
        expect(answeredMail("TURNED_DOWN", asked, null).body).toMatch(
            /No reason was given\.$/,
        );
    });
});

describe("a turn-down's reason, as Saroh's email carries it", () => {
    it("keeps plain words", () => {
        expect(cleanReason("  Mornings are   busy ")).toBe("Mornings are busy");
    });

    it("drops links, addresses, domains and control characters", () => {
        expect(
            cleanReason(
                "Call me\non https://evil.example/x or a@b.co, see bank.co.in",
            ),
        ).toBe("Call me on or see");
    });

    it("is nothing when nothing is left, or nothing was said", () => {
        expect(cleanReason("https://x.example")).toBeNull();
        expect(cleanReason("  ")).toBeNull();
        expect(cleanReason(null)).toBeNull();
    });

    it("is cut at its limit", () => {
        const long = cleanReason("word ".repeat(200));
        expect(Array.from(long ?? "").length).toBeLessThanOrEqual(REASON_MAX);
        expect(long?.endsWith("…")).toBe(true);
    });
});
