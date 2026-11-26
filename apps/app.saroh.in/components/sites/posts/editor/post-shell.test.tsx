// @vitest-environment jsdom
/**
 * The desk post editor (U15): it keeps every capability of today's post
 * editor (00-universal §15) and a reader can change nothing (DEC-200 U8).
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PostDetail } from "@/lib/content/service";

const router = { replace: vi.fn(), push: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
    useRouter: () => router,
    useSearchParams: () => new URLSearchParams(),
    usePathname: () => "/sites/s1/write/new",
}));

// The rich text editor is browser-heavy; a textarea stands in for it. Like
// Tiptap (setEditable emits an update), it re-reports its value on mount.
// `dyn.arriving`: the editor's code is still on its way (its `loading`).
const dyn = vi.hoisted(() => ({ arriving: false }));
vi.mock("next/dynamic", async () => {
    const { useEffect } = await import("react");
    return {
        default: (_load: unknown, opts?: { loading?: () => React.ReactNode }) =>
            function Stand({
                value,
                onChange,
                readOnly,
            }: {
                value: string;
                onChange: (v: string) => void;
                readOnly?: boolean;
            }) {
                // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
                useEffect(() => onChange(value), []);
                if (dyn.arriving && opts?.loading) return opts.loading();
                // A reader's styled post (R3): nothing to type in.
                if (readOnly) return <div data-styled-post="" />;
                return (
                    <textarea
                        aria-label="Post body"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                    />
                );
            },
    };
});

const createPost = vi.fn<(...a: unknown[]) => Promise<unknown>>();
const updatePost = vi.fn<(...a: unknown[]) => Promise<unknown>>();
const publishPost = vi.fn<(...a: unknown[]) => Promise<unknown>>();
vi.mock("@/lib/content/actions", () => ({
    createPost: (...a: unknown[]) => createPost(...a),
    updatePost: (...a: unknown[]) => updatePost(...a),
    publishPost: (...a: unknown[]) => publishPost(...a),
    deletePost: vi.fn(),
    unpublishPost: vi.fn(),
    createPostCategory: vi.fn(),
    updatePostCategory: vi.fn(),
    deletePostCategory: vi.fn(),
}));
vi.mock("@/components/shared/fields/media-picker", () => ({
    MediaPicker: () => null,
}));
vi.mock("@/components/shared/share-item/share-item-sheet", () => ({
    ShareItemButton: () => <button type="button">Share</button>,
    ShareItemSheet: () => null,
}));
vi.mock("@/lib/sites/actions", () => ({
    createComment: vi.fn(),
    deleteComment: vi.fn(),
    setCommentResolved: vi.fn(),
    updateCommentBody: vi.fn(),
}));
vi.mock("@/lib/sites/post-revisions-read", () => ({
    readPostRevisions: vi.fn(() => Promise.resolve({ ok: true, rows: [] })),
    readPostRevision: vi.fn(),
    readPostChecks: vi.fn(() => Promise.resolve([])),
}));
vi.mock("@/components/billing/plan-refusal", () => ({
    showPlanRefusal: vi.fn(),
}));
vi.mock("@/components/ask-ai/open", () => ({ openAskAi: vi.fn() }));
vi.mock("@saroh/ui/toast", () => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
    showInfo: vi.fn(),
}));

import { PageLoading } from "@/components/shared/page/page-loading";

import { PostFrame } from "./post-frame";
import type { PostEditorData } from "./post-model";
import { PostShell, postTrailTabs } from "./post-shell";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    vi.useFakeTimers();
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    window.history.replaceState(null, "", "/sites/s1/write/new");
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = "";
    vi.useRealTimers();
    vi.clearAllMocks();
});

const data = (over: Partial<PostEditorData> = {}): PostEditorData => ({
    siteId: "s1",
    author: "Asha Rao",
    siteName: "Gulmohar Salon",
    address: "gulmohar.saroh.app",
    postsPrefix: "blog",
    categories: [
        { id: "c1", name: "Bridal", slug: "bridal", _count: { posts: 1 } },
    ],
    posts: [],
    style: null,
    styleOptions: null,
    paused: false,
    readOnly: false,
    share: null,
    askAi: true,
    readBy: null,
    ...over,
});

const post: PostDetail = {
    id: "p1",
    title: "Bridal trial",
    slug: "bridal-trial",
    excerpt: "What to expect.",
    content: "<p>A trial.</p>",
    categoryId: "c1",
    featured: false,
    image: null,
    status: "PUBLISHED",
    publishedAt: "2026-11-12T03:30:00.000Z",
    createdAt: "2026-11-01T00:00:00.000Z",
    author: "Asha Rao",
    live: true,
    liveAt: "2026-11-12T03:30:00.000Z",
    imageAlt: null,
    seoTitle: null,
    seoDescription: null,
    scheduledAt: null,
    oldSlugs: [],
    liveCopy: {
        title: "Bridal trial",
        slug: "bridal-makeup-trial",
        excerpt: "What to expect.",
        content: "<p>A trial.</p>",
        image: null,
        imageAlt: null,
        seoTitle: null,
        seoDescription: null,
        shareImageUrl: null,
        category: "Bridal",
        path: "/blog/bridal-makeup-trial",
        publishedAt: "2026-11-12T03:30:00.000Z",
    },
};

function el<T extends Element = HTMLElement>(selector: string): T {
    const found = document.querySelector<T>(selector);
    if (!found) throw new Error(`nothing at ${selector}`);
    return found;
}
const field = (label: string) =>
    el<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`);

function type(target: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const proto = Object.getPrototypeOf(target) as object;
    Reflect.set(proto, "value", value, target);
    target.dispatchEvent(new Event("input", { bubbles: true }));
}

const named = (name: string) =>
    Array.from(document.querySelectorAll("button")).find(
        (b) =>
            b.getAttribute("aria-label") === name ||
            b.textContent.trim() === name,
    );

async function settle(run: () => void) {
    await act(async () => {
        run();
        await Promise.resolve();
        await Promise.resolve();
    });
}

describe("the desk post editor (U15)", () => {
    it("autosaves 2.5 s after typing, says so, and adopts its own address", async () => {
        createPost.mockResolvedValue({ ok: true, data: { id: "p9" } });
        act(() => root.render(<PostShell data={data()} />));
        act(() => type(field("Post title"), "Monsoon hair care"));
        await settle(() => vi.advanceTimersByTime(2400));
        expect(createPost).not.toHaveBeenCalled();
        await settle(() => vi.advanceTimersByTime(200));
        expect(createPost).toHaveBeenCalledWith(
            "s1",
            expect.objectContaining({ title: "Monsoon hair care" }),
        );
        expect(window.location.pathname).toBe("/sites/s1/write/p9");
        expect(el("[data-saved-line]").textContent).toContain(
            "Saved · just now",
        );
    });

    it("a new post says Saved only once it is saved (editor audit #2)", async () => {
        createPost.mockResolvedValue({ ok: true, data: { id: "p9" } });
        act(() => root.render(<PostShell data={data()} />));
        expect(container.textContent).not.toContain("Saved");
        expect(container.textContent).toContain("Goes live when you publish");
        act(() => type(field("Post title"), "Monsoon hair care"));
        await settle(() => vi.advanceTimersByTime(2600));
        // Said once, in the top bar, not again under the inspector.
        expect(container.textContent.match(/Saved/g)).toHaveLength(1);
    });

    it("saves on ⌘S", async () => {
        updatePost.mockResolvedValue({ ok: true, data: { id: "p1" } });
        act(() => root.render(<PostShell data={data()} post={post} />));
        act(() => type(field("Post title"), "Bridal trial, again"));
        await settle(() => {
            window.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "s",
                    metaKey: true,
                    bubbles: true,
                }),
            );
        });
        expect(updatePost).toHaveBeenCalledWith(
            "s1",
            "p1",
            expect.objectContaining({ title: "Bridal trial, again" }),
        );
    });

    it("a post needs a title: Publish post says so and sends nothing", async () => {
        act(() => root.render(<PostShell data={data()} />));
        act(() => type(field("Post body"), "Words without a title."));
        await settle(() => named("Publish post")?.click());
        expect(el('[role="alert"]').textContent).toContain(
            "A post needs a title.",
        );
        expect(createPost).not.toHaveBeenCalled();
        expect(publishPost).not.toHaveBeenCalled();
        // Nor does autosave go without one.
        await settle(() => vi.advanceTimersByTime(3000));
        expect(createPost).not.toHaveBeenCalled();
    });

    it("opening a post is not an edit: nothing unsaved, nothing autosaved", async () => {
        act(() => root.render(<PostShell data={data()} post={post} />));
        await settle(() => vi.advanceTimersByTime(3000));
        expect(updatePost).not.toHaveBeenCalled();
        expect(container.textContent).not.toContain("Unsaved changes");
    });

    it("counts the changes waiting against the live copy (RULES §2)", () => {
        act(() => root.render(<PostShell data={data()} post={post} />));
        // The link differs from the live copy's: one change.
        expect(el("[data-status-chip]").textContent).toBe(
            "Live · 1 change waiting",
        );
        act(() => type(field("Post title"), "Bridal trial: what to expect"));
        expect(el("[data-status-chip]").textContent).toBe(
            "Live · 2 changes waiting",
        );
    });

    it("follows a re-read that puts the post live (an approver's Approve, O7)", () => {
        const draft = { ...post, live: false, liveAt: null, liveCopy: null };
        act(() => root.render(<PostShell data={data()} post={draft} />));
        expect(el("[data-status-chip]").textContent).toBe("Not live yet");
        // router.refresh() after Approve: the same post, now live.
        act(() => root.render(<PostShell data={data()} post={post} />));
        expect(el("[data-status-chip]").textContent).toBe(
            "Live · 1 change waiting",
        );
    });

    it("keeps today's controls: Details rows, search and sharing, the categories, More", () => {
        act(() => root.render(<PostShell data={data()} post={post} />));
        for (const name of [
            "Change category",
            "Change short description",
            "Change cover",
            "Blog settings and categories",
            "Publish post",
            "Undo",
            "Redo",
            "Preview",
            "More: share, find, save now, more formatting, take off the site, delete",
        ]) {
            expect(named(name), name).toBeDefined();
        }
        expect(container.textContent).toContain("Shows in");
        expect(container.textContent).toContain("Short description");
        expect(container.textContent).toContain("Written by");
        expect(container.textContent).toContain(
            "The page link is in Search and sharing.",
        );
        expect(container.textContent).toContain("Goes live when you publish");
    });

    it("a changed page link says the old one forwards on publish", () => {
        act(() => root.render(<PostShell data={data()} post={post} />));
        act(() => named("Search and sharing")?.click());
        // W8: changed in place, with the previews; no "Change" button first.
        expect(named("Change search and sharing")).toBeUndefined();
        expect(document.body.textContent).toContain(
            "when someone shares the link",
        );
        expect(document.body.textContent).toContain(
            "Changed from /blog/bridal-makeup-trial. When you publish the post, the old link forwards here.",
        );
    });

    it("an Ask AI draft prefills, saves nothing until Save draft", async () => {
        createPost.mockResolvedValue({ ok: true, data: { id: "p2" } });
        act(() =>
            root.render(
                <PostShell
                    data={data({
                        fromAskAi: {
                            title: "Sunday trials",
                            body: "<p>We open Sundays.</p>",
                            excerpt: null,
                        },
                    })}
                />,
            ),
        );
        expect(field("Post title").value).toBe("Sunday trials");
        expect(container.textContent).toContain(
            "Started from Ask AI. Nothing is saved until you save.",
        );
        await settle(() => vi.advanceTimersByTime(5000));
        expect(createPost).not.toHaveBeenCalled();
        expect(named("Discard")).toBeDefined();
        await settle(() => named("Save draft")?.click());
        expect(createPost).toHaveBeenCalledWith(
            "s1",
            expect.objectContaining({ title: "Sunday trials" }),
        );
    });
});

describe("the desk post editor for a reader (DEC-200 U8)", () => {
    it("draws no write control and opens on Feedback", () => {
        act(() =>
            root.render(
                <PostShell
                    data={data({
                        readOnly: true,
                        askAi: false,
                        feedback: {
                            comments: [],
                            canComment: true,
                            canSettle: false,
                        },
                    })}
                    post={post}
                />,
            ),
        );
        for (const name of [
            "Publish post",
            "Save draft",
            "Undo",
            "Redo",
            "Add",
            "Change category",
            "Change short description",
            "Change cover",
            "Change search and sharing",
            "Blog settings and categories",
            "New post",
        ]) {
            expect(named(name), name).toBeUndefined();
        }
        expect(field("Post title").readOnly).toBe(true);
        expect(document.querySelector('[aria-label="Post body"]')).toBeNull();
        expect(el('[role="tab"][aria-selected="true"]').textContent).toContain(
            "Feedback",
        );
    });
});

describe("postTrailTabs", () => {
    it("is Post · Add · History · Feedback (Ask AI is the right column’s tab; Post names the In this post panel, ER3Post P2), a reader’s Post · Feedback", () => {
        const keys = (o: Parameters<typeof postTrailTabs>[0]) =>
            postTrailTabs(o).map((t) => t.label);
        expect(
            keys({
                readOnly: false,
                history: true,
                openNotes: 2,
                feedback: true,
            }),
        ).toEqual(["Post", "Add", "History", "Feedback"]);
        expect(
            keys({
                readOnly: true,
                history: true,
                openNotes: 0,
                feedback: true,
            }),
        ).toEqual(["Post", "Feedback"]);
    });
});

/**
 * The plan's post editor table ("Capabilities kept", U51): every control
 * the old editor had is reachable in the new one. Rows the cases above
 * reach (Details, search and sharing, categories, autosave and ⌘S, the
 * Ask AI draft, a reader's Feedback) are not asked again here.
 */
