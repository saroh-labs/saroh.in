// DB-free unit tests for a product's photos and videos (#517): Prisma is
// mocked, the product gate and the library are stubs. The DB-backed photo-set
// cases live in products.sections.spec.ts (integration project).
jest.mock("@saroh/database", () => {
    const tx = {
        productImage: {
            deleteMany: jest.fn(),
            update: jest.fn(),
            create: jest.fn(),
        },
        product: { update: jest.fn() },
    };
    return {
        prisma: {
            productImage: { findMany: jest.fn() },
            $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
            __tx: tx,
        },
    };
});

import { BadRequestException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { MediaService } from "../media/media.service";
import type { ProductImageInput } from "./dto";
import { ProductImagesService } from "./product-images.service";
import type { ProductsService } from "./products.service";

interface Tx {
    productImage: {
        deleteMany: jest.Mock;
        update: jest.Mock;
        create: jest.Mock;
    };
    product: { update: jest.Mock };
}
const tx = (prisma as unknown as { __tx: Tx }).__tx;
const findMany = prisma.productImage.findMany as jest.Mock;

/** Library objects by id: photos, videos, and one still uploading. */
const LIBRARY: Record<string, { contentType: string }> = {
    ...Object.fromEntries(
        Array.from({ length: 16 }, (_, i) => [
            `img_${i + 1}`,
            { contentType: "image/jpeg" },
        ]),
    ),
    vid_1: { contentType: "video/mp4" },
    vid_2: { contentType: "video/quicktime" },
    vid_3: { contentType: "video/mp4" },
    vid_4: { contentType: "video/mp4" },
};

const media = {
    readyObject: jest.fn((organizationId: string, mediaId: string) => {
        const object = LIBRARY[mediaId];
        if (organizationId !== "org_1" || !object) {
            return Promise.reject(
                new NotFoundException("That photo is not in your library"),
            );
        }
        return Promise.resolve({
            id: mediaId,
            url: `https://cdn.test/${mediaId}`,
            contentType: object.contentType,
            sizeBytes: 10,
        });
    }),
} as unknown as MediaService;

const products = {
    assertProductWritable: jest.fn().mockResolvedValue("org_1"),
    assertProductReadable: jest.fn().mockResolvedValue(undefined),
} as unknown as ProductsService;

const service = new ProductImagesService(products, media);

/** A saved row, as findMany returns it. */
function row(over: Record<string, unknown>) {
    return {
        id: "row",
        url: "https://cdn.test/x",
        mediaId: null,
        alt: "",
        width: null,
        height: null,
        creditName: null,
        creditUrl: null,
        position: 0,
        kind: "photo",
        durationSec: null,
        posterMediaId: null,
        posterUrl: null,
        ...over,
    };
}

const photos = (n: number): ProductImageInput[] =>
    Array.from({ length: n }, (_, i) => ({
        mediaId: `img_${i + 1}`,
        alt: `Photo ${i + 1}`,
    }));
const videos = (n: number): ProductImageInput[] =>
    Array.from({ length: n }, (_, i) => ({
        kind: "video" as const,
        mediaId: `vid_${i + 1}`,
        durationSec: 20 + i,
    }));

function replace(images: ProductImageInput[]) {
    return service.replace("store_1", "prod_1", "user_1", { images });
}

/** What the transaction wrote, in position order. */
function written() {
    return tx.productImage.create.mock.calls.map(
        (call: [{ data: Record<string, unknown> }]) => call[0].data,
    );
}

describe("ProductImagesService — 15 photos and 3 videos (#517)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        findMany.mockResolvedValue([]);
    });

    it("saves 15 photos and 3 videos, in order, with the first photo as cover", async () => {
        // A video first, then 15 photos, then two more videos.
        const [first, ...rest] = videos(3);
        await replace([first, ...photos(15), ...rest]);

        const rows = written();
        expect(rows).toHaveLength(18);
        expect(rows.map((r) => r.position)).toEqual(
            Array.from({ length: 18 }, (_, i) => i),
        );
        expect(rows.map((r) => r.kind)).toEqual([
            "video",
            ...Array<string>(15).fill("photo"),
            "video",
            "video",
        ]);
        expect(rows[0]).toMatchObject({
            mediaId: "vid_1",
            url: "https://cdn.test/vid_1",
            durationSec: 20,
            organizationId: "org_1",
        });
        // The cover mirrored onto the product is the first photo, never a
        // video — lists and orders draw it in an <img>.
        expect(tx.product.update).toHaveBeenCalledWith({
            where: { id: "prod_1" },
            data: { image: "https://cdn.test/img_1" },
        });
    });

    it("refuses a 16th photo", async () => {
        await expect(replace(photos(16))).rejects.toThrow(
            "Already 15 photos — take one off first.",
        );
        expect(tx.productImage.create).not.toHaveBeenCalled();
    });

    it("refuses a 4th video", async () => {
        await expect(replace([...photos(2), ...videos(4)])).rejects.toThrow(
            "Already 3 videos — take one off first.",
        );
        expect(tx.productImage.create).not.toHaveBeenCalled();
    });

    it("counts kept videos by the kind they were saved as", async () => {
        findMany.mockResolvedValue([
            row({ id: "v1", kind: "video" }),
            row({ id: "v2", kind: "video" }),
            row({ id: "v3", kind: "video" }),
        ]);
        await expect(
            replace([
                { id: "v1" },
                { id: "v2" },
                { id: "v3" },
                { kind: "video", mediaId: "vid_4" },
            ]),
        ).rejects.toThrow("Already 3 videos — take one off first.");
    });

    it("refuses a video slot pointing at an image", async () => {
        await expect(
            replace([{ kind: "video", mediaId: "img_1" }]),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(tx.productImage.create).not.toHaveBeenCalled();
    });

    it("refuses a photo slot pointing at a video", async () => {
        await expect(replace([{ mediaId: "vid_1" }])).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it("refuses a video by address", async () => {
        await expect(
            replace([{ kind: "video", url: "https://example.test/a.mp4" }]),
        ).rejects.toThrow(/has to be uploaded/);
    });

    it("takes a video's poster from the library, never an address", async () => {
        await replace([
            { kind: "video", mediaId: "vid_1", posterMediaId: "img_2" },
        ]);
        expect(written()[0]).toMatchObject({
            posterMediaId: "img_2",
            posterUrl: "https://cdn.test/img_2",
        });
        await expect(
            replace([
                { kind: "video", mediaId: "vid_1", posterMediaId: "vid_2" },
            ]),
        ).rejects.toThrow("A video's poster has to be a photo.");
        await expect(
            replace([{ mediaId: "img_1", posterMediaId: "img_2" }]),
        ).rejects.toThrow("Only a video has a poster and a length.");
    });

    it("leaves an existing product with 5 photos as it was", async () => {
        const five = Array.from({ length: 5 }, (_, i) =>
            row({
                id: `p${i + 1}`,
                url: `https://cdn.test/old-${i + 1}.jpg`,
                alt: `Old ${i + 1}`,
                position: i,
            }),
        );
        findMany.mockResolvedValue(five);
        await replace(five.map((p) => ({ id: p.id })));

        expect(tx.productImage.create).not.toHaveBeenCalled();
        const updates = tx.productImage.update.mock.calls.map(
            (
                call: [
                    { where: { id: string }; data: Record<string, unknown> },
                ],
            ) => call[0],
        );
        expect(updates.map((u) => u.where.id)).toEqual([
            "p1",
            "p2",
            "p3",
            "p4",
            "p5",
        ]);
        expect(updates[0]?.data).toMatchObject({
            url: "https://cdn.test/old-1.jpg",
            alt: "Old 1",
            kind: "photo",
            durationSec: null,
            posterMediaId: null,
            position: 0,
        });
        expect(tx.product.update).toHaveBeenCalledWith({
            where: { id: "prod_1" },
            data: { image: "https://cdn.test/old-1.jpg" },
        });
    });

    it("keeps a moved video's duration and poster", async () => {
        findMany.mockResolvedValue([
            row({ id: "p1" }),
            row({
                id: "v1",
                kind: "video",
                url: "https://cdn.test/vid_1",
                durationSec: 42,
                posterMediaId: "img_3",
                posterUrl: "https://cdn.test/img_3",
            }),
        ]);
        await replace([{ id: "v1" }, { id: "p1" }]);
        const first = tx.productImage.update.mock.calls[0]?.[0] as {
            where: { id: string };
            data: Record<string, unknown>;
        };
        expect(first.where.id).toBe("v1");
        expect(first.data).toMatchObject({
            kind: "video",
            durationSec: 42,
            posterMediaId: "img_3",
            posterUrl: "https://cdn.test/img_3",
            position: 0,
        });
    });
});
