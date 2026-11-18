import { prisma, runInOrgContext } from "@saroh/database";

import { isRlsTestMode } from "../../../test/rls-mode";

/**
 * Saroh Social's tables (migration `20270219120000_saroh_social`): one
 * channel of each kind a business, one delivery a post and channel, and,
 * in RLS mode (`TEST_RLS=on`), each business sees and writes only its own
 * channels, posts and deliveries.
 */
const describeRls = isRlsTestMode() ? describe : describe.skip;

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;

async function businessWithPost(name: string) {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("social-rls") },
    });
    const channel = await prisma.socialChannel.create({
        data: {
            organizationId: org.id,
            kind: "INSTAGRAM",
            accountId: uniq("ig"),
            platformUserId: uniq("ig-user"),
            handle: "@rye",
        },
    });
    const post = await prisma.socialPost.create({
        data: {
            organizationId: org.id,
            sourceKind: "own",
            ref: `social-${uniq("p").replace(/[^a-z]/g, "")}`,
            deliveries: {
                create: {
                    organizationId: org.id,
                    kind: "INSTAGRAM",
                    channelId: channel.id,
                },
            },
        },
    });
    return { orgId: org.id, channelId: channel.id, postId: post.id };
}

afterAll(async () => {
    await prisma.$disconnect();
});

describe("Saroh Social's one-of-each rules", () => {
    it("refuses a second Instagram channel for a business", async () => {
        const a = await businessWithPost("Chai & Crumb");
        await expect(
            prisma.socialChannel.create({
                data: {
                    organizationId: a.orgId,
                    kind: "INSTAGRAM",
                    accountId: uniq("ig-2"),
                    platformUserId: uniq("ig-user-2"),
                    handle: "@other",
                },
            }),
        ).rejects.toMatchObject({ code: "P2002" });
    });

    it("refuses a second delivery of one post to one channel", async () => {
        const a = await businessWithPost("Neem Tree Yoga");
        await expect(
            prisma.socialDelivery.create({
                data: {
                    organizationId: a.orgId,
                    postId: a.postId,
                    kind: "INSTAGRAM",
                },
            }),
        ).rejects.toMatchObject({ code: "P2002" });
    });
});

describeRls("row-level security on Saroh Social", () => {
    let a = { orgId: "", channelId: "", postId: "" };
    let b = { orgId: "", channelId: "", postId: "" };

    beforeAll(async () => {
        a = await businessWithPost("Lotus Skin Clinic");
        b = await businessWithPost("Pulse Fitness");
    });

    it("shows a business only its own channels, posts and deliveries", async () => {
        const seen = await runInOrgContext(a.orgId, () =>
            Promise.all([
                prisma.socialChannel.findMany({
                    where: { id: { in: [a.channelId, b.channelId] } },
                    select: { id: true },
                }),
                prisma.socialPost.findMany({
                    where: { id: { in: [a.postId, b.postId] } },
                    select: { id: true },
                }),
                prisma.socialDelivery.count({
                    where: { postId: { in: [a.postId, b.postId] } },
                }),
            ]),
        );
        expect(seen).toEqual([[{ id: a.channelId }], [{ id: a.postId }], 1]);
    });

    it("can't change or remove another business's channel", async () => {
        const changed = await runInOrgContext(a.orgId, () =>
            prisma.socialChannel.updateMany({
                where: { id: b.channelId },
                data: { status: "NEEDS_ATTENTION" },
            }),
        );
        const removed = await runInOrgContext(a.orgId, () =>
            prisma.socialPost.deleteMany({ where: { id: b.postId } }),
        );
        expect(changed.count).toBe(0);
        expect(removed.count).toBe(0);
    });

    it("refuses a post written for another business inside a context", async () => {
        await expect(
            runInOrgContext(a.orgId, () =>
                prisma.socialPost.create({
                    data: {
                        organizationId: b.orgId,
                        sourceKind: "own",
                        ref: "social-notmine",
                    },
                }),
            ),
        ).rejects.toThrow(/row-level security/);
    });
});
