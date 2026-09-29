// @vitest-environment jsdom
/**
 * The editor's page menu (round 2 G16), as Saroh Site Editor.dc.html draws
 * it: a list of pages with the open one ticked, "Not in menu", a hidden page
 * crossed out; the open page's settings; and "Add a page", which offers the
 * module pages the API says can be added, then a blank page. Refusals are
 * shown in the API's words, never as a code.
 *
 * `react-dom/client` + `act` directly, as the section-field tests do.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Flag, ModulePageKind, SitePage } from "@/lib/sites/service";

import { PagesPanel } from "./pages-panel";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push, refresh, replace: vi.fn() }),
}));

const actions = vi.hoisted(() => ({
    createPage: vi.fn(),
    updatePage: vi.fn(),
    deletePage: vi.fn(),
}));
vi.mock("@/lib/sites/actions", () => actions);

const toast = vi.hoisted(() => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
}));
vi.mock("@saroh/ui/toast", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    ...toast,
}));

const PAGES: SitePage[] = [
    {
        id: "p-home",
        path: "/",
        title: "Home",
        isHome: true,
        hidden: false,
        kind: "FREE",
        inMenu: true,
    },
    {
        id: "p-book",
        path: "/book",
        title: "Book",
        isHome: false,
        hidden: false,
        kind: "BOOK",
        inMenu: true,
    },
    {
        id: "p-story",
        path: "/story",
        title: "Our story",
        isHome: false,
        hidden: false,
        kind: "FREE",
        inMenu: false,
    },
    {
        id: "p-old",
        path: "/old",
        title: "Old offers",
        isHome: false,
        hidden: true,
        kind: "FREE",
    },
];

let root: Root;
let host: HTMLDivElement;
const onClose = vi.fn();

function render({
    pages = PAGES,
    active = "p-home",
    canUpdate = true,
    addable = ["PRICES", "BOOK"] as ModulePageKind[],
    flags = [] as Flag[],
    dirty = false,
} = {}) {
    act(() => {
        root.render(
            <PagesPanel
                siteId="site_1"
                pages={pages}
                activePageId={active}
                dirty={dirty}
                canUpdate={canUpdate}
                addableKinds={addable}
                flags={flags}
                onClose={onClose}
            />,
        );
    });
}

const options = () =>
    Array.from(host.querySelectorAll<HTMLElement>('[role="option"]'));

function button(name: string | RegExp): HTMLButtonElement {
    const hit = Array.from(
        document.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => {
        const label = (b.getAttribute("aria-label") ?? b.textContent).trim();
        return typeof name === "string" ? label === name : name.test(label);
    });
    if (!hit) throw new Error(`No button ${String(name)}`);
    return hit;
}

/** One answer of a labelled choice ("In the menu" › "Hide"). */
function choice(label: string, answer: string): HTMLElement {
    const group = Array.from(
        host.querySelectorAll<HTMLElement>('[role="group"]'),
    ).find((g) => g.firstElementChild?.textContent.trim() === label);
    if (!group) throw new Error(`No "${label}" choice`);
    const found = Array.from(group.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === answer,
    );
    if (!found) throw new Error(`No "${answer}" in "${label}"`);
    return found;
}

