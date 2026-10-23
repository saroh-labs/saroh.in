import { describe, expect, it } from "vitest";

import type { PageFacts } from "./booking-page";
import {
    bookerPick,
    outcomeAsk,
    outcomeLine,
    pageBadge,
    pageCanBookNext,
    pageCanCancel,
    pageCanMove,
    pageHeading,
    pageMain,
    pageOrigin,
} from "./booking-page";
import { moneyNotes, moneyRows } from "./booking-page-money";

const ZONE = "Asia/Kolkata";
const at = (local: string) => new Date(`${local}:00+05:30`).toISOString();
const NOW = Date.parse(at("2026-10-19T11:20"));

const facts = (over: Partial<PageFacts> = {}): PageFacts => ({
    status: "CONFIRMED",
    outcome: null,
    canBook: true,
    canLaunch: true,
    bookedElsewhere: false,
    take: { cents: 40_000, byLink: false },
    canTake: true,
    ended: false,
    retired: false,
    ...over,
});

describe("the one main action (U12)", () => {
    it("is Take ₹X while there is money to take", () => {
        expect(pageMain(facts())).toBe("take");
    });
    it("is locked for a role that can't take it, and absent when untold", () => {
        expect(pageMain(facts({ canTake: false }))).toBe("take-locked");
        expect(pageMain(facts({ canTake: null }))).toBeNull();
    });
    it("is Book their next visit once they came, Book them again after they didn't", () => {
        expect(pageMain(facts({ take: null, outcome: "ATTENDED" }))).toBe(
            "next",
        );
        expect(pageMain(facts({ take: null, outcome: "NO_SHOW" }))).toBe(
            "again",
        );
    });
    it("is Book a new time once cancelled", () => {
        expect(pageMain(facts({ status: "CANCELLED", take: null }))).toBe(
            "rebook",
        );
    });
    it("books nothing for a class, a treatment's visit, or a reader", () => {
        const after = { take: null, outcome: "ATTENDED" as const };
        expect(pageMain(facts({ ...after, bookedElsewhere: true }))).toBeNull();
        expect(pageMain(facts({ ...after, canBook: false }))).toBeNull();
        expect(pageMain(facts({ ...after, canLaunch: false }))).toBeNull();
    });
});

describe("Move, Cancel and Book their next visit", () => {
    it("moves only what is still to come, unmarked and on a live service", () => {
        expect(pageCanMove(facts())).toBe(true);
        expect(pageCanMove(facts({ ended: true }))).toBe(false);
        expect(pageCanMove(facts({ outcome: "ATTENDED" }))).toBe(false);
        expect(pageCanMove(facts({ retired: true }))).toBe(false);
        expect(pageCanMove(facts({ status: "CANCELLED" }))).toBe(false);
        expect(pageCanMove(facts({ canBook: false }))).toBe(false);
    });
    it("cancels anything not cancelled and not yet marked", () => {
        expect(pageCanCancel(facts({ ended: true }))).toBe(true);
        expect(pageCanCancel(facts({ outcome: "NO_SHOW" }))).toBe(false);
        expect(pageCanCancel(facts({ status: "CANCELLED" }))).toBe(false);
    });
    it("offers the next visit in More unless it is the main action", () => {
        expect(pageCanBookNext(facts())).toBe(true);
        expect(
            pageCanBookNext(facts({ take: null, outcome: "ATTENDED" })),
        ).toBe(false);
        expect(pageCanBookNext(facts({ bookedElsewhere: true }))).toBe(false);
    });
});

describe("the words", () => {
    it("badges by what happened, then by the clock", () => {
        const b = (o: Partial<Parameters<typeof pageBadge>[0]>) =>
            pageBadge({
                status: "CONFIRMED",
                outcome: null,
                ended: false,
                ...o,
            }).label;
        expect(b({})).toBe("Booked");
        expect(b({ ended: true })).toBe("Not marked yet");
        expect(b({ outcome: "ATTENDED" })).toBe("Came");
        expect(b({ outcome: "NO_SHOW" })).toBe("Didn't come");
        expect(b({ status: "PENDING" })).toBe("Awaiting payment");
        expect(b({ status: "CANCELLED", outcome: "ATTENDED" })).toBe(
            "Cancelled",
        );
    });
    it("heads with the day and the time, today said as such", () => {
        expect(
            pageHeading(
                {
                    startAt: at("2026-10-19T11:30"),
                    endAt: at("2026-10-19T12:15"),
                },
                ZONE,
                NOW,
            ),
        ).toEqual({ day: "Today, Mon 19 Oct", time: "11:30 am to 12:15 pm" });
        expect(
            pageHeading(
                {
                    startAt: at("2026-10-17T10:00"),
                    endAt: at("2026-10-17T10:45"),
                },
                ZONE,
                NOW,
            ).day,
        ).toBe("Sat 17 Oct");
    });
    it("says how it came to be: moved, and by whom", () => {
        const booked = {
            id: "e1",
            type: "BOOKED" as const,
            actor: { name: "Meera Iyer" },
            fromStartAt: null,
            toStartAt: null,
            createdAt: "",
        };
        const moved = { ...booked, id: "e2", type: "RESCHEDULED" as const };
        expect(pageOrigin([booked, moved])).toBe(
            "Moved once · booked by Meera",
        );
        expect(pageOrigin([booked, moved, moved])).toBe(
            "Moved 2 times · booked by Meera",
        );
        expect(pageOrigin([{ ...booked, actor: null }])).toBeNull();
        expect(pageOrigin([{ ...booked, actor: null }, moved])).toBe(
            "Moved once · booked online",
        );
    });
    it("asks Did they come from an hour before; Didn't come from the start", () => {
        const b = {
            status: "CONFIRMED" as const,
            startAt: at("2026-10-19T11:30"),
        };
        expect(outcomeAsk(b, null, true, NOW)).toEqual({
            came: true,
            didnt: false,
        });
        expect(
            outcomeAsk(b, null, true, Date.parse(at("2026-10-19T09:00"))),
        ).toBeNull();
        expect(outcomeAsk(b, null, false, NOW)).toBeNull();
        expect(
            outcomeAsk(b, null, true, Date.parse(at("2026-10-19T11:40"))),
        ).toEqual({ came: true, didnt: true });
        expect(outcomeLine("ATTENDED", "Meera Iyer")).toBe(
            "Came. Marked by Meera.",
        );
    });
});

