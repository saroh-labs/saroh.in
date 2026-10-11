import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BookingsViewSwitch } from "./bookings-view-switch";

/**
 * Bookings' Calendar | List switch: the calendar and the list are two views
 * of one screen, so both carry it, each marking itself and linking to the
 * other. The list used to be reachable only from a line under the calendar.
 */
describe("the bookings view switch", () => {
    const link = (html: string, href: string) =>
        new RegExp(`<a[^>]*href="${href}"[^>]*>`).exec(html)?.[0] ?? "";

    it("marks the calendar and links to the list", () => {
        const html = renderToStaticMarkup(
            <BookingsViewSwitch current="calendar" />,
        );
        expect(html).toContain('aria-label="Bookings view"');
        expect(link(html, "/bookings")).toContain('aria-current="page"');
        expect(link(html, "/bookings")).toContain('data-state="on"');
        expect(link(html, "/bookings/all")).not.toContain("aria-current");
        expect(link(html, "/bookings/all")).toContain('data-state="off"');
        expect(html).toContain(">Calendar<");
        expect(html).toContain(">List<");
    });

    it("marks the list and links to the calendar", () => {
        const html = renderToStaticMarkup(
            <BookingsViewSwitch current="list" />,
        );
        expect(link(html, "/bookings/all")).toContain('aria-current="page"');
        expect(link(html, "/bookings/all")).toContain('data-state="on"');
        expect(link(html, "/bookings")).not.toContain("aria-current");
    });
});
