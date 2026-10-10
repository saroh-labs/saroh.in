// DB-free unit tests: the database package is mocked so nothing touches a real
// Postgres, and the ObjectStorage port is a hand-rolled fake so nothing touches
// R2 or the network.
jest.mock("@saroh/database", () => {
    return {
        prisma: {
            media: {
                create: jest.fn(),
                findUnique: jest.fn(),
                findMany: jest.fn(),
                update: jest.fn(),
                delete: jest.fn(),
            },
            // Products showing an object; default "none" as for publications.
            productImage: { count: jest.fn().mockResolvedValue(0) },
            // Businesses using it as their logo; default "none".
            businessProfile: { count: jest.fn().mockResolvedValue(0) },
            // Sites using it as their own icon (DEC-120); default "none".
            site: { count: jest.fn().mockResolvedValue(0) },
            // The delete guard counts publications referencing a key. Default
            // to "none", so existing remove tests keep their meaning.
            $queryRaw: jest.fn().mockResolvedValue([{ count: 0 }]),
        },
    };
});

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";
import type {
    HeadObjectResult,
    ObjectStorage,
    SignedUploadUrl,
} from "@saroh/object-storage";

import type { OrganizationContext } from "../../common/types/organization-context";
import { planMeter } from "../billing/metering.service";
import { MediaService } from "./media.service";
import { NOT_AN_IMAGE_MESSAGE } from "./upload-checks";

const create = prisma.media.create as jest.Mock;
const findUnique = prisma.media.findUnique as jest.Mock;
const findMany = prisma.media.findMany as jest.Mock;
const update = prisma.media.update as jest.Mock;
const del = prisma.media.delete as jest.Mock;
const queryRaw = prisma.$queryRaw as unknown as jest.Mock;
const productImageCount = prisma.productImage.count as jest.Mock;
const logoCount = prisma.businessProfile.count as jest.Mock;
const siteIconCount = prisma.site.count as jest.Mock;

function ctx(over: Partial<OrganizationContext> = {}): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: "user_1",
        role: "ADMIN",
        ...over,
    };
}

/** A fully-stubbed ObjectStorage port; each test overrides what it asserts on. */
function fakeStorage(over: Partial<ObjectStorage> = {}): ObjectStorage {
    return {
        createSignedUploadUrl: jest.fn(),
        createSignedDownloadUrl: jest.fn(),
        getPublicUrl: jest.fn(),
        deleteObject: jest.fn().mockResolvedValue(undefined),
        headObject: jest.fn().mockResolvedValue(null),
        readObjectStart: jest.fn().mockResolvedValue(null),
        // Local development's storage unless a test says otherwise.
        seesUploads: false,
        ...over,
    };
}

const SIGNED: SignedUploadUrl = {
    url: "https://storage.test/upload/org/org_1/img.png?sig=x",
    method: "PUT",
    key: "org/org_1/product-image/uuid-img.png",
    headers: { "Content-Type": "image/png", "Content-Length": "1234" },
    expiresAt: "2026-01-01T00:00:00.000Z",
    maxContentLength: 1234,
};

