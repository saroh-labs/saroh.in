// @vitest-environment jsdom
import { act, useState } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EditorModel } from "../shell/editor-model";
import { COMMAND_MENU_READY, CommandMenu } from "./command-menu";

const push = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@saroh/ui/toast", () => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
}));
// Website › Settings' own rows, tested there; here only that they open.
const settingsOpened = vi.fn();
vi.mock("./find-settings-sheet", () => ({
    FindSettingsSheet: ({ which }: { which: string | null }) => {
        if (which) settingsOpened(which);
        return null;
    },
}));
const openAskAi = vi.fn();
vi.mock("@/components/ask-ai/open", () => ({
    openAskAi: () => openAskAi() as unknown,
}));

/**
 * Find (U46c, `fix/WXECommand`): ⌘K's one search, its groups, Enter and
 * Tab, and what a reader finds. Sample data only.
 */
/** The element, or the test fails naming what was missing. */
function must<T>(v: T | null | undefined, what: string): T {
    if (v == null) throw new Error(`No ${what}`);
    return v;
}

let root: Root;
let host: HTMLDivElement;
const setSelectedIndex = vi.fn();
const selectChrome = vi.fn();
const openPageSettings = vi.fn();
const scrollToSection = vi.fn();

function model(readOnly = false): EditorModel {
    const pages = [
        { id: "p-home", path: "/", title: "Home", isHome: true, hidden: false },
        {
            id: "p-contact",
            path: "/contact",
            title: "Contact",
            isHome: false,
            hidden: false,
        },
    ];
    return {
        siteId: "site-1",
        pageId: "p-home",
        pages,
        page: pages[0],
        address: "sample.saroh.app",
        readOnly,
        canUpdateSite: !readOnly,
        askAi: true,
        unsaved: false,
        draft: {
            sections: [
                {
                    type: "hero",
                    version: 2,
                    content: { heading: "Welcome in" },
                },
                {
                    type: "visitUs",
                    version: 1,
                    content: { heading: "Visit us" },
                },
            ],
            onlyHeldBack: false,
            heldBack: [],
        },
        selection: { setSelectedIndex, selectChrome },
        openPageSettings,
        scrollToSection,
    } as unknown as EditorModel;
}

function Harness({ m }: { m: EditorModel }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button type="button" id="opener" onClick={() => setOpen(true)}>
                Find
            </button>
            <CommandMenu model={m} open={open} onOpenChange={setOpen} />
        </>
    );
}

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    // cmdk scrolls the chosen row into view; jsdom has no layout.
    Element.prototype.scrollIntoView = vi.fn();
    vi.clearAllMocks();
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

function open(m = model()) {
    act(() => root.render(<Harness m={m} />));
    const opener = must(document.getElementById("opener"), "opener");
    opener.focus();
    act(() => opener.click());
}

const input = () => document.querySelector<HTMLInputElement>("[cmdk-input]");

function type(text: string) {
    const el = must(input(), "search box");
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set?.call(el, text);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

function press(key: string) {
    act(() => {
        must(input(), "search box").dispatchEvent(
            new KeyboardEvent("keydown", { key, bubbles: true }),
        );
    });
}

const groups = () =>
    Array.from(document.querySelectorAll("[cmdk-group-heading]")).map(
        (h) => h.textContent,
    );
const rows = () =>
    Array.from(document.querySelectorAll("[cmdk-item]")).map(
        (r) => r.textContent,
    );

describe("Find (⌘K) in the editor", () => {
    it("is built, so More shows it and ⌘K opens it", () => {
        expect(COMMAND_MENU_READY).toBe(true);
    });

    it("“address” finds Contact and social and the Visit us section", () => {
        open();
        type("address");
        expect(groups()).toEqual(["Do it here", "On this site", "Ask AI"]);
        const found = rows().join("\n");
        expect(found).toContain("Change the address, phone or social links");
        expect(found).toContain("Change your web address");
        expect(found).toContain("Visit us section");
        expect(found).toContain("Ask AI: “address”");
        expect(found).not.toContain("Welcome in section");
    });

    it("Enter on a section selects it and closes Find", () => {
        open();
        type("visit us section");
        press("Enter");
        expect(setSelectedIndex).toHaveBeenCalledWith(1);
        expect(scrollToSection).toHaveBeenCalledWith(1);
        expect(input()).toBeNull();
    });

    it("Contact and social opens in a sheet, here in the editor", () => {
        open();
        type("phone");
        press("Enter");
        expect(settingsOpened).toHaveBeenCalledWith("contact");
        expect(push).not.toHaveBeenCalled();
    });

    it("Page settings opens the page sheet; Tab asks AI", () => {
        open();
        type("page settings");
        press("Enter");
        expect(openPageSettings).toHaveBeenCalledWith("p-home");
        open();
        type("add a map");
        press("Tab");
        expect(openAskAi).toHaveBeenCalled();
        expect(input()).toBeNull();
    });

    it("Escape closes it and the keyboard goes back", async () => {
        open();
        act(() => {
            document.activeElement?.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
            );
        });
        expect(input()).toBeNull();
        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });
        expect(document.activeElement?.id).toBe("opener");
    });

    it("a reader finds only On this site, and no Ask AI", () => {
        open(model(true));
        expect(groups()).toEqual(["On this site"]);
        type("address");
        expect(groups()).toEqual(["On this site"]);
        expect(rows().join("\n")).toContain("Visit us section");
    });
});
