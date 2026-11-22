/**
 * Saroh Social's posts (U5) against a real Postgres: scheduling from a
 * product stores a JPEG and queues the run at its time, and counts once;
 * Move replaces the run; cancelling frees the count only before it
 * starts; the month's limit refuses with when it resets; Request more is
 * once a month; a Threads caption of its own over 500 bytes is refused
 * with the count; a held post can be cancelled or deleted with the plan
 * off (S-02); at the limit nothing is drawn (S-04); saving a scheduled
 * post again starts a channel failed by an old disconnect afresh (S-14). The card is a stand-in (the renderer has its own
 * specs); storage is in memory. Runs in the integration project.
 */
import { prisma } from "@saroh/database";
import type { MemoryStorage } from "@saroh/object-storage";
import { createMemoryStorage } from "@saroh/object-storage";

import {
    restoreSocialEnv,
    socialAccessFor,
    socialBusiness,
    socialEnv,
    uniq,
} from "../../../../test/fixtures/social";
import type { OrganizationContext } from "../../../common/types/organization-context";
import { countUsage } from "../../billing/metering";
import type { MediaService } from "../../media/media.service";
import { mediaStorages } from "../../media/object-storage.provider";
import type { PublicShareService } from "../../share-posts/public-share.service";
import { SOCIAL_PUBLISH_TYPE } from "../shared/jobs";
import { SocialPostsService } from "./posts.service";

/** A JPEG's first bytes are enough for a stand-in card. */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);

let storage: MemoryStorage;
const share = {
    socialCard: jest.fn(() => Promise.resolve(JPEG)),
} as unknown as PublicShareService;
const world: {
    flag: boolean;
    planId: "free" | "grow" | "pro";
    addon: boolean;
    limit?: number;
} = { flag: true, planId: "pro", addon: false };
const service = () =>
    new SocialPostsService(
        socialAccessFor(world),
        share,
        {} as MediaService,
        mediaStorages(storage, null),
    );

beforeAll(socialEnv);
afterAll(async () => {
    restoreSocialEnv();
    await prisma.$disconnect();
});
beforeEach(() => {
    storage = createMemoryStorage({ publicBaseUrl: "https://cdn.example.com" });
    Object.assign(world, {
        flag: true,
        planId: "pro",
        addon: false,
        limit: undefined,
    });
});

/** A business with a live site and Instagram and Threads connected. */
async function ready(): Promise<OrganizationContext> {
    const ctx = await socialBusiness();
    const site = await prisma.site.create({
        data: {
            organizationId: ctx.organizationId,
            name: "Chai & Crumb",
            slug: uniq("site"),
            subdomain: uniq("chai").toLowerCase(),
        },
    });
    const publication = await prisma.publication.create({
        data: {
            siteId: site.id,
            organizationId: ctx.organizationId,
            snapshot: { pages: [] },
            templateId: "blank",
            templateVersion: 1,
        },
    });
    await prisma.site.update({
        where: { id: site.id },
        data: { currentPublicationId: publication.id },
    });
    for (const kind of ["INSTAGRAM", "THREADS"] as const) {
        await prisma.socialChannel.create({
            data: {
                organizationId: ctx.organizationId,
                kind,
                accountId: uniq(kind),
                platformUserId: uniq("user"),
                handle: "@chaiandcrumb",
            },
        });
    }
    return ctx;
}

const inHours = (h: number) =>
    new Date(Date.now() + h * 3_600_000).toISOString();

const product = {
    sourceKind: "product" as const,
    sourceRef: "mango-cheesecake",
    title: "Mango cheesecake",
    caption: "Mango cheesecake is back.",
    linkPath: "/shop/mango-cheesecake",
    channels: ["INSTAGRAM", "THREADS"] as ("INSTAGRAM" | "THREADS")[],
};

