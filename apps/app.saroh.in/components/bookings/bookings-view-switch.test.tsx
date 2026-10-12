import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BookingsViewSwitch } from "./bookings-view-switch";

/**
 * Bookings' one view switch: the calendar by day, by week or as an agenda,
 * and the list, are four views of the same bookings. The calendar and the
 * list both carry it, each marking itself and linking to the others. It was
 * two switches side by side (Calendar | List, then the layout).
 */
describe("the bookings view switch", () => {
    // The opening tag of the link to an address, found by plain text: an
    // address is never made into a pattern.
    const link = (html: string, href: string) =>
        html
            .split("<a ")
            .slice(1)
            .map((rest) => `<a ${rest.slice(0, rest.indexOf(">") + 1)}`)
            .find((tag) => tag.includes(`href="${href}"`)) ?? "";

    it("is one switch, with the list as its fourth view", () => {
        const html = renderToStaticMarkup(<BookingsViewSwitch current="day" />);
        expect(html.match(/data-segmented/g)).toHaveLength(1);
        expect(html).toContain('aria-label="Bookings view"');
        expect(html.match(/<a /g)).toHaveLength(4);
        expect(html).toContain("Day by person");
        expect(html).toContain(">Week<");
        expect(html).toContain(">Agenda<");
        expect(html).toContain(">List<");
    });

    it("marks the calendar's layout and links to the list", () => {
        const html = renderToStaticMarkup(
            <BookingsViewSwitch current="week" date="2026-09-29" />,
        );
        const week = link(html, "/bookings?date=2026-09-29&amp;layout=week");
        expect(week).toContain('aria-current="page"');
        expect(week).toContain('data-state="on"');
        expect(link(html, "/bookings/all")).not.toContain("aria-current");
        expect(link(html, "/bookings/all")).toContain('data-state="off"');
        // The other layouts keep the day shown.
        expect(link(html, "/bookings?date=2026-09-29")).toContain(
            'data-state="off"',
        );
    });

    it("marks the list and links back to each layout on today", () => {
        const html = renderToStaticMarkup(
            <BookingsViewSwitch current="list" />,
        );
        expect(link(html, "/bookings/all")).toContain('aria-current="page"');
        expect(link(html, "/bookings/all")).toContain('data-state="on"');
        expect(link(html, "/bookings")).not.toContain("aria-current");
        expect(link(html, "/bookings?layout=agenda")).toContain(
            'data-state="off"',
        );
    });

    it("keeps cancelled bookings drawn when the layout changes", () => {
        const html = renderToStaticMarkup(
            <BookingsViewSwitch current="day" date="2026-09-29" cancelled />,
        );
        expect(html).toContain(
            'href="/bookings?date=2026-09-29&amp;layout=week&amp;cancelled=1"',
        );
        expect(html).toContain('href="/bookings/all"');
    });

    it("drops the week on a phone, which has no week grid", () => {
        const html = renderToStaticMarkup(<BookingsViewSwitch current="day" />);
        expect(link(html, "/bookings?layout=week")).toContain(
            "max-[759px]:hidden",
        );
    });
});
