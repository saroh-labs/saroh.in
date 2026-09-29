/**
 * Turning a module on with its minimum (DEC-068).
 *
 * `PUT /organizations/:id/modules/:key { status: "ENABLED", setup }` lands
 * here when `setup` is sent; without it the controller calls
 * `ModuleLifecycleService.enable` as before, so an app from before the Turn
 * on sheet keeps working. With it:
 *
 *  1. `module:manage`, as for any switch.
 *  2. Already on: nothing is validated or applied — `alreadyEnabled: true`.
 *  3. The refusals enable meets anyway, in the same words: not rolled out
 *     or hidden (Automations), or a module it needs is off. The API never
 *     turns a dependency on: the app turns each on first (with its own
 *     setup), then this module.
 *  4. The setup is validated against the module's shape — a 400 naming
 *     every field as `setup.<path>`.
 *  5. Who may create what it makes (`store:create`, `service:write`,
 *     `pipeline:manage`, `site:create`), the plan's caps, and the website's
 *     template — all before the transaction.
 *  6. ONE transaction: the switch, its audit event and the minimum. Any
 *     failure writes nothing — neither the rows nor the switch.
 *
 * `GET …/modules/:key/setup-defaults` is what the sheet shows before
 * anything is saved: the payload prefilled, what else turns on with it,
 * and whether the business may see the module at all.
 */
import { Injectable, Optional } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../../common/types/organization-context";
import { EntitlementService } from "../../billing/entitlement.service";
import { FeatureFlagService } from "../../feature-flags/feature-flags.service";
import { storefrontTypesOf } from "../../orders/fulfilment";
import { authorize } from "../../organizations/organization-policy";
import { freeAddress } from "../../sites/site-address";
import { ModuleLifecycleService } from "../module-lifecycle.service";
import type { ModuleKey } from "../module-registry";
import { MODULE_BY_KEY, moduleRolledOut } from "../module-registry";
import { parseModuleSetup } from "./module-setup.parse";
import type { SetupCreated } from "./module-setup.writers";
import {
    existingSite,
    firstStorefront,
    prepareSetup,
} from "./module-setup.writers";

/** What an enable with a setup did. */
export interface SetupOutcome {
    /** It was on already: nothing was validated or applied. */
    alreadyEnabled: boolean;
    /** What the setup made or reused (empty when already on). */
    created: SetupCreated;
}

/** The minimum a module already has, which its setup reuses. */
export type ExistingMinimum =
    | { storefrontId: string; name: string }
    | { serviceId: string }
    | { pipelineId: string }
    | { siteId: string; address: string | null };

/** `GET …/setup-defaults`: what the Turn on sheet prefills. */
export interface ModuleSetupDefaults {
    moduleKey: ModuleKey;
    /**
     * Never shown to this business: not rolled out, or hidden until it has
     * a screen (Automations, DEC-068). The sheet isn't offered.
     */
    hidden: boolean;
    /**
     * The modules that turn on with it — those it needs, directly or
     * through another, that are off — in the order the app turns them on.
     */
    dependencies: ModuleKey[];
    /** The setup payload, prefilled; send it back as edited. */
    setup: Record<string, unknown>;
    /** The minimum already there, which saving reuses. Null: made new. */
    existing: ExistingMinimum | null;
    /**
     * Sell only (DEC-069): the business has no website yet, so selling
     * online would make the starter site too (the app turns Website on
     * with its own setup when an online way is chosen).
     */
    alsoWebsite?: boolean;
}

/** Mon–Sat, 10:00–19:00 (DEC-068's default). */
const DEFAULT_HOURS = [1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    open: "10:00",
    close: "19:00",
}));

/**
 * The first service's suggestion. A business's type is its legal form
 * (`business-type.ts`), which says nothing about what it offers, so there
 * is no sensible mapping yet: the name and price are left blank.
 */
const SERVICE_SUGGESTION = { name: "", durationMinutes: 60, price: "" };

@Injectable()
export class ModuleSetupService {
    constructor(
        private readonly lifecycle: ModuleLifecycleService,
        private readonly entitlements: EntitlementService,
        @Optional() private readonly flags?: FeatureFlagService,
    ) {}

