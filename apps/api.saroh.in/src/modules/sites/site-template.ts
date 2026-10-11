import { NotFoundException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";
import type { InstantiatedPage, TemplateContext } from "@saroh/templates";
import {
    BUSINESS_LINE_MAX_NAMES,
    businessArea,
    composeBusinessLine,
    getTemplate,
    PERSONAL_TEMPLATE_ID,
    PORTFOLIO_TEMPLATE_ID,
    STARTER_TEMPLATE_ID,
} from "@saroh/templates";

import type { ModuleKey } from "../capabilities/module-registry";
import { moduleRolledOut } from "../capabilities/module-registry";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import type { OrganizationKind } from "../organizations/organization-kind";
import { modulePageState } from "./module-pages";
import { publicWeek, registeredAddress } from "./public-visit.service";

/**
 * What a new site's template needs from the business, beyond the template
 * itself (DEC-070, K15):
 *
 * - {@link KIND_TEMPLATE}: the template a new site starts from when none is
 *   asked for, by what is being set up (plan KTD-6). A choice in
 *   `/sites/new` always wins. Words and defaults only (R3): the kind never
 *   decides which templates a business may use.
 * - {@link buildTemplateContext}: the business profile a template's content
 *   builders read, with the modules that are on, the services a site may
 *   list, its place, and one line on what it does (DEC-141).
 * - {@link withEnquiryForms}: a Form for every enquiry section, so the form
 *   takes enquiries from the first publish rather than from the first save
 *   in the editor.
 */

/** The template a new site starts from, per kind (plan KTD-6). */
export const KIND_TEMPLATE: Record<OrganizationKind, string> = {
    BUSINESS: STARTER_TEMPLATE_ID,
    SOLO: PERSONAL_TEMPLATE_ID,
    WORK: PORTFOLIO_TEMPLATE_ID,
};

/** The kind's template id and its name, for "Starts from Portfolio". */
export function kindTemplate(kind: OrganizationKind): {
    id: string;
    name: string;
} {
    const id = KIND_TEMPLATE[kind];
    return { id, name: getTemplate(id)?.name ?? "Starter" };
}

/** A services list holds at most this many (its contract). */
const SERVICES_LIST_MAX = 24;

// Stateless (it reads the flag rows on every call), as `module-pages.ts`.
const flags = new FeatureFlagService();

/**
 * The switched-on modules a template may lay a bound block down for: an
 * ENABLED row whose module is rolled out for the business (DEC-057). A
 * business with no row for a module gets nothing that needs it: a template
 * adds only what is known to be on.
 */
async function modulesOn(
    db: ContextDb,
    organizationId: string,
): Promise<string[]> {
    const rows = await db.organizationModule.findMany({
        where: { organizationId, status: "ENABLED" },
        select: { moduleKey: true },
        orderBy: { moduleKey: "asc" },
    });
    const keys = rows.map((r) => r.moduleKey as ModuleKey);
    const rolledOut = await Promise.all(
        keys.map((k) => moduleRolledOut(flags, k, organizationId)),
    );
    return keys.filter((_, i) => rolledOut[i]);
}

/** What the context is read with: the client, or a caller's transaction. */
export type ContextDb = Pick<
    Prisma.TransactionClient,
    "organization" | "organizationModule" | "service" | "category" | "store"
>;

export interface TemplateContextOptions {
    /**
     * Read on this client. A caller inside a transaction passes it, so a
     * module switched on in that transaction is seen as on.
     */
    db?: ContextDb;
    /**
     * The site the context is for, when it exists: its own services are
     * listed beside the business's. Absent for a site being made, which
     * has none of its own yet.
     */
    siteId?: string;
    /**
     * A module to read as off, whatever its row says: what the template
     * made BEFORE that module was switched on (`template-sync.ts`).
     */
    without?: string;
}

/** How many of the business's own names the line is composed from. */
const LINE_NAMES = BUSINESS_LINE_MAX_NAMES + 1;

/**
 * Build the {@link TemplateContext} a template instantiates against, from
 * what the business has already told Saroh:
 *
 * - its name and profile (legal name, contact email, website, town);
 * - the modules that are on and rolled out for it;
 * - the services a site may list: active, shown on the booking page (E1),
 *   of this site or of no site, oldest first, as a Book page lists them;
 * - whether its shop can be shown (the Shop page's own gate);
 * - whether it has a place with an address, and a week of hours (what the
 *   Visit us block reads: its first open shop, else its profile);
 * - **one line on what it does** (`description`, DEC-141), composed from
 *   its own names: its services where it takes bookings, else the
 *   categories it has products on sale in, and its town. Nothing was ever
 *   passed here before, so every starter hero showed its note to the owner
 *   instead. Left out when the business has named nothing: a template then
 *   says nothing, never a prompt.
 *
 * One query at a time: on a transaction the reads share one connection.
 */
export async function buildTemplateContext(
    organizationId: string,
    options: TemplateContextOptions = {},
): Promise<TemplateContext> {
    const db = options.db ?? prisma;
    const org = await db.organization.findUnique({
        where: { id: organizationId },
        select: {
            name: true,
            businessProfile: {
                select: {
                    legalName: true,
                    contactEmail: true,
                    website: true,
                    addressLine1: true,
                    addressLine2: true,
                    city: true,
                    postalCode: true,
                },
            },
        },
    });
    if (!org) {
        // The guard proved membership in this org, so it must exist; a miss
        // here is a real integrity fault, not a client error.
        throw new NotFoundException(`Business "${organizationId}" not found`);
    }
    const profile = org.businessProfile;
    const modules = (await modulesOn(db, organizationId)).filter(
        (key) => key !== options.without,
    );
    const services = await db.service.findMany({
        where: {
            organizationId,
            deletedAt: null,
            status: "ACTIVE",
            showOnBookingPage: true,
            ...(options.siteId
                ? { OR: [{ siteId: null }, { siteId: options.siteId }] }
                : { siteId: null }),
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: SERVICES_LIST_MAX,
        select: { id: true, name: true, capacity: true },
    });
    const books = modules.includes("APPOINTMENTS") && services.length > 0;

    // It sells ONLINE: the Shop page's own gate (so Home never shows a grid
    // the shop's route would refuse), and a first location that sends
    // orders out. The rule that gives a site its Shop page when Sell is
    // switched on (DEC-069, L13, `module-setup.writers.ts`): a counter that
    // only hands orders over is not a shop on the website.
    const sells =
        modules.includes("COMMERCE") &&
        (await modulePageState("SHOP", organizationId, db)).state === "on" &&
        (await sendsOrders(db, organizationId));
    // Asked only when they would be said: a business that takes bookings
    // is described by its services.
    const categories =
        sells && !books
            ? await db.category.findMany({
                  where: {
                      organizationId,
                      parentId: null,
                      products: { some: { status: "PUBLISHED" } },
                  },
                  orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                  take: LINE_NAMES,
                  select: { name: true },
              })
            : [];

    const place = await businessPlace(db, organizationId, profile);
    const area = businessArea(profile?.city) ?? undefined;
    const description = composeBusinessLine({
        offers: books
            ? services.slice(0, LINE_NAMES).map((s) => s.name)
            : categories.map((c) => c.name),
        area,
    });

    return {
        organizationName: org.name,
        legalName: profile?.legalName ?? undefined,
        contactEmail: profile?.contactEmail ?? undefined,
        websiteUrl: profile?.website ?? undefined,
        ...(description ? { description } : {}),
        modules,
        serviceIds: services.map((s) => s.id),
        sells,
        hasClasses: services.some((s) => s.capacity > 1),
        ...(area ? { area } : {}),
        hasPlace: place.address,
        hasHours: place.hours,
    };
}

/**
 * Whether the business's first location delivers or ships: the location
 * Sell's setup names (`firstStorefront`, `module-setup.writers.ts`), and
 * the ways that need the website.
 */
async function sendsOrders(
    db: ContextDb,
    organizationId: string,
): Promise<boolean> {
    const first = await db.store.findFirst({
        where: { organizationId, deletedAt: null },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { settings: { select: { fulfilmentTypes: true } } },
    });
    return (first?.settings?.fulfilmentTypes ?? []).some(
        (way) => way === "LOCAL_DELIVERY" || way === "SHIPPING",
    );
}

/**
 * Whether the business has an address and a week of hours to show: the
 * place the Visit us and hours blocks read when they name none
 * (`public-visit.service.ts`). Its first open shop, else the registered
 * address and the first storefront's week.
 */
async function businessPlace(
    db: ContextDb,
    organizationId: string,
    profile: Parameters<typeof registeredAddress>[0] | null | undefined,
): Promise<{ address: boolean; hours: boolean }> {
    const order = [{ createdAt: "asc" as const }, { id: "asc" as const }];
    const select = {
        settings: { select: { address: true, openingHours: true } },
    };
    const shop = await db.store.findFirst({
        where: {
            organizationId,
            deletedAt: null,
            settings: { is: { kind: "SHOP" } },
        },
        orderBy: order,
        select,
    });
    if (shop) {
        return {
            address: (shop.settings?.address ?? "").trim() !== "",
            hours: publicWeek(shop.settings?.openingHours) !== null,
        };
    }
    const first = await db.store.findFirst({
        where: { organizationId, deletedAt: null },
        orderBy: order,
        select,
    });
    return {
        address: profile ? registeredAddress(profile) !== null : false,
        hours: publicWeek(first?.settings?.openingHours) !== null,
    };
}

/** The enquiry fields a template lays down, as a Form stores them. */
function enquiryFields(
    content: Record<string, unknown>,
): Prisma.InputJsonValue {
    return (
        Array.isArray(content.fields) ? content.fields : []
    ) as Prisma.InputJsonValue;
}

/**
 * Make a Form for every enquiry section that has none, on `tx`, and return
 * the pages with each Form's id in its section.
 *
 * A template can only lay down content, so its enquiry sections come with
 * no `formId`, and without one the block draws nothing on the live site.
 * The editor makes the Form on its first save (`sync-enquiry-forms.ts`);
 * a site published before that would carry a form that takes nothing. So
 * the Form is made with the site, as a Contact page's is
 * (`module-page-sections.ts`), and named as the editor names it: the
 * section's title, else "‹site› enquiry".
 */
export async function withEnquiryForms(
    tx: Pick<Prisma.TransactionClient, "form">,
    input: { organizationId: string; siteId: string; siteName: string },
    pages: readonly InstantiatedPage[],
): Promise<InstantiatedPage[]> {
    const out: InstantiatedPage[] = [];
    for (const page of pages) {
        out.push({
            ...page,
            sections: await withSectionForms(tx, input, page.sections),
        });
    }
    return out;
}

/**
 * {@link withEnquiryForms} for one page's sections, whatever else each
 * section carries (a key, whether it is hidden): what a page being brought
 * up to its template needs (`template-sync.ts`).
 */
export async function withSectionForms<
    S extends { type: string; content: unknown },
>(
    tx: Pick<Prisma.TransactionClient, "form">,
    input: { organizationId: string; siteId: string; siteName: string },
    sections: readonly S[],
): Promise<S[]> {
    const out: S[] = [];
    for (const section of sections) {
        const content = section.content as Record<string, unknown>;
        if (section.type !== "enquiry" || content.formId) {
            out.push(section);
            continue;
        }
        const title =
            typeof content.title === "string" ? content.title.trim() : "";
        // One at a time: a transaction runs on one connection.
        const form = await tx.form.create({
            data: {
                organizationId: input.organizationId,
                siteId: input.siteId,
                name: title || `${input.siteName} enquiry`,
                fields: enquiryFields(content),
                status: "ACTIVE",
            },
            select: { id: true },
        });
        out.push({ ...section, content: { ...content, formId: form.id } });
    }
    return out;
}
