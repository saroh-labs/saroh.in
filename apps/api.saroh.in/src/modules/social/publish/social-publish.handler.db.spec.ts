/**
 * `social.publish` (U6) against a real Postgres and the in-memory Meta:
 * all three channels post; Instagram's limit fails only Instagram and the
 * post counts once; a token revoked mid-run marks the channel, tells the
 * business once and leaves the delivery waiting; a container stuck in
 * progress fails after five reads; an unclear publish is checked on the
 * platform, never sent twice; a moved post's old job does nothing. Runs
 * in the integration project.
 */
import { prisma } from "@saroh/database";

import {
    restoreSocialEnv,
    socialAccessFor,
    socialBusiness,
    socialEnv,
    uniq,
} from "../../../../test/fixtures/social";
import type { OrganizationContext } from "../../../common/types/organization-context";
import { countUsage } from "../../billing/metering";
import { TEAM_ALERT_TYPE } from "../../notifications/team-alerts";
import { seal, tokenColumns } from "../channels/sealing";
import { FakeSocialMeta } from "../meta/fake-social-meta";
import type { ChannelKind } from "../meta/social-meta.port";
import { queuePublishInTx } from "../shared/jobs";
import { SocialPublishHandler } from "./social-publish.handler";

let meta: FakeSocialMeta;
const handler = () =>
    new SocialPublishHandler(
        meta,
        socialAccessFor({ flag: true, planId: "pro", addon: false }),
    );

beforeAll(socialEnv);
afterAll(async () => {
    restoreSocialEnv();
    await prisma.$disconnect();
});
beforeEach(() => {
    meta = new FakeSocialMeta();
});

const KINDS: ChannelKind[] = ["INSTAGRAM", "FACEBOOK", "THREADS"];

/** A live business with all three channels, and a post due now on them. */
async function due(): Promise<{
    ctx: OrganizationContext;
    postId: string;
    jobId: string;
}> {
    const ctx = await socialBusiness();
    const org = ctx.organizationId;
    const site = await prisma.site.create({
        data: {
            organizationId: org,
            name: "Chai & Crumb",
            slug: uniq("site"),
            subdomain: uniq("chai").toLowerCase(),
        },
    });
    const publication = await prisma.publication.create({
        data: {
            siteId: site.id,
            organizationId: org,
            snapshot: { pages: [] },
            templateId: "blank",
            templateVersion: 1,
        },
    });
    await prisma.site.update({
        where: { id: site.id },
        data: { currentPublicationId: publication.id },
    });
    for (const kind of KINDS) {
        const channel = await prisma.socialChannel.create({
            data: {
                organizationId: org,
                kind,
                accountId: uniq(kind),
                platformUserId: uniq("user"),
                handle: "@chaiandcrumb",
            },
        });
        await prisma.socialChannel.update({
            where: { id: channel.id },
            data: tokenColumns(
                seal(`token-${kind}`, {
                    organizationId: org,
                    rowId: channel.id,
                }),
            ),
        });
    }
    const post = await prisma.socialPost.create({
        data: {
            organizationId: org,
            sourceKind: "own",
            ref: "social-dueposting",
            caption: "Mango cheesecake is back.",
            imageUrl: "https://cdn.example.com/p.jpg",
            status: "SCHEDULED",
            publishAt: new Date(),
            deliveries: {
                create: KINDS.map((kind) => ({ organizationId: org, kind })),
            },
        },
    });
    const jobId = await prisma.$transaction((tx) =>
        queuePublishInTx(
            tx,
            { id: post.id, organizationId: org, publishJobId: null },
            new Date(),
        ),
    );
    return { ctx, postId: post.id, jobId };
}

/** Run the post's current job until nothing comes back. */
async function runAll(org: string, postId: string, rounds = 8) {
    for (let i = 0; i < rounds; i++) {
        const post = await prisma.socialPost.findUniqueOrThrow({
            where: { id: postId },
        });
        if (!post.publishJobId) return;
        await handler().run(org, postId, post.publishJobId);
    }
}

const deliveriesOf = (postId: string) =>
    prisma.socialDelivery.findMany({
        where: { postId },
        orderBy: { kind: "asc" },
    });