describe("MediaService.createUpload", () => {
    beforeEach(() => jest.clearAllMocks());

    it("issues a signed URL and writes a PENDING row scoped to the ctx org", async () => {
        const createSignedUploadUrl = jest.fn().mockResolvedValue(SIGNED);
        const storage = fakeStorage({ createSignedUploadUrl });
        const service = new MediaService(storage);
        create.mockResolvedValue({ id: "media_1", key: SIGNED.key });

        const result = await service.createUpload(ctx(), {
            contentType: "image/png",
            contentLength: 1234,
            filename: "img.png",
            purpose: "product-image",
        });

        // The port is asked to sign for the ctx org (never a client-supplied one).
        expect(createSignedUploadUrl).toHaveBeenCalledWith({
            organizationId: "org_1",
            contentType: "image/png",
            contentLength: 1234,
            filename: "img.png",
            purpose: "product-image",
        });

        // The PENDING row is scoped to the ctx org, keyed by the port's key, and
        // carries the port-derived key / content-type — not anything else.
        expect(create).toHaveBeenCalledTimes(1);
        const data = create.mock.calls[0][0].data;
        expect(data).toMatchObject({
            organizationId: "org_1",
            key: SIGNED.key,
            contentType: "image/png",
            sizeBytes: 1234,
            filename: "img.png",
            purpose: "product-image",
            status: "PENDING",
            uploadedByUserId: "user_1",
        });

        // The response carries the port's url/key/headers/expiry for the client PUT.
        expect(result).toEqual({
            mediaId: "media_1",
            uploadUrl: SIGNED.url,
            method: "PUT",
            headers: SIGNED.headers,
            key: SIGNED.key,
            expiresAt: SIGNED.expiresAt,
        });
    });

    it("denies a MEMBER (media:write is OWNER/ADMIN-only) before any I/O", async () => {
        const createSignedUploadUrl = jest.fn();
        const service = new MediaService(
            fakeStorage({ createSignedUploadUrl }),
        );

        await expect(
            service.createUpload(ctx({ role: "MEMBER" }), {
                contentType: "image/png",
                contentLength: 10,
                filename: "x.png",
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);

        // Policy denies BEFORE touching storage or the DB.
        expect(createSignedUploadUrl).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
    });
});

describe("MediaService.completeUpload", () => {
    beforeEach(() => jest.clearAllMocks());

    it("flips a PENDING row to READY and reconciles size from headObject", async () => {
        const head: HeadObjectResult = {
            key: SIGNED.key,
            contentType: "image/png",
            contentLength: 2048,
        };
        const headObject = jest.fn().mockResolvedValue(head);
        const service = new MediaService(fakeStorage({ headObject }));
        findUnique.mockResolvedValue({
            id: "media_1",
            organizationId: "org_1",
            key: SIGNED.key,
            sizeBytes: 1234,
        });
        update.mockResolvedValue({
            id: "media_1",
            status: "READY",
            sizeBytes: 2048,
        });

        const res = await service.completeUpload(ctx(), "media_1");

        expect(headObject).toHaveBeenCalledWith(SIGNED.key);
        expect(update).toHaveBeenCalledWith({
            where: { id: "media_1" },
            data: { status: "READY", sizeBytes: 2048 },
        });
        expect(res).toEqual({
            id: "media_1",
            status: "READY",
            sizeBytes: 2048,
        });
    });

    it("soft-meters the plan's storage with the file's size in GB (U13)", async () => {
        const withRoom = jest.spyOn(planMeter, "withRoom");
        const service = new MediaService(
            fakeStorage({
                headObject: jest.fn().mockResolvedValue({
                    key: SIGNED.key,
                    contentType: "image/png",
                    contentLength: 250_000_000,
                }),
            }),
        );
        findUnique.mockResolvedValue({
            id: "media_1",
            organizationId: "org_1",
            key: SIGNED.key,
            sizeBytes: 1234,
            status: "PENDING",
        });
        update.mockResolvedValue({
            id: "media_1",
            status: "READY",
            sizeBytes: 250_000_000,
        });
        await service.completeUpload(ctx(), "media_1");
        expect(withRoom).toHaveBeenCalledWith(
            "org_1",
            "storage",
            expect.any(Function),
            { soft: true, adding: 0.25 },
        );
        // Confirming again adds nothing it hadn't counted.
        findUnique.mockResolvedValue({
            id: "media_1",
            organizationId: "org_1",
            key: SIGNED.key,
            sizeBytes: 250_000_000,
            status: "READY",
        });
        await service.completeUpload(ctx(), "media_1");
        expect(withRoom.mock.calls[1][3]).toEqual({ soft: true, adding: 0 });
        withRoom.mockRestore();
    });

    it("rejects a cross-tenant complete with 404 and never updates", async () => {
        const service = new MediaService(fakeStorage());
        // Row exists but belongs to another org.
        findUnique.mockResolvedValue({
            id: "media_1",
            organizationId: "org_OTHER",
            key: SIGNED.key,
            sizeBytes: 1,
        });

        await expect(
            service.completeUpload(ctx(), "media_1"),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(update).not.toHaveBeenCalled();
    });
});

describe("MediaService — a file is what its type says (#517)", () => {
    beforeEach(() => jest.clearAllMocks());

    const MB = 1024 * 1024;
    const ftyp = new Uint8Array([
        0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
    ]);
    const html = new TextEncoder().encode("<!doctype html><script>");

    it("signs an MP4 or MOV up to 50 MB under the video purpose", async () => {
        const createSignedUploadUrl = jest.fn().mockResolvedValue(SIGNED);
        const service = new MediaService(
            fakeStorage({ createSignedUploadUrl }),
        );
        create.mockResolvedValue({ id: "media_v", key: SIGNED.key });
        for (const contentType of ["video/mp4", "video/quicktime"]) {
            await service.createUpload(ctx(), {
                contentType,
                contentLength: 50 * MB,
                filename: "pour.mp4",
                purpose: "product-video",
            });
        }
        expect(createSignedUploadUrl).toHaveBeenCalledTimes(2);
    });

    it("refuses a 60 MB video in the merchant's words, before signing", async () => {
        const createSignedUploadUrl = jest.fn();
        const service = new MediaService(
            fakeStorage({ createSignedUploadUrl }),
        );
        await expect(
            service.createUpload(ctx(), {
                contentType: "video/mp4",
                contentLength: 60 * MB,
                filename: "long.mp4",
                purpose: "product-video",
            }),
        ).rejects.toThrow(
            "That video is over 50 MB. Keep it under a minute, or export it smaller.",
        );
        expect(createSignedUploadUrl).not.toHaveBeenCalled();
    });

    it("refuses a PDF sent as product media", async () => {
        const service = new MediaService(fakeStorage());
        await expect(
            service.createUpload(ctx(), {
                contentType: "application/pdf",
                contentLength: MB,
                filename: "menu.pdf",
                purpose: "product-video",
            }),
        ).rejects.toThrow(
            "That is not a photo or a video. Choose a JPG, PNG, WebP, MP4 or MOV.",
        );
    });

    it("refuses a video outside the video purpose", async () => {
        const service = new MediaService(fakeStorage());
        await expect(
            service.createUpload(ctx(), {
                contentType: "video/mp4",
                contentLength: MB,
                filename: "pour.mp4",
                purpose: "site-image",
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(create).not.toHaveBeenCalled();
    });

    it("completes a video whose first bytes are an ftyp box", async () => {
        const readObjectStart = jest.fn().mockResolvedValue(ftyp);
        const service = new MediaService(fakeStorage({ readObjectStart }));
        findUnique.mockResolvedValue({
            id: "media_v",
            organizationId: "org_1",
            key: "org/org_1/product-video/pour.mp4",
            contentType: "video/mp4",
            sizeBytes: 5 * MB,
            status: "PENDING",
        });
        update.mockResolvedValue({
            id: "media_v",
            status: "READY",
            sizeBytes: 5 * MB,
            key: "org/org_1/product-video/pour.mp4",
        });
        const out = await service.completeUpload(ctx(), "media_v");
        expect(readObjectStart).toHaveBeenCalledWith(
            "org/org_1/product-video/pour.mp4",
            12,
        );
        expect(out.status).toBe("READY");
    });

    it("marks a file labelled video/mp4 without an ftyp box FAILED and deletes it", async () => {
        const readObjectStart = jest.fn().mockResolvedValue(html);
        const deleteObject = jest.fn().mockResolvedValue(undefined);
        const service = new MediaService(
            fakeStorage({ readObjectStart, deleteObject }),
        );
        findUnique.mockResolvedValue({
            id: "media_x",
            organizationId: "org_1",
            key: "org/org_1/product-video/evil.mp4",
            contentType: "video/mp4",
            sizeBytes: 100,
            status: "PENDING",
        });
        await expect(service.completeUpload(ctx(), "media_x")).rejects.toThrow(
            "That file is not a video we can show. Choose an MP4 or MOV.",
        );
        expect(update).toHaveBeenCalledWith({
            where: { id: "media_x" },
            data: { status: "FAILED" },
        });
        expect(update).not.toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ status: "READY" }),
            }),
        );
        expect(deleteObject).toHaveBeenCalledWith(
            "org/org_1/product-video/evil.mp4",
        );
    });

    it("fails a video whose bytes can't be read at all", async () => {
        const service = new MediaService(fakeStorage());
        findUnique.mockResolvedValue({
            id: "media_y",
            organizationId: "org_1",
            key: "k.mp4",
            contentType: "video/quicktime",
            sizeBytes: 100,
            status: "PENDING",
        });
        await expect(
            service.completeUpload(ctx(), "media_y"),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(update).toHaveBeenCalledWith({
            where: { id: "media_y" },
            data: { status: "FAILED" },
        });
    });

    it("won't complete a FAILED upload a second time", async () => {
        const readObjectStart = jest.fn();
        const service = new MediaService(fakeStorage({ readObjectStart }));
        findUnique.mockResolvedValue({
            id: "media_x",
            organizationId: "org_1",
            key: "k.mp4",
            contentType: "video/mp4",
            sizeBytes: 100,
            status: "FAILED",
        });
        await expect(
            service.completeUpload(ctx(), "media_x"),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(readObjectStart).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
    });

    it("completes a photo whose first bytes are a PNG", async () => {
        const png = new Uint8Array([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d,
        ]);
        const readObjectStart = jest.fn().mockResolvedValue(png);
        const service = new MediaService(fakeStorage({ readObjectStart }));
        findUnique.mockResolvedValue(photo("m1"));
        update.mockResolvedValue({
            id: "m1",
            status: "READY",
            sizeBytes: 10,
            key: "a.png",
        });
        await service.completeUpload(ctx(), "m1");
        expect(readObjectStart).toHaveBeenCalledWith("a.png", 12);
        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ status: "READY" }),
            }),
        );
    });

    it("marks a page labelled image/png FAILED and deletes it", async () => {
        const readObjectStart = jest.fn().mockResolvedValue(html);
        const deleteObject = jest.fn().mockResolvedValue(undefined);
        const service = new MediaService(
            fakeStorage({ readObjectStart, deleteObject }),
        );
        findUnique.mockResolvedValue(photo("m2"));
        await expect(service.completeUpload(ctx(), "m2")).rejects.toThrow(
            NOT_AN_IMAGE_MESSAGE,
        );
        expect(update).toHaveBeenCalledWith({
            where: { id: "m2" },
            data: { status: "FAILED" },
        });
        expect(deleteObject).toHaveBeenCalledWith("a.png");
    });

    it("completes a photo whose bytes can't be read, as local storage never has them", async () => {
        const service = new MediaService(fakeStorage());
        findUnique.mockResolvedValue(photo("m3"));
        update.mockResolvedValue({
            id: "m3",
            status: "READY",
            sizeBytes: 10,
            key: "a.png",
        });
        await service.completeUpload(ctx(), "m3");
        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ status: "READY" }),
            }),
        );
    });

    it("marks a photo nothing was stored for FAILED, where storage sees uploads (#873)", async () => {
        const deleteObject = jest.fn().mockResolvedValue(undefined);
        const service = new MediaService(
            fakeStorage({ seesUploads: true, deleteObject }),
        );
        findUnique.mockResolvedValue(photo("m4"));
        await expect(service.completeUpload(ctx(), "m4")).rejects.toThrow(
            "That upload didn't go through. Upload the file again.",
        );
        expect(update).toHaveBeenCalledWith({
            where: { id: "m4" },
            data: { status: "FAILED" },
        });
        expect(update).not.toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ status: "READY" }),
            }),
        );
        expect(deleteObject).toHaveBeenCalledWith("a.png");
    });

    it("refuses an SVG logo before signing anything (#873)", async () => {
        const createSignedUploadUrl = jest.fn();
        const service = new MediaService(
            fakeStorage({ createSignedUploadUrl }),
        );
        await expect(
            service.createUpload(ctx(), {
                contentType: "image/svg+xml",
                contentLength: 2048,
                filename: "logo.svg",
                purpose: "business-logo",
            }),
        ).rejects.toThrow("That file isn't a PNG, JPG or WebP image.");
        expect(createSignedUploadUrl).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
    });

    function photo(id: string) {
        return {
            id,
            organizationId: "org_1",
            key: "a.png",
            contentType: "image/png",
            sizeBytes: 10,
            status: "PENDING",
        };
    }
});

