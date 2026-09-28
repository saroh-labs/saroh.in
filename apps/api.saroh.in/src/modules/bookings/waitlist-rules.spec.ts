import { betterPlace } from "./waitlist-merge";
import {
    MAX_LIVE_ENTRIES,
    mayOffer,
    NO_OFFER_WITHIN_MS,
    OFFER_HOLD_MS,
    offeredUntil,
    WAITLIST_WORDS,
} from "./waitlist-rules";

/** The class waitlist's rules (round-2 A12; defaults 9 and 76). */
describe("waitlist rules", () => {
    const start = new Date("2026-10-05T07:00:00Z");
    const hours = (h: number) => new Date(start.getTime() - h * 3_600_000);

    it("offers a freed place only while the class is more than an hour away", () => {
        expect(mayOffer(start, hours(3))).toBe(true);
        expect(mayOffer(start, hours(1.01))).toBe(true);
        expect(mayOffer(start, hours(1))).toBe(false);
        expect(mayOffer(start, hours(0.5))).toBe(false);
        expect(mayOffer(start, hours(-1))).toBe(false);
    });

    it("holds an offer 2 hours, or until an hour before the class if sooner", () => {
        const early = hours(24);
        expect(offeredUntil(start, early).getTime()).toBe(
            early.getTime() + OFFER_HOLD_MS,
        );
        expect(offeredUntil(start, hours(2)).getTime()).toBe(
            start.getTime() - NO_OFFER_WITHIN_MS,
        );
        expect(offeredUntil(start, hours(3)).getTime()).toBe(
            start.getTime() - NO_OFFER_WITHIN_MS,
        );
    });

    it("says the refusals as sentences", () => {
        expect(MAX_LIVE_ENTRIES).toBe(10);
        expect(WAITLIST_WORDS.room).toBe("There's room — book it.");
        expect(WAITLIST_WORDS.tooMany).toBe(
            "You're on 10 waitlists already. Leave one to join another.",
        );
    });
});

describe("a merge's better place (C9's rule, A12)", () => {
    const now = new Date("2026-10-01T09:00:00Z");
    const place = (
        status: "WAITING" | "OFFERED",
        position: number,
        until: Date | null = null,
    ) => ({
        id: `e_${status}_${position}`,
        serviceId: "svc_1",
        startAt: new Date("2026-10-05T07:00:00Z"),
        status,
        position,
        offeredUntil: until,
    });
    const later = new Date(now.getTime() + 3_600_000);
    const earlier = new Date(now.getTime() - 60_000);

    it("keeps a place held for them over one waiting", () => {
        expect(
            betterPlace(place("OFFERED", 5, later), place("WAITING", 1), now),
        ).toBe(true);
        expect(
            betterPlace(place("WAITING", 1), place("OFFERED", 5, later), now),
        ).toBe(false);
    });

    it("counts an offer that ran out as waiting", () => {
        expect(
            betterPlace(place("OFFERED", 5, earlier), place("WAITING", 1), now),
        ).toBe(false);
    });

    it("else keeps the earlier position", () => {
        expect(betterPlace(place("WAITING", 2), place("WAITING", 3), now)).toBe(
            true,
        );
        expect(betterPlace(place("WAITING", 4), place("WAITING", 3), now)).toBe(
            false,
        );
    });
});
