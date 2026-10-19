import { beforeEach, describe, expect, it, vi } from "vitest";

import PreviewPage from "./[slug]/page";
import PreviewHomePage from "./page";

/**
 * A draft preview is the owner's preview (DEC-172, R8, plan U4): its
 * blocks are told so, and the draft's look, so "No photo yet" may show
 * here and nowhere a customer can reach (`components/published-page`).
 * The data layer is mocked; what is checked is what the page hands
 * `PageSections`.
 */

const preview = vi.hoisted((): { found: unknown } => ({ found: null }));

vi.mock("@/lib/publication", () => ({
    getPreviewByToken: vi.fn(() => Promise.resolve(preview.found)),
    findHomePage: (snapshot: { pages: unknown[] }) => snapshot.pages[0],
    findPageByPath: (snapshot: { pages: unknown[] }) => snapshot.pages[0],
    getPreviewJournalFeed: vi.fn(() => Promise.resolve(undefined)),
    getPreviewPosts: vi.fn(() => Promise.resolve([])),
    postsPrefix: () => "posts",
}));
vi.mock("@/lib/site-packs", () => ({
    getPreviewPacksFeed: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock("@/lib/site-plans", () => ({
    getPreviewPlansFeed: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock("@/lib/site-product-grids", () => ({
    getPreviewProductGridFeeds: vi.fn(() => Promise.resolve([])),
}));
vi.mock("@/lib/api-url", () => ({ publicApiUrl: () => "https://api.test" }));
vi.mock("@/lib/module-pages", () => ({ moduleOff: () => false }));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/components/preview-gone", () => ({ PreviewGone: () => null }));
vi.mock("@/components/post-view", () => ({ PostIndex: () => null }));
vi.mock("@saroh/site-blocks", () => ({
    PageSections: () => null,
    ModulePageUnavailable: () => null,
    modulePageTopOf: () => null,
}));

function found(look?: string) {
    return {
        ok: true,
        siteId: "site_1",
        siteName: "Kiln",
        expiresAt: "2026-11-01T00:00:00.000Z",
        modules: null,
        icon: null,
        snapshot: {
            site: { name: "Kiln", slug: "kiln", ...(look ? { look } : {}) },
            pages: [{ path: "/about", sections: [] }],
        },
    };
}

interface Drawn {
    props: { isOwnerPreview?: boolean; look?: unknown };
}

const home = async () =>
    (await PreviewHomePage({
        params: Promise.resolve({ token: "tok" }),
    })) as unknown as Drawn;
const inner = async () =>
    (await PreviewPage({
        params: Promise.resolve({ token: "tok", slug: "about" }),
    })) as unknown as Drawn;

describe("the draft preview is the owner's preview", () => {
    beforeEach(() => {
        preview.found = null;
    });

    it("tells the home page's blocks so, with the draft's look", async () => {
        preview.found = found("quiet");
        const drawn = await home();
        expect(drawn.props.isOwnerPreview).toBe(true);
        expect(drawn.props.look).toBe("quiet");
    });

    it("tells an inner page's blocks so too", async () => {
        preview.found = found("folio");
        const drawn = await inner();
        expect(drawn.props.isOwnerPreview).toBe(true);
        expect(drawn.props.look).toBe("folio");
    });

    it("hands a Classic draft no look", async () => {
        preview.found = found();
        const drawn = await home();
        expect(drawn.props.isOwnerPreview).toBe(true);
        expect(drawn.props.look).toBeUndefined();
    });
});
