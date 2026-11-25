import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { OPENS_DEFAULT } from "@/lib/services/bookings-opens";

import { ListPageHeader } from "./list-page-header";

vi.mock("next/navigation", () => ({
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/services/bookings-opens-actions", () => ({
    saveBookingsOpens: vi.fn(),
}));

describe("the List's header on first paint (owner, 25 Nov)", () => {
    it("draws the phone row and the desk header, the breakpoint shows one", () => {
        const html = renderToString(
            <ListPageHeader
                opens={OPENS_DEFAULT}
                me={null}
                zone="IST"
                newBooking={null}
            />,
        );
        expect(html).toMatch(
            /data-list-header="phone" class="contents min-\[760px\]:hidden"/,
        );
        expect(html).toContain("data-bookings-bar");
        expect(html).toMatch(
            /class="mb-8 max-\[759px\]:hidden" data-list-header="desk"/,
        );
        // One h1 a screen reader can reach at each width: each in its frame.
        expect(html.match(/<h1/g)).toHaveLength(2);
    });
});
