/**
 * F16 — storefront people join the team (DEC-048, amended 2026-09-27).
 *
 * A storefront's "People who work on it" (`StoreMembers`) and the business's
 * Team were two rosters. Now there is one underneath: anyone on a
 * storefront also holds a `Membership` in the storefront's business. Not as
 * a Member — a Member reads every customer's contact details and the whole
 * diary, so a Viewer of one shop would gain the business's customer list
 * without anyone choosing it — but in the narrow **"Storefront team"** role:
 * the org, team, module, media, storefront and review reads, their own
 * storefronts' orders without the money (DEC-074), and nothing about
 * customers, bookings or money. What they do inside their
 * storefront still comes from their storefront role, exactly as before.
 *
 * `joinTeamFromStorefront` is the one rule. The API runs it when a
 * storefront invitation is accepted (`members/members.service.ts`), and the
 * backfill below runs it for every storefront member without a membership.
 * It never touches a membership that exists: an existing role is never
 * lowered or replaced. Each membership it makes writes an Activity entry
 * ("added to the team as Storefront team, from Hill Road") in the same
 * transaction.
 *
 * "Storefront team" is an ordinary custom role (`OrganizationRole`, key
 * `storefront-team`), made on first use in each business. The owner can
 * widen it or move someone off it on purpose; while anyone holds it, the
 * role editor refuses to delete it, so nobody falls back to the Member
 * bundle.
 *
 * Run: `pnpm --filter @saroh/database exec tsx src/backfill/store-members-to-memberships.cli.ts`
 */
import type { Prisma, PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/** The role's key, stable across businesses; `Membership.role` holds it. */
export const STOREFRONT_TEAM_ROLE_KEY = "storefront-team";
/** What Team calls it until the owner renames it. */
export const STOREFRONT_TEAM_ROLE_LABEL = "Storefront team";
/**
 * What the role holds when it is made: enough to appear on Team and open the
 * storefronts, and nothing about customers, bookings or money. No
 * `contact:read`, `booking:read` or `service:read` — the read-only floor's
 * diary — so it is narrower than Member. The API's
 * `organizations/storefront-team-role.ts` checks each is a real action.
 *
 * `order:stage` (DEC-074): the kitchen's view of an order, with no money,
 * and moving its stage — which the API narrows to the orders of the
 * storefronts the person works on (`orders/order-location.ts`). The
 * migration `20261019120000_storefront_team_orders` gave it to every
 * business's role made before.
 */
export const STOREFRONT_TEAM_ACTIONS: readonly string[] = [
    "org:read",
    "member:read",
    "module:read",
    "media:read",
    "store:read",
    "product-review:read",
    "order:stage",
];
/** The Activity entry each membership made this way writes. */
export const STOREFRONT_JOIN_AUDIT_ACTION = "membership.storefront-join";

/** How someone came to the team from a storefront. */
export type StorefrontJoinSource = "invite" | "backfill";

/** What joining did: made a membership, or found one already there. */
export type StorefrontJoinOutcome = "joined" | "already-on-team";

/**
 * The business's "Storefront team" role, made with the narrow list when it
 * has none. A role that exists is returned as it is — the owner may have
 * widened it on purpose.
 */
export async function ensureStorefrontTeamRole(
    tx: Tx,
    organizationId: string,
): Promise<{ key: string; actions: string[] }> {
    return tx.organizationRole.upsert({
        where: {
            organizationId_key: {
                organizationId,
                key: STOREFRONT_TEAM_ROLE_KEY,
            },
        },
        create: {
            organizationId,
            key: STOREFRONT_TEAM_ROLE_KEY,
            label: STOREFRONT_TEAM_ROLE_LABEL,
            actions: [...STOREFRONT_TEAM_ACTIONS],
            // The ring every invented role wears (organization-roles.service).
            ringTone: "neutral",
        },
        update: {},
        select: { key: true, actions: true },
    });
}

/**
 * Put someone who works on a storefront on its business's team, as
 * "Storefront team", unless they are on it already in any role.
 *
 * Run inside the caller's transaction, beside the write that gave them the
 * storefront role. The Activity entry is written in it too, so a membership
 * never exists without the entry that tells the owner about it.
 */
export async function joinTeamFromStorefront(
    tx: Tx,
    input: {
        organizationId: string;
        userId: string;
        store: { id: string; name: string };
        source: StorefrontJoinSource;
        /** Who acted: the person accepting, or the person themselves for the backfill. */
        actorUserId: string;
    },
): Promise<StorefrontJoinOutcome> {
    const { organizationId, userId } = input;
    const existing = await tx.membership.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
        select: { id: true },
    });
    if (existing) return "already-on-team";

    await ensureStorefrontTeamRole(tx, organizationId);
    // Never an upsert: a membership made meanwhile keeps its role.
    const { count } = await tx.membership.createMany({
        data: [{ organizationId, userId, role: STOREFRONT_TEAM_ROLE_KEY }],
        skipDuplicates: true,
    });
    if (count === 0) return "already-on-team";

    await tx.auditEvent.create({
        data: {
            action: STOREFRONT_JOIN_AUDIT_ACTION,
            actorUserId: input.actorUserId,
            organizationId,
            targetType: "membership",
            targetId: userId,
            outcome: "SUCCESS",
            // The storefront's name is the business's own; no one's details.
            metadata: {
                role: STOREFRONT_TEAM_ROLE_KEY,
                storeId: input.store.id,
                storefront: input.store.name,
                source: input.source,
            },
        },
    });
    return "joined";
}

