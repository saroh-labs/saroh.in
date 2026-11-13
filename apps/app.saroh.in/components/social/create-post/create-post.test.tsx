// @vitest-environment jsdom
/**
 * Create post (#1378, boards SGPick*, SGOwn*, SFCLocked*): picking each
 * kind leads to its own cards; a draft can't be picked and says why; an
 * own post saves itself as it is written and shows its cards once saved,
 * text only or with a photo; its link is one of the live pages, stored as
 * a path; Share now works on Free with Schedule locked; someone without
 * `social:post` can still share items and reads one message on own posts.
 */
import type { AnchorHTMLAttributes } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ShareSetup } from "@/lib/share-item/share";
import type { LinkChoice } from "@/lib/social/links";
import type { PickRow } from "@/lib/social/pick";

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
vi.mock("@/lib/social/actions", () => ({
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

function render(canPost = true) {
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
const pickRow = (kind: string, n = 0) => {
    const el = Array.from(
        host.querySelectorAll<HTMLElement>(
            `[data-pick-row="${kind}"]:not([data-draft]) button`,
        ),
    ).at(n);
    if (!el) throw new Error(`No ${kind} row`);
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
        ["service", ["photo", "price", "simple", "colour"], "/service/"],
        ["post", ["photo", "colour", "simple"], "/post/"],
        ["offer", ["offer", "simple", "colour"], "/offer/d1/"],
        ["book", ["colour", "photo", "simple"], "/api/share/book/image"],
    ])("a %s leads to its own cards", async (kind, expected, path) => {
        render();
        await press(pickRow(kind));
        await press(named("button", "Continue"));
        expect(
            host.querySelector(`[data-item-composer="${kind}"]`),
        ).not.toBeNull();
        expect(cards()).toEqual(expected);
        expect(fetched.some((u) => u.includes(path))).toBe(true);
    });

    it("greys a draft with why, and it can't be picked", () => {
        render();
        const draft = host.querySelector("[data-draft]");
        expect(draft?.textContent).toContain(
            "Publish it first. A draft has no public page.",
        );
        expect(draft?.querySelector("button")).toBeNull();
    });

    it("Continue waits for a pick", () => {
        render();
        expect(
            (named("button", "Continue") as HTMLButtonElement).disabled,
        ).toBe(true);
    });

    it("shares now on Free, with Schedule and Channels locked", async () => {
        render();
        await press(pickRow("product"));
        await press(named("button", "Continue"));
        await flush();
        const share = host.querySelector<HTMLButtonElement>("[data-share-now]");
        expect(share?.disabled).toBe(false);
        expect(
            host.querySelector('[data-channels-locked="free"]'),
        ).not.toBeNull();
        expect(
            host.querySelector('[aria-label="Schedule, locked"]'),
        ).not.toBeNull();
    });
});

describe("your own post", () => {
    it("text only saves as it is written and shows its cards once saved", async () => {
        render();
        await press(named("button", "Text only"));
        expect(host.querySelector("[data-own-no-cards]")).not.toBeNull();
        expect(cards()).toEqual([]);
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
        expect(host.textContent).toContain("Saved to your posts as you go.");

        // The next change updates the same post.
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
        await press(named("button", "Use a photo"));
        await press(named("button", "Choose a photo"));
        await flush(200);
        expect(saved.calls[0]?.input.mediaId).toBe("media_1");
        expect(cards()).toEqual(["colour", "simple", "photo"]);
        expect(host.textContent).toContain("Shopfront");
    });

    it("links only to the live pages offered, and stores the path", async () => {
        render();
        await press(named("button", "Text only"));
        // The Link rows: radio cards, each a label around its radio.
        const radios = Array.from(
            host.querySelectorAll<HTMLElement>('[role="radio"]'),
        ).filter((r) => r.closest("label"));
        const labels = radios.map((r) => r.closest("label")?.textContent);
        expect(labels).toEqual([
            "Homerye.example.com",
            "Booking pagerye.example.com/book",
            "A page",
        ]);
        const aPage = radios.at(2);
        if (!aPage) throw new Error("No A page");
        await press(aPage);
        expect(host.querySelector("[data-link-page]")?.textContent).toContain(
            "rye.example.com/work-with-us",
        );
        const headline = host.querySelector<HTMLInputElement>(
            "[data-own-headline]",
        );
        if (!headline) throw new Error("No headline");
        typeIn(headline, "Join us");
        await flush(200);
        expect(saved.calls.at(-1)?.input.linkPath).toBe("/work-with-us");
    });
});

describe("without social:post", () => {
    it("says one message on own posts and still shares items", async () => {
        render(false);
        expect(host.querySelector("[data-no-own-posts]")?.textContent).toBe(
            "You can share, but making your own posts isn't part of your role.",
        );
        expect(host.textContent).not.toContain("Text only");
        await press(pickRow("product"));
        await press(named("button", "Continue"));
        expect(host.querySelector("[data-share-now]")).not.toBeNull();
    });
});
