// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    isApplePlatform,
    searchShortcut,
    searchShortcutSpoken,
} from "@/lib/nav/shortcut";

import {
    readRecents,
    RECENTS_MAX,
    rememberRecent,
    withRecent,
} from "./recents";

const order = (n: number) => ({
    kind: "order",
    id: `o_${n}`,
    title: `ORD-00${n}`,
    href: `/commerce/orders/o_${n}`,
});

describe("recents", () => {
    beforeEach(() => window.localStorage.clear());

    it("keeps five, newest first", () => {
        for (let i = 1; i <= 8; i++) rememberRecent("org_1", order(i));
        expect(RECENTS_MAX).toBe(5);
        expect(readRecents("org_1").map((r) => r.id)).toEqual([
            "o_8",
            "o_7",
            "o_6",
            "o_5",
            "o_4",
        ]);
    });

    it("the same thing opened again moves up, never doubles", () => {
        const list = withRecent(withRecent([order(1)], order(2)), order(1));
        expect(list.map((r) => r.id)).toEqual(["o_1", "o_2"]);
    });

    it("stores an id, a kind, a label and where it opens, and nothing else", () => {
        rememberRecent("org_1", {
            ...order(1),
            ...({ subtitle: "asha@example.com", phone: "+91" } as object),
        });
        expect(
            JSON.parse(
                window.localStorage.getItem("saroh-recent-v1:org_1") ?? "[]",
            ),
        ).toEqual([order(1)]);
    });

    it("is kept per business", () => {
        rememberRecent("org_1", order(1));
        expect(readRecents("org_2")).toEqual([]);
    });

    it("drops anything that isn't a recent, or opens somewhere else", () => {
        window.localStorage.setItem(
            "saroh-recent-v1:org_1",
            JSON.stringify([
                order(1),
                { kind: "order", id: 7, title: "x", href: "/x" },
                { ...order(2), href: "https://elsewhere.example/steal" },
                { ...order(3), href: "//elsewhere.example" },
                "nonsense",
                null,
            ]),
        );
        expect(readRecents("org_1")).toEqual([order(1)]);
    });

    it("unreadable storage is no recents, never a throw", () => {
        window.localStorage.setItem("saroh-recent-v1:org_1", "{not json");
        expect(readRecents("org_1")).toEqual([]);

        const get = vi
            .spyOn(Storage.prototype, "getItem")
            .mockImplementation(() => {
                throw new Error("SecurityError");
            });
        const set = vi
            .spyOn(Storage.prototype, "setItem")
            .mockImplementation(() => {
                throw new Error("QuotaExceededError");
            });
        expect(readRecents("org_1")).toEqual([]);
        expect(rememberRecent("org_1", order(1))).toEqual([order(1)]);
        get.mockRestore();
        set.mockRestore();
    });
});

describe("the shortcut hint", () => {
    it("is ⌘K on a Mac and Ctrl K on Windows and Linux", () => {
        expect(searchShortcut(isApplePlatform({ platform: "MacIntel" }))).toBe(
            "⌘K",
        );
        expect(searchShortcut(isApplePlatform({ platform: "Win32" }))).toBe(
            "Ctrl K",
        );
        expect(
            searchShortcut(isApplePlatform({ platform: "Linux x86_64" })),
        ).toBe("Ctrl K");
        expect(
            isApplePlatform({
                platform: "",
                userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
            }),
        ).toBe(true);
    });

    it("is said in words to a screen reader", () => {
        expect(searchShortcutSpoken(true)).toBe("Command K");
        expect(searchShortcutSpoken(false)).toBe("Control K");
    });
});
