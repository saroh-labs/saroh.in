/**
 * Social › Channels (U4) against a real Postgres, with the in-memory Meta:
 * connecting each kind seals its token, a Facebook sign-in with three
 * Pages goes through the picker, the refusals (a bad or expired state,
 * someone else's state, not rolled out, plan locked, a Facebook sign-in
 * with no Instagram account linked), and disconnect. Runs in the integration project.
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
import { FakeSocialMeta } from "../meta/fake-social-meta";
import { SOCIAL_REFRESH_TYPE } from "../shared/jobs";
import { SocialChannelsService } from "./channels.service";
import { signState, STATE_TTL_MS } from "./connect-state";

let meta: FakeSocialMeta;
const world = { flag: true, planId: "pro" as const, addon: false };
const service = () =>
    new SocialChannelsService(meta, socialAccessFor(world as never));

beforeAll(socialEnv);
afterAll(async () => {
    restoreSocialEnv();
    await prisma.$disconnect();
});
beforeEach(() => {
    meta = new FakeSocialMeta();
    Object.assign(world, { flag: true, planId: "pro", addon: false });
});

/** Start, then come back from Meta with the fake's code. */
async function connectFlow(
    ctx: OrganizationContext,
    kind: "INSTAGRAM" | "FACEBOOK" | "THREADS",
    code?: string,
) {
    const s = service();
    const { url } = await s.start(ctx, kind);
    const back = new URL(url);
    return s.callback(
        kind,
        {
            code: code ?? back.searchParams.get("code") ?? "",
            state: back.searchParams.get("state") ?? "",
        },
        ctx.userId,
        () => Promise.resolve(ctx),
    );
}

const resultOf = (to: string) => new URL(to).searchParams.get("result");

