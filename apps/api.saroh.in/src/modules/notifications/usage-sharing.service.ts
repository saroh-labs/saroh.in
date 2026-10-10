import { Injectable } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { UpdateUsageSharingDto } from "./usage-sharing.dto";

/**
 * "Help improve Saroh": the signed-in person's own choice to share how they
 * use the workspace (DEC-125), Settings › Your profile.
 *
 * It is the person's, not the business's: stored on their user row, so it
 * is the same in every business they belong to and on every device. `null`
 * means they have never chosen; the workspace reads that as yes only where
 * session recording is switched on at all, and as nothing where it is not.
 * `false` is a refusal, and the recorder never starts for them anywhere.
 *
 * Beside it, `noticeSeenAt`: when they dismissed the workspace's one-time
 * notice that says how it is recorded (10 Oct). `null` until they do; the
 * workspace shows the notice then, and records nothing before it has.
 *
 * Only ever the session's own user (`ctx.userId`): there is no id to pass.
 */
export interface UsageSharingView {
    sharesUsage: boolean | null;
    /** ISO time, or null while the notice is still to be dismissed. */
    noticeSeenAt: string | null;
}

const VIEW = { sharesUsage: true, usageNoticeSeenAt: true } as const;

function viewOf(
    user: {
        sharesUsage: boolean | null;
        usageNoticeSeenAt: Date | null;
    } | null,
): UsageSharingView {
    return {
        sharesUsage: user?.sharesUsage ?? null,
        noticeSeenAt: user?.usageNoticeSeenAt?.toISOString() ?? null,
    };
}

@Injectable()
export class UsageSharingService {
    async read(ctx: OrganizationContext): Promise<UsageSharingView> {
        const user = await prisma.user.findUnique({
            where: { id: ctx.userId },
            select: VIEW,
        });
        return viewOf(user);
    }

    async update(
        ctx: OrganizationContext,
        dto: UpdateUsageSharingDto,
    ): Promise<UsageSharingView> {
        const user = await prisma.user.update({
            where: { id: ctx.userId },
            data: { sharesUsage: dto.sharesUsage },
            select: VIEW,
        });
        return viewOf(user);
    }

    /**
     * They dismissed the notice. Kept once: a second dismissal (another tab,
     * a slow connection) leaves the first time as it was.
     */
    async noticeSeen(
        ctx: OrganizationContext,
        now: Date = new Date(),
    ): Promise<UsageSharingView> {
        await prisma.user.updateMany({
            where: { id: ctx.userId, usageNoticeSeenAt: null },
            data: { usageNoticeSeenAt: now },
        });
        return this.read(ctx);
    }
}
