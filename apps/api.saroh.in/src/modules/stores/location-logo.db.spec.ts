/**
 * A location's logo against a real Postgres (DEC-123): with none of its
 * own it reads the business logo; an image from the library becomes its
 * own, is replaced, and is held against deletion; clearing it falls back
 * to the business's; another business's image and one too big are refused;
 * an address typed in before uploads is kept until replaced or cleared.
 *
 * Storage is the network-free in-memory adapter. Runs in the integration
 * project (TEST_DATABASE_URL), which empties the tables after each file.
 */
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { createMemoryStorage } from "@saroh/object-storage";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { AuditService } from "../audit/audit.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { MediaService } from "../media/media.service";
import { OrganizationSettingsService } from "../organizations/organization-settings.service";

import { LocationLogoService } from "./location-logo.service";
import { StoresService } from "./stores.service";

const storage = createMemoryStorage({
    publicBaseUrl: "https://media.saroh.test",
});
const media = new MediaService(storage);
const audit = {
    record: jest.fn().mockResolvedValue(undefined),
} as unknown as AuditService;
const settings = new OrganizationSettingsService(audit, media);
// The flag is unseeded in the test database: the older owner path.
const stores = new StoresService(new FeatureFlagService());
const logos = new LocationLogoService(stores, media);

const TYPED = "https://example.com/old-logo.png";
const tag = `loclogo-${process.pid}`;

let owner: OrganizationContext;
let other: OrganizationContext;
let userId = "";
let storeId = "";
let legacyStoreId = "";

beforeAll(async () => {
    userId = (
        await prisma.user.create({ data: { email: `${tag}@example.com` } })
    ).id;
    const a = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: `${tag}-a` },
    });
    const b = await prisma.organization.create({
        data: { name: "Elsewhere", slug: `${tag}-b` },
    });
    owner = { organizationId: a.id, userId, role: "OWNER" };
    other = { organizationId: b.id, userId: "user_b", role: "OWNER" };
    storeId = (await stores.createForUser(userId, a.id, { name: "Hill Road" }))
        .id;
    // A location saved before a logo could be uploaded.
    legacyStoreId = (
        await prisma.store.create({
            data: {
                name: "Old counter",
                logo: TYPED,
                organizationId: a.id,
                owners: { create: { userId, role: "OWNER" } },
            },
        })
    ).id;
});

async function upload(
    ctx: OrganizationContext,
    contentType = "image/png",
    contentLength = 40_000,
) {
    const ticket = await media.createUpload(ctx, {
        contentType,
        contentLength,
        filename: "logo.png",
        purpose: "business-logo",
    });
    await media.completeUpload(ctx, ticket.mediaId);
    return ticket.mediaId;
}

const save = (id: string, logo: { logoMediaId?: string | null } = {}) =>
    logos.update(userId, id, { name: "Hill Road", ...logo });

describe("a location's logo (real database)", () => {
    it("has none while neither it nor the business has one", async () => {
        const read = await logos.read(userId, storeId);
        expect(read).toMatchObject({
            ownLogo: null,
            businessLogo: null,
            effectiveLogo: null,
        });
    });

    it("uses the business logo until it has its own", async () => {
        const businessMedia = await upload(owner);
        const business = (await settings.setLogo(owner, businessMedia)).logo;

        const read = await logos.read(userId, storeId);
        expect(read.ownLogo).toBeNull();
        expect(read.effectiveLogo).toEqual({
            url: business?.url,
            from: "business",
        });
    });

    it("takes its own from the library, replaces it, and holds it against deletion", async () => {
        const first = await upload(owner);
        await save(storeId, { logoMediaId: first });

        const read = await logos.read(userId, storeId);
        expect(read.ownLogo).toEqual({
            mediaId: first,
            url: expect.stringMatching(/^https:\/\/media\.saroh\.test\/.+/),
        });
        expect(read.effectiveLogo).toEqual({
            url: read.ownLogo?.url,
            from: "location",
        });
        // The business logo is still there to go back to.
        expect(read.businessLogo).not.toBeNull();
        await expect(media.remove(owner, first)).rejects.toThrow(
            /a location's logo/,
        );

        const second = await upload(owner);
        await save(storeId, { logoMediaId: second });
        expect((await logos.read(userId, storeId)).ownLogo?.mediaId).toBe(
            second,
        );
        // The replaced image stays in the library, and can now be deleted.
        await expect(media.remove(owner, first)).resolves.toEqual({
            id: first,
            deleted: true,
        });
    });

    it("a save that names no logo keeps it", async () => {
        const before = (await logos.read(userId, storeId)).ownLogo;
        await logos.update(userId, storeId, {
            name: "Hill Road",
            description: "Sourdough since 2019",
        });
        const after = await logos.read(userId, storeId);
        expect(after.ownLogo).toEqual(before);
        expect(after.description).toBe("Sourdough since 2019");
    });

    it("refuses another business's image, and one over 1 MB, and keeps what it had", async () => {
        const before = (await logos.read(userId, storeId)).ownLogo;

        const theirs = await upload(other);
        await expect(
            save(storeId, { logoMediaId: theirs }),
        ).rejects.toBeInstanceOf(NotFoundException);

        const big = await upload(owner, "image/png", 1024 * 1024 + 1);
        await expect(
            save(storeId, { logoMediaId: big }),
        ).rejects.toBeInstanceOf(BadRequestException);
        // A type that is not a logo's is refused when the upload starts.
        await expect(upload(owner, "image/gif")).rejects.toThrow(
            /PNG, JPG or WebP/,
        );

        expect((await logos.read(userId, storeId)).ownLogo).toEqual(before);
    });

    it("cleared, it falls back to the business logo and frees the image", async () => {
        const had = (await logos.read(userId, storeId)).ownLogo?.mediaId;
        await save(storeId, { logoMediaId: null });

        const read = await logos.read(userId, storeId);
        expect(read.ownLogo).toBeNull();
        expect(read.effectiveLogo?.from).toBe("business");
        const row = await prisma.store.findUniqueOrThrow({
            where: { id: storeId },
            select: { logo: true, logoMediaId: true },
        });
        expect(row).toEqual({ logo: null, logoMediaId: null });
        expect(await prisma.media.count({ where: { id: had } })).toBe(1);
    });

    it("keeps an address typed in before uploads as its own, until replaced", async () => {
        expect(await logos.read(userId, legacyStoreId)).toMatchObject({
            ownLogo: { url: TYPED, mediaId: null },
            effectiveLogo: { url: TYPED, from: "location" },
        });

        // A save of anything else, and an older app sending it back.
        await logos.update(userId, legacyStoreId, { name: "Old counter" });
        await logos.update(userId, legacyStoreId, {
            name: "Old counter",
            logo: TYPED,
        });
        expect((await logos.read(userId, legacyStoreId)).ownLogo?.url).toBe(
            TYPED,
        );

        const uploaded = await upload(owner);
        await save(legacyStoreId, { logoMediaId: uploaded });
        expect((await logos.read(userId, legacyStoreId)).ownLogo).toEqual({
            mediaId: uploaded,
            url: expect.stringMatching(/^https:\/\/media\.saroh\.test\/.+/),
        });
    });
});
