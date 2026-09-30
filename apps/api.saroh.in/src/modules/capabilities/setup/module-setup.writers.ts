/**
 * What turning a module on creates (DEC-068): the minimum that makes it work,
 * written on the module switch's own transaction so the two commit together
 * or not at all.
 *
 * Each module's setup is two steps:
 *
 * - `prepare` (before the transaction): who may, the plan's caps and
 *   anything that only reads — the website's template is instantiated here.
 * - `write` (on the transaction): the rows.
 *
 * The minimum is created only where it is missing, so turning a module back
 * on never makes a second one: a business that already has a service, a
 * pipeline or a website keeps it and nothing is added. Sell is the exception
 * the sheet promises — its first storefront is renamed and given the ways
 * chosen, or made when there is none.
 *
 * Selling online leaves the shop ready to publish (DEC-069, L13): Sell and
 * Website each finish what the other started, so whichever is turned on
 * second completes it — the website sells from the location Sell named, and
 * has a draft Shop page when that location delivers or ships. Only what is
 * missing is added: a site keeps the Sells from and the pages it has.
 */
import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { toMinor } from "../../../common/money";
import type { OrganizationContext } from "../../../common/types/organization-context";
import type { EntitlementService } from "../../billing/entitlement.service";
import { STOREFRONT_FULFILMENT_TYPES } from "../../orders/fulfilment";
import { storefrontLimit } from "../../organizations/business-limits";
import { authorize } from "../../organizations/organization-policy";
import { DEFAULT_STAGES } from "../../pipelines/pipelines.service";
import { addModulePageIfMissing } from "../../sites/module-page-create";
import { anyListed, effectiveStorefront } from "../../sites/sells-from";
import type { SitePlan } from "../../sites/site-create";
import {
    planSiteFromTemplate,
    writeSiteFromTemplate,
} from "../../sites/site-create";
import { businessCurrency } from "../../stores/currency";
import { slugify as storeSlugify } from "../../stores/slug";
import { storeSlugInUse } from "../../stores/store-slug";
import type { ModuleTransaction } from "../module-lifecycle.service";
import type { ModuleKey } from "../module-registry";
import type {
    AppointmentsSetupDto,
    CommerceSetupDto,
    WebsiteSetupDto,
} from "./module-setup.dto";
import type { ModuleSetups } from "./module-setup.parse";

/** What a setup made or reused, so the app can land on it. */
export interface SetupCreated {
    storefrontId?: string;
    serviceId?: string;
    pipelineId?: string;
    siteId?: string;
    /** The site's address, `<address>.saroh.app`. */
    siteAddress?: string | null;
}

/** The currency a business prices in when it has chosen none yet. */
const DEFAULT_CURRENCY = "INR";

/** A business's zone when it hasn't set one (Saroh's market). */
export const DEFAULT_TIMEZONE = "Asia/Kolkata";

type Entitlements = Pick<EntitlementService, "check" | "getEntitlements">;

/** The write half, run on the switch's transaction. */
export type SetupWrite = (tx: ModuleTransaction) => Promise<SetupCreated>;

const nothing: SetupWrite = () => Promise.resolve({});

/** Authorize, check caps and plan; returns the write. */
export async function prepareSetup<K extends ModuleKey>(
    ctx: OrganizationContext,
    moduleKey: K,
    setup: ModuleSetups[K],
    entitlements: Entitlements,
): Promise<SetupWrite> {
    switch (moduleKey) {
        case "COMMERCE":
            return prepareCommerce(
                ctx,
                setup as CommerceSetupDto,
                entitlements,
            );
        case "APPOINTMENTS":
            authorize(ctx, "service:write");
            return (tx) =>
                writeAppointments(tx, ctx, setup as AppointmentsSetupDto);
        case "CRM":
            authorize(ctx, "pipeline:manage");
            return (tx) => writeCrm(tx, ctx);
        case "WEBSITE":
            return prepareWebsite(ctx, setup as WebsiteSetupDto, entitlements);
        default:
            // Payments, Communications, Insights, Class packs, Courses:
            // nothing is created; a provider is connected later.
            return nothing;
    }
}

// --- Sell ------------------------------------------------------------------

/** The business's first open storefront, the one Sell's setup names. */
export function firstStorefront(
    db: Pick<ModuleTransaction, "store">,
    organizationId: string,
): Promise<{
    id: string;
    name: string;
    settings: { fulfilmentTypes: string[] } | null;
} | null> {
    return db.store.findFirst({
        where: { organizationId, deletedAt: null },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
            id: true,
            name: true,
            settings: { select: { fulfilmentTypes: true } },
        },
    });
}