/** What the backfill did, in counts only. */
export interface StorefrontTeamBackfillReport {
    /** Businesses with at least one storefront member. */
    organizations: number;
    /** Distinct people on a storefront, per business. */
    people: number;
    /** Memberships made, as Storefront team. */
    joined: number;
    /** Already on the team, in whatever role; left as they are. */
    alreadyOnTeam: number;
    /**
     * Businesses left alone because their existing "storefront-team" role
     * holds more than the narrow list — joining it would widen someone.
     */
    skippedOrganizations: number;
}

/**
 * Give every storefront member without a membership in the storefront's
 * business one, as Storefront team. Idempotent: a second run finds everyone
 * on the team and changes nothing.
 *
 * One transaction per business. A person on two storefronts of one business
 * gets one membership, and the entry names the storefront they joined first.
 * A storefront that has been closed (`deletedAt`) adds nobody.
 */
export async function backfillStoreMembersToMemberships(
    prisma: PrismaClient,
): Promise<StorefrontTeamBackfillReport> {
    const rows = await prisma.storeMembers.findMany({
        where: { store: { deletedAt: null } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
            userId: true,
            store: { select: { id: true, name: true, organizationId: true } },
        },
    });

    // organizationId → userId → the first storefront they were on.
    const byOrg = new Map<string, Map<string, { id: string; name: string }>>();
    for (const row of rows) {
        const people =
            byOrg.get(row.store.organizationId) ??
            new Map<string, { id: string; name: string }>();
        if (!people.has(row.userId)) {
            people.set(row.userId, { id: row.store.id, name: row.store.name });
        }
        byOrg.set(row.store.organizationId, people);
    }

    const report: StorefrontTeamBackfillReport = {
        organizations: byOrg.size,
        people: 0,
        joined: 0,
        alreadyOnTeam: 0,
        skippedOrganizations: 0,
    };
    const narrow = new Set(STOREFRONT_TEAM_ACTIONS);

    for (const [organizationId, people] of Array.from(byOrg.entries())) {
        report.people += people.size;
        const role = await prisma.organizationRole.findUnique({
            where: {
                organizationId_key: {
                    organizationId,
                    key: STOREFRONT_TEAM_ROLE_KEY,
                },
            },
            select: { actions: true },
        });
        // A business that already made a role with this key and gave it
        // more: nobody is put in it by a backfill they never chose.
        if (role?.actions.some((a) => !narrow.has(a))) {
            report.skippedOrganizations += 1;
            continue;
        }
        await prisma.$transaction(async (tx) => {
            for (const [userId, store] of Array.from(people.entries())) {
                const outcome = await joinTeamFromStorefront(tx, {
                    organizationId,
                    userId,
                    store,
                    source: "backfill",
                    actorUserId: userId,
                });
                if (outcome === "joined") report.joined += 1;
                else report.alreadyOnTeam += 1;
            }
        });
    }
    return report;
}
