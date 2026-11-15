/**
 * A business's own posts against a real Postgres (#1378, plan
 * 2026-11-12-003 U6): made, listed, changed and deleted within the
 * business; another business reaches none of them; only who holds the
 * Social permissions may (`social:read`, `social:post`); the caps and the link's rule hold; and the public picture
 * is drawn only on its own business's live site.
 *
 * The renderer is stood in for (its specs are `cards/`): here it would
 * only slow the run. Runs in the integration project (TEST_DATABASE_URL).
 */
jest.mock("./cards/card-renderer", () => ({
    renderCard: jest.fn(() => Promise.resolve(Buffer.from("png"))),
}));

import {
    BadRequestException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";
import { createMemoryStorage } from "@saroh/object-storage";

import { isRlsTestMode } from "../../../test/rls-mode";
import type { OrganizationContext } from "../../common/types/organization-context";
import { MediaService } from "../media/media.service";
import { resolveCapabilities } from "../organizations/organization-policy";
import { renderCard } from "./cards/card-renderer";
import { PublicShareService } from "./public-share.service";
import { SharePostsService } from "./share-posts.service";

const storage = createMemoryStorage({
    publicBaseUrl: "https://media.saroh.test",
});
const media = new MediaService(storage);
const posts = new SharePostsService(media);

let seq = 0;
const uniq = (label: string) => `${label}-${process.pid}-${++seq}`;

interface Business {
    organizationId: string;
    siteId: string;
    owner: OrganizationContext;
    member: OrganizationContext;
}

/** A business with an owner, a member and a site, published only when asked. */
async function business(live = true): Promise<Business> {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: uniq("sp-org") },
    });
    const people = await Promise.all(
        (["OWNER", "MEMBER"] as const).map(async (role) => {
            const user = await prisma.user.create({
                data: { email: `${uniq("sp-user")}@example.test` },
            });
            await prisma.membership.create({
                data: { organizationId: org.id, userId: user.id, role },
            });
            return { organizationId: org.id, userId: user.id, role };
        }),
    );
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Rye & Co.",
            slug: uniq("sp-site"),
            subdomain: uniq("sp-rye").toLowerCase(),
        },
    });
    if (live) {
        const publication = await prisma.publication.create({
            data: {
                siteId: site.id,
                organizationId: org.id,
                templateId: "starter",
                templateVersion: 1,
                snapshot: {
                    site: { name: "Rye & Co.", slug: "rye" },
                    pages: [],
                },
            },
        });
        await prisma.site.update({
            where: { id: site.id },
            data: { currentPublicationId: publication.id },
        });
    }
    return {
        organizationId: org.id,
        siteId: site.id,
        owner: people[0] as OrganizationContext,
        member: people[1] as OrganizationContext,
    };
}

/** A finished upload in the business's library. */
async function photo(b: Business): Promise<string> {
    const row = await prisma.media.create({
        data: {
            organizationId: b.organizationId,
            key: `org/${b.organizationId}/site-image/${uniq("p")}.webp`,
            contentType: "image/webp",
            sizeBytes: 3,
            filename: "p.webp",
            purpose: "site-image",
            status: "READY",
        },
    });
    return row.id;
}

/**
 * The public side with the site read standing in for SitesService: the
 * site's live snapshot, as `getPublicationBySiteId` gives it.
 */
function publicShare(): PublicShareService {
    const sites = {
        getPublicationBySiteId: async (siteId: string) => {
            const site = await prisma.site.findFirst({
                where: { id: siteId, currentPublication: { kind: "LIVE" } },
                select: {
                    organizationId: true,
                    currentPublication: { select: { snapshot: true } },
                },
            });
            if (!site?.currentPublication) throw new NotFoundException();
            return {
                organizationId: site.organizationId,
                snapshot: site.currentPublication.snapshot,
                primaryHost: "rye.saroh.app",
                icon: null,
            };
        },
    };
    return new PublicShareService(
        sites as never,
        {} as never,
        {} as never,
        {} as never,
        media,
        storage,
    );
}

afterAll(async () => {
    await prisma.$disconnect();
});

