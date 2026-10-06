import {
    BadRequestException,
    ConflictException,
    InternalServerErrorException,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";
import type { TemplateManifest } from "@saroh/templates";
import {
    getTemplate,
    instantiateTemplate,
    TemplateInstantiationError,
    templateStylePreset,
} from "@saroh/templates";
import { randomUUID } from "node:crypto";

import { prismaErrorCode } from "../../common/prisma-errors";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import { planMeter } from "../billing/metering.service";
import {
    LEGACY_WEBSITES_PER_BUSINESS,
    MAX_WEBSITES_PER_BUSINESS,
} from "../organizations/business-limits";
import { organizationKind } from "../organizations/organization-kind";
import { authorize } from "../organizations/organization-policy";
import { automaticStorefront } from "./sells-from";
import {
    addressProblem,
    addressUse,
    freeAddress,
    releaseExpired,
} from "./site-address";
import type { SiteStyle } from "./site-style";
import { parseSiteStyle } from "./site-style";
import {
    buildTemplateContext,
    KIND_TEMPLATE,
    withEnquiryForms,
} from "./site-template";
import type { SiteTemplateRecord } from "./site-template-record";

/**
 * Creating a website from a template (S2-003), in two halves so a caller
 * can put the write in its own transaction: Sites' `/sites/new`
 * (`SitesService.createFromTemplate`) runs it alone; turning Website on
 * with its setup (DEC-068) runs it inside the module switch's transaction,
 * so the site and the switch commit together or not at all.
 *
 * - {@link planSiteFromTemplate}: who may, the caps, the template, the
 *   slug and the instantiated pages. Reads only.
 * - {@link writeSiteFromTemplate}: the address rules and the whole tree —
 *   Site, Pages, DRAFT versions and their Sections, and a Form for each
 *   enquiry section — on the client given.
 *
 * With no template asked for, a site starts from its business's kind's
 * (DEC-070, K15): the starter for a business, Personal for "Just me",
 * Portfolio for "A site for my work" (`site-template.ts`).
 */

/** What creating a site returns to the caller: the new site's identity. */
export interface CreatedSite {
    siteId: string;
    slug: string;
}

/** Everything the write needs, worked out before the transaction. */
export interface SitePlan {
    name: string;
    slug: string;
    pages: ReturnType<typeof instantiateTemplate>["pages"];
    /** The template it is made from, recorded on the Site (KTD-7). */
    template: SiteTemplateRecord;
    /**
     * The look the site starts in: the template's colourway, validated as a
     * saved style is. Absent when the template has none — the site keeps the
     * default look, as every site did before templates carried styles.
     */
    style?: { id: string; value: SiteStyle };
}

/** What a caller asks for: the `/sites/new` body's fields. */
export interface SiteRequest {
    name: string;
    slug?: string;
    subdomain?: string;
    templateId?: string;
    templateVersion?: number;
    /** One of the template's colourways; its first when absent. */
    styleId?: string;
}

/**
 * The colourway a site made from `template` starts in (plan KTD-1), parsed
 * through the same rules as a style the merchant saves, so a template can
 * only choose what Website › Style could have.
 *
 * - No `styleId`: the template's first colourway, or none if it has none.
 * - A `styleId` the template has: that one.
 * - A `styleId` it does not have: a 400 on the field, rather than a site in a
 *   look nobody asked for.
 *
 * A shipped template whose colourway fails the style rules is a server bug
 * (a template unit's spec catches it first), reported as one.
 */
export function planTemplateStyle(
    template: Pick<TemplateManifest, "id" | "version" | "styles">,
    styleId?: string,
): SitePlan["style"] {
    const preset = templateStylePreset(template, styleId);
    if (preset === null) {
        throw new BadRequestException({
            message: `"${styleId}" is not one of this template's colourways`,
            details: { field: "styleId" },
        });
    }
    if (!preset) return undefined;
    try {
        return { id: preset.id, value: parseSiteStyle(preset.style) };
    } catch {
        throw new InternalServerErrorException(
            `Template "${template.id}" v${template.version} has an invalid style "${preset.id}"`,
        );
    }
}

/**
 * Mint a section key. Opaque and random rather than derived from position or
 * content: a key that encoded either would stop being stable the moment a
 * section moved or was edited, which is exactly what it exists to survive.
 */
export function newSectionKey(): string {
    return randomUUID();
}

/**
 * Turn an arbitrary name/slug input into a URL-safe site slug. Pure (no DB).
 * A small local copy of the organization slugify so the sites module has no
 * cross-module import; the CMS slug rules are identical for now.
 */
export function slugify(input: string): string {
    const collapsed = input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s_-]/g, "")
        .replace(/[\s_-]+/g, "-");
    // Trim leading/trailing "-" by index rather than /^-+|-+$/. The collapse
    // above already leaves at most one dash in a row, so the regex could not
    // actually backtrack — but CodeQL cannot see that (js/polynomial-redos),
    // and an index scan is unconditionally linear.
    let start = 0;
    let end = collapsed.length;
    while (start < end && collapsed[start] === "-") start++;
    while (end > start && collapsed[end - 1] === "-") end--;
    return collapsed.slice(start, end);
}

