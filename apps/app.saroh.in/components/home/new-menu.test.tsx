// @vitest-environment jsdom
/**
 * Home's New (DEC-171, plan U5): the desk's menu by the greeting and the
 * phone's + sheet, for each kind of person. What is offered comes from
 * the permissions the API resolved (`homeNewFor`), so a Member is offered
 * Book someone and told, once, what else their role leaves out; someone
 * who may start none of them gets no New at all. Keyboard: Enter opens on
 * the first row, the arrows move, Escape closes and focus goes back.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { homeNewFor } from "@/components/shared/quick-actions";

import { HomeHeader } from "./home-header";
import { NewMenu } from "./new-menu";
import { NewSheet } from "./new-sheet";

const FLOOR = [
    "org:read",
    "member:read",
    "store:read",
    "site:read",
    "module:read",
    "booking:read",
    "service:read",
    "contact:read",
];
const ROLES = {
    owner: [...FLOOR, "order:create", "booking:write", "invoice:write"],
    admin: [...FLOOR, "order:create", "booking:write", "invoice:write"],
    member: [...FLOOR, "order:stage", "booking:write", "hours:write"],
    reviewer: ["site:read", "site:comment", "site:approve"],
    // A role the business made: the till and the bills, no diary.
    custom: [...FLOOR, "order:create", "invoice:write"],
} as const;
const MODULES = ["COMMERCE", "APPOINTMENTS", "PAYMENTS"];
const newFor = (role: keyof typeof ROLES) =>
    homeNewFor({ moduleKeys: MODULES, actions: ROLES[role] });

let root: Root;
let host: HTMLDivElement;

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
    document.body.innerHTML = "";
});

const settle = () => new Promise((r) => setTimeout(r, 20));
const key = (el: Element, k: string) =>
    el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));

function newButton(): HTMLButtonElement | null {
    return (
        Array.from(host.querySelectorAll("button")).find(
            (b) => b.textContent.trim() === "New",
        ) ?? null
    );
}
const plus = () =>
    host.querySelector<HTMLButtonElement>('button[aria-label="New"]');
const menu = () => document.body.querySelector<HTMLElement>("[role=menu]");
const sheet = () => document.body.querySelector<HTMLElement>("[role=dialog]");
const rows = (within: ParentNode | null) =>
    Array.from(
        within?.querySelectorAll<HTMLAnchorElement>("a[href]") ?? [],
    ).map((a) => [
        a.querySelector("span.font-semibold")?.textContent,
        a.getAttribute("href"),
    ]);

async function openMenu() {
    const trigger = newButton();
    if (!trigger) throw new Error("No New button");
    trigger.focus();
    await act(async () => {
        key(trigger, "Enter");
        await settle();
    });
    return menu();
}

async function openSheet() {
    const trigger = plus();
    if (!trigger) throw new Error("No + button");
    await act(async () => {
        trigger.click();
        await settle();
    });
    return sheet();
}

describe("the desk's New menu, by role", () => {
    it("offers an Owner all three starts, each to its own flow", async () => {
        act(() => root.render(<NewMenu {...newFor("owner")} />));
        expect(newButton()?.getAttribute("aria-haspopup")).toBe("menu");
        const open = await openMenu();
        expect(rows(open)).toEqual([
            ["Take an order", "/commerce/orders?new=1"],
            ["Book someone", "/bookings?new=1"],
            ["Send an invoice", "/billing/invoices/new"],
        ]);
        expect(open?.querySelectorAll("[role=menuitem]")).toHaveLength(3);
        expect(open?.textContent).toContain("In the shop or on the phone");
        expect(open?.textContent).not.toContain("part of your role");
    });

    it("offers an Admin all three", async () => {
        act(() => root.render(<NewMenu {...newFor("admin")} />));
        expect(rows(await openMenu())).toHaveLength(3);
    });

    it("offers a Member Book someone, and names the rest in one line", async () => {
        act(() => root.render(<NewMenu {...newFor("member")} />));
        const open = await openMenu();
        expect(rows(open)).toEqual([["Book someone", "/bookings?new=1"]]);
        const line =
            "Taking orders and sending invoices aren't part of your role. An owner or admin can change this in Settings › Team.";
        expect(open?.textContent).toContain(line);
        // The menu is described by the line, and the line is not a row.
        const noteId = open?.getAttribute("aria-describedby");
        expect(noteId).toBeTruthy();
        const note = document.getElementById(noteId ?? "");
        expect(note?.textContent).toBe(line);
        expect(note?.getAttribute("role")).toBe("presentation");
        expect(open?.querySelectorAll("[role=menuitem]")).toHaveLength(1);
    });

    it("offers a role the business made what it was given", async () => {
        act(() => root.render(<NewMenu {...newFor("custom")} />));
        const open = await openMenu();
        expect(rows(open).map(([label]) => label)).toEqual([
            "Take an order",
            "Send an invoice",
        ]);
        expect(open?.textContent).toContain(
            "Booking people isn't part of your role.",
        );
    });

    it("draws nothing for a Reviewer, who may start none of them", () => {
        act(() => root.render(<NewMenu {...newFor("reviewer")} />));
        expect(host.innerHTML).toBe("");
    });
});

describe("the desk's New menu, by keyboard", () => {
    it("Enter opens it on the first row, the arrows move, Escape closes and focus goes back", async () => {
        act(() => root.render(<NewMenu {...newFor("owner")} />));
        const trigger = newButton();
        const open = await openMenu();
        expect(trigger?.getAttribute("aria-expanded")).toBe("true");
        const items = Array.from(
            open?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [],
        );
        expect(document.activeElement).toBe(items[0]);

        await act(async () => {
            key(items[0], "ArrowDown");
            await settle();
        });
        expect(document.activeElement).toBe(items[1]);
        await act(async () => {
            key(items[1], "ArrowUp");
            await settle();
        });
        expect(document.activeElement).toBe(items[0]);

        await act(async () => {
            key(items[0], "Escape");
            await settle();
        });
        expect(menu()).toBeNull();
        expect(trigger?.getAttribute("aria-expanded")).toBe("false");
        expect(document.activeElement).toBe(trigger);
    });
});

describe("the phone's + sheet", () => {
    it("opens New with an Owner's three rows, each 54px and closing the sheet as it goes", async () => {
        act(() => root.render(<NewSheet {...newFor("owner")} />));
        const trigger = plus();
        // Hidden from the rail's width up, where the menu is.
        expect(trigger?.className).toContain("desk:hidden");
        const open = await openSheet();
        expect(open?.querySelector("h2")?.textContent).toBe("New");
        expect(rows(open)).toEqual([
            ["Take an order", "/commerce/orders?new=1"],
            ["Book someone", "/bookings?new=1"],
            ["Send an invoice", "/billing/invoices/new"],
        ]);
        for (const link of Array.from(open?.querySelectorAll("a") ?? [])) {
            expect(link.className).toContain("min-h-[54px]");
        }
        // Focus starts on Close, at the top of the sheet.
        expect(document.activeElement?.getAttribute("aria-label")).toBe(
            "Close",
        );
        await act(async () => {
            // jsdom can't follow a link; the sheet closing is what's asked.
            document.addEventListener("click", (e) => e.preventDefault(), {
                once: true,
            });
            open?.querySelector("a")?.click();
            await settle();
        });
        expect(sheet()).toBeNull();
    });

    it("offers a Member Book someone and the role line", async () => {
        act(() => root.render(<NewSheet {...newFor("member")} />));
        const open = await openSheet();
        expect(rows(open)).toEqual([["Book someone", "/bookings?new=1"]]);
        expect(open?.textContent).toContain(
            "Taking orders and sending invoices aren't part of your role. An owner or admin can change this in Settings › Team.",
        );
    });

    it("Escape closes it and focus goes back to the +", async () => {
        act(() => root.render(<NewSheet {...newFor("admin")} />));
        const open = await openSheet();
        if (!open) throw new Error("No New sheet");
        await act(async () => {
            key(open, "Escape");
            await settle();
        });
        expect(sheet()).toBeNull();
        expect(document.activeElement).toBe(plus());
    });

    it("Close closes it", async () => {
        act(() => root.render(<NewSheet {...newFor("custom")} />));
        const open = await openSheet();
        await act(async () => {
            open?.querySelector<HTMLButtonElement>(
                '[aria-label="Close"]',
            )?.click();
            await settle();
        });
        expect(sheet()).toBeNull();
    });

    it("draws no + for a Reviewer", () => {
        act(() => root.render(<NewSheet {...newFor("reviewer")} />));
        expect(plus()).toBeNull();
    });
});

describe("Home's header", () => {
    const draw = (newMenu: ReturnType<typeof newFor> | null) =>
        act(() =>
            root.render(
                <HomeHeader
                    lastDay={null}
                    name="Asha"
                    businessName="Rye & Co."
                    newMenu={newMenu}
                />,
            ),
        );

    it("puts New level with the greeting and the + over the tab bar", () => {
        draw(newFor("owner"));
        const side = host.querySelector('[data-slot="page-actions"]');
        expect(side?.textContent).toContain("New");
        expect(plus()).not.toBeNull();
    });

    it("draws neither, and no empty action slot, when nothing is offered", () => {
        draw(newFor("reviewer"));
        expect(newButton()).toBeNull();
        expect(plus()).toBeNull();
        expect(host.querySelector('[data-slot="page-actions"]')).toBeNull();
        draw(null);
        expect(newButton()).toBeNull();
    });
});