describe("MediaService.completeUpload — the url", () => {
    it("returns where the object is served from, so an upload can be used", async () => {
        // Completing used to hand back id, status and size and nothing else:
        // the merchant held a storage key with no way to turn it into an
        // <img src>. The whole point of uploading is to put the picture on
        // something.
        findUnique.mockResolvedValue({
            id: "m1",
            organizationId: "org_1",
            key: "org/org_1/site-image/a.png",
            sizeBytes: 10,
        });
        update.mockResolvedValue({
            id: "m1",
            status: "READY",
            sizeBytes: 10,
            key: "org/org_1/site-image/a.png",
        });
        const storage = fakeStorage({
            getPublicUrl: jest.fn((k: string) => `https://cdn.test/${k}`),
        });
        const svc = new MediaService(storage);
        const out = await svc.completeUpload(ctx(), "m1");
        expect(out.url).toBe("https://cdn.test/org/org_1/site-image/a.png");
    });

    it("returns null rather than failing when storage cannot serve it", async () => {
        // getPublicUrl throws with no public base configured. At this boundary
        // that must not turn a SUCCESSFUL upload into a 500 — null is an honest
        // answer the client can act on.
        findUnique.mockResolvedValue({
            id: "m1",
            organizationId: "org_1",
            key: "k",
            sizeBytes: 10,
        });
        update.mockResolvedValue({
            id: "m1",
            status: "READY",
            sizeBytes: 10,
            key: "k",
        });
        const storage = fakeStorage({
            getPublicUrl: jest.fn(() => {
                throw new Error("publicBaseUrl is not configured");
            }),
        });
        const svc = new MediaService(storage);
        const out = await svc.completeUpload(ctx(), "m1");
        expect(out.status).toBe("READY");
        expect(out.url).toBeNull();
    });
});

