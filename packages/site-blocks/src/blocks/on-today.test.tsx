import type { RenderedHero } from "@saroh/block-contract";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PageSections } from "../section-renderer";
import HeroSection from "./hero";
import type { PublicToday } from "./on-today";
import OnTodayHero, { isPublicToday, todayHref } from "./on-today";

/** Pulse: Mon–Fri 06:00–21:00, Sat 07:00–13:00, Sun closed. Kolkata. */
const HOURS: PublicToday["hours"] = [
    { day: "MON", open: "06:00", close: "21:00", closed: false },
    { day: "TUE", open: "06:00", close: "21:00", closed: false },
    { day: "WED", open: "06:00", close: "21:00", closed: false },
    { day: "THU", open: "06:00", close: "21:00", closed: false },
    { day: "FRI", open: "06:00", close: "21:00", closed: false },
    { day: "SAT", open: "07:00", close: "13:00", closed: false },
    { day: "SUN", open: "06:00", close: "21:00", closed: true },
];

/** Friday 18 Sep 2026, 10:10 in Bengaluru. */
const FRIDAY_1010 = new Date("2026-09-18T10:10:00+05:30");

const PULSE: PublicToday = {
    timezone: "Asia/Kolkata",
    date: "2026-09-18",
    appointments: true,
    classes: true,
    hours: HOURS,
    closedDates: [],
    items: [
        {
            kind: "one",
            serviceId: "svc_pt",
            serviceName: "Personal training",
            durationMinutes: 45,
            startAt: "2026-09-18T04:45:00.000Z",
            date: "2026-09-18",
            time: "10:15",
            staffName: "Karan",
            placesLeft: null,
        },
        {
            kind: "class",
            serviceId: "svc_hatha",
            serviceName: "Hatha",
            durationMinutes: 60,
            startAt: "2026-09-18T05:30:00.000Z",
            date: "2026-09-18",
            time: "11:00",
            staffName: "Meera",
            placesLeft: 3,
        },
        {
            kind: "class",
            serviceId: "svc_hiit",
            serviceName: "HIIT",
            durationMinutes: 45,
            startAt: "2026-09-18T12:30:00.000Z",
            date: "2026-09-18",
            time: "18:00",
            staffName: "Ritu",
            placesLeft: 0,
        },
    ],
};

const HERO: RenderedHero = {
    heading: "Train with people who know your name",
    subheading: "A neighbourhood gym on 12th Main.",
    cta: { label: "Book a class", href: "/book", style: "primary" },
    onToday: true,
};

