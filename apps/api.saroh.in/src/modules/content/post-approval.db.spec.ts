/**
 * Post approval (O7, owner 20 Nov 2026) against a real Postgres: with
 * "Publishing needs approval" on, a teammate's post goes live only once a
 * reviewer, an admin or the owner approves it as it is; a later edit voids
 * the approval; nobody approves their own writing; an owner's post needs
 * none (DEC-103); a day picked in Send for approval is kept by the
 * `post.go_live` job only if the post was approved by then.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { planMeter } from "../billing/metering.service";
import { TEAM_ALERT_TYPE } from "../notifications/team-alerts";
import type { OrgAction } from "../organizations/organization-actions";
import { PostApprovalService } from "./post-approval.service";
import { NOT_APPROVED, runScheduledPost } from "./post-go-live.handler";
import { POST_GO_LIVE_TYPE } from "./post-schedule";
import { PostsService } from "./posts.service";

const posts = new PostsService();
const approval = new PostApprovalService();

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

async function person(
    organizationId: string,
    name: string,
    role: string,
    extraActions: string[] = [],
) {
    const user = await prisma.user.create({
        data: { email: `${uniq("pa-")}@example.com`, name },
    });
    await prisma.membership.create({
        data: { organizationId, userId: user.id, role, extraActions },
    });
    return user.id;
}

/** Mohit (owner), Ritika (a teammate who writes), Kavya (the reviewer). */
async function business(opts: { approval?: boolean } = {}) {
    const org = await prisma.organization.create({
        data: { name: "Gulmohar Studio", slug: uniq("pa-org-") },
    });
    const mohit = await person(org.id, "Mohit", "OWNER");
    // A teammate who may write: the go-live job reads it from the team.
    const ritika = await person(org.id, "Ritika", "MEMBER", ["section:write"]);
    const kavya = await person(org.id, "Kavya", "REVIEWER");
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Gulmohar",
            slug: uniq("pa-site-"),
            subdomain: uniq("pasub"),
            publishNeedsApproval: opts.approval !== false,
        },
    });
    await prisma.siteReviewer.create({
        data: { organizationId: org.id, siteId: site.id, userId: kavya },
    });
    const ctx = (
        userId: string,
        role: OrganizationContext["role"],
        actions?: OrgAction[],
    ): OrganizationContext => ({
        organizationId: org.id,
        userId,
        role,
        roleKey: role,
        ...(actions ? { actions: new Set(actions) } : {}),
    });
    const owner = ctx(mohit, "OWNER");
    const writer = ctx(ritika, "MEMBER", [
        "site:read",
        "site:update",
        "section:write",
    ]);
    const reviewer = ctx(kavya, "REVIEWER");
    const inOrg = <T>(fn: () => Promise<T>) => runInOrgContext(org.id, fn);
    const { id: postId } = await inOrg(() =>
        posts.create(writer, site.id, {
            title: "Bridal makeup trial",
            slug: "bridal-makeup-trial",
            content: "<p>What a trial covers.</p>",
        }),
    );
    return { org, site, owner, writer, reviewer, postId, inOrg };
}

const edit = (title: string) => ({
    title,
    slug: "bridal-makeup-trial",
    content: `<p>${title}</p>`,
});

async function isLive(postId: string): Promise<boolean> {
    const p = await prisma.post.findUniqueOrThrow({
        where: { id: postId },
        select: { currentPublicationId: true },
    });
    return p.currentPublicationId !== null;
}

