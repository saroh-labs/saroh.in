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
 *  7. After the commit, what follows a module being on
 *     (`afterTurnedOn`): Bookings makes its booking page where there is no
 *     website (DEC-175, `booking-site.ts`).
 *
 * `GET …/modules/:key/setup-defaults` is what the sheet shows before
 * anything is saved: the payload prefilled, what else turns on with it,
 * and whether the business may see the module at all. The prefill follows
 * the business's kind (DEC-070); nothing else here reads it.
 */
import { Injectable, Logger, Optional } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../../common/types/organization-context";
import { EntitlementService } from "../../billing/entitlement.service";
import { FeatureFlagService } from "../../feature-flags/feature-flags.service";
import { storefrontTypesOf } from "../../orders/fulfilment";
import type { OrganizationKind } from "../../organizations/organization-kind";
import { organizationKind } from "../../organizations/organization-kind";
import { authorize } from "../../organizations/organization-policy";
import { siteDefaults } from "../../sites/site-address";
import { kindTemplate } from "../../sites/site-template";
import { templateCatalogue } from "../../sites/template-catalogue";
import { ModuleLifecycleService } from "../module-lifecycle.service";
import type { ModuleKey } from "../module-registry";
import { MODULE_BY_KEY, moduleRolledOut } from "../module-registry";
import type { BookingSiteOutcome, BookingSiteWhy } from "./booking-site";
import { bookingPageToCome, makeBookingSite } from "./booking-site";
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
     * Every module it needs, directly or through another, on or off, in the
     * order the app turns them on (a module after what it needs). The app
     * skips any already on.
     */
    dependencies: ModuleKey[];
    /** The setup payload, prefilled; send it back as edited. */
    setup: Record<string, unknown>;
    /** The minimum already there, which saving reuses. Null: made new. */
    existing: ExistingMinimum | null;
    /**
     * Bookings only (DEC-175): the business has no website, so turning
     * Bookings on makes its booking page, a starter site at this address
     * with its Book page, not published. Absent when nothing would be made
     * (a website already, Website not offered, or this person may not).
     */
    alsoBookingPage?: { address: string };
    /**
     * Sell only (DEC-069): the business has no website yet, so selling
     * online would make the starter site too (the app turns Website on
     * with its own setup when an online way is chosen).
     */
    alsoWebsite?: boolean;
    /**
     * Website only, with no site yet: the template the new site starts
     * from, which follows the kind (DEC-070, K15) — "Starts from
     * Portfolio". Said, not asked: `/sites/new` is where another is picked.
     */
    template?: { id: string; name: string };
    /**
     * Website only, with no site yet: the templates it could start from
     * instead (industry templates U12), with what the sheet needs to
     * suggest a few for this business: who each is for and the modules it
     * reads. The sheet offers the suggested ones as a choice.
     */
    templates?: { id: string; name: string; kinds: string[]; uses: string[] }[];
    /** With `templates`: what is being set up, which the suggestion reads. */
    kind?: OrganizationKind;
}

/** Opening hours, one row per weekday (0 = Sunday). */
function hours(weekdays: number[], open: string, close: string) {
    return weekdays.map((weekday) => ({ weekday, open, close }));
}

/**
 * The Bookings sheet's prefill per kind (DEC-070, KTD-6). Only the prefill:
 * whatever the merchant sends back is what is saved, and every kind may
 * turn Bookings on.
 *
 * A business, and a site for someone's work: Mon–Sat, 10:00–19:00
 * (DEC-068's default), and the first service left blank. A business's type
 * is its legal form (`business-type.ts`), which says nothing about what it
 * offers, so there is no sensible name or price to suggest.
 *
 * Just me: a freelancer or consultant keeps weekday hours, 10:00–18:00, and
 * is most often booked for a conversation, so the first service is an
 * hour's "Consultation" with no price.
 */
const BOOKINGS_DEFAULTS: Record<
    OrganizationKind,
    {
        hours: { weekday: number; open: string; close: string }[];
        service: { name: string; durationMinutes: number; price: string };
    }
> = {
    BUSINESS: {
        hours: hours([1, 2, 3, 4, 5, 6], "10:00", "19:00"),
        service: { name: "", durationMinutes: 60, price: "" },
    },
    SOLO: {
        hours: hours([1, 2, 3, 4, 5], "10:00", "18:00"),
        service: { name: "Consultation", durationMinutes: 60, price: "" },
    },
    WORK: {
        hours: hours([1, 2, 3, 4, 5, 6], "10:00", "19:00"),
        service: { name: "", durationMinutes: 60, price: "" },
    },
};

