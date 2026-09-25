/**
 * The business logo against a real Postgres: an image uploaded to the
 * library is set as the logo and read back with the settings; the library
 * will not delete it while it is the logo; another business's image, one
 * still uploading, or one too big is refused; removing it keeps the image.
 *
 * Storage is the network-free in-memory adapter. Runs in the integration
 * project (TEST_DATABASE_URL).
 */
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { createMemoryStorage } from "@saroh/object-storage";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { AuditService } from "../audit/audit.service";
import { OrganizationSettingsService } from "../organizations/organization-settings.service";
import { MediaService } from "./media.service";

const storage = createMemoryStorage({
    publicBaseUrl: "https://media.saroh.test",
});
const media = new MediaService(storage);
const audit = {
    record: jest.fn().mockResolvedValue(undefined),
} as unknown as AuditService;
const settings = new OrganizationSettingsService(audit, media);

let owner: OrganizationContext;
let other: OrganizationContext;

beforeAll(async () => {
    const a = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: `logo-a-${process.pid}` },
    });
    const b = await prisma.organization.create({
        data: { name: "Elsewhere", slug: `logo-b-${process.pid}` },
    });
    owner = { organizationId: a.id, userId: "user_a", role: "OWNER" };
    other = { organizationId: b.id, userId: "user_b", role: "OWNER" };
});

async function upload(
    ctx: OrganizationContext,
    contentType = "image/png",
    contentLength = 40_000,
    complete = true,
) {
    const ticket = await media.createUpload(ctx, {
        contentType,
        contentLength,
        filename: "logo.png",
        purpose: "business-logo",
    });
    if (complete) await media.completeUpload(ctx, ticket.mediaId);
    return ticket.mediaId;
}

describe("the business logo (real database)", () => {
    it("is set from the library, read back, and held against deletion", async () => {
        const mediaId = await upload(owner);

        const set = await settings.setLogo(owner, mediaId);
        expect(set.logo).toEqual({
            mediaId,
            url: expect.stringMatching(
                /^https:\/\/media\.saroh\.test\/.+business-logo/,
            ),
        });
        // An org with no profile yet gets one.
        expect((await settings.get(owner)).logo?.mediaId).toBe(mediaId);

        await expect(media.remove(owner, mediaId)).rejects.toThrow(
            /business logo/,
        );

        const removed = await settings.removeLogo(owner);
        expect(removed.logo).toBeNull();
        // The image stays in the library, and can now be deleted.
        expect(await prisma.media.count({ where: { id: mediaId } })).toBe(1);
        await expect(media.remove(owner, mediaId)).resolves.toEqual({
            id: mediaId,
            deleted: true,
        });
    });

    it("replacing it leaves the old image in the library", async () => {
        const first = await upload(owner);
        const second = await upload(owner);
        await settings.setLogo(owner, first);
        const replaced = await settings.setLogo(owner, second);
        expect(replaced.logo?.mediaId).toBe(second);
        expect(await prisma.media.count({ where: { id: first } })).toBe(1);
    });

    it("refuses another business's image, and one still uploading", async () => {
        const theirs = await upload(other);
        await expect(settings.setLogo(owner, theirs)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        const pending = await upload(owner, "image/png", 40_000, false);
        await expect(settings.setLogo(owner, pending)).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it("refuses an image of 1 MB or more, and one that is not a logo's type", async () => {
        const big = await upload(owner, "image/png", 1024 * 1024 + 1);
        await expect(settings.setLogo(owner, big)).rejects.toBeInstanceOf(
            BadRequestException,
        );
        const gif = await upload(owner, "image/gif");
        await expect(settings.setLogo(owner, gif)).rejects.toThrow(
            /PNG, JPG or WebP/,
        );
    });
});