describe("post approval (O7)", () => {
    beforeEach(() => {
        jest.spyOn(planMeter, "isIncluded").mockResolvedValue(true);
    });
    afterEach(() => jest.restoreAllMocks());

    it("refuses a teammate's publish until a reviewer approves, then goes live", async () => {
        const b = await business();
        await expect(
            b.inOrg(() => posts.publish(b.writer, b.site.id, b.postId)),
        ).rejects.toBeInstanceOf(ConflictException);

        const view = await b.inOrg(() =>
            posts.get(b.writer, b.site.id, b.postId),
        );
        expect(view.approval.mustAsk).toBe(true);
        expect(view.approval.canApprove).toBe(false);
        expect(view.approval.approvers.map((a) => a.name).sort()).toEqual([
            "Kavya",
            "Mohit",
        ]);

        await b.inOrg(() =>
            approval.request(b.writer, b.site.id, b.postId, {
                note: "Could it go out before Saturday?",
            }),
        );
        const asked = await b.inOrg(() =>
            posts.get(b.reviewer, b.site.id, b.postId),
        );
        expect(asked.approval.canApprove).toBe(true);
        expect(asked.approval.request?.note).toBe(
            "Could it go out before Saturday?",
        );
        // The approvers hear of it.
        const alert = await prisma.job.findFirst({
            where: { organizationId: b.org.id, type: TEAM_ALERT_TYPE },
            select: { payload: true },
            orderBy: { createdAt: "desc" },
        });
        expect(alert?.payload).toMatchObject({
            event: "review",
            about: "post",
        });

        const res = await b.inOrg(() =>
            approval.approve(b.reviewer, b.site.id, b.postId, {
                fingerprint: asked.approval.fingerprint,
            }),
        );
        expect(res.published).toBe(true);
        expect(await isLive(b.postId)).toBe(true);
        const after = await b.inOrg(() =>
            posts.get(b.writer, b.site.id, b.postId),
        );
        expect(after.approval.request).toBeNull();
        const reasons = await prisma.postRevision.findMany({
            where: { postId: b.postId },
            orderBy: { createdAt: "asc" },
            select: { reason: true },
        });
        expect(reasons.map((r) => r.reason)).toEqual(
            expect.arrayContaining(["sent", "approved", "published"]),
        );
    });

    it("a later edit voids the approval: publish is refused again", async () => {
        const b = await business();
        await b.inOrg(() =>
            approval.request(b.writer, b.site.id, b.postId, {
                at: new Date(Date.now() + 86_400_000).toISOString(),
            }),
        );
        // Approved for the writer's day: nothing goes live yet.
        const res = await b.inOrg(() =>
            approval.approve(b.reviewer, b.site.id, b.postId, {}),
        );
        expect(res.published).toBe(false);
        expect(await isLive(b.postId)).toBe(false);

        await b.inOrg(() =>
            posts.update(b.writer, b.site.id, b.postId, edit("Trial, edited")),
        );
        await expect(
            b.inOrg(() => posts.publish(b.writer, b.site.id, b.postId)),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("an approver can't approve what they edited last; a stale read is refused", async () => {
        const b = await business();
        await expect(
            b.inOrg(() => approval.approve(b.writer, b.site.id, b.postId, {})),
        ).rejects.toThrow();
        // The owner edits it last: the owner can't approve, the reviewer can.
        await b.inOrg(() =>
            posts.update(b.owner, b.site.id, b.postId, edit("Owner's words")),
        );
        await expect(
            b.inOrg(() => approval.approve(b.owner, b.site.id, b.postId, {})),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            b.inOrg(() =>
                approval.approve(b.reviewer, b.site.id, b.postId, {
                    fingerprint: "an-older-read",
                }),
            ),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("ask for changes is recorded with its reason and tells the writer", async () => {
        const b = await business();
        await b.inOrg(() =>
            approval.askForChanges(b.reviewer, b.site.id, b.postId, {
                reason: "Say the trial comes off the package.",
            }),
        );
        const view = await b.inOrg(() =>
            posts.get(b.writer, b.site.id, b.postId),
        );
        expect(view.approval.state).toBe("asked");
        expect(view.approval.verdict?.reason).toBe(
            "Say the trial comes off the package.",
        );
    });

    it("an owner publishes with the setting on; with it off nobody waits", async () => {
        const b = await business();
        await b.inOrg(() => posts.publish(b.owner, b.site.id, b.postId));
        expect(await isLive(b.postId)).toBe(true);

        const off = await business({ approval: false });
        await off.inOrg(() =>
            posts.publish(off.writer, off.site.id, off.postId),
        );
        expect(await isLive(off.postId)).toBe(true);
        const view = await off.inOrg(() =>
            posts.get(off.writer, off.site.id, off.postId),
        );
        expect(view.approval.mustAsk).toBe(false);
    });

    it("the go-live job keeps the writer's day only if it was approved by then", async () => {
        const b = await business();
        const at = new Date(Date.now() + 60 * 60 * 1000);
        await b.inOrg(() =>
            approval.request(b.writer, b.site.id, b.postId, {
                at: at.toISOString(),
            }),
        );
        const job = await prisma.job.findFirstOrThrow({
            where: { type: POST_GO_LIVE_TYPE, organizationId: b.org.id },
            select: { payload: true },
        });
        const payload = job.payload as { postId: string; at: string };
        const run = await b.inOrg(() =>
            prisma.$transaction((tx) =>
                runScheduledPost(tx, b.org.id, payload),
            ),
        );
        expect(run).toEqual({ outcome: "NOT_LIVE", reason: NOT_APPROVED });
        expect(await isLive(b.postId)).toBe(false);

        // Sent again for a day, approved: the job publishes it.
        await b.inOrg(() =>
            approval.request(b.writer, b.site.id, b.postId, {
                at: at.toISOString(),
            }),
        );
        await b.inOrg(() =>
            approval.approve(b.reviewer, b.site.id, b.postId, {}),
        );
        const again = await b.inOrg(() =>
            prisma.$transaction((tx) =>
                runScheduledPost(tx, b.org.id, payload),
            ),
        );
        expect(again.outcome).toBe("LIVE");
    });

    it("another business reaches none of it", async () => {
        const b = await business();
        const other = await business();
        await expect(
            other.inOrg(() =>
                approval.approve(
                    { ...other.reviewer },
                    b.site.id,
                    b.postId,
                    {},
                ),
            ),
        ).rejects.toThrow();
        await expect(
            other.inOrg(() =>
                approval.request(other.writer, b.site.id, b.postId, {}),
            ),
        ).rejects.toThrow();
    });
});