describe("On today (G18)", () => {
    const realFetch = globalThis.fetch;
    afterEach(() => {
        globalThis.fetch = realFetch;
    });

    async function renderFetching(
        response: Response | Error,
        siteId: string | null | undefined = "site_pulse",
    ) {
        const fetchMock = vi.fn((_url: string) =>
            response instanceof Error
                ? Promise.reject(response)
                : Promise.resolve(response),
        );
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        const view = render(
            <OnTodayHero
                content={HERO}
                siteId={siteId}
                apiUrl="https://api.test"
                bookHref="/book"
                now={FRIDAY_1010}
            />,
        );
        await act(async () => {
            await Promise.resolve();
        });
        return { ...view, fetchMock };
    }

    function json(body: unknown, status = 200) {
        return new Response(JSON.stringify(body), {
            status,
            headers: { "content-type": "application/json" },
        });
    }

    it("lists 11:00 Hatha with 3 left, beside the headline", () => {
        render(
            <OnTodayHero
                content={HERO}
                today={PULSE}
                bookHref="/book"
                now={FRIDAY_1010}
            />,
        );
        expect(
            screen.getByRole("heading", { name: "On today" }),
        ).toBeInTheDocument();
        expect(screen.getByText("Fri 18 Sep")).toBeInTheDocument();
        const hatha = screen.getByRole("link", { name: /11:00.*Hatha/ });
        expect(hatha).toHaveTextContent("11:00HathaWith Meera3 left");
        expect(
            screen.getByRole("heading", {
                level: 1,
                name: "Train with people who know your name",
            }),
        ).toBeInTheDocument();
    });

    it("shows the time the booking page offers, 10:15, not a rounded one", () => {
        render(<OnTodayHero content={HERO} today={PULSE} bookHref="/book" />);
        expect(
            screen.getByRole("link", { name: /10:15.*Personal training/ }),
        ).toHaveTextContent("Karan · 45 min");
    });

    it("links each time into the booking page with it chosen", () => {
        render(<OnTodayHero content={HERO} today={PULSE} bookHref="/book" />);
        const link = screen.getByRole("link", { name: /10:15/ });
        const url = new URL(link.getAttribute("href") ?? "", "https://x.test");
        expect(url.pathname).toBe("/book");
        expect(Object.fromEntries(url.searchParams)).toEqual({
            service: "svc_pt",
            date: "2026-09-18",
            start: "10:15",
        });
        expect(todayHref("/book", PULSE.items[1])).toBe(
            "/book?service=svc_hatha&date=2026-09-18&start=11%3A00",
        );
    });

    it("says Full for a class with no places left", () => {
        render(<OnTodayHero content={HERO} today={PULSE} bookHref="/book" />);
        expect(
            screen.getByRole("link", { name: /18:00.*HIIT/ }),
        ).toHaveTextContent("Full");
    });

    it("says whether the business is open now", () => {
        render(<OnTodayHero content={HERO} today={PULSE} now={FRIDAY_1010} />);
        expect(
            screen.getByText("Open now · closes 9pm", { exact: false }),
        ).toBeInTheDocument();
    });

    it("says Closed on a day the business marked closed (E3)", () => {
        render(
            <OnTodayHero
                content={HERO}
                today={{ ...PULSE, closedDates: ["2026-09-18"] }}
                now={FRIDAY_1010}
            />,
        );
        expect(screen.getByText("Closed · opens Sat 7am")).toBeInTheDocument();
        expect(screen.queryByText(/Open now/)).toBeNull();
    });

    it("says Free today for a business with appointments and no classes", () => {
        render(
            <OnTodayHero
                content={HERO}
                today={{ ...PULSE, classes: false, items: [PULSE.items[0]] }}
            />,
        );
        expect(
            screen.getByRole("heading", { name: "Free today" }),
        ).toBeInTheDocument();
    });

    it("after closing: Nothing more today · See tomorrow", () => {
        render(
            <OnTodayHero
                content={HERO}
                today={{ ...PULSE, items: [] }}
                bookHref="/book"
            />,
        );
        expect(screen.getByText(/Nothing more today/)).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "See tomorrow" }),
        ).toHaveAttribute("href", "/book");
    });

    it("gives a shop-only business no panel, and still says whether it's open", () => {
        render(
            <OnTodayHero
                content={HERO}
                today={{
                    ...PULSE,
                    appointments: false,
                    classes: false,
                    items: [],
                }}
                now={FRIDAY_1010}
            />,
        );
        expect(screen.queryByRole("heading", { name: "On today" })).toBeNull();
        expect(screen.queryByText(/Nothing more today/)).toBeNull();
        expect(screen.getByText(/Open now · closes 9pm/)).toBeInTheDocument();
    });

    it("says nothing about opening when no hours are saved", () => {
        render(
            <OnTodayHero
                content={HERO}
                today={{ ...PULSE, hours: null }}
                now={FRIDAY_1010}
            />,
        );
        expect(screen.queryByText(/Open now|Closed/)).toBeNull();
    });

    it("draws rows that go nowhere as plain rows, not links", () => {
        render(<OnTodayHero content={HERO} today={PULSE} />);
        expect(screen.queryByRole("link", { name: /Hatha/ })).toBeNull();
        expect(screen.getByText("Hatha")).toBeInTheDocument();
    });

    it("reads the site's today live", async () => {
        const { fetchMock } = await renderFetching(json(PULSE));
        expect(fetchMock).toHaveBeenCalledWith(
            "https://api.test/public/sites/site_pulse/today",
            expect.anything(),
        );
        expect(
            await screen.findByRole("link", { name: /11:00.*Hatha/ }),
        ).toBeInTheDocument();
    });

    it("renders the hero without the panel when the read fails", async () => {
        await renderFetching(json({ message: "boom" }, 500));
        expect(screen.queryByRole("heading", { name: "On today" })).toBeNull();
        expect(screen.queryByText(/Nothing/)).toBeNull();
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
            "Train with people who know your name",
        );
    });

    it("renders the hero without the panel when the network is down", async () => {
        await renderFetching(new Error("offline"));
        expect(screen.queryByRole("heading", { name: "On today" })).toBeNull();
    });

    it("treats a malformed answer as a failure", async () => {
        await renderFetching(json({ items: "nope" }));
        expect(screen.queryByRole("heading", { name: "On today" })).toBeNull();
    });

    it("says what it will show on the editor's canvas, and fetches nothing", async () => {
        const fetchMock = vi.fn();
        globalThis.fetch = fetchMock;
        render(<OnTodayHero content={HERO} apiUrl="https://api.test" />);
        await act(async () => {
            await Promise.resolve();
        });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(
            screen.getByText(
                /classes and free times show here on your live site/,
            ),
        ).toBeInTheDocument();
    });

    it("keeps a hero without the switch exactly as it was", () => {
        const fetchMock = vi.fn();
        globalThis.fetch = fetchMock;
        render(
            <HeroSection
                content={{ ...HERO, onToday: undefined }}
                siteId="site_pulse"
            />,
        );
        expect(fetchMock).not.toHaveBeenCalled();
        expect(screen.queryByText(/On today|Loading/)).toBeNull();
    });

    it("reaches the hero through the page renderer with the site and booking page", async () => {
        const fetchMock = vi.fn((_url: string) => Promise.resolve(json(PULSE)));
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        render(
            <PageSections
                sections={[{ type: "hero", content: HERO }]}
                siteId="site_pulse"
                apiUrl="https://api.test"
                bookHref="/book"
            />,
        );
        expect(
            await screen.findByRole("link", { name: /11:00.*Hatha/ }),
        ).toHaveAttribute(
            "href",
            "/book?service=svc_hatha&date=2026-09-18&start=11%3A00",
        );
    });

    it("narrows the public answer", () => {
        expect(isPublicToday(PULSE)).toBe(true);
        expect(isPublicToday({ ...PULSE, items: [{ kind: "x" }] })).toBe(false);
        expect(isPublicToday(null)).toBe(false);
    });
});
