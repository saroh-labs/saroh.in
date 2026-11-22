/**
 * Post revisions are pruned (02 W5 / 04 W7, 21 Nov 2026): each post keeps
 * its newest autosaves and every published, sent and approved one; a
 * business on legal hold keeps all of them. Run by `analytics.retention`.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import {
    prunePostRevisions,
    REVISIONS_KEPT_PER_POST,
} from "./post-revision-retention";

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

/** A post with `autosaves` autosaves an hour apart, the oldest first. */
async function postWith(autosaves: number, opts: { held?: boolean } = {}) {
    const org = await prisma.organization.create({
        data: {
            name: "Gulmohar Studio",
            slug: uniq("prr-org-"),
            ...(opts.held ? { legalHoldAt: new Date() } : {}),
        },
    });
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Gulmohar",
            slug: uniq("prr-site-"),
            subdomain: uniq("prrsub"),
        },
    });
    const post = await prisma.post.create({
        data: {
            siteId: site.id,
            title: "Bridal trial",
            slug: uniq("bridal-"),
            content: "<p>Hi</p>",
        },
    });
    const at = (hour: number) => new Date(Date.UTC(2026, 9, 1, hour));
    const revision = (reason: string, hour: number) => ({
        organizationId: org.id,
        postId: post.id,
        title: `Bridal trial ${hour}`,
        content: "<p>Hi</p>",
        slug: post.slug,
        reason,
        createdAt: at(hour),
    });
    await prisma.postRevision.createMany({
        data: [
            // The oldest: a send, a publish and an approval, kept for good.
            revision("sent", 0),
            revision("approved", 1),
            revision("published", 2),
            ...Array.from({ length: autosaves }, (_, i) =>
                revision(i % 10 === 0 ? "ask_ai" : "autosave", 3 + i),
            ),
        ],
    });
    return { org, post, at };
}

const reasonsOf = (postId: string) =>
    prisma.postRevision.findMany({
        where: { postId },
        orderBy: { createdAt: "asc" },
        select: { reason: true, createdAt: true },
    });

describe("post revision retention (02 W5)", () => {
    it("keeps the newest autosaves and every send, approval and publish", async () => {
        const extra = 25;
        const { post, at } = await postWith(REVISIONS_KEPT_PER_POST + extra);
        const small = await postWith(10);

        const run = await prunePostRevisions(prisma, []);

        expect(run.deleted).toBe(extra);
        expect(run.more).toBe(false);
        const left = await reasonsOf(post.id);
        expect(left).toHaveLength(REVISIONS_KEPT_PER_POST + 3);
        expect(left.slice(0, 3).map((r) => r.reason)).toEqual([
            "sent",
            "approved",
            "published",
        ]);
        // The oldest autosave left is the 26th written.
        expect(left[3].createdAt).toEqual(at(3 + extra));
        // A post under the cap is untouched.
        expect(await reasonsOf(small.post.id)).toHaveLength(13);

        // Nothing more to do the next day.
        expect(await prunePostRevisions(prisma, [])).toEqual({
            deleted: 0,
            more: false,
        });
    });

    it("leaves a business on legal hold as it is", async () => {
        const { org, post } = await postWith(REVISIONS_KEPT_PER_POST + 5, {
            held: true,
        });

        await prunePostRevisions(prisma, [org.id]);

        expect(await reasonsOf(post.id)).toHaveLength(
            REVISIONS_KEPT_PER_POST + 8,
        );
    });
});