describe("scheduling a post", () => {
    it("stores the picture as a JPEG, queues its run at its time and counts it once", async () => {
        const ctx = await ready();
        const at = inHours(5);
        const post = await service().create(ctx, {
            ...product,
            action: "schedule",
            publishAt: at,
        });
        expect(post.status).toBe("SCHEDULED");
        expect(post.ref).toMatch(/^social-[a-z]{10}$/);
        expect(post.picture.imageUrl).toMatch(
            /^https:\/\/cdn\.example\.com\/.+\.jpg$/,
        );
        expect(storage.listKeys()).toHaveLength(1);
        expect(storage.get(storage.listKeys()[0])?.contentType).toBe(
            "image/jpeg",
        );
        expect(post.channels.map((c) => [c.kind, c.status])).toEqual([
            ["INSTAGRAM", "WAITING"],
            ["THREADS", "WAITING"],
        ]);
        const job = await prisma.job.findFirstOrThrow({
            where: {
                type: SOCIAL_PUBLISH_TYPE,
                payload: { path: ["postId"], equals: post.id },
            },
        });
        expect(job.runAt.toISOString()).toBe(at);
        expect(
            await countUsage(
                prisma,
                ctx.organizationId,
                "socialPostsPerMonth",
                new Date(at),
            ),
        ).toBe(1);
    });

    it("keeps a draft without drawing or counting anything", async () => {
        const ctx = await ready();
        const post = await service().create(ctx, product);
        expect(post.status).toBe("DRAFT");
        expect(post.picture.imageUrl).toBeNull();
        expect(storage.listKeys()).toHaveLength(0);
    });

    it("moves a post: the old run is dropped and a new one queued", async () => {
        const ctx = await ready();
        const post = await service().create(ctx, {
            ...product,
            action: "schedule",
            publishAt: inHours(3),
        });
        const first = await prisma.socialPost.findUniqueOrThrow({
            where: { id: post.id },
        });
        const later = inHours(6);
        await service().update(ctx, post.id, { publishAt: later });
        const moved = await prisma.socialPost.findUniqueOrThrow({
            where: { id: post.id },
        });
        expect(moved.publishAt?.toISOString()).toBe(later);
        expect(moved.publishJobId).not.toBe(first.publishJobId);
        expect(
            await prisma.job.count({ where: { id: first.publishJobId ?? "" } }),
        ).toBe(0);
    });

    it("frees the count when cancelled before it starts, and not once it has", async () => {
        const ctx = await ready();
        const at = inHours(2);
        const post = await service().create(ctx, {
            ...product,
            action: "schedule",
            publishAt: at,
        });
        await service().cancel(ctx, post.id);
        expect(
            await countUsage(
                prisma,
                ctx.organizationId,
                "socialPostsPerMonth",
                new Date(at),
            ),
        ).toBe(0);
        const other = await service().create(ctx, {
            ...product,
            action: "schedule",
            publishAt: at,
        });
        await prisma.socialPost.update({
            where: { id: other.id },
            data: { status: "PUBLISHING" },
        });
        await expect(service().cancel(ctx, other.id)).rejects.toMatchObject({
            status: 409,
        });
    });

    it("refuses a post past the month's limit, saying when it resets", async () => {
        const ctx = await ready();
        world.planId = "grow";
        world.addon = true;
        world.limit = 2;
        const at = inHours(1);
        (share.socialCard as jest.Mock).mockClear();
        await prisma.socialPost.createMany({
            data: ["social-filledaaaa", "social-filledbbbb"].map((ref) => ({
                organizationId: ctx.organizationId,
                sourceKind: "own",
                ref,
                status: "DONE" as const,
                publishAt: new Date(at),
            })),
        });
        const refusal = await service()
            .create(ctx, { ...product, action: "schedule", publishAt: at })
            .catch((e: { getResponse(): unknown }) => e.getResponse());
        expect(refusal).toMatchObject({
            details: {
                code: "PLAN_LIMIT_REACHED",
                limitKey: "socialPostsPerMonth",
                resetsAt: expect.any(String),
            },
        });
        // Nothing drawn, nothing left behind (S-04).
        expect(share.socialCard).not.toHaveBeenCalled();
        expect(storage.listKeys()).toHaveLength(0);
    });

    it("records Request more once a month however often it is asked", async () => {
        const ctx = await ready();
        await service().requestMore(ctx);
        await service().requestMore(ctx);
        expect(
            await prisma.socialRequest.count({
                where: { organizationId: ctx.organizationId },
            }),
        ).toBe(1);
        expect(
            await prisma.adminOrganizationNote.count({
                where: { organizationId: ctx.organizationId },
            }),
        ).toBe(1);
    });

    it("refuses Threads' own words over 500 bytes, with the count", async () => {
        const ctx = await ready();
        const refusal = await service()
            .create(ctx, {
                ...product,
                captions: { THREADS: "आम ".repeat(200) },
                action: "schedule",
                publishAt: inHours(2),
            })
            .catch((e: { getResponse(): unknown }) => e.getResponse());
        expect(refusal).toMatchObject({
            details: {
                code: "SOCIAL_CAPTION_TOO_LONG",
                kind: "THREADS",
                limit: 500,
                unit: "bytes",
            },
        });
    });

    it("refuses a channel that isn't connected, and an item with no public page", async () => {
        const ctx = await ready();
        await expect(
            service().create(ctx, {
                ...product,
                channels: ["FACEBOOK"] as never,
                action: "now",
            }),
        ).rejects.toMatchObject({ status: 409 });
        (share.socialCard as jest.Mock).mockRejectedValueOnce(
            new (jest.requireActual("@nestjs/common").NotFoundException)(),
        );
        const refusal = await service()
            .create(ctx, { ...product, action: "now" })
            .catch((e: { getResponse(): unknown }) => e.getResponse());
        expect(refusal).toMatchObject({
            message: "Publish it first. A draft has no public page.",
        });
    });
});

