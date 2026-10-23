import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BookingsViewSwitch } from "./bookings-view-switch";

/**
 * The views of the same bookings: Day, Week and List (the agenda, Q4), and
 * All bookings. On the calendar it is Show as in the date sheet, with the
 * three layouts alone; All bookings' page carries all four.
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

    it("is one switch: Day, Week, List, and All bookings", () => {
        const html = renderToStaticMarkup(<BookingsViewSwitch current="day" />);
        expect(html.match(/data-segmented/g)).toHaveLength(1);
        expect(html).toContain('aria-label="Bookings view"');
        expect(html.match(/<a /g)).toHaveLength(4);
        expect(html).toContain(">Day<");
        expect(html).toContain(">Week<");
        expect(html).toContain(">List<");
        expect(html).toContain(">All bookings<");
        expect(html).not.toContain("Day by person");
        expect(html).not.toContain("Agenda");
    });

    it("marks the calendar's layout and links to all bookings", () => {
        const html = renderToStaticMarkup(
            <BookingsViewSwitch current="week" date="2026-09-29" />,
        );
        const week = link(html, "/bookings?date=2026-09-29&amp;layout=week");
        expect(week).toContain('aria-current="page"');
        expect(week).toContain('data-state="on"');
        expect(link(html, "/bookings/all")).toContain('data-state="off"');
        // The other layouts keep the day shown, and name their layout.
        expect(
            link(html, "/bookings?date=2026-09-29&amp;layout=day"),
        ).toContain('data-state="off"');
    });

    it("marks all bookings and links back to each layout on today", () => {
        const html = renderToStaticMarkup(
            <BookingsViewSwitch current="list" />,
        );
        expect(link(html, "/bookings/all")).toContain('aria-current="page"');
        expect(link(html, "/bookings?layout=day")).not.toContain(
            "aria-current",
        );
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
    });

    it("as Show as: the three layouts alone, at the calendar's own address", () => {
        const html = renderToStaticMarkup(
            <BookingsViewSwitch
                current="agenda"
                withAll={false}
                hrefFor={(l) => `/bookings?layout=${l}&person=arjun`}
            />,
        );
        expect(html.match(/<a /g)).toHaveLength(3);
        expect(html).not.toContain("/bookings/all");
        expect(
            link(html, "/bookings?layout=agenda&amp;person=arjun"),
        ).toContain('aria-current="page"');
        // A phone has Week too now (U5 draws it).
        expect(
            link(html, "/bookings?layout=week&amp;person=arjun"),
        ).not.toContain("hidden");
    });
});