describe("MediaService.remove — a published image stays", () => {
    it("refuses to delete an object a publication still references", async () => {
        // A Publication is immutable and is the site as it was served.
        // Deleting what it points at does not edit the snapshot; it leaves a
        // broken image on a live site that nothing can repair short of
        // republishing.
        findUnique.mockResolvedValue({
            id: "m1",
            organizationId: "org_1",
            key: "org/org_1/site-image/hero.png",
        });
        queryRaw.mockResolvedValueOnce([{ count: 2 }]);
        const storage = fakeStorage();
        const svc = new MediaService(storage);

        await expect(svc.remove(ctx(), "m1")).rejects.toThrow(
            ConflictException,
        );
        expect(storage.deleteObject).not.toHaveBeenCalled();
        expect(del).not.toHaveBeenCalled();
    });
});

describe("MediaService.remove", () => {
    beforeEach(() => jest.clearAllMocks());

    it("deletes the object then the row for an owned media", async () => {
        const deleteObject = jest.fn().mockResolvedValue(undefined);
        const service = new MediaService(fakeStorage({ deleteObject }));
        findUnique.mockResolvedValue({
            id: "media_1",
            organizationId: "org_1",
            key: SIGNED.key,
        });
        del.mockResolvedValue({ id: "media_1" });

        const res = await service.remove(ctx(), "media_1");

        expect(deleteObject).toHaveBeenCalledWith(SIGNED.key);
        expect(del).toHaveBeenCalledWith({ where: { id: "media_1" } });
        expect(res).toEqual({ id: "media_1", deleted: true });
    });

    it("refuses to delete an image a product still shows", async () => {
        const deleteObject = jest.fn();
        const service = new MediaService(fakeStorage({ deleteObject }));
        findUnique.mockResolvedValue({
            id: "media_1",
            organizationId: "org_1",
            key: SIGNED.key,
        });
        productImageCount.mockResolvedValueOnce(2);

        await expect(service.remove(ctx(), "media_1")).rejects.toThrow(
            /on 2 products/,
        );
        expect(deleteObject).not.toHaveBeenCalled();
        expect(del).not.toHaveBeenCalled();
    });

    it("refuses to delete the business logo", async () => {
        const deleteObject = jest.fn();
        const service = new MediaService(fakeStorage({ deleteObject }));
        findUnique.mockResolvedValue({
            id: "media_1",
            organizationId: "org_1",
            key: SIGNED.key,
        });
        logoCount.mockResolvedValueOnce(1);

        await expect(service.remove(ctx(), "media_1")).rejects.toThrow(
            /business logo/,
        );
        expect(logoCount).toHaveBeenCalledWith({
            where: { logoMediaId: "media_1" },
        });
        expect(deleteObject).not.toHaveBeenCalled();
        expect(del).not.toHaveBeenCalled();
    });

    it("refuses to delete a site's icon, published or not", async () => {
        const deleteObject = jest.fn();
        const service = new MediaService(fakeStorage({ deleteObject }));
        findUnique.mockResolvedValue({
            id: "media_1",
            organizationId: "org_1",
            key: SIGNED.key,
        });
        siteIconCount.mockResolvedValueOnce(1);

        await expect(service.remove(ctx(), "media_1")).rejects.toThrow(
            /your site icon/,
        );
        expect(siteIconCount).toHaveBeenCalledWith({
            where: { iconMediaId: "media_1" },
        });
        expect(deleteObject).not.toHaveBeenCalled();
        expect(del).not.toHaveBeenCalled();
    });

    it("rejects a cross-tenant remove with 404 and touches neither storage nor the row", async () => {
        const deleteObject = jest.fn();
        const service = new MediaService(fakeStorage({ deleteObject }));
        findUnique.mockResolvedValue({
            id: "media_1",
            organizationId: "org_OTHER",
            key: SIGNED.key,
        });

        await expect(service.remove(ctx(), "media_1")).rejects.toBeInstanceOf(
            NotFoundException,
        );
        expect(deleteObject).not.toHaveBeenCalled();
        expect(del).not.toHaveBeenCalled();
    });
});

