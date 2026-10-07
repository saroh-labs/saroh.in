import { Injectable, Logger, Optional } from "@nestjs/common";
import {
    liveCatalogueVersion,
    prisma,
    unsyncedCatalogueVersions,
} from "@saroh/database";
import type {
    BoughtAddon,
    Catalog,
    ModuleAccess,
    RegistryModuleKey,
} from "@saroh/pricing-catalog";
import {
    businessPricePaise,
    CATALOG_PLAN_KEY_PREFIX,
    catalogPlanIdForKey,
    effectivePlanId,
    LEGACY_PLAN_KEYS,
    resolveAllAccess,
    validateCatalog,
} from "@saroh/pricing-catalog";

import type { OrganizationContext } from "../../common/types/organization-context";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import { authorize } from "../organizations/organization-policy";
import type {
    BillingAccessView,
    EntitlementMap,
    OverrideRow,
} from "./catalogue-access";
import {
    applyOverrides,
    asEntitlementMap,
    entitlementMapFor,
    LEGACY_FLOOR_ENTITLEMENTS,
    liveRaises,
    moduleAccessViews,
    PAID_PLAN_SWITCHES,
    registryModuleIncluded,
    toOverrides,
    withoutRaises,
} from "./catalogue-access";
import { usageByModule } from "./metering";
import type { MoveReadiness } from "./plan-moves";
import { moveReadiness } from "./plan-moves";

/**
 * The floor for a business the catalogue doesn't reach yet: no subscription
 * row and no plan override. Every business gets a Free subscription row at
 * sign-up and from the Free-rows backfill (OQ-2), and a grandfathered one a
 * plan override (U5), so this is only read where those haven't run — which
 * is how the catalogue's Free replaces it only where the backfills have
 * (`docs/architecture/PRICING_ROLLOUT.md`). Kept small: an unpaid tenant
 * cannot, e.g., add a custom domain.
 */
export const FREE_ENTITLEMENTS: EntitlementMap = {
    ...LEGACY_FLOOR_ENTITLEMENTS,
    teamMembers: 2,
    customDomain: false,
};

/** The catalogue plan a business with no plan of its own is on. */
export const FREE_PLAN_ID: string = LEGACY_PLAN_KEYS.free;

/** The live `plan` override a business is on (U5). */
export interface LivePlanOverride {
    id: string;
    /** The catalogue plan id, e.g. `grow`. */
    planKey: string;
    /** Null lasts until removed. */
    expiresAt: Date | null;
}

/**
 * A move to another plan version not applied yet (KTD-4): its date is still
 * to come, or it has come and the move is `held` or must be authorised
 * (U15, `plan-moves.ts`).
 */
export interface PendingMove {
    /** The plan it moves to, on the new version. */
    planId: string;
    /**
     * The plan it moves from (its subscription's, before any plan
     * override). The same as `planId` when only the version changes: a
     * Free business stays on Free, so no screen calls it a plan change.
     */
    fromPlanId: string;
    version: number;
    from: Date;
    waiting: "held" | "authorise" | null;
}

/** Why a business is read off the legacy path instead of the catalogue. */
export type LegacyReason =
    /** No subscription row and no plan override: the free floor. */
    | "no-plan"
    /** A legacy plan key `LEGACY_PLAN_KEYS` doesn't map: its own row. */
    | "unmapped-plan"
    /** No live catalogue version, or its snapshot doesn't validate. */
    | "no-catalogue"
    /** Its plan isn't in the version it's on. */
    | "unknown-plan";

interface AccessCommon {
    /** What it may do now: plan, overrides, add-ons and raises. */
    entitlements: EntitlementMap;
    /** The same before raises: what an operator's raise must beat. */
    planEntitlements: EntitlementMap;
    planOverride: LivePlanOverride | null;
}

/** A business read through the catalogue. */
export interface CatalogueAccess extends AccessCommon {
    source: "catalogue";
    version: number;
    catalog: Catalog;
    /** The plan its subscription puts it on (Free with none). */
    basePlanId: string;
    /** The plan it is on after a plan override. */
    planId: string;
    planName: string;
    /** What it pays a month before GST: a custom price, else its plan's. */
    pricePaise: number;
    /** A move not yet due; a due one is already what it's on. */
    pendingMove: PendingMove | null;
    /** Every row of its version, resolved. */
    modules: ModuleAccess[];
}

