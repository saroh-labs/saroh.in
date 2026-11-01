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
import { SearchPageActions } from "./search-page-actions";
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
    blocked: [],
    links: [],
    deadLinks: [],
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
                "Spas waits to deploy.",
                "Deploy changes to put it on saroh.in.",
                expect.objectContaining({ label: "Show waiting changes" }),
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
        expect(within(list).getAllByText("Goes live")).toHaveLength(2);
        expect(within(list).getByText("Comes off")).toBeTruthy();
        // Each waiting change can be cancelled from the bar (DEC-201 amendment).
        expect(
            within(list).getAllByRole("button", {
                name: /^Cancel this change to /,
            }),
        ).toHaveLength(3);

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

    it("cancels one waiting change from the bar, with its own confirm", async () => {
        searchPageAction.mockResolvedValue({ ok: true, data: { pages: [] } });
        render(
            <DeployBar
                rows={waiting}
                site="saroh.in"
                rebuilding={false}
                canPublish
            />,
        );
        fireEvent.click(
            screen.getByRole("button", { name: "Cancel this change to Spas" }),
        );
        const dialog = await screen.findByRole("dialog");
        expect(
            within(dialog).getByText(/Nothing changes on saroh.in/),
        ).toBeTruthy();
        fireEvent.click(
            within(dialog).getByRole("button", { name: "Cancel the change" }),
        );
        await waitFor(() =>
            expect(searchPageAction).toHaveBeenCalledWith("cancel", [
                "/for/spas",
            ]),
        );
        await waitFor(() =>
            expect(showSuccess).toHaveBeenCalledWith(
                "Cancelled the change to Spas.",
                "Nothing changes on saroh.in.",
                undefined,
            ),
        );
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
        expect(
            screen.getByText(/A Platform owner deploys these\./),
        ).toBeTruthy();
        expect(
            screen.queryByRole("button", { name: /^Cancel this change/ }),
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
        expect(within(list).getAllByText("Waiting to deploy")).toHaveLength(2);
    });
});

