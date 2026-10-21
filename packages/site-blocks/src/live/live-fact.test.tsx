import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import LookHero from "../blocks/hero-look";
import type { PublicTodayItem } from "../blocks/on-today";
import { LiveFact } from "./live-fact";
import {
    FRESH_FOR_MS,
    liveStatus,
    nextChangeIn,
    POLL_EVERY_MS,
    READ_TIMEOUT_MS,
    showsCount,
    showsValue,
} from "./live-state";
import { checkedWords, nextFreeWhen, placesLeftWords } from "./live-words";
import type { LiveToday } from "./next-free";
import { BarNextFree, HeroNextFree, parseLiveToday } from "./next-free";
import type { LiveRead } from "./use-live-read";
import { resetLiveReads, useLiveRead } from "./use-live-read";

/*
 * Live facts on cached pages (DEC-172, plan U8, #1042): the state machine,
 * its timing (fake timers), the words, and what each state draws. The
 * page-level checks (the cached HTML, layout shift) are the e2e spec's,
 * `e2e/tests/site-live-facts.spec.ts`.
 */

/** Tue 20 Oct 2026, 17:20 in Bengaluru. */
const NOW = new Date("2026-10-20T17:20:00+05:30");

const HATHA_TOMORROW: PublicTodayItem = {
    kind: "class",
    serviceId: "svc_hatha",
    serviceName: "Hatha yoga",
    durationMinutes: 60,
    startAt: "2026-10-21T01:30:00.000Z",
    date: "2026-10-21",
    time: "07:00",
    staffName: "Meera",
    placesLeft: 3,
};

function today(next: PublicTodayItem | null = HATHA_TOMORROW): LiveToday {
    return {
        timezone: "Asia/Kolkata",
        date: "2026-10-20",
        appointments: true,
        classes: true,
        items: [],
        hours: [
            { day: "MON", open: "06:00", close: "21:00", closed: false },
            { day: "TUE", open: "06:00", close: "21:00", closed: false },
            { day: "WED", open: "06:00", close: "21:00", closed: false },
            { day: "THU", open: "06:00", close: "21:00", closed: false },
            { day: "FRI", open: "06:00", close: "21:00", closed: false },
            { day: "SAT", open: "07:00", close: "13:00", closed: false },
            { day: "SUN", open: "07:00", close: "12:00", closed: false },
        ],
        closedDates: [],
        nextFree: next,
    };
}

const fresh = (data: LiveToday = today()): LiveRead<LiveToday> => ({
    status: "fresh",
    data,
    fetchedAt: NOW.getTime(),
});

describe("liveStatus: what a fact may show", () => {
    const at = 1_000_000;

    it("is loading before anything is read", () => {
        expect(liveStatus({ error: false, inFlight: true }, at)).toBe(
            "loading",
        );
    });

    it("is fresh within a minute, refreshing while a new read is out", () => {
        const snap = { data: 1, fetchedAt: at, error: false, inFlight: false };
        expect(liveStatus(snap, at + FRESH_FOR_MS)).toBe("fresh");
        expect(liveStatus({ ...snap, inFlight: true }, at + 5)).toBe(
            "refreshing",
        );
    });

    it("is stale when the answer is older than 60 s", () => {
        const snap = { data: 1, fetchedAt: at, error: false, inFlight: false };
        expect(liveStatus(snap, at + FRESH_FOR_MS + 1)).toBe("stale");
        // Still stale while it checks again, even after a failure.
        expect(
            liveStatus(
                { ...snap, error: true, inFlight: true },
                at + FRESH_FOR_MS + 1,
            ),
        ).toBe("stale");
    });

    it("is failed after an error with nothing fresh to show", () => {
        expect(liveStatus({ error: true, inFlight: false }, at)).toBe("failed");
        expect(
            liveStatus(
                { data: 1, fetchedAt: at, error: true, inFlight: false },
                at + FRESH_FOR_MS + 1,
            ),
        ).toBe("failed");
    });

    it("keeps a fresh answer through one failed read", () => {
        expect(
            liveStatus(
                { data: 1, fetchedAt: at, error: true, inFlight: false },
                at + 30_000,
            ),
        ).toBe("fresh");
    });

    it("says when the clock alone will turn it stale", () => {
        const snap = { data: 1, fetchedAt: at, error: false, inFlight: false };
        expect(nextChangeIn(snap, at)).toBe(FRESH_FOR_MS + 1);
        expect(nextChangeIn(snap, at + FRESH_FOR_MS + 5)).toBeNull();
        expect(nextChangeIn({ error: false, inFlight: false }, at)).toBeNull();
    });

    it("shows a count only while fresh; a time also while stale", () => {
        expect(showsCount("fresh")).toBe(true);
        expect(showsCount("refreshing")).toBe(true);
        expect(showsCount("stale")).toBe(false);
        expect(showsValue("stale")).toBe(true);
        expect(showsValue("loading")).toBe(false);
        expect(showsValue("failed")).toBe(false);
    });
});