/** A business the catalogue doesn't reach (see {@link LegacyReason}). */
export interface LegacyAccess extends AccessCommon {
    source: "legacy";
    reason: LegacyReason;
}

export type BusinessAccess = CatalogueAccess | LegacyAccess;

/** Parsed snapshots by version row id: versions never change once written. */
const parsedVersions = new Map<string, Catalog>();

const OVERRIDE_SELECT = {
    id: true,
    kind: true,
    key: true,
    moduleKey: true,
    value: true,
    planKey: true,
    createdAt: true,
    expiresAt: true,
    revokedAt: true,
} as const;

/**
 * The newest live plan override among a business's rows, as U5 reads it:
 * unrevoked, not past its end, the latest `createdAt` winning (the order
 * `orderOverrides` applies them in, so the same one `resolveAccess` uses).
 */
export function newestPlanOverride(
    rows: readonly OverrideRow[],
    now: Date,
): LivePlanOverride | null {
    const t = now.getTime();
    const live = rows
        .filter(
            (r) =>
                r.kind === "plan" &&
                r.planKey &&
                !(r.revokedAt && r.revokedAt.getTime() <= t) &&
                !(r.expiresAt && r.expiresAt.getTime() <= t),
        )
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    if (live.length === 0) return null;
    const newest = live[live.length - 1];
    return newest.planKey
        ? {
              id: newest.id,
              planKey: newest.planKey,
              expiresAt: newest.expiresAt,
          }
        : null;
}

/**
 * What a business's plan gives it, read from the pricing catalogue (plans
 * catalogue U12, R6/R8). The one place the API turns subscription, overrides
 * and add-ons into access; `EntitlementService` and module availability read
 * it, and `GET …/billing/access` returns it.
 *
 * Where it is on (in order):
 *
 * 1. Its subscription, unless CANCELLED, or the pending move once its date
 *    has passed (KTD-4): a catalogue row (`catalog.<plan>`) on its own
 *    version; a legacy row (`business`, `pro`, `free`) as the plan
 *    `LEGACY_PLAN_KEYS` maps it to, on the live version — so a paying
 *    customer never resolves as Free — keeping its own row's values for the
 *    keys no catalogue row sells.
 * 2. With no live subscription, Free on the live version — but only when the
 *    catalogue already reaches it: it has a catalogue subscription row
 *    (cancelled) or a live plan override. A business with neither reads
 *    {@link FREE_ENTITLEMENTS} (`reason: "no-plan"`).
 *
 * Then `resolveAllAccess` applies its live overrides — a `plan` override
 * first, passed straight through (`effectivePlanId`), then remove, grant,
 * limit and raise — and its add-ons, read from the same version (KTD-5).
 *
 * Fail safe (OQ-4): a version that's missing or doesn't validate, or a plan
 * that isn't in it, reads the business off its own row (or the free floor)
 * and logs why; a plan override naming a plan the version doesn't have is
 * ignored and logged, never read as Free.
 */
@Injectable()
export class CatalogueAccessService {
    private readonly logger = new Logger(CatalogueAccessService.name);

    constructor(
        @Optional()
        private readonly flags: FeatureFlagService = new FeatureFlagService(),
    ) {}

