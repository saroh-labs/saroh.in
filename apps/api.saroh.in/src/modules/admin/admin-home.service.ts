import { Injectable } from "@nestjs/common";
import { outsideOrgContext, prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import type { AdminPermission } from "./admin-permissions";
import { AdminPermission as P } from "./admin-permissions";

/**
 * The console's Home (admin console redesign U10, R14): what needs a person
 * now, and a few counts. Counts and dates only: no business's records, no
 * name, no email. Each kind is in the answer only for staff whose
 * permissions reach the screen that fixes it, so a row never leads to a
 * page that refuses them.
 */

/** The kinds of thing Home lists, in the order it lists them. */
export const NEEDS_KINDS = [
    "billing",
    "reports",
    "help",
    "sign-ups",
    "jobs",
] as const;
export type NeedsKind = (typeof NEEDS_KINDS)[number];

/** The permission that reaches each kind's fix. */
export const NEEDS_PERMISSION: Record<NeedsKind, AdminPermission> = {
    // Needs action on Billing.
    billing: P.SarohBillingRead,
    // Customers' reports about a business.
    reports: P.OrganizationRead,
    // Messages: every row is a person's name and email.
    help: P.OrganizationPiiRead,
    // Users: the list is personal data.
    "sign-ups": P.OrganizationPiiRead,
    // Jobs.
    jobs: P.JobsRead,
};

export interface NeedsYouItem {
    kind: NeedsKind;
    count: number;
    /** The oldest one still waiting, or for help and jobs the newest. */
    at: string | null;
}

export interface ConsoleHome {
    /** Only kinds with something waiting; empty is the all-clear. */
    needs: NeedsYouItem[];
    /** The kinds this person's permissions let Home look at. */
    checked: NeedsKind[];
    counts: {
        businesses: number;
        businessesThisWeek: number;
        /** People with an account and no business yet. */
        noBusinessYet: number;
        /** Subscriptions on ACTIVE; null without `saroh-billing:read`. */
        paying: number | null;
        /** Jobs that failed for good in the last day; null without `jobs:read`. */
        jobsFailedToday: number | null;
    };
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** How far back a help message or a failed job still needs someone. */
export const RECENT_DAYS = 7;
/**
 * A sign-up is stuck once a day has passed with no verified email and no
 * business, and is still Home's to show for a month after.
 */
export const STUCK_AFTER_MS = DAY_MS;
export const STUCK_FOR_DAYS = 30;

@Injectable()
export class AdminHomeService {
    async home(
        staff: Pick<PlatformAdminInfo, "permissions">,
        now: Date = new Date(),
    ): Promise<ConsoleHome> {
        const may = (permission: AdminPermission) =>
            staff.permissions.includes(permission);
        const checked = NEEDS_KINDS.filter((kind) =>
            may(NEEDS_PERMISSION[kind]),
        );
        const recent = new Date(now.getTime() - RECENT_DAYS * DAY_MS);
        const stuckFrom = new Date(now.getTime() - STUCK_FOR_DAYS * DAY_MS);
        const stuckUntil = new Date(now.getTime() - STUCK_AFTER_MS);
        const week = new Date(now.getTime() - 7 * DAY_MS);
        const day = new Date(now.getTime() - DAY_MS);

        // Across every business, by design: no organization context.
        return outsideOrgContext(async () => {
            const items = await Promise.all(
                checked.map((kind) =>
                    this.needs(kind, { recent, stuckFrom, stuckUntil }),
                ),
            );
            const [
                businesses,
                businessesThisWeek,
                noBusinessYet,
                paying,
                jobsFailedToday,
            ] = await Promise.all([
                prisma.organization.count(),
                prisma.organization.count({
                    where: { createdAt: { gte: week } },
                }),
                prisma.user.count({ where: { memberships: { none: {} } } }),
                may(P.SarohBillingRead)
                    ? prisma.subscription.count({
                          where: { status: "ACTIVE" },
                      })
                    : Promise.resolve(null),
                may(P.JobsRead)
                    ? prisma.job.count({
                          where: {
                              status: "FAILED",
                              processedAt: { gte: day },
                          },
                      })
                    : Promise.resolve(null),
            ]);
            return {
                needs: items.filter((item) => item.count > 0),
                checked,
                counts: {
                    businesses,
                    businessesThisWeek,
                    noBusinessYet,
                    paying,
                    jobsFailedToday,
                },
            };
        });
    }

    private async needs(
        kind: NeedsKind,
        at: { recent: Date; stuckFrom: Date; stuckUntil: Date },
    ): Promise<NeedsYouItem> {
        switch (kind) {
            case "billing": {
                const where = { resolvedAt: null };
                const [count, oldest] = await Promise.all([
                    prisma.billingAction.count({ where }),
                    prisma.billingAction.findFirst({
                        where,
                        orderBy: { createdAt: "asc" },
                        select: { createdAt: true },
                    }),
                ]);
                return item(kind, count, oldest?.createdAt);
            }
            case "reports": {
                const where = { status: "OPEN" as const };
                const [count, oldest] = await Promise.all([
                    prisma.businessReport.count({ where }),
                    prisma.businessReport.findFirst({
                        where,
                        orderBy: { createdAt: "asc" },
                        select: { createdAt: true },
                    }),
                ]);
                return item(kind, count, oldest?.createdAt);
            }
            case "help": {
                const where = {
                    topic: "help",
                    createdAt: { gte: at.recent },
                };
                const [count, newest] = await Promise.all([
                    prisma.contactMessage.count({ where }),
                    prisma.contactMessage.findFirst({
                        where,
                        orderBy: { createdAt: "desc" },
                        select: { createdAt: true },
                    }),
                ]);
                return item(kind, count, newest?.createdAt);
            }
            case "sign-ups": {
                const where = {
                    emailVerified: false,
                    memberships: { none: {} },
                    createdAt: { gte: at.stuckFrom, lte: at.stuckUntil },
                };
                const [count, oldest] = await Promise.all([
                    prisma.user.count({ where }),
                    prisma.user.findFirst({
                        where,
                        orderBy: { createdAt: "asc" },
                        select: { createdAt: true },
                    }),
                ]);
                return item(kind, count, oldest?.createdAt);
            }
            case "jobs": {
                const where = {
                    status: "FAILED",
                    processedAt: { gte: at.recent },
                };
                const [count, newest] = await Promise.all([
                    prisma.job.count({ where }),
                    prisma.job.findFirst({
                        where,
                        orderBy: { processedAt: "desc" },
                        select: { processedAt: true },
                    }),
                ]);
                return item(kind, count, newest?.processedAt);
            }
        }
    }
}

function item(
    kind: NeedsKind,
    count: number,
    at: Date | null | undefined,
): NeedsYouItem {
    return { kind, count, at: at ? at.toISOString() : null };
}
