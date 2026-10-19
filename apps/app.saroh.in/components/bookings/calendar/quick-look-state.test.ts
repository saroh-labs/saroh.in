/**
 * The quick look's rules (U7): one main action at a time, More in the
 * boards' order with Cancel last, who hears of a change, and a refusal
 * that means the time was just taken.
 */
import { describe, expect, it } from "vitest";

import type { QuickLookFacts } from "./quick-look-state";
import {
    changeToldText,
    isTakenRefusal,
    moreItems,
    movedToldText,
    nextVisitDay,
    primaryAction,
} from "./quick-look-state";

const facts = (over: Partial<QuickLookFacts> = {}): QuickLookFacts => ({
    state: "booked",
    canBook: true,
    canArrive: true,
    canNoShow: false,
    canTakeNow: true,
    canNext: true,
    held: false,
    hasPerson: true,
    ...over,
});

describe("the main action", () => {
    it("is Mark arrived, then Take, then Book their next visit", () => {
        expect(primaryAction(facts())).toBe("arrive");
        expect(primaryAction(facts({ state: "in" }))).toBe("take");
        expect(primaryAction(facts({ state: "in", canTakeNow: false }))).toBe(
            "next",
        );
    });

    it("books them again after Didn't come, and a new time after a cancel", () => {
        expect(primaryAction(facts({ state: "noshow" }))).toBe("again");
        expect(primaryAction(facts({ state: "cancelled" }))).toBe("rebook");
    });

    it("is none too early to mark them, or for a role that can't book", () => {
        expect(primaryAction(facts({ canArrive: false }))).toBeNull();
        expect(primaryAction(facts({ canBook: false }))).toBeNull();
    });
});

describe("More", () => {
    const labels = (f: QuickLookFacts) =>
        moreItems(f, { first: "Kabir", amount: "₹500" }).map((i) => i.label);

    it("ends with Cancel booking, in red", () => {
        const items = moreItems(facts(), { first: "Kabir", amount: "₹500" });
        expect(items.at(-1)).toEqual({
            action: "cancel",
            label: "Cancel booking",
            danger: true,
        });
        expect(labels(facts({ canNoShow: true }))).toEqual([
            "Take ₹500 now",
            "Mark as didn't come",
            "Open Kabir's page",
            "The full booking and its history",
            "Book their next visit",
            "Move to another time",
            "Cancel booking",
        ]);
    });

    it("after they came: Undo while it is held, else Mark as didn't come", () => {
        expect(labels(facts({ state: "in", held: true }))).toEqual([
            "Open Kabir's page",
            "The full booking and its history",
            "Book their next visit",
            "Undo: not arrived yet",
        ]);
        expect(
            labels(facts({ state: "in", canNoShow: true, canTakeNow: false })),
        ).toEqual([
            "Open Kabir's page",
            "The full booking and its history",
            "Mark as didn't come",
        ]);
    });

    it("didn't come and cancelled", () => {
        expect(labels(facts({ state: "noshow", held: true }))).toEqual([
            "Mark as came",
            "Undo: Kabir didn't come",
            "Open Kabir's page",
            "The full booking and its history",
        ]);
        expect(labels(facts({ state: "cancelled", held: true }))).toEqual([
            "Undo the cancel",
            "Open Kabir's page",
            "The full booking and its history",
        ]);
    });

    it("holds only the pages for a role that can't book", () => {
        expect(labels(facts({ canBook: false, canTakeNow: false }))).toEqual([
            "Open Kabir's page",
            "The full booking and its history",
        ]);
    });
});

describe("words", () => {
    it("say who hears of a change, as it reaches them", () => {
        expect(changeToldText("EMAIL_AND_ACCOUNT", "Kabir")).toBe(
            "Kabir is emailed either way and sees the change in their account on your site.",
        );
        expect(changeToldText(null, "Kabir")).toBe(
            "Saroh doesn't message Kabir. Tell them yourself either way.",
        );
        expect(movedToldText("EMAIL", "Kabir")).toBe("Kabir is emailed.");
        expect(movedToldText("ACCOUNT", "Kabir")).toBeNull();
    });

    it("know a time taken meanwhile from any other refusal", () => {
        expect(isTakenRefusal("Meera Iyer is already booked then.")).toBe(true);
        expect(isTakenRefusal("That time is fully booked.")).toBe(true);
        expect(
            isTakenRefusal(
                "The class pack that paid for this booking expires before that time.",
            ),
        ).toBe(false);
    });

    it("never fix the next visit a week on: tomorrow or next week from today", () => {
        expect(nextVisitDay("tomorrow", "2026-10-19")).toBe("2026-10-20");
        expect(nextVisitDay("next-week", "2026-10-19")).toBe("2026-10-26");
    });
});
