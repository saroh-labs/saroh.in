// @vitest-environment jsdom
/**
 * Post approval (O7): with "Publishing needs approval" on, a teammate's
 * Publish post is Send for approval (WXYApproval); the post says whose
 * approval it waits for; an approver sees the band with Approve and Ask
 * for changes (a reason, UX-043), and approving with feedback open asks
 * first (WXWReview).
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PostApproval, PostDetail } from "@/lib/content/service";

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

const publishPost = vi.fn<(...a: unknown[]) => Promise<unknown>>();
const schedulePost = vi.fn<(...a: unknown[]) => Promise<unknown>>();
const restorePostRevision = vi.fn<(...a: unknown[]) => Promise<unknown>>();
const createComment = vi.fn<(...a: unknown[]) => Promise<unknown>>();
const requestPostApproval = vi.fn<(...a: unknown[]) => Promise<unknown>>();
const approvePost = vi.fn<(...a: unknown[]) => Promise<unknown>>();
const askPostChanges = vi.fn<(...a: unknown[]) => Promise<unknown>>();
vi.mock("@/lib/content/actions", () => ({
    createPost: vi.fn(),
    updatePost: vi.fn(),
    publishPost: (...a: unknown[]) => publishPost(...a),
    schedulePost: (...a: unknown[]) => schedulePost(...a),
    unschedulePost: vi.fn(),
    restorePostRevision: (...a: unknown[]) => restorePostRevision(...a),
    deletePost: vi.fn(),
    unpublishPost: vi.fn(),
    requestPostApproval: (...a: unknown[]) => requestPostApproval(...a),
    approvePost: (...a: unknown[]) => approvePost(...a),
    askPostChanges: (...a: unknown[]) => askPostChanges(...a),
    createPostCategory: vi.fn(),
    updatePostCategory: vi.fn(),
    deletePostCategory: vi.fn(),
}));
const readPostRevisions = vi.fn<(...a: unknown[]) => Promise<unknown>>();
const readPostRevision = vi.fn<(...a: unknown[]) => Promise<unknown>>();
vi.mock("@/lib/sites/post-revisions-read", () => ({
    readPostRevisions: (...a: unknown[]) => readPostRevisions(...a),
    readPostRevision: (...a: unknown[]) => readPostRevision(...a),
    readPostChecks: () => Promise.resolve([]),
}));
vi.mock("@/components/shared/fields/media-picker", () => ({
    MediaPicker: () => null,
}));
vi.mock("@/components/shared/share-item/share-item-sheet", () => ({
    ShareItemButton: () => <button type="button">Share</button>,
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
import {
    approvalStatus,
    approversLine,
    approversNote,
    sentForApprovalWords,
} from "./approval-words";

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

const approvers: PostApproval["approvers"] = [
    { id: "u-kavya", name: "Kavya Iyer", role: "REVIEWER" },
    { id: "u-mohit", name: "Mohit", role: "OWNER" },
];

const approval = (over: Partial<PostApproval> = {}): PostApproval => ({
    on: true,
    mustAsk: false,
    canApprove: false,
    state: "waiting",
    fingerprint: "fp-1",
    lastEditorId: "u-ritika",
    verdict: null,
    request: null,
    approvers,
    ...over,
});

const request = {
    by: { id: "u-ritika", name: "Ritika Sharma" },
    note: "Okay to go live Friday?",
    at: "2026-11-20T04:35:00.000Z",
};

const submit = (words: string) =>
    Array.from(
        document.querySelectorAll<HTMLButtonElement>(
            '[role="dialog"] button[type="submit"]',
        ),
    ).find((b) => b.textContent.includes(words));

describe("the words (O7)", () => {
    it("names who can approve, and whose approval a post waits for", () => {
        expect(approversLine(approvers)).toBe(
            "Kavya (reviewer) or Mohit (owner)",
        );
        expect(approversNote(2)).toBe("Either can approve. Both get an email.");
        // The ask goes by email only (P1): the toast says so, nothing more.
        expect(sentForApprovalWords(approvers)).toBe(
            "Sent for approval. Kavya and Mohit get an email.",
        );
        expect(sentForApprovalWords(approvers.slice(0, 1))).toBe(
            "Sent for approval. Kavya gets an email.",
        );
        expect(sentForApprovalWords([])).toBe("Sent for approval.");
        expect(approvalStatus(approval({ request }))).toBe(
            "Waiting for Kavya's or Mohit's approval",
        );
        expect(
            approvalStatus(
                approval({ request, approvers: approvers.slice(0, 1) }),
            ),
        ).toBe("Waiting for Kavya's approval");
        expect(approvalStatus(approval())).toBeNull();
        expect(approvalStatus(approval({ on: false, request }))).toBeNull();
        expect(
            approvalStatus(
                approval({
                    state: "asked",
                    verdict: {
                        by: { id: "u-kavya", name: "Kavya Iyer" },
                        at: request.at,
                        reason: "Say 60 days of the trial.",
                    },
                }),
            ),
        ).toBe("Kavya asked for changes");
    });
});

describe("Send for approval (O7)", () => {
    it("turns Publish post into a request with a note, and never publishes", async () => {
        requestPostApproval.mockResolvedValue({
            ok: true,
            data: { id: "p1", scheduledAt: null },
        });
        act(() =>
            root.render(
                <PostShell
                    data={data()}
                    post={{ ...post, approval: approval({ mustAsk: true }) }}
                />,
            ),
        );
        await settle(() => named("Publish post")?.click());
        const sheet = document.querySelector('[role="dialog"]');
        expect(sheet?.textContent).toContain("Send for approval");
        expect(sheet?.textContent).toContain(
            "Kavya (reviewer) or Mohit (owner)",
        );
        expect(sheet?.textContent).toContain("As soon as it is approved");
        expect(sheet?.textContent).toContain(
            "You can keep writing. Changes after you send go for approval too.",
        );
        const note = sheet?.querySelector("textarea");
        await settle(() => {
            if (!note) return;
            Object.getOwnPropertyDescriptor(
                HTMLTextAreaElement.prototype,
                "value",
            )?.set?.call(note, "Before Saturday?");
            note.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await settle(() => submit("Send for approval")?.click());
        expect(requestPostApproval).toHaveBeenCalledWith("s1", "p1", {
            note: "Before Saturday?",
        });
        expect(publishPost).not.toHaveBeenCalled();
    });

    it("the post says whose approval it waits for", () => {
        act(() =>
            root.render(
                <PostShell
                    data={data()}
                    post={{ ...post, approval: approval({ request }) }}
                />,
            ),
        );
        expect(
            document.querySelector("[data-status-chip]")?.textContent,
        ).toContain("Waiting for Kavya's or Mohit's approval");
        expect(
            document.querySelector('[data-approval-band="waiting"]'),
        ).not.toBeNull();
    });
});

describe("the approver's band (O7)", () => {
    const reviewer = (over: Partial<PostApproval> = {}) =>
        ({
            ...post,
            approval: approval({ canApprove: true, request, ...over }),
        }) satisfies PostDetail;

    it("approves the post as read, which publishes it", async () => {
        approvePost.mockResolvedValue({
            ok: true,
            data: { published: true, scheduledAt: null },
        });
        act(() =>
            root.render(
                <PostShell data={data({ readOnly: true })} post={reviewer()} />,
            ),
        );
        const band = document.querySelector('[data-approval-band="approver"]');
        expect(band?.textContent).toContain(
            "Ritika asked you to approve 1 change",
        );
        expect(band?.textContent).toContain("“Okay to go live Friday?”");
        await settle(() => named("Approve")?.click());
        expect(approvePost).toHaveBeenCalledWith("s1", "p1", "fp-1");
        expect(router.refresh).toHaveBeenCalled();
    });

    it("asks first when feedback is still open", async () => {
        const comment = (id: string) => ({
            id,
            pageId: null,
            pageTitle: null,
            sectionKey: null,
            postId: "p1",
            postTitle: "Bridal trial",
            body: "Is it 90 minutes?",
            resolvedAt: null,
            createdAt: request.at,
            author: { id: "u-kavya", name: "Kavya Iyer" },
            orphaned: false,
            editable: true,
        });
        act(() =>
            root.render(
                <PostShell
                    data={data({
                        readOnly: true,
                        feedback: {
                            comments: [comment("n1"), comment("n2")],
                            canComment: true,
                            canSettle: false,
                        },
                    })}
                    post={reviewer()}
                />,
            ),
        );
        await settle(() => named("Approve")?.click());
        expect(approvePost).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain(
            "2 pieces of feedback are still open. Approve anyway?",
        );
        expect(named("Back to feedback")).toBeDefined();
    });

    it("Ask for changes needs a reason", async () => {
        askPostChanges.mockResolvedValue({ ok: true, data: { id: "p1" } });
        act(() =>
            root.render(
                <PostShell data={data({ readOnly: true })} post={reviewer()} />,
            ),
        );
        await settle(() => named("Ask for changes")?.click());
        // The field opens; sending it empty is refused here.
        await settle(() => named("Ask for changes")?.click());
        expect(askPostChanges).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain("Say what needs changing.");
    });

    it("draws nothing for someone who can't approve, with nothing asked", () => {
        act(() =>
            root.render(
                <PostShell
                    data={data()}
                    post={{ ...post, approval: approval() }}
                />,
            ),
        );
        expect(document.querySelector("[data-approval-band]")).toBeNull();
    });
});