describe("a GST page, guide or download whose checks fail (plan 2026-10-31-002, U6)", () => {
    const blocked = (slug: string, state: PageRow["state"]): PageRow => ({
        ...row(slug, state),
        path: `/gst/${slug}`,
        kind: "gst",
        family: "By trade",
        blocked: ["Every fact is confirmed"],
        why: ["2 facts to confirm"],
    });

    it("can't be published from a bulk selection, and the bar names the check", () => {
        render(
            <SearchPagesTable
                kind="gst"
                rows={[blocked("salon", "draft"), row("spas", "draft")]}
                site="saroh.in"
                reviewSite="saroh.io"
                reviewUrl="https://saroh.io"
                canPublish
            />,
        );
        fireEvent.click(screen.getByLabelText("Select every page shown"));
        const bar = screen.getByRole("region", { name: "Selected pages" });
        expect(
            within(bar).getByRole("button", { name: "Publish 1" }),
        ).toBeTruthy();
        expect(bar.textContent).toContain(
            "1 page can't be published yet: Salon (2 facts to confirm). Publish 1 publishes the rest.",
        );
        expect(
            within(bar)
                .getByRole("button", { name: "Publish 1" })
                .getAttribute("aria-describedby"),
        ).toBe("publish-held-bulk");
        expect(screen.getByText("Section")).toBeTruthy();
    });

    it("says Can't publish yet under Draft, and why in the row's menu (U14)", () => {
        render(
            <SearchPagesTable
                kind="gst"
                rows={[blocked("salon", "draft"), row("spas", "draft")]}
                site="saroh.in"
                reviewSite="saroh.io"
                reviewUrl="https://saroh.io"
                canPublish
            />,
        );
        const list = screen.getByRole("list", { name: "Pages" });
        expect(within(list).getAllByText("Can't publish yet")).toHaveLength(1);
        expect(within(list).getByText("Never published")).toBeTruthy();
        fireEvent.keyDown(screen.getByLabelText("Actions for Salon"), {
            key: "Enter",
        });
        // The menu opens at once on Enter; role queries over it are slow in jsdom.
        const item = screen
            .getByText("Can't publish yet: 2 facts to confirm")
            .closest('[role="menuitem"]');
        expect(item?.getAttribute("aria-disabled")).toBe("true");
        // Part of the item's name, so a screen reader and a phone get it.
        expect(item?.textContent).toBe(
            "Publish on saroh.inCan't publish yet: 2 facts to confirm",
        );
        expect(item?.getAttribute("title")).toBeNull();
    });

    it("keeps a /for/ row's menu and status line as they were", () => {
        render(
            <SearchPagesTable
                rows={[row("spas", "draft")]}
                site="saroh.in"
                reviewSite="saroh.io"
                reviewUrl="https://saroh.io"
                canPublish
            />,
        );
        expect(screen.getByText("Never published")).toBeTruthy();
        expect(screen.queryByText(/Can't publish/)).toBeNull();
        fireEvent.keyDown(screen.getByLabelText("Actions for Spas"), {
            key: "Enter",
        });
        const item = screen
            .getByText("Publish on saroh.in")
            .closest('[role="menuitem"]');
        expect(item?.getAttribute("aria-disabled")).toBeNull();
        expect(item?.textContent).toBe("Publish on saroh.in");
    });

    it("shows Held by checks while live, and says why", () => {
        render(
            <SearchPagesTable
                kind="gst"
                rows={[blocked("salon", "live")]}
                site="saroh.in"
                reviewSite="saroh.io"
                reviewUrl="https://saroh.io"
                canPublish={false}
            />,
        );
        expect(screen.getByText("Held by checks")).toBeTruthy();
        expect(
            screen.getByText(
                /Left out of the site until it passes: Every fact is confirmed/,
            ),
        ).toBeTruthy();
    });

    it("keeps the page's own Publish off, naming the failing check", () => {
        render(
            <SearchPageActions
                row={blocked("salon", "draft")}
                site="saroh.in"
                siteUrl="https://saroh.in"
                production
                reviewSite="saroh.io"
                reviewUrl="https://saroh.io"
                canPublish
                page={{} as never}
            />,
        );
        const publish = screen.getByRole("button", {
            name: "Publish on saroh.in",
        });
        expect((publish as HTMLButtonElement).disabled).toBe(true);
        expect(
            screen.getByText(
                /Publish waits until these checks pass: Every fact is confirmed/,
            ),
        ).toBeTruthy();
    });
});

describe("links to pages that aren't live (U12)", () => {
    beforeEach(() => {
        searchPageAction.mockReset();
        searchPageAction.mockResolvedValue({ ok: true, data: { pages: [] } });
    });
    const TOOL = "/tools/cancellation-policy-generator";
    const tool = (
        state: PageRow["state"],
        blocked: string[] = [],
    ): PageRow => ({
        ...row("cancellation-policy-generator", state),
        path: TOOL,
        kind: "tools",
        name: "Cancellation policy generator",
        blocked,
    });
    const guide = (
        state: PageRow["state"],
        extra: Partial<PageRow> = {},
    ): PageRow => ({
        ...row("reduce-no-shows", state),
        path: "/guides/reduce-no-shows",
        kind: "guides",
        name: "Reduce no-shows",
        links: [TOOL],
        ...extra,
    });
    const dialog = (
        action: "publish" | "unpublish" | "archive",
        pages: PageRow[],
        rows: PageRow[],
    ) =>
        render(
            <SearchPageDialog
                action={action}
                pages={pages}
                rows={rows}
                site="saroh.in"
                reviewSite="saroh.io"
                onOpenChange={() => undefined}
            />,
        );
    const tick = () =>
        fireEvent.click(screen.getByRole("checkbox", { name: /^I've read/ }));
    const confirm = (name: RegExp) =>
        screen.getByRole<HTMLButtonElement>("button", { name });

    it("publishes a guide whose tool is live, with no warning", async () => {
        dialog("publish", [guide("draft")], [guide("draft"), tool("live")]);
        expect(
            screen.queryByText("Links to pages that aren't live"),
        ).toBeNull();
        tick();
        fireEvent.click(confirm(/^Publish page$/));
        await waitFor(() =>
            expect(searchPageAction).toHaveBeenCalledWith("publish", [
                "/guides/reduce-no-shows",
            ]),
        );
    });

    it("holds Publish while the tool isn't live, then Publish these too adds it to the same publish", async () => {
        dialog("publish", [guide("draft")], [guide("draft"), tool("draft")]);
        expect(
            screen.getByText("Links to pages that aren't live"),
        ).toBeTruthy();
        expect(
            screen.getByText(
                `Cancellation policy generator (${TOOL}) is not published. Reduce no-shows links to it.`,
            ),
        ).toBeTruthy();
        tick();
        expect(confirm(/^Publish page$/).disabled).toBe(true);
        fireEvent.click(
            screen.getByRole("button", { name: "Publish these too" }),
        );
        expect(
            screen.queryByText("Links to pages that aren't live"),
        ).toBeNull();
        expect(
            screen.getByRole("list", { name: "Pages" }).textContent,
        ).toContain(TOOL);
        // It says what it added, tags it, and words the lists for both kinds (F4).
        expect(
            screen.getByText(
                /Added 1 linked page\. Read it before you publish\./,
            ),
        ).toBeTruthy();
        expect(
            within(screen.getByRole("list", { name: "Pages" })).getByText(
                "Linked",
            ),
        ).toBeTruthy();
        expect(
            screen.getByText(/the \/guides and \/tools lists, the menu/),
        ).toBeTruthy();
        // The added page is read too before it goes out.
        expect(confirm(/^Publish 2 pages$/).disabled).toBe(true);
        tick();
        fireEvent.click(confirm(/^Publish 2 pages$/));
        await waitFor(() =>
            expect(searchPageAction).toHaveBeenCalledWith("publish", [
                "/guides/reduce-no-shows",
                TOOL,
            ]),
        );
    });

    it("says a taken-off tool is taken off", () => {
        dialog(
            "publish",
            [guide("draft")],
            [guide("draft"), tool("unpublished")],
        );
        expect(
            screen.getByText(/is taken off\. Reduce no-shows links to it\./),
        ).toBeTruthy();
    });

    it("an archived tool can't be added: it says to restore it first, and Publish stays off", () => {
        dialog("publish", [guide("draft")], [guide("draft"), tool("archived")]);
        expect(
            screen.getByText(
                `Cancellation policy generator (${TOOL}) is archived, and Reduce no-shows links to it. Restore it first, then publish it with this.`,
            ),
        ).toBeTruthy();
        expect(
            screen.queryByRole("button", { name: "Publish these too" }),
        ).toBeNull();
        tick();
        expect(confirm(/^Publish page$/).disabled).toBe(true);
    });

    it("a tool whose own checks fail can't be added, and says why", () => {
        dialog(
            "publish",
            [guide("draft")],
            [guide("draft"), tool("draft", ["Every fact is confirmed"])],
        );
        expect(
            screen.getByText(
                /It can't be published until its checks pass: Every fact is confirmed\. Fix them first\./,
            ),
        ).toBeTruthy();
        expect(
            screen.queryByRole("button", { name: "Publish these too" }),
        ).toBeNull();
    });

    it("a link to a page that doesn't exist blocks, naming the page and the link", () => {
        const typo = guide("draft", {
            links: ["/tools/cancelation-policy"],
            deadLinks: ["/tools/cancelation-policy"],
        });
        dialog("publish", [typo], [typo]);
        expect(
            screen.getByText(
                "Reduce no-shows links to /tools/cancelation-policy. This link goes to a page that doesn't exist. Fix the link in the code, then publish.",
            ),
        ).toBeTruthy();
        tick();
        expect(confirm(/^Publish page$/).disabled).toBe(true);
    });

    it("unpublishing a tool live pages link to warns, and doesn't block", async () => {
        dialog("unpublish", [tool("live")], [guide("live"), tool("live")]);
        expect(
            screen.getByText(
                "1 live page links here (Reduce no-shows); their links will go to the /tools list until you publish it again.",
            ),
        ).toBeTruthy();
        fireEvent.click(confirm(/^Unpublish page$/));
        await waitFor(() =>
            expect(searchPageAction).toHaveBeenCalledWith("unpublish", [TOOL]),
        );
    });

    it("the list's bulk Publish checks links across kinds", () => {
        render(
            <SearchPagesTable
                kind="guides"
                rows={[guide("draft")]}
                allRows={[guide("draft"), tool("draft")]}
                site="saroh.in"
                reviewSite="saroh.io"
                reviewUrl="https://saroh.io"
                canPublish
            />,
        );
        fireEvent.click(screen.getByLabelText("Select every page shown"));
        fireEvent.click(screen.getByRole("button", { name: "Publish 1" }));
        expect(
            screen.getByRole("button", { name: "Publish these too" }),
        ).toBeTruthy();
    });
});
