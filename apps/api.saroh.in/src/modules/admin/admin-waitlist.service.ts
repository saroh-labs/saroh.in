import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { WaitlistInvitesService } from "../waitlist/invites.service";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import { AdminPermission } from "./admin-permissions";

const PAGE_SIZE = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface WaitlistQuery {
    state?: "waiting" | "invited";
    source?: string;
    kind?: string;
    city?: string;
    country?: string;
    cursor?: string;
}

/** How many cities and referrers the summary names. */
const TOP_CITIES = 12;
const TOP_REFERRERS = 5;

/**
 * The waitlist (admin console U11, R17; marketing U30) — who is waiting,
 * what kind of business, from where and for how long, who sent them, and a
 * batch invite. `PRODUCT.md` makes this the gate on open signup, so the
 * invite is what opens the door, one batch at a time. Sending invites is an
 * admin operation (`waitlist.invite`, U31), not a call here.
 *
 * An entry is personal data (an email, a business, a city), so reading it
 * needs `waitlist:read`.
 */
@Injectable()
export class AdminWaitlistService {
    constructor(
        private readonly audit: AdminAuditService,
        private readonly invites: WaitlistInvitesService,
    ) {}

    async summary() {
        const now = Date.now();
        const waitingOnly = { invitedAt: null };
        const [
            waiting,
            invited,
            bySource,
            byKind,
            byCity,
            byCountry,
            referrers,
            oldest,
            lastWeek,
            joined,
        ] = await Promise.all([
            prisma.waitlistSignup.count({ where: waitingOnly }),
            prisma.waitlistSignup.count({
                where: { invitedAt: { not: null } },
            }),
            prisma.waitlistSignup.groupBy({
                by: ["source"],
                where: waitingOnly,
                _count: { _all: true },
                orderBy: { _count: { source: "desc" } },
            }),
            prisma.waitlistSignup.groupBy({
                by: ["kind"],
                where: waitingOnly,
                _count: { _all: true },
                orderBy: { _count: { kind: "desc" } },
            }),
            prisma.waitlistSignup.groupBy({
                by: ["city"],
                where: { ...waitingOnly, city: { not: null } },
                _count: { _all: true },
            }),
            prisma.waitlistSignup.groupBy({
                by: ["country"],
                where: waitingOnly,
                _count: { _all: true },
                orderBy: { _count: { country: "desc" } },
            }),
            prisma.waitlistSignup.groupBy({
                by: ["referredById"],
                where: { referredById: { not: null } },
                _count: { _all: true },
                orderBy: { _count: { referredById: "desc" } },
                take: TOP_REFERRERS,
            }),
            prisma.waitlistSignup.findFirst({
                where: waitingOnly,
                select: { createdAt: true },
                orderBy: { createdAt: "asc" },
            }),
            prisma.waitlistSignup.count({
                where: { createdAt: { gte: new Date(now - 7 * DAY_MS) } },
            }),
            prisma.waitlistSignup.count({ where: { joinedAt: { not: null } } }),
        ]);
        const referrerIds = referrers.flatMap((row) =>
            row.referredById ? [row.referredById] : [],
        );
        const referrerRows =
            referrerIds.length === 0
                ? []
                : await prisma.waitlistSignup.findMany({
                      where: { id: { in: referrerIds } },
                      select: { id: true, businessName: true, email: true },
                  });
        const byId = new Map(referrerRows.map((row) => [row.id, row]));
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
            byKind: byKind.map((row) => ({
                kind: row.kind,
                count: row._count._all,
            })),
            byCity: mergeCities(
                byCity.map((row) => ({
                    city: row.city ?? "",
                    count: row._count._all,
                })),
            ).slice(0, TOP_CITIES),
            // Null: joined before 5 Oct 2026, or the host didn't know.
            byCountry: byCountry.map((row) => ({
                country: row.country,
                count: row._count._all,
            })),
            topReferrers: referrers.flatMap((row) => {
                const who = row.referredById
                    ? byId.get(row.referredById)
                    : undefined;
                return who
                    ? [
                          {
                              id: who.id,
                              businessName: who.businessName,
                              email: who.email,
                              referrals: row._count._all,
                          },
                      ]
                    : [];
            }),
            // U31: invited people who made their business with the invite.
            joined,
            ...inviteState(this.invites.readiness()),
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
            ...(query.kind === "none"
                ? { kind: null }
                : query.kind
                  ? { kind: query.kind }
                  : {}),
            ...(query.city === "none"
                ? { city: null }
                : query.city
                  ? { city: { equals: query.city, mode: "insensitive" } }
                  : {}),
            ...(query.country === "none"
                ? { country: null }
                : query.country
                  ? { country: query.country.toUpperCase() }
                  : {}),
        };
        const rows = await prisma.waitlistSignup.findMany({
            where,
            select: {
                id: true,
                email: true,
                businessName: true,
                kind: true,
                city: true,
                country: true,
                plan: true,
                position: true,
                source: true,
                createdAt: true,
                invitedAt: true,
                inviteSentAt: true,
                joinedAt: true,
                _count: { select: { referrals: true } },
            },
            ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
            take: PAGE_SIZE + 1,
            // Oldest first: the people who have waited longest are invited first.
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
        const hasMore = rows.length > PAGE_SIZE;
        const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
        return {
            items: page.map(({ _count, ...row }) => ({
                ...row,
                referrals: _count.referrals,
            })),
            nextCursor: hasMore ? page[page.length - 1]?.id : undefined,
        };
    }

    /**
     * Delete one entry because its owner asked (plan KTD-17). Audited by id
     * and reason only — the address is what was asked to go. Anyone this
     * entry referred stays on the list, credited to nobody.
     */
    async remove(staff: PlatformAdminInfo, id: string, reason: string) {
        const why = reason.trim();
        if (why.length < 4)
            throw new BadRequestException("Give a reason for removing them.");
        const { count } = await prisma.waitlistSignup.deleteMany({
            where: { id },
        });
        if (count === 0) throw new NotFoundException("Not on the waitlist");
        await this.audit.write(prisma, {
            actorUserId: staff.userId,
            permission: AdminPermission.WaitlistInvite,
            action: "waitlist.removed",
            targetType: "waitlist",
            targetId: id,
            reason: why,
            outcome: AdminAuditOutcome.Success,
        });
        return { removed: true };
    }
}

/**
 * Whether invites can go (U31), and when not, why — the console says it
 * rather than offering a button that would refuse.
 */
function inviteState(
    readiness: ReturnType<WaitlistInvitesService["readiness"]>,
): { canInvite: boolean; inviteBlocker: string | null } {
    return readiness.ready
        ? { canInvite: true, inviteBlocker: null }
        : { canInvite: false, inviteBlocker: readiness.reason };
}

/**
 * Cities as typed, counted together whatever their case ("Pune", "pune"),
 * under the spelling most people used; biggest first.
 */
export function mergeCities(
    rows: { city: string; count: number }[],
): { city: string; count: number }[] {
    const merged = new Map<
        string,
        { count: number; spellings: Map<string, number> }
    >();
    for (const row of rows) {
        const key = row.city.trim().toLowerCase();
        if (!key) continue;
        const entry = merged.get(key) ?? { count: 0, spellings: new Map() };
        entry.count += row.count;
        entry.spellings.set(
            row.city.trim(),
            (entry.spellings.get(row.city.trim()) ?? 0) + row.count,
        );
        merged.set(key, entry);
    }
    return [...merged.values()]
        .map((entry) => ({
            city: bestSpelling(entry.spellings),
            count: entry.count,
        }))
        .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
}

/** The spelling most people used; on a tie, a capitalised one ("Pune"). */
function bestSpelling(spellings: Map<string, number>): string {
    let best = "";
    let bestCount = -1;
    for (const [spelling, count] of spellings) {
        const capitalised = /^\p{Lu}/u.test(spelling);
        const bestCapitalised = /^\p{Lu}/u.test(best);
        if (
            count > bestCount ||
            (count === bestCount && capitalised && !bestCapitalised) ||
            (count === bestCount &&
                capitalised === bestCapitalised &&
                spelling.localeCompare(best) < 0)
        ) {
            best = spelling;
            bestCount = count;
        }
    }
    return best;
}
