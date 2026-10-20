import { describe, expect, it, vi } from "vitest";

import { PublishedPage } from "./published-page";

/**
 * A published page is a customer's page, never the owner's preview
 * (DEC-172, R8, plan U4): every page the live site draws through here
 * (home, an inner page, /book, /shop) tells its blocks so, so "No photo
 * yet" never reaches a customer. It carries the publication's look.
 */

vi.mock("@saroh/site-blocks", () => ({
    PageSections: () => null,
    modulePageTopOf: () => null,
    reachOf: () => null,
}));
vi.mock("@/app/[domain]/account/actions", () => ({
    requestSignInCode: vi.fn(),
    verifySignInCode: vi.fn(),
}));
vi.mock("@/app/[domain]/account/messages/actions", () => ({
    sendMessage: vi.fn(),
}));
vi.mock("@/app/[domain]/account/plan/actions", () => ({
    buyPack: vi.fn(),
    joinPlan: vi.fn(),
    joinStartAutopay: vi.fn(),
    packPayment: vi.fn(),
    planJoinStanding: vi.fn(),
}));
vi.mock("@/lib/account-area", () => ({ accountAreaOn: () => false }));
vi.mock("@/lib/api-url", () => ({ publicApiUrl: () => "https://api.test" }));
vi.mock("@/lib/front-door", () => ({
    frontDoorFor: vi.fn(({ look }: { look?: string }) =>
        Promise.resolve(look ? { kind: "book", href: "/book" } : null),
    ),
}));
vi.mock("@/lib/customer-session", () => ({
    getSignedInCustomer: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("@/lib/publication", () => ({
    getJournalFeed: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock("@/lib/sign-in", () => ({ getSignInOptions: vi.fn() }));
vi.mock("@/lib/site-contact", () => ({ getSiteContact: vi.fn() }));
vi.mock("@/lib/site-packs", () => ({
    getPacksFeed: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock("@/lib/site-plans", () => ({
    getPlansFeed: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock("@/lib/site-product-grids", () => ({
    getProductGridFeeds: vi.fn(() => Promise.resolve([])),
}));

interface Drawn {
    props: { isOwnerPreview?: boolean; look?: unknown; frontDoor?: unknown };
}

async function draw(look?: string): Promise<Drawn> {
    const page = { path: "/", kind: "PAGE", sections: [] };
    const snapshot = {
        site: { name: "Kiln", ...(look ? { look } : {}) },
        pages: [page],
    };
    return await PublishedPage({
        page: page as never,
        snapshot: snapshot as never,
        siteId: "site_1",
    });
}

describe("a published page", () => {
    it("is never the owner's preview, and wears the publication's look", async () => {
        const drawn = await draw("live");
        expect(drawn.props.isOwnerPreview).toBe(false);
        expect(drawn.props.look).toBe("live");
        // The hero's way in beside its button (U6).
        expect(drawn.props.frontDoor).toEqual({ kind: "book", href: "/book" });
    });

    it("is Classic when the publication has no look", async () => {
        const drawn = await draw();
        expect(drawn.props.isOwnerPreview).toBe(false);
        expect(drawn.props.look).toBeUndefined();
        expect(drawn.props.frontDoor).toBeNull();
    });
});
