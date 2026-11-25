// @vitest-environment jsdom
/**
 * Products → Reviews on React Query (DEC-259): the header and tabs at once,
 * the rows as skeletons until the reviews land; a reply or a hide passes
 * the tab's business, reads the reviews once (the bell beside them) and
 * nothing else on screen; a refused one reads nothing.
 */
import type { ReactNode } from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
    reply: vi.fn<(...a: unknown[]) => Promise<unknown>>(),
    hide: vi.fn<(...a: unknown[]) => Promise<unknown>>(),
}));
vi.mock("@/lib/product-reviews/actions", () => ({
    replyToReview: (...a: unknown[]) => h.reply(...a),
    setReviewHidden: (...a: unknown[]) => h.hide(...a),
    inviteReviews: vi.fn(),
}));
vi.mock("@saroh/ui/toast", () => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
    showUndo: vi.fn(),
    showWarning: vi.fn(),
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
    usePathname: () => "/commerce/products",
}));
// The sheet drawn in place: what is tested is the save, not Radix.
vi.mock("@saroh/ui/form-sheet", () => ({
    FormSheet: ({
        open,
        title,
        children,
        extra,
        onSubmit,
        saveLabel,
    }: {
        open: boolean;
        title: ReactNode;
        children: ReactNode;
        extra?: ReactNode;
        onSubmit: () => void;
        saveLabel: string;
    }) =>
        open ? (
            <div role="dialog">
                <h2>{title}</h2>
                {children}
                {extra}
                <button type="button" onClick={onSubmit}>
                    {saveLabel}
                </button>
            </div>
        ) : null,
}));
vi.mock("@/lib/api/http", () => ({}));

import { renderWithQuery } from "@/lib/query/test-utils";

import { ReviewsContainer } from "./reviews-container";

const REVIEW = {
    id: "r1",
    rating: 3,
    body: "Strap could be softer",
    displayName: "Asha",
    productId: "p1",
    productName: "Helmet",
    storeId: "s1",
    invitedTo: "asha@example.com",
    status: "PUBLISHED",
    reply: null,
    repliedAt: null,
    createdAt: "2026-11-20T10:00:00.000Z",
};
const COUNTS = {
    items: [],
    nextCursor: null,
    total: 0,
    pageSize: 1,
    counts: { all: 7, collections: 0, inventory: 5 },
    storefronts: { everywhere: 0, byStorefront: [] },
    needs: [],
};

let release: () => void;
const reads: string[] = [];
const tick = (ms = 20) => act(() => new Promise((r) => setTimeout(r, ms)));

beforeEach(() => {
    window.matchMedia = ((q: string) => ({
        matches: false,
        media: q,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    reads.length = 0;
    h.reply.mockReset();
    h.hide.mockReset();
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    release = open;
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
            reads.push(url.split("?")[0]);
            if (url.startsWith("/api/products")) {
                return new Response(JSON.stringify(COUNTS));
            }
            if (url.startsWith("/api/product-reviews/invites")) {
                return new Response(
                    JSON.stringify({ orders: [], emailSetup: null }),
                );
            }
            await gate;
            return new Response(
                JSON.stringify({ reviews: [REVIEW], ratings: [] }),
            );
        }),
    );
});
afterEach(() => vi.unstubAllGlobals());

function open(initialReviewId?: string) {
    return renderWithQuery(
        <ReviewsContainer
            canWrite={false}
            may={{ connect: true, plans: true }}
            hrefs={{
                all: "/commerce/products",
                collections: "/commerce/products?view=collections",
                inventory: "/commerce/products?view=inventory",
                reviews: "/commerce/products?tab=reviews",
            }}
            showInventory
            hasStores
            since={null}
            initialReviewId={initialReviewId}
        />,
    );
}

const button = (name: string) =>
    Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === name,
    );

describe("Reviews before its first read", () => {
    it("draws the header and tabs at once, the rows as skeletons, then the reviews", async () => {
        const { host, unmount } = open();
        await tick();
        expect(host.querySelector("h1")?.textContent).toContain("Products");
        expect(host.textContent).toContain("Reviews");
        expect(host.querySelector('[data-shape="rows"]')).not.toBeNull();
        expect(host.textContent).not.toContain("Strap could be softer");
        // A role that can't invite asks nothing about invitations.
        expect(reads).not.toContain("/api/product-reviews/invites");

        release();
        await tick(50);
        expect(host.querySelector('[data-shape="rows"]')).toBeNull();
        expect(host.textContent).toContain("Strap could be softer");
        unmount();
    });
});

describe("a reply and a hide", () => {
    async function opened() {
        // A writer: Invite reviews' read answers with no orders.
        const r = renderWithQuery(
            <ReviewsContainer
                canWrite
                may={{ connect: true, plans: true }}
                hrefs={{
                    all: "/a",
                    collections: "/c",
                    inventory: "/i",
                    reviews: "/r",
                }}
                showInventory
                hasStores
                since={null}
                initialReviewId="r1"
            />,
        );
        release();
        await tick(50);
        reads.length = 0;
        return r;
    }

    it("posts with the tab's business, then reads the reviews once and nothing else", async () => {
        h.reply.mockResolvedValue({ ok: true, data: REVIEW });
        const { unmount } = await opened();
        const box =
            document.querySelector<HTMLTextAreaElement>("#review-reply");
        act(() => {
            Object.getOwnPropertyDescriptor(
                HTMLTextAreaElement.prototype,
                "value",
            )?.set?.call(box, "Thanks, noted.");
            box?.dispatchEvent(new Event("input", { bubbles: true }));
        });
        act(() => button("Post reply")?.click());
        await tick(50);
        expect(h.reply).toHaveBeenCalledWith("r1", "Thanks, noted.", "org_1");
        expect(reads.filter((u) => u === "/api/product-reviews")).toHaveLength(
            1,
        );
        // The list's counts and Invite reviews' list are not read again.
        expect(reads).not.toContain("/api/products");
        expect(reads).not.toContain("/api/product-reviews/invites");
        unmount();
    });

    it("a refused hide reads nothing", async () => {
        h.hide.mockResolvedValue({ ok: false, error: "No." });
        const { unmount } = await opened();
        act(() => button("Hide review")?.click());
        await tick(50);
        expect(h.hide).toHaveBeenCalledWith("r1", true, "org_1");
        expect(reads).toEqual([]);
        unmount();
    });
});
