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

// The rich text editor is browser-heavy; a textarea stands in for it.
vi.mock("next/dynamic", () => ({
    default: () =>
        function Stand({
            value,
            onChange,
        }: {
            value: string;
            onChange: (v: string) => void;
        }) {
            return (
                <textarea
                    aria-label="Post body"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                />
            );
        },
}));

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
}));
vi.mock("@/lib/sites/actions", () => ({
    createComment: vi.fn(),
    deleteComment: vi.fn(),
    setCommentResolved: vi.fn(),
    updateCommentBody: vi.fn(),
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
            "More: save now, more formatting, take off the site, delete",
        ]) {
            expect(named(name), name).toBeDefined();
        }
        expect(container.textContent).toContain("Shows in");
        expect(container.textContent).toContain("Short description");
        expect(container.textContent).toContain("Written by");
        expect(container.textContent).toContain(
            "The page link is in Search and sharing.",
        );
        expect(container.textContent).toContain(
            "Saved · goes live when you publish",
        );
    });

    it("a changed page link says the old one forwards on publish", () => {
        act(() => root.render(<PostShell data={data()} post={post} />));
        act(() => named("Search and sharing")?.click());
        act(() => named("Change search and sharing")?.click());
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
    it("is Posts · Add · Ask AI · History · Feedback, a reader's Posts · Feedback", () => {
        const keys = (o: Parameters<typeof postTrailTabs>[0]) =>
            postTrailTabs(o).map((t) => t.label);
        expect(
            keys({
                readOnly: false,
                askAi: true,
                history: true,
                openNotes: 2,
                feedback: true,
            }),
        ).toEqual(["Posts", "Add", "Ask AI", "History", "Feedback"]);
        expect(
            keys({
                readOnly: true,
                askAi: true,
                history: true,
                openNotes: 0,
                feedback: true,
            }),
        ).toEqual(["Posts", "Feedback"]);
    });
});
