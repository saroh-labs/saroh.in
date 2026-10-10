/**
 * A site's icon against a real Postgres (DEC-121): an image from the
 * library is set, replaced and removed as the site's own; another
 * business's image or site, a wrong type and an image too big are refused;
 * the library will not delete it while it is the icon; it is draft until a
 * publish writes it into the snapshot; and the public read resolves the
 * site's own, else the business logo, else none.
 *
 * Storage is the network-free in-memory adapter. Every business here is its
 * own, made by this file. Runs in the integration project
 * (TEST_DATABASE_URL), plain and under `TEST_RLS=on`.
 */
import {
    BadRequestException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";
import { createMemoryStorage } from "@saroh/object-storage";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { AuditService } from "../audit/audit.service";
import type { EntitlementService } from "../billing/entitlement.service";
import { MediaService } from "../media/media.service";
import { OrganizationSettingsService } from "../organizations/organization-settings.service";
import { SiteIconService } from "./site-icon.service";
import { SitesService } from "./sites.service";

const storage = createMemoryStorage({
    publicBaseUrl: "https://media.saroh.test",
});
const media = new MediaService(storage);
const icons = new SiteIconService(media);
const sites = new SitesService({
    check: jest.fn().mockResolvedValue(true),
    can: jest.fn().mockResolvedValue(true),
    getEntitlements: jest.fn(),
} as unknown as EntitlementService);
const settings = new OrganizationSettingsService(
    {
        record: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditService,
    media,
);

const tag = `${process.pid}x${Date.now().toString(36)}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;

/** A business with a site at its own address, and its owner. */
async function business(name = "Rye") {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("icon") },
        select: { id: true, slug: true },
    });
    const user = await prisma.user.create({
        data: { email: `${uniq("icon-user")}@example.com` },
        select: { id: true },
    });
    const ctx: OrganizationContext = {
        organizationId: org.id,
        userId: user.id,
        role: "OWNER",
    };
    const { siteId } = await sites.createFromTemplate(ctx, { name });
    return { ctx, siteId, address: org.slug };
}

async function upload(
    ctx: OrganizationContext,
    contentType = "image/png",
    contentLength = 40_000,
    { complete = true, purpose = "site-image" } = {},
) {
    const ticket = await media.createUpload(ctx, {
        contentType,
        contentLength,
        filename: "icon.png",
        purpose,
    });
    if (complete) await media.completeUpload(ctx, ticket.mediaId);
    return ticket.mediaId;
}

/** What a refused call threw, as the API answers it. */
async function refusal(call: Promise<unknown>, type: new () => Error) {
    const error = await call.then(
        () => null,
        (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(type);
    return (error as { getResponse(): unknown }).getResponse();
}

const stored = (siteId: string) =>
    prisma.site.findUniqueOrThrow({
        where: { id: siteId },
        select: { iconMediaId: true, iconUrl: true },
    });

const liveIcon = async (siteId: string) =>
    (await sites.getPublicationBySiteId(siteId)).icon;

describe("a site's own icon (real database)", () => {
    it("is set from the library, read back with the site, replaced and removed", async () => {
        const { ctx, siteId } = await business();
        expect((await sites.getSite(ctx, siteId)).icon).toEqual({
            own: null,
            businessLogoUrl: null,
        });

        const first = await upload(ctx);
        const set = await icons.set(ctx, siteId, first);
        expect(set.icon.own).toEqual({
            mediaId: first,
            url: expect.stringMatching(/^https:\/\/media\.saroh\.test\/.+/),
        });
        expect((await sites.getSite(ctx, siteId)).icon).toEqual(set.icon);
        expect(await stored(siteId)).toEqual({
            iconMediaId: first,
            iconUrl: set.icon.own?.url,
        });

        // Replacing leaves the old image in the library.
        const second = await upload(ctx, "image/webp");
        const replaced = await icons.set(ctx, siteId, second);
        expect(replaced.icon.own?.mediaId).toBe(second);
        expect(await prisma.media.count({ where: { id: first } })).toBe(1);

        const removed = await icons.remove(ctx, siteId);
        expect(removed.icon.own).toBeNull();
        expect(await stored(siteId)).toEqual({
            iconMediaId: null,
            iconUrl: null,
        });
        expect(await prisma.media.count({ where: { id: second } })).toBe(1);
    });

    it("the library will not delete it while it is the icon", async () => {
        const { ctx, siteId } = await business();
        const mediaId = await upload(ctx);
        await icons.set(ctx, siteId, mediaId);
        await expect(media.remove(ctx, mediaId)).rejects.toThrow(/site icon/);

        await icons.remove(ctx, siteId);
        await expect(media.remove(ctx, mediaId)).resolves.toEqual({
            id: mediaId,
            deleted: true,
        });
    });

    it("refuses another business's image, one still uploading, and another business's site", async () => {
        const mine = await business();
        const theirs = await business("Kiln");

        const theirImage = await upload(theirs.ctx);
        await expect(
            icons.set(mine.ctx, mine.siteId, theirImage),
        ).rejects.toBeInstanceOf(NotFoundException);

        const pending = await upload(mine.ctx, "image/png", 40_000, {
            complete: false,
        });
        await expect(
            icons.set(mine.ctx, mine.siteId, pending),
        ).rejects.toBeInstanceOf(NotFoundException);

        // My image on their site: the site is not found, and theirs is
        // untouched. Removing theirs is refused the same way.
        const myImage = await upload(mine.ctx);
        await expect(
            icons.set(mine.ctx, theirs.siteId, myImage),
        ).rejects.toBeInstanceOf(NotFoundException);
        await icons.set(theirs.ctx, theirs.siteId, theirImage);
        await expect(
            icons.remove(mine.ctx, theirs.siteId),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect((await stored(theirs.siteId)).iconMediaId).toBe(theirImage);
        expect(await stored(mine.siteId)).toEqual({
            iconMediaId: null,
            iconUrl: null,
        });
    });

    it("refuses a wrong type and an image over 1 MB, naming the field, and writes nothing", async () => {
        const { ctx, siteId } = await business();

        // A GIF is a photo the library takes, and not an icon.
        const gif = await upload(ctx, "image/gif");
        expect(
            await refusal(icons.set(ctx, siteId, gif), BadRequestException),
        ).toEqual({
            message: "A site icon is a PNG, JPG or WebP image.",
            details: { field: "icon" },
        });

        const big = await upload(ctx, "image/png", 1024 * 1024 + 1);
        expect(
            await refusal(icons.set(ctx, siteId, big), BadRequestException),
        ).toEqual({
            message: "A site icon is under 1 MB. Choose a smaller image.",
            details: { field: "icon" },
        });

        expect(await stored(siteId)).toEqual({
            iconMediaId: null,
            iconUrl: null,
        });
    });

    it("needs site:update", async () => {
        const { ctx, siteId } = await business();
        const mediaId = await upload(ctx);
        const member: OrganizationContext = { ...ctx, role: "MEMBER" };
        await expect(icons.set(member, siteId, mediaId)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        await expect(icons.remove(member, siteId)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
    });
});

describe("the icon and publishing (real database)", () => {
    it("is draft until published: the snapshot holds it, and what waits says so", async () => {
        const { ctx, siteId } = await business();
        await sites.publishSite(ctx, siteId);
        // Nothing of its own, no logo: the renderer draws the plain tile.
        expect(await liveIcon(siteId)).toBeNull();
        expect((await sites.getSite(ctx, siteId)).pendingSiteChanges).toEqual(
            [],
        );

        const mediaId = await upload(ctx);
        const { icon } = await icons.set(ctx, siteId, mediaId);

        // Saved, not live: the public read still answers what was published.
        expect(await liveIcon(siteId)).toBeNull();
        expect((await sites.getSite(ctx, siteId)).pendingSiteChanges).toEqual([
            "icon",
        ]);

        const { publicationId } = await sites.publishSite(ctx, siteId);
        const published = await prisma.publication.findUniqueOrThrow({
            where: { id: publicationId },
            select: { snapshot: true },
        });
        expect(
            (published.snapshot as { site: { icon?: unknown } }).site.icon,
        ).toEqual({ url: icon.own?.url, type: "image/png" });
        expect(await liveIcon(siteId)).toEqual({
            url: icon.own?.url,
            type: "image/png",
            source: "site",
        });
        expect((await sites.getSite(ctx, siteId)).pendingSiteChanges).toEqual(
            [],
        );

        // Removed: still live until the next publish, then gone, and the
        // snapshot of a site without one carries no `icon` key at all.
        await icons.remove(ctx, siteId);
        expect((await liveIcon(siteId))?.source).toBe("site");
        expect((await sites.getSite(ctx, siteId)).pendingSiteChanges).toEqual([
            "icon",
        ]);
        const again = await sites.publishSite(ctx, siteId);
        const after = await prisma.publication.findUniqueOrThrow({
            where: { id: again.publicationId },
            select: { snapshot: true },
        });
        expect(
            (after.snapshot as { site: Record<string, unknown> }).site,
        ).not.toHaveProperty("icon");
        expect(await liveIcon(siteId)).toBeNull();
    });

    it("the public read resolves its own, else the business logo, else none", async () => {
        const { ctx, siteId, address } = await business();
        await sites.publishSite(ctx, siteId);
        expect(await liveIcon(siteId)).toBeNull();

        // The business logo stands in at once: it is the business's, not
        // part of the publication.
        const logoId = await upload(ctx, "image/webp", 40_000, {
            purpose: "business-logo",
        });
        const { logo } = await settings.setLogo(ctx, logoId);
        expect(await liveIcon(siteId)).toEqual({
            url: logo?.url,
            type: "image/webp",
            source: "business",
        });
        // By its address too, as the renderer asks.
        expect((await sites.getPublicationBySubdomain(address)).icon).toEqual({
            url: logo?.url,
            type: "image/webp",
            source: "business",
        });
        // Settings name it as what stands in.
        expect((await sites.getSite(ctx, siteId)).icon).toEqual({
            own: null,
            businessLogoUrl: logo?.url,
        });

        // The site's own wins once published.
        const iconId = await upload(ctx, "image/jpeg");
        const { icon } = await icons.set(ctx, siteId, iconId);
        expect((await liveIcon(siteId))?.source).toBe("business");
        await sites.publishSite(ctx, siteId);
        expect(await liveIcon(siteId)).toEqual({
            url: icon.own?.url,
            type: "image/jpeg",
            source: "site",
        });

        // Logo removed, own kept: unchanged. Own removed and published
        // with no logo: none.
        await settings.removeLogo(ctx);
        expect((await liveIcon(siteId))?.source).toBe("site");
        await icons.remove(ctx, siteId);
        await sites.publishSite(ctx, siteId);
        expect(await liveIcon(siteId)).toBeNull();
    });

    it("another business's logo is never a site's icon", async () => {
        const mine = await business();
        const theirs = await business("Kiln");
        await sites.publishSite(mine.ctx, mine.siteId);
        const logoId = await upload(theirs.ctx, "image/png", 40_000, {
            purpose: "business-logo",
        });
        await settings.setLogo(theirs.ctx, logoId);
        expect(await liveIcon(mine.siteId)).toBeNull();
    });
});
