/**
 * Posts in the redesigned editor (U17a) against a real Postgres: Publish
 * post › Later and its `post.go_live` job, old links that forward, the
 * live copy beside the draft, revisions and restore, and another business
 * reaching none of it.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { NotFoundException } from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { runScheduledPost } from "./post-go-live.handler";
import { postMovedTo } from "./post-old-slugs";
import { PostRevisionsService } from "./post-revisions.service";
import { POST_GO_LIVE_TYPE } from "./post-schedule";
import { PostsService } from "./posts.service";

const posts = new PostsService();
const revisions = new PostRevisionsService();

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

async function business() {
    const org = await prisma.organization.create({
        data: { name: "Gulmohar Studio", slug: uniq("pw-org-") },
    });
    const owner = await prisma.user.create({
        data: { email: `${uniq("pw-owner-")}@example.com`, name: "Asha" },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: owner.id, role: "OWNER" },
    });
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Gulmohar",
            slug: uniq("pw-site-"),
            subdomain: uniq("pwsub"),
        },
    });
    const ctx: OrganizationContext = {
        organizationId: org.id,
        userId: owner.id,
        role: "OWNER",
        roleKey: "OWNER",
    };
    const inOrg = <T>(fn: () => Promise<T>) => runInOrgContext(org.id, fn);
    const { id: postId } = await inOrg(() =>
        posts.create(ctx, site.id, {
            title: "Bridal makeup trial",
            slug: "bridal-makeup-trial",
            content: "<p>What a trial covers.</p>",
        }),
    );
    return { org, owner, site, ctx, postId, inOrg };
}

const draft = (title: string, slug: string, extra = {}) => ({
    title,
    slug,
    content: `<p>${title}</p>`,
    ...extra,
});

describe("Publish post › Later (post.go_live)", () => {
    it("publishes the draft as it is at the time, once", async () => {
        const b = await business();
        const at = new Date(Date.now() + 60 * 60 * 1000);
        await b.inOrg(() =>
            posts.schedule(b.ctx, b.site.id, b.postId, {
                at: at.toISOString(),
            }),
        );
        // Edited after scheduling: what goes live is the newer draft.
        await b.inOrg(() =>
            posts.update(
                b.ctx,
                b.site.id,
                b.postId,
                draft("Bridal trial, updated", "bridal-makeup-trial"),
            ),
        );
        const job = await prisma.job.findFirstOrThrow({
            where: { type: POST_GO_LIVE_TYPE, organizationId: b.org.id },
            select: { payload: true, runAt: true },
        });
        expect(job.runAt.toISOString()).toBe(at.toISOString());
        const payload = job.payload as { postId: string; at: string };

        const run = () =>
            b.inOrg(() =>
                prisma.$transaction((tx) =>
                    runScheduledPost(tx, b.org.id, payload),
                ),
            );
        expect((await run()).outcome).toBe("LIVE");
        // A second run for the same time does nothing.
        expect((await run()).outcome).toBe("skipped");

        const post = await prisma.post.findUniqueOrThrow({
            where: { id: b.postId },
            select: {
                scheduledAt: true,
                _count: { select: { publications: true } },
            },
        });
        expect(post.scheduledAt).toBeNull();
        expect(post._count.publications).toBe(1);
        const got = await b.inOrg(() => posts.get(b.ctx, b.site.id, b.postId));
        expect(got.liveCopy?.title).toBe("Bridal trial, updated");
    });

    it("taking it off before its time clears the schedule and its job", async () => {
        const b = await business();
        await b.inOrg(() =>
            posts.schedule(b.ctx, b.site.id, b.postId, {
                at: new Date(Date.now() + 86_400_000).toISOString(),
            }),
        );
        await b.inOrg(() => posts.unpublish(b.ctx, b.site.id, b.postId));
        const post = await prisma.post.findUniqueOrThrow({
            where: { id: b.postId },
            select: { scheduledAt: true },
        });
        expect(post.scheduledAt).toBeNull();
        expect(
            await prisma.job.count({
                where: { type: POST_GO_LIVE_TYPE, organizationId: b.org.id },
            }),
        ).toBe(0);
    });

    it("refuses a time less than five minutes away", async () => {
        const b = await business();
        await expect(
            b.inOrg(() =>
                posts.schedule(b.ctx, b.site.id, b.postId, {
                    at: new Date(Date.now() + 60_000).toISOString(),
                }),
            ),
        ).rejects.toThrow("at least 5 minutes");
    });

    it("doesn't publish for someone who left, and says why in History", async () => {
        const b = await business();
        const at = new Date(Date.now() + 60 * 60 * 1000);
        await b.inOrg(() =>
            posts.schedule(b.ctx, b.site.id, b.postId, {
                at: at.toISOString(),
            }),
        );
        await prisma.membership.deleteMany({ where: { userId: b.owner.id } });
        const run = await b.inOrg(() =>
            prisma.$transaction((tx) =>
                runScheduledPost(tx, b.org.id, {
                    postId: b.postId,
                    at: at.toISOString(),
                }),
            ),
        );
        expect(run.outcome).toBe("NOT_LIVE");
        const last = await prisma.postRevision.findFirstOrThrow({
            where: { postId: b.postId },
            orderBy: { createdAt: "desc" },
            select: { reason: true, note: true },
        });
        expect(last.reason).toBe("not_published");
        expect(last.note).toContain("no longer on the team");
    });
});

describe("old post links forward", () => {
    it("forwards the live link after the link changes and is published", async () => {
        const b = await business();
        await b.inOrg(() => posts.publish(b.ctx, b.site.id, b.postId));
        await b.inOrg(() =>
            posts.update(
                b.ctx,
                b.site.id,
                b.postId,
                draft("Bridal trial", "bridal-trial"),
            ),
        );
        // Until it is published, the live link is still the post itself.
        await expect(
            postMovedTo(b.site.id, "bridal-makeup-trial"),
        ).rejects.toBeInstanceOf(NotFoundException);

        await b.inOrg(() => posts.publish(b.ctx, b.site.id, b.postId));
        await expect(
            postMovedTo(b.site.id, "bridal-makeup-trial"),
        ).resolves.toEqual({ to: "bridal-trial" });

        // Renamed back: the current link is never an old one.
        await b.inOrg(() =>
            posts.update(
                b.ctx,
                b.site.id,
                b.postId,
                draft("Bridal trial", "bridal-makeup-trial"),
            ),
        );
        await b.inOrg(() => posts.publish(b.ctx, b.site.id, b.postId));
        const post = await prisma.post.findUniqueOrThrow({
            where: { id: b.postId },
            select: { oldSlugs: true },
        });
        expect(post.oldSlugs).toEqual(["bridal-trial"]);
    });

    it("lets a live post that holds the old link win", async () => {
        const b = await business();
        await b.inOrg(() => posts.publish(b.ctx, b.site.id, b.postId));
        await b.inOrg(() =>
            posts.update(
                b.ctx,
                b.site.id,
                b.postId,
                draft("Bridal trial", "bridal-trial"),
            ),
        );
        await b.inOrg(() => posts.publish(b.ctx, b.site.id, b.postId));
        const { id: other } = await b.inOrg(() =>
            posts.create(b.ctx, b.site.id, draft("New", "bridal-makeup-trial")),
        );
        await b.inOrg(() => posts.publish(b.ctx, b.site.id, other));
        await expect(
            postMovedTo(b.site.id, "bridal-makeup-trial"),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe("revisions", () => {
    it("keeps one an hour of autosaves, and every named event", async () => {
        const b = await business();
        for (const n of [1, 2, 3]) {
            await b.inOrg(() =>
                posts.update(
                    b.ctx,
                    b.site.id,
                    b.postId,
                    draft(`Take ${n}`, "bridal-makeup-trial"),
                ),
            );
        }
        await b.inOrg(() =>
            posts.update(
                b.ctx,
                b.site.id,
                b.postId,
                draft("From Ask AI", "bridal-makeup-trial", {
                    event: "ask_ai",
                }),
            ),
        );
        const { revisions: rows } = await b.inOrg(() =>
            revisions.list(b.ctx, b.site.id, b.postId),
        );
        // The one from creating it, then Ask AI's; the three autosaves
        // within the hour wrote none of their own.
        expect(rows.map((r) => r.reason)).toEqual(["ask_ai", "autosave"]);
        expect(rows[0]?.savedBy?.name).toBe("Asha");
    });

    it("restore makes a revision the draft, keeping the draft first", async () => {
        const b = await business();
        const { revisions: before } = await b.inOrg(() =>
            revisions.list(b.ctx, b.site.id, b.postId),
        );
        const first = before[0]!;
        await b.inOrg(() =>
            posts.update(
                b.ctx,
                b.site.id,
                b.postId,
                draft("Rewritten", "bridal-makeup-trial", {
                    seoTitle: "Bridal trial in Jaipur",
                }),
            ),
        );
        await b.inOrg(() =>
            revisions.restore(b.ctx, b.site.id, b.postId, first.id),
        );
        const post = await prisma.post.findUniqueOrThrow({
            where: { id: b.postId },
            select: { title: true, content: true, seoTitle: true },
        });
        expect(post).toEqual({
            title: "Bridal makeup trial",
            content: "<p>What a trial covers.</p>",
            seoTitle: null,
        });
        const { revisions: after } = await b.inOrg(() =>
            revisions.list(b.ctx, b.site.id, b.postId),
        );
        expect(after.slice(0, 2).map((r) => [r.reason, r.title])).toEqual([
            ["restored", "Bridal makeup trial"],
            ["autosave", "Rewritten"],
        ]);
    });
});

describe("another business", () => {
    it("is a 404 on every new endpoint", async () => {
        const a = await business();
        const b = await business();
        const { revisions: rows } = await a.inOrg(() =>
            revisions.list(a.ctx, a.site.id, a.postId),
        );
        const revisionId = rows[0]!.id;
        const calls = [
            () => revisions.list(b.ctx, a.site.id, a.postId),
            () => revisions.get(b.ctx, a.site.id, a.postId, revisionId),
            () => revisions.restore(b.ctx, a.site.id, a.postId, revisionId),
            () =>
                posts.schedule(b.ctx, a.site.id, a.postId, {
                    at: new Date(Date.now() + 86_400_000).toISOString(),
                }),
            () => posts.unschedule(b.ctx, a.site.id, a.postId),
            // Its own site, another business's post.
            () => revisions.list(b.ctx, b.site.id, a.postId),
        ];
        for (const call of calls) {
            await expect(b.inOrg(call)).rejects.toBeInstanceOf(
                NotFoundException,
            );
        }
    });
});