async function prepareCommerce(
    ctx: OrganizationContext,
    setup: CommerceSetupDto,
    entitlements: Entitlements,
): Promise<SetupWrite> {
    const existing = await firstStorefront(prisma, ctx.organizationId);
    if (existing) {
        authorize(ctx, "store:write");
    } else {
        authorize(ctx, "store:create");
        // The plan's `storefronts` limit, as creating one by hand checks it
        // (StoresService.createForUser), in the merchant's words.
        try {
            await entitlements.check(ctx.organizationId, "storefronts", 0);
        } catch (err) {
            if (!(err instanceof ForbiddenException)) throw err;
            const limit = storefrontLimit(
                await entitlements.getEntitlements(ctx.organizationId),
            );
            throw new ForbiddenException({
                message:
                    limit < 1
                        ? "Your plan doesn't include a location. A bigger plan adds one."
                        : `Your plan includes ${limit === 1 ? "one location" : `${limit} locations`}. A bigger plan adds more.`,
            });
        }
    }
    return (tx) => writeCommerce(tx, ctx, setup);
}

/**
 * A store slug no storefront has, in any business (Store.slug is unique).
 * Read across businesses: under RLS `tx` sees only this one (storeSlugInUse).
 */
async function freeStoreSlug(
    tx: ModuleTransaction,
    name: string,
): Promise<string> {
    const base = storeSlugify(name).slice(0, 60) || "storefront";
    for (let n = 1; n <= 50; n++) {
        const slug = n === 1 ? base : `${base}-${n}`;
        if (!(await storeSlugInUse(tx, slug))) return slug;
    }
    return `${base}-${Date.now().toString(36)}`;
}

async function writeCommerce(
    tx: ModuleTransaction,
    ctx: OrganizationContext,
    setup: CommerceSetupDto,
): Promise<SetupCreated> {
    // In table order, with the two old toggles in step (B17's rule 3):
    // collection is Pick-up, delivery any way that sends the order.
    const fulfilmentTypes = STOREFRONT_FULFILMENT_TYPES.filter((t) =>
        setup.fulfilment.includes(t),
    );
    const ways = {
        fulfilmentTypes,
        collectionEnabled: fulfilmentTypes.includes("PICKUP"),
        shippingEnabled:
            fulfilmentTypes.includes("LOCAL_DELIVERY") ||
            fulfilmentTypes.includes("SHIPPING"),
    };
    // A business sells in one currency (DEC-030).
    const currency =
        (await businessCurrency(tx, ctx.organizationId)) ?? DEFAULT_CURRENCY;

    const existing = await firstStorefront(tx, ctx.organizationId);
    if (existing) {
        await tx.store.update({
            where: { id: existing.id },
            data: { name: setup.storefrontName },
        });
        await tx.storeSettings.upsert({
            where: { storeId: existing.id },
            create: { storeId: existing.id, currency, ...ways },
            update: ways,
        });
        await shopForSell(tx, ctx, existing.id, fulfilmentTypes);
        return { storefrontId: existing.id };
    }

    const store = await tx.store.create({
        data: {
            name: setup.storefrontName,
            slug: await freeStoreSlug(tx, setup.storefrontName),
            organization: { connect: { id: ctx.organizationId } },
            owners: { create: { userId: ctx.userId, role: "OWNER" } },
            settings: { create: { currency, ...ways } },
        },
        select: { id: true },
    });
    await shopForSell(tx, ctx, store.id, fulfilmentTypes);
    return { storefrontId: store.id };
}

// --- Bookings --------------------------------------------------------------

/** "10:30" → 630. */
function minuteOf(hhmm: string): number {
    const [h = "0", m = "0"] = hhmm.split(":");
    return Number(h) * 60 + Number(m);
}

async function writeAppointments(
    tx: ModuleTransaction,
    ctx: OrganizationContext,
    setup: AppointmentsSetupDto,
): Promise<SetupCreated> {
    const organizationId = ctx.organizationId;
    // Turned on again: its services and their hours are still there.
    const existing = await tx.service.findFirst({
        where: { organizationId, deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true },
    });
    if (existing) return { serviceId: existing.id };

    const profile = await tx.businessProfile.findUnique({
        where: { organizationId },
        select: { timezone: true },
    });
    const priced = setup.service.price !== "";
    const service = await tx.service.create({
        data: {
            organizationId,
            name: setup.service.name,
            durationMinutes: setup.service.durationMinutes,
            priceCents: priced ? toMinor(setup.service.price) : null,
            currency: priced ? DEFAULT_CURRENCY : null,
            timezone: profile?.timezone ?? DEFAULT_TIMEZONE,
            status: "ACTIVE",
        },
        select: { id: true },
    });
    // The hours are the service's weekly rules, in its zone — what the
    // booking page offers until staff take it (U3).
    await tx.availabilityRule.createMany({
        data: setup.hours.map((h) => ({
            organizationId,
            serviceId: service.id,
            dayOfWeek: h.weekday,
            startMinute: minuteOf(h.open),
            endMinute: minuteOf(h.close),
        })),
    });
    return { serviceId: service.id };
}

// --- Contacts --------------------------------------------------------------

async function writeCrm(
    tx: ModuleTransaction,
    ctx: OrganizationContext,
): Promise<SetupCreated> {
    const organizationId = ctx.organizationId;
    const existing = await tx.pipeline.findFirst({
        where: { organizationId },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        select: { id: true },
    });
    if (existing) return { pipelineId: existing.id };
    // The one lead creation makes when it first needs one (PipelinesService
    // .ensureDefault): "Sales", New → Lost.
    const pipeline = await tx.pipeline.create({
        data: {
            organizationId,
            name: "Sales",
            isDefault: true,
            stages: {
                create: DEFAULT_STAGES.map((name, order) => ({
                    organizationId,
                    name,
                    order,
                })),
            },
        },
        select: { id: true },
    });
    return { pipelineId: pipeline.id };
}