describe("social.publish", () => {
    it("posts to all three channels, each with its link", async () => {
        const { ctx, postId } = await due();
        await runAll(ctx.organizationId, postId);
        const post = await prisma.socialPost.findUniqueOrThrow({
            where: { id: postId },
        });
        expect(post.status).toBe("DONE");
        for (const d of await deliveriesOf(postId)) {
            expect(d.status).toBe("POSTED");
            expect(d.permalink).toBeTruthy();
        }
        expect(meta.posts).toHaveLength(3);
        expect(
            meta.posts.every((p) => p.caption.includes("social-dueposting")),
        ).toBe(true);
    });

    it("fails only Instagram at its daily limit, and the post counts once", async () => {
        const { ctx, postId } = await due();
        meta.limit = { used: 50, total: 50 };
        await runAll(ctx.organizationId, postId);
        const ds = await deliveriesOf(postId);
        const ig = ds.find((d) => d.kind === "INSTAGRAM");
        expect(ig).toMatchObject({ status: "FAILED", reason: "limit" });
        expect(ig?.retryAfter).toBeTruthy();
        expect(
            await prisma.socialPost.findUniqueOrThrow({
                where: { id: postId },
            }),
        ).toMatchObject({ status: "PARTLY_DONE" });
        expect(
            await countUsage(prisma, ctx.organizationId, "socialPostsPerMonth"),
        ).toBe(1);
        expect(
            await prisma.job.count({
                where: {
                    organizationId: ctx.organizationId,
                    type: TEAM_ALERT_TYPE,
                    payload: { path: ["about"], equals: "post" },
                },
            }),
        ).toBe(1);
    });

    it("marks a revoked channel once and leaves its delivery waiting", async () => {
        const { ctx, postId } = await due();
        meta.failNext("postPhoto", "auth");
        await runAll(ctx.organizationId, postId);
        const fb = await prisma.socialChannel.findUniqueOrThrow({
            where: {
                organizationId_kind: {
                    organizationId: ctx.organizationId,
                    kind: "FACEBOOK",
                },
            },
        });
        expect(fb).toMatchObject({
            status: "NEEDS_ATTENTION",
            attentionReason: "revoked",
            tokenCiphertext: null,
        });
        const d = (await deliveriesOf(postId)).find(
            (x) => x.kind === "FACEBOOK",
        );
        expect(d).toMatchObject({ status: "WAITING", reason: "attention" });
        expect(
            await prisma.job.count({
                where: {
                    organizationId: ctx.organizationId,
                    type: TEAM_ALERT_TYPE,
                    payload: { path: ["about"], equals: "channel" },
                },
            }),
        ).toBe(1);
    });

    it("fails a container stuck in progress through five reads", async () => {
        const { ctx, postId } = await due();
        meta.stuck = true;
        await runAll(ctx.organizationId, postId, 12);
        const ig = (await deliveriesOf(postId)).find(
            (d) => d.kind === "INSTAGRAM",
        );
        expect(ig).toMatchObject({ status: "FAILED", reason: "stuck" });
    });

    it("checks an unclear publish on the platform and never posts twice", async () => {
        const { ctx, postId } = await due();
        meta.failNext("postPhoto", "retry");
        await runAll(ctx.organizationId, postId);
        const fb = (await deliveriesOf(postId)).find(
            (d) => d.kind === "FACEBOOK",
        );
        expect(fb?.status).toBe("POSTED");
        expect(
            meta.posts.filter((p) => p.id.startsWith("facebook")),
        ).toHaveLength(1);
    });

    it("does nothing for a moved post's old job", async () => {
        const { ctx, postId, jobId } = await due();
        await prisma.$transaction((tx) =>
            queuePublishInTx(
                tx,
                {
                    id: postId,
                    organizationId: ctx.organizationId,
                    publishJobId: jobId,
                },
                new Date(Date.now() + 3_600_000),
            ),
        );
        expect(await handler().run(ctx.organizationId, postId, jobId)).toBe(
            "skipped",
        );
        expect(meta.posts).toHaveLength(0);
    });
});
