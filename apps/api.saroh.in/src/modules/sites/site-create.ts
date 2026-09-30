import {
    BadRequestException,
    ConflictException,
    InternalServerErrorException,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";
import {
    getTemplate,
    instantiateTemplate,
    STARTER_TEMPLATE_ID,
    TemplateInstantiationError,
} from "@saroh/templates";
import { randomUUID } from "node:crypto";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import { MAX_WEBSITES_PER_BUSINESS } from "../organizations/business-limits";
import { authorize } from "../organizations/organization-policy";
import { automaticStorefront } from "./sells-from";
import { buildTemplateContext } from "./site-access";
import { addressProblem, addressUse, freeAddress } from "./site-address";

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
 *   Site, Pages, DRAFT versions and their Sections — on the client given.
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
}

/** What a caller asks for: the `/sites/new` body's fields. */
export interface SiteRequest {
    name: string;
    slug?: string;
    subdomain?: string;
    templateId?: string;
    templateVersion?: number;
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
 * Authorize `site:create`, enforce the caps, resolve the template (latest
 * starter by default), load the org's name + business profile and
 * instantiate the contract-validated pages.
 */
export async function planSiteFromTemplate(
    ctx: OrganizationContext,
    dto: SiteRequest,
    entitlements: Pick<EntitlementService, "check">,
): Promise<SitePlan> {
    authorize(ctx, "site:create");

    // Two caps on the org's live sites (soft-deleted excluded). The
    // product's comes first (ADR-006): one website per business for now,
    // whatever the plan says, and upgrading would not help — so it is a
    // 409 in plain words, not "upgrade to add more". Then the
    // subscription's `sites` entitlement (S7-005), a 403 at the plan
    // limit. The lower of the two wins.
    const siteCount = await prisma.site.count({
        where: { organizationId: ctx.organizationId, deletedAt: null },
    });
    if (siteCount >= MAX_WEBSITES_PER_BUSINESS) {
        throw new ConflictException({
            message:
                "This business already has its website. Change its pages, look and address from Website.",
        });
    }
    await entitlements.check(ctx.organizationId, "sites", siteCount);

    const templateId = dto.templateId ?? STARTER_TEMPLATE_ID;
    const template = getTemplate(templateId, dto.templateVersion);
    if (!template) {
        throw new NotFoundException(
            dto.templateVersion === undefined
                ? `Unknown template "${templateId}"`
                : `Unknown template "${templateId}" v${dto.templateVersion}`,
        );
    }

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

/**
 * Write the planned site on `tx`. `subdomain` is the address asked for, if
 * any; `addressField` names it in a refusal (`subdomain` for `/sites/new`,
 * `setup.address` for the Turn on sheet). A refusal over an address in use
 * carries a free one in `details.suggestion` (DEC-069).
 */
export async function writeSiteFromTemplate(
    tx: Prisma.TransactionClient,
    ctx: OrganizationContext,
    plan: SitePlan,
    options: { subdomain?: string; addressField?: string } = {},
): Promise<CreatedSite> {
    const field = options.addressField ?? "subdomain";

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

    /*
     * Where the site is served (`<subdomain>.saroh.app`).
     *
     * Asked for: it must be a usable address, free of other sites,
     * and not the address ANOTHER business reserved at setup or still
     * holds after a change — that is a promise (see site-address.ts),
     * and a site taking it would break it.
     *
     * Not asked for: the site takes the address its own business
     * reserved, while no site of theirs uses it yet — so the address
     * a merchant chose at setup is where their first website appears.
     */
    let subdomain = options.subdomain;
    if (subdomain) {
        const problem = addressProblem(subdomain);
        if (problem) {
            throw new BadRequestException({
                message: problem,
                details: { field },
            });
        }
        // Read across every business (site-address.ts): under RLS `tx`
        // sees only this one, and another's claim would look free.
        const use = await addressUse(tx, subdomain);
        const another = (owner: string | null) =>
            owner !== null && owner !== ctx.organizationId;
        if (another(use.reservedBy) || another(use.heldBy)) {
            const suggestion = await freeAddress(
                tx,
                subdomain,
                ctx.organizationId,
            );
            throw new ConflictException({
                message: `${subdomain}.saroh.app belongs to another business`,
                details: {
                    field,
                    reason: "taken",
                    ...(suggestion ? { suggestion } : {}),
                },
            });
        }
    } else {
        const business = await tx.organization.findUnique({
            where: { id: ctx.organizationId },
            select: { slug: true },
        });
        if (business?.slug && !addressProblem(business.slug)) {
            subdomain = business.slug;
        }
    }

    // Subdomain is globally unique when set; reject a clash up front
    // rather than surfacing a raw constraint error. A default that
    // turns out to be in use is simply not taken, not an error.
    if (subdomain) {
        // Any website at it, another business's too (read across them all).
        const taken = (await addressUse(tx, subdomain)).siteOf !== null;
        if (taken && options.subdomain) {
            const suggestion = await freeAddress(
                tx,
                subdomain,
                ctx.organizationId,
            );
            throw new ConflictException({
                message: `The subdomain "${subdomain}" is already taken`,
                details: {
                    field,
                    reason: "taken",
                    ...(suggestion ? { suggestion } : {}),
                },
            });
        }
        if (taken) subdomain = undefined;
    }

    const site = await tx.site.create({
        data: {
            organizationId: ctx.organizationId,
            name: plan.name,
            slug: plan.slug,
            subdomain,
            // Where it sells from (G11): set only when there is
            // exactly one candidate, and the settings say so.
            storefrontId: await automaticStorefront(tx, ctx.organizationId),
        },
        select: { id: true, slug: true },
    });

    for (const page of plan.pages) {
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
