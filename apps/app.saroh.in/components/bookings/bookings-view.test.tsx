import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { BOOKINGS_FIRST_RUN, shareLink } from "@/lib/sites/share-links";

import { BookingsView } from "./bookings-view";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/bookings/all",
    useSearchParams: () => new URLSearchParams(),
}));

/**
 * Bookings' first run (DEC-069, L8): with none made yet, the list offers
 * "Share your booking page" while the page is live, and nothing to share
 * when it isn't.
 */
describe("BookingsView — first run", () => {
    const render = (book: string | null) =>
        renderToStaticMarkup(
            <BookingsView
                bookings={[]}
                share={shareLink(
                    { links: { site: null, shop: null, book } },
                    BOOKINGS_FIRST_RUN,
                )}
            />,
        );

    it("offers the booking page while it is live", () => {
        const html = render("https://rye.saroh.app/book");
        expect(html).toContain("No bookings yet");
        expect(html).toContain("Share your booking page");
    });

    it("offers nothing to share when the booking page isn't live", () => {
        const html = render(null);
        expect(html).not.toContain("Share your booking page");
        expect(html).toContain(
            "Bookings appear here as visitors reserve slots on your services.",
        );
    });
});
