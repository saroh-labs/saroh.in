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
vi.mock("@/components/sites/media-picker", () => ({ MediaPicker: () => null }));
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
