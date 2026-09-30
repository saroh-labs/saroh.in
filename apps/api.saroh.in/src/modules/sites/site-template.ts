import { NotFoundException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";
import type { InstantiatedPage, TemplateContext } from "@saroh/templates";
import {
    getTemplate,
    PERSONAL_TEMPLATE_ID,
    PORTFOLIO_TEMPLATE_ID,
    STARTER_TEMPLATE_ID,
} from "@saroh/templates";

import type { ModuleKey } from "../capabilities/module-registry";
import { moduleRolledOut } from "../capabilities/module-registry";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import type { OrganizationKind } from "../organizations/organization-kind";

/**
 * What a new site's template needs from the business, beyond the template
 * itself (DEC-070, K15):
 *
 * - {@link KIND_TEMPLATE}: the template a new site starts from when none is
 *   asked for, by what is being set up (plan KTD-6). A choice in
 *   `/sites/new` always wins. Words and defaults only (R3): the kind never
 *   decides which templates a business may use.
 * - {@link buildTemplateContext}: the business profile a template's content
 *   builders read, with the modules that are on and the services a new site
 *   may list.
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
async function modulesOn(organizationId: string): Promise<string[]> {
    const rows = await prisma.organizationModule.findMany({
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

/**
 * Build the {@link TemplateContext} a template instantiates against, from
 * the org's name and business profile, the modules that are on, and the
 * services a new site may list: active, shown on the booking page (E1) and
 * of no site (a site being made has none of its own yet), oldest first, as
 * a Book page lists them.
 */
export async function buildTemplateContext(
    organizationId: string,
): Promise<TemplateContext> {
    const [org, modules, services] = await Promise.all([
        prisma.organization.findUnique({
            where: { id: organizationId },
            select: {
                name: true,
                businessProfile: {
                    select: {
                        legalName: true,
                        contactEmail: true,
                        website: true,
                    },
                },
            },
        }),
        modulesOn(organizationId),
        prisma.service.findMany({
            where: {
                organizationId,
                deletedAt: null,
                status: "ACTIVE",
                showOnBookingPage: true,
                siteId: null,
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: SERVICES_LIST_MAX,
            select: { id: true },
        }),
    ]);
    if (!org) {
        // The guard proved membership in this org, so it must exist; a miss
        // here is a real integrity fault, not a client error.
        throw new NotFoundException(
            `Organization "${organizationId}" not found`,
        );
    }
    const profile = org.businessProfile;
    return {
        organizationName: org.name,
        legalName: profile?.legalName ?? undefined,
        contactEmail: profile?.contactEmail ?? undefined,
        websiteUrl: profile?.website ?? undefined,
        modules,
        serviceIds: services.map((s) => s.id),
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
        const sections = [];
        for (const section of page.sections) {
            const content = section.content as Record<string, unknown>;
            if (section.type !== "enquiry" || content.formId) {
                sections.push(section);
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
            sections.push({
                ...section,
                content: { ...content, formId: form.id },
            });
        }
        out.push({ ...page, sections });
    }
    return out;
}
