import { describe, expect, it } from "vitest";

import { invitationSentence, ratingLabel, rowRating, stars } from "./describe";

describe("rowRating", () => {
    const ratings = new Map([
        ["a", { productId: "a", average: 5, count: 3 }],
        ["b", { productId: "b", average: 3, count: 1 }],
    ]);

    it("weights the storefronts a merged row sells in by their counts", () => {
        expect(rowRating(["a", "b"], ratings)).toEqual({
            average: 4.5,
            count: 4,
        });
    });

    it("is null for a product nobody has reviewed", () => {
        expect(rowRating(["z"], ratings)).toBeNull();
    });
});

describe("labels", () => {
    it("reads '4.6 · 12', and '—' when there are none", () => {
        expect(ratingLabel({ average: 4.6, count: 12 })).toBe("4.6 · 12");
        expect(ratingLabel({ average: 5, count: 1 })).toBe("5.0 · 1");
        expect(ratingLabel(null)).toBe("—");
    });

    it("draws stars", () => {
        expect(stars(3)).toBe("★★★☆☆");
    });

    it("says where an invitation stands", () => {
        const base = { sentAt: null, sendCount: 1, blocked: null };
        expect(
            invitationSentence({
                ...base,
                state: "sent",
                reviewed: 1,
                lines: 3,
            }),
        ).toBe("Invitation sent — 1 of 3 reviewed so far.");
        expect(
            invitationSentence({
                ...base,
                state: "none",
                reviewed: 0,
                lines: 3,
            }),
        ).toBe("No one has been asked to review this order yet.");
        expect(
            invitationSentence({
                ...base,
                state: "completed",
                reviewed: 3,
                lines: 3,
            }),
        ).toBe("Every item has been reviewed (3 of 3).");
    });
});
