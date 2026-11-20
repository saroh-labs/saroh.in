import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { SiteOverview } from "@/lib/sites/service";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
    usePathname: () => "/sites/s1/overview",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/qr/link-qr/qr-button", () => ({
    QrButton: () => <button type="button">QR</button>,
}));

import { Overview } from "./overview";
import { activityWords, needsDoingItems, resultParts } from "./overview-words";

type Results = NonNullable<SiteOverview["results"]>;

const results = (over: Partial<Results> = {}): Results => ({
    from: "2026-11-10",
    to: "2026-11-16",
    days: [31, 28, 40, 35, 52, 64, 47].map((visits, i) => ({
        date: `2026-11-${10 + i}`,
        visits,
    })),
    visits: 297,
    questions: 2,
    started: 6,
    paid: 1,
    sells: { bookings: true, shop: false },
    ...over,
});

const overview = (over: Partial<SiteOverview> = {}): SiteOverview => ({
    results: results(),
    needsDoing: [
        {
            pageId: "p_bridal",
            title: "Bridal makeup packages",
            path: "/bridal",
            issues: ["googleText"],
        },
        {
            pageId: "p_lounge",
            title: "Client lounge",
            path: "/lounge",
            issues: ["googleText", "shareImage"],
        },
    ],
    activity: [
        {
            kind: "published",
            at: "2026-11-14T06:00:00.000Z",
            by: "Mohit Mehta",
            subject: null,
        },
    ],
    lastPublished: { at: "2026-11-14T06:00:00.000Z", by: "Mohit Mehta" },
    ...over,
});

const html = (node: React.ReactNode) =>
    renderToStaticMarkup(<>{node}</>)
        .replace(/&#x27;/g, "'")
        .replace(/&amp;/g, "&");

const props = {
    siteId: "s1",
    status: {
        label: "Live · 2 changes waiting",
        tone: "attention" as const,
        waiting: 2,
    },
    live: true,
    host: "gulmohar.saroh.app",
    url: "https://gulmohar.saroh.app",
    canEdit: true,
    canPublish: true,
    timeZone: "Asia/Kolkata",
    now: new Date("2026-11-16T10:00:00Z"),
};

describe("the results line (A3)", () => {
    it("says only measured parts, in what the site sells", () => {
        expect(resultParts(results())).toEqual([
            "297 visits",
            "6 bookings started",
            "2 questions",
            "1 paid booking",
        ]);
        expect(
            resultParts(results({ sells: { bookings: false, shop: true } })),
        ).toEqual(["297 visits", "6 orders started", "2 questions", "1 order"]);
    });

    it("leaves out started and paid when bookings and the shop are off", () => {
        expect(
            resultParts(
                results({
                    started: null,
                    paid: null,
                    sells: { bookings: false, shop: false },
                }),
            ),
        ).toEqual(["297 visits", "2 questions"]);
    });
});

describe("What needs doing", () => {
    it("is one item per problem, naming every page with it", () => {
        const items = needsDoingItems(overview().needsDoing);
        expect(items.map((i) => i.title)).toEqual([
            "2 pages have no text for Google",
            "1 page has no share photo",
        ]);
        expect(items[0]?.line).toBe(
            "Bridal makeup packages, Client lounge. Google shows a random line instead.",
        );
    });
});

describe("Activity words", () => {
    it("names people by first name and saves without one (A4)", () => {
        const [first] = overview().activity;
        expect(activityWords(first).title).toBe("Mohit published the site");
        expect(
            activityWords({
                kind: "saved",
                at: "2026-11-16T08:00:00.000Z",
                by: null,
                subject: "Bridal",
            }),
        ).toEqual({
            title: "Changes saved on Bridal",
            line: "Goes live when you publish",
        });
    });
});

describe("Overview (WXHOverview)", () => {
    it("draws status, results, needs doing and activity for an owner", () => {
        const out = html(<Overview {...props} overview={overview()} />);
        expect(out).toContain("Live · 2 changes waiting");
        expect(out).toContain("Last published 14 Nov by Mohit");
        expect(out).toContain("Review and publish");
        expect(out).toContain("What the site brought in, last 7 days");
        expect(out).toContain("6 bookings started");
        expect(out).toContain('href="/sites/s1/pages?view=fix&page=p_bridal"');
        expect(out).toContain("Mohit published the site");
    });

    it("puts the phone's groups right after the status, before Activity", () => {
        const out = html(
            <Overview
                {...props}
                overview={overview()}
                phoneHome={<nav>Pages and posts</nav>}
            />,
        );
        const groups = out.indexOf("data-phone-home");
        expect(groups).toBeGreaterThan(out.indexOf("Last published"));
        expect(groups).toBeLessThan(out.indexOf("Mohit published the site"));
        expect(out).toMatch(/data-phone-home=""[^>]*min-\[760px\]:hidden/);
    });

    it("leaves Review and publish to the phone's changes bar while changes wait", () => {
        const waiting = html(<Overview {...props} overview={overview()} />);
        expect(waiting).toMatch(/max-\[759px\]:hidden[^>]*>Review and publish/);
        const never = html(
            <Overview
                {...props}
                status={{ label: "Not published", tone: "draft", waiting: 0 }}
                overview={overview({ lastPublished: null })}
            />,
        );
        expect(never).toContain("Review and publish");
        expect(never).not.toContain("max-[759px]:hidden");
    });

    it("gives a reviewer no fix buttons and no Review and publish", () => {
        const out = html(
            <Overview
                {...props}
                status={{ label: "Live", tone: "live", waiting: 0 }}
                canEdit={false}
                canPublish={false}
                overview={overview({ results: null })}
            />,
        );
        expect(out).toContain("2 pages have no text for Google");
        expect(out).not.toContain("Review and publish");
        expect(out).not.toContain("/pages?view=fix");
        expect(out).not.toContain("What the site brought in");
    });

    it("says plainly when a live site had no visits", () => {
        const out = html(
            <Overview
                {...props}
                overview={overview({ results: results({ visits: 0 }) })}
            />,
        );
        expect(out).toContain("No visits in the last 7 days");
        expect(out).toContain("Your site is live at gulmohar.saroh.app");
    });

    it("keeps the address and status when the overview couldn't load", () => {
        const out = html(<Overview {...props} overview={null} />);
        expect(out).toContain("gulmohar.saroh.app");
        expect(out).toContain("Live · 2 changes waiting");
        expect(out).toContain("Couldn't load the overview");
        expect(out).toContain("Try again");
    });
});