    async resolve(
        organizationId: string,
        now: Date = new Date(),
    ): Promise<BusinessAccess> {
        const [subscription, rows] = await Promise.all([
            prisma.subscription.findUnique({
                where: { organizationId },
                select: {
                    status: true,
                    provider: true,
                    providerSubscriptionId: true,
                    cancelAtPeriodEnd: true,
                    pendingPlanId: true,
                    pendingFrom: true,
                    plan: {
                        select: {
                            id: true,
                            key: true,
                            version: true,
                            interval: true,
                            priceCents: true,
                            entitlements: true,
                        },
                    },
                    pendingPlan: {
                        select: {
                            id: true,
                            key: true,
                            version: true,
                            interval: true,
                            priceCents: true,
                            entitlements: true,
                        },
                    },
                    addons: { select: { addonId: true, quantity: true } },
                },
            }),
            prisma.entitlementOverride.findMany({
                where: {
                    organizationId,
                    revokedAt: null,
                    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                },
                select: OVERRIDE_SELECT,
            }),
        ]);
        const overrideRows = rows as OverrideRow[];
        const raises = liveRaises(overrideRows);
        const planOverride = newestPlanOverride(overrideRows, now);

        const legacy = (
            reason: LegacyReason,
            planValues: EntitlementMap,
        ): LegacyAccess => ({
            source: "legacy",
            reason,
            planEntitlements: planValues,
            entitlements: applyOverrides(planValues, raises),
            planOverride,
        });

        const live =
            subscription && subscription.status !== "CANCELLED"
                ? subscription
                : null;
        // A due move is what it's on only once it can be billed as it reads
        // (U15): not while its version is held at the billing provider, nor
        // while the business must authorise a new amount.
        let readiness: MoveReadiness = "none";
        if (live?.pendingPlan && live.pendingFrom && live.pendingFrom <= now) {
            const [scheduled, held] = await Promise.all([
                prisma.billingCheckout.findFirst({
                    where: { organizationId, status: "SCHEDULED" },
                    select: { planId: true },
                }),
                unsyncedCatalogueVersions(prisma),
            ]);
            readiness = moveReadiness({
                subscription: live,
                scheduledPlanId: scheduled?.planId ?? null,
                held: new Set(held),
                now,
            });
        }
        const due = readiness === "ready" ? (live?.pendingPlan ?? null) : null;
        const billed = due ?? live?.plan ?? null;

        // Where the catalogue puts it: a plan, on a version (null = live).
        let planId: string;
        let version: number | null;
        let legacyRow: EntitlementMap | null = null;
        // What it reads if the catalogue can't answer.
        let fallback: EntitlementMap;
        if (billed) {
            const own = asEntitlementMap(billed.entitlements);
            const mapped = catalogPlanIdForKey(billed.key);
            if (!mapped) return legacy("unmapped-plan", own);
            planId = mapped;
            if (billed.key.startsWith(CATALOG_PLAN_KEY_PREFIX)) {
                version = billed.version;
                // A catalogue row keys by row id; the floor beside it, and
                // never overwritten by a row of the same id (`sites`).
                fallback = {
                    ...Object.fromEntries(
                        PAID_PLAN_SWITCHES.map((k) => [
                            k,
                            billed.priceCents > 0,
                        ]),
                    ),
                    ...own,
                    ...LEGACY_FLOOR_ENTITLEMENTS,
                };
            } else {
                version = null;
                legacyRow = own;
                fallback = own;
            }
        } else if (
            planOverride ||
            subscription?.plan.key.startsWith(CATALOG_PLAN_KEY_PREFIX)
        ) {
            planId = FREE_PLAN_ID;
            version = null;
            fallback = { ...FREE_ENTITLEMENTS };
        } else {
            return legacy("no-plan", { ...FREE_ENTITLEMENTS });
        }

        const snapshot = await this.version(version, now);
        if (!snapshot) {
            this.logger.warn(
                `catalogue_access_unresolved org=${organizationId} reason=no-catalogue version=${version ?? "live"}`,
            );
            return legacy("no-catalogue", fallback);
        }
        const { catalog } = snapshot;
        const planIds = new Set(catalog.plans.map((p) => p.id));
        if (!planIds.has(planId)) {
            this.logger.warn(
                `catalogue_access_unresolved org=${organizationId} reason=unknown-plan plan=${planId} version=${snapshot.version}`,
            );
            return legacy("unknown-plan", fallback);
        }

        const overrides = toOverrides(overrideRows);
        const addons: BoughtAddon[] = live?.addons ?? [];
        const effective = effectivePlanId(planId, overrides, now, planIds);
        if (planOverride && effective !== planOverride.planKey) {
            this.logger.warn(
                `plan_override_unresolved org=${organizationId} override=${planOverride.id} plan=${planOverride.planKey} version=${snapshot.version}`,
            );
        }
        // Its own legacy row only while it is still on the plan that row is.
        const ownRow = effective === planId ? legacyRow : null;
        const input = { catalog, planId, addons, now };
        const modules = resolveAllAccess({ ...input, overrides });
        const planModules = resolveAllAccess({
            ...input,
            overrides: withoutRaises(overrides),
        });
        const plan = catalog.plans.find((p) => p.id === effective);

        return {
            source: "catalogue",
            version: snapshot.version,
            catalog,
            basePlanId: planId,
            planId: effective,
            planName: plan?.name ?? effective,
            pricePaise: businessPricePaise({ ...input, overrides }),
            pendingMove:
                live?.pendingPlan && live.pendingFrom && !due
                    ? {
                          planId:
                              catalogPlanIdForKey(live.pendingPlan.key) ??
                              live.pendingPlan.key,
                          fromPlanId: planId,
                          version: live.pendingPlan.version,
                          from: live.pendingFrom,
                          waiting:
                              readiness === "held"
                                  ? "held"
                                  : readiness === "needs-authorisation"
                                    ? "authorise"
                                    : null,
                      }
                    : null,
            modules,
            planEntitlements: entitlementMapFor({
                catalog,
                access: planModules,
                planId: effective,
                legacyRow: ownRow,
            }),
            entitlements: applyOverrides(
                entitlementMapFor({
                    catalog,
                    access: modules,
                    planId: effective,
                    legacyRow: ownRow,
                }),
                raises,
            ),
            planOverride,
        };
    }

