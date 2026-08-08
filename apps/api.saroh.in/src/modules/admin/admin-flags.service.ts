import { Injectable } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { FlagKey } from "../feature-flags/flags";
import { FLAG_KEYS } from "../feature-flags/flags";

/** One flag as the control plane sees it: the global default + who overrides it. */
export interface AdminFlagView {
    key: FlagKey;
    /**
     * The global default. `null` means NO FeatureFlag row exists yet — which is
     * not the same as `false`: the flag has never been configured, and
     * `isEnabled` fails closed for it. The distinction matters to an operator
     * deciding whether a rollout has been started at all.
     */
    enabledByDefault: boolean | null;
    overrides: {
        organizationId: string;
        organizationName: string;
        enabled: boolean;
    }[];
}

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

        return FLAG_KEYS.map((key) => ({
            key,
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