describe("connecting a channel", () => {
    it.each(["INSTAGRAM", "FACEBOOK", "THREADS"] as const)(
        "connects %s with its token sealed",
        async (kind) => {
            const ctx = await socialBusiness();
            const to = await connectFlow(ctx, kind);
            expect(to).toMatch(/\/social\?tab=channels&channel=/);
            expect(resultOf(to)).toBe("connected");
            const row = await prisma.socialChannel.findUniqueOrThrow({
                where: {
                    organizationId_kind: {
                        organizationId: ctx.organizationId,
                        kind,
                    },
                },
            });
            expect(row.status).toBe("CONNECTED");
            expect(row.tokenCiphertext).toBeTruthy();
            expect(row.tokenCiphertext).not.toContain("fake-");
            const refresh = await prisma.job.count({
                where: {
                    type: SOCIAL_REFRESH_TYPE,
                    status: "PENDING",
                    payload: { path: ["channelId"], equals: row.id },
                },
            });
            // A Page's token (Facebook, Instagram) never ends; Threads' is refreshed.
            expect(refresh).toBe(kind === "THREADS" ? 1 : 0);
            expect(row.grantExpiresAt !== null).toBe(kind === "THREADS");
            expect(row.pageId).toBe(kind === "INSTAGRAM" ? "page-1" : null);
        },
    );

    it("takes a Facebook sign-in with three Pages through the picker", async () => {
        meta.pages = 3;
        const ctx = await socialBusiness();
        const to = await connectFlow(ctx, "FACEBOOK");
        expect(resultOf(to)).toBe("choose");
        const choiceId = new URL(to).searchParams.get("choice") ?? "";
        const pages = await service().choices(ctx, "FACEBOOK", choiceId);
        expect(pages.map((p) => p.id)).toEqual(["page-1", "page-2", "page-3"]);
        expect(JSON.stringify(pages)).not.toContain("token");
        const rows = await service().choose(
            ctx,
            "FACEBOOK",
            choiceId,
            "page-2",
        );
        expect(rows.find((r) => r.kind === "FACEBOOK")).toMatchObject({
            state: "CONNECTED",
            handle: "Chai & Crumb 2",
        });
        expect(
            await prisma.socialConnectChoice.count({ where: { id: choiceId } }),
        ).toBe(0);
    });

    it("offers the Instagram accounts linked to the person's Pages, and keeps the one picked with its Page", async () => {
        meta.pages = 2;
        const ctx = await socialBusiness();
        const to = await connectFlow(ctx, "INSTAGRAM");
        expect(resultOf(to)).toBe("choose");
        const choiceId = new URL(to).searchParams.get("choice") ?? "";
        const accounts = await service().choices(ctx, "INSTAGRAM", choiceId);
        expect(accounts.map((a) => a.name)).toEqual([
            "@chaiandcrumb",
            "@chaiandcrumb2",
        ]);
        await service().choose(
            ctx,
            "INSTAGRAM",
            choiceId,
            "instagram-account-2",
        );
        expect(
            await prisma.socialChannel.findUniqueOrThrow({
                where: {
                    organizationId_kind: {
                        organizationId: ctx.organizationId,
                        kind: "INSTAGRAM",
                    },
                },
                select: { accountId: true, pageId: true, platformUserId: true },
            }),
        ).toEqual({
            accountId: "instagram-account-2",
            pageId: "page-2",
            platformUserId: "facebook-user-1",
        });
    });

    it("says to link an Instagram account to a Page when no Page has one", async () => {
        meta.pages = 0;
        const ctx = await socialBusiness();
        expect(resultOf(await connectFlow(ctx, "INSTAGRAM"))).toBe(
            "no-instagram",
        );
        expect(
            await prisma.socialChannel.count({
                where: { organizationId: ctx.organizationId },
            }),
        ).toBe(0);
    });

    it("refuses a changed, expired or someone else's state", async () => {
        const ctx = await socialBusiness();
        const s = service();
        const back = (state: string, userId = ctx.userId) =>
            s.callback(
                "INSTAGRAM",
                { code: "fake-instagram", state },
                userId,
                () => Promise.resolve(ctx),
            );
        const good = signState({ ...ctx, kind: "INSTAGRAM" });
        expect(resultOf(await back(`${good}x`))).toBe("invalid");
        const old = signState(
            { ...ctx, kind: "INSTAGRAM" },
            new Date(Date.now() - STATE_TTL_MS - 1000),
        );
        expect(resultOf(await back(old))).toBe("expired");
        expect(resultOf(await back(good, uniq("someone")))).toBe(
            "someone-else",
        );
    });

    it("refuses while MODULE_SOCIAL is off, and on a plan without Social", async () => {
        const ctx = await socialBusiness();
        world.flag = false;
        await expect(service().start(ctx, "THREADS")).rejects.toMatchObject({
            status: 404,
        });
        world.flag = true;
        world.planId = "grow";
        await expect(service().start(ctx, "THREADS")).rejects.toMatchObject({
            status: 403,
        });
        world.addon = true;
        await expect(service().start(ctx, "THREADS")).resolves.toHaveProperty(
            "url",
        );
    });
});

describe("disconnecting", () => {
    it("drops the token, fails what waited for it and keeps the post", async () => {
        const ctx = await socialBusiness();
        await connectFlow(ctx, "INSTAGRAM");
        const channel = await prisma.socialChannel.findFirstOrThrow({
            where: { organizationId: ctx.organizationId },
        });
        const post = await prisma.socialPost.create({
            data: {
                organizationId: ctx.organizationId,
                sourceKind: "own",
                ref: "social-waitsfor",
                status: "SCHEDULED",
                publishAt: new Date(Date.now() + 3_600_000),
                deliveries: {
                    create: {
                        organizationId: ctx.organizationId,
                        kind: "INSTAGRAM",
                        channelId: channel.id,
                    },
                },
            },
        });
        await service().disconnect(ctx, "INSTAGRAM");
        expect(
            await prisma.socialChannel.count({ where: { id: channel.id } }),
        ).toBe(0);
        const delivery = await prisma.socialDelivery.findFirstOrThrow({
            where: { postId: post.id },
        });
        expect(delivery).toMatchObject({
            status: "FAILED",
            reason: "disconnected",
            channelId: null,
        });
        expect(await prisma.socialPost.count({ where: { id: post.id } })).toBe(
            1,
        );
    });
});
