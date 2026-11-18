// @vitest-environment jsdom
/**
 * Create post (#1378; boards BPick*, BPost*, BOwn*, BDone*, 16 Nov):
 * each thing is drawn as the post it makes and opens finished, with its
 * own cards; drafts are counted and shown greyed on request; an own post
 * saves itself as it is written, shows its cards once saved, reopens and
 * can be deleted; Ready to share works on Free with the channels locked;
 * someone without `social:post` can still share items and reads one
 * message on own posts.
 */
import type { AnchorHTMLAttributes } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ShareSetup } from "@/lib/share-item/share";
import type { LinkChoice } from "@/lib/social/links";
import type { PickRow } from "@/lib/social/pick";

import type { Step } from "./create-post";
import { CreatePost } from "./create-post";

vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...rest
    }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
        <a href={href} {...rest}>
            {children}
        </a>
    ),
}));
const saved = vi.hoisted(() => ({
    calls: [] as { id: string | null; input: Record<string, unknown> }[],
}));
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const removed = vi.hoisted(() => ({ ids: [] as string[] }));
vi.mock("@saroh/ui/toast", () => ({
    showUndo: vi.fn(),
    showError: vi.fn(),
    showSuccess: vi.fn(),
}));
vi.mock("@/lib/social/saroh-social-actions", () => ({}));
vi.mock("@/lib/social/actions", () => ({
    removeOwnPost: (id: string) => {
        removed.ids.push(id);
        return Promise.resolve({ ok: true, data: {} });
    },
    saveOwnPost: (id: string | null, input: Record<string, unknown>) => {
        saved.calls.push({ id, input });
        return Promise.resolve({
            ok: true,
            data: {
                id: "sp_1",
                headline: input.headline ?? null,
                mediaId: input.mediaId ?? null,
                style: input.style ?? "colour",
                size: input.size ?? "post",
                caption: input.caption ?? "",
                linkPath: input.linkPath ?? "/",
                imagePath: "/public/share/own/sp_1/image",
                createdAt: "2026-11-13T10:00:00.000Z",
                updatedAt: `2026-11-13T10:00:0${saved.calls.length}.000Z`,
            },
        });
    },
}));
vi.mock("@/components/shared/fields/media-picker", () => ({
    MediaPicker: ({
        onPick,
        label,
    }: {
        onPick: (p: object) => void;
        label: string;
    }) => (
        <button
            type="button"
            data-media-picker=""
            onClick={() =>
                onPick({
                    src: "https://media.example.com/shopfront.jpg",
                    mediaId: "media_1",
                    filename: "Shopfront",
                })
            }
        >
            {label}
        </button>
    ),
}));

const FREE: ShareSetup = {
    apiOrigin: "https://api.example.com",
    siteId: "site_1",
    schedule: { tier: "free" },
};
const ORIGIN = "https://rye.example.com";

const row = (
    kind: PickRow["kind"],
    key: string,
    name: string,
    item: PickRow["item"],
): PickRow => ({ key, kind, name, line: kind, image: null, at: "", item });

const ROWS: PickRow[] = [
    row("book", "book:page", "Booking page", {
        kind: "book",
        ref: "page",
        name: "your booking page",
        price: null,
        url: `${ORIGIN}/book`,
        offerId: null,
    }),
    row("product", "product:p1", "Cardamom bun box", {
        kind: "product",
        ref: "cardamom-bun-box",
        name: "Cardamom bun box",
        price: "₹360",
        url: `${ORIGIN}/shop/cardamom-bun-box`,
        offerId: null,
        hasPhoto: true,
    }),
    row("service", "service:s1", "Sourdough class", {
        kind: "service",
        ref: "s1",
        name: "Sourdough class",
        price: "₹1,500",
        url: `${ORIGIN}/book?service=s1`,
        offerId: null,
    }),
    row("post", "post:b1", "How we shape a cardamom bun", {
        kind: "post",
        ref: "how-we-shape",
        name: "How we shape a cardamom bun",
        price: null,
        url: `${ORIGIN}/blog/how-we-shape`,
        offerId: null,
        hasPhoto: true,
    }),
    row("offer", "offer:d1", "20% off cardamom buns", {
        kind: "offer",
        ref: "d1",
        name: "20% off cardamom buns",
        price: null,
        url: `${ORIGIN}/shop`,
        offerId: "d1",
    }),
    row("post", "post:b2", "Our Christmas menu", null),
];
const FIXED: LinkChoice[] = [
    { value: "home", label: "Home", path: "/" },
    { value: "book", label: "Booking page", path: "/book" },
];
const PAGES: LinkChoice[] = [
    { value: "page:2", label: "Work with us", path: "/work-with-us" },
];