describe("the words", () => {
    it("says places left only at 5 or fewer, and never a full class", () => {
        expect(placesLeftWords(6)).toBeNull();
        expect(placesLeftWords(5)).toBe("5 places left");
        expect(placesLeftWords(3, { short: true })).toBe("3 left");
        expect(placesLeftWords(1)).toBe("Last place");
        expect(placesLeftWords(0)).toBeNull();
        expect(placesLeftWords(null)).toBeNull();
    });

    it("says when on the business's calendar", () => {
        const at = (date: string) => ({ date, time: "18:00" });
        expect(nextFreeWhen(at("2026-10-20"), "2026-10-20")).toBe(
            "today, 6:00 pm",
        );
        expect(nextFreeWhen(at("2026-10-21"), "2026-10-20")).toBe(
            "tomorrow, 6:00 pm",
        );
        expect(nextFreeWhen(at("2026-10-22"), "2026-10-20")).toBe(
            "Thu 22 Oct, 6:00 pm",
        );
        // Across a month's end.
        expect(nextFreeWhen(at("2026-11-01"), "2026-10-31")).toBe(
            "tomorrow, 6:00 pm",
        );
    });

    it("says when it was checked, on the business's clock", () => {
        expect(checkedWords(NOW.getTime(), "Asia/Kolkata")).toBe(
            "Checked 5:20 pm",
        );
    });
});

describe("parseLiveToday", () => {
    it("reads an API from before U8 (no nextFree) as nothing free", () => {
        const { nextFree: _, ...old } = today();
        expect(parseLiveToday(old)?.nextFree).toBeNull();
    });

    it("refuses a malformed next free", () => {
        expect(parseLiveToday({ ...today(), nextFree: { kind: "x" } })).toBe(
            undefined,
        );
        expect(parseLiveToday({ nope: true })).toBe(undefined);
    });
});

/** The one live fact drawn. */
function theFact(): Element {
    const el = document.querySelector("[data-live-fact]");
    if (!el) throw new Error("no live fact drawn");
    return el;
}

/* ---------------------------------------------------------------- */
/* The read: timing, with fake timers.                              */
/* ---------------------------------------------------------------- */

const URL_ = "https://api.example.com/public/sites/site_1/today";

function Probe({ url = URL_ }: { url?: string | null }) {
    const read = useLiveRead(url, (body) =>
        typeof body === "object" && body !== null
            ? (body as { n: number })
            : undefined,
    );
    return (
        <LiveFact
            read={read}
            pick={(d) => d}
            reserve="min-h-[40px]"
            fresh={(d) => <span>value {d.n}</span>}
            fallback={<span>See times</span>}
        />
    );
}

let visibility: DocumentVisibilityState = "visible";

function setVisibility(next: DocumentVisibilityState) {
    visibility = next;
    document.dispatchEvent(new Event("visibilitychange"));
}

function okResponse(body: unknown) {
    return Promise.resolve(
        new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
        }),
    );
}