async function press(el: HTMLElement) {
    await act(async () => {
        el.click();
        await Promise.resolve();
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

describe("the page menu's list (G16)", () => {
    it("lists every page, ticking the one open", () => {
        render({ active: "p-book" });
        const list = host.querySelector('[role="listbox"]');
        expect(list?.getAttribute("aria-label")).toBe("Page to edit");
        expect(options().map((o) => o.textContent)).toEqual([
            "Home",
            "Book",
            "Our storyNot in menu",
            "Old offers",
        ]);
        const book = options()[1];
        expect(book.getAttribute("aria-selected")).toBe("true");
        expect(book.querySelector("svg")).toBeTruthy();
        expect(options()[0].getAttribute("aria-selected")).toBe("false");
        expect(options()[0].querySelector("svg")).toBeNull();
    });

    it("crosses out a page hidden from the site and says so", () => {
        render();
        const old = options()[3];
        expect(old.querySelector(".line-through")?.textContent).toBe(
            "Old offers",
        );
        expect(old.getAttribute("aria-label")).toBe(
            "Old offers, hidden from the site",
        );
        expect(options()[2].getAttribute("aria-label")).toBe(
            "Our story, not in menu",
        );
    });

    it("never says Home is out of the menu", () => {
        render({
            pages: [{ ...PAGES[0], inMenu: false }],
        });
        expect(host.textContent).not.toContain("Not in menu");
    });

    it("opens another page by its address, and closes", async () => {
        render();
        await press(options()[2]);
        expect(push).toHaveBeenCalledWith("/sites/site_1?page=p-story");
        expect(onClose).toHaveBeenCalled();
    });

    it("won't leave a page with unsaved work", async () => {
        render({ dirty: true });
        await press(options()[1]);
        expect(push).not.toHaveBeenCalled();
        expect(toast.showError).toHaveBeenCalledWith(
            "Save this page before opening another.",
        );
    });

    it("moves between pages with the arrow keys", () => {
        render();
        const first = options()[0];
        act(() => first.focus());
        act(() => {
            first.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "ArrowDown",
                    bubbles: true,
                }),
            );
        });
        expect(document.activeElement).toBe(options()[1]);
        act(() => {
            options()[1].dispatchEvent(
                new KeyboardEvent("keydown", { key: "End", bubbles: true }),
            );
        });
        expect(document.activeElement).toBe(options()[3]);
    });

    it("says a page at a route's address can't be seen, and where to fix it", async () => {
        const flag: Flag = {
            type: "reservedAddress",
            message:
                "This page can't be seen: /book is your booking page. Change its address so visitors can reach it.",
            pageId: "p-walk",
            sectionIndex: null,
            field: "path",
        };
        const walk: SitePage = {
            id: "p-walk",
            path: "/book/walkthrough",
            title: "Walkthrough",
            isHome: false,
            hidden: false,
            kind: "FREE",
        };
        render({ pages: [PAGES[0], walk], active: "p-walk", flags: [flag] });
        expect(options()[1].textContent).toContain("Can't be seen");
        const settings = button(/^Settings for Walkthrough/);
        expect(settings.textContent).toContain("Change address");
        await press(settings);
        expect(host.textContent).toContain(flag.message);
        const address = host.querySelector<HTMLInputElement>("input.font-mono");
        expect(address?.value).toBe("/book/walkthrough");
        expect(address?.getAttribute("aria-invalid")).toBe("true");
    });
});