/**
 * Authorize `site:create`, enforce the caps, resolve the template (the one
 * asked for, else the latest of the kind's), load the org's name, business
 * profile, modules and services and instantiate the contract-validated pages.
 */
export async function planSiteFromTemplate(
    ctx: OrganizationContext,
    dto: SiteRequest,
    entitlements: Pick<EntitlementService, "check">,
): Promise<SitePlan> {
    authorize(ctx, "site:create");

    // Caps on the org's live sites (soft-deleted excluded). The product's
    // comes first, whatever the plan says: upgrading would not help, so it
    // is a 409 in plain words, not "upgrade to add more". Then the plan's:
    // where the catalogue governs websites (its `sites` row, behind
    // PLAN_ENFORCEMENT), metering counts them on the write's transaction
    // (`writeSiteFromTemplate`); elsewhere one website per business as
    // before (ADR-006), and the `sites` floor (S7-005), a 403.
    const siteCount = await prisma.site.count({
        where: { organizationId: ctx.organizationId, deletedAt: null },
    });
    if (siteCount >= MAX_WEBSITES_PER_BUSINESS) {
        throw new ConflictException({
            message: `This business has ${siteCount} websites, as many as Saroh allows. Delete one it no longer uses to add another.`,
        });
    }
    if (!(await planMeter.enforcedRow(ctx.organizationId, "sites"))) {
        if (siteCount >= LEGACY_WEBSITES_PER_BUSINESS) {
            throw new ConflictException({
                message:
                    "This business already has its website. Change its pages, look and address from Website.",
            });
        }
        await entitlements.check(ctx.organizationId, "sites", siteCount);
    }

    // The kind picks a default only; an explicit choice always wins.
    const templateId =
        dto.templateId ??
        KIND_TEMPLATE[await organizationKind(prisma, ctx.organizationId)];
    const template = getTemplate(templateId, dto.templateVersion);
    if (!template) {
        throw new NotFoundException(
            dto.templateVersion === undefined
                ? `Unknown template "${templateId}"`
                : `Unknown template "${templateId}" v${dto.templateVersion}`,
        );
    }

    // Before any read: a colourway the template lacks is the caller's error.
    const style = planTemplateStyle(template, dto.styleId);

    const slug = slugify(dto.slug ?? dto.name);
    if (!slug) {
        throw new BadRequestException(
            "Site name must contain at least one alphanumeric character",
        );
    }

    const context = await buildTemplateContext(ctx.organizationId);

    try {
        return {
            name: dto.name,
            slug,
            pages: instantiateTemplate(template, context).pages,
            template: {
                id: template.id,
                version: template.version,
                // The colourway the site starts in (U1), or none.
                styleId: style?.id ?? null,
            },
            ...(style ? { style } : {}),
        };
    } catch (error) {
        if (error instanceof TemplateInstantiationError) {
            // A shipped template should never emit an invalid section; if it
            // does, that's a server bug, not bad client input.
            throw new InternalServerErrorException(
                `Template "${template.id}" v${template.version} produced an invalid site`,
            );
        }
        throw error;
    }
}

/** A unique-constraint failure on `field` (Prisma's P2002). */
function isUniqueViolation(error: unknown, field: string): boolean {
    if (prismaErrorCode(error) !== "P2002") return false;
    // Where the column is named differs between the engine (`meta.target`)
    // and the driver adapter (nested under `meta.driverAdapterError`).
    const meta = (error as { meta?: unknown }).meta;
    return JSON.stringify(meta ?? {}).includes(field);
}

/**
 * The address a new site is served at (`<address>.saroh.app`), on `tx`. A
 * site is never made without one (DEC-069, L5): this returns an address, or
 * refuses in a way the form can put on the field.
 *
 * - Asked for: it must pass the shape rules (a 400), and be free — of other
 *   businesses' setup addresses, their sites and the addresses they still
 *   hold after a change, and of this business's own other sites, deleted
 *   ones included, since a site's address is unique.
 * - Not asked for: the address the business chose at setup, under the same
 *   rules. It is normally free to them — setup reserved it — but an old
 *   business's may be in use or fail a rule added since. Then the site is
 *   not made without one: it is refused, with a free address to offer.
 *
 * Every 409 carries `{ field, reason, suggestion }` — `reason` is `taken`,
 * or `unusable` for a setup address today's rules refuse — the suggestion
 * from {@link freeAddress}. An expired hold on the address is released first
 * (L1), so a claim is never refused by a reservation that has run out.
 */