@Injectable()
export class ModuleSetupService {
    private readonly logger = new Logger(ModuleSetupService.name);

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
        if (!switched) return { alreadyEnabled: true, created: {} };
        await this.afterTurnedOn(ctx, moduleKey);
        return { alreadyEnabled: false, created };
    }

    /**
     * What follows a module being switched on, after its commit: Bookings
     * makes the booking page where there is no website (DEC-175). The
     * plain switch (no setup) calls it too, so every way Bookings is
     * turned on reaches it. Never refuses: the switch has committed.
     */
    async afterTurnedOn(
        ctx: OrganizationContext,
        moduleKey: ModuleKey,
    ): Promise<void> {
        if (moduleKey === "APPOINTMENTS") {
            await this.makeBookingSite(ctx, "turned-on");
        }
    }

    /**
     * Make the booking page (DEC-175, `booking-site.ts`): the starter site
     * on the business's address, Website switched on with it, not
     * published. Made by itself (`turned-on`, `service`) it never refuses;
     * asked for (`asked`), the refusal is the caller's to say.
     */
    makeBookingSite(
        ctx: OrganizationContext,
        why: BookingSiteWhy,
    ): Promise<BookingSiteOutcome> {
        return makeBookingSite(ctx, why, {
            websiteRolledOut: (orgId) =>
                moduleRolledOut(this.flags, "WEBSITE", orgId),
            websiteOn: () => this.isOn(ctx, "WEBSITE"),
            enableWebsite: (setup) => this.enable(ctx, "WEBSITE", setup),
            entitlements: this.entitlements,
            logger: this.logger,
        });
    }

    /** What the Turn on sheet prefills (see {@link ModuleSetupDefaults}). */
    async defaults(
        ctx: OrganizationContext,
        moduleKey: ModuleKey,
    ): Promise<ModuleSetupDefaults> {
        authorize(ctx, "module:manage");
        const organizationId = ctx.organizationId;
        const [org, rolledOut] = await Promise.all([
            prisma.organization.findUniqueOrThrow({
                where: { id: organizationId },
                select: { name: true },
            }),
            moduleRolledOut(this.flags, moduleKey, organizationId),
        ]);
        const base = {
            moduleKey,
            hidden: !rolledOut,
            dependencies: dependenciesOf(moduleKey),
        };

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
                const [service, kind, bookingPage] = await Promise.all([
                    prisma.service.findFirst({
                        where: { organizationId, deletedAt: null },
                        orderBy: { createdAt: "asc" },
                        select: { id: true },
                    }),
                    organizationKind(prisma, organizationId),
                    bookingPageToCome(ctx, (orgId) =>
                        moduleRolledOut(this.flags, "WEBSITE", orgId),
                    ),
                ]);
                const suggestion = BOOKINGS_DEFAULTS[kind];
                return {
                    ...base,
                    setup: {
                        hours: suggestion.hours.map((h) => ({ ...h })),
                        service: { ...suggestion.service },
                    },
                    existing: service ? { serviceId: service.id } : null,
                    ...(bookingPage ? { alsoBookingPage: bookingPage } : {}),
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
                // The address chosen at setup, or a free one like it: the
                // same start `/sites/new` has (`GET …/sites/new-defaults`).
                const [address, kind] = await Promise.all([
                    siteDefaults(prisma, organizationId),
                    organizationKind(prisma, organizationId),
                ]);
                return {
                    ...base,
                    setup: { ...address },
                    existing: null,
                    template: kindTemplate(kind),
                    templates: templateCatalogue().map(
                        ({ id, name, kinds, uses }) => ({
                            id,
                            name,
                            kinds,
                            uses,
                        }),
                    ),
                    kind,
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
}

/**
 * Every module `moduleKey` needs, directly or through another — on or off —
 * a module after what it needs: the order the app turns them on in, skipping
 * any already on (the list's `lifecycle` says which).
 */
export function dependenciesOf(moduleKey: ModuleKey): ModuleKey[] {
    const out: ModuleKey[] = [];
    const seen = new Set<ModuleKey>([moduleKey]);
    const visit = (of: ModuleKey) => {
        for (const dep of MODULE_BY_KEY.get(of)?.dependencies ?? []) {
            if (seen.has(dep)) continue;
            seen.add(dep);
            visit(dep);
            out.push(dep);
        }
    };
    visit(moduleKey);
    return out;
}
