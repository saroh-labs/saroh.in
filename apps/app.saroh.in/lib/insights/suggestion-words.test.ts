import { describe, expect, it } from "vitest";

import {
    placeLine,
    suggestionWords,
    whenSuggestionsShow,
} from "./suggestion-words";
import {
    CLASS_FULL,
    FIRST_SALE,
    LATE_BILL,
    SELLING_LESS,
} from "./suggestions.fixture";

/**
 * The words of "What to do next" (DEC-171, U11, #1091): each rule's
 * suggestion as the boards say it, from the API's facts (#1087).
 */

const opts = { period: "4w" as const, share: null };

describe("suggestionWords", () => {
    it("a class nearly always full: add a class time", () => {
        const w = suggestionWords(CLASS_FULL, opts);
        expect(w.title).toBe("Add another time for Saturday sourdough class");
        expect(w.why).toBe(
            "93% of its places were taken across 4 classes in the last 4 weeks.",
        );
        expect(w.action).toEqual({
            kind: "link",
            label: "Add a class time",
            href: "/services/svc_1",
        });
        expect(w.rule).toBe(
            "Why you're seeing this: a class nearly always full.",
        );
    });

    it("a class full every time says so in words", () => {
        const w = suggestionWords({ ...CLASS_FULL, fullPercent: 100 }, opts);
        expect(w.why).toMatch(/^Every place was taken across 4 classes/);
    });

    it("a late bill, with a reminder to send (`IBNextD`)", () => {
        const w = suggestionWords(LATE_BILL, opts);
        expect(w.title).toBe("Remind Shruti Menon about ₹11,250");
        expect(w.why).toBe("Bill INV-0042 is 29 days late, more than 3 weeks.");
        expect(w.action).toEqual({
            kind: "remind",
            label: "Send reminder",
            invoiceId: "inv_1",
            person: "Shruti",
        });
        expect(w.rule).toBe(
            "Why you're seeing this: a bill more than 3 weeks late.",
        );
        expect(w.masked).toBe(true);
    });

    it("a late bill without a name or number", () => {
        const w = suggestionWords(
            {
                ...LATE_BILL,
                billedTo: null,
                invoice: { id: "inv_1", number: null },
            },
            opts,
        );
        expect(w.title).toBe("Send a reminder for ₹11,250");
        expect(w.why).toBe("The bill is 29 days late, more than 3 weeks.");
    });

    it("a late bill the person can't remind about opens the bill", () => {
        const w = suggestionWords(
            {
                ...LATE_BILL,
                action: { kind: "OPEN_BILL", href: "/billing/invoices/inv_1" },
            },
            opts,
        );
        expect(w.title).toBe("Shruti Menon still owes ₹11,250");
        expect(w.action).toEqual({
            kind: "link",
            label: "Open the bill",
            href: "/billing/invoices/inv_1",
        });
    });

    it("something selling less, against the period before (`IBNotNowD`)", () => {
        const w = suggestionWords(SELLING_LESS, opts);
        expect(w.title).toBe("Croissants, box of 4 is selling less");
        expect(w.why).toBe(
            "12 sold in the last 4 weeks, 60% fewer than the 4 weeks before. It used to be your third best seller.",
        );
        expect(w.action).toMatchObject({ label: "Open the product" });
    });

    it("selling less: none sold is said in words, and the period follows the page", () => {
        const w = suggestionWords(
            { ...SELLING_LESS, sold: 0, fewerPercent: 100, rankBefore: 7 },
            { period: "7d", share: null },
        );
        expect(w.why).toBe(
            "None sold in the last 7 days, against 30 in the 7 days before.",
        );
    });

    it("the first sale copies the live shop link, and can't be put off", () => {
        const w = suggestionWords(FIRST_SALE, {
            period: "4w",
            share: {
                kind: "shop",
                url: "https://rye.saroh.app/shop",
                label: "Share your online shop",
                copied: "Online shop link copied",
            },
        });
        expect(w.title).toBe(
            "Send your shop link to 10 people who already buy from you",
        );
        expect(w.why).toBe("Most first orders come from people who know you.");
        expect(w.action).toEqual({
            kind: "copy",
            label: "Copy shop link",
            url: "https://rye.saroh.app/shop",
        });
        expect(w.rule).toBeNull();
    });

    it("the first sale without a live shop says the website's link", () => {
        const w = suggestionWords(FIRST_SALE, {
            period: "4w",
            share: {
                kind: "site",
                url: "https://rye.saroh.app",
                label: "Share your website",
                copied: "Website link copied",
            },
        });
        expect(w.action).toMatchObject({ label: "Copy website link" });
    });

    it("the first sale with nothing live leads to Website", () => {
        const w = suggestionWords(FIRST_SALE, opts);
        expect(w.action).toEqual({
            kind: "link",
            label: "Open Website",
            href: "/sites",
        });
    });
});

describe("the card's other lines", () => {
    it("says where this one is among them", () => {
        expect(placeLine(1, 3)).toBe("2 of 3");
    });

    it("names only the rules this person can be shown", () => {
        expect(whenSuggestionsShow(true)).toContain(
            "a bill is more than 3 weeks late",
        );
        expect(whenSuggestionsShow(false)).toBe(
            "Suggestions show up when a class is nearly always full.",
        );
    });
});
