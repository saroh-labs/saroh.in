import { describe, expect, it } from "vitest";

import { liveSites, notesOpen, reviewRows, sentWhen } from "./reviews";
import type { HomeReviewSite } from "./service";

const ZONE = "Asia/Kolkata";
// 09:30 in Mumbai on Friday 18 Sep 2026.
const NOW = new Date("2026-09-18T04:00:00.000Z");

function site(over: Partial<HomeReviewSite> = {}): HomeReviewSite {
    return {
        id: "site_rye",
        name: "Rye & Co.",
        href: "/sites/site_rye/review",
        requestedBy: "Priya Raman",
        // 11:30 yesterday in Mumbai.
        requestedAt: "2026-09-17T06:00:00.000Z",
        openNotes: 2,
        pages: [
            {
                id: "page_home",
                title: "Home page",
                path: "/",
                openNotes: 2,
                href: "/sites/site_rye/review?page=page_home",
            },
            {
                id: "page_menu",
                title: "Menu",
                path: "/menu",
                openNotes: 0,
                href: "/sites/site_rye/review?page=page_menu",
            },
        ],
        pageCount: 2,
        subdomain: "rye",
        live: true,
        ...over,
    };
}

describe("notesOpen", () => {
    it("says how many notes are open, and nothing for none", () => {
        expect(notesOpen(0)).toBeNull();
        expect(notesOpen(1)).toBe("1 note open");
        expect(notesOpen(3)).toBe("3 notes open");
    });
});

describe("sentWhen", () => {
    it("says the part of today, yesterday, or the day, in the business's zone", () => {
        // 07:00 in Mumbai today.
        expect(sentWhen("2026-09-18T01:30:00.000Z", ZONE, NOW)).toBe(
            "sent this morning",
        );
        // 23:00 in Mumbai the night before is yesterday, though UTC says 17:30.
        expect(sentWhen("2026-09-17T17:30:00.000Z", ZONE, NOW)).toBe(
            "sent yesterday",
        );
        expect(sentWhen("2026-09-12T06:00:00.000Z", ZONE, NOW)).toBe(
            "sent 12 Sep",
        );
    });

    it("says afternoon and evening by the greeting's hours", () => {
        const late = new Date("2026-09-18T16:00:00.000Z"); // 21:30
        expect(sentWhen("2026-09-18T08:00:00.000Z", ZONE, late)).toBe(
            "sent this afternoon",
        );
        expect(sentWhen("2026-09-18T13:00:00.000Z", ZONE, late)).toBe(
            "sent this evening",
        );
    });
});

describe("reviewRows", () => {
    it("draws a row per page waiting, as the design does", () => {
        expect(reviewRows([site()], { zone: ZONE, now: NOW })).toEqual([
            {
                key: "site_rye:page_home",
                title: "Home page",
                sub: "From Priya Raman · sent yesterday · 2 notes open",
                href: "/sites/site_rye/review?page=page_home",
            },
            {
                key: "site_rye:page_menu",
                title: "Menu",
                sub: "From Priya Raman · sent yesterday",
                href: "/sites/site_rye/review?page=page_menu",
            },
        ]);
    });

    it("counts the pages past five, and names the site when there are several", () => {
        const rows = reviewRows(
            [
                site({ pageCount: 7 }),
                site({
                    id: "site_2",
                    name: "Rye Wholesale",
                    href: "/sites/site_2/review",
                    requestedAt: null,
                    requestedBy: null,
                    openNotes: 1,
                }),
            ],
            { zone: ZONE, now: NOW },
        );
        expect(rows.map((r) => [r.title, r.sub, r.href])).toEqual([
            [
                "Home page",
                "Rye & Co. · From Priya Raman · sent yesterday · 2 notes open",
                "/sites/site_rye/review?page=page_home",
            ],
            [
                "Menu",
                "Rye & Co. · From Priya Raman · sent yesterday",
                "/sites/site_rye/review?page=page_menu",
            ],
            ["5 more pages", "Rye & Co.", "/sites/site_rye/review"],
            // Granted, not sent: still one click away, and said so.
            [
                "Rye Wholesale",
                "Nothing sent right now · 1 note open",
                "/sites/site_2/review",
            ],
        ]);
    });

    it("lists sites waiting on the reviewer before the rest", () => {
        const rows = reviewRows(
            [
                site({ id: "a", name: "A", requestedAt: null, pages: [] }),
                site({ id: "b", name: "B", pages: [], pageCount: 0 }),
            ],
            { zone: ZONE, now: NOW },
        );
        expect(rows.map((r) => r.key)).toEqual(["b", "a"]);
        expect(rows[0].sub).toBe(
            "From Priya Raman · sent yesterday · 2 notes open",
        );
    });

    it("says nothing is sent when the reviewer has no sites", () => {
        expect(reviewRows([], { zone: ZONE, now: NOW })).toEqual([
            {
                key: "none",
                title: "Nothing sent to you right now",
                sub: "Pages show up here when someone shares them for review.",
                href: null,
            },
        ]);
    });
});

describe("liveSites", () => {
    it("links only published sites with an address", () => {
        expect(
            liveSites(
                [
                    site(),
                    site({ id: "draft", live: false }),
                    site({ id: "noaddr", subdomain: null }),
                ],
                "saroh.app",
            ),
        ).toEqual([
            { id: "site_rye", name: "Rye & Co.", url: "https://rye.saroh.app" },
        ]);
    });
});
