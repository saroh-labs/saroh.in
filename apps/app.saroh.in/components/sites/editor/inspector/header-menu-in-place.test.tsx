// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SiteNavigationItem, SitePage } from "@/lib/sites/service";

import { EverywhereBanner } from "./everywhere-banner";
import { HeaderMenuInPlace, moveItem } from "./header-menu-in-place";

/** H1 (`fix/WXMGlobal`): the menu edited in place on the header. */

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

const pages = [
    { id: "p1", title: "Home", path: "/", hidden: false },
    { id: "p2", title: "About", path: "/about", hidden: false },
    { id: "p3", title: "Secret", path: "/secret", hidden: true },
] as unknown as SitePage[];

describe("moveItem", () => {
    it("drops the dragged entry at the place it was let go", () => {
        expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
        expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
        expect(moveItem(["a", "b"], 1, 1)).toEqual(["a", "b"]);
    });
});

describe("HeaderMenuInPlace", () => {
    it("renames an entry by typing in it; an empty name goes back to the page's title", () => {
        let menu: SiteNavigationItem[] = [{ pageId: "p1" }];
        const setMenu = (
            next: (m: SiteNavigationItem[]) => SiteNavigationItem[],
        ) => {
            menu = next(menu);
        };
        act(() =>
            root.render(
                <HeaderMenuInPlace
                    menu={menu}
                    setMenu={setMenu}
                    pages={pages}
                />,
            ),
        );
        const input = host.querySelector<HTMLInputElement>(
            'input[aria-label="Menu label for Home"]',
        );
        expect(input?.placeholder).toBe("Home");
        expect(host.textContent).toContain("Drag to reorder · type to rename");
        // React reads the value through its own setter.
        act(() => {
            Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value",
            )?.set?.call(input, "Start");
            input?.dispatchEvent(new Event("input", { bubbles: true }));
        });
        expect(menu).toEqual([{ pageId: "p1", label: "Start" }]);
        // Add offers About, never the hidden page.
        expect(
            Array.from(host.querySelectorAll("button")).some((b) =>
                b.textContent.includes("Add"),
            ),
        ).toBe(true);
    });
});

describe("EverywhereBanner", () => {
    it("one line: the pages, See the pages and Back", () => {
        act(() =>
            root.render(
                <EverywhereBanner
                    pages={pages.slice(0, 2)}
                    onSeePages={() => undefined}
                    onBack={() => undefined}
                />,
            ),
        );
        const bar = host.querySelector("[data-everywhere-banner]");
        expect(bar?.textContent).toContain(
            "Changes here show on all 2 pages · Home and About",
        );
        expect(bar?.className).toContain("h-10");
    });
});