describe("the open page's settings (G16)", () => {
    it("shows a Book page's address as fixed, never as a field", async () => {
        render({ active: "p-book" });
        await press(button(/^Settings for Book/));
        expect(host.textContent).toContain(
            "/book — your booking page's address",
        );
        expect(host.querySelector("input.font-mono")).toBeNull();
        expect(host.textContent).toContain("Also its name in the menu.");
    });

    it("takes a page out of the menu with Show in menu", async () => {
        actions.updatePage.mockResolvedValue({ ok: true, data: PAGES[2] });
        render({ active: "p-book" });
        await press(button(/^Settings for Book/));
        expect(choice("In the menu", "Show").getAttribute("aria-pressed")).toBe(
            "true",
        );
        await press(choice("In the menu", "Hide"));
        expect(actions.updatePage).toHaveBeenCalledWith("site_1", "p-book", {
            inMenu: false,
        });
        expect(refresh).toHaveBeenCalled();
    });

    it("reads Not in menu back as Hide", async () => {
        render({ active: "p-story" });
        await press(button(/^Settings for Our story/));
        expect(choice("In the menu", "Hide").getAttribute("aria-pressed")).toBe(
            "true",
        );
    });

    it("offers the address the API suggests when a rename is refused", async () => {
        actions.updatePage.mockResolvedValue({
            ok: false,
            error: "/shop is your shop, so a page can't use /shop/sale. Pick another address, such as /sale.",
            suggestion: "/sale",
        });
        render({ active: "p-story" });
        await press(button(/^Settings for Our story/));
        const address = host.querySelector<HTMLInputElement>("input.font-mono");
        if (!address) throw new Error("No address field");
        act(() => {
            Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value",
            )?.set?.call(address, "/shop/sale");
            address.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await press(button("Save"));
        expect(actions.updatePage).toHaveBeenCalledWith("site_1", "p-story", {
            path: "/shop/sale",
        });
        expect(host.querySelector('[role="alert"]')?.textContent).toContain(
            "Pick another address, such as /sale.",
        );
        await press(button("Use /sale"));
        expect(address.value).toBe("/sale");
    });

    it("has no switches or Delete for Home", async () => {
        render();
        await press(button(/^Settings for Home/));
        expect(host.querySelector('[role="group"]')).toBeNull();
        expect(() => button("Delete page…")).toThrow();
    });

    it("shows the settings read-only without site:update", async () => {
        render({ active: "p-story", canUpdate: false, addable: [] });
        await press(button(/^Settings for Our story/));
        expect(host.querySelector('[role="note"]')?.textContent).toContain(
            "not its title, address or place in the menu",
        );
        expect(choice("In the menu", "Show").hasAttribute("disabled")).toBe(
            true,
        );
        expect(() => button("Save")).toThrow();
    });
});

describe("Add a page (G16)", () => {
    it("offers the module pages that can be added, in menu order, then Blank page", async () => {
        render({ addable: ["PRICES", "BOOK"] });
        await press(button("Add a page"));
        const offered = Array.from(
            host.querySelectorAll('[aria-label="Pages to add"] button'),
        ).map((b) => b.textContent);
        expect(offered).toEqual([
            "Book/bookYour services, each opening a time to book",
            "Prices/pricesYour plans on sale",
        ]);
        expect(button("Blank page")).toBeTruthy();
    });

    it("adds a Book page in one press and opens it", async () => {
        actions.createPage.mockResolvedValue({
            ok: true,
            data: { ...PAGES[1], id: "p-new" },
        });
        render();
        await press(button("Add a page"));
        await press(button(/^Book\/book/));
        expect(actions.createPage).toHaveBeenCalledWith("site_1", {
            kind: "BOOK",
        });
        expect(toast.showSuccess).toHaveBeenCalledWith("Added Book.");
        expect(push).toHaveBeenCalledWith("/sites/site_1?page=p-new");
    });

    it("says why a module page was refused, in the merchant's words", async () => {
        actions.createPage.mockResolvedValue({
            ok: false,
            error: "Appointments is switched off. Turn it on in Settings › Modules to add a Book page.",
        });
        render();
        await press(button("Add a page"));
        await press(button(/^Book\/book/));
        const alert = host.querySelector('[role="alert"]');
        expect(alert?.textContent).toBe(
            "Appointments is switched off. Turn it on in Settings › Modules to add a Book page.",
        );
        expect(alert?.textContent).not.toMatch(/module_off|409/);
    });

    it("adds it at the address the API suggests, in one more press", async () => {
        actions.createPage
            .mockResolvedValueOnce({
                ok: false,
                error: 'The path /prices is already used by "Rates". Pick another address, such as /pricing.',
                suggestion: "/pricing",
            })
            .mockResolvedValueOnce({
                ok: true,
                data: { ...PAGES[2], id: "p-prices", title: "Prices" },
            });
        render();
        await press(button("Add a page"));
        await press(button(/^Prices\/prices/));
        await press(button("Add it at /pricing"));
        expect(actions.createPage).toHaveBeenLastCalledWith("site_1", {
            kind: "PRICES",
            path: "/pricing",
        });
        expect(push).toHaveBeenCalledWith("/sites/site_1?page=p-prices");
    });

    it("adds a blank page with a title and an address", async () => {
        actions.createPage.mockResolvedValue({
            ok: true,
            data: { ...PAGES[2], id: "p-faq", title: "FAQ" },
        });
        render({ addable: [] });
        await press(button("Add a page"));
        // Nothing else to offer: straight to the blank page's fields.
        const [title, path] = Array.from(
            host.querySelectorAll<HTMLInputElement>("input"),
        );
        const set = (input: HTMLInputElement | undefined, value: string) =>
            act(() => {
                if (!input) throw new Error("No field");
                Object.getOwnPropertyDescriptor(
                    HTMLInputElement.prototype,
                    "value",
                )?.set?.call(input, value);
                input.dispatchEvent(new Event("input", { bubbles: true }));
            });
        set(title, "FAQ");
        set(path, "/faq");
        await press(button("Add page"));
        expect(actions.createPage).toHaveBeenCalledWith("site_1", {
            title: "FAQ",
            path: "/faq",
        });
    });

    it("is off without site:update, with the reason beside it", () => {
        render({ canUpdate: false, addable: [] });
        const add = button("Add a page");
        expect(add.disabled).toBe(true);
        const reason = document.getElementById(
            add.getAttribute("aria-describedby") ?? "",
        );
        expect(reason?.textContent).toBe(
            "Adding a page needs a role that can change the website's settings.",
        );
    });
});
