// @vitest-environment jsdom
/**
 * Menu groups fold (DEC-279): open the first time, each person's folds and
 * opens remembered, the current page's group always shown, folded groups
 * roll up what is waiting, the icon rail ignores folds, and the phone's
 * More sheet shares the desk's state.
 */
import { Home } from "lucide-react";
import type { AnchorHTMLAttributes } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MobileSheetGroup } from "@/lib/nav/mobile-nav";
import { navFoldsKey } from "@/lib/nav/nav-folds";

import { AppSidebar } from "./app-sidebar";
import { TabBarSheet } from "./tab-bar-sheet";

let pathname = "/";
vi.mock("next/navigation", () => ({
    usePathname: () => pathname,
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...props
    }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal(
        "matchMedia",
        () =>
            ({
                matches: false,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            }) as unknown as MediaQueryList,
    );
    pathname = "/";
    window.localStorage.clear();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
});

const draw = (ui: React.ReactElement) => act(() => root.render(ui));

/** Unmount and draw again: what a reload does to the rail. */
function reload(ui: React.ReactElement) {
    act(() => root.unmount());
    root = createRoot(host);
    draw(ui);
}

/** A group's fold button, by the label it starts with. */
function groupButton(label: string, scope: ParentNode = document) {
    const button = Array.from(
        scope.querySelectorAll<HTMLButtonElement>("button[aria-controls]"),
    ).find((b) => b.textContent.startsWith(label));
    if (!button) throw new Error(`no group button ${label}`);
    return button;
}

function rowsOf(button: HTMLButtonElement): HTMLElement {
    const rows = document.getElementById(
        button.getAttribute("aria-controls") ?? "",
    );
    if (!rows) throw new Error("no rows");
    return rows;
}

const click = (el: HTMLElement) => act(() => el.click());

const saved = (userId: string): unknown =>
    JSON.parse(window.localStorage.getItem(navFoldsKey(userId)) ?? "{}");

const rail = (props: Partial<Parameters<typeof AppSidebar>[0]> = {}) => (
    <AppSidebar userId="u1" {...props} />
);

describe("the rail's folding groups", () => {
    it("opens every group the first time", () => {
        draw(rail());
        const buttons = document.querySelectorAll("button[aria-controls]");
        expect(buttons.length).toBeGreaterThanOrEqual(6);
        for (const b of Array.from(buttons)) {
            expect(b.getAttribute("aria-expanded")).toBe("true");
            expect(rowsOf(b as HTMLButtonElement).hidden).toBe(false);
        }
    });

    it("folds a group, says how many rows it holds, and remembers it", () => {
        draw(rail());
        click(groupButton("What you offer"));
        const button = groupButton("What you offer");
        expect(button.getAttribute("aria-expanded")).toBe("false");
        expect(rowsOf(button).hidden).toBe(true);
        // jsdom applies no CSS: a display class (`flex`) would draw the
        // rows in a browser despite `hidden`, so the class must say so too.
        expect(rowsOf(button).classList.contains("hidden")).toBe(true);
        expect(rowsOf(button).classList.contains("flex")).toBe(false);
        expect(button.textContent).toMatch(/items/);
        expect(saved("u1")).toEqual({ "What you offer": false });
    });

    it("keeps a fold and an open across reloads", () => {
        draw(rail());
        click(groupButton("Online"));
        reload(rail());
        expect(groupButton("Online").getAttribute("aria-expanded")).toBe(
            "false",
        );
        click(groupButton("Online"));
        reload(rail());
        expect(groupButton("Online").getAttribute("aria-expanded")).toBe(
            "true",
        );
        expect(saved("u1")).toEqual({ Online: true });
    });

    it("shows the current page's group open without changing what was saved", () => {
        window.localStorage.setItem(
            navFoldsKey("u1"),
            JSON.stringify({ Setup: false, Online: false }),
        );
        pathname = "/settings";
        draw(rail());
        expect(groupButton("Setup").getAttribute("aria-expanded")).toBe("true");
        expect(groupButton("Online").getAttribute("aria-expanded")).toBe(
            "false",
        );
        expect(saved("u1")).toEqual({ Setup: false, Online: false });
    });

    it("rolls up what is waiting inside a folded group", () => {
        draw(rail({ counts: { "/leads": 4 } }));
        click(groupButton("People"));
        expect(
            groupButton("People").querySelector('[aria-label="4 waiting"]'),
        ).not.toBeNull();
    });

    it("ignores folds on the icon rail", () => {
        window.localStorage.setItem(
            navFoldsKey("u1"),
            JSON.stringify({ "What you offer": false }),
        );
        draw(rail({ collapsed: true }));
        expect(document.querySelectorAll("button[aria-controls]")).toHaveLength(
            0,
        );
        expect(
            Array.from(document.querySelectorAll("[hidden]")).filter((el) =>
                el.querySelector("a"),
            ),
        ).toHaveLength(0);
    });

    it("keeps two people's folds apart on one device", () => {
        draw(rail());
        click(groupButton("Money"));
        reload(rail({ userId: "u2" }));
        expect(groupButton("Money").getAttribute("aria-expanded")).toBe("true");
    });

    it("accepts only the menu's own groups from storage", () => {
        window.localStorage.setItem(
            navFoldsKey("u1"),
            JSON.stringify({ Online: false, Nope: false, Money: "no" }),
        );
        draw(rail());
        click(groupButton("Today"));
        expect(saved("u1")).toEqual({ Online: false, Today: false });
    });
});

const sheetGroups: MobileSheetGroup[] = [
    {
        label: "Online",
        rows: [
            {
                key: "/sites",
                label: "Website",
                href: "/sites",
                icon: Home,
                count: 2,
                current: false,
            },
        ],
    },
];

const sheet = (
    <TabBarSheet
        userId="u1"
        groups={sheetGroups}
        note="Everything else."
        trigger={() => <button type="button">More</button>}
    />
);

function openSheet() {
    const more = Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent === "More",
    );
    if (!more) throw new Error("no More");
    // Radix opens on pointer down in some versions, on click in others.
    act(() => {
        more.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
        more.click();
    });
}

describe("the phone's More sheet", () => {
    it("opens every group the first time, and folds from the same state as the rail", () => {
        draw(
            <>
                {rail()}
                {sheet}
            </>,
        );
        openSheet();
        const dialog = document.querySelector('[role="dialog"]');
        if (!dialog) throw new Error("the sheet did not open");
        const inSheet = groupButton("Online", dialog);
        expect(inSheet.getAttribute("aria-expanded")).toBe("true");
        click(inSheet);
        const folded = groupButton("Online", dialog);
        expect(folded.getAttribute("aria-expanded")).toBe("false");
        expect(rowsOf(folded).hidden).toBe(true);
        expect(folded.querySelector('[aria-label="2 waiting"]')).not.toBeNull();
        expect(saved("u1")).toEqual({ Online: false });
        // The rail, drawn beside it, folded too.
        expect(groupButton("Online", host).getAttribute("aria-expanded")).toBe(
            "false",
        );
    });
});
