import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AllSites } from "./all-sites";
import type { SiteCardData } from "./site-card";
import { lastActivityLine, visitsLine } from "./site-card-words";

vi.mock("next/navigation", () => ({
    usePathname: () => "/sites",
    useSearchParams: () => new URLSearchParams(),
}));

const card = (over: Partial<SiteCardData> = {}): SiteCardData => ({
    id: "s1",
    name: "Gulmohar Salon & Bridal",
    host: "gulmohar.saroh.app",
    url: "https://gulmohar.saroh.app",
    status: { label: "Live · 2 changes waiting", tone: "attention" },
    paused: false,
    visits: null,
    last: null,
    ...over,
});

describe("All sites (WXHSites)", () => {
    it("lists every site, one alone too, each opening its Overview", () => {
        const html = renderToStaticMarkup(
            <AllSites
                sites={[
                    card(),
                    card({
                        id: "s2",
                        name: "Bridal Photos",
                        status: { label: "Live", tone: "live" },
                    }),
                    card({
                        id: "s3",
                        name: "Academy",
                        status: { label: "Not live yet", tone: "draft" },
                    }),
                ]}
            />,
        );
        expect(html.match(/<li/g)).toHaveLength(3);
        expect(html).toContain('href="/sites/s1/overview"');
        expect(html).toContain("Live · 2 changes waiting");
        expect(html).toContain("Not live yet");
        expect(
            renderToStaticMarkup(<AllSites sites={[card()]} />).match(/<li/g),
        ).toHaveLength(1);
    });

    it("leaves out a figure the API didn't send, never shows 0", () => {
        const html = renderToStaticMarkup(<AllSites sites={[card()]} />);
        expect(html).not.toContain("visits");
        expect(visitsLine(undefined)).toBeNull();
        expect(visitsLine(297)).toBe("297 visits, last 7 days");
    });

    it("names who last changed it, or says it plainly with no name", () => {
        const now = new Date("2026-11-18T12:00:00Z");
        expect(
            lastActivityLine(
                { kind: "published", by: "Mohit", at: "2026-11-09T06:00:00Z" },
                "Asia/Kolkata",
                now,
            ),
        ).toBe("Mohit published 9 Nov");
        expect(
            lastActivityLine(
                { kind: "edited", by: null, at: "2026-11-09T06:00:00Z" },
                "Asia/Kolkata",
                now,
            ),
        ).toBe("Edited 9 Nov");
        expect(lastActivityLine(null, "Asia/Kolkata")).toBeNull();
    });
});