    /**
     * `GET organizations/:org/billing/access`: every row's state, limit and
     * upgrade, the plan and price, a plan override and a pending move — what
     * the merchant app's locks, upgrade panel and Settings › Plan read (U14).
     * Needs `billing:read`, as the subscription read does. Each metered row
     * that is on carries its `usage` (U13), whether or not
     * `PLAN_ENFORCEMENT` is on: reads always answer.
     */
    async view(ctx: OrganizationContext): Promise<BillingAccessView> {
        authorize(ctx, "billing:read");
        const [a, enforced] = await Promise.all([
            this.resolve(ctx.organizationId),
            this.flags.isEnabled(FlagKey.PLAN_ENFORCEMENT, ctx.organizationId),
        ]);
        const planOverride = a.planOverride
            ? {
                  planKey: a.planOverride.planKey,
                  expiresAt: a.planOverride.expiresAt?.toISOString() ?? null,
              }
            : null;
        if (a.source !== "catalogue") {
            return {
                source: "legacy",
                enforced,
                version: null,
                plan: null,
                pricePaise: null,
                planOverride,
                pendingMove: null,
                modules: [],
            };
        }
        return {
            source: "catalogue",
            enforced,
            version: a.version,
            plan: { id: a.planId, name: a.planName },
            pricePaise: a.pricePaise,
            planOverride,
            pendingMove: a.pendingMove
                ? {
                      planId: a.pendingMove.planId,
                      fromPlanId: a.pendingMove.fromPlanId,
                      version: a.pendingMove.version,
                      from: a.pendingMove.from.toISOString(),
                      waiting: a.pendingMove.waiting,
                  }
                : null,
            modules: moduleAccessViews(
                a.catalog,
                a.modules,
                await usageByModule(
                    prisma,
                    ctx.organizationId,
                    a.modules
                        .filter((m) => m.state === "on")
                        .map((m) => m.moduleId),
                ),
            ),
        };
    }

    /**
     * Whether a business's plan includes a registry module (KTD-8): true off
     * the catalogue, or when no catalogue row sits under it.
     */
    async registryModuleIncluded(
        organizationId: string,
        registry: RegistryModuleKey,
        now: Date = new Date(),
    ): Promise<boolean> {
        const access = await this.resolve(organizationId, now);
        if (access.source !== "catalogue") return true;
        return registryModuleIncluded(access.catalog, access.modules, registry);
    }

    /**
     * A version's snapshot: the given one, or the live one for null. Null
     * when there is none, or it doesn't validate (logged; a corrupt row
     * must not take every limit check down with it).
     */
    private async version(
        version: number | null,
        now: Date,
    ): Promise<{ version: number; catalog: Catalog } | null> {
        const row =
            version === null
                ? await liveCatalogueVersion(prisma, now)
                : await prisma.pricingCatalogVersion.findUnique({
                      where: { version },
                  });
        if (!row) return null;
        const cached = parsedVersions.get(row.id);
        if (cached) return { version: row.version, catalog: cached };
        const r = validateCatalog(row.catalog);
        if (!r.ok) {
            this.logger.error(
                `pricing_catalogue_version_invalid version=${row.version} errors=${r.errors.length}`,
            );
            return null;
        }
        parsedVersions.set(row.id, r.catalog);
        return { version: row.version, catalog: r.catalog };
    }
}
