import type {
    RenderedFeatures,
    RenderedTimetable,
} from "@saroh/block-contract";
import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PublicVisit } from "../lib/public-visit";
import type { PublicTimetable, TimetableSession } from "../lib/timetable-read";
import FeaturesSection from "./features";
import TimetableSection from "./timetable";
import VisitUsSection from "./visit-us";

/** One class, at `time` on `date` in Mumbai. */
function at(
    date: string,
    time: string,
    name: string,
    placesLeft: number,
): TimetableSession {
    return {
        serviceId: `svc-${name}`,
        serviceName: name,
        durationMinutes: 60,
        startAt: new Date(`${date}T${time}:00+05:30`).toISOString(),
        date,
        time,
        staffName: "Kabir",
        placesLeft,
        capacity: 12,
    };
}

const DAYS = Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2026, 10, 17 + i)).toISOString().slice(0, 10),
);

/** Prana's week from Tue 17 Nov: two done by 4:10 pm, Sunday closed. */
const WEEK: PublicTimetable = {
    timezone: "Asia/Kolkata",
    days: DAYS,
    sessions: [
        at("2026-11-17", "06:00", "Pranayama", 9),
        at("2026-11-17", "07:00", "Hatha yoga", 9),
        at("2026-11-17", "18:00", "Vinyasa flow", 3),
        at("2026-11-17", "19:30", "Live online", 12),
        at("2026-11-18", "06:00", "Strength", 4),
        at("2026-11-18", "18:00", "Foundations", 0),
        at("2026-11-19", "07:00", "Mobility", 1),
    ],
};

/** Tue 17 Nov, 4:10 pm in Mumbai. */
const TUE_4PM = new Date("2026-11-17T16:10:00+05:30");

const TODAY: RenderedTimetable = {
    variant: "today",
    title: "Next classes",
    placesFrom: 3,
};

describe("Timetable Today (U6)", () => {
    it("the cached HTML carries the week and no today-specific words", () => {
        for (const look of [undefined, "folio", "quiet", "live"] as const) {
            const html = renderToString(
                <TimetableSection
                    content={TODAY}
                    timetable={WEEK}
                    bookHref="/book"
                    look={look}
                />,
            );
            expect(html).toContain("Tue 17 Nov · 6:00 am");
            expect(html).not.toMatch(/Today|Tomorrow|Now \d|Done|Closed today/);
        }
    });

    it("in the browser: skips what started, marks Today, Tomorrow and Now", () => {
        render(
            <TimetableSection
                content={TODAY}
                timetable={WEEK}
                bookHref="/book"
                now={TUE_4PM}
            />,
        );
        expect(screen.queryByText("Pranayama")).toBeNull();
        expect(screen.getByText("Today · 6:00 pm")).toBeTruthy();
        expect(screen.getByText("Tomorrow · 6:00 am")).toBeTruthy();
        expect(screen.getByText("Now 4:10 pm")).toBeTruthy();
        expect(
            screen.getByRole("link", { name: "The whole week" }),
        ).toHaveAttribute("href", "/book");
        // The day line is polite live text, never assertive.
        expect(screen.getByRole("status")).toHaveAttribute(
            "aria-live",
            "polite",
        );
    });

    it("places from 3: 4 left says Open, 3 left says so, full offers the waitlist", () => {
        render(
            <TimetableSection
                content={TODAY}
                timetable={WEEK}
                bookHref="/book"
                now={TUE_4PM}
            />,
        );
        const cards = screen
            .getAllByRole("listitem")
            .map((li) => li.textContent);
        expect(cards[0]).toContain("3 left");
        expect(cards[2]).toMatch(/Strength.*Open/);
        expect(cards[3]).toMatch(/Foundations.*Full.*Join waitlist/);
        expect(
            screen.getByRole("link", {
                name: /Join the waitlist: Foundations/,
            }),
        ).toHaveAttribute("href", expect.stringContaining("step=when"));
    });

    it("with no classes today, shows the next and reads Closed", () => {
        render(
            <TimetableSection
                content={TODAY}
                timetable={WEEK}
                bookHref="/book"
                look="live"
                now={new Date("2026-11-22T09:00:00+05:30")}
            />,
        );
        expect(screen.getByText("Closed today")).toBeTruthy();
        expect(screen.getByText("No more classes this week.")).toBeTruthy();
    });

    it("Day by day: Done and the now line only once the clock is read", () => {
        const list: RenderedTimetable = { variant: "list" };
        const cached = renderToString(
            <TimetableSection
                content={list}
                timetable={WEEK}
                bookHref="/book"
            />,
        );
        expect(cached).not.toMatch(/Done|Now \d/);
        render(
            <TimetableSection
                content={list}
                timetable={WEEK}
                bookHref="/book"
                now={TUE_4PM}
            />,
        );
        expect(screen.getAllByText("Done")).toHaveLength(2);
        expect(screen.getByText("Now 4:10 pm")).toBeTruthy();
        // A done class is no longer a way to book.
        expect(screen.queryByRole("link", { name: /Pranayama/ })).toBeNull();
    });
});

