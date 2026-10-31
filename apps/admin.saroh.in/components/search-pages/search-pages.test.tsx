/** @vitest-environment jsdom */
import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PageRow } from "@/lib/search-page-words";

// Radix measures its controls; jsdom has no ResizeObserver.
vi.stubGlobal(
    "ResizeObserver",
    class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
    },
);

const searchPageAction = vi.fn();
vi.mock("@/lib/search-page-actions", () => ({
    searchPageAction: (...args: unknown[]) =>
        searchPageAction(...args) as unknown,
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const showSuccess = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showSuccess: (...args: unknown[]) => showSuccess(...args) as unknown,
}));

import { SearchPageDialog } from "./search-page-dialog";
import { SearchPagesTable } from "./search-pages-table";

const row = (slug: string, state: PageRow["state"]): PageRow => ({
    path: `/for/${slug}`,
    slug,
    kind: "for",
    inApp: false,
    name: slug.charAt(0).toUpperCase() + slug.slice(1),
    family: "Beauty",
    search: `${slug} software`,
    updated: "2026-10-26",
    state,
    record: null,
});

const table = (canPublish: boolean) =>
    render(
        <SearchPagesTable
            rows={[
                row("salons", "live"),
                row("spas", "draft"),
                row("old", "archived"),
            ]}
            site="saroh.in"
            reviewSite="saroh.io"
            reviewUrl="https://saroh.io"
            canPublish={canPublish}
        />,
    );

describe("SearchPagesTable (DEC-193)", () => {
    it("chooses between trade pages and free tools by address, with a count each (#1253)", () => {
        render(
            <SearchPagesTable
                kind="tools"
                kindCounts={{ for: 34, tools: 3 }}
                rows={[{ ...row("no-show", "draft"), kind: "tools" }]}
                site="saroh.in"
                reviewSite="saroh.io"
                reviewUrl="https://saroh.io"
                canPublish={false}
            />,
        );
        expect(
            screen
                .getByRole("link", { name: /Free tools · \/tools\/ · 3/ })
                .getAttribute("href"),
        ).toBe("/search-pages?kind=tools");
        expect(
            screen
                .getByRole("link", { name: /Trade pages · \/for\/ · 34/ })
                .getAttribute("href"),
        ).toBe("/search-pages");
        expect(screen.getByText("Section")).toBeTruthy();
    });

    it("lists the new groups in the kind choice, and an empty one draws without a crash (plan 2026-10-31-002)", () => {
        render(
            <SearchPagesTable
                kind="gst"
                kindCounts={{ for: 34, tools: 3 }}
                rows={[]}
                site="saroh.in"
                reviewSite="saroh.io"
                reviewUrl="https://saroh.io"
                canPublish
            />,
        );
        expect(
            screen
                .getByRole("link", { name: /GST guides · \/gst\/ · 0/ })
                .getAttribute("href"),
        ).toBe("/search-pages?kind=gst");
        expect(
            screen.getByRole("link", { name: /Guides · \/guides\/ · 0/ }),
        ).toBeTruthy();
        expect(
            screen.getByRole("link", {
                name: /Free downloads · \/downloads\/ · 0/,
            }),
        ).toBeTruthy();
        expect(screen.getByText("No pages here")).toBeTruthy();
    });

    it("lists every page that isn't archived, with its status", () => {
        table(false);
        expect(screen.getByRole("link", { name: /Salons/ })).toBeTruthy();
        expect(
            within(screen.getByRole("list", { name: "Pages" })).getByText(
                "Live",
            ),
        ).toBeTruthy();
        expect(
            screen.getByText("Never published", { exact: false }),
        ).toBeTruthy();
        expect(screen.queryByText("Old")).toBeNull();
    });

    it("gives no ticks to someone who can't publish", () => {
        table(false);
        expect(screen.queryByRole("checkbox")).toBeNull();
    });

    it("gives ticks, and the bar counts what each action can take", () => {
        table(true);
        fireEvent.click(
            screen.getByRole("checkbox", { name: "Select every page shown" }),
        );
        expect(screen.getByText("2 selected")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Publish 1" })).toBeTruthy();
        expect(
            screen.getByRole("button", { name: "Unpublish 1" }),
        ).toBeTruthy();
    });

    it("narrows by a chip", () => {
        table(false);
        fireEvent.click(
            within(screen.getByRole("group", { name: "Show" })).getByRole(
                "button",
                { name: /^Archived/ },
            ),
        );
        expect(screen.getByText("Old")).toBeTruthy();
        expect(screen.queryByText("Spas")).toBeNull();
    });
});

describe("SearchPageDialog", () => {
    beforeEach(() => {
        searchPageAction.mockReset();
        refresh.mockReset();
        showSuccess.mockReset();
    });

    const publish = () =>
        render(
            <SearchPageDialog
                action="publish"
                pages={[row("spas", "draft")]}
                site="saroh.in"
                reviewSite="saroh.io"
                onOpenChange={() => undefined}
            />,
        );

    it("keeps Publish off until the page is ticked as read, then publishes it and says so", async () => {
        searchPageAction.mockResolvedValue({
            ok: true,
            data: { pages: [], rebuildQueued: true },
        });
        publish();
        expect(screen.getByText("Publish Spas on saroh.in?")).toBeTruthy();
        const confirm = screen.getByRole("button", { name: "Publish page" });
        expect((confirm as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(
            screen.getByRole("checkbox", {
                name: "I've read this page on saroh.io",
            }),
        );
        expect((confirm as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(confirm);
        await waitFor(() =>
            expect(searchPageAction).toHaveBeenCalledWith("publish", [
                "/for/spas",
            ]),
        );
        await waitFor(() =>
            expect(showSuccess).toHaveBeenCalledWith(
                "Publishing the page.",
                "saroh.in is rebuilding.",
            ),
        );
        expect(refresh).toHaveBeenCalled();
    });

    it("shows a 409 as the refused pages in words", async () => {
        searchPageAction.mockResolvedValue({
            ok: false,
            status: 409,
            error: "raw",
            details: { action: "publish", paths: ["/for/spas"] },
        });
        publish();
        fireEvent.click(
            screen.getByRole("checkbox", {
                name: "I've read this page on saroh.io",
            }),
        );
        fireEvent.click(screen.getByRole("button", { name: "Publish page" }));
        expect((await screen.findByRole("alert")).textContent).toMatch(
            /^Spas can't be published from where it is now/,
        );
        expect(showSuccess).not.toHaveBeenCalled();
    });
});
