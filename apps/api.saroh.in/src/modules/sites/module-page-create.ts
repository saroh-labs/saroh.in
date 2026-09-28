import { BadRequestException, ConflictException } from "@nestjs/common";
import type { PageKind } from "@saroh/database";
import { Prisma, prisma } from "@saroh/database";
import { randomUUID } from "node:crypto";

import type { OrganizationContext } from "../../common/types/organization-context";
import { defaultModuleSections } from "./module-page-sections";
import { modulePageState } from "./module-pages";
import type { ModulePageKind } from "./page-kinds";
import { MODULE_PAGE_DEFAULTS } from "./page-kinds";
import { assertPathIsFree } from "./site-access";

/** A page as the page endpoints return it. */
export interface CreatedPage {
    id: string;
    path: string;
    title: string;
    isHome: boolean;
    hidden: boolean;
    kind: PageKind;
    inMenu: boolean;
}

export const PAGE_VIEW_SELECT = {
    id: true,
    path: true,
    title: true,
    isHome: true,
    hidden: true,
    kind: true,
    inMenu: true,
} satisfies Prisma.PageSelect;

/** "Book page", for "This site already has a Book page". */
function kindName(kind: ModulePageKind): string {
    return MODULE_PAGE_DEFAULTS[kind].name.replace(/^an? /, "");
}

/** The 409 for a second page of a kind, raced or not. */
function alreadyHas(kind: ModulePageKind): ConflictException {
    return new ConflictException({
        message: `This site already has a ${kindName(kind)}.`,
        details: { reason: "exists", kind },
    });
}

/**
 * Add a module page (G14) with its default sections, in one transaction.
 * The caller has authorized `site:update` and proven the site is the org's.
 *
 * Refused, each in words the merchant can act on:
 * - its module is off (409, naming it) or not rolled out (409, naming
 *   nothing: the kind is never offered, DEC-057);
 * - the site has one already (409);
 * - a Book or Shop page asked for another address (400): theirs is fixed;
 * - a Book or Shop page whose address a free-form page holds (409, naming
 *   that page: "Change its address first");
 * - a Prices, Journal or Contact address that is taken (400, "Pick another
 *   address", with a suggestion).
 */
export async function createModulePage(
    ctx: OrganizationContext,
    site: { id: string; name: string },
    kind: ModulePageKind,
    dto: { title?: string; path?: string; inMenu?: boolean },
): Promise<CreatedPage> {
    const defaults = MODULE_PAGE_DEFAULTS[kind];

    const gate = await modulePageState(kind, ctx.organizationId);
    if (gate.state === "unavailable") {
        throw new ConflictException({
            message: `${defaults.name.replace(/^a/, "A")} isn't available for this business.`,
            details: { reason: "unavailable", kind },
        });
    }
    if (gate.state === "off") {
        throw new ConflictException({
            message: `${gate.module} is switched off. Turn it on in Settings › Modules to add ${defaults.name}.`,
            details: { reason: "module_off", kind, module: gate.module },
        });
    }

    const existing = await prisma.page.findFirst({
        where: { siteId: site.id, kind },
        select: { id: true },
    });
    if (existing) throw alreadyHas(kind);

    const title = dto.title ?? defaults.title;
    let path = defaults.path;
    if (defaults.fixedPath) {
        if (dto.path !== undefined && dto.path !== defaults.path) {
            throw new BadRequestException({
                message: `${defaults.name.replace(/^a/, "A")} is always at ${defaults.path}.`,
                details: { field: "path", reason: "fixed" },
            });
        }
        const holder = await prisma.page.findFirst({
            where: { siteId: site.id, path },
            select: { title: true },
        });
        if (holder) {
            throw new ConflictException({
                message: `Your page "${holder.title}" uses ${path}. Change its address first.`,
                details: {
                    field: "path",
                    reason: "held",
                    holder: holder.title,
                },
            });
        }
    } else {
        path = dto.path ?? defaults.path;
        await assertPathIsFree(site.id, path, {
            kind,
            title,
            alternatives: dto.path === undefined ? defaults.alternatives : [],
        });
    }

    try {
        return await prisma.$transaction(async (tx) => {
            const sections = await defaultModuleSections(tx, {
                organizationId: ctx.organizationId,
                siteId: site.id,
                siteName: site.name,
                kind,
            });
            return tx.page.create({
                data: {
                    siteId: site.id,
                    organizationId: ctx.organizationId,
                    path,
                    title,
                    isHome: false,
                    kind,
                    inMenu: dto.inMenu ?? true,
                    versions: {
                        create: {
                            organizationId: ctx.organizationId,
                            status: "DRAFT",
                            createdByUserId: ctx.userId,
                            sections: {
                                create: sections.map((section, order) => ({
                                    organizationId: ctx.organizationId,
                                    // Minted here, as a template's are: a
                                    // section is keyed from the moment it
                                    // exists.
                                    key: randomUUID(),
                                    type: section.type,
                                    contractVersion: section.contractVersion,
                                    order,
                                    content:
                                        section.content as Prisma.InputJsonValue,
                                })),
                            },
                        },
                    },
                },
                select: PAGE_VIEW_SELECT,
            });
        });
    } catch (error) {
        // Two adds racing past the checks above: the partial unique index
        // (one of each kind) or the path's decides, and the loser is told
        // the same thing the check would have said.
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
        ) {
            const raced = await prisma.page.findFirst({
                where: { siteId: site.id, kind },
                select: { id: true },
            });
            if (raced) throw alreadyHas(kind);
            throw new ConflictException({
                message: `Another page took ${path} just now. Pick another address.`,
                details: { field: "path", reason: "taken" },
            });
        }
        throw error;
    }
}