describe("Money's lines", () => {
    const format = (c: number) => `₹${c / 100}`;
    const base = {
        priceCents: 80_000,
        currency: "INR",
        paidOnlineCents: 40_000,
        deposit: true,
        dueCents: 40_000,
        refund: null,
        take: { cents: 40_000, byLink: false },
    };
    it("says the price, the deposit and what is still to take", () => {
        expect(moneyRows(base, format, false).map((r) => r.text)).toEqual([
            "₹800",
            "₹400 paid online",
            "₹400 to take at the visit",
        ]);
    });
    it("says it's paid once nothing is left, and a refund once cancelled", () => {
        expect(
            moneyRows(
                {
                    ...base,
                    dueCents: 0,
                    take: null,
                    paidAtDeskCents: 40_000,
                    deskMethod: "CARD",
                },
                format,
                false,
            ).map((r) => r.text),
        ).toEqual([
            "₹800",
            "₹400 paid online",
            "₹400 paid at the desk · Card",
            "Nothing, it's paid",
        ]);
        expect(
            moneyRows(
                {
                    ...base,
                    take: null,
                    dueCents: null,
                    refund: {
                        amountCents: 40_000,
                        status: "FAILED",
                        beingConfirmed: false,
                    },
                },
                format,
                true,
            ).at(-1),
        ).toMatchObject({ text: "₹400 didn't go through", bad: true });
    });
});

describe("who New booking opens with", () => {
    it("takes the contact, or a walk-in by name and phone", () => {
        expect(
            bookerPick({
                contact: {
                    id: "c1",
                    firstName: "Kabir",
                    lastName: "Singh",
                    email: "k@example.com",
                    phone: null,
                },
                bookerName: null,
                bookerEmail: null,
                bookerPhone: null,
            }),
        ).toEqual({
            kind: "contact",
            id: "c1",
            name: "Kabir Singh",
            email: "k@example.com",
            phone: null,
        });
        expect(
            bookerPick({
                contact: null,
                bookerName: "Asha",
                bookerEmail: null,
                bookerPhone: "+919000000000",
            }),
        ).toEqual({ kind: "walk-in", name: "Asha", phone: "+919000000000" });
        expect(
            bookerPick({
                contact: null,
                bookerName: null,
                bookerEmail: null,
                bookerPhone: null,
            }),
        ).toBeNull();
    });
});

describe("Money's sentences", () => {
    const format = (c: number) => `₹${c / 100}`;
    const m = {
        priceCents: 80_000,
        currency: "INR",
        paidOnlineCents: 40_000,
        deposit: true,
        dueCents: 40_000,
        refund: null,
        refundableCents: 40_000,
        refundInTimeCancels: true,
    };
    it("says the free-cancel time and the policy while it can be cancelled", () => {
        expect(
            moneyNotes(m, {
                format,
                cancelled: false,
                ended: false,
                freeCancelUntil: at("2026-10-18T11:30"),
                timezone: ZONE,
            }).map((n) => n.text),
        ).toEqual([
            "Free to cancel until Sun 18 Oct, 11:30 am. Your refund policy: the ₹400 deposit is refunded automatically if it's cancelled by then.",
        ]);
    });
    it("says a failed refund in full, as bad", () => {
        const notes = moneyNotes(
            {
                ...m,
                refund: {
                    amountCents: 40_000,
                    status: "FAILED",
                    beingConfirmed: false,
                },
            },
            {
                format,
                cancelled: true,
                ended: false,
                freeCancelUntil: null,
                timezone: ZONE,
            },
        );
        expect(notes).toHaveLength(1);
        expect(notes[0]).toMatchObject({ bad: true });
        expect(notes[0]?.text).toMatch(/didn't go through/);
    });
});
