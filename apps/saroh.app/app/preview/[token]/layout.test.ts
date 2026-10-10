import { beforeEach, describe, expect, it, vi } from "vitest";

import { generateMetadata } from "./layout";

/**
 * A draft preview's tab shows the icon publishing would (DEC-120), and
 * stays unindexed whatever the link's state.
 */
const preview = vi.hoisted((): { found: unknown } => ({ found: null }));

vi.mock("@/lib/publication", () => ({
    getPreviewByToken: vi.fn(() => Promise.resolve(preview.found)),
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@saroh/site-blocks", () => ({}));
vi.mock("@/components/preview-gone", () => ({ PreviewGone: () => null }));
vi.mock("@/lib/in-page-menu", () => ({ previewMenu: vi.fn() }));
vi.mock("@/lib/preview-links", () => ({ KEEP_LINKS_INSIDE: "" }));
vi.mock("@/lib/site-fonts", () => ({ SITE_FACES: {} }));

const OWN = "https://media.saroh.test/org/o1/site-image/icon.png";

function found(icon: unknown) {
    return {
        ok: true,
        siteName: "Kiln",
        siteId: "site_1",
        expiresAt: "2026-11-01T00:00:00.000Z",
        modules: null,
        icon,
        snapshot: {
            site: {
                name: "Kiln",
                slug: "kiln",
                styleVariables: { "--site-accent": "20 60% 40%" },
            },
            pages: [],
        },
    };
}

const metadataFor = () =>
    generateMetadata({ params: Promise.resolve({ token: "tok" }) });

describe("a draft preview's icon", () => {
    beforeEach(() => {
        preview.found = null;
    });

    it("is the draft's own icon, or the business logo standing in", async () => {
        preview.found = found({ url: OWN, type: "image/png", source: "site" });
        const metadata = await metadataFor();
        expect(metadata.icons).toEqual({
            icon: [{ url: OWN, type: "image/png" }],
            apple: [{ url: OWN, type: "image/png" }],
        });
        expect(metadata.robots).toEqual({ index: false, follow: false });
    });

    it("is the site's plain tile with neither, carried in the link", async () => {
        preview.found = found(null);
        const { icons } = (await metadataFor()) as {
            icons: { icon: { url: string; type: string }[] };
        };
        expect(icons.icon[0].type).toBe("image/svg+xml");
        const svg = decodeURIComponent(icons.icon[0].url);
        expect(svg).toContain(">K</text>");
        expect(svg).toContain("hsl(20 60% 40%)");
        expect(svg).not.toMatch(/saroh/i);
    });

    it("names none for a link that has stopped working, and is still unindexed", async () => {
        preview.found = { ok: false, reason: "expired" };
        const metadata = await metadataFor();
        expect(metadata.icons).toBeUndefined();
        expect(metadata.title).toBe("Draft preview");
        expect(metadata.robots).toEqual({ index: false, follow: false });
    });
});
