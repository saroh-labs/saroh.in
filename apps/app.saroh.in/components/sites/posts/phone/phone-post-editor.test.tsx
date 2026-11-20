// @vitest-environment jsdom
/**
 * The post editor on a phone (U16, `blogphone/WXY*`): the same model and
 * draft as the desk, every capability reachable from the bar, Details or
 * More, and a reader changes nothing (DEC-200 U8).
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
vi.mock("@/lib/sites/post-revisions-read", () => ({
    readPostRevisions: vi.fn(() => Promise.resolve({ ok: true, rows: [] })),
    readPostRevision: vi.fn(),
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

import type { PostEditorData } from "../editor/post-model";
import { PostShell } from "../editor/post-shell";
import { deleteWords } from "./phone-menus";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    vi.useFakeTimers();
    // A phone: every max-width query matches (`use-editor-layout.ts`).
    window.matchMedia = (query: string) => ({
        matches: query.includes("max-width"),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        onchange: null,
        dispatchEvent: () => false,
    });
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

const text = () => document.body.textContent;

describe("the phone post editor (U16)", () => {
    it("draws the phone bar, not the desk's rail and inspector", () => {
        act(() => root.render(<PostShell data={data()} post={post} />));
        expect(
            document.querySelector("[data-phone-post-editor]"),
        ).not.toBeNull();
        for (const name of ["Back to Website", "Details", "Publish"]) {
            expect(
                named(name) ??
                    document.querySelector(`a[aria-label="${name}"]`),
                name,
            ).toBeTruthy();
        }
        expect(named("Publish post")).toBeUndefined();
        expect(
            document.querySelector(
                '[role="toolbar"][aria-label="Writing tools"]',
            ),
        ).not.toBeNull();
        for (const name of [
            "Format",
            "Add",
            "Ask AI",
            "Undo",
            "Redo",
            "Hide keyboard",
        ]) {
            expect(named(name), name).toBeTruthy();
        }
        expect(el("[data-status-chip]").textContent).toBe(
            "Live · 1 change waiting",
        );
    });

    it("a post needs a title: Publish says so and sends nothing", async () => {
        act(() => root.render(<PostShell data={data()} />));
        expect(el("[data-saved-line]").textContent).toBe("New post");
        act(() => type(field("Post body"), "Words without a title."));
        await settle(() => named("Publish")?.click());
        expect(el('[role="alert"]').textContent).toContain(
            "A post needs a title.",
        );
        expect(createPost).not.toHaveBeenCalled();
        expect(publishPost).not.toHaveBeenCalled();
    });

    it("autosaves on the shared draft and says Saved", async () => {
        createPost.mockResolvedValue({ ok: true, data: { id: "p9" } });
        act(() => root.render(<PostShell data={data()} />));
        act(() => type(field("Post title"), "Monsoon hair care"));
        await settle(() => vi.advanceTimersByTime(2600));
        expect(createPost).toHaveBeenCalledTimes(1);
        expect(window.location.pathname).toBe("/sites/s1/write/p9");
        expect(el("[data-saved-line]").textContent).toBe("Saved");
    });

    it("Details › Save writes every field once, in one save", async () => {
        updatePost.mockResolvedValue({ ok: true, data: { id: "p1" } });
        act(() => root.render(<PostShell data={data()} post={post} />));
        await settle(() => named("Details")?.click());
        expect(text()).toContain("Saved · goes live when you publish");
        expect(text()).toContain("Search and sharing");
        expect(text()).toContain("Written by");
        act(() =>
            type(
                el<HTMLTextAreaElement>('[role="dialog"] textarea'),
                "Ninety minutes, two weeks before.",
            ),
        );
        await settle(() => named("Save")?.click());
        await settle(() => vi.advanceTimersByTime(10));
        expect(updatePost).toHaveBeenCalledTimes(1);
        expect(updatePost).toHaveBeenCalledWith(
            "s1",
            "p1",
            expect.objectContaining({
                title: "Bridal trial",
                excerpt: "Ninety minutes, two weeks before.",
                categoryId: "c1",
            }),
        );
        // Autosave finds nothing left to send.
        await settle(() => vi.advanceTimersByTime(3000));
        expect(updatePost).toHaveBeenCalledTimes(1);
    });

    it("More keeps today's actions, and Delete asks in today's words", async () => {
        act(() =>
            root.render(
                <PostShell
                    data={data({
                        readBy: 214,
                        feedback: {
                            comments: [],
                            canComment: true,
                            canSettle: true,
                        },
                    })}
                    post={post}
                />,
            ),
        );
        await settle(() =>
            named(
                "More: preview, versions, share as a post, take off the site, delete",
            )?.click(),
        );
        expect(text()).toContain("Read by 214");
        for (const name of [
            "Preview",
            "Feedback",
            "Add a cover",
            "Take off the site…",
            "Delete this post…",
        ]) {
            expect(
                Array.from(document.querySelectorAll("button")).some((b) =>
                    b.textContent.startsWith(name),
                ),
                name,
            ).toBe(true);
        }
        await settle(() =>
            Array.from(document.querySelectorAll("button"))
                .find((b) => b.textContent.startsWith("Delete this post…"))
                ?.click(),
        );
        expect(text()).toContain(deleteWords(true));
        expect(deleteWords(true)).toContain(
            "To take it down and keep it, use Take off the site instead.",
        );
        expect(named("Keep post")).toBeTruthy();
        expect(named("Delete post")).toBeTruthy();
    });

    it("a reader changes nothing: no Publish, no writing tools, no Delete", async () => {
        act(() =>
            root.render(
                <PostShell
                    data={data({
                        readOnly: true,
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
        expect(el("[data-saved-line]").textContent).toBe("Read only");
        expect(named("Publish")).toBeUndefined();
        expect(
            document.querySelector('[aria-label="Writing tools"]'),
        ).toBeNull();
        expect(document.querySelector('[aria-label="Post body"]')).toBeNull();
        expect(field("Post title").readOnly).toBe(true);
        await settle(() =>
            named(
                "More: preview, versions, share as a post, take off the site, delete",
            )?.click(),
        );
        const rows = Array.from(document.querySelectorAll("button")).map(
            (b) => b.textContent,
        );
        expect(rows.some((r) => r.startsWith("Feedback"))).toBe(true);
        expect(rows.some((r) => r.startsWith("Delete this post"))).toBe(false);
        expect(rows.some((r) => r.startsWith("Take off the site"))).toBe(false);
    });
});