describe("held posts and rescheduling", () => {
    /** A post past its time that its run held: Social was off then. */
    async function held(ctx: OrganizationContext, posted = false) {
        const post = await service().create(ctx, {
            ...product,
            action: "schedule",
            publishAt: inHours(1),
        });
        await prisma.socialPost.update({
            where: { id: post.id },
            data: { status: "PUBLISHING", publishJobId: null },
        });
        await prisma.socialDelivery.updateMany({
            where: { postId: post.id },
            data: { reason: "off" },
        });
        if (posted) {
            await prisma.socialDelivery.updateMany({
                where: { postId: post.id, kind: "INSTAGRAM" },
                data: { status: "POSTED", reason: null },
            });
        }
        return post.id;
    }

    it("lets a held post be cancelled, and says it is held, with the plan off (S-02)", async () => {
        const ctx = await ready();
        const id = await held(ctx);
        expect((await service().get(ctx, id)).held).toBe(true);
        world.planId = "free";
        expect((await service().cancel(ctx, id)).status).toBe("CANCELLED");
    });

    it("deletes a held post that sent nothing, and removes one that sent some (S-02)", async () => {
        const ctx = await ready();
        const none = await held(ctx);
        const some = await held(ctx, true);
        world.flag = false;
        await service().remove(ctx, none);
        expect(await prisma.socialPost.count({ where: { id: none } })).toBe(0);
        await service().remove(ctx, some);
        const row = await prisma.socialPost.findUniqueOrThrow({
            where: { id: some },
            include: { deliveries: true },
        });
        expect(row.removedAt).not.toBeNull();
        expect(row.status).toBe("PARTLY_DONE");
        expect(row.deliveries.find((d) => d.kind === "THREADS")).toMatchObject({
            status: "FAILED",
            reason: "removed",
        });
    });

    it("still refuses a post whose run is queued or running", async () => {
        const ctx = await ready();
        const post = await service().create(ctx, {
            ...product,
            action: "schedule",
            publishAt: inHours(1),
        });
        await prisma.socialPost.update({
            where: { id: post.id },
            data: { status: "PUBLISHING" },
        });
        await expect(service().remove(ctx, post.id)).rejects.toMatchObject({
            status: 409,
        });
    });

    it("starts afresh a channel an old disconnect failed when the post is saved again (S-14)", async () => {
        const ctx = await ready();
        const post = await service().create(ctx, {
            ...product,
            action: "schedule",
            publishAt: inHours(3),
        });
        await prisma.socialDelivery.updateMany({
            where: { postId: post.id, kind: "THREADS" },
            data: { status: "FAILED", reason: "disconnected", channelId: null },
        });
        const saved = await service().update(ctx, post.id, {
            publishAt: inHours(4),
        });
        expect(saved.channels.find((c) => c.kind === "THREADS")).toMatchObject({
            status: "WAITING",
            reason: null,
        });
    });
});
