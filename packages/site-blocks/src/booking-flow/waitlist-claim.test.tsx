import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { WaitlistClaim } from "./waitlist-claim";
import { claimBookHref, claimWords, isWaitlistClaim } from "./waitlist-claim";
import { WaitlistClaimPage } from "./waitlist-claim-page";

/**
 * A waitlist offer's claim page (U18, #1149): the class with "Book my spot
 * until 6:30 pm" into the booking page on that session; "This offer has
 * ended" and "This spot has gone" with a way back into the class when
 * there is one. Every time in the class's zone.
 */

// Tue 27 Oct 2026, 18:00 in Kolkata; held until 16:30 the same day.
const CLAIM: WaitlistClaim = {
    state: "open",
    business: "Pulse Fitness",
    serviceId: "svc_spin",
    service: "Spin",
    startAt: "2026-10-27T12:30:00.000Z",
    heldUntil: "2026-10-27T11:00:00.000Z",
    timezone: "Asia/Kolkata",
    placesLeft: 0,
    rejoin: false,
};

const of = (over: Partial<WaitlistClaim>) => ({ ...CLAIM, ...over });

describe("the claim's words", () => {
    it("offers the class with Book my spot until the hold ends", () => {
        expect(claimWords(CLAIM)).toEqual({
            eyebrow: "A place opened up",
            title: "Spin",
            body: "Tue 27 Oct at 6:00 pm. A place in this class is held for you until 4:30 pm.",
            action: {
                label: "Book my spot until 4:30 pm",
                href: "/book?service=svc_spin&date=2026-10-27&start=18%3A00",
            },
        });
    });

    it("opens the booking page on the session, in the class's zone", () => {
        const href = claimBookHref(of({ startAt: "2026-10-27T19:00:00.000Z" }));
        // 00:30 the next day in Kolkata.
        const params = new URL(href, "https://x.example").searchParams;
        expect(params.get("date")).toBe("2026-10-28");
        expect(params.get("start")).toBe("00:30");
    });

    it("says the offer has ended, with join the waitlist again", () => {
        const words = claimWords(of({ state: "ended", rejoin: true }));
        expect(words.title).toBe("This offer has ended");
        expect(words.body).toContain("held for you until 4:30 pm");
        expect(words.action?.label).toBe("Join the waitlist again");
        // A place free again: book it rather than wait.
        expect(
            claimWords(of({ state: "ended", rejoin: true, placesLeft: 2 }))
                .action?.label,
        ).toBe("Book a place");
    });

    it("says the spot has gone, with a way back only while the class runs", () => {
        const taken = claimWords(of({ state: "gone", rejoin: true }));
        expect(taken.title).toBe("This spot has gone");
        expect(taken.body).toContain("was taken");
        expect(taken.action?.label).toBe("Join the waitlist again");
        const cancelled = claimWords(of({ state: "gone", rejoin: false }));
        expect(cancelled.body).toBe(
            "Spin, Tue 27 Oct at 6:00 pm, can't be booked any more.",
        );
        expect(cancelled.action).toBeNull();
    });

    it("says a used link was booked, and offers nothing more", () => {
        const words = claimWords(of({ state: "booked" }));
        expect(words.title).toBe("You've booked this place");
        expect(words.action).toBeNull();
    });
});

describe("the API's answer", () => {
    it("takes a claim as the API writes it", () => {
        expect(isWaitlistClaim(CLAIM)).toBe(true);
    });

    it("refuses anything else", () => {
        for (const value of [
            null,
            "open",
            of({ state: "maybe" as never }),
            of({ startAt: "not a date" }),
            { ...CLAIM, rejoin: "yes" },
            { ...CLAIM, placesLeft: undefined },
        ]) {
            expect(isWaitlistClaim(value)).toBe(false);
        }
    });
});

describe("the claim page", () => {
    it("draws Book my spot into the booking page, and the way home", () => {
        render(<WaitlistClaimPage claim={CLAIM} />);
        expect(
            screen.getByRole("heading", { level: 1, name: "Spin" }),
        ).toBeTruthy();
        expect(
            screen
                .getByRole("link", { name: "Book my spot until 4:30 pm" })
                .getAttribute("href"),
        ).toBe("/book?service=svc_spin&date=2026-10-27&start=18%3A00");
        expect(
            screen
                .getByRole("link", { name: "Go to the home page" })
                .getAttribute("href"),
        ).toBe("/");
    });

    it("draws an ended offer in the site's look too", () => {
        render(
            <WaitlistClaimPage
                claim={of({ state: "ended", rejoin: true })}
                look="quiet"
            />,
        );
        expect(
            screen.getByRole("heading", { name: "This offer has ended" }),
        ).toBeTruthy();
        expect(
            screen.getByRole("link", { name: "Join the waitlist again" }),
        ).toBeTruthy();
    });
});
