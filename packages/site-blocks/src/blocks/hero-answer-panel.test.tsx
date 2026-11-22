import type { RenderedHero } from "@saroh/block-contract";
import { SAME_DAY_CALL_WORDS } from "@saroh/block-contract";
import { render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resetLiveReads } from "../live/use-live-read";
import HeroSection from "./hero";
import { consultationService } from "./hero-answer-panel";
import PlainHero from "./hero-plain";
import type { PublicToday, PublicTodayItem } from "./on-today";

/*
 * The hero's Answer panel (U4, R7, R18): each kind, its fallbacks, and that
 * the cached page carries no time.
 */

const HOURS: PublicToday["hours"] = [
    { day: "MON", open: "06:00", close: "21:00", closed: false },
    { day: "TUE", open: "06:00", close: "21:00", closed: false },
    { day: "WED", open: "06:00", close: "21:00", closed: false },
    { day: "THU", open: "06:00", close: "21:00", closed: false },
    { day: "FRI", open: "06:00", close: "21:00", closed: false },
    { day: "SAT", open: "07:00", close: "13:00", closed: false },
    { day: "SUN", open: "06:00", close: "21:00", closed: true },
];

function cls(time: string, name: string, left: number): PublicTodayItem {
    return {
        kind: "class",
        serviceId: `svc_${name}`,
        serviceName: name,
        durationMinutes: 60,
        startAt: `2026-09-18T${time}:00.000+05:30`,
        date: "2026-09-18",
        time,
        staffName: "Kabir",
        placesLeft: left,
    };
}

function day(items: PublicTodayItem[]): PublicToday {
    return {
        timezone: "Asia/Kolkata",
        date: "2026-09-18",
        appointments: true,
        classes: true,
        hours: HOURS,
        closedDates: [],
        items,
    };
}

const NOW = new Date("2026-09-18T10:10:00+05:30");

function hero(panel: RenderedHero["panel"], more: Partial<RenderedHero> = {}) {
    return {
        variant: "answer",
        heading: "Breathe first. Then move.",
        subheading: "Hatha, flow and pranayama.",
        panel,
        ...more,
    } as RenderedHero;
}

afterEach(() => {
    vi.unstubAllGlobals();
    resetLiveReads();
});

describe("Answer panel · Today", () => {
    it("shows today's classes with their places and Book", () => {
        render(
            <HeroSection
                content={hero({ kind: "today" })}
                today={day([
                    cls("18:00", "Vinyasa flow", 3),
                    cls("19:30", "Live online", 12),
                ])}
                now={NOW}
                bookHref="/book"
            />,
        );
        expect(
            screen.getByRole("heading", { level: 2, name: "On today" }),
        ).toBeTruthy();
        expect(screen.getByText("3 left")).toBeTruthy();
        // More than the shown-at number says nothing of a count.
        expect(screen.getByText("Open")).toBeTruthy();
        expect(
            screen
                .getByRole("link", { name: "Book Vinyasa flow at 6:00 pm" })
                .getAttribute("href"),
        ).toContain("/book?service=svc_Vinyasa+flow");
        expect(
            screen.getByRole("link", { name: /The whole week/ }),
        ).toBeTruthy();
    });

    it("says Full today and points to the week when every class is full", () => {
        render(
            <HeroSection
                content={hero({ kind: "today" })}
                today={day([
                    cls("18:00", "Vinyasa flow", 0),
                    cls("19:30", "Live online", 0),
                ])}
                now={NOW}
                bookHref="/book"
            />,
        );
        expect(screen.getAllByText("Full")).toHaveLength(2);
        expect(screen.getByText(/Full today/)).toBeTruthy();
        expect(
            screen
                .getByRole("link", { name: "see the week" })
                .getAttribute("href"),
        ).toBe("/book");
        expect(screen.queryByRole("link", { name: /^Book / })).toBeNull();
    });

    it("keeps See times when /today fails", async () => {
        const fetch = vi
            .fn()
            .mockResolvedValue(new Response("no", { status: 500 }));
        vi.stubGlobal("fetch", fetch);
        render(
            <HeroSection
                content={hero({ kind: "today" })}
                siteId="site_1"
                apiUrl="https://api.test"
                bookHref="/book"
            />,
        );
        await waitFor(() => expect(fetch).toHaveBeenCalled());
        await waitFor(() =>
            expect(
                document.querySelector('[data-live-state="failed"]'),
            ).not.toBeNull(),
        );
        expect(
            screen
                .getByRole("link", { name: "See times" })
                .getAttribute("href"),
        ).toBe("/book");
        expect(document.body.textContent).not.toMatch(/\d:\d\d [ap]m/);
    });

    it("the cached page carries See times, never a time or Open now", () => {
        const html = renderToString(
            <HeroSection
                content={hero({ kind: "today" }, { answerRow: true })}
                siteId="site_1"
                bookHref="/book"
            />,
        );
        expect(html).toContain("See times");
        expect(html).not.toMatch(/Open now|Closed today|\d:\d\d [ap]m/);
        // Live words are polite, never assertive.
        expect(html).toContain('aria-live="polite"');
        expect(html).not.toContain("assertive");
    });
});