    /** Turn a module on with its setup (see the file's header). */
    async enable(
        ctx: OrganizationContext,
        moduleKey: ModuleKey,
        rawSetup: unknown,
    ): Promise<SetupOutcome> {
        authorize(ctx, "module:manage");
        if (await this.isOn(ctx, moduleKey)) {
            return { alreadyEnabled: true, created: {} };
        }
        await this.lifecycle.assertMayTurnOn(ctx, moduleKey);

        const setup = parseModuleSetup(moduleKey, rawSetup);
        const write = await prepareSetup(
            ctx,
            moduleKey,
            setup,
            this.entitlements,
        );

        let created: SetupCreated = {};
        const switched = await this.lifecycle.enable(
            ctx,
            moduleKey,
            async (tx) => {
                created = await write(tx);
            },
        );
        // Switched on by someone else between the read and the write: the
        // setup never ran.
        return switched
            ? { alreadyEnabled: false, created }
            : { alreadyEnabled: true, created: {} };
    }

    /** What the Turn on sheet prefills (see {@link ModuleSetupDefaults}). */
    async defaults(
        ctx: OrganizationContext,
        moduleKey: ModuleKey,
    ): Promise<ModuleSetupDefaults> {
        authorize(ctx, "module:manage");
        const organizationId = ctx.organizationId;
        const [org, hidden, dependencies] = await Promise.all([
            prisma.organization.findUniqueOrThrow({
                where: { id: organizationId },
                select: { name: true, slug: true },
            }),
            moduleRolledOut(this.flags, moduleKey, organizationId).then(
                (on) => !on,
            ),
            this.offDependencies(ctx, moduleKey),
        ]);
        const base = { moduleKey, hidden, dependencies };

        switch (moduleKey) {
            case "COMMERCE": {
                const [store, site] = await Promise.all([
                    firstStorefront(prisma, organizationId),
                    existingSite(prisma, organizationId),
                ]);
                const ways = store?.settings
                    ? storefrontTypesOf(store.settings.fulfilmentTypes)
                    : [];
                return {
                    ...base,
                    setup: {
                        // A storefront there already is renamed, so the
                        // sheet starts from what it is called and offers.
                        storefrontName: (store?.name ?? org.name).slice(0, 80),
                        fulfilment: ways.length > 0 ? ways : ["PICKUP"],
                    },
                    existing: store
                        ? { storefrontId: store.id, name: store.name }
                        : null,
                    alsoWebsite: !site,
                };
            }
            case "APPOINTMENTS": {
                const service = await prisma.service.findFirst({
                    where: { organizationId, deletedAt: null },
                    orderBy: { createdAt: "asc" },
                    select: { id: true },
                });
                return {
                    ...base,
                    setup: {
                        hours: DEFAULT_HOURS,
                        service: SERVICE_SUGGESTION,
                    },
                    existing: service ? { serviceId: service.id } : null,
                };
            }
            case "CRM": {
                const pipeline = await prisma.pipeline.findFirst({
                    where: { organizationId },
                    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
                    select: { id: true },
                });
                return {
                    ...base,
                    setup: {},
                    existing: pipeline ? { pipelineId: pipeline.id } : null,
                };
            }
            case "WEBSITE": {
                const site = await existingSite(prisma, organizationId);
                if (site) {
                    return {
                        ...base,
                        setup: {
                            siteName: site.name,
                            address: site.subdomain ?? "",
                        },
                        existing: { siteId: site.id, address: site.subdomain },
                    };
                }
                // The address chosen at setup, or a free one like it.
                const address =
                    (await freeAddress(prisma, org.slug, organizationId)) ?? "";
                return {
                    ...base,
                    setup: { siteName: org.name.slice(0, 120), address },
                    existing: null,
                };
            }
            default:
                return { ...base, setup: {}, existing: null };
        }
    }

    private async isOn(
        ctx: OrganizationContext,
        moduleKey: ModuleKey,
    ): Promise<boolean> {
        const row = await prisma.organizationModule.findUnique({
            where: {
                organizationId_moduleKey: {
                    organizationId: ctx.organizationId,
                    moduleKey,
                },
            },
            select: { status: true },
        });
        return row?.status === "ENABLED";
    }

    /** What `moduleKey` needs that is off, a module after what it needs. */
    private async offDependencies(
        ctx: OrganizationContext,
        moduleKey: ModuleKey,
    ): Promise<ModuleKey[]> {
        const rows = await prisma.organizationModule.findMany({
            where: { organizationId: ctx.organizationId, status: "ENABLED" },
            select: { moduleKey: true },
        });
        const on = new Set(rows.map((r) => r.moduleKey));
        const out: ModuleKey[] = [];
        const seen = new Set<ModuleKey>([moduleKey]);
        const visit = (of: ModuleKey) => {
            for (const dep of MODULE_BY_KEY.get(of)?.dependencies ?? []) {
                if (seen.has(dep)) continue;
                seen.add(dep);
                visit(dep);
                if (!on.has(dep)) out.push(dep);
            }
        };
        visit(moduleKey);
        return out;
    }
}
