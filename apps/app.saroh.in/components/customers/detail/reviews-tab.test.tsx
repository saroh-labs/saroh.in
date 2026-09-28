import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { Review } from "@/lib/product-reviews/service";

import { ReviewsTab } from "./reviews-tab";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/lib/product-reviews/actions", () => ({
    replyToReview: vi.fn(),
    setReviewHidden: vi.fn(),
}));

/**
 * Customer Detail's Reviews tab as the design draws it (C6): stars, the
 * product as a real link to its Reviews, the date, the words, "Hidden from
 * the shop", the reply, and Reply and Hide only for a role that may write
 * reviews — a Member sees none.
 */

const review = (over: Partial<Review> = {}): Review => ({
    id: "r1",
    rating: 4,
    body: "Crust like a dream",
    displayName: "Asha R.",
    productId: "p1",
    productName: "Sourdough",
    storeId: "s1",
    invitedTo: "asha@example.in",
    status: "PUBLISHED",
    reply: null,
    repliedAt: null,
    createdAt: "2026-09-20T10:00:00Z",
    ...over,
});

const render = (reviews: Review[], canReply = true) =>
    renderToStaticMarkup(
        <ReviewsTab reviews={reviews} firstName="Asha" canReply={canReply} />,
    );

describe("the Reviews tab", () => {
    it("says who hasn't reviewed yet, in words", () => {
        const html = render([]);
        expect(html).toContain("No reviews from Asha yet");
        expect(html).toContain(
            "Customers are asked after their order is delivered.",
        );
    });

    it("draws a review: stars, the product as a link to its Reviews, the words", () => {
        const html = render([review()]);
        expect(html).toContain('aria-label="4 out of 5"');
        expect(html).toContain("★★★★☆");
        expect(html).toContain(
            'href="/commerce/products/p1?storefront=s1&amp;tab=reviews"',
        );
        expect(html).toContain("Sourdough");
        expect(html).toContain("Crust like a dream");
        // A real link and real buttons: pointer, hover, focus and pressed.
        expect(html).toMatch(
            /cursor-pointer[^"]*hover:[^"]*focus-visible:ring-2[^"]*active:/,
        );
        expect(html).not.toContain("Hidden from the shop</span>");
    });

    it("offers Reply and Hide to a role that may write reviews", () => {
        const html = render([review()]);
        expect(html).toContain(">Reply</button>");
        expect(html).toContain(">Hide from the shop</button>");
    });

    it("marks a hidden review and offers to show it; a replied one has no Reply", () => {
        const html = render([
            review({ status: "HIDDEN", reply: "Thank you, Asha!" }),
        ]);
        expect(html).toContain("Hidden from the shop</span>");
        expect(html).toContain("Your reply:");
        expect(html).toContain("Thank you, Asha!");
        expect(html).toContain(">Show on the shop</button>");
        expect(html).not.toContain(">Reply</button>");
    });

    it("gives a Member no controls at all", () => {
        const html = render(
            [review(), review({ id: "r2", status: "HIDDEN" })],
            false,
        );
        expect(html).not.toContain("<button");
        expect(html).toContain("Hidden from the shop</span>");
    });

    it("names a review with no product link by its product name alone", () => {
        const html = render([review({ productId: null, body: null })]);
        expect(html).not.toContain("/commerce/products/");
        expect(html).toContain("Sourdough");
        expect(html).toContain("No comment left — just a rating.");
    });
});
