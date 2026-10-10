// DB-free: setting and removing a site's own icon (DEC-121). The database
// package is mocked so nothing touches Postgres, and the environment so the
// library's storage provider (imported with `MediaService`) needs no `.env`.
jest.mock("../../env", () => ({
    env: { NODE_ENV: "test" },
    declaredNodeEnv: "test",
}));
jest.mock("@saroh/database", () => ({
    prisma: {
        site: { findFirst: jest.fn(), updateMany: jest.fn() },
        businessProfile: { findUnique: jest.fn() },
        job: { create: jest.fn() },
    },
    runInOrgContext: jest.fn((_org: string, fn: () => unknown) => fn()),
}));

import "reflect-metadata";

import {
    BadRequestException,
    ForbiddenException,
    NotFoundException,
    ValidationPipe,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type {
    OrganizationContext,
    OrgRole,
} from "../../common/types/organization-context";
import { validationPipeOptions } from "../../common/validation";
import type { MediaService } from "../media/media.service";
import { SetSiteIconDto } from "./dto";
import { SiteIconService } from "./site-icon.service";

const siteFindFirst = prisma.site.findFirst as jest.Mock;
const siteUpdateMany = prisma.site.updateMany as jest.Mock;
const profileFindUnique = prisma.businessProfile.findUnique as jest.Mock;
const jobCreate = prisma.job.create as jest.Mock;

const SITE = "site_1";
const ctx = (role: OrgRole = "OWNER"): OrganizationContext => ({
    organizationId: "org_1",
    userId: "u_1",
    role,
});

const png = {
    id: "media_1",
    url: "https://media.saroh.test/org/org_1/site-image/icon.png",
    contentType: "image/png",
    sizeBytes: 40_000,
};

const readyObject = jest.fn();
const service = new SiteIconService({
    readyObject,
} as unknown as MediaService);

beforeEach(() => {
    jest.clearAllMocks();
    // assertSiteInOrg's lookup.
    siteFindFirst.mockResolvedValue({ id: SITE, currentPublicationId: null });
    siteUpdateMany.mockResolvedValue({ count: 1 });
    profileFindUnique.mockResolvedValue(null);
    readyObject.mockResolvedValue(png);
});

describe("SiteIconService.set", () => {
    it("sets a ready library image, scoped to the caller's business", async () => {
        const saved = await service.set(ctx("ADMIN"), SITE, "media_1");

        // The library answers for this business only.
        expect(readyObject).toHaveBeenCalledWith("org_1", "media_1");
        expect(siteUpdateMany).toHaveBeenCalledWith({
            where: { id: SITE, organizationId: "org_1", deletedAt: null },
            data: { iconMediaId: "media_1", iconUrl: png.url },
        });
        expect(saved).toEqual({
            id: SITE,
            icon: {
                own: { url: png.url, mediaId: "media_1" },
                businessLogoUrl: null,
            },
        });
    });

    it("replaces the one it had", async () => {
        await service.set(ctx(), SITE, "media_1");
        const second = { ...png, id: "media_2", url: `${png.url}?2` };
        readyObject.mockResolvedValue(second);
        const saved = await service.set(ctx(), SITE, "media_2");
        expect(siteUpdateMany).toHaveBeenLastCalledWith(
            expect.objectContaining({
                data: { iconMediaId: "media_2", iconUrl: second.url },
            }),
        );
        expect(saved.icon.own).toEqual({ url: second.url, mediaId: "media_2" });
    });

    it("does not publish, and tells the page cache nothing: the live site is unchanged", async () => {
        await service.set(ctx(), SITE, "media_1");
        await service.remove(ctx(), SITE);
        expect(jobCreate).not.toHaveBeenCalled();
    });

    it("refuses another business's image, as not found", async () => {
        readyObject.mockRejectedValue(
            new NotFoundException("That photo is not in your library"),
        );
        await expect(
            service.set(ctx(), SITE, "media_theirs"),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(siteUpdateMany).not.toHaveBeenCalled();
    });

    it("refuses another business's site, before the library is asked", async () => {
        siteFindFirst.mockResolvedValue(null);
        await expect(
            service.set(ctx(), "site_theirs", "media_1"),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(siteFindFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    id: "site_theirs",
                    organizationId: "org_1",
                }),
            }),
        );
        expect(readyObject).not.toHaveBeenCalled();
    });

    it.each([
        [
            "an SVG",
            { contentType: "image/svg+xml" },
            "A site icon is a PNG, JPG or WebP image.",
        ],
        [
            "an image over 1 MB",
            { sizeBytes: 1024 * 1024 + 1 },
            "A site icon is under 1 MB. Choose a smaller image.",
        ],
        [
            "an image storage cannot serve",
            { url: null },
            "Uploaded, but storage is not set up to serve images yet, so the icon cannot show.",
        ],
    ])(
        "refuses %s with a 400 that names the field",
        async (_what, change, message) => {
            readyObject.mockResolvedValue({ ...png, ...change });
            const refused = await service
                .set(ctx(), SITE, "media_1")
                .catch((e: unknown) => e);
            expect(refused).toBeInstanceOf(BadRequestException);
            // What `AllExceptionsFilter` turns into the error envelope's
            // `message` and `details`.
            expect((refused as BadRequestException).getResponse()).toEqual({
                message,
                details: { field: "icon" },
            });
            expect(siteUpdateMany).not.toHaveBeenCalled();
        },
    );

    it("needs site:update: a Member can neither set nor remove it", async () => {
        await expect(
            service.set(ctx("MEMBER"), SITE, "media_1"),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            service.remove(ctx("MEMBER"), SITE),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(readyObject).not.toHaveBeenCalled();
        expect(siteUpdateMany).not.toHaveBeenCalled();
    });
});

describe("SiteIconService.remove", () => {
    it("clears both columns and names the logo that now stands in", async () => {
        profileFindUnique.mockResolvedValue({
            logoUrl: "https://media.saroh.test/logo.png",
        });
        const saved = await service.remove(ctx(), SITE);
        expect(siteUpdateMany).toHaveBeenCalledWith({
            where: { id: SITE, organizationId: "org_1", deletedAt: null },
            data: { iconMediaId: null, iconUrl: null },
        });
        expect(saved.icon).toEqual({
            own: null,
            businessLogoUrl: "https://media.saroh.test/logo.png",
        });
    });
});

describe("the icon PUT body", () => {
    const pipe = new ValidationPipe(validationPipeOptions);
    const body = { type: "body" as const, metatype: SetSiteIconDto };

    it("takes a media id, trimmed", async () => {
        await expect(
            pipe.transform({ mediaId: "  media_1 " }, body),
        ).resolves.toEqual({ mediaId: "media_1" });
    });

    it.each([
        ["nothing", {}],
        ["an empty id", { mediaId: "  " }],
        ["a number", { mediaId: 7 }],
        ["an address instead of a library image", { url: "https://x.test/a" }],
        ["a business the caller names", { mediaId: "m", organizationId: "o" }],
    ])("refuses %s", async (_what, value) => {
        await expect(pipe.transform(value, body)).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });
});