describe("own posts (DB)", () => {
    it("makes, lists, changes and deletes a post within the business", async () => {
        const b = await business();
        const mediaId = await photo(b);
        const made = await posts.create(b.owner, {
            headline: "दिवाली पर बंद",
            caption: "Closed 1 and 2 Nov.",
            linkPath: "/book",
            style: "simple",
            size: "story",
        });
        expect(made).toMatchObject({
            headline: "दिवाली पर बंद",
            mediaId: null,
            style: "simple",
            size: "story",
            caption: "Closed 1 and 2 Nov.",
            linkPath: "/book",
            imagePath: `/public/share/own/${made.id}/image`,
        });
        const row = await prisma.sharePost.findUniqueOrThrow({
            where: { id: made.id },
        });
        expect(row.createdByUserId).toBe(b.owner.userId);

        expect((await posts.list(b.owner)).map((p) => p.id)).toEqual([made.id]);

        const changed = await posts.update(b.owner, made.id, {
            mediaId,
            headline: null,
        });
        expect(changed).toMatchObject({
            mediaId,
            headline: null,
            style: "simple",
            linkPath: "/book",
        });
        expect(await posts.get(b.owner, made.id)).toEqual(changed);

        await posts.remove(b.owner, made.id);
        expect(await posts.list(b.owner)).toEqual([]);
        await expect(posts.get(b.owner, made.id)).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it("keeps a headline or a photo, and only the business's own finished photo", async () => {
        const a = await business();
        const other = await business();
        await expect(
            posts.create(a.owner, { caption: "words only" }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            posts.create(a.owner, { mediaId: await photo(other) }),
        ).rejects.toBeInstanceOf(NotFoundException);
        const made = await posts.create(a.owner, { headline: "Open late" });
        await expect(
            posts.update(a.owner, made.id, { headline: null }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("lets another business read, change or delete none of it", async () => {
        const a = await business();
        const b = await business();
        const made = await posts.create(a.owner, { headline: "Open late" });
        await expect(posts.get(b.owner, made.id)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        await expect(
            posts.update(b.owner, made.id, { headline: "Mine now" }),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(posts.remove(b.owner, made.id)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        expect(await posts.list(b.owner)).toEqual([]);
        expect((await posts.get(a.owner, made.id)).headline).toBe("Open late");
    });

    it("refuses a member without the Social permissions, and lets one given social:post", async () => {
        const b = await business();
        const made = await posts.create(b.owner, { headline: "Open late" });
        for (const work of [
            () => posts.list(b.member),
            () => posts.get(b.member, made.id),
            () => posts.create(b.member, { headline: "x" }),
            () => posts.update(b.member, made.id, { headline: "x" }),
            () => posts.remove(b.member, made.id),
        ]) {
            await expect(work()).rejects.toBeInstanceOf(ForbiddenException);
        }
        // F17: the same Member given "Make and share posts" as their own
        // extra permission, resolved as the context service resolves it.
        await prisma.membership.update({
            where: {
                organizationId_userId: {
                    organizationId: b.organizationId,
                    userId: b.member.userId,
                },
            },
            data: { extraActions: ["social:post"] },
        });
        const given = {
            ...b.member,
            actions: resolveCapabilities("MEMBER", null, ["social:post"]),
        } as OrganizationContext;
        const theirs = await posts.create(given, { headline: "Fresh today" });
        expect((await posts.list(given)).map((p) => p.id)).toContain(theirs.id);
        await posts.update(given, made.id, { headline: "Open later" });
        await posts.remove(given, theirs.id);
    });
});

describe("an own post's public picture (DB)", () => {
    const drawn = renderCard as jest.Mock;

    it("draws a post on its business's live site", async () => {
        const b = await business();
        const made = await posts.create(b.owner, {
            headline: "Open late",
            size: "square",
        });
        drawn.mockClear();
        expect(await publicShare().own(made.id, {}, "v")).toEqual(
            Buffer.from("png"),
        );
        expect(drawn.mock.calls[0]?.[0]).toMatchObject({
            name: "Open late",
            size: "square",
            business: "Rye & Co.",
            address: "rye.saroh.app",
        });
    });

    it("is a 404 while the business's site isn't live, and for an id no post has", async () => {
        const b = await business(false);
        const made = await posts.create(b.owner, { headline: "Open late" });
        await expect(
            publicShare().own(made.id, {}, "v"),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            publicShare().own("sp_none", {}, "v"),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("draws a post only on its own business's site, never another's", async () => {
        const a = await business(false);
        await business();
        const made = await posts.create(a.owner, { headline: "Open late" });
        // Another business has a live site; this post's business has none.
        await expect(
            publicShare().own(made.id, {}, "v"),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

const describeRls = isRlsTestMode() ? describe : describe.skip;

// RLS mode builds the schema from the migrations, so only there do the
// policy and the migration's CHECKs exist (a normal run uses `db push`).
describeRls("row-level security and CHECKs on SharePost", () => {
    it("another business reads none of its posts", async () => {
        const a = await business();
        const b = await business();
        for (const owner of [a, b]) {
            await prisma.sharePost.create({
                data: { organizationId: owner.organizationId, headline: "x" },
            });
        }
        const count = () =>
            prisma.sharePost.count({
                where: {
                    organizationId: {
                        in: [a.organizationId, b.organizationId],
                    },
                },
            });
        expect(await runInOrgContext(a.organizationId, count)).toBe(1);
        expect(await runInOrgContext(b.organizationId, count)).toBe(1);
        expect(await runInOrgContext("org_does_not_exist", count)).toBe(0);
        expect(await count()).toBe(2);
    });

    it("refuses a row outside the caps and lists the API writes", async () => {
        const b = await business();
        for (const bad of [
            { headline: "x".repeat(91) },
            { caption: "x".repeat(2201) },
            { linkPath: "https://evil.test/" },
            { linkPath: "//evil.test" },
            { style: "poster" },
            { size: "banner" },
        ]) {
            await expect(
                prisma.sharePost.create({
                    data: {
                        organizationId: b.organizationId,
                        headline: "ok",
                        ...bad,
                    },
                }),
            ).rejects.toThrow();
        }
    });
});
