// @vitest-environment jsdom
/**
 * The one leave guard (`useLeaveGuard`), on a stand-in form: a link asks
 * when something is unsaved and not otherwise, Stay keeps what was typed,
 * Leave goes, the ⌘K menu asks the same way, and the browser's own
 * tab-close warning is on only while there is something to lose.
 */
import { act, useState } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LeaveGuardOptions } from "@/components/shared/use-leave-guard";
import {
    LEAVE_TITLE,
    lostChanges,
    lostNew,
    useLeaveGuard,
} from "@/components/shared/use-leave-guard";
import { mayNavigate } from "@/lib/nav/leave-request";

const push = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    push.mockReset();
    window.history.replaceState(null, "", "/commerce/discounts/new?from=list");
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

type Extra = Pick<LeaveGuardOptions, "save" | "flush" | "keeps">;

function Flow({ extra }: { extra: Extra }) {
    const [text, setText] = useState("");
    const guard = useLeaveGuard({
        dirty: text !== "",
        lost: lostNew("code"),
        ...extra,
    });
    return (
        <div>
            <input
                aria-label="Code"
                value={text}
                onChange={(e) => setText(e.target.value)}
            />
            {/* Plain links: the guard catches any <a>, Next's or not. */}
            {/* eslint-disable @next/next/no-html-link-for-pages */}
            <a id="rail" href="/commerce/orders">
                Orders
            </a>
            <a id="same" href="/commerce/discounts/new?from=list#help">
                Help on this page
            </a>
            <a id="tab" href="/commerce/discounts/new?tab=usage">
                Usage
            </a>
            <a id="out" href="/help" target="_blank" rel="noreferrer">
                Help
            </a>
            <a id="away" href="https://example.com/">
                Elsewhere
            </a>
            <div data-leave-guard="off">
                <a id="canvas" href="/about">
                    About, on the merchant&apos;s page
                </a>
            </div>
            {/* eslint-enable @next/next/no-html-link-for-pages */}
            <button type="button" onClick={() => guard.leaveTo("/commerce")}>
                Back to Sell
            </button>
            {guard.dialog}
        </div>
    );
}

function render(extra: Extra = {}) {
    act(() => root.render(<Flow extra={extra} />));
}

function typeCode(value: string) {
    const input = host.querySelector<HTMLInputElement>("input");
    if (!input) throw new Error("No field");
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

/** Click, and say whether the browser would have followed the link. */
function click(el: Element, init: MouseEventInit = {}): boolean {
    // The guard stops a click it holds before anything else hears it. One
    // it lets through reaches here, where jsdom is kept from navigating.
    let followed = false;
    const note = (e: Event) => {
        followed = !e.defaultPrevented;
        e.preventDefault();
    };
    host.addEventListener("click", note);
    act(() => {
        el.dispatchEvent(
            new MouseEvent("click", {
                bubbles: true,
                cancelable: true,
                ...init,
            }),
        );
    });
    host.removeEventListener("click", note);
    return followed;
}

const link = (id: string) => {
    const el = host.querySelector(`#${id}`);
    if (!el) throw new Error(`No link ${id}`);
    return el;
};
const dialog = () => document.querySelector("[role=alertdialog]");
function button(name: string): HTMLButtonElement {
    const hit = Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === name,
    );
    if (!hit) throw new Error(`No button ${name}`);
    return hit;
}
const settle = () =>
    act(async () => {
        await Promise.resolve();
    });

/** Whether closing the tab now would bring up the browser's warning. */
function tabCloseWarns(): boolean {
    const e = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
}

