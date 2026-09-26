import { BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { sendWaitlistInvitationEmail } from "../../common/email";
import { env } from "../../env";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import { AdminPermission } from "./admin-permissions";

const PAGE_SIZE = 50;
const MAX_BATCH = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface WaitlistQuery {
    state?: "waiting" | "invited";
    source?: string;
    cursor?: string;
}

/**
 * The waitlist (admin console U11, R17) — who is waiting, from where and for
 * how long, and a batch invite. `PRODUCT.md` makes this the gate on open
 * signup, so the invite is what opens the door, one batch at a time.
 *
 * A signup is personal data (an email address and nothing else), so reading
 * it needs `organization:pii:read` on top of platform read.
 */
@Injectable()
export class AdminWaitlistService {
    constructor(private readonly audit: AdminAuditService) {}

    async summary() {
        const now = Date.now();
        const [waiting, invited, bySource, oldest, lastWeek] =
            await Promise.all([
                prisma.waitlistSignup.count({ where: { invitedAt: null } }),
                prisma.waitlistSignup.count({
                    where: { invitedAt: { not: null } },
                }),
                prisma.waitlistSignup.groupBy({
                    by: ["source"],
                    where: { invitedAt: null },
                    _count: { _all: true },
                    orderBy: { _count: { source: "desc" } },
                }),
                prisma.waitlistSignup.findFirst({
                    where: { invitedAt: null },
                    select: { createdAt: true },
                    orderBy: { createdAt: "asc" },
                }),
                prisma.waitlistSignup.count({
                    where: { createdAt: { gte: new Date(now - 7 * DAY_MS) } },
                }),
            ]);
        return {
            waiting,
            invited,
            joinedLastWeek: lastWeek,
            oldestWaitingDays: oldest
                ? Math.floor((now - oldest.createdAt.getTime()) / DAY_MS)
                : 0,
            bySource: bySource.map((row) => ({
                source: row.source,
                count: row._count._all,
            })),
            canInvite: this.signupUrl() !== null,
        };
    }

    async list(query: WaitlistQuery) {
        const where: Prisma.WaitlistSignupWhereInput = {
            ...(query.state === "invited"
                ? { invitedAt: { not: null } }
                : { invitedAt: null }),
            ...(query.source === "none"
                ? { source: null }
                : query.source
                  ? { source: query.source }
                  : {}),
        };
        const rows = await prisma.waitlistSignup.findMany({
            where,
            select: {
                id: true,
                email: true,
                source: true,
                createdAt: true,
                invitedAt: true,
            },
            ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
            take: PAGE_SIZE + 1,
            // Oldest first: the people who have waited longest are invited first.
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
        const hasMore = rows.length > PAGE_SIZE;
        const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
        return {
            items,
            nextCursor: hasMore ? items[items.length - 1]?.id : undefined,
        };
    }

    /**
     * Invite a batch. Each signup is claimed (invitedAt set where it was
     * null) before its email goes, so inviting twice — a double click, two
     * operators — sends nobody a second email. A send that fails is released
     * again, so that person is still waiting rather than falsely invited.
     */
    async invite(staff: PlatformAdminInfo, ids: string[], reason: string) {
        const why = reason.trim();
        if (why.length < 4)
            throw new BadRequestException("Give a reason for this batch.");
        const targets = [...new Set(ids)];
        if (targets.length === 0)
            throw new BadRequestException("Choose at least one person.");
        if (targets.length > MAX_BATCH) {
            throw new BadRequestException(
                `A batch is at most ${MAX_BATCH} people.`,
            );
        }
        const signupUrl = this.signupUrl();
        if (!signupUrl) {
            throw new BadRequestException(
                "This instance does not know where people sign up. Set ACCOUNTS_URL, then invite.",
            );
        }

        const signups = await prisma.waitlistSignup.findMany({
            where: { id: { in: targets } },
            select: { id: true, email: true, invitedAt: true },
        });

        let sent = 0;
        let alreadyInvited = 0;
        const failed: string[] = [];
        for (const signup of signups) {
            const now = new Date();
            const claimed = await prisma.waitlistSignup.updateMany({
                where: { id: signup.id, invitedAt: null },
                data: { invitedAt: now },
            });
            if (claimed.count === 0) {
                alreadyInvited += 1;
                continue;
            }
            const url = `${signupUrl}?email=${encodeURIComponent(signup.email)}`;
            const outcome = await sendWaitlistInvitationEmail(
                signup.email,
                url,
            );
            if (outcome === "sent") {
                sent += 1;
            } else {
                await prisma.waitlistSignup.updateMany({
                    where: { id: signup.id, invitedAt: now },
                    data: { invitedAt: null },
                });
                failed.push(signup.id);
            }
        }

        await this.audit.write(prisma, {
            actorUserId: staff.userId,
            permission: AdminPermission.OrganizationPiiRead,
            action: "waitlist.invited",
            targetType: "waitlist",
            reason: why,
            outcome:
                failed.length === 0
                    ? AdminAuditOutcome.Success
                    : AdminAuditOutcome.Failure,
            metadata: {
                requested: targets.length,
                sent,
                alreadyInvited,
                failed: failed.length,
                notFound: targets.length - signups.length,
            },
        });

        return {
            sent,
            alreadyInvited,
            failed: failed.length,
            notFound: targets.length - signups.length,
        };
    }

    /** Where an invitee creates their account, or null when this instance cannot say. */
    private signupUrl(): string | null {
        const base =
            env.ACCOUNTS_URL ??
            (env.NODE_ENV === "development"
                ? "https://accounts.saroh.localhost"
                : undefined);
        return base ? `${base.replace(/\/$/, "")}/signup` : null;
    }
}
