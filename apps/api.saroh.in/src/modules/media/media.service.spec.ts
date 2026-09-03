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
            // The delete guard counts publications referencing a key. Default
            // to "none", so existing remove tests keep their meaning.
            $queryRaw: jest.fn().mockResolvedValue([{ count: 0 }]),
        },
    };
});

import {
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
import { MediaService } from "./media.service";

const create = prisma.media.create as jest.Mock;
const findUnique = prisma.media.findUnique as jest.Mock;
const findMany = prisma.media.findMany as jest.Mock;
const update = prisma.media.update as jest.Mock;
const del = prisma.media.delete as jest.Mock;
const queryRaw = prisma.$queryRaw as unknown as jest.Mock;

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
