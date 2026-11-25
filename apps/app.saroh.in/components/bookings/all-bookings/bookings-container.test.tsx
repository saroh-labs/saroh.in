// @vitest-environment jsdom
/**
 * All bookings on React Query, first paint (owner, 25 Nov): the list's own
 * frame (Showing, search, filters) is drawn at once and works before any
 * data; only the rows are skeletons, replaced in place when the read
 * lands; Showing's count is a bar until then, never a 0.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/bookings/all",
    useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("@/lib/api/http", () => ({}));
vi.mock("@/lib/services/actions", () => ({}));

import { BookingsContainer } from "@/components/bookings/all-bookings/bookings-container";
import { renderWithQuery } from "@/lib/query/test-utils";

const ZONE = "Asia/Kolkata";
const NOW = Date.parse("2026-10-19T06:30:00.000Z");
const BOOKING = {
    id: "bk_1",
    serviceId: "svc_physio",
    startAt: new Date(NOW + 5 * 3_600_000).toISOString(),
    endAt: new Date(NOW + 6 * 3_600_000).toISOString(),
    timezone: ZONE,
    status: "CONFIRMED",
    outcome: null,
    bookerName: null,
    bookerEmail: null,
    bookerPhone: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    cancelledAt: null,
    cancelledLate: false,
    service: {
        id: "svc_physio",
        name: "Physio assessment",
        timezone: ZONE,
        capacity: 1,
        durationMinutes: 45,
    },
    contact: { id: "ct_1", firstName: "Priya", lastName: "Singh", email: null },
    staff: null,
    paidWith: null,
    packName: null,
    subscriptionId: null,
    take: null,
};

let release: () => void;
beforeEach(() => {
    window.history.replaceState(null, "", "/bookings/all");
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    release = open;
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
            await gate;
            return new Response(
                JSON.stringify({
                    bookings: [BOOKING],
                    timezone: ZONE,
                    now: NOW,
                    moment: null,
                    share: null,
                }),
                { status: 200 },
            );
        }),
    );
});
afterEach(() => vi.unstubAllGlobals());

const tick = (ms = 20) => act(() => new Promise((r) => setTimeout(r, ms)));

describe("All bookings before its first read", () => {
    it("draws Showing, search and filters at once, skeleton rows, then the rows", async () => {
        const { host, unmount } = renderWithQuery(
            <BookingsContainer
                zone={ZONE}
                now={NOW}
                me={null}
                initialStaff={null}
                can={{
                    book: true,
                    take: false,
                    people: true,
                    refund: false,
                    readOrder: false,
                    money: false,
                    link: false,
                    online: false,
                }}
            />,
        );
        await tick();
        const showing = host.querySelector<HTMLButtonElement>("[data-showing]");
        expect(showing?.disabled).toBe(false);
        expect(showing?.getAttribute("aria-label")).toBe(
            "Showing: Upcoming. Change",
        );
        expect(
            showing?.querySelector('[data-slot="figure-loading"]'),
        ).not.toBeNull();
        expect(host.querySelector('[data-shape="rows"]')).not.toBeNull();
        expect(host.textContent).not.toContain("Priya");
        expect(host.textContent).not.toContain("No bookings yet");

        release();
        await tick(50);
        expect(host.querySelector('[data-shape="rows"]')).toBeNull();
        expect(host.textContent).toContain("Priya");
        expect(showing?.getAttribute("aria-label")).toBe(
            "Showing: Upcoming, 1. Change",
        );
        unmount();
    });
});