describe("the post capability table, row by row (U51)", () => {
    const menuItems = () =>
        Array.from(document.querySelectorAll("[role=menuitem]")).map((m) =>
            m.textContent.replace(/⌘[SK]/, "").trim(),
        );
    function openMore() {
        const trigger = named(
            "More: share, find, save now, more formatting, take off the site, delete",
        );
        if (!trigger) throw new Error("No More");
        act(() => {
            trigger.focus();
            trigger.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
            );
        });
    }

    it("title, body, Written by, Share as a post and Publish post are on the page", () => {
        act(() =>
            root.render(
                <PostShell
                    data={data({
                        share: {
                            setup: {} as never,
                            url: "https://gulmohar.saroh.app/blog/bridal-trial",
                        },
                    })}
                    post={post}
                />,
            ),
        );
        expect(field("Post title").value).toBe("Bridal trial");
        expect(field("Post body")).toBeDefined();
        expect(container.textContent).toContain("Written by");
        expect(named("Share")).toBeDefined();
        expect(named("Publish post")).toBeDefined();
    });

    it("More: Find, Save now, More formatting, Take off the site and Delete", () => {
        act(() => root.render(<PostShell data={data()} post={post} />));
        openMore();
        expect(menuItems()).toEqual([
            "Find",
            "Save now",
            "More formatting",
            "Take off the site…",
            "Delete this post…",
        ]);
    });

    it("couldn't save keeps the writing, and Try again saves again", async () => {
        updatePost.mockResolvedValueOnce({ ok: false, error: "Offline." });
        act(() => root.render(<PostShell data={data()} post={post} />));
        act(() => type(field("Post title"), "Bridal trial, again"));
        await settle(() => vi.advanceTimersByTime(2600));
        expect(container.textContent).toContain(
            "Couldn't save your latest changes.",
        );
        expect(field("Post title").value).toBe("Bridal trial, again");
        updatePost.mockResolvedValue({ ok: true, data: { id: "p1" } });
        await settle(() => named("Try again")?.click());
        expect(updatePost).toHaveBeenCalledTimes(2);
    });

    it("a paused post reads: More offers nothing that saves", () => {
        act(() =>
            root.render(
                <PostShell data={data({ paused: true })} post={post} />,
            ),
        );
        openMore();
        expect(menuItems()).not.toContain("Save now");
        expect(menuItems()).toContain("Delete this post…");
    });
});