export async function claimSiteAddress(
    tx: Prisma.TransactionClient,
    organizationId: string,
    asked: string | undefined,
    field = "subdomain",
): Promise<string> {
    let address = asked;
    if (address) {
        const problem = addressProblem(address);
        if (problem) {
            throw new BadRequestException({
                message: problem,
                details: { field },
            });
        }
    } else {
        const business = await tx.organization.findUniqueOrThrow({
            where: { id: organizationId },
            select: { slug: true },
        });
        address = business.slug;
        if (addressProblem(address)) {
            // An address from before today's rules (a `--`, say): usable
            // where it already is, never claimed anew.
            const suggestion = await freeAddress(tx, address, organizationId);
            throw new ConflictException({
                message: `${address}.saroh.app can't be used for a new site. Choose a web address for it.`,
                details: {
                    field,
                    reason: "unusable",
                    ...(suggestion ? { suggestion } : {}),
                },
            });
        }
    }

    await releaseExpired(tx, address);
    // Read across every business (site-address.ts): under RLS `tx` sees
    // only this one, and another's claim would look free.
    const use = await addressUse(tx, address);
    const another = (owner: string | null) =>
        owner !== null && owner !== organizationId;
    const heldElsewhere =
        another(use.reservedBy) || another(use.heldBy) || another(use.siteOf);
    // A site of this business's own (a deleted one keeps its address).
    const ownSite = use.siteOf === organizationId;
    if (heldElsewhere || ownSite) {
        const suggestion = await freeAddress(tx, address, organizationId);
        throw new ConflictException({
            message: heldElsewhere
                ? `${address}.saroh.app belongs to another business`
                : `${address}.saroh.app is already in use`,
            details: {
                field,
                reason: "taken",
                ...(suggestion ? { suggestion } : {}),
            },
        });
    }
    return address;
}

/**
 * Write the planned site on `tx`. `subdomain` is the address asked for, if
 * any; `addressField` names it in a refusal (`subdomain` for `/sites/new`,
 * `setup.address` for the Turn on sheet). Without one, the site takes its
 * business's own address, or is refused with a free one to offer
 * (`details.suggestion`, DEC-069): `subdomain` is always set.
 */
export async function writeSiteFromTemplate(
    tx: Prisma.TransactionClient,
    ctx: OrganizationContext,
    plan: SitePlan,
    options: { subdomain?: string; addressField?: string } = {},
): Promise<CreatedSite> {
    const field = options.addressField ?? "subdomain";

    // The plan's websites, first on the transaction (it takes the meter's
    // lock): nothing where the catalogue doesn't govern them.
    await planMeter.roomInTx(tx, ctx.organizationId, "sites");

    // Fail fast on a taken slug with a clear 409 (the unique is
    // [organizationId, slug]); the check + create share the txn.
    const existing = await tx.site.findFirst({
        where: {
            organizationId: ctx.organizationId,
            slug: plan.slug,
            deletedAt: null,
        },
        select: { id: true },
    });
    if (existing) {
        throw new ConflictException(
            `A site with the slug "${plan.slug}" already exists in this organization`,
        );
    }

    const subdomain = await claimSiteAddress(
        tx,
        ctx.organizationId,
        options.subdomain,
        field,
    );

    let site: { id: string; slug: string };
    try {
        site = await tx.site.create({
            data: {
                organizationId: ctx.organizationId,
                name: plan.name,
                slug: plan.slug,
                subdomain,
                templateId: plan.template.id,
                templateVersion: plan.template.version,
                templateStyleId: plan.template.styleId,
                // Where it sells from (G11): set only when there is
                // exactly one candidate, and the settings say so.
                storefrontId: await automaticStorefront(tx, ctx.organizationId),
                // The template's colourway (KTD-1), if it has one.
                ...(plan.style
                    ? {
                          style: plan.style
                              .value as unknown as Prisma.InputJsonValue,
                      }
                    : {}),
            },
            select: { id: true, slug: true },
        });
    } catch (error) {
        // Another site took the address between the check and this write.
        // The transaction is spent, so there is no suggestion to look up:
        // asking again gets one.
        if (isUniqueViolation(error, "subdomain")) {
            throw new ConflictException({
                message: `${subdomain}.saroh.app was just taken. Choose another address.`,
                details: { field, reason: "taken" },
            });
        }
        throw error;
    }

    // A Form for every enquiry section, so it takes enquiries from the
    // first publish (a template can lay down content only).
    const pages = await withEnquiryForms(
        tx,
        {
            organizationId: ctx.organizationId,
            siteId: site.id,
            siteName: plan.name,
        },
        plan.pages,
    );

    for (const page of pages) {
        await tx.page.create({
            data: {
                siteId: site.id,
                organizationId: ctx.organizationId,
                path: page.path,
                title: page.title,
                isHome: page.isHome,
                versions: {
                    create: {
                        organizationId: ctx.organizationId,
                        status: "DRAFT",
                        createdByUserId: ctx.userId,
                        sections: {
                            create: page.sections.map((section) => ({
                                organizationId: ctx.organizationId,
                                // Minted here so a section has a stable
                                // identity from the moment it exists.
                                key: newSectionKey(),
                                type: section.type,
                                contractVersion: section.contractVersion,
                                order: section.order,
                                content:
                                    section.content as Prisma.InputJsonValue,
                            })),
                        },
                    },
                },
            },
        });
    }

    return { siteId: site.id, slug: site.slug };
}
