// @vitest-environment jsdom
/**
 * The Bookings diary on React Query, first paint (owner, 25 Nov): nothing
 * comes with the page's HTML; the header (the day, Previous and Next,
 * "…", New booking) is drawn at once and works before any data; the diary
 * is its skeleton, the summary a bar, until the read lands and replaces
 * them in place. A step taken before the data keys the read.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async () => {
    const { useSyncExternalStore } = await import("react");
    const subscribe = (onChange: () => void) => {
        window.addEventListener("popstate", onChange);
        return () => window.removeEventListener("popstate", onChange);
    };
    return {
        useSearchParams: () =>
            new URLSearchParams(
                useSyncExternalStore(subscribe, () => window.location.search),
            ),
        useRouter: () => ({
            push: vi.fn(),
            replace: vi.fn(),
            refresh: vi.fn(),
        }),
        usePathname: () => "/bookings",
    };
});
vi.mock("@/lib/api/http", () => ({}));
vi.mock("@/lib/services/actions", () => ({}));
vi.mock("@/lib/services/bookings-opens-actions", () => ({
    saveBookingsOpens: vi.fn(() => Promise.resolve({ ok: true, data: {} })),
}));

import { DiaryContainer } from "@/components/bookings/calendar/diary-container";
import { renderWithQuery } from "@/lib/query/test-utils";
import { OPENS_DEFAULT } from "@/lib/services/bookings-opens";

const IST = "Asia/Kolkata";
const NOW = Date.parse("2026-09-29T06:30:00.000Z"); // Tue 29 Sep, noon IST

let release: () => void;
const reads: string[] = [];

beforeEach(() => {
    window.history.replaceState(null, "", "/bookings?layout=day");
    reads.length = 0;
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    release = open;
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
            reads.push(url);
            await gate;
            const q = new URL(url, "https://x").searchParams;
            return new Response(
                JSON.stringify({
                    calendar: {
                        from: q.get("from"),
                        to: q.get("to"),
                        timezone: IST,
                        money: false,
                        diaries: [],
                    },
                    staff: [],
                    serviceHours: null,
                    googleBusy: null,
                    zone: IST,
                    now: NOW,
                }),
                { status: 200 },
            );
        }),
    );
});
afterEach(() => vi.unstubAllGlobals());

const tick = (ms = 20) => act(() => new Promise((r) => setTimeout(r, ms)));

function open() {
    return renderWithQuery(
        <DiaryContainer
            zone={IST}
            now={NOW}
            userId="u_1"
            opens={OPENS_DEFAULT}
            lastUsed="day"
            services={[]}
            rules={null}
            notices={null}
            limitNotice={null}
            calendarLine={null}
            share={null}
            business="Rye"
            people={{ canSearch: false, payLink: false }}
            can={{ book: true, hours: true }}
            setup={{
                services: [],
                people: { canSearch: false, payLink: false },
                canUsePacks: false,
                business: "Rye",
                meet: false,
                now: NOW,
            }}
            arrival={null}
        />,
    );
}

describe("the diary before its first read", () => {
    it("draws the header and New booking at once, the diary a skeleton, then the day", async () => {
        const { host, unmount } = open();
        await tick();
        expect(host.querySelector("[data-calendar-title]")).not.toBeNull();
        expect(host.querySelector('[aria-label="Next day"]')).not.toBeNull();
        const newBooking = Array.from(host.querySelectorAll("button")).find(
            (b) => b.textContent?.includes("New booking"),
        );
        expect(newBooking?.disabled).toBe(false);
        expect(host.querySelector('[data-shape="diary"]')).not.toBeNull();
        expect(
            host.querySelector(
                '[data-calendar-header] [data-slot="figure-loading"]',
            ),
        ).not.toBeNull();

        release();
        await tick(50);
        expect(host.querySelector('[data-shape="diary"]')).toBeNull();
        expect(host.querySelector('[data-slot="figure-loading"]')).toBeNull();
        unmount();
    });

    it("a step to the next day before the data keys the read", async () => {
        const { unmount } = open();
        await tick();
        const before = reads.length;
        act(() => {
            window.history.pushState(
                null,
                "",
                "/bookings?layout=day&date=2026-10-05",
            );
            window.dispatchEvent(new PopStateEvent("popstate"));
        });
        await tick();
        // Another week: its own read.
        expect(reads.length).toBe(before + 1);
        expect(reads.at(-1)).toContain("week=2026-10-05");
        release();
        unmount();
    });
});
