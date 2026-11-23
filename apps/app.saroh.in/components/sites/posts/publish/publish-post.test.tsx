// @vitest-environment jsdom
/**
 * The post's History, its reviewer's view and Publish post (U17, U18):
 * versions compare and restore; a reader sees the changes against the live
 * copy and pins notes to words; Publish post lists the changes, checks,
 * publishes now or later, then offers Tell people.
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
    usePathname: () => "/sites/s1/write/p1",
}));
vi.mock("next/dynamic", () => ({
    default: () =>
        function Stand({
            value,
            onChange,
            readOnly,
        }: {
            value: string;
            onChange: (v: string) => void;
            readOnly?: boolean;
        }) {
            // A reader's styled post (R3): its paragraphs, nothing to type in.
            if (readOnly)
                return (
                    <div>
                        {value
                            .split("</p>")
                            .map((t) => t.replace(/<[^>]*>/g, " ").trim())
                            .filter(Boolean)
                            .map((t) => (
                                <p key={t}>{t}</p>
                            ))}
                    </div>
                );
            return (
                <textarea
                    aria-label="Post body"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                />
            );
        },
}));

const publishPost = vi.fn<(...a: unknown[]) => Promise<unknown>>();
const schedulePost = vi.fn<(...a: unknown[]) => Promise<unknown>>();
const restorePostRevision = vi.fn<(...a: unknown[]) => Promise<unknown>>();
const createComment = vi.fn<(...a: unknown[]) => Promise<unknown>>();
vi.mock("@/lib/content/actions", () => ({
    createPost: vi.fn(),
    updatePost: vi.fn(),
    publishPost: (...a: unknown[]) => publishPost(...a),
    schedulePost: (...a: unknown[]) => schedulePost(...a),
    unschedulePost: vi.fn(),
    restorePostRevision: (...a: unknown[]) => restorePostRevision(...a),
    deletePost: vi.fn(),
    unpublishPost: vi.fn(),
    createPostCategory: vi.fn(),
    updatePostCategory: vi.fn(),
    deletePostCategory: vi.fn(),
}));
const readPostRevisions = vi.fn<(...a: unknown[]) => Promise<unknown>>();
const readPostRevision = vi.fn<(...a: unknown[]) => Promise<unknown>>();
const readPostChecks = vi.fn<(...a: unknown[]) => Promise<unknown>>(() =>
    Promise.resolve([]),
);
vi.mock("@/lib/sites/post-revisions-read", () => ({
    readPostRevisions: (...a: unknown[]) => readPostRevisions(...a),
    readPostRevision: (...a: unknown[]) => readPostRevision(...a),
    readPostChecks: (...a: unknown[]) => readPostChecks(...a),
}));
vi.mock("@/components/shared/fields/media-picker", () => ({
    MediaPicker: () => null,
}));
vi.mock("@/components/shared/share-item/share-item-sheet", () => ({
    ShareItemButton: () => <button type="button">Share</button>,
    ShareItemSheet: () => null,
}));
vi.mock("@/lib/sites/actions", () => ({
    createComment: (...a: unknown[]) => createComment(...a),
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

import type { PostEditorData } from "../editor/post-model";
import { PostShell } from "../editor/post-shell";
import { selectedQuote } from "../post-feedback";
import { lastChangedBy, postChecks, serverChecks } from "./publish-post";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = "";
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
    askAi: false,
    readBy: null,
    ...over,
});

const post: PostDetail = {
    id: "p1",
    title: "Bridal trial",
    slug: "bridal-makeup-trial",
    excerpt: "What to expect.",
    content: "<p>A trial is a rehearsal.</p><p>The trial costs a little.</p>",
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
        content:
            "<p>A trial is a rehearsal.</p><p>The trial costs a little and friends.</p>",
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

const named = (name: string) =>
    Array.from(document.querySelectorAll("button")).find(
        (b) =>
            b.getAttribute("aria-label") === name ||
            b.textContent.trim() === name,
    );

async function settle(run: () => void) {
    await act(async () => {
        run();
        for (let i = 0; i < 6; i++) await Promise.resolve();
    });
}

describe("Publish post (U18)", () => {
    it("lists the changes since the live copy, checks, and goes live alone", async () => {
        publishPost.mockResolvedValue({
            ok: true,
            data: { path: "/blog/bridal-makeup-trial" },
        });
        act(() => root.render(<PostShell data={data()} post={post} />));
        await settle(() => named("Publish post")?.click());
        const sheet = document.querySelector('[role="dialog"]');
        expect(sheet?.textContent).toContain("Publish this post");
        expect(sheet?.textContent).toContain("1 change goes live");
        expect(sheet?.textContent).toContain("The writing");
        expect(sheet?.textContent).toContain("Short description is set");
        expect(sheet?.textContent).toContain(
            "Goes live now, on its own. Site changes waiting stay waiting.",
        );
        // No Leave out inside one post (C9).
        expect(named("Leave out")).toBeUndefined();

        const submit = Array.from(
            document.querySelectorAll<HTMLButtonElement>(
                '[role="dialog"] button[type="submit"]',
            ),
        ).find((b) => b.textContent.includes("Publish post"));
        await settle(() => submit?.click());
        expect(publishPost).toHaveBeenCalledWith("s1", "p1");
        expect(document.querySelector("[data-tell-people]")).not.toBeNull();
        expect(document.body.textContent).toContain("Live now");
        expect(document.body.textContent).toContain("WhatsApp status");
    });

    it("focuses Now with the row's light ink edge, not the radio's ring (Y2·4)", async () => {
        act(() => root.render(<PostShell data={data()} post={post} />));
        await settle(() => named("Publish post")?.click());
        const now = document.querySelector<HTMLElement>(
            '[role="dialog"] [role="radiogroup"] label',
        );
        expect(now?.textContent).toContain("Now");
        expect(now?.className).toContain(
            "has-[:focus-visible]:shadow-[inset_0_0_0_1px_hsl(var(--foreground))]",
        );
        expect(now?.className).toContain(
            "[&_[role=radio]:focus-visible]:ring-0",
        );
    });

    it("asks who to tell before it goes, and shows only those once live (Y2)", async () => {
        publishPost.mockResolvedValue({
            ok: true,
            data: { path: "/blog/bridal-makeup-trial" },
        });
        act(() => root.render(<PostShell data={data()} post={post} />));
        await settle(() => named("Publish post")?.click());
        const before = document.querySelector("[data-tell-once-live]");
        expect(before?.textContent).toContain("Tell people once it is live");
        expect(before?.textContent).toContain("WhatsApp status");
        // Switches (`WXYPublish`), after When in the sheet.
        const whatsapp = Array.from(
            before?.querySelectorAll<HTMLElement>('[role="switch"]') ?? [],
        ).at(-1);
        const order = Array.from(
            document.querySelectorAll('[role="dialog"] h3'),
        ).map((h) => h.textContent);
        expect(order.indexOf("When")).toBeLessThan(
            order.indexOf("Tell people once it is live"),
        );
        expect(order.indexOf("Checked")).toBeLessThan(order.indexOf("When"));
        await settle(() => whatsapp?.click());
        const submit = Array.from(
            document.querySelectorAll<HTMLButtonElement>(
                '[role="dialog"] button[type="submit"]',
            ),
        ).find((b) => b.textContent.includes("Publish post"));
        await settle(() => submit?.click());
        const after = document.querySelector("[data-tell-people]");
        expect(after).not.toBeNull();
        expect(after?.textContent).not.toContain("WhatsApp status");
    });

    it("Later schedules it at the day and time picked, and says why it can't", async () => {
        schedulePost.mockResolvedValueOnce({
            ok: false,
            error: "Pick a time at least 5 minutes from now.",
            field: "at",
        });
        act(() => root.render(<PostShell data={data()} post={post} />));
        await settle(() => named("Publish post")?.click());
        await settle(() =>
            document
                .querySelector<HTMLButtonElement>(
                    '[role="radio"][value="later"]',
                )
                ?.click(),
        );
        const submit = Array.from(
            document.querySelectorAll<HTMLButtonElement>(
                '[role="dialog"] button[type="submit"]',
            ),
        ).find((b) => b.textContent.includes("Schedule"));
        expect(submit).toBeDefined();
        await settle(() => submit?.click());
        expect(schedulePost).toHaveBeenCalledWith(
            "s1",
            "p1",
            expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
        );
        expect(publishPost).not.toHaveBeenCalled();
        expect(
            document.querySelector('[role="dialog"] [role="alert"]')
                ?.textContent,
        ).toBe("Pick a time at least 5 minutes from now.");
    });

    it("adds the API's price and link checks, and who changed what", async () => {
        readPostChecks.mockResolvedValueOnce([
            {
                type: "brokenLink",
                message: "The link to /prices opens no page on this site.",
            },
        ]);
        readPostRevisions.mockResolvedValueOnce({
            ok: true,
            rows: [
                {
                    id: "r1",
                    reason: "autosave",
                    note: null,
                    title: post.title,
                    slug: post.slug,
                    createdAt: "2026-11-20T03:30:00.000Z",
                    savedBy: { id: "u2", name: "Meera" },
                },
            ],
        });
        readPostRevision.mockResolvedValueOnce({
            ...post.liveCopy,
            id: "r1",
            reason: "autosave",
            note: null,
            content: post.content,
            categoryId: "c1",
            authorId: null,
            createdAt: "2026-11-20T03:30:00.000Z",
            savedBy: { id: "u2", name: "Meera" },
        });
        act(() => root.render(<PostShell data={data()} post={post} />));
        await settle(() => named("Publish post")?.click());
        await settle(() => undefined);
        const sheet = document.querySelector('[role="dialog"]');
        expect(readPostChecks).toHaveBeenCalledWith("s1", "p1", post.content);
        expect(sheet?.textContent).toContain("Prices match Services");
        expect(sheet?.textContent).toContain(
            "The link to /prices opens no page on this site.",
        );
        expect(
            sheet?.querySelector("[data-post-changes] li")?.textContent,
        ).toBe("The writingMeera");
    });

    it("says when the API's checks couldn't run, never passes them", () => {
        expect(serverChecks(null)).toEqual([
            {
                ok: false,
                text: "Couldn't check prices and links. Publishing still works.",
            },
        ]);
        expect(serverChecks([]).map((c) => c.ok)).toEqual([true, true]);
    });

    it("names whoever last changed each part since it went live", () => {
        const live = post.liveCopy;
        if (!live) throw new Error("the fixture post has a live copy");
        const view = {
            title: live.title,
            content: live.content,
            excerpt: live.excerpt ?? "",
            image: "",
            imageAlt: "",
            slug: live.slug,
            category: "Bridal",
            seoTitle: "",
            seoDescription: "",
        };
        const byMeera = { ...view, content: "<p>New.</p>" };
        const byRavi = { ...byMeera, title: "New title" };
        expect(
            lastChangedBy(
                live,
                [
                    { view: byMeera, by: "Meera" },
                    { view: byRavi, by: "Ravi" },
                ],
                { ...byRavi, category: "" },
            ),
        ).toEqual({ words: "Meera", title: "Ravi", category: "Ravi" });
    });

    it("checks the photos are described", () => {
        const base = {
            title: "T",
            content: '<p>x</p><img src="a.jpg"><img src="b.jpg" alt="A chair">',
            slug: "",
            excerpt: "",
            categoryId: "",
            image: "c.jpg",
            imageAlt: "",
            seoTitle: "",
            seoDescription: "",
        };
        const [photos, short] = postChecks(base);
        expect(photos.ok).toBe(false);
        expect(photos.text).toContain("2 photos not described");
        expect(short.ok).toBe(false);
        expect(
            postChecks({
                ...base,
                content: "<p>x</p>",
                imageAlt: "A bride",
            })[0],
        ).toEqual({ ok: true, text: "Every photo is described" });
    });
});

describe("History (U17)", () => {
    it("lists the versions, compares one with now and restores it", async () => {
        readPostRevisions.mockResolvedValue({
            ok: true,
            rows: [
                {
                    id: "r2",
                    reason: "autosave",
                    note: null,
                    title: "Bridal trial",
                    slug: "bridal-makeup-trial",
                    createdAt: new Date().toISOString(),
                    savedBy: { id: "u1", name: "Ritika Sharma" },
                },
                {
                    id: "r1",
                    reason: "published",
                    note: null,
                    title: "Bridal trial",
                    slug: "bridal-makeup-trial",
                    createdAt: "2026-11-12T03:30:00.000Z",
                    savedBy: { id: "u2", name: "Mohit Mehta" },
                },
            ],
        });
        readPostRevision.mockResolvedValue({
            id: "r1",
            reason: "published",
            note: null,
            title: "Bridal trial",
            slug: "bridal-makeup-trial",
            createdAt: "2026-11-12T03:30:00.000Z",
            savedBy: { id: "u2", name: "Mohit Mehta" },
            content:
                "<p>A trial is a rehearsal.</p><p>The trial costs a little and friends.</p>",
            excerpt: "What to expect.",
            image: null,
            imageAlt: null,
            seoTitle: null,
            seoDescription: null,
            shareImageUrl: null,
            categoryId: "c1",
            authorId: null,
        });
        restorePostRevision.mockResolvedValue({ ok: true, data: { id: "p1" } });
        const reload = vi.fn();
        vi.stubGlobal("location", { ...window.location, reload });

        act(() => root.render(<PostShell data={data()} post={post} />));
        await settle(() => named("History")?.click());
        expect(document.body.textContent).toContain("Versions");
        expect(document.body.textContent).toContain("Today");
        expect(document.body.textContent).toContain("Earlier");
        const live = document.querySelector('[data-version="r1"]');
        expect(live?.textContent).toContain("Live");
        expect(live?.textContent).toContain("published");

        await settle(() => (live as HTMLButtonElement | null)?.click());
        const compare = document.querySelector("[data-version-compare]");
        expect(compare?.textContent).toContain("Comparing");
        expect(compare?.querySelector("del")?.textContent).toContain(
            "and friends.",
        );
        const restore = Array.from(
            document.querySelectorAll<HTMLButtonElement>(
                '[role="dialog"] button[type="submit"]',
            ),
        ).find((b) => b.textContent.includes("Restore this version"));
        await settle(() => restore?.click());
        expect(restorePostRevision).toHaveBeenCalledWith("s1", "p1", "r1");
        expect(reload).toHaveBeenCalled();
        vi.unstubAllGlobals();
    });
});

describe("the reviewer's view (U17, DEC-200)", () => {
    const reader = data({
        readOnly: true,
        feedback: { comments: [], canComment: true, canSettle: false },
    });

    it("marks the changes against the live copy, read only", () => {
        act(() => root.render(<PostShell data={reader} post={post} />));
        const review = document.querySelector("[data-post-review]");
        // The legend sits in the canvas bar on the desk (R3.2).
        expect(
            document.querySelector("[data-canvas-bar] [data-review-legend]")
                ?.textContent,
        ).toContain("Since the live copy");
        // Drawn as the post looks (R3); the marks themselves are
        // change-marks.test.ts's, on a real editor.
        expect(review?.getAttribute("data-post-review")).toBe("styled");
        expect(named("Next change")).toBeDefined();
        expect(named("Publish post")).toBeUndefined();
        expect(named("History")).toBeUndefined();
    });

    it("pins a note to the words selected in the post", async () => {
        createComment.mockResolvedValue({ ok: true, data: { id: "n1" } });
        act(() => root.render(<PostShell data={reader} post={post} />));
        const words = document.querySelector("[data-post-review] p");
        if (!words?.firstChild) throw new Error("no words");
        const range = document.createRange();
        range.selectNodeContents(words);
        await settle(() => {
            document.getSelection()?.removeAllRanges();
            document.getSelection()?.addRange(range);
            document.dispatchEvent(new Event("selectionchange"));
        });
        expect(
            document.querySelector("[data-note-quote]")?.textContent,
        ).toContain("A trial is a rehearsal.");
        const box = document.querySelector<HTMLTextAreaElement>(
            "#post-feedback-note",
        );
        if (!box) throw new Error("no note box");
        act(() => {
            Reflect.set(
                Object.getPrototypeOf(box) as object,
                "value",
                "Say how long.",
                box,
            );
            box.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await settle(() => named("Add note")?.click());
        expect(createComment).toHaveBeenCalledWith("s1", {
            postId: "p1",
            body: "Say how long.",
            quote: "A trial is a rehearsal.",
        });
    });

    it("ignores a selection outside the post", () => {
        const p = document.createElement("p");
        p.textContent = "Elsewhere";
        document.body.appendChild(p);
        const range = document.createRange();
        range.selectNodeContents(p);
        document.getSelection()?.removeAllRanges();
        document.getSelection()?.addRange(range);
        expect(selectedQuote(document.getSelection())).toBeNull();
    });
});
