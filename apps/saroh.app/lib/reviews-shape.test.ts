import { describe, expect, it } from "vitest";

import { goneReason, isReviewInvitation } from "./reviews-shape";

describe("review invitation shape", () => {
    const good = {
        storeName: "High Street",
        theme: { "--site-bg": "0 0% 100%" },
        suggestedName: "Ananya R.",
        lines: [
            {
                orderItemId: "oi_1",
                productName: "Mailer box",
                image: null,
                reviewed: false,
            },
        ],
    };

    it("accepts a well-formed invitation, with or without a theme", () => {
        expect(isReviewInvitation(good)).toBe(true);
        expect(isReviewInvitation({ ...good, theme: null })).toBe(true);
    });

    it("rejects one missing its lines, or with a line in the wrong shape", () => {
        expect(isReviewInvitation({ ...good, lines: undefined })).toBe(false);
        expect(
            isReviewInvitation({
                ...good,
                lines: [{ ...good.lines[0], reviewed: "no" }],
            }),
        ).toBe(false);
    });

    it("reads the reason from the API's error envelope", () => {
        expect(
            goneReason({
                error: { message: "x", details: { reason: "expired" } },
            }),
        ).toBe("expired");
        expect(
            goneReason({ error: { details: { reason: "made-up" } } }),
        ).toBeNull();
        expect(goneReason(null)).toBeNull();
    });
});
