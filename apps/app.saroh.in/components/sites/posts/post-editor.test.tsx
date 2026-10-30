// @vitest-environment jsdom
/**
 * A new post's first save never loses what is typed while it is out
 * (UX-034). The draft is created after the autosave delay and the address
 * becomes `/posts/<id>`; that used to be a navigation, which remounted the
 * editor from the server's copy and dropped the body typed meanwhile.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { replace: vi.fn(), push: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

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
vi.mock("@/lib/content/actions", () => ({
    createPost: (...a: unknown[]) => createPost(...a),
    updatePost: (...a: unknown[]) => updatePost(...a),
    deletePost: vi.fn(),
    publishPost: vi.fn(),
    unpublishPost: vi.fn(),
}));
vi.mock("@/components/shared/fields/media-picker", () => ({
    MediaPicker: () => null,
}));
const createComment = vi.fn<(...a: unknown[]) => Promise<unknown>>();
const deleteComment = vi.fn<(...a: unknown[]) => Promise<unknown>>();
const setCommentResolved = vi.fn<(...a: unknown[]) => Promise<unknown>>();
vi.mock("@/lib/sites/actions", () => ({
    createComment: (...a: unknown[]) => createComment(...a),
    deleteComment: (...a: unknown[]) => deleteComment(...a),
    setCommentResolved: (...a: unknown[]) => setCommentResolved(...a),
    updateCommentBody: vi.fn(),
}));
vi.mock("@/components/billing/plan-refusal", () => ({
    showPlanRefusal: vi.fn(),
}));
vi.mock("@saroh/ui/toast", () => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
}));

import { PostEditor } from "./post-editor";

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
    window.history.replaceState(null, "", "/sites/s1/posts/new");
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.clearAllMocks();
});

function field(label: string): HTMLInputElement | HTMLTextAreaElement {
    const el = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        `[aria-label="${label}"]`,
    );
    if (!el) throw new Error(`no field ${label}`);
    return el;
}

/** Type into a controlled field the way React hears it. */
function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const proto = Object.getPrototypeOf(el) as object;
    Reflect.set(proto, "value", value, el);
    el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Let the promises a step started settle. */
async function settle(run: () => void) {
    await act(async () => {
        run();
        await Promise.resolve();
    });
}

describe("PostEditor, a new post's first save (UX-034)", () => {
    it("keeps the body typed while the draft is being created", async () => {
        let finish: (v: unknown) => void = () => undefined;
        createPost.mockReturnValue(
            new Promise((resolve) => {
                finish = resolve;
            }),
        );
        updatePost.mockResolvedValue({ ok: true, data: { id: "p1" } });

        act(() => root.render(<PostEditor siteId="s1" categories={[]} />));
        act(() => type(field("Post title"), "Wedding flowers"));

        // The autosave fires and the create is out.
        await settle(() => vi.advanceTimersByTime(2600));
        expect(createPost).toHaveBeenCalledTimes(1);

        // The merchant goes straight on to the body.
        act(() => type(field("Post body"), "We dress mandaps in marigold."));

        await settle(() => finish({ ok: true, data: { id: "p1" } }));

        // The address says the post exists, without a navigation …
        expect(window.location.pathname).toBe("/sites/s1/posts/p1");
        expect(router.replace).not.toHaveBeenCalled();
        // … and the words are still on screen.
        expect(field("Post body").value).toBe("We dress mandaps in marigold.");

        // The next autosave sends them to the post just created.
        await settle(() => vi.advanceTimersByTime(2600));
        expect(updatePost).toHaveBeenCalledWith(
            "s1",
            "p1",
            expect.objectContaining({
                content: "We dress mandaps in marigold.",
            }),
        );
    });
});

describe("PostEditor, the byline (UX-091)", () => {
    it("says the public byline is the writer's account name, and where to change it", () => {
        act(() =>
            root.render(
                <PostEditor
                    siteId="s1"
                    categories={[]}
                    post={{
                        id: "p1",
                        title: "Hello",
                        slug: "hello",
                        excerpt: null,
                        content: "",
                        categoryId: null,
                        featured: false,
                        image: null,
                        status: "DRAFT",
                        publishedAt: null,
                        createdAt: "2026-10-07T00:00:00Z",
                        author: "Asha Rao",
                        live: false,
                        liveAt: null,
                    }}
                />,
            ),
        );
        const details = Array.from(container.querySelectorAll("button")).find(
            (b) => b.textContent.trim() === "Details",
        );
        act(() => details?.click());
        expect(container.textContent).toContain(
            "Shown on the site as by Asha Rao.",
        );
        const link = Array.from(container.querySelectorAll("a")).find(
            (a) => a.textContent.trim() === "Change your name",
        );
        expect(link?.getAttribute("href")).toMatch(/\/account$/);
    });
});