describe("useLeaveGuard", () => {
    it("lets a link go when nothing has changed", () => {
        render();
        expect(click(link("rail"))).toBe(true);
        expect(dialog()).toBeNull();
        expect(push).not.toHaveBeenCalled();
    });

    it("asks before a link leaves with something unsaved", () => {
        render();
        typeCode("WELCOME10");
        expect(click(link("rail"))).toBe(false);
        expect(push).not.toHaveBeenCalled();
        expect(dialog()?.textContent).toContain(LEAVE_TITLE);
        expect(dialog()?.textContent).toContain(
            "The code isn't created yet, so nothing you've entered will be kept.",
        );
        // Stay and Leave, and no Save and leave where no draft can be kept.
        const names = Array.from(
            dialog()?.querySelectorAll("button") ?? [],
        ).map((b) => b.textContent.trim());
        expect(names).toEqual(["Leave", "Stay"]);
    });

    it("puts the keyboard on Stay", () => {
        render();
        typeCode("WELCOME10");
        click(link("rail"));
        expect(document.activeElement).toBe(button("Stay"));
    });

    it("Stay closes the question and keeps what was typed", () => {
        render();
        typeCode("WELCOME10");
        click(link("rail"));
        act(() => button("Stay").click());
        expect(dialog()).toBeNull();
        expect(push).not.toHaveBeenCalled();
        expect(host.querySelector("input")?.value).toBe("WELCOME10");
        // Still unsaved, so the next way out asks again.
        expect(click(link("rail"))).toBe(false);
        expect(dialog()).not.toBeNull();
    });

    it("Leave goes where the link pointed", () => {
        render();
        typeCode("WELCOME10");
        click(link("rail"));
        act(() => button("Leave").click());
        expect(push).toHaveBeenCalledWith("/commerce/orders");
        expect(dialog()).toBeNull();
    });

    it("clean again after the change is put back", () => {
        render();
        typeCode("W");
        typeCode("");
        expect(click(link("rail"))).toBe(true);
        expect(dialog()).toBeNull();
    });

    it("lets through what doesn't leave: this page, a new tab, another site, a modified click", () => {
        render();
        typeCode("WELCOME10");
        expect(click(link("same"))).toBe(true);
        expect(click(link("out"))).toBe(true);
        expect(click(link("away"))).toBe(true);
        expect(click(link("rail"), { metaKey: true })).toBe(true);
        // The site editor's canvas answers the merchant's links itself.
        expect(click(link("canvas"))).toBe(true);
        expect(dialog()).toBeNull();
    });

    it("asks for another address of the same page unless the flow keeps it", () => {
        render();
        typeCode("WELCOME10");
        expect(click(link("tab"))).toBe(false);
        act(() => button("Stay").click());

        render({ keeps: (to) => to.pathname === "/commerce/discounts/new" });
        expect(click(link("tab"))).toBe(true);
        expect(click(link("rail"))).toBe(false);
    });

    it("holds the command menu and Search settings the same way", () => {
        render();
        expect(mayNavigate("/settings")).toBe(true);
        typeCode("WELCOME10");
        let may = true;
        act(() => {
            may = mayNavigate("/settings");
        });
        expect(may).toBe(false);
        expect(dialog()).not.toBeNull();
        act(() => button("Leave").click());
        expect(push).toHaveBeenCalledWith("/settings");
    });

    it("asks from the flow's own button too", () => {
        render();
        act(() => button("Back to Sell").click());
        expect(push).toHaveBeenCalledWith("/commerce");
        push.mockReset();

        typeCode("WELCOME10");
        act(() => button("Back to Sell").click());
        expect(push).not.toHaveBeenCalled();
        expect(dialog()).not.toBeNull();
    });

    it("warns on tab close only while something is unsaved", () => {
        render();
        expect(tabCloseWarns()).toBe(false);
        typeCode("WELCOME10");
        expect(tabCloseWarns()).toBe(true);
        typeCode("");
        expect(tabCloseWarns()).toBe(false);
    });

    it("stops warning once the person has chosen to leave", () => {
        render();
        typeCode("WELCOME10");
        click(link("rail"));
        act(() => button("Leave").click());
        expect(tabCloseWarns()).toBe(false);
    });

    it("offers Save and leave where a draft can be kept, and goes once it is", async () => {
        const save = vi.fn().mockResolvedValue(true);
        render({ save });
        typeCode("WELCOME10");
        click(link("rail"));
        const names = Array.from(
            dialog()?.querySelectorAll("button") ?? [],
        ).map((b) => b.textContent.trim());
        expect(names).toEqual(["Leave", "Save and leave", "Stay"]);
        act(() => button("Save and leave").click());
        await settle();
        expect(save).toHaveBeenCalledTimes(1);
        expect(push).toHaveBeenCalledWith("/commerce/orders");
    });

    it("stays when Save and leave couldn't save", async () => {
        render({ save: vi.fn().mockResolvedValue(false) });
        typeCode("WELCOME10");
        click(link("rail"));
        act(() => button("Save and leave").click());
        await settle();
        expect(push).not.toHaveBeenCalled();
        expect(dialog()).toBeNull();
        expect(host.querySelector("input")?.value).toBe("WELCOME10");
    });

    it("an editor that saves by itself goes without asking once its save lands", async () => {
        const flush = vi.fn().mockResolvedValue(true);
        render({ flush });
        typeCode("WELCOME10");
        expect(click(link("rail"))).toBe(false);
        await settle();
        expect(flush).toHaveBeenCalledTimes(1);
        expect(dialog()).toBeNull();
        expect(push).toHaveBeenCalledWith("/commerce/orders");
    });

    it("and asks when that save fails", async () => {
        render({ flush: vi.fn().mockResolvedValue(false) });
        typeCode("WELCOME10");
        click(link("rail"));
        await settle();
        expect(push).not.toHaveBeenCalled();
        expect(dialog()?.textContent).toContain(LEAVE_TITLE);
    });
});

describe("what would be lost", () => {
    it("is one plain sentence, with no dash or semicolon", () => {
        for (const s of [lostNew("invoice"), lostChanges("this course")]) {
            expect(s).toMatch(/^[A-Z].*\.$/);
            expect(s).not.toMatch(/[—–;]/);
            expect(s.split(". ")).toHaveLength(1);
        }
        expect(lostChanges("this course")).toBe(
            "Your changes to this course will be lost.",
        );
    });
});
