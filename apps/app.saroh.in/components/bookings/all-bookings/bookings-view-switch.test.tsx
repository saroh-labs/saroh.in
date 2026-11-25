import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
    BookingsModeSwitch,
    BookingsPhoneBar,
    BookingsViewSwitch,
} from "./bookings-view-switch";

/**
 * The views of the same bookings: Calendar | List in both headers (List is
 * the register of every booking), and Show as Day, Week or Agenda in the
 * calendar's date sheet (Agenda was called List until the register took it).
 */
describe("the bookings views", () => {
    // The opening tag of the link to an address, found by plain text: an
    // address is never made into a pattern.
    const link = (html: string, href: string) =>
        html
            .split("<a ")
            .slice(1)
            .map((rest) => `<a ${rest.slice(0, rest.indexOf(">") + 1)}`)
            .find((tag) => tag.includes(`href="${href}"`)) ?? "";

    it("Calendar | List is one switch with two addresses", () => {
        const html = renderToStaticMarkup(
            <BookingsModeSwitch current="calendar" />,
        );
        expect(html.match(/data-segmented/g)).toHaveLength(1);
        expect(html).toContain('aria-label="Bookings"');
        expect(html.match(/<a /g)).toHaveLength(2);
        expect(link(html, "/bookings")).toContain('aria-current="page"');
        expect(link(html, "/bookings/all")).toContain('data-state="off"');
        expect(html).toContain(">Calendar<");
        expect(html).toContain(">List<");
    });

    it("marks List on the register, and goes back to the calendar where it was", () => {
        const html = renderToStaticMarkup(
            <BookingsModeSwitch
                current="list"
                calendarTo="/bookings?layout=week"
            />,
        );
        expect(link(html, "/bookings/all")).toContain('aria-current="page"');
        expect(link(html, "/bookings?layout=week")).toContain(
            'data-state="off"',
        );
    });

    it("fills the row on a phone, whose options are the 44px ones", () => {
        const html = renderToStaticMarkup(
            <BookingsModeSwitch current="list" />,
        );
        expect(link(html, "/bookings?calendar=1")).toContain(
            'data-state="off"',
        );
        expect(html).toContain("max-[759px]:w-full");
        expect(html).toContain("max-[759px]:flex-1");
        expect(html).toContain("coarse:h-11");
        expect(html).toContain("max-[759px]:h-11");
    });

    it("is one phone row with the view's ⋯, kept in sight as the page scrolls", () => {
        const html = renderToStaticMarkup(
            <BookingsPhoneBar
                current="list"
                options={<button type="button">More</button>}
            />,
        );
        expect(html).toMatch(/^<div data-bookings-bar="" class="sticky /);
        expect(html.indexOf('aria-label="Bookings"')).toBeLessThan(
            html.indexOf(">More<"),
        );
    });

    it("Show as is Day, Week and Agenda, and no old List", () => {
        const html = renderToStaticMarkup(<BookingsViewSwitch current="day" />);
        expect(html.match(/<a /g)).toHaveLength(3);
        expect(html).toContain(">Day<");
        expect(html).toContain(">Week<");
        expect(html).toContain(">Agenda<");
        expect(html).not.toContain(">List<");
        expect(html).not.toContain("All bookings");
    });

    it("marks the layout and keeps the day shown", () => {
        const html = renderToStaticMarkup(
            <BookingsViewSwitch current="week" date="2026-09-29" />,
        );
        const week = link(html, "/bookings?date=2026-09-29&amp;layout=week");
        expect(week).toContain('aria-current="page"');
        expect(week).toContain('data-state="on"');
        expect(
            link(html, "/bookings?date=2026-09-29&amp;layout=agenda"),
        ).toContain('data-state="off"');
    });

    it("keeps cancelled bookings drawn when the layout changes", () => {
        const html = renderToStaticMarkup(
            <BookingsViewSwitch current="day" date="2026-09-29" cancelled />,
        );
        expect(html).toContain(
            'href="/bookings?date=2026-09-29&amp;layout=week&amp;cancelled=1"',
        );
    });

    it("can use the calendar's own address", () => {
        const html = renderToStaticMarkup(
            <BookingsViewSwitch
                current="agenda"
                hrefFor={(l) => `/bookings?layout=${l}&person=arjun`}
            />,
        );
        expect(
            link(html, "/bookings?layout=agenda&amp;person=arjun"),
        ).toContain('aria-current="page"');
    });
});
