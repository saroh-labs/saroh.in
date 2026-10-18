import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import type { AccessState } from "@saroh/pricing-catalog";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { mapEntry } from "../billing/catalogue-access";
import type { CatalogueAccessService } from "../billing/catalogue-access.service";
import type { PreviewKind } from "./admin-offers";
import {
    accessWhy,
    liveCatalog,
    MAX_END_DAYS,
    NOT_ON_CATALOGUE,
    organizationOpen,
    paidPlanIncludes,
    RAISE_MAX_DAYS,
    TRIAL_MAX_DAYS,
} from "./admin-offers";

/**
 * What the offer sheet (admin console U5, R5) and Take away a module… can
 * offer one business: each kind with why not, in words, and what to pick
 * from. The sheet decides nothing with it; the dry run and the write check
 * again (`admin-offers.ts`).
 *
 * CROSS-TENANT READ: the one business in the path, behind the admin guards.
 */

export interface OfferKindOption {
    available: boolean;
    /** Why not, in words; null when it is available. */
    why: string | null;
}

/** What the offer sheet and Take away a module… can offer this business. */
export interface OfferOptions {
    organizationId: string;
    /** The plan it is on now; null with none. */
    planName: string | null;
    kinds: Record<PreviewKind, OfferKindOption>;
    /** The plans a plan offer can put it on. */
    plans: { id: string; name: string }[];
    /** Every catalogue row of its version, with where it stands now. */
    modules: {
        id: string;
        name: string;
        /** The registry module it sits under, for "Give this module…". */
        registry: string | null;
        state: AccessState;
        /** Its paid plan (or an add-on it pays for) includes it. */
        paidPlanIncludes: boolean;
    }[];
    /** The limits a higher limit can raise, with what applies now. */
    limits: {
        key: string;
        label: string;
        limit: number | null;
        planLimit: number;
        per: string;
    }[];
    /** While in a trial not billed by a provider: when it ends. */
    trialEndsAt: string | null;
    maxEndDays: number;
    raiseMaxDays: number;
    trialMaxDays: number;
}

/**
 * What the offer sheet can give this business, and Take away a module…
 * can take: each kind with why not, the plans, modules and limits to pick
 * from, and the trial's end while in one.
 */
export async function offerOptions(
    access: CatalogueAccessService,
    staff: PlatformAdminInfo,
    organizationId: string,
    now: Date = new Date(),
): Promise<OfferOptions> {
    const why = accessWhy(staff, "plan");
    if (why && accessWhy(staff, "limit")) throw new ForbiddenException(why);
    await organizationOpen(organizationId);

    const [a, sub] = await Promise.all([
        access.resolve(organizationId, now),
        prisma.subscription.findUnique({
            where: { organizationId },
            select: { status: true, provider: true, currentPeriodEnd: true },
        }),
    ]);
    const catalogue = a.source === "catalogue" ? a : null;
    const live = catalogue ? null : await liveCatalog();
    const plans = (catalogue?.catalog ?? live)?.plans ?? [];
    const paid = catalogue
        ? await paidPlanIncludes(
              access,
              organizationId,
              catalogue.modules.map((m) => m.moduleId),
              now,
          )
        : new Set<string>();

    const modules = (catalogue?.modules ?? []).map((m) => ({
        id: m.moduleId,
        name: m.name,
        registry: mapEntry(m.moduleId)?.registry ?? null,
        state: m.state,
        paidPlanIncludes: paid.has(m.moduleId),
    }));
    const limits = Object.entries(a.planEntitlements).flatMap(
        ([key, planValue]) => {
            if (typeof planValue !== "number") return [];
            const row = catalogue?.modules.find((m) => m.moduleId === key);
            // On the catalogue only a row that is on with a cap, and a
            // metered count (`limitKey`), as Overview's Raise a limit….
            if (
                catalogue &&
                (row?.state !== "on" || !mapEntry(key)?.limitKey)
            ) {
                return [];
            }
            const applies = a.entitlements[key];
            return [
                {
                    key,
                    label: row?.name ?? key,
                    limit: typeof applies === "number" ? applies : null,
                    planLimit: planValue,
                    per: row?.per ?? "",
                },
            ];
        },
    );

    const trialing = sub?.status === "TRIALING";
    const provider = sub?.provider ?? null;
    const option = (
        kind: PreviewKind,
        reasons: (string | false | null)[],
    ): OfferKindOption => {
        const first = [accessWhy(staff, kind), ...reasons].find(
            (r): r is string => typeof r === "string" && r.length > 0,
        );
        return { available: !first, why: first ?? null };
    };
    const offCatalogue = !catalogue && NOT_ON_CATALOGUE;
    const billedThere =
        provider &&
        `This plan is billed through ${provider}; change it there so billing stays in step.`;

    return {
        organizationId,
        planName: catalogue?.planName ?? null,
        kinds: {
            plan: option("plan", [
                plans.length === 0 &&
                    "No catalogue version is live yet, so there is no plan to put it on.",
            ]),
            price: option("price", [offCatalogue, billedThere]),
            module: option("module", [
                offCatalogue,
                catalogue &&
                    !modules.some((m) => m.state !== "on") &&
                    "Every module is already on for them.",
            ]),
            limit: option("limit", [
                limits.length === 0 &&
                    "Nothing they have carries a limit to raise.",
            ]),
            trial: option("trial", [
                billedThere,
                !trialing &&
                    "A longer trial is only for a business in a trial.",
            ]),
            remove: option("remove", [
                offCatalogue,
                catalogue &&
                    !modules.some(
                        (m) => m.state === "on" && !m.paidPlanIncludes,
                    ) &&
                    "Every module they have is in the plan they pay for.",
            ]),
        },
        plans: plans.map((p) => ({ id: p.id, name: p.name })),
        modules,
        limits,
        trialEndsAt:
            trialing && !provider
                ? (sub.currentPeriodEnd?.toISOString() ?? null)
                : null,
        maxEndDays: MAX_END_DAYS,
        raiseMaxDays: RAISE_MAX_DAYS,
        trialMaxDays: TRIAL_MAX_DAYS,
    };
}
