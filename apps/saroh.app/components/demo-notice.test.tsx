import { describe, expect, it } from "vitest";

import { renderToStaticMarkup } from "react-dom/server";

import { DEMO_TEXT, NotTakingOrders } from "@saroh/site-blocks";

/**
 * A demo business's shop and product pages (DEC-188): where the bag, Add to
 * bag and Pay would be, the note the shop and product pages draw when the
 * checkout read says `demo` says it is a demo, in the site's own palette,
 * with nothing to press. The booking page's words are the booking flow's
 * tests (`@saroh/site-blocks`).
 */
describe("This is a demo, in place of Pay", () => {
    it.each([true, false])("banner %s: says it is a demo", (banner) => {
        const html = renderToStaticMarkup(
            <NotTakingOrders banner={banner} demo />,
        );
        expect(DEMO_TEXT).toBe(
            "This is a demo. Booking, paying and sending things are turned off.",
        );
        expect(html).toContain("This is a demo.");
        expect(html).not.toContain("isn&#x27;t taking orders");
        expect(html).not.toMatch(/<button|<a /);
        // The merchant's palette, never Saroh's brand tokens.
        expect(html).toMatch(/text-site-fg/);
        expect(html).not.toMatch(/\bbg-primary\b|\btext-brand/);
    });

    it("says the paused words when it isn't a demo", () => {
        expect(renderToStaticMarkup(<NotTakingOrders />)).toContain(
            "isn&#x27;t taking orders right now.",
        );
    });
});