describe("the frame stays from post to post (write/layout.tsx)", () => {
    const other: PostDetail = { ...post, id: "p2", title: "Monsoon hair" };
    const listed = data({
        posts: [
            { ...post, id: "p1" },
            { ...post, id: "p2", title: "Monsoon hair" },
        ] as unknown as PostEditorData["posts"],
    });
    // The layout's frame with the segment under it: a post, or its loader.
    const draw = (page: React.ReactNode) =>
        act(() => root.render(<PostFrame>{page}</PostFrame>));
    // The right column's box (its Ask AI tabs need the editor's provider).
    const column = () => el("[data-inspector-frame]").parentElement;
    const loader = (
        <PageLoading
            shape="writing"
            width="full"
            bare
            label="Opening the post"
        />
    );

    it("keeps the bar, rail, list and right column mounted; greys only the post's regions", () => {
        draw(<PostShell key="p1" data={listed} post={post} />);
        const bar = el("[data-post-bar]");
        const rail = el('nav[aria-label="Editor panels"]');
        const list = el("[data-left-panel]");
        const right = column();
        expect(bar.textContent).toContain("Bridal trial");
        // 264px, as EBPostLeftPanel draws it (ER3Post P3).
        expect(list.className).toContain("w-[264px]");

        // Another post asked for: the segment's loader stands in its place.
        draw(loader);
        expect(el("[data-post-bar]")).toBe(bar);
        expect(bar.getAttribute("aria-busy")).toBe("true");
        // The bar's actions stay drawn, disabled until the post is here.
        for (const label of [
            "Undo",
            "Redo",
            "Preview",
            "More",
            "Publish post",
        ]) {
            const b = Array.from(bar.querySelectorAll("button")).find(
                (n) =>
                    n.getAttribute("aria-label") === label ||
                    n.textContent.trim() === label,
            );
            expect(b, label).toBeDefined();
            expect(b?.disabled, label).toBe(true);
        }
        expect(el('nav[aria-label="Editor panels"]')).toBe(rail);
        expect(el("[data-left-panel]")).toBe(list);
        expect(column()).toBe(right);
        expect(list.textContent).toContain("In this post");
        const shapes = Array.from(
            document.querySelectorAll<HTMLElement>("[data-slot=page-loading]"),
        ).map((n) => n.dataset.shape);
        expect(shapes).toEqual(["writing", "inspector"]);

        draw(<PostShell key="p2" data={listed} post={other} />);
        expect(el("[data-post-bar]")).toBe(bar);
        expect(el("[data-left-panel]")).toBe(list);
        expect(column()).toBe(right);
        expect(bar.getAttribute("aria-busy")).toBeNull();
        expect(bar.textContent).toContain("Monsoon hair");
        expect(document.querySelector("[data-slot=page-loading]")).toBeNull();
    });

    it("switches posts only from the top picker, each row with its state (EBPostLeftPanel)", () => {
        draw(<PostShell key="p1" data={listed} post={post} />);
        const panel = el('aside[aria-label="In this post"]');
        // The panel is this post only: its outline, no list of posts.
        expect(panel.querySelector('a[href*="/write/"]')).toBeNull();
        expect(panel.textContent).not.toContain("Monsoon hair");
        expect(
            panel.querySelector('[aria-label="Outline of this post"]'),
        ).not.toBeNull();

        act(() => named("Blog post: Bridal trial. Open another post")?.click());
        const rows = Array.from(
            document.querySelectorAll<HTMLAnchorElement>(
                'nav[aria-label="Posts"] a',
            ),
        ).map((a) => a.textContent);
        expect(rows).toEqual([
            "Bridal trialLive",
            "Monsoon hairLive",
            "New post",
            "All posts2",
        ]);
        expect(
            el('nav[aria-label="Posts"] a[aria-current="page"]').textContent,
        ).toContain("Bridal trial");
    });

    it("lists the post being written even when the page's list predates it", () => {
        draw(
            <PostShell key="p1" data={{ ...listed, posts: [] }} post={post} />,
        );
        act(() => named("Blog post: Bridal trial. Open another post")?.click());
        expect(
            el('nav[aria-label="Posts"] a[aria-current="page"]').textContent,
        ).toContain("Bridal trial");
    });

    it("keeps the rail's tab across posts", () => {
        draw(<PostShell key="p1" data={listed} post={post} />);
        act(() => named("Add")?.click());
        expect(el("[data-left-panel]").dataset.leftPanel).toBe("add");
        draw(loader);
        draw(<PostShell key="p2" data={listed} post={other} />);
        expect(el("[data-left-panel]").dataset.leftPanel).toBe("add");
    });
});

describe("opening a post (W7)", () => {
    afterEach(() => {
        dyn.arriving = false;
    });

    it("keeps the whole post a skeleton, and Publish grey, until the editor is here", () => {
        dyn.arriving = true;
        act(() => root.render(<PostShell data={data()} post={post} />));
        expect(document.querySelector("[data-post-opening]")?.textContent).toBe(
            "Opening the post…",
        );
        const publish = Array.from(document.querySelectorAll("button")).find(
            (b) => b.textContent === "Publish post",
        );
        expect(publish?.disabled).toBe(true);
        expect(
            document
                .querySelector("[data-writing-surface]")
                ?.closest("[aria-hidden]"),
        ).not.toBeNull();
    });
});
