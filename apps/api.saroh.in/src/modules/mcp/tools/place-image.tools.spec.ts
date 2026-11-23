/**
 * `place_image` and `place_product_photo` (owner, 22 Nov): an image Ask AI
 * was shown, put on a product or a post. The business's own READY image
 * only; applying it makes it the library's; each target has its own gate.
 * The section branch writes through the editor's draft and is
 * `site.tools.db.spec.ts`.
 */
jest.mock("@saroh/database", () => ({
    prisma: { post: { updateMany: jest.fn() } },
}));

import { NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { McpCall } from "../tool-registry";
import type { SiteToolDeps } from "./site.tools";
import { siteTools } from "./site.tools";

const updateMany = prisma.post.updateMany as jest.Mock;

function setup(opts: { owned?: boolean } = {}) {
    const media = {
        readyObject: jest.fn((_org: string, id: string) =>
            opts.owned === false
                ? Promise.reject(new NotFoundException("not in library"))
                : Promise.resolve({
                      id,
                      url: "https://m.test/aisle.webp",
                      contentType: "image/webp",
                      sizeBytes: 1,
                      width: 1600,
                      height: 900,
                      placeholder: null,
                      widths: [],
                  }),
        ),
        adoptAskAiImage: jest.fn().mockResolvedValue(undefined),
    };
    const productImages = {
        listIn: jest.fn().mockResolvedValue([{ id: "pi1", mediaId: "old" }]),
        replaceIn: jest.fn().mockResolvedValue([]),
    };
    const productAccess = {
        edit: jest.fn().mockResolvedValue({ organizationId: "org_1" }),
    };
    const tools = siteTools({
        media,
        productImages,
        productAccess,
    } as unknown as SiteToolDeps);
    const get = (name: string) => {
        const t = tools.find((x) => x.name === name);
        if (!t) throw new Error(name);
        return t;
    };
    const call = { ctx: { organizationId: "org_1", userId: "u1" } } as McpCall;
    return { get, call, media, productImages, productAccess };
}

describe("each target has its own gate", () => {
    it("a section photo and a post cover need section:write and the website; a product photo, store:write and Commerce", () => {
        const t = setup();
        expect(t.get("place_image")).toMatchObject({
            capability: "section:write",
            module: "WEBSITE",
        });
        expect(t.get("place_product_photo")).toMatchObject({
            capability: "store:write",
            module: "COMMERCE",
        });
    });
});

describe("place_product_photo", () => {
    beforeEach(() => jest.clearAllMocks());

    it("puts the image first, keeping the others, and adopts it", async () => {
        const t = setup();
        const out = await t
            .get("place_product_photo")
            .run({ product_id: "pr1", media_id: "m1", alt: "Aisle" }, t.call);
        expect(t.media.readyObject).toHaveBeenCalledWith("org_1", "m1");
        expect(t.productImages.replaceIn).toHaveBeenCalledWith(
            { organizationId: "org_1" },
            "pr1",
            { images: [{ mediaId: "m1", alt: "Aisle" }, { id: "pi1" }] },
        );
        expect(t.media.adoptAskAiImage).toHaveBeenCalledWith("org_1", "m1");
        expect(out.data).toMatchObject({ media_id: "m1" });
    });

    it("another business's image is not found, and nothing is changed", async () => {
        const t = setup({ owned: false });
        await expect(
            t
                .get("place_product_photo")
                .run({ product_id: "pr1", media_id: "theirs" }, t.call),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(t.productImages.replaceIn).not.toHaveBeenCalled();
        expect(t.media.adoptAskAiImage).not.toHaveBeenCalled();
    });

    it("needs a media_id; Undo takes the first photo off, so the one before is first again", async () => {
        const t = setup();
        const tool = t.get("place_product_photo");
        await expect(tool.run({ product_id: "pr1" }, t.call)).rejects.toThrow(
            "media_id is needed",
        );
        t.productImages.listIn.mockResolvedValue([
            { id: "new", mediaId: "m1" },
            { id: "was", mediaId: "old" },
        ]);
        await tool.run({ product_id: "pr1", clear: true }, t.call);
        expect(t.productImages.replaceIn).toHaveBeenCalledWith(
            { organizationId: "org_1" },
            "pr1",
            { images: [{ id: "was" }] },
        );
    });
});

describe("place_image on a post", () => {
    beforeEach(() => jest.clearAllMocks());

    it("sets a cover only on the business's own post", async () => {
        const t = setup();
        updateMany.mockResolvedValue({ count: 1 });
        await t.get("place_image").run(
            {
                target: "post_cover",
                site_id: "s1",
                post_id: "po1",
                media_id: "m1",
            },
            t.call,
        );
        expect(updateMany).toHaveBeenCalledWith({
            where: {
                id: "po1",
                siteId: "s1",
                site: { organizationId: "org_1" },
            },
            data: { image: "https://m.test/aisle.webp" },
        });
        updateMany.mockResolvedValue({ count: 0 });
        await expect(
            t.get("place_image").run(
                {
                    target: "post_cover",
                    site_id: "s1",
                    post_id: "x",
                    media_id: "m1",
                },
                t.call,
            ),
        ).rejects.toThrow("no such post");
    });

    it("Undo puts the earlier cover back, or takes it off when there was none", async () => {
        const t = setup();
        updateMany.mockResolvedValue({ count: 1 });
        await t.get("place_image").run(
            {
                target: "post_cover",
                site_id: "s1",
                post_id: "po1",
                restore: { src: "https://m.test/old.webp" },
            },
            t.call,
        );
        expect(updateMany.mock.calls[0][0].data).toEqual({
            image: "https://m.test/old.webp",
        });
        await t.get("place_image").run(
            {
                target: "post_cover",
                site_id: "s1",
                post_id: "po1",
                clear: true,
            },
            t.call,
        );
        expect(updateMany.mock.calls[1][0].data).toEqual({ image: null });
        expect(t.media.adoptAskAiImage).not.toHaveBeenCalled();
    });
});