describe("Answer panel · Consultation", () => {
    it("shows the booking page's one-to-one service, its price and length", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                Response.json({
                    open: true,
                    services: [
                        {
                            id: "c1",
                            kind: "class",
                            name: "Group",
                            durationMinutes: 60,
                            priceCents: 50000,
                            currency: "INR",
                        },
                        {
                            id: "s1",
                            kind: "one",
                            name: "First consultation",
                            durationMinutes: 45,
                            priceCents: 250000,
                            currency: "INR",
                            gst: null,
                        },
                    ],
                }),
            ),
        );
        render(
            <HeroSection
                content={hero({ kind: "consultation" })}
                siteId="site_1"
                apiUrl="https://api.test"
                bookHref="/book"
            />,
        );
        expect(
            await screen.findByRole("heading", { name: "First consultation" }),
        ).toBeTruthy();
        expect(screen.getByText("45 min")).toBeTruthy();
        expect(screen.getByText(/2,500/)).toBeTruthy();
        expect(
            screen
                .getByRole("link", { name: "Book a consultation" })
                .getAttribute("href"),
        ).toBe("/book?service=s1");
    });

    it("falls back to the Centered hero when the service is gone", async () => {
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValue(Response.json({ open: true, services: [] })),
        );
        render(
            <HeroSection
                content={hero({ kind: "consultation" })}
                siteId="site_1"
                apiUrl="https://api.test"
                bookHref="/book"
            />,
        );
        await waitFor(() =>
            expect(
                document.querySelector("[data-site-answer-hero]"),
            ).toBeNull(),
        );
        expect(
            screen.getByRole("heading", {
                level: 1,
                name: "Breathe first. Then move.",
            }),
        ).toBeTruthy();
    });

    it("reads a booking page without a one-to-one service as none", () => {
        expect(consultationService({ open: false, services: [] })).toBeNull();
        expect(consultationService({ nope: true })).toBeUndefined();
    });
});

describe("Answer panel · Same-day call", () => {
    it("says the default words, never emergency, and calls on a 44px target", () => {
        expect(SAME_DAY_CALL_WORDS.toLowerCase()).not.toContain("emergency");
        render(
            <HeroSection
                content={hero({ kind: "sameDayCall", phone: "+910000001001" })}
            />,
        );
        expect(
            screen.getByRole("heading", { name: SAME_DAY_CALL_WORDS }),
        ).toBeTruthy();
        const call = screen.getByRole("link", { name: /Call/ });
        expect(call.getAttribute("href")).toBe("tel:+910000001001");
        expect(call.className).toContain("min-h-11");
        expect(document.body.textContent.toLowerCase()).not.toContain(
            "emergency",
        );
    });

    it("falls back to Centered when the business has no phone either", () => {
        render(
            <HeroSection
                content={hero({ kind: "sameDayCall" })}
                visit={{
                    source: "business",
                    storeId: null,
                    name: "Kavi Dental",
                    address: null,
                    phone: null,
                    hours: null,
                    timezone: "Asia/Kolkata",
                }}
            />,
        );
        expect(document.querySelector("[data-site-answer-hero]")).toBeNull();
    });
});

describe("Answer panel · Pickup", () => {
    it("shows the owner's order-by and where", () => {
        render(
            <HeroSection
                content={hero({
                    kind: "pickup",
                    orderBy: "Order by 8 pm, collect tomorrow",
                    where: "14 Hill Road, Bandra West",
                })}
            />,
        );
        expect(
            screen.getByText("Order by 8 pm, collect tomorrow"),
        ).toBeTruthy();
        expect(screen.getByText("14 Hill Road, Bandra West")).toBeTruthy();
    });

    it("with no words, draws the Centered hero", () => {
        render(<HeroSection content={hero({ kind: "pickup" })} />);
        expect(document.querySelector("[data-site-answer-hero]")).toBeNull();
    });
});

describe("Existing heroes", () => {
    it("with no panel, row or byline render exactly as before", () => {
        const content = {
            heading: "Bread worth the walk",
            subheading: "A small bakery on Hill Road.",
            cta: { label: "Order", href: "/shop", style: "primary" },
        } as RenderedHero;
        const ours = render(<HeroSection content={content} />).container
            .innerHTML;
        const before = render(<PlainHero content={content} />).container
            .innerHTML;
        expect(ours).toBe(before);
    });
});

describe("Under a look", () => {
    it("draws the panel in the look's card, and a look hero carries the row and byline", () => {
        render(
            <HeroSection
                look="quiet"
                content={hero({
                    kind: "pickup",
                    orderBy: "Order by 9 pm for tomorrow",
                })}
            />,
        );
        expect(
            document.querySelector('[data-site-answer-panel="pickup"]')
                ?.className,
        ).toContain("rounded-site-photo");
        render(
            <HeroSection
                look="folio"
                content={{
                    heading: "Suits, cut to fit",
                    answerRow: true,
                    byline: { name: "Gurpreet Sandhu" },
                }}
            />,
        );
        expect(
            document.querySelector(
                "[data-site-look-hero] [data-site-answer-row]",
            ),
        ).not.toBeNull();
        expect(screen.getByText("Gurpreet Sandhu")).toBeTruthy();
    });
});