describe("PostEditor read-only, for a Reviewer (DEC-200 U8)", () => {
    const post = {
        id: "p1",
        title: "Winter hours",
        slug: "winter-hours",
        excerpt: "We close early in December.",
        content:
            "<p>From <strong>1 December</strong> we close at 6.</p><script>alert(1)</script>",
        categoryId: null,
        featured: false,
        image: null,
        status: "DRAFT" as const,
        publishedAt: null,
        createdAt: "2026-10-07T00:00:00Z",
        author: "Asha Rao",
        live: false,
        liveAt: null,
    };
    const note = (over: Record<string, unknown>) => ({
        id: "n1",
        pageId: null,
        pageTitle: null,
        sectionKey: null,
        postId: "p1",
        postTitle: "Winter hours",
        body: "Say which day.",
        resolvedAt: null,
        createdAt: "2026-10-28T00:00:00Z",
        author: { id: "u1", name: "Meera" },
        orphaned: false,
        editable: false,
        ...over,
    });
    const buttons = () =>
        Array.from(container.querySelectorAll("button")).map((b) =>
            b.textContent.trim(),
        );
    const press = (label: string) =>
        Array.from(container.querySelectorAll("button"))
            .find((b) => b.textContent.trim() === label)
            ?.click();

    it("draws no Save, Publish or delete, no live input, and the body as text", () => {
        act(() =>
            root.render(
                <PostEditor
                    siteId="s1"
                    categories={[]}
                    post={post}
                    readOnly
                    feedback={{
                        comments: [],
                        canComment: true,
                        canSettle: false,
                    }}
                />,
            ),
        );
        act(() => press("Details"));
        expect(buttons()).not.toEqual(
            expect.arrayContaining([
                expect.stringMatching(
                    /Save draft|^Publish|Take off the site|Delete this post/,
                ),
            ]),
        );
        expect(container.textContent).toContain("you can't change anything");
        expect((field("Post title") as HTMLInputElement).readOnly).toBe(true);
        expect(field("Post path").disabled).toBe(true);
        expect(field("Post summary").disabled).toBe(true);
        expect(field("Cover image address").disabled).toBe(true);
        expect(container.querySelector('[aria-label="Post body"]')).toBeNull();
        // Shown as plain text: no element is made from the body's markup.
        expect(container.querySelector("strong, script")).toBeNull();
        expect(container.textContent).toContain(
            "From 1 December we close at 6.",
        );
        expect(container.textContent).not.toContain("Change your name");
        // Nothing is written however long it stays open.
        act(() => {
            vi.advanceTimersByTime(10_000);
        });
        expect(createPost).not.toHaveBeenCalled();
        expect(updatePost).not.toHaveBeenCalled();
    });

    it("opens on Feedback: a Reviewer adds a note on the post, and edits or deletes their own", async () => {
        createComment.mockResolvedValue({ ok: true, data: { id: "n9" } });
        deleteComment.mockResolvedValue({ ok: true, data: { id: "n2" } });
        act(() =>
            root.render(
                <PostEditor
                    siteId="s1"
                    categories={[]}
                    post={post}
                    readOnly
                    feedback={{
                        comments: [
                            note({}),
                            note({ id: "n2", body: "Mine", editable: true }),
                        ],
                        canComment: true,
                        canSettle: false,
                    }}
                />,
            ),
        );
        expect(container.textContent).toContain("Say which day.");
        // Only the reviewer's own open note offers Edit and Delete.
        expect(buttons().filter((b) => b === "Edit")).toHaveLength(1);
        expect(buttons()).not.toContain("Mark settled");

        const box = container.querySelector<HTMLTextAreaElement>(
            "#post-feedback-note",
        );
        if (!box) throw new Error("no note box");
        act(() => type(box, "Add the Sunday hours."));
        await settle(() => press("Add note"));
        expect(createComment).toHaveBeenCalledWith("s1", {
            postId: "p1",
            body: "Add the Sunday hours.",
        });

        await settle(() => press("Delete"));
        expect(deleteComment).toHaveBeenCalledWith("s1", "n2");
        expect(router.refresh).toHaveBeenCalled();
    });

    it("lets the owner settle a post's note in the post editor", async () => {
        setCommentResolved.mockResolvedValue({ ok: true, data: { id: "n1" } });
        act(() =>
            root.render(
                <PostEditor
                    siteId="s1"
                    categories={[]}
                    post={post}
                    feedback={{
                        comments: [note({})],
                        canComment: true,
                        canSettle: true,
                    }}
                />,
            ),
        );
        expect(buttons()).toContain("Publish");
        act(() => press("Feedback · 1"));
        await settle(() => press("Mark settled"));
        expect(setCommentResolved).toHaveBeenCalledWith("s1", "n1", true);
    });
});
