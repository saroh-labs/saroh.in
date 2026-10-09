import { describe, expect, it } from "vitest";

import type { SitePage } from "./service";
import {
    automaticMenu,
    menuNeeded,
    publishWaiting,
    readinessCount,
    settingsGroups,
    shareReadiness,
} from "./settings-page";

const home: SitePage = {
    id: "p_home",
    path: "/",
    title: "Home",
    isHome: true,
    hidden: false,
};
const about: SitePage = {
    id: "p_about",
    path: "/about",
    title: "About",
    isHome: false,
    hidden: false,
};
const shop: SitePage = {
    id: "p_shop",
    path: "/shop",
    title: "Shop",
    isHome: false,
    hidden: false,
    kind: "SHOP",
};

const bare = {
    name: "Rehearsal Bakery",
    seoTitle: null,
    seoDescription: null,
    socialImageUrl: null,
    navigation: null,
    pages: [home, about],
};

describe("the six groups", () => {
    it("draws all six with the shop open and approval to show", () => {
        expect(
            settingsGroups({ shop: true, advanced: true }).map((g) => g.label),
        ).toEqual([
            "Address",
            "Search and sharing",
            "Menu and footer",
            "Shop",
            "Tracking",
            "Advanced",
        ]);
    });

    it("leaves Shop out while the shop is off, and Advanced while empty", () => {
        expect(
            settingsGroups({ shop: false, advanced: false }).map((g) => g.id),
        ).toEqual([
            "address",
            "search-and-sharing",
            "menu-and-footer",
            "tracking",
        ]);
    });
});

describe("Before you share your site", () => {
    it("starts from what is done: the site's name stands in for the title", () => {
        const steps = shareReadiness(bare);
        expect(steps.map((s) => [s.key, s.done])).toEqual([
            ["title", true],
            ["description", false],
            ["image", false],
            ["menu", false],
        ]);
        expect(steps[0].note).toBe("using Rehearsal Bakery");
        expect(readinessCount(steps)).toEqual({ done: 1, of: 4 });
    });

    it("names a written title as the one in use", () => {
        const [title] = shareReadiness({ ...bare, seoTitle: "Fresh bread" });
        expect(title.note).toBe("Fresh bread");
    });

    it("counts a description, a share image and a built menu", () => {
        const steps = shareReadiness({
            ...bare,
            seoDescription: "Sourdough on Hill Road",
            socialImageUrl: "https://example.com/bread.jpg",
            navigation: { items: [{ pageId: "p_about" }] },
        });
        expect(readinessCount(steps)).toEqual({ done: 4, of: 4 });
    });

    it("asks for no menu where no page needs one", () => {
        // Home alone, or module pages, which join the menu on their own.
        const steps = shareReadiness({ ...bare, pages: [home, shop] });
        expect(steps.map((s) => s.key)).not.toContain("menu");
        expect(menuNeeded({ pages: [home, shop] })).toBe(false);
        expect(menuNeeded({ pages: [home, { ...about, hidden: true }] })).toBe(
            false,
        );
        expect(menuNeeded({ pages: [home, { ...about, inMenu: false }] })).toBe(
            false,
        );
    });

    it("names the module pages the live menu lists on its own", () => {
        expect(automaticMenu({ pages: [home, about, shop] })).toEqual(["Shop"]);
        expect(
            automaticMenu({ pages: [home, { ...shop, inMenu: false }] }),
        ).toEqual([]);
    });
});

describe("what waits for the next publish", () => {
    const live = {
        currentPublication: { publishedAt: "2026-10-01T10:00:00Z" },
    };

    it("says a draft is not published", () => {
        expect(
            publishWaiting({
                currentPublication: null,
                pendingSectionChanges: null,
                pendingSiteChanges: null,
            })?.line,
        ).toBe(
            "Your site isn't published yet. Nobody can reach it until you publish.",
        );
    });

    it("counts only real changes, in the editor's words", () => {
        expect(
            publishWaiting({
                ...live,
                pendingSectionChanges: 0,
                pendingSiteChanges: ["style", "footer", "menu"],
            })?.line,
        ).toBe(
            "3 changes wait for your next publish: the style, the footer and the menu.",
        );
        expect(
            publishWaiting({
                ...live,
                pendingSectionChanges: 1,
                pendingSiteChanges: [],
            })?.line,
        ).toBe("1 change waits for your next publish: 1 section.");
    });

    it("has no bar when the live site matches the draft", () => {
        expect(
            publishWaiting({
                ...live,
                pendingSectionChanges: 0,
                pendingSiteChanges: [],
            }),
        ).toBeNull();
    });

    it("says something waits without a number the diff can't give", () => {
        expect(
            publishWaiting({
                ...live,
                pendingSectionChanges: 0,
                pendingSiteChanges: [],
                hasUnpublishedChanges: true,
            })?.line,
        ).toBe("Some changes wait for your next publish.");
    });
});
