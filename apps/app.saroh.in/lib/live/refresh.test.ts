import { describe, expect, it } from "vitest";

import type { BusyDocument } from "./refresh";
import {
    holdLiveRefresh,
    isLiveRoute,
    LIVE_INTERVAL_MS,
    LIVE_ROUTES,
    liveRefreshHeld,
    pageBusy,
    titleWithUnread,
} from "./refresh";

/** A document with nothing open and nobody typing. */
const quiet = (over: Partial<BusyDocument> = {}): BusyDocument => ({
    querySelector: () => null,
    activeElement: null,
    ...over,
});

describe("which pages read again on a timer", () => {
    it("is 45 seconds", () => {
        expect(LIVE_INTERVAL_MS).toBe(45_000);
    });

    it("Home, Orders and its tickets, the bookings calendar and list, Notifications", () => {
        expect([...LIVE_ROUTES]).toEqual([
            "/",
            "/commerce/orders",
            "/commerce/orders/tickets",
            "/bookings",
            "/bookings/all",
            "/notifications",
        ]);
        for (const route of LIVE_ROUTES) expect(isLiveRoute(route)).toBe(true);
        expect(isLiveRoute("/commerce/orders/")).toBe(true);
    });

    it("never a record's own page, a form or a settings screen", () => {
        for (const path of [
            "/commerce/orders/ord_1",
            "/commerce/orders/new",
            "/bookings/bk_1",
            "/bookings/availability",
            "/commerce/products",
            "/settings/organization",
            "/sites/site_1",
            "",
        ]) {
            expect(isLiveRoute(path)).toBe(false);
        }
        expect(isLiveRoute(null)).toBe(false);
    });
});

describe("when the page must not be read again (pageBusy)", () => {
    it("a quiet page may", () => {
        expect(pageBusy(quiet())).toBeNull();
    });

    it("not while a sheet, a dialog or the command menu is open", () => {
        const doc = quiet({
            querySelector: (s) => (s.includes('role="dialog"') ? {} : null),
        });
        expect(pageBusy(doc)).toBe("overlay");
    });

    it("not while a screen holds unsaved work, until it lets go", () => {
        const release = holdLiveRefresh();
        const second = holdLiveRefresh();
        expect(liveRefreshHeld()).toBe(true);
        expect(pageBusy(quiet())).toBe("held");
        release();
        // Letting go twice is one release.
        release();
        expect(pageBusy(quiet())).toBe("held");
        second();
        expect(liveRefreshHeld()).toBe(false);
        expect(pageBusy(quiet())).toBeNull();
    });

    it("not while someone is typing in a field", () => {
        for (const el of [
            { tagName: "INPUT", type: "text" },
            { tagName: "INPUT" },
            { tagName: "TEXTAREA" },
            { tagName: "SELECT" },
            { tagName: "DIV", isContentEditable: true },
        ]) {
            expect(pageBusy(quiet({ activeElement: el }))).toBe("typing");
        }
    });

    it("a search box, a checkbox or a button in focus holds nothing", () => {
        for (const el of [
            { tagName: "INPUT", type: "search" },
            { tagName: "INPUT", type: "checkbox" },
            { tagName: "BUTTON" },
            { tagName: "A" },
        ]) {
            expect(pageBusy(quiet({ activeElement: el }))).toBeNull();
        }
    });

    it("not while a form on the page was typed into and not sent", () => {
        const doc = quiet({
            querySelector: (s) => (s === "[data-live-typed]" ? {} : null),
        });
        expect(pageBusy(doc)).toBe("typed");
    });
});

describe("the unread count in the tab's title", () => {
    it("goes in front: (3) Orders · Saroh", () => {
        expect(titleWithUnread("Orders · Saroh", 3)).toBe("(3) Orders · Saroh");
        expect(titleWithUnread("Saroh", 1)).toBe("(1) Saroh");
    });

    it("is absent at zero, and for someone with no inbox", () => {
        expect(titleWithUnread("Orders · Saroh", 0)).toBe("Orders · Saroh");
        expect(titleWithUnread("Orders · Saroh", null)).toBe("Orders · Saroh");
        expect(titleWithUnread("(3) Orders · Saroh", 0)).toBe("Orders · Saroh");
    });

    it("replaces the count it wrote, never stacks", () => {
        const once = titleWithUnread("Orders · Saroh", 3);
        expect(titleWithUnread(once, 3)).toBe(once);
        expect(titleWithUnread(once, 12)).toBe("(12) Orders · Saroh");
    });

    it("stops counting at 99", () => {
        expect(titleWithUnread("Home · Saroh", 240)).toBe("(99+) Home · Saroh");
        expect(titleWithUnread("(99+) Home · Saroh", 2)).toBe(
            "(2) Home · Saroh",
        );
    });

    it("leaves a title that only looks like a count alone", () => {
        expect(titleWithUnread("(Draft) Summer menu · Saroh", 0)).toBe(
            "(Draft) Summer menu · Saroh",
        );
    });
});