// --- Website ---------------------------------------------------------------

/** The business's live website, if it has one. */
export function existingSite(
    db: Pick<ModuleTransaction, "site">,
    organizationId: string,
): Promise<{
    id: string;
    name: string;
    subdomain: string | null;
    storefrontId: string | null;
} | null> {
    return db.site.findFirst({
        where: { organizationId, deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, subdomain: true, storefrontId: true },
    });
}

async function prepareWebsite(
    ctx: OrganizationContext,
    setup: WebsiteSetupDto,
    entitlements: Entitlements,
): Promise<SetupWrite> {
    authorize(ctx, "site:create");
    const site = await existingSite(prisma, ctx.organizationId);
    if (site) {
        // Turned on again: its website is still there, unpublished or not,
        // and only what selling online needs and it lacks is added.
        return async (tx) => {
            await shopForWebsite(tx, ctx, site.id);
            return { siteId: site.id, siteAddress: site.subdomain };
        };
    }
    // The `/sites/new` flow and its starter template, caps included.
    const plan: SitePlan = await planSiteFromTemplate(
        ctx,
        { name: setup.siteName },
        entitlements,
    );
    return async (tx) => {
        const created = await writeSiteFromTemplate(tx, ctx, plan, {
            subdomain: setup.address,
            addressField: "setup.address",
        });
        await shopForWebsite(tx, ctx, created.siteId);
        return { siteId: created.siteId, siteAddress: setup.address };
    };
}

// --- Selling online on the website (DEC-069, L13) --------------------------

/** The ways an order leaves that need the website: it is sent. */
function sellsOnline(fulfilmentTypes: readonly string[]): boolean {
    return fulfilmentTypes.some(
        (t) => t === "LOCAL_DELIVERY" || t === "SHIPPING",
    );
}

/**
 * Finish the website's side once the location is known:
 * - `link`: the site has no Sells from (none, or a closed one), so it sells
 *   from this location;
 * - the location delivers or ships: a draft Shop page, unless the site has
 *   one, a page of the merchant's holds `/shop`, or the shop isn't open for
 *   the business (`addModulePageIfMissing`).
 */
async function completeShop(
    tx: ModuleTransaction,
    ctx: OrganizationContext,
    site: { id: string; name: string; storefrontId: string | null },
    location: { id: string; fulfilmentTypes: readonly string[] },
    link: boolean,
): Promise<void> {
    if (link) {
        const current = await effectiveStorefront(tx, {
            organizationId: ctx.organizationId,
            storefrontId: site.storefrontId,
        });
        if (!current) {
            await tx.site.update({
                where: { id: site.id },
                data: { storefrontId: location.id },
            });
        }
    }
    if (sellsOnline(location.fulfilmentTypes)) {
        await addModulePageIfMissing(tx, ctx, site, "SHOP");
    }
}

/**
 * Sell was turned on (second, when the website came first): the site sells
 * from the location the sheet just named — the merchant has answered — and
 * gets its Shop page when that location delivers or ships.
 */
async function shopForSell(
    tx: ModuleTransaction,
    ctx: OrganizationContext,
    storefrontId: string,
    fulfilmentTypes: readonly string[],
): Promise<void> {
    const site = await existingSite(tx, ctx.organizationId);
    if (!site) return;
    await completeShop(
        tx,
        ctx,
        site,
        { id: storefrontId, fulfilmentTypes },
        true,
    );
}

/**
 * Website was turned on (second, after Sell — the order the Turn on sheet
 * uses): with Sell on, the site sells from Sell's location and gets its Shop
 * page when that location delivers or ships.
 *
 * The Sells from is set here only while nothing is listed anywhere — the
 * turn-on moment KTD-10 is about. A business already listing at several
 * locations is asked which one, as G11 asks; the site is never pointed at
 * "the first storefront" over products it sells elsewhere.
 */
async function shopForWebsite(
    tx: ModuleTransaction,
    ctx: OrganizationContext,
    siteId: string,
): Promise<void> {
    const organizationId = ctx.organizationId;
    const commerce = await tx.organizationModule.findUnique({
        where: {
            organizationId_moduleKey: { organizationId, moduleKey: "COMMERCE" },
        },
        select: { status: true },
    });
    if (commerce?.status !== "ENABLED") return;
    // One query at a time: a transaction runs on one connection.
    const location = await firstStorefront(tx, organizationId);
    if (!location) return;
    const site = await tx.site.findUniqueOrThrow({
        where: { id: siteId },
        select: { id: true, name: true, storefrontId: true },
    });
    const listed = await anyListed(tx, organizationId);
    await completeShop(
        tx,
        ctx,
        site,
        {
            id: location.id,
            fulfilmentTypes: location.settings?.fulfilmentTypes ?? [],
        },
        !listed,
    );
}
