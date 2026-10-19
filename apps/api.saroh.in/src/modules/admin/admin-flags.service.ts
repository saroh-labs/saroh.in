import { Injectable } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { FlagKey, FlagMetadata } from "../feature-flags/flags";
import { FLAG_KEYS, FLAG_METADATA } from "../feature-flags/flags";

/** One flag as the control plane sees it: the global default + who overrides it. */
export interface AdminFlagView {
    key: FlagKey;
    /** What it is for, who owns it, and when it should go (R16). */
    metadata: FlagMetadata;
    /**
     * The global default. `null` means NO FeatureFlag row exists yet — which is
     * not the same as `false`: the flag has never been configured, and
     * `isEnabled` fails closed for it. The distinction matters to an operator
     * deciding whether a rollout has been started at all. The first
     * organization override registers the row as `false` (with an audit row
     * saying so), because an override can't exist without it: from then on
     * the rollout has started, and the card reads "Off" plus that override.
     */
    enabledByDefault: boolean | null;
    overrides: {
        organizationId: string;
        organizationName: string;
        enabled: boolean;
    }[];
    /**
     * The newest change to it and who made it (the Releases table's last
     * column), or `null` when it has never changed.
     */
    lastChange: { at: Date; actorName: string | null } | null;
}

/** One change to a flag, with who made it and for which business, by name. */
export interface AdminFlagChange {
    id: string;
    organizationId: string | null;
    /** The business's name, or `null` for a global change (or one since deleted). */
    organizationName: string | null;
    previousValue: boolean | null;
    newValue: boolean;
    actorUserId: string;
    /** The operator's name, else their email; `null` if the account is gone. */
    actorName: string | null;
    reason: string | null;
    createdAt: Date;
}

const HISTORY_LIMIT = 20;

/**
 * The flag control surface for admin.saroh.in (S1-012, DEC feature-flags).
 *
 * Evaluation lives in `FeatureFlagService`; this is the operator's read model —
 * every registered key, whether it has been configured at all, and which
 * Organizations deviate from the default. It exists because until now the only
 * way to turn a flag on was hand-written SQL, which is a poor thing to do to a
 * production database during a rollout.
 */
@Injectable()
export class AdminFlagsService {
    async list(): Promise<AdminFlagView[]> {
        const [defaults, overrides] = await Promise.all([
            prisma.featureFlag.findMany({
                select: { key: true, enabledByDefault: true },
            }),
            prisma.featureFlagOverride.findMany({
                select: {
                    flagKey: true,
                    enabled: true,
                    organizationId: true,
                    organization: { select: { name: true } },
                },
            }),
        ]);

        const defaultByKey = new Map(
            defaults.map((row) => [row.key, row.enabledByDefault]),
        );
        const lastChange = await this.lastChanges();

        return FLAG_KEYS.map((key) => ({
            key,
            metadata: FLAG_METADATA[key],
            enabledByDefault: defaultByKey.get(key) ?? null,
            overrides: overrides
                .filter((row) => row.flagKey === key)
                .map((row) => ({
                    organizationId: row.organizationId,
                    organizationName: row.organization.name,
                    enabled: row.enabled,
                }))
                .sort((a, b) =>
                    a.organizationName.localeCompare(b.organizationName),
                ),
            lastChange: lastChange.get(key) ?? null,
        }));
    }

    /**
     * Each flag's newest ledger row and its author's name: one aggregate for
     * the newest time per flag, one read of those rows, one of the names.
     */
    private async lastChanges(): Promise<
        Map<string, { at: Date; actorName: string | null }>
    > {
        const newest = await prisma.featureFlagAudit.groupBy({
            by: ["flagKey"],
            _max: { createdAt: true },
        });
        const wanted = newest.flatMap((row) =>
            row._max.createdAt
                ? [{ flagKey: row.flagKey, createdAt: row._max.createdAt }]
                : [],
        );
        if (wanted.length === 0) return new Map();
        const rows = await prisma.featureFlagAudit.findMany({
            where: { OR: wanted },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: { flagKey: true, actorUserId: true, createdAt: true },
        });
        const names = await this.actorNames(rows.map((row) => row.actorUserId));
        const out = new Map<string, { at: Date; actorName: string | null }>();
        for (const row of rows) {
            // Two changes in the same instant: the first (highest id) wins.
            if (out.has(row.flagKey)) continue;
            out.set(row.flagKey, {
                at: row.createdAt,
                actorName: names.get(row.actorUserId) ?? null,
            });
        }
        return out;
    }

    /** The operator's name, else their email, by user id. */
    private async actorNames(ids: string[]): Promise<Map<string, string>> {
        const unique = [...new Set(ids)];
        if (unique.length === 0) return new Map();
        const users = await prisma.user.findMany({
            where: { id: { in: unique } },
            select: { id: true, name: true, email: true },
        });
        return new Map(
            users.map((user) => [
                user.id,
                user.name?.trim() ? user.name.trim() : user.email,
            ]),
        );
    }

    /**
     * The last changes to one flag, newest first, for the Releases screen's
     * History tab (R9). Read from the flag's own ledger, which `flags:read`
     * already opens: the platform audit list needs `audit:read`, which a
     * release manager does not hold. Names are joined here so the console
     * says who changed what, not two ids.
     */
    async history(key: FlagKey): Promise<AdminFlagChange[]> {
        const rows = await prisma.featureFlagAudit.findMany({
            where: { flagKey: key },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: HISTORY_LIMIT,
            select: {
                id: true,
                organizationId: true,
                previousValue: true,
                newValue: true,
                actorUserId: true,
                reason: true,
                createdAt: true,
            },
        });
        const actorIds = [...new Set(rows.map((row) => row.actorUserId))];
        const orgIds = [
            ...new Set(
                rows.flatMap((row) =>
                    row.organizationId ? [row.organizationId] : [],
                ),
            ),
        ];
        const [actors, organizations] = await Promise.all([
            actorIds.length > 0
                ? prisma.user.findMany({
                      where: { id: { in: actorIds } },
                      select: { id: true, name: true, email: true },
                  })
                : [],
            orgIds.length > 0
                ? prisma.organization.findMany({
                      where: { id: { in: orgIds } },
                      select: { id: true, name: true },
                  })
                : [],
        ]);
        const actorName = new Map(
            actors.map((user) => [
                user.id,
                user.name?.trim() ? user.name.trim() : user.email,
            ]),
        );
        const orgName = new Map(organizations.map((org) => [org.id, org.name]));
        return rows.map((row) => ({
            ...row,
            organizationName: row.organizationId
                ? (orgName.get(row.organizationId) ?? null)
                : null,
            actorName: actorName.get(row.actorUserId) ?? null,
        }));
    }

    /**
     * Organizations an operator can target with an override. Id + name only —
     * the flag surface has no business reading anything else about a tenant.
     */
    async targetableOrganizations(): Promise<
        { id: string; name: string; slug: string }[]
    > {
        return prisma.organization.findMany({
            select: { id: true, name: true, slug: true },
            orderBy: { name: "asc" },
        });
    }
}
