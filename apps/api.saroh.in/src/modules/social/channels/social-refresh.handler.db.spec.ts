/**
 * Keeping channels working (U7) against a real Postgres and the
 * in-memory Meta: a refresh replaces the token and queues the next one 7
 * days before the new end; a refused refresh marks the channel and tells
 * the business once however often it is met; a Threads grant past its
 * end is worded so; Home's Needs you shows one row per channel needing
 * attention and per post that didn't go out, and clears when fixed.
 */
import { prisma } from "@saroh/database";

import {
    restoreSocialEnv,
    socialBusiness,
    socialEnv,
    uniq,
} from "../../../../test/fixtures/social";
import { socialNeeds } from "../../home/home-social";
import { TEAM_ALERT_TYPE } from "../../notifications/team-alerts";
import { FakeSocialMeta } from "../meta/fake-social-meta";
import type { ChannelKind } from "../meta/social-meta.port";
import { queueRefreshInTx, SOCIAL_REFRESH_TYPE } from "../shared/jobs";
import { markAttentionInTx } from "./channel-attention";
import { seal, sealedToken, tokenColumns, unseal } from "./sealing";
import { SocialRefreshHandler } from "./social-refresh.handler";

const day = 86_400_000;
let meta: FakeSocialMeta;

beforeAll(socialEnv);
afterAll(async () => {
    restoreSocialEnv();
    await prisma.$disconnect();
});
beforeEach(() => {
    meta = new FakeSocialMeta();
});

/** A connected channel whose token ends in `days`, with its refresh queued. */
async function channel(kind: ChannelKind, days: number, grantDays?: number) {
    const ctx = await socialBusiness();
    const now = new Date();
    const row = await prisma.socialChannel.create({
        data: {
            organizationId: ctx.organizationId,
            kind,
            accountId: uniq(kind),
            platformUserId: uniq("user"),
            handle: "@chaiandcrumb",
            tokenIssuedAt: new Date(now.getTime() - 50 * day),
            tokenExpiresAt: new Date(now.getTime() + days * day),
            grantExpiresAt:
                grantDays === undefined
                    ? null
                    : new Date(now.getTime() + grantDays * day),
        },
    });
    const binding = { organizationId: ctx.organizationId, rowId: row.id };
    await prisma.socialChannel.update({
        where: { id: row.id },
        data: tokenColumns(seal("old-token", binding)),
    });
    await prisma.$transaction((tx) => queueRefreshInTx(tx, row, now));
    const fresh = await prisma.socialChannel.findUniqueOrThrow({
        where: { id: row.id },
    });
    return { ctx, row: fresh, binding };
}

const alerts = (organizationId: string) =>
    prisma.job.count({
        where: {
            organizationId,
            type: TEAM_ALERT_TYPE,
            payload: { path: ["about"], equals: "channel" },
        },
    });

describe("social.refresh", () => {
    it.each(["INSTAGRAM", "THREADS"] as const)(
        "refreshes %s 7 days before it ends and queues the next",
        async (kind) => {
            const { row, binding } = await channel(kind, 7);
            const handler = new SocialRefreshHandler(meta);
            expect(await handler.run(row.id, row.refreshJobId ?? "")).toBe(
                "refreshed",
            );
            const after = await prisma.socialChannel.findUniqueOrThrow({
                where: { id: row.id },
            });
            expect(unseal(sealedToken(after)!, binding)).not.toBe("old-token");
            expect(after.refreshJobId).not.toBe(row.refreshJobId);
            const next = await prisma.job.findUniqueOrThrow({
                where: { id: after.refreshJobId ?? "" },
            });
            expect(next.type).toBe(SOCIAL_REFRESH_TYPE);
            expect(next.runAt.getTime()).toBe(
                after.tokenExpiresAt!.getTime() - 7 * day,
            );
        },
    );

    it("marks a refused refresh and tells the business once", async () => {
        const { ctx, row } = await channel("INSTAGRAM", 7);
        meta.failNext("refresh", "auth");
        const handler = new SocialRefreshHandler(meta);
        expect(await handler.run(row.id, row.refreshJobId ?? "")).toBe(
            "attention",
        );
        // A publish run meets the same refusal: nothing told again.
        await prisma.$transaction((tx) =>
            markAttentionInTx(tx, row.id, "revoked"),
        );
        const after = await prisma.socialChannel.findUniqueOrThrow({
            where: { id: row.id },
        });
        expect(after).toMatchObject({
            status: "NEEDS_ATTENTION",
            attentionReason: "revoked",
            tokenCiphertext: null,
        });
        expect(await alerts(ctx.organizationId)).toBe(1);
    });

    it("says a Threads grant ended when it is past its end", async () => {
        const { row } = await channel("THREADS", 20, -1);
        meta.failNext("refresh", "auth");
        await new SocialRefreshHandler(meta).run(
            row.id,
            row.refreshJobId ?? "",
        );
        expect(
            (
                await prisma.socialChannel.findUniqueOrThrow({
                    where: { id: row.id },
                })
            ).attentionReason,
        ).toBe("grant-ended");
    });
});

describe("Home › Needs you", () => {
    it("shows each channel to reconnect and each post that didn't go out, and clears when fixed", async () => {
        const { ctx, row } = await channel("INSTAGRAM", 30);
        const org = ctx.organizationId;
        expect(await socialNeeds(prisma, org)).toBeNull();
        await prisma.$transaction((tx) =>
            markAttentionInTx(tx, row.id, "revoked"),
        );
        const post = await prisma.socialPost.create({
            data: {
                organizationId: org,
                sourceKind: "own",
                title: "Mango cheesecake",
                ref: "social-needsyouaa",
                status: "PARTLY_DONE",
                publishAt: new Date(),
                deliveries: {
                    create: [
                        {
                            organizationId: org,
                            kind: "FACEBOOK",
                            status: "POSTED",
                        },
                        {
                            organizationId: org,
                            kind: "THREADS",
                            status: "FAILED",
                        },
                    ],
                },
            },
        });
        const needs = await socialNeeds(prisma, org);
        expect(needs?.count).toBe(2);
        expect(needs?.evidence?.map((e) => e.headline)).toEqual([
            "Reconnect Instagram",
            "Mango cheesecake didn't post",
        ]);
        await prisma.socialChannel.update({
            where: { id: row.id },
            data: {
                status: "CONNECTED",
                attentionAt: null,
                attentionReason: null,
            },
        });
        await prisma.socialDelivery.updateMany({
            where: { postId: post.id, status: "FAILED" },
            data: { status: "WAITING" },
        });
        await prisma.socialPost.update({
            where: { id: post.id },
            data: { status: "PUBLISHING" },
        });
        expect(await socialNeeds(prisma, org)).toBeNull();
    });
});