let root: Root;
let host: HTMLDivElement;
let fetched: string[];

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    window.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    saved.calls.length = 0;
    removed.ids.length = 0;
    router.push.mockReset();
    fetched = [];
    vi.stubGlobal(
        "fetch",
        vi.fn((url: string) => {
            fetched.push(url);
            return Promise.resolve({
                ok: true,
                status: 200,
                blob: () =>
                    Promise.resolve(new Blob(["png"], { type: "image/png" })),
            });
        }),
    );
    URL.createObjectURL = vi.fn(() => "blob:card");
    URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
});

async function flush(ms = 0) {
    for (let i = 0; i < 6; i++) {
        await act(async () => {
            await new Promise((r) => setTimeout(r, ms));
        });
    }
}

function render(canPost = true, start?: Step) {
    act(() =>
        root.render(
            <CreatePost
                rows={ROWS}
                setup={FREE}
                origin={ORIGIN}
                fixedLinks={FIXED}
                pageLinks={PAGES}
                canPost={canPost}
                business="Rye & Co."
                failed={[]}
                ownCount={2}
                start={start}
            />,
        ),
    );
}

function named(selector: string, name: string): HTMLElement {
    const hit = Array.from(
        document.querySelectorAll<HTMLElement>(selector),
    ).find(
        (b) =>
            b.textContent.trim() === name ||
            b.getAttribute("aria-label") === name,
    );
    if (!hit) throw new Error(`No ${selector} "${name}"`);
    return hit;
}
const pickRow = (kind: string) => {
    const el = Array.from(
        host.querySelectorAll<HTMLButtonElement>("[data-pick]"),
    ).find((b) => b.dataset.pick?.startsWith(`${kind}:`) && !b.disabled);
    if (!el) throw new Error(`No ${kind} tile`);
    return el;
};
async function press(el: HTMLElement) {
    await act(async () => {
        el.click();
        await Promise.resolve();
    });
    await flush();
}
function typeIn(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const proto =
        el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
    act(() => {
        Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}
const cards = () =>
    Array.from(host.querySelectorAll("[data-card]")).map((c) =>
        c.getAttribute("data-card"),
    );

describe("picking from the business", () => {
    it.each([
        ["product", ["photo", "price", "simple", "colour"], "/product/"],
        ["service", ["simple", "colour"], "/service/"],
        ["post", ["photo", "colour", "simple"], "/post/"],
        ["offer", ["offer", "simple", "colour"], "/offer/d1/"],
        ["book", ["colour", "simple"], "/api/share/book/image"],
    ])(
        "a %s opens finished, with its own cards",
        async (kind, expected, path) => {
            render();
            await press(pickRow(kind));
            expect(
                host.querySelector(`[data-item-composer="${kind}"]`),
            ).not.toBeNull();
            expect(host.querySelector("[data-insta-frame]")).not.toBeNull();
            expect(cards()).toEqual(expected);
            expect(fetched.some((u) => u.includes(path))).toBe(true);
        },
    );

    it("draws each live thing as the post it makes", () => {
        render();
        const tile = host.querySelector('[data-pick="product:p1"] img');
        expect(tile?.getAttribute("src")).toContain(
            "/public/share/site_1/product/cardamom-bun-box/image?style=price&size=post&w=240",
        );
    });

    it("counts drafts, and shows them greyed with why on request", async () => {
        render();
        expect(host.querySelector('[data-pick="post:b2"]')).toBeNull();
        expect(host.textContent).toContain(
            "1 draft isn't shown: publish it first.",
        );
        await press(named("button", "Show them"));
        const draft = host.querySelector<HTMLButtonElement>(
            '[data-pick="post:b2"]',
        );
        expect(draft?.disabled).toBe(true);
        expect(draft?.textContent).toContain(
            "Publish it first. A draft has no public page.",
        );
    });

    it("is ready to share on Free, with the channels locked, and Change goes back", async () => {
        render();
        await press(pickRow("product"));
        expect(host.querySelector("[data-ready-actions]")).not.toBeNull();
        expect(
            host.querySelector('[data-channels-locked="free"]'),
        ).not.toBeNull();
        await press(named("button", "Change"));
        expect(host.querySelector("[data-pick-step]")).not.toBeNull();
    });

    it("opens straight on a thing from Social", () => {
        render(true, { at: "item", key: "offer:d1" });
        expect(
            host.querySelector('[data-item-composer="offer"]'),
        ).not.toBeNull();
    });
});

const SAVED = {
    id: "sp_9",
    headline: "Open late on Saturday",
    mediaId: null,
    style: "colour" as const,
    size: "post" as const,
    caption: "Come by!",
    linkPath: "/book",
    imagePath: "/public/share/own/sp_9/image",
    createdAt: "2026-11-15T10:00:00.000Z",
    updatedAt: "2026-11-15T10:00:00.000Z",
};

describe("your own post", () => {
    it("saves as it is written and shows its cards once saved", async () => {
        render();
        await press(named("button", "Write a headline"));
        expect(host.querySelector("[data-own-no-cards]")).not.toBeNull();
        expect(cards()).toEqual([]);
        expect(host.textContent).toContain("Your posts (2)");
        const headline = host.querySelector<HTMLInputElement>(
            "[data-own-headline]",
        );
        if (!headline) throw new Error("No headline");
        typeIn(headline, "We're hiring a morning baker");
        await flush(200);
        expect(saved.calls).toEqual([
            {
                id: null,
                input: expect.objectContaining({
                    headline: "We're hiring a morning baker",
                    mediaId: null,
                    linkPath: "/",
                }) as object,
            },
        ]);
        expect(cards()).toEqual(["colour", "simple"]);
        expect(
            fetched.some((u) => u.includes("/public/share/own/sp_1/image")),
        ).toBe(true);
        expect(host.textContent).toContain("Draft saved");
        // Counted in Your posts once saved.
        expect(host.textContent).toContain("Your posts (3)");

        // The next change updates the same post.
        await press(named("button", "Edit"));
        const caption =
            host.querySelector<HTMLTextAreaElement>("[data-own-caption]");
        if (!caption) throw new Error("No caption");
        typeIn(caption, "Come say hello");
        await flush(200);
        expect(saved.calls.at(-1)?.id).toBe("sp_1");
        expect(saved.calls.at(-1)?.input.caption).toBe("Come say hello");
    });

    it("with a photo saves the photo and offers the Photo card", async () => {
        render();
        await press(named("button", "Use your photo"));
        await press(named("button", "Choose a photo"));
        await flush(200);
        expect(saved.calls[0]?.input.mediaId).toBe("media_1");
        expect(cards()).toEqual(["colour", "simple", "photo"]);
        expect(host.textContent).toContain("Shopfront");
    });

    it("reopens a saved post without saving it again, and deletes it", async () => {
        render(true, { at: "own", photo: false, post: SAVED });
        await flush(200);
        expect(saved.calls).toEqual([]);
        expect(
            host.querySelector<HTMLInputElement>("[data-own-headline]")?.value,
        ).toBe("Open late on Saturday");
        expect(cards()).toEqual(["colour", "simple"]);
        expect(host.textContent).toContain("Your posts (2)");
        await press(named("button", "Delete this draft"));
        await press(named("button", "Delete post"));
        await flush();
        expect(removed.ids).toEqual(["sp_9"]);
        expect(router.push).toHaveBeenCalledWith("/social");
    });
});

describe("without social:post", () => {
    it("says one message on own posts and still shares items", async () => {
        render(false);
        expect(host.textContent).toContain(
            "You can share, but making your own posts isn't part of your role.",
        );
        expect(host.textContent).not.toContain("Write a headline");
        await press(pickRow("product"));
        expect(host.querySelector("[data-ready-actions]")).not.toBeNull();
    });
});
