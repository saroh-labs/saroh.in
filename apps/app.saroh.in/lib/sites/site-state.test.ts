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
