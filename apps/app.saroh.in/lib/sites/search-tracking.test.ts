import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { HELP_ARTICLES } from "@/lib/help/links";

import { SEARCH_TRACKING_ARTICLE, trackerHelpHref } from "./search-tracking";

const BEFORE = new Date("2026-10-16T18:29:59.999Z"); // 16 Oct, 23:59 IST
const AFTER = new Date("2026-10-16T18:30:00.000Z"); // 17 Oct, 00:00 IST

describe("a tracker row's Help link", () => {
    it("is the old site's anchor for that tool before Help moves", () => {
        expect(trackerHelpHref("ga4", BEFORE)).toBe(
            "https://help.saroh.in/website#trackers-ga4",
        );
        expect(trackerHelpHref("umami", BEFORE)).toBe(
            "https://help.saroh.in/website#trackers-umami",
        );
    });

    it("is the article's step on choosing a tool after it", () => {
        expect(trackerHelpHref("ga4", AFTER)).toBe(
            "https://www.saroh.in/help/verify-your-site-and-add-analytics#step-4",
        );
    });

    it("names an article the app knows, whose fourth step is that one", () => {
        expect(HELP_ARTICLES.map((a) => a.slug)).toContain(
            SEARCH_TRACKING_ARTICLE,
        );
        const mdx = readFileSync(
            path.resolve(
                __dirname,
                "../../../saroh.in/content/help",
                `${SEARCH_TRACKING_ARTICLE}.mdx`,
            ),
            "utf8",
        );
        const titles = mdx
            .split("\n")
            .filter((line) => line.startsWith("    - title: "))
            .map((line) => line.slice("    - title: ".length));
        expect(titles[3]).toBe("Choose your analytics tool");
    });
});