describe("useLiveRead: reads in view, once a minute, one read per address", () => {
    const realFetch = globalThis.fetch;
    let fetchMock: Mock<typeof fetch>;
    let n = 0;

    beforeEach(() => {
        vi.useFakeTimers({ now: NOW });
        visibility = "visible";
        Object.defineProperty(document, "visibilityState", {
            configurable: true,
            get: () => visibility,
        });
        n = 0;
        fetchMock = vi.fn<typeof fetch>(() => okResponse({ n: ++n }));
        globalThis.fetch = fetchMock;
    });

    afterEach(() => {
        resetLiveReads();
        vi.useRealTimers();
        globalThis.fetch = realFetch;
    });

    it("reads once on mount, no-store, then every minute while visible", async () => {
        render(<Probe />);
        await act(() => vi.advanceTimersByTimeAsync(0));
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
            cache: "no-store",
        });
        expect(screen.getByText("value 1")).toBeInTheDocument();
        await act(() => vi.advanceTimersByTimeAsync(POLL_EVERY_MS));
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(screen.getByText("value 2")).toBeInTheDocument();
    });

    it("polls once a minute, and keeps a count up until the next answer is late (review #4)", () => {
        expect(POLL_EVERY_MS).toBe(60_000);
        expect(FRESH_FOR_MS).toBeGreaterThan(POLL_EVERY_MS + READ_TIMEOUT_MS);
    });

    it("stops while the page is hidden, and reads once when it is shown", async () => {
        render(<Probe />);
        await act(() => vi.advanceTimersByTimeAsync(0));
        expect(fetchMock).toHaveBeenCalledTimes(1);
        act(() => setVisibility("hidden"));
        await act(() => vi.advanceTimersByTimeAsync(5 * POLL_EVERY_MS));
        expect(fetchMock).toHaveBeenCalledTimes(1);
        act(() => setVisibility("visible"));
        await act(() => vi.advanceTimersByTimeAsync(0));
        expect(fetchMock).toHaveBeenCalledTimes(2);
        // And polls again from there.
        await act(() => vi.advanceTimersByTimeAsync(POLL_EVERY_MS));
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("waits for a page opened in a background tab to be shown", async () => {
        visibility = "hidden";
        render(<Probe />);
        await act(() => vi.advanceTimersByTimeAsync(3 * POLL_EVERY_MS));
        expect(fetchMock).not.toHaveBeenCalled();
        act(() => setVisibility("visible"));
        await act(() => vi.advanceTimersByTimeAsync(0));
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("hides a value that is older than 75 s while it checks again", async () => {
        render(<Probe />);
        await act(() => vi.advanceTimersByTimeAsync(0));
        expect(screen.getByText("value 1")).toBeInTheDocument();
        // The next reads never answer.
        fetchMock.mockImplementation(
            () => new Promise<Response>(() => undefined),
        );
        act(() => setVisibility("hidden"));
        await act(() => vi.advanceTimersByTimeAsync(FRESH_FOR_MS + 1));
        expect(screen.queryByText("value 1")).toBeNull();
        expect(
            document
                .querySelector("[data-live-fact]")
                ?.getAttribute("data-live-state"),
        ).toBe("stale");
        // Its box stays.
        expect(document.querySelector("[data-live-fact]")).toHaveClass(
            "min-h-[40px]",
        );
    });

    it("shares one read between every fact on the address", async () => {
        render(
            <>
                <Probe />
                <Probe />
            </>,
        );
        await act(() => vi.advanceTimersByTimeAsync(0));
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(screen.getAllByText("value 1")).toHaveLength(2);
        await act(() => vi.advanceTimersByTimeAsync(POLL_EVERY_MS));
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("stops for good when the last fact goes", async () => {
        const { unmount } = render(<Probe />);
        await act(() => vi.advanceTimersByTimeAsync(0));
        unmount();
        await act(() => vi.advanceTimersByTimeAsync(5 * POLL_EVERY_MS));
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("falls back on a 500, keeping the box", async () => {
        fetchMock.mockImplementation(() =>
            Promise.resolve(new Response("no", { status: 500 })),
        );
        render(<Probe />);
        await act(() => vi.advanceTimersByTimeAsync(0));
        const box = document.querySelector("[data-live-fact]");
        expect(box?.getAttribute("data-live-state")).toBe("failed");
        expect(box).toHaveClass("min-h-[40px]");
        expect(screen.getByText("See times")).toBeInTheDocument();
        expect(box?.textContent).not.toMatch(/\d/);
    });

    it("falls back when a read takes longer than 8 s", async () => {
        fetchMock.mockImplementation(
            () => new Promise<Response>(() => undefined),
        );
        render(<Probe />);
        await act(() => vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS - 1));
        expect(
            document
                .querySelector("[data-live-fact]")
                ?.getAttribute("data-live-state"),
        ).toBe("loading");
        await act(() => vi.advanceTimersByTimeAsync(2));
        expect(
            document
                .querySelector("[data-live-fact]")
                ?.getAttribute("data-live-state"),
        ).toBe("failed");
        expect(screen.getByText("See times")).toBeInTheDocument();
    });

    it("treats a bad answer as failed, never as an empty value", async () => {
        fetchMock.mockImplementation(() => okResponse("not an object"));
        render(<Probe />);
        await act(() => vi.advanceTimersByTimeAsync(0));
        expect(screen.getByText("See times")).toBeInTheDocument();
    });

    it("reads nothing where no site is live", async () => {
        render(<Probe url={null} />);
        await act(() => vi.advanceTimersByTimeAsync(POLL_EVERY_MS));
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

/* ---------------------------------------------------------------- */
/* What each state draws.                                           */
/* ---------------------------------------------------------------- */

describe("LiveFact", () => {
    it("draws a reserved box with no text while loading", () => {
        render(
            <LiveFact
                read={{ status: "loading" }}
                pick={(d: number) => d}
                reserve="min-h-[72px]"
                fresh={(d) => <span>{d}</span>}
            />,
        );
        const box = theFact();
        expect(box).toHaveClass("min-h-[72px]");
        expect(box.textContent).toBe("");
        expect(box.getAttribute("aria-busy")).toBe("true");
    });

    it("draws the value from a 200", () => {
        render(
            <LiveFact
                read={{ status: "fresh", data: 4, fetchedAt: 1 }}
                pick={(d: number) => d}
                reserve="min-h-[72px]"
                fresh={(d) => <span>{d} places</span>}
            />,
        );
        expect(screen.getByText("4 places")).toBeInTheDocument();
    });

    it("says nothing for an answer older than its window, unless told how", () => {
        const { container, rerender } = render(
            <LiveFact
                read={{ status: "stale", data: 4, fetchedAt: 1 }}
                pick={(d: number) => d}
                reserve="min-h-[72px]"
                fresh={(d) => <span>{d} places</span>}
            />,
        );
        expect(container.textContent).toBe("");
        rerender(
            <LiveFact
                read={{ status: "stale", data: 4, fetchedAt: 1 }}
                pick={(d: number) => d}
                reserve="min-h-[72px]"
                fresh={(d) => <span>{d} places</span>}
                stale={() => <span>a class</span>}
            />,
        );
        expect(container.textContent).toBe("a class");
    });

    it("falls back when the answer has nothing to say (unknown)", () => {
        render(
            <LiveFact
                read={{ status: "fresh", data: 4, fetchedAt: 1 }}
                pick={() => null}
                reserve="min-h-[72px]"
                fresh={() => <span>value</span>}
                fallback={<a href="/book">See times</a>}
            />,
        );
        expect(
            document
                .querySelector("[data-live-fact]")
                ?.getAttribute("data-live-state"),
        ).toBe("unknown");
        expect(screen.getByText("See times")).toBeInTheDocument();
    });
});

describe("the hero's Next free", () => {
    const fallback = <a href="/book">See times</a>;

    it("says what, when and a small true count, and links to that time", () => {
        render(
            <HeroNextFree
                look="quiet"
                bookHref="/book"
                fallback={fallback}
                read={fresh()}
            />,
        );
        const box = theFact();
        expect(box.textContent).toContain("Next free");
        expect(box.textContent).toContain("Hatha yoga");
        expect(box.textContent).toContain("tomorrow, 7:00 am");
        expect(box.textContent).toContain("3 places left");
        const link = screen.getByRole("link", { name: "Book this class" });
        expect(link.getAttribute("href")).toBe(
            "/book?service=svc_hatha&date=2026-10-21&start=07%3A00",
        );
    });

    it("says nothing about places when more than 5 are free", () => {
        render(
            <HeroNextFree
                look="folio"
                bookHref="/book"
                fallback={fallback}
                read={fresh(today({ ...HATHA_TOMORROW, placesLeft: 6 }))}
            />,
        );
        expect(document.querySelector("[data-live-count]")).toBeNull();
        expect(screen.queryByText(/places? left/)).toBeNull();
    });

    it("says Last place, in the accent's text colour, for one", () => {
        render(
            <HeroNextFree
                look="folio"
                bookHref="/book"
                fallback={fallback}
                read={fresh(today({ ...HATHA_TOMORROW, placesLeft: 1 }))}
            />,
        );
        const count = screen.getByText("Last place");
        expect(count).toHaveClass("text-site-accent-text");
    });

    it("keeps the time and hides the count once the answer is old", () => {
        render(
            <HeroNextFree
                look="quiet"
                bookHref="/book"
                fallback={fallback}
                read={{ ...fresh(), status: "stale" }}
            />,
        );
        expect(screen.getByText(/tomorrow, 7:00 am/)).toBeInTheDocument();
        expect(document.querySelector("[data-live-count]")).toBeNull();
    });

    it("keeps See times while loading, when it fails and when nothing is free", () => {
        for (const read of [
            { status: "loading" } as const,
            { status: "failed" } as const,
            fresh(today(null)),
        ]) {
            const { unmount } = render(
                <HeroNextFree
                    look="quiet"
                    bookHref="/book"
                    fallback={fallback}
                    read={read}
                />,
            );
            expect(screen.getByText("See times")).toBeInTheDocument();
            expect(
                document.querySelector("[data-live-fact]")?.textContent,
            ).not.toMatch(/\d/);
            unmount();
        }
    });

    it("keeps one height in every state, per look", () => {
        for (const look of ["folio", "quiet", "live"] as const) {
            const heights = (
                [
                    { status: "loading" },
                    fresh(),
                    { ...fresh(), status: "stale" },
                    { status: "failed" },
                ] as LiveRead<LiveToday>[]
            ).map((read) => {
                const { unmount } = render(
                    <HeroNextFree
                        look={look}
                        bookHref="/book"
                        fallback={fallback}
                        read={read}
                    />,
                );
                const cls = Array.from(theFact().classList).find((c) =>
                    c.startsWith("min-h-"),
                );
                unmount();
                return cls;
            });
            expect(new Set(heights).size).toBe(1);
            expect(heights[0]).toBeDefined();
        }
    });

    it("draws Live's Now strip: the time, a short count, open and checked", () => {
        vi.useFakeTimers({ now: NOW });
        try {
            render(
                <HeroNextFree
                    look="live"
                    bookHref="/book"
                    fallback={fallback}
                    read={fresh(
                        today({
                            ...HATHA_TOMORROW,
                            serviceName: "Vinyasa flow",
                            date: "2026-10-20",
                            time: "18:00",
                            startAt: "2026-10-20T12:30:00.000Z",
                        }),
                    )}
                />,
            );
            const box = theFact();
            expect(box.textContent).toContain("6:00 pm Vinyasa flow");
            expect(box.textContent).toContain("3 left");
            expect(box.textContent).toContain("Open now · closes 9pm");
            expect(box.textContent).toContain("Checked 5:20 pm");
        } finally {
            vi.useRealTimers();
        }
    });

    it("sends no time and no count in the server's HTML (the cached page)", () => {
        const html = renderToString(
            <HeroNextFree
                look="live"
                siteId="site_1"
                apiUrl="https://api.example.com"
                bookHref="/book"
                fallback={fallback}
            />,
        );
        expect(html).toContain('data-live-state="loading"');
        expect(html).toContain("See times");
        expect(html.replace(/<[^>]+>/g, " ")).not.toMatch(/\d/);
    });
});

describe("the Book bar's Next free", () => {
    it("says the next free time while it can", () => {
        render(<BarNextFree read={fresh()} />);
        expect(
            screen.getByText("Next free: tomorrow, 7:00 am"),
        ).toBeInTheDocument();
    });

    it("is empty at the same height while loading or failed, in the server's HTML too", () => {
        render(<BarNextFree read={{ status: "failed" }} />);
        const box = theFact();
        expect(box.textContent).toBe("");
        expect(box).toHaveClass("min-h-[18px]");
        const html = renderToString(<BarNextFree siteId="site_1" />);
        expect(html.replace(/<[^>]+>/g, " ")).not.toMatch(/\d/);
    });
});

describe("the look hero's slot (U6's data-site-next-free)", () => {
    it("is filled by Next free on a live site, See times in the cached HTML", () => {
        for (const look of ["folio", "quiet", "live"] as const) {
            const html = renderToString(
                <LookHero
                    look={look}
                    content={{
                        heading: "Yoga at your pace",
                        cta: {
                            label: "Book a class",
                            href: "/book",
                            style: "primary",
                        },
                    }}
                    frontDoor={{ kind: "book", href: "/book" }}
                    siteId="site_1"
                    apiUrl="https://api.example.com"
                />,
            );
            const slot =
                /data-site-next-free=""[\s\S]*?data-live-state="loading"[\s\S]*?See times/.exec(
                    html,
                );
            expect(slot, look).not.toBeNull();
            expect(html.replace(/<[^>]+>/g, " "), look).not.toMatch(/\d/);
        }
    });

    it("keeps the plain See times where no site is live (the editor)", () => {
        const html = renderToString(
            <LookHero
                look="quiet"
                content={{ heading: "Yoga" }}
                frontDoor={{ kind: "book", href: "/book" }}
            />,
        );
        expect(html).toContain("See times");
        expect(html).not.toContain("data-live-fact");
    });
});
