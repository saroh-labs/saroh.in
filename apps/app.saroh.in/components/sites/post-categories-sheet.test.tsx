// @vitest-environment jsdom
/**
 * Website › Posts › Categories: a sheet on the Posts tab, read first. The
 * list shows with nothing open; "New category" puts the one field in the
 * footer on demand; Rename opens a small dialog and never turns the row
 * into a form. A refusal keeps what was typed; a save puts it away.
 *
 * `react-dom/client` + `act` directly, as the other component tests do. The
 * sheet's and the dialog's parts are drawn in place: a portal and Radix's
 * focus handling are not what is tested here.
 */
import type { ReactElement, ReactNode } from "react";
import { act, cloneElement, createContext, useContext } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PostCategory } from "@/lib/content/service";

import { PostCategoriesSheet } from "./post-categories-sheet";

const createPostCategory = vi.fn();
const updatePostCategory = vi.fn();
const deletePostCategory = vi.fn();
vi.mock("@/lib/content/actions", () => ({
    createPostCategory: (...a: unknown[]) =>
        createPostCategory(...a) as unknown,
    updatePostCategory: (...a: unknown[]) =>
        updatePostCategory(...a) as unknown,
    deletePostCategory: (...a: unknown[]) =>
        deletePostCategory(...a) as unknown,
}));
const refresh = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh }),
    useSearchParams: () => new URLSearchParams(search),
}));
const showSuccess = vi.fn();
const showError = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showSuccess: (...a: unknown[]) => showSuccess(...a) as unknown,
    showError: (...a: unknown[]) => showError(...a) as unknown,
}));
vi.mock("@/components/shared/confirm-dialog", () => ({
    ConfirmDialog: () => null,
}));

/** An overlay drawn in place: its trigger always, its content while open. */
function overlay(role: string) {
    const Ctx = createContext<{
        open: boolean;
        set: (open: boolean) => void;
    }>({ open: false, set: () => undefined });
    const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
    return {
        Root: ({
            open,
            onOpenChange,
            children,
        }: {
            open: boolean;
            onOpenChange: (open: boolean) => void;
            children?: ReactNode;
        }) => (
            <Ctx.Provider value={{ open, set: onOpenChange }}>
                {children}
            </Ctx.Provider>
        ),
        Trigger: ({
            children,
        }: {
            children: ReactElement<{ onClick?: () => void }>;
        }) => {
            const { set } = useContext(Ctx);
            return cloneElement(children, { onClick: () => set(true) });
        },
        Content: ({ children }: { children?: ReactNode }) =>
            useContext(Ctx).open ? <div role={role}>{children}</div> : null,
        Title: ({ children }: { children?: ReactNode }) => (
            <h2 data-title="">{children}</h2>
        ),
        Pass,
    };
}
vi.mock("@saroh/ui/sheet", () => {
    const o = overlay("dialog");
    return {
        Sheet: o.Root,
        SheetTrigger: o.Trigger,
        SheetContent: o.Content,
        SheetTitle: o.Title,
        SheetHeader: o.Pass,
        SheetDescription: o.Pass,
        SheetFooter: o.Pass,
    };
});
vi.mock("@saroh/ui/dialog", () => {
    const o = overlay("alertdialog");
    return {
        Dialog: o.Root,
        DialogTrigger: o.Trigger,
        DialogContent: o.Content,
        DialogTitle: o.Title,
        DialogHeader: o.Pass,
        DialogDescription: o.Pass,
        DialogFooter: o.Pass,
    };
});

const CATEGORIES: PostCategory[] = [
    { id: "c1", name: "News", slug: "news", _count: { posts: 2 } },
    { id: "c2", name: "Recipes", slug: "recipes", _count: { posts: 1 } },
];

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    search = "";
    for (const m of [
        createPostCategory,
        updatePostCategory,
        deletePostCategory,
        refresh,
        showSuccess,
        showError,
    ])
        m.mockReset();
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

function render(categories: PostCategory[] | null = CATEGORIES) {
    act(() =>
        root.render(
            <PostCategoriesSheet siteId="site_1" categories={categories} />,
        ),
    );
}

function button(name: string, within: ParentNode = host) {
    return Array.from(within.querySelectorAll("button")).find(
        (b) =>
            b.textContent.trim() === name ||
            b.getAttribute("aria-label") === name,
    );
}

const sheet = () => host.querySelector<HTMLElement>('[role="dialog"]');
const rename = () => host.querySelector<HTMLElement>('[role="alertdialog"]');

function typeInto(el: HTMLInputElement, value: string) {
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

async function submit(form: HTMLFormElement | null | undefined) {
    if (!form) throw new Error("No form");
    await act(async () => {
        form.dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
        );
        await Promise.resolve();
    });
}

function openSheet() {
    act(() => button("Categories")?.click());
}

