import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { authorize } from "../organizations/organization-policy";
import type { ChangeVerdict } from "../sites/change-approvals";
import { recordUnitVerdicts } from "../sites/change-approvals";
import { queueReviewAlert } from "../sites/review-alert-queue";
import { assertSiteInOrg } from "../sites/site-access";
import { SCHEDULE_MIN_AHEAD_MS } from "../sites/test-release-schedule";
import type {
    ApprovePostDto,
    AskPostChangesDto,
    PostApprovalRequestDto,
} from "./dto";
import { postApprovalUnit } from "./post-approval";
import { assertPostEditable } from "./post-paused";
import { publishPostInTx } from "./post-publish";
import {
    REVISION_FIELDS,
    revisionStateOf,
    writeRevision,
} from "./post-revisions";
import { clearPostScheduleInTx, schedulePostInTx } from "./post-schedule";

export const POST_CHANGED_MESSAGE =
    "The post changed since you opened it. Read it again, then approve it.";

/**
 * Send for approval, Approve and Ask for changes on a post (O7,
 * `post-approval.ts`). Sending is the writer's (`section:write`); a verdict
 * is `site:approve` (a reviewer of the site, an admin, the owner), never by
 * the post's last editor (403). Approving publishes the post now, or leaves
 * it for the day the writer picked, when `post.go_live` publishes it.
 */
@Injectable()
export class PostApprovalService {
    async request(
        ctx: OrganizationContext,
        siteId: string,
        postId: string,
        dto: PostApprovalRequestDto,
        now: Date = new Date(),
    ) {
        authorize(ctx, "section:write");
        await assertSiteInOrg(ctx, siteId);
        const at = dto.at ? new Date(dto.at) : null;
        if (at && at.getTime() < now.getTime() + SCHEDULE_MIN_AHEAD_MS) {
            throw new BadRequestException({
                message:
                    "Pick a time at least 5 minutes from now, or send it to go live as soon as it is approved.",
                field: "at",
            });
        }
        await assertPostEditable(ctx.organizationId, postId);
        return prisma.$transaction(async (tx) => {
            const post = await this.postIn(tx, siteId, postId);
            const sent = await writeRevision(tx, {
                organizationId: ctx.organizationId,
                postId,
                state: revisionStateOf(post),
                reason: "sent",
                savedByUserId: ctx.userId,
                note: dto.note ?? null,
            });
            // "On a day I pick": the job publishes it then, if approved.
            if (at) {
                await schedulePostInTx(tx, {
                    organizationId: ctx.organizationId,
                    postId,
                    at,
                    byUserId: ctx.userId,
                });
            } else if (post.scheduledAt) {
                await clearPostScheduleInTx(tx, postId);
            }
            await queueReviewAlert(tx, ctx.organizationId, {
                event: "review",
                about: "post",
                revisionId: sent.id,
            });
            return { id: postId, scheduledAt: at };
        });
    }

    /** Approve: published now, or on the writer's day if that is ahead. */
    async approve(
        ctx: OrganizationContext,
        siteId: string,
        postId: string,
        dto: ApprovePostDto,
        now: Date = new Date(),
    ) {
        authorize(ctx, "site:approve");
        await assertSiteInOrg(ctx, siteId);
        await assertPostEditable(ctx.organizationId, postId);
        return prisma.$transaction(async (tx) => {
            const post = await this.verdict(tx, ctx, siteId, postId, {
                outcome: "APPROVED",
                fingerprint: dto.fingerprint,
                at: now,
            });
            if (post.scheduledAt && post.scheduledAt > now) {
                return { published: false, scheduledAt: post.scheduledAt };
            }
            const live = await publishPostInTx(tx, {
                organizationId: ctx.organizationId,
                siteId,
                postId,
                actorUserId: ctx.userId,
                now,
            });
            if (!live) throw new NotFoundException("Post not found");
            return { published: true, path: live.path, scheduledAt: null };
        });
    }

    /** Ask for changes, with a reason; tells the post's last editor. */
    async askForChanges(
        ctx: OrganizationContext,
        siteId: string,
        postId: string,
        dto: AskPostChangesDto,
    ) {
        authorize(ctx, "site:approve");
        await assertSiteInOrg(ctx, siteId);
        await prisma.$transaction((tx) =>
            this.verdict(tx, ctx, siteId, postId, {
                outcome: "CHANGES_REQUESTED",
                reason: dto.reason,
                fingerprint: dto.fingerprint,
            }),
        );
        return { id: postId };
    }

    private async verdict(
        tx: Prisma.TransactionClient,
        ctx: OrganizationContext,
        siteId: string,
        postId: string,
        input: {
            outcome: ChangeVerdict;
            reason?: string;
            fingerprint?: string;
            at?: Date;
        },
    ) {
        const post = await this.postIn(tx, siteId, postId);
        const state = revisionStateOf(post);
        const unit = await postApprovalUnit(tx, postId, state);
        if (input.fingerprint && input.fingerprint !== unit.fingerprint) {
            throw new ConflictException({
                message: POST_CHANGED_MESSAGE,
                details: { reason: "postChanged" },
            });
        }
        await recordUnitVerdicts(tx, ctx, {
            siteId,
            units: [unit],
            keys: [unit.key],
            outcome: input.outcome,
            reason: input.reason,
        });
        if (input.outcome === "APPROVED") {
            await writeRevision(tx, {
                organizationId: ctx.organizationId,
                postId,
                state,
                reason: "approved",
                savedByUserId: ctx.userId,
                at: input.at,
            });
        }
        return post;
    }

    private async postIn(
        tx: Prisma.TransactionClient,
        siteId: string,
        postId: string,
    ) {
        const post = await tx.post.findFirst({
            where: { id: postId, siteId },
            select: { ...REVISION_FIELDS, scheduledAt: true },
        });
        if (!post) throw new NotFoundException("Post not found");
        return post;
    }
}
