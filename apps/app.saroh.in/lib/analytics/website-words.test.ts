import { describe, expect, it } from "vitest";

import { dayReadout, dayTick, pageTitle, tickEvery } from "./website-words";

describe("website words", () => {
    it("says a day the way the takings do, never as 09-04", () => {
        expect(dayTick("2026-09-04")).toBe("4 Sep");
        expect(
            dayReadout({ date: "2026-10-01", views: 4120, uniques: 1 }),
        ).toBe("Thursday 1 Oct · 4,120 visits · 1 visitor");
    });

    it("names a page from its address", () => {
        expect(pageTitle("/")).toBe("Home page");
        expect(pageTitle("/products/kraft-mailer-box")).toBe(
            "Kraft mailer box",
        );
        expect(pageTitle("/blog/choosing_the-right-mailer/")).toBe(
            "Choosing the right mailer",
        );
        expect(pageTitle("/contact?ref=ig")).toBe("Contact");
        expect(pageTitle("/caf%C3%A9-menu")).toBe("Café menu");
        // A broken escape is shown as written, never thrown.
        expect(pageTitle("/100%-cotton")).toBe("100% cotton");
    });

    it("labels about the asked number of days", () => {
        expect(tickEvery(30, 6)).toBe(5);
        expect(tickEvery(7, 6)).toBe(2);
        expect(tickEvery(3, 6)).toBe(1);
        expect(tickEvery(0, 6)).toBe(1);
    });
});
