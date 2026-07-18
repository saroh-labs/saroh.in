import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { FlagKey } from "./flags";
import { FLAG_KEYS, isKnownFlagKey } from "./flags";

/** Effective value of a flag, plus how it was resolved. */
export interface EffectiveFlag {
    key: FlagKey;
    enabled: boolean;
    /** Where the value came from: an org override, the global default, or the
     * fail-closed fallback for an unregistered/unseeded flag. */
    source: "override" | "default" | "fallback";
}

/**
 * Server-side feature-flag evaluation and management (S1-012).
 *
 * Evaluation is server-only — flag state is never taken from client input.
 * Resolution precedence for a flag is: Organization override > global
 * `enabledByDefault` > false. Every mutation writes an immutable
 * FeatureFlagAudit row in the same transaction as the upsert.
 */
@Injectable()
export class FeatureFlagService {
    private readonly logger = new Logger(FeatureFlagService.name);

    /**
     * Resolve a flag for an optional organization.
     * Precedence: org override (if present) > global default > false.
     * Unknown keys fail closed to false and log a warning.
     */
    async isEnabled(key: FlagKey, organizationId?: string): Promise<boolean> {
        if (!isKnownFlagKey(key)) {
            this.logger.warn(
                `isEnabled called with unknown flag key "${String(key)}" — defaulting to false`,
            );
            return false;
        }

        if (organizationId) {
            const override = await prisma.featureFlagOverride.findUnique({
                where: {
                    flagKey_organizationId: { flagKey: key, organizationId },
                },
                select: { enabled: true },
            });
            if (override) {
                return override.enabled;
            }
        }

        const flag = await prisma.featureFlag.findUnique({
            where: { key },
            select: { enabledByDefault: true },
        });
        if (!flag) {
            // Registered in code but not yet seeded in the DB — fail closed.
            this.logger.warn(
                `Flag "${key}" has no global definition row — defaulting to false`,
            );
            return false;
        }

        return flag.enabledByDefault;
    }

    /**
     * Create or update the global default for a flag and append an audit row,
     * atomically.
     */
    async setGlobal(
        key: FlagKey,
        enabledByDefault: boolean,
        actorUserId: string,
    ): Promise<void> {
        await prisma.$transaction(async (tx) => {
            const existing = await tx.featureFlag.findUnique({
                where: { key },
                select: { enabledByDefault: true },
            });

            await tx.featureFlag.upsert({
                where: { key },
                create: { key, enabledByDefault },
                update: { enabledByDefault },
            });

            await tx.featureFlagAudit.create({
                data: {
                    flagKey: key,
                    organizationId: null,
                    previousValue: existing?.enabledByDefault ?? null,
                    newValue: enabledByDefault,
                    actorUserId,
                },
            });
        });
    }

    /**
     * Create or update an Organization's override for a flag and append an
     * audit row, atomically.
     */
    async setOverride(
        key: FlagKey,
        organizationId: string,
        enabled: boolean,
        actorUserId: string,
    ): Promise<void> {
        await prisma.$transaction(async (tx) => {
            const existing = await tx.featureFlagOverride.findUnique({
                where: {
                    flagKey_organizationId: { flagKey: key, organizationId },
                },
                select: { enabled: true },
            });

            await tx.featureFlagOverride.upsert({
                where: {
                    flagKey_organizationId: { flagKey: key, organizationId },
                },
                create: { flagKey: key, organizationId, enabled },
                update: { enabled },
            });

            await tx.featureFlagAudit.create({
                data: {
                    flagKey: key,
                    organizationId,
                    previousValue: existing?.enabled ?? null,
                    newValue: enabled,
                    actorUserId,
                },
            });
        });
    }

    /**
     * Effective values for every registered flag, resolved for the optional
     * organization (override > default > false).
     */
    async list(organizationId?: string): Promise<EffectiveFlag[]> {
        const [defaults, overrides] = await Promise.all([
            prisma.featureFlag.findMany({
                select: { key: true, enabledByDefault: true },
            }),
            organizationId
                ? prisma.featureFlagOverride.findMany({
                      where: { organizationId },
                      select: { flagKey: true, enabled: true },
                  })
                : Promise.resolve(
                      [] as { flagKey: string; enabled: boolean }[],
                  ),
        ]);

        const defaultByKey = new Map(
            defaults.map((d) => [d.key, d.enabledByDefault]),
        );
        const overrideByKey = new Map(
            overrides.map((o) => [o.flagKey, o.enabled]),
        );

        return FLAG_KEYS.map((key): EffectiveFlag => {
            const override = overrideByKey.get(key);
            if (override !== undefined) {
                return { key, enabled: override, source: "override" };
            }
            const fallbackDefault = defaultByKey.get(key);
            if (fallbackDefault !== undefined) {
                return { key, enabled: fallbackDefault, source: "default" };
            }
            return { key, enabled: false, source: "fallback" };
        });
    }
}
