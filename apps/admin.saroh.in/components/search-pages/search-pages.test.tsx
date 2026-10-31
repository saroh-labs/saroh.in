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
const deploySearchPages = vi.fn();
vi.mock("@/lib/search-page-actions", () => ({
    searchPageAction: (...args: unknown[]) =>
        searchPageAction(...args) as unknown,
    deploySearchPages: () => deploySearchPages() as unknown,
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const showSuccess = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showSuccess: (...args: unknown[]) => showSuccess(...args) as unknown,
}));

import { DeployBar } from "./deploy-bar";
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
    onSite: state === "live",
    pending: null,
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
            data: { pages: [] },
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
                "Published the page.",
                "Deploy changes to put it on saroh.in.",
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

describe("DeployBar (R13)", () => {
    beforeEach(() => {
        deploySearchPages.mockReset();
        refresh.mockReset();
        showSuccess.mockReset();
    });

    const waiting = [
        { ...row("spas", "live"), onSite: false, pending: "on" as const },
        { ...row("gyms", "live"), onSite: false, pending: "on" as const },
        {
            ...row("salons", "unpublished"),
            onSite: true,
            pending: "off" as const,
        },
    ];

    it("lists what waits and deploys it all in one confirm", async () => {
        deploySearchPages.mockResolvedValue({
            ok: true,
            data: {
                paths: ["/for/gyms", "/for/salons", "/for/spas"],
                rebuildQueued: true,
            },
        });
        render(
            <DeployBar
                rows={waiting}
                site="saroh.in"
                rebuilding={false}
                canPublish
            />,
        );
        expect(screen.getByText("3 changes waiting to deploy")).toBeTruthy();
        const list = screen.getByRole("list", { name: "Changes waiting" });
        expect(within(list).getAllByText("Published")).toHaveLength(2);
        expect(within(list).getByText("Taken off")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Deploy changes" }));
        expect(
            await screen.findByText("Deploy 3 changes to saroh.in?"),
        ).toBeTruthy();
        const dialog = screen.getByRole("dialog");
        fireEvent.click(
            within(dialog).getByRole("button", { name: "Deploy changes" }),
        );
        await waitFor(() => expect(deploySearchPages).toHaveBeenCalledTimes(1));
        await waitFor(() =>
            expect(showSuccess).toHaveBeenCalledWith(
                "Deploying 3 changes.",
                "saroh.in is rebuilding.",
            ),
        );
        expect(refresh).toHaveBeenCalled();
    });

    it("keeps Deploy changes off while the site rebuilds, and says so", () => {
        render(
            <DeployBar rows={waiting} site="saroh.in" rebuilding canPublish />,
        );
        expect(
            screen.getByText(/saroh.in is rebuilding\. You can deploy again/),
        ).toBeTruthy();
        expect(
            screen.getByRole<HTMLButtonElement>("button", {
                name: "Deploy changes",
            }).disabled,
        ).toBe(true);
    });

    it("keeps Deploy changes off with nothing waiting", () => {
        render(
            <DeployBar
                rows={[]}
                site="saroh.in"
                rebuilding={false}
                canPublish
            />,
        );
        expect(screen.getByText("No changes waiting to deploy")).toBeTruthy();
        expect(
            screen.getByRole<HTMLButtonElement>("button", {
                name: "Deploy changes",
            }).disabled,
        ).toBe(true);
    });

    it("never shows Deploy changes to read-only staff", () => {
        render(
            <DeployBar
                rows={waiting}
                site="saroh.in"
                rebuilding={false}
                canPublish={false}
            />,
        );
        expect(screen.getByText("3 changes waiting to deploy")).toBeTruthy();
        expect(
            screen.queryByRole("button", { name: "Deploy changes" }),
        ).toBeNull();
        const { container } = render(
            <DeployBar
                rows={[]}
                site="saroh.in"
                rebuilding={false}
                canPublish={false}
            />,
        );
        expect(container.innerHTML).toBe("");
    });
});

describe("a row waiting for Deploy changes", () => {
    it("says so in its status", () => {
        render(
            <SearchPagesTable
                rows={[
                    { ...row("spas", "live"), onSite: false, pending: "on" },
                    {
                        ...row("salons", "unpublished"),
                        onSite: true,
                        pending: "off",
                    },
                ]}
                site="saroh.in"
                reviewSite="saroh.io"
                reviewUrl="https://saroh.io"
                canPublish
            />,
        );
        const list = screen.getByRole("list", { name: "Pages" });
        expect(
            within(list).getByText("Published · not deployed yet"),
        ).toBeTruthy();
        expect(
            within(list).getByText("Taken off · not deployed yet"),
        ).toBeTruthy();
    });
});