const CRUST: PublicVisit = {
    source: "storefront",
    storeId: "store_hill",
    name: "Hill Road",
    address: "14 Hill Road, Bandra West\nMumbai 400050",
    phone: "+910000001004",
    hours: [
        { day: "MON", open: "07:00", close: "19:00", closed: true },
        { day: "TUE", open: "07:00", close: "19:00", closed: false },
        { day: "WED", open: "07:00", close: "19:00", closed: false },
        { day: "THU", open: "07:00", close: "19:00", closed: false },
        { day: "FRI", open: "07:00", close: "19:00", closed: false },
        { day: "SAT", open: "07:00", close: "19:00", closed: false },
        { day: "SUN", open: "07:00", close: "19:00", closed: false },
    ],
    timezone: "Asia/Kolkata",
};

describe("Visit us With map (U6)", () => {
    const MAP = {
        variant: "map",
        title: "Find us",
        extraLine: "Parking at the back",
    };

    it("the cached HTML carries the week, no Today and no Open now", () => {
        for (const content of [MAP, { title: "Find us" }]) {
            for (const look of [undefined, "folio", "live"] as const) {
                const html = renderToString(
                    <VisitUsSection
                        content={content}
                        visit={CRUST}
                        look={look}
                    />,
                );
                expect(html).toMatch(/Tue(sday)?/);
                expect(html).not.toMatch(/Today|today|Open now|Closed today/);
            }
        }
    });

    it("in the browser: Today badge, Open now, the extra line, Directions and Call", () => {
        render(<VisitUsSection content={MAP} visit={CRUST} now={TUE_4PM} />);
        expect(screen.getByText("Today")).toBeTruthy();
        expect(screen.getByText(/Open now/)).toBeTruthy();
        expect(screen.getByText("Parking at the back")).toBeTruthy();
        expect(screen.getByRole("link", { name: "Directions" })).toBeTruthy();
        expect(screen.getByRole("link", { name: /^Call/ })).toBeTruthy();
    });

    it("with no address, keeps the way to talk and no Directions", () => {
        render(
            <VisitUsSection
                content={MAP}
                visit={{ ...CRUST, address: null, hours: null }}
                now={TUE_4PM}
            />,
        );
        expect(screen.queryByRole("link", { name: "Directions" })).toBeNull();
        expect(screen.getByRole("link", { name: /^Call/ })).toBeTruthy();
    });
});

describe("Highlights Band (U6)", () => {
    it("draws the facts on the band colour; no points, no section", () => {
        const band: RenderedFeatures = {
            variant: "band",
            heading: "Before you come in",
            items: [
                {
                    title: "Ten minutes",
                    body: "We hold a chair for ten minutes.",
                },
            ],
        };
        const { container } = render(<FeaturesSection content={band} />);
        const section = container.querySelector("[data-features-band]");
        expect(section?.className).toContain("bg-site-cta-bg");
        expect(
            screen.getByRole("heading", { name: "Ten minutes" }),
        ).toBeTruthy();
        const empty = render(
            <FeaturesSection content={{ ...band, items: [{ title: " " }] }} />,
        );
        expect(empty.container.innerHTML).toBe("");
    });
});
