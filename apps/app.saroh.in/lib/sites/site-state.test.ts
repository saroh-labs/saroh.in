import { describe, expect, it } from "vitest";

import { pageState, siteState } from "@/lib/sites/site-state";

const base = { id: "s", name: "Site", slug: "site" };

describe("siteState", () => {
    it("says a site nobody has published is not on the web", () => {
        expect(siteState(base)).toEqual({
            label: "Never published",
            tone: "draft",
        });
    });

    it("puts a pending domain ahead of pending changes", () => {
        expect(
            siteState({
                ...base,
                currentPublicationId: "p",
                pendingDomain: "shop.example.com",
                pendingSectionChanges: 3,
            }).label,
        ).toBe("Live · domain pending");
    });

    it("says nothing about the domain to someone who can't act on it (UX-081)", () => {
        expect(
            siteState(
                {
                    ...base,
                    currentPublicationId: "p",
                    pendingDomain: "shop.example.com",
                },
                { domainState: false },
            ).label,
        ).not.toContain("domain");
    });

    it("counts what is waiting to go out", () => {
        expect(
            siteState({
                ...base,
                currentPublicationId: "p",
                pendingSectionChanges: 1,
            }).label,
        ).toBe("Live · 1 thing to look at");
    });

    it("is plainly live when nothing is waiting", () => {
        expect(siteState({ ...base, currentPublicationId: "p" })).toEqual({
            label: "Live",
            tone: "live",
        });
    });
});

describe("pageState", () => {
    it("keeps a hidden page hidden on a live site", () => {
        expect(
            pageState({ hidden: true }, { currentPublicationId: "p" }).state,
        ).toBe("hidden");
    });

    it("does not call a page live before the site has been published", () => {
        expect(
            pageState({ hidden: false }, { currentPublicationId: null }).label,
        ).toBe("Not published yet");
    });

    it("calls a visible page on a published site live", () => {
        expect(
            pageState({ hidden: false }, { currentPublicationId: "p" }).state,
        ).toBe("live");
    });
});

describe("siteState for a reader (U6)", () => {
    const reader = { timeZone: "Asia/Kolkata" };

    it("says live and since when, not the owner's checks", () => {
        expect(
            siteState(
                {
                    ...base,
                    currentPublicationId: "p",
                    currentPublication: {
                        publishedAt: "2026-10-17T06:00:00.000Z",
                    },
                    pendingSectionChanges: 3,
                    hasUnpublishedChanges: true,
                    pendingDomain: "shop.example.com",
                },
                { reader },
            ),
        ).toEqual({ label: "Live · published 17 Oct", tone: "live" });
    });

    it("says Not published yet for a site never published", () => {
        expect(siteState(base, { reader })).toEqual({
            label: "Not published yet",
            tone: "draft",
        });
    });

    it("still tells an editor what there is to look at", () => {
        expect(
            siteState({
                ...base,
                currentPublicationId: "p",
                pendingSectionChanges: 3,
            }).label,
        ).toBe("Live · 3 things to look at");
    });
});