describe("MediaService.list", () => {
    beforeEach(() => jest.clearAllMocks());

    it("scopes the query to the ctx org, newest first", async () => {
        const service = new MediaService(fakeStorage());
        findMany.mockResolvedValue([]);

        await service.list(ctx());

        expect(findMany).toHaveBeenCalledWith({
            where: { organizationId: "org_1" },
            orderBy: { createdAt: "desc" },
        });
    });
});

describe("MediaService.readReadyObjectStart — the logo's bytes", () => {
    beforeEach(() => jest.clearAllMocks());

    const row = {
        organizationId: "org_1",
        key: "org/org_1/business-logo/uuid-logo.png",
        status: "READY",
        contentType: "image/png",
    };

    it("reads a READY object of this business from storage, not its URL", async () => {
        const bytes = new Uint8Array([0x89, 0x50]);
        const readObjectStart = jest.fn().mockResolvedValue(bytes);
        const service = new MediaService(fakeStorage({ readObjectStart }));
        findUnique.mockResolvedValue(row);

        await expect(
            service.readReadyObjectStart("org_1", "m_1", 100),
        ).resolves.toEqual({ bytes, contentType: "image/png" });
        expect(readObjectStart).toHaveBeenCalledWith(row.key, 100);
    });

    it.each([
        ["another business's", { ...row, organizationId: "org_2" }],
        ["one still uploading", { ...row, status: "PENDING" }],
        ["a missing", null],
    ])("%s object is null, and storage is not read", async (_, found) => {
        const readObjectStart = jest.fn();
        const service = new MediaService(fakeStorage({ readObjectStart }));
        findUnique.mockResolvedValue(found);

        await expect(
            service.readReadyObjectStart("org_1", "m_1", 100),
        ).resolves.toBeNull();
        expect(readObjectStart).not.toHaveBeenCalled();
    });

    it("bytes gone from storage are null", async () => {
        const service = new MediaService(fakeStorage());
        findUnique.mockResolvedValue(row);
        await expect(
            service.readReadyObjectStart("org_1", "m_1", 100),
        ).resolves.toBeNull();
    });
});
