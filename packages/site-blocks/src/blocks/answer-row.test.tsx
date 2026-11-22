import type { RenderedHero } from "@saroh/block-contract";
import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import type { OpeningHoursDay } from "../lib/opening-hours";
import type { PublicVisit } from "../lib/public-visit";
import { resetLiveReads } from "../live/use-live-read";
import { AnswerRow, answerOpenWords } from "./answer-row";
import HeroSection from "./hero";
import { ringWords, townOf } from "./stamp";

/** Closed Mondays; Tue to Sat 10 am to 8 pm; Sun 10 am to 2 pm. */
const WEEK: OpeningHoursDay[] = [
    { day: "MON", open: "10:00", close: "20:00", closed: true },
    { day: "TUE", open: "10:00", close: "20:00", closed: false },
    { day: "WED", open: "10:00", close: "20:00", closed: false },
    { day: "THU", open: "10:00", close: "20:00", closed: false },
    { day: "FRI", open: "10:00", close: "20:00", closed: false },
    { day: "SAT", open: "10:00", close: "20:00", closed: false },
    { day: "SUN", open: "10:00", close: "14:00", closed: false },
];
const ZONE = "Asia/Kolkata";
/** Monday 16 Nov 2026, 11:00 in Kolkata: a closed day. */
const MONDAY = new Date("2026-11-16T11:00:00+05:30");
/** Tuesday 17 Nov 2026, 15:00. */
const TUESDAY = new Date("2026-11-17T15:00:00+05:30");

const VISIT: PublicVisit = {
    source: "business",
    storeId: null,
    name: "Sandhu Tailors",
    address: "12 Qila Road\nRohtak 124001",
    phone: "+910000001009",
    hours: WEEK,
    timezone: ZONE,
};

afterEach(() => resetLiveReads());

describe("answerOpenWords", () => {
    it("on a closed day says when it opens next", () => {
        expect(answerOpenWords(WEEK, MONDAY, ZONE)?.text).toBe(
            "Closed today · opens Tue 10 am",
        );
    });

    it("while open says until when", () => {
        expect(answerOpenWords(WEEK, TUESDAY, ZONE)).toEqual({
            text: "Open now · until 8 pm",
            open: true,
        });
    });

    it("after closing is closed now, not closed today", () => {
        const late = new Date("2026-11-17T21:00:00+05:30");
        expect(answerOpenWords(WEEK, late, ZONE)?.text).toBe(
            "Closed now · opens Wed 10 am",
        );
    });

    it("a holiday reads as closed today", () => {
        expect(answerOpenWords(WEEK, TUESDAY, ZONE, ["2026-11-17"])?.text).toBe(
            "Closed today · opens Wed 10 am",
        );
    });

    it("says nothing for a week nobody saved", () => {
        expect(answerOpenWords(null, TUESDAY, ZONE)).toBeNull();
    });
});

describe("AnswerRow", () => {
    it("the cached page has no Open now, address or phone", () => {
        const html = renderToString(<AnswerRow siteId="site_1" />);
        expect(html).not.toMatch(/Open now|Closed|Directions|tel:/);
        expect(html).toContain("min-h-11");
    });

    it("after the read: open words, Directions and Call", () => {
        render(<AnswerRow visit={VISIT} now={MONDAY} />);
        expect(screen.getByText("Closed today · opens Tue 10 am")).toBeTruthy();
        expect(
            screen
                .getByRole("link", { name: /Directions/ })
                .getAttribute("href"),
        ).toContain("google.com/maps/search");
        const call = screen.getByRole("link", { name: /Call/ });
        expect(call.getAttribute("href")).toBe("tel:+910000001009");
        expect(call.className).toContain("min-h-11");
        expect(
            document.querySelector('[aria-live="polite"]')?.textContent,
        ).toContain("Closed today");
    });
});

describe("Stamp", () => {
    const split = {
        variant: "split",
        heading: "Suits and sherwanis, cut to fit",
        answerRow: true,
    } as RenderedHero;

    it("fills a split hero's image slot when it has no photo", () => {
        render(<HeroSection content={split} visit={VISIT} now={TUESDAY} />);
        const stamp = document.querySelector("[data-site-stamp] svg");
        expect(stamp).not.toBeNull();
        expect(stamp?.textContent).toContain("SANDHU TAILORS · ROHTAK");
        expect(screen.queryByText(/No photo yet/)).toBeNull();
        expect(screen.getByText("Open now · until 8 pm")).toBeTruthy();
    });

    it("the owner's preview still says No photo yet", () => {
        render(<HeroSection content={split} visit={VISIT} isOwnerPreview />);
        expect(document.querySelector("[data-site-stamp] svg")).not.toBeNull();
        expect(screen.getByText(/No photo yet/)).toBeTruthy();
    });

    it("reads the town from the address", () => {
        expect(townOf("14 Hill Road, Bandra West, Mumbai 400050")).toBe(
            "Mumbai",
        );
        expect(townOf("12 Qila Road\nRohtak 124001")).toBe("Rohtak");
        expect(townOf("Rohtak")).toBeNull();
        expect(ringWords("Rye", "MUMBAI").length).toBeGreaterThanOrEqual(36);
        expect(townOf("Shop 4, Sector 12 - 124 001 ")).toBe("Sector");
        expect(townOf("Shop 4, Rohtak - -")).toBe("Rohtak - -");
    });

    it("reads a long run of spaces or digits in linear time", () => {
        // The old `$`-anchored pin regex takes seconds on these (quadratic);
        // the bound leaves room for a busy machine.
        const started = performance.now();
        expect(townOf(`Shop 4, ${"\t".repeat(100_000)}x`)).toBe("x");
        expect(townOf(`Shop 4, Rohtak ${"0".repeat(100_000)}x`)).toBe(
            `Rohtak ${"0".repeat(100_000)}x`,
        );
        expect(performance.now() - started).toBeLessThan(500);
    });
});

describe("Byline", () => {
    it("names the person under the line, the photo marked for Round", () => {
        render(
            <HeroSection
                content={{
                    heading: "Dental care in Aundh",
                    byline: {
                        name: "Dr Meera Rao",
                        role: "Dentist",
                        image: { src: "https://img.test/m.jpg", alt: "" },
                    },
                }}
            />,
        );
        expect(screen.getByText("Dr Meera Rao")).toBeTruthy();
        expect(screen.getByText("Dentist")).toBeTruthy();
        expect(
            document.querySelector('[data-site-photo="person"] img'),
        ).not.toBeNull();
    });
});