describe("post categories, from the Posts tab", () => {
    it("is one button until it is opened", () => {
        render();
        expect(button("Categories")).toBeDefined();
        expect(sheet()).toBe(null);
        expect(host.querySelector("input")).toBe(null);
    });

    it("opens a sheet named Post categories, the list first", () => {
        render();
        openSheet();
        expect(sheet()?.querySelector("[data-title]")?.textContent).toBe(
            "Post categories",
        );
        expect(sheet()?.textContent).toContain("News");
        expect(sheet()?.textContent).toContain("2 posts");
        expect(sheet()?.textContent).toContain("Recipes");
        expect(sheet()?.textContent).toContain("1 post");
        expect(button("Rename News")).toBeDefined();
        expect(button("Delete News")).toBeDefined();
        // Nothing to fill in until it is asked for.
        expect(sheet()?.querySelector("input")).toBe(null);
        expect(button("New category")).toBeDefined();
        expect(button("Done")).toBeDefined();
    });

    it("opens on arrival from the old address", () => {
        search = "categories=1";
        render();
        expect(sheet()).not.toBe(null);
    });

    it("drops the ask from the address when it closes", () => {
        search = "categories=1";
        window.history.replaceState(
            null,
            "",
            "/sites/site_1/posts?categories=1",
        );
        render();
        act(() => button("Done")?.click());
        expect(sheet()).toBe(null);
        expect(window.location.pathname).toBe("/sites/site_1/posts");
        expect(window.location.search).toBe("");
    });

    it("says none yet, with the way to add one", () => {
        render([]);
        openSheet();
        expect(sheet()?.textContent).toContain("No categories yet");
        expect(button("New category")).toBeDefined();
    });

    it("says a list that couldn't be read is not an empty one", () => {
        render(null);
        openSheet();
        expect(sheet()?.textContent).toContain(
            "Categories could not be loaded",
        );
        expect(sheet()?.textContent).not.toContain("No categories yet");
        expect(button("New category")).toBeUndefined();
        act(() => button("Try again")?.click());
        expect(refresh).toHaveBeenCalledTimes(1);
    });
});

describe("adding a category", () => {
    function startAdding() {
        render();
        openSheet();
        act(() => button("New category")?.click());
        const input = sheet()?.querySelector("input");
        if (!input) throw new Error("No name field");
        return input;
    }

    it("puts the name field under the list, which stays", () => {
        const input = startAdding();
        expect(input.labels?.[0]?.textContent).toBe("Category name");
        expect(sheet()?.textContent).toContain("News");
        expect(button("Add category")).toBeDefined();
        expect(button("Cancel")).toBeDefined();
        expect(button("New category")).toBeUndefined();
    });

    it("keeps the field and what was typed when it is refused", async () => {
        createPostCategory.mockResolvedValue({
            ok: false,
            error: "A category with that name already exists.",
        });
        const input = startAdding();
        typeInto(input, " News ");
        await submit(input.form);
        expect(createPostCategory).toHaveBeenCalledWith("site_1", {
            name: "News",
        });
        expect(showError).toHaveBeenCalledWith(
            "A category with that name already exists.",
        );
        expect(sheet()?.querySelector("input")?.value).toBe(" News ");
        expect(refresh).not.toHaveBeenCalled();
    });

    it("puts the field away once it is added, and the sheet stays", async () => {
        createPostCategory.mockResolvedValue({
            ok: true,
            data: { id: "c3" },
        });
        const input = startAdding();
        typeInto(input, "Events");
        await submit(input.form);
        expect(showSuccess).toHaveBeenCalledWith("Category created");
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(sheet()).not.toBe(null);
        expect(sheet()?.querySelector("input")).toBe(null);
        expect(button("New category")).toBeDefined();
    });

    it("Cancel puts the field away and sends nothing", () => {
        startAdding();
        act(() => button("Cancel")?.click());
        expect(sheet()?.querySelector("input")).toBe(null);
        expect(createPostCategory).not.toHaveBeenCalled();
    });
});

describe("renaming a category", () => {
    function startRenaming() {
        render();
        openSheet();
        act(() => button("Rename News")?.click());
        const input = rename()?.querySelector("input");
        if (!input) throw new Error("No name field");
        return input;
    }

    it("opens a dialog named Rename category; the row stays a row", () => {
        const input = startRenaming();
        expect(rename()?.querySelector("[data-title]")?.textContent).toBe(
            "Rename category",
        );
        expect(input.value).toBe("News");
        expect(input.labels?.[0]?.textContent).toBe("Name");
        // The row behind is still the row: its name, count and actions.
        // (The one field on screen is the dialog's, drawn in place here.)
        const row = sheet()?.querySelector("li");
        expect(row?.querySelector("p")?.textContent).toBe("News");
        expect(row?.textContent).toContain("2 posts");
        expect(button("Rename News")).toBeDefined();
        expect(button("Delete News")).toBeDefined();
        expect(host.querySelectorAll("input")).toHaveLength(1);
    });

    it("stays open with what was typed when it is refused", async () => {
        updatePostCategory.mockResolvedValue({
            ok: false,
            error: "A category with that name already exists.",
        });
        const input = startRenaming();
        typeInto(input, "Recipes");
        await submit(input.form);
        // The slug is kept, so links to the category keep working.
        expect(updatePostCategory).toHaveBeenCalledWith("site_1", "c1", {
            name: "Recipes",
            slug: "news",
        });
        expect(showError).toHaveBeenCalledWith(
            "A category with that name already exists.",
        );
        expect(rename()?.querySelector("input")?.value).toBe("Recipes");
    });

    it("closes once it is saved", async () => {
        updatePostCategory.mockResolvedValue({ ok: true, data: { id: "c1" } });
        const input = startRenaming();
        typeInto(input, "Updates");
        await submit(input.form);
        expect(showSuccess).toHaveBeenCalledWith("Renamed to Updates");
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(rename()).toBe(null);
        expect(sheet()).not.toBe(null);
    });

    it("closes without saving a name that didn't change", async () => {
        const input = startRenaming();
        await submit(input.form);
        expect(updatePostCategory).not.toHaveBeenCalled();
        expect(rename()).toBe(null);
    });
});
