import { ConflictException, NotFoundException } from "@nestjs/common";
import {
    getSectionContract,
    parseSectionContent,
    Prisma,
    prisma,
} from "@saroh/database";
import type { BusinessFacts, FilledKind, LookId } from "@saroh/templates";
import {
    fillBusinessDetails,
    instantiateTemplate,
    lookShowcaseTemplate,
    starterCopyPlan,
    withGallerySamples,
    withLookShowcase,
} from "@saroh/templates";
import { isDeepStrictEqual } from "node:util";

import type { OrganizationContext } from "../../common/types/organization-context";
import {
    AuditAction,
    auditMetadata,
    AuditOutcome,
} from "../audit/audit.service";
import { authorize } from "../organizations/organization-policy";
import { registeredAddressText } from "../stores/pickup-place";
import { lockSite } from "./live-pointer";
import { sanitizeSectionContent } from "./sanitize";
import { assertSiteInOrg } from "./site-access";
import { newSectionKey } from "./site-create";
import { assertLookAllowed } from "./site-looks";
import type { SiteStyle } from "./site-style";
import { defaultSiteStyle, parseSiteStyle } from "./site-style";
import { assertStyleChoicesAllowed } from "./site-style-free";
import { assertSiteLookOffered } from "./site-style-offer";
import { buildTemplateContext, withSectionForms } from "./site-template";
import { addToMenu } from "./template-sync";

/**
 * "Use this look with its starter content" (DEC-182): set a look AND copy
 * that look's showcase template (`LOOK_SHOWCASE_TEMPLATE`: Quiet the Salon,
 * Live the Gym, Folio the Studio, Classic the Bakery) into the site's
 * DRAFT, its gallery sample words and all, and put it back with Undo.
 *
 * - **What it replaces** is `starterCopyPlan` (`@saroh/templates`): the
 *   template's home page replaces the site's home page's draft, any other
 *   template page the site's free-form page at the same address. A template
 *   page the site lacks is made as a new page (and joins the menu, where the
 *   site has one). Every other page is left alone, and so is a module page
 *   at a template page's address.
 * - **What it writes** is the template instantiated for THIS business
 *   (`buildTemplateContext`: its name, its modules) with the gallery's
 *   sample words laid over the placeholders (`withGallerySamples`). Bound
 *   blocks stay bound: they read the business's own services, hours and
 *   products. The sample words are the business's to replace; the
 *   pre-publish check names every one left (`site-flags.ts`).
 * - **Into the draft, never live.** Nothing reaches a visitor until
 *   somebody publishes.
 * - **The look** is set as a style save sets it, under the same rules: the
 *   `SITE_LOOKS` rollout, a colourway the template offers, and a paid look
 *   refused on a plan without "Themes, fonts and templates" (403,
 *   `MODULE_LOCKED`) before anything is written.
 * - **One transaction**, holding the site's lock (as publish does), with a
 *   `SiteDraftSnapshot` of what it replaced and an Activity entry. Every
 *   replaced page's revision moves on (#285), so an editor tab still open
 *   on the old draft is told to reload instead of saving over the copy.
 *
 * Undo ({@link undoStarterContent}) puts the snapshot back: the style, the
 * menu, each replaced page's sections (keys and all, so notes find their
 * sections again), and removes the pages the copy made. Refused (409) once
 * anyone has saved over the copy, so Undo never throws away later work.
 *
 * Needs `site:update` (the look and the menu) and `section:write` (the
 * pages): what the editor itself needs to make the same change by hand.
 */

/** The snapshot's `reason`: what changed the draft. */
export const STARTER_CONTENT = "starter-content";
/** "Bring in my details" (DEC-182, amended 22 Oct 2026). */
export const FILL_DETAILS = "fill-details";
/** A previous version rolled back to. */
export const ROLLBACK = "rollback";
/** A section brought in from a previous version. */
export const BRING_IN = "bring-in";

/** What a copy did, for the editor's toast and its Undo. */
export interface StarterContentResult {
    snapshotId: string;
    templateId: string;
    look: LookId | null;
    /** The titles of the pages whose drafts were replaced. */
    replaced: string[];
    /** The titles of the pages made. */
    created: string[];
    /** What "Fill in my details" put in place of the samples. */
    filled: FilledKind[];
}

interface SnapshotSection {
    type: string;
    contractVersion: number;
    content: Prisma.JsonValue;
    hidden: boolean;
    key: string;
}

/** What Undo puts back (`SiteDraftSnapshot.before`). */
interface SnapshotBefore {
    style: Prisma.JsonValue | null;
    navigation: Prisma.JsonValue | null;
    pages: { pageId: string; sections: SnapshotSection[] }[];
    created: string[];
}

/**
 * The style, the menu and each touched page's draft revision just after the
 * change. `navigation` is absent on snapshots made before it was kept.
 */
interface SnapshotAfter {
    style: Prisma.JsonValue | null;
    navigation?: Prisma.JsonValue | null;
    revisions: Record<string, number>;
}

type Tx = Prisma.TransactionClient;

/** A look's choice in the request: "classic" is no look. */
function lookOf(look: LookId | "classic"): LookId | null {
    return look === "classic" ? null : look;
}

/** The stored style with `look` set (null: Classic), parsed as a save is. */
function withLook(stored: unknown, look: LookId | null): SiteStyle {
    let base: SiteStyle;
    try {
        base =
            stored === null || stored === undefined
                ? defaultSiteStyle()
                : parseSiteStyle(stored);
    } catch {
        base = defaultSiteStyle();
    }
    const { look: _old, ...rest } = base;
    return parseSiteStyle(look ? { ...rest, look } : rest);
}

/** A section's type, contract and content, wherever it came from. */
interface SectionParts {
    type: string;
    contractVersion: number;
    content: unknown;
}

/**
 * A copied section's content: the sample laid over it if that is still
 * valid under its contract (it always is; `look-showcase.test.ts`), else
 * the template's own, and the contract's rich fields sanitized as a draft
 * save sanitizes them.
 */
function ready(
    copied: SectionParts,
    made: SectionParts | undefined,
): Prisma.InputJsonValue {
    const parsed = parseSectionContent(
        copied.type,
        copied.contractVersion,
        copied.content,
    );
    const content = parsed.success ? parsed.data : (made ?? copied).content;
    return sanitizeSectionContent(
        content,
        getSectionContract(copied.type, copied.contractVersion)
            ?.sanitizedFields ?? [],
    ) as Prisma.InputJsonValue;
}

/**
 * What the business has told Saroh that a starter's samples stand in for
 * (`fillBusinessDetails`): its staff in diary order, its registered address
 * in one line, and its town as the template context says it.
 */
async function businessFacts(
    tx: Tx,
    organizationId: string,
    town: string | undefined,
): Promise<BusinessFacts> {
    const [team, profile] = await Promise.all([
        tx.staffMember.findMany({
            where: { organizationId, status: "ACTIVE" },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: { name: true, title: true },
        }),
        tx.businessProfile.findUnique({
            where: { organizationId },
            select: {
                addressLine1: true,
                addressLine2: true,
                city: true,
                postalCode: true,
            },
        }),
    ]);
    const address = registeredAddressText(profile);
    return {
        team,
        ...(address ? { address } : {}),
        ...(town ? { town } : {}),
    };
}

/** Copy the look's showcase template into the site's draft. */
export async function copyStarterContent(
    ctx: OrganizationContext,
    siteId: string,
    choice: LookId | "classic",
    /** "Fill in my details": the business's own in place of samples. */
    fill = false,
): Promise<StarterContentResult> {
    authorize(ctx, "site:update");
    authorize(ctx, "section:write");
    await assertSiteInOrg(ctx, siteId);
    const look = lookOf(choice);
    const template = lookShowcaseTemplate(look);

    // The look first, under a style save's rules: refused before anything
    // is written.
    const current = await prisma.site.findFirst({
        where: { id: siteId, organizationId: ctx.organizationId },
        select: { style: true },
    });
    const style = withLook(current?.style, look);
    await assertSiteLookOffered(ctx.organizationId, siteId, style);
    await assertLookAllowed(ctx.organizationId, siteId, style);
    await assertStyleChoicesAllowed(ctx.organizationId, siteId, style);

    return prisma.$transaction(async (tx) => {
        await lockSite(tx, siteId);
        const site = await tx.site.findFirst({
            where: {
                id: siteId,
                organizationId: ctx.organizationId,
                deletedAt: null,
            },
            select: { id: true, name: true, style: true, navigation: true },
        });
        if (!site) throw new NotFoundException("Site not found");

        const context = await buildTemplateContext(ctx.organizationId, {
            db: tx,
            siteId,
        });
        const made = withLookShowcase(
            look,
            instantiateTemplate(template, context),
        );
        const copied = withGallerySamples(template.id, made);
        const facts = fill
            ? await businessFacts(tx, ctx.organizationId, context.area)
            : null;
        const filled = new Set<FilledKind>();

        const pages = await tx.page.findMany({
            where: { siteId, organizationId: ctx.organizationId },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
                id: true,
                path: true,
                title: true,
                isHome: true,
                kind: true,
            },
        });
        const plan = starterCopyPlan(copied.pages, pages);
        const actor = {
            organizationId: ctx.organizationId,
            siteId,
            siteName: site.name,
        };

        const before: SnapshotBefore = {
            style: site.style,
            navigation: site.navigation,
            pages: [],
            created: [],
        };
        const revisions: Record<string, number> = {};

        const sectionsFor = async (path: string) => {
            const page = copied.pages.find((p) => p.path === path);
            const origin = made.pages.find((p) => p.path === path);
            const sections = (page?.sections ?? []).map((s, i) => {
                const filledIn = facts
                    ? fillBusinessDetails(
                          s.type,
                          s.content as Record<string, unknown>,
                          facts,
                      )
                    : null;
                for (const kind of filledIn?.filled ?? []) filled.add(kind);
                return {
                    type: s.type,
                    contractVersion: s.contractVersion,
                    content: ready(
                        filledIn ? { ...s, content: filledIn.content } : s,
                        origin?.sections[i],
                    ),
                };
            });
            return withSectionForms(tx, actor, sections);
        };

        for (const replace of plan.replace) {
            const draft = await tx.pageVersion.findFirst({
                where: {
                    pageId: replace.pageId,
                    organizationId: ctx.organizationId,
                    status: "DRAFT",
                },
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    sections: {
                        orderBy: { order: "asc" },
                        select: {
                            type: true,
                            contractVersion: true,
                            content: true,
                            hidden: true,
                            key: true,
                        },
                    },
                },
            });
            const versionId =
                draft?.id ??
                (
                    await tx.pageVersion.create({
                        data: {
                            pageId: replace.pageId,
                            organizationId: ctx.organizationId,
                            status: "DRAFT",
                            createdByUserId: ctx.userId,
                        },
                        select: { id: true },
                    })
                ).id;
            before.pages.push({
                pageId: replace.pageId,
                sections: draft?.sections ?? [],
            });
            const sections = await sectionsFor(replace.from);
            await tx.section.deleteMany({
                where: { pageVersionId: versionId },
            });
            if (sections.length > 0) {
                await tx.section.createMany({
                    data: sections.map((s, order) => ({
                        pageVersionId: versionId,
                        organizationId: ctx.organizationId,
                        type: s.type,
                        contractVersion: s.contractVersion,
                        order,
                        content: s.content,
                        key: newSectionKey(),
                    })),
                });
            }
            // Moved on, so an editor still showing the old draft can't save
            // over the copy (#285).
            const bumped = await tx.pageVersion.update({
                where: { id: versionId },
                data: { revision: { increment: 1 } },
                select: { revision: true },
            });
            revisions[replace.pageId] = bumped.revision;
        }

        const menuAdditions: string[] = [];
        for (const create of plan.create) {
            const page = copied.pages.find((p) => p.path === create.path);
            const sections = await sectionsFor(create.path);
            const row = await tx.page.create({
                data: {
                    siteId,
                    organizationId: ctx.organizationId,
                    path: create.path,
                    title: create.title,
                    isHome: false,
                    versions: {
                        create: {
                            organizationId: ctx.organizationId,
                            status: "DRAFT",
                            createdByUserId: ctx.userId,
                            sections: {
                                create: sections.map((s, order) => ({
                                    organizationId: ctx.organizationId,
                                    key: newSectionKey(),
                                    type: s.type,
                                    contractVersion: s.contractVersion,
                                    order,
                                    content: s.content,
                                })),
                            },
                        },
                    },
                },
                select: { id: true },
            });
            before.created.push(row.id);
            revisions[row.id] = 0;
            if (page?.inMenu ?? true) menuAdditions.push(row.id);
        }
        if (menuAdditions.length > 0) {
            await addToMenu(tx, siteId, menuAdditions);
        }

        const updated = await tx.site.update({
            where: { id: siteId },
            data: { style: style as unknown as Prisma.InputJsonValue },
            select: { navigation: true },
        });

        const after: SnapshotAfter = {
            style: style as unknown as Prisma.JsonValue,
            navigation: updated.navigation,
            revisions,
        };
        const snapshot = await tx.siteDraftSnapshot.create({
            data: {
                siteId,
                organizationId: ctx.organizationId,
                reason: STARTER_CONTENT,
                templateId: `${template.id}@${template.version}`,
                look,
                before: before as unknown as Prisma.InputJsonValue,
                after: after as unknown as Prisma.InputJsonValue,
                createdByUserId: ctx.userId,
            },
            select: { id: true },
        });

        await tx.auditEvent.create({
            data: {
                action: AuditAction.SiteStarterContentCopied,
                actorUserId: ctx.userId,
                organizationId: ctx.organizationId,
                targetType: "site",
                targetId: siteId,
                outcome: AuditOutcome.Success,
                // Counts and the template only: never a line of the site.
                metadata: auditMetadata(ctx.roleKey, {
                    siteId,
                    template: template.id,
                    templateName: template.name,
                    look: choice,
                    pagesReplaced: plan.replace.length,
                    pagesCreated: plan.create.length,
                    filled: [...filled],
                }),
            },
            select: { id: true },
        });

        return {
            snapshotId: snapshot.id,
            templateId: template.id,
            look,
            replaced: plan.replace.map((r) => r.title),
            created: plan.create.map((c) => c.title),
            filled: [...filled],
        };
    }, STARTER_TRANSACTION);
}

/** A page's latest draft, with its sections as a snapshot keeps them. */
async function draftOf(tx: Tx, organizationId: string, pageId: string) {
    return tx.pageVersion.findFirst({
        where: { pageId, organizationId, status: "DRAFT" },
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            revision: true,
            sections: {
                orderBy: { order: "asc" },
                select: {
                    id: true,
                    type: true,
                    contractVersion: true,
                    content: true,
                    hidden: true,
                    key: true,
                },
            },
        },
    });
}

/** A draft's sections as a snapshot keeps them (no row ids). */
function kept(
    sections: readonly (SnapshotSection & { id?: string })[],
): SnapshotSection[] {
    return sections.map(({ type, contractVersion, content, hidden, key }) => ({
        type,
        contractVersion,
        content,
        hidden,
        key,
    }));
}

/**
 * Each page's draft sections put back as a snapshot holds them (keys and
 * all, so notes find their sections again), each draft's revision moved on
 * so an editor still open on it reloads (#285). A page gone since is
 * skipped. The revisions after, by page.
 */
async function restorePages(
    tx: Tx,
    organizationId: string,
    pages: SnapshotBefore["pages"],
): Promise<Record<string, number>> {
    const revisions: Record<string, number> = {};
    for (const page of pages) {
        const draft = await draftOf(tx, organizationId, page.pageId);
        if (!draft) continue;
        await tx.section.deleteMany({ where: { pageVersionId: draft.id } });
        if (page.sections.length > 0) {
            await tx.section.createMany({
                data: page.sections.map((s, order) => ({
                    pageVersionId: draft.id,
                    organizationId,
                    type: s.type,
                    contractVersion: s.contractVersion,
                    order,
                    content: s.content as Prisma.InputJsonValue,
                    hidden: s.hidden,
                    key: s.key,
                })),
            });
        }
        const bumped = await tx.pageVersion.update({
            where: { id: draft.id },
            data: { revision: { increment: 1 } },
            select: { revision: true },
        });
        revisions[page.pageId] = bumped.revision;
    }
    return revisions;
}

/** A snapshot of this site, by id: 404 when it isn't this site's. */
async function snapshotOf(
    tx: Tx,
    ctx: OrganizationContext,
    siteId: string,
    snapshotId: string,
) {
    const snapshot = await tx.siteDraftSnapshot.findFirst({
        where: { id: snapshotId, siteId, organizationId: ctx.organizationId },
        select: { id: true, before: true, after: true, undoneAt: true },
    });
    if (!snapshot) throw new NotFoundException("That version isn't here");
    return {
        ...snapshot,
        before: snapshot.before as unknown as SnapshotBefore,
        after: snapshot.after as unknown as SnapshotAfter,
    };
}

/**
 * Put back the draft a change replaced: the starter copy, "Bring in my
 * details", a roll back or a section brought in. 404 for a snapshot that
 * isn't this site's; 409 once it has been undone, or once anyone has saved
 * a touched page or the style since (their work would be lost).
 */
export async function undoStarterContent(
    ctx: OrganizationContext,
    siteId: string,
    snapshotId: string,
): Promise<{ restored: number; removed: number }> {
    authorize(ctx, "site:update");
    authorize(ctx, "section:write");
    await assertSiteInOrg(ctx, siteId);

    return prisma.$transaction(async (tx) => {
        await lockSite(tx, siteId);
        const snapshot = await snapshotOf(tx, ctx, siteId, snapshotId).catch(
            () => {
                throw new NotFoundException("Nothing to undo");
            },
        );
        if (snapshot.undoneAt) {
            throw new ConflictException({
                message: "That's already been undone.",
                details: { code: "STARTER_UNDONE" },
            });
        }
        const { before, after } = snapshot;

        await assertUntouched(tx, ctx, siteId, after);

        await restorePages(tx, ctx.organizationId, before.pages);
        const removed = await tx.page.deleteMany({
            where: {
                id: { in: before.created },
                siteId,
                organizationId: ctx.organizationId,
            },
        });
        await tx.site.update({
            where: { id: siteId },
            data: {
                style: jsonOrNull(before.style),
                navigation: jsonOrNull(before.navigation),
            },
            select: { id: true },
        });
        await tx.siteDraftSnapshot.update({
            where: { id: snapshot.id },
            data: { undoneAt: new Date() },
            select: { id: true },
        });
        await tx.auditEvent.create({
            data: {
                action: AuditAction.SiteStarterContentUndone,
                actorUserId: ctx.userId,
                organizationId: ctx.organizationId,
                targetType: "site",
                targetId: siteId,
                outcome: AuditOutcome.Success,
                metadata: auditMetadata(ctx.roleKey, {
                    siteId,
                    snapshotId: snapshot.id,
                    pagesRestored: before.pages.length,
                    pagesRemoved: removed.count,
                }),
            },
            select: { id: true },
        });
        return { restored: before.pages.length, removed: removed.count };
    }, STARTER_TRANSACTION);
}

/** What "Bring in my details" did. */
export interface FillDetailsResult {
    /** What its Undo puts back; null when nothing was filled. */
    snapshotId: string | null;
    filled: FilledKind[];
    /** The titles of the pages changed. */
    pages: string[];
}

/**
 * "Bring in my details" (DEC-182, amended 22 Oct 2026): across every
 * page's draft, the starter's sample words the business has its own for
 * replaced with them (`fillBusinessDetails`), never text the owner typed.
 * One transaction with a snapshot (so Undo, and Previous versions, can put
 * it back) and an Activity entry. Nothing to fill writes nothing.
 */
export async function fillDetails(
    ctx: OrganizationContext,
    siteId: string,
): Promise<FillDetailsResult> {
    authorize(ctx, "site:update");
    authorize(ctx, "section:write");
    await assertSiteInOrg(ctx, siteId);

    return prisma.$transaction(async (tx) => {
        await lockSite(tx, siteId);
        const site = await tx.site.findFirst({
            where: {
                id: siteId,
                organizationId: ctx.organizationId,
                deletedAt: null,
            },
            select: { style: true, navigation: true },
        });
        if (!site) throw new NotFoundException("Site not found");
        const context = await buildTemplateContext(ctx.organizationId, {
            db: tx,
            siteId,
        });
        const facts = await businessFacts(tx, ctx.organizationId, context.area);
        const pages = await tx.page.findMany({
            where: { siteId, organizationId: ctx.organizationId },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: { id: true, title: true },
        });

        const filled = new Set<FilledKind>();
        const before: SnapshotBefore = {
            style: site.style,
            navigation: site.navigation,
            pages: [],
            created: [],
        };
        const revisions: Record<string, number> = {};
        const changed: string[] = [];
        for (const page of pages) {
            const draft = await draftOf(tx, ctx.organizationId, page.id);
            if (!draft) continue;
            let touched = false;
            for (const section of draft.sections) {
                if (!section.content || typeof section.content !== "object") {
                    continue;
                }
                const out = fillBusinessDetails(
                    section.type,
                    section.content as Record<string, unknown>,
                    facts,
                );
                if (out.filled.length === 0) continue;
                for (const kind of out.filled) filled.add(kind);
                touched = true;
                await tx.section.update({
                    where: { id: section.id },
                    data: {
                        // Invalid under its contract (never, but): as it was.
                        content: ready(
                            { ...section, content: out.content },
                            section,
                        ),
                    },
                    select: { id: true },
                });
            }
            if (!touched) continue;
            before.pages.push({
                pageId: page.id,
                sections: kept(draft.sections),
            });
            const bumped = await tx.pageVersion.update({
                where: { id: draft.id },
                data: { revision: { increment: 1 } },
                select: { revision: true },
            });
            revisions[page.id] = bumped.revision;
            changed.push(page.title);
        }
        if (changed.length === 0) {
            return { snapshotId: null, filled: [], pages: [] };
        }

        const snapshot = await tx.siteDraftSnapshot.create({
            data: {
                siteId,
                organizationId: ctx.organizationId,
                reason: FILL_DETAILS,
                templateId: "",
                look: lookIn(site.style),
                before: before as unknown as Prisma.InputJsonValue,
                after: {
                    style: site.style,
                    navigation: site.navigation,
                    revisions,
                },
                createdByUserId: ctx.userId,
            },
            select: { id: true },
        });
        await tx.auditEvent.create({
            data: {
                action: AuditAction.SiteDetailsFilled,
                actorUserId: ctx.userId,
                organizationId: ctx.organizationId,
                targetType: "site",
                targetId: siteId,
                outcome: AuditOutcome.Success,
                metadata: auditMetadata(ctx.roleKey, {
                    siteId,
                    snapshotId: snapshot.id,
                    pagesChanged: changed.length,
                    filled: [...filled],
                }),
            },
            select: { id: true },
        });
        return { snapshotId: snapshot.id, filled: [...filled], pages: changed };
    }, STARTER_TRANSACTION);
}

/** A stored style's look, or null (Classic, or unreadable). */
function lookIn(style: Prisma.JsonValue | null): LookId | null {
    if (style === null) return null;
    try {
        return parseSiteStyle(style).look ?? null;
    } catch {
        return null;
    }
}

/** One section of a previous version, as the list names it. */
export interface VersionSection {
    key: string;
    type: string;
    /** Its heading, title or name, when it has one. */
    heading: string | null;
}

/** A previous version of the draft: what it was before a change. */
export interface DraftVersion {
    id: string;
    /** What changed it: `starter-content`, `fill-details`, … */
    reason: string;
    /** When it was replaced. */
    createdAt: string;
    /** Its look then; null is Classic. */
    look: LookId | null;
    /** Its pages, as they were. */
    pages: {
        pageId: string;
        /** The page's title now, or null for a page removed since. */
        title: string | null;
        sections: VersionSection[];
    }[];
}

/** A section's heading for a list: its heading, title or name. */
function headingOf(content: Prisma.JsonValue): string | null {
    if (!content || typeof content !== "object" || Array.isArray(content)) {
        return null;
    }
    for (const field of ["heading", "title", "name"]) {
        const value = (content as Record<string, unknown>)[field];
        if (typeof value === "string" && value.trim() !== "") {
            return value.trim();
        }
    }
    return null;
}

/** How many previous versions the list shows. */
const VERSIONS_SHOWN = 20;

/**
 * Previous versions of the site's draft, newest first (DEC-182, amended
 * 22 Oct 2026): each snapshot's `before`, the draft as it was before the
 * starter copy, a fill, a roll back or a section brought in. Kept for as
 * long as the site is.
 */
export async function listDraftVersions(
    ctx: OrganizationContext,
    siteId: string,
): Promise<DraftVersion[]> {
    authorize(ctx, "site:update");
    authorize(ctx, "section:write");
    await assertSiteInOrg(ctx, siteId);
    const [snapshots, pages] = await Promise.all([
        prisma.siteDraftSnapshot.findMany({
            where: { siteId, organizationId: ctx.organizationId },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: VERSIONS_SHOWN,
            select: { id: true, reason: true, createdAt: true, before: true },
        }),
        prisma.page.findMany({
            where: { siteId, organizationId: ctx.organizationId },
            select: { id: true, title: true },
        }),
    ]);
    const titles = new Map(pages.map((p) => [p.id, p.title]));
    return snapshots.map((s) => {
        const before = s.before as unknown as SnapshotBefore;
        return {
            id: s.id,
            reason: s.reason,
            createdAt: s.createdAt.toISOString(),
            look: lookIn(before.style),
            pages: before.pages.map((p) => ({
                pageId: p.pageId,
                title: titles.get(p.pageId) ?? null,
                sections: p.sections.map((section) => ({
                    key: section.key,
                    type: section.type,
                    heading: headingOf(section.content),
                })),
            })),
        };
    });
}

/**
 * Roll the draft back to a previous version: its pages' sections, its look
 * and its menu put back. Unlike Undo it works whatever has been saved
 * since, so the draft as it is now is kept first as a version of its own,
 * and the roll back has its own Undo. Pages added since stay, off the
 * menu the version had. Nothing goes live until Publish.
 */
export async function rollbackDraft(
    ctx: OrganizationContext,
    siteId: string,
    snapshotId: string,
): Promise<{ snapshotId: string; restored: number }> {
    authorize(ctx, "site:update");
    authorize(ctx, "section:write");
    await assertSiteInOrg(ctx, siteId);

    return prisma.$transaction(async (tx) => {
        await lockSite(tx, siteId);
        const version = await snapshotOf(tx, ctx, siteId, snapshotId);
        const site = await tx.site.findFirst({
            where: {
                id: siteId,
                organizationId: ctx.organizationId,
                deletedAt: null,
            },
            select: { style: true, navigation: true },
        });
        if (!site) throw new NotFoundException("Site not found");

        const now: SnapshotBefore = {
            style: site.style,
            navigation: site.navigation,
            pages: [],
            created: [],
        };
        for (const page of version.before.pages) {
            const draft = await draftOf(tx, ctx.organizationId, page.pageId);
            if (draft) {
                now.pages.push({
                    pageId: page.pageId,
                    sections: kept(draft.sections),
                });
            }
        }
        const revisions = await restorePages(
            tx,
            ctx.organizationId,
            version.before.pages,
        );
        await tx.site.update({
            where: { id: siteId },
            data: {
                style: jsonOrNull(version.before.style),
                navigation: jsonOrNull(version.before.navigation),
            },
            select: { id: true },
        });
        const snapshot = await tx.siteDraftSnapshot.create({
            data: {
                siteId,
                organizationId: ctx.organizationId,
                reason: ROLLBACK,
                templateId: "",
                look: lookIn(version.before.style),
                before: now as unknown as Prisma.InputJsonValue,
                after: {
                    style: version.before.style,
                    navigation: version.before.navigation,
                    revisions,
                },
                createdByUserId: ctx.userId,
            },
            select: { id: true },
        });
        await tx.auditEvent.create({
            data: {
                action: AuditAction.SiteDraftRolledBack,
                actorUserId: ctx.userId,
                organizationId: ctx.organizationId,
                targetType: "site",
                targetId: siteId,
                outcome: AuditOutcome.Success,
                metadata: auditMetadata(ctx.roleKey, {
                    siteId,
                    from: version.id,
                    snapshotId: snapshot.id,
                    pagesRestored: Object.keys(revisions).length,
                }),
            },
            select: { id: true },
        });
        return {
            snapshotId: snapshot.id,
            restored: Object.keys(revisions).length,
        };
    }, STARTER_TRANSACTION);
}

/**
 * One section of a previous version copied to the end of a page's draft:
 * the page it was on, or the home page when that page is gone. A fresh
 * key, so it never collides with the section it came from. Snapshot-backed
 * for its Undo.
 */
export async function bringInSection(
    ctx: OrganizationContext,
    siteId: string,
    snapshotId: string,
    pageId: string,
    sectionKey: string,
): Promise<{ snapshotId: string; pageId: string; title: string }> {
    authorize(ctx, "site:update");
    authorize(ctx, "section:write");
    await assertSiteInOrg(ctx, siteId);

    return prisma.$transaction(async (tx) => {
        await lockSite(tx, siteId);
        const version = await snapshotOf(tx, ctx, siteId, snapshotId);
        const section = version.before.pages
            .find((p) => p.pageId === pageId)
            ?.sections.find((s) => s.key === sectionKey);
        if (!section) {
            throw new NotFoundException("That section isn't in this version");
        }
        const pages = await tx.page.findMany({
            where: { siteId, organizationId: ctx.organizationId },
            select: { id: true, title: true, isHome: true },
        });
        const target =
            pages.find((p) => p.id === pageId) ?? pages.find((p) => p.isHome);
        if (!target) throw new NotFoundException("Site not found");
        const draft = await draftOf(tx, ctx.organizationId, target.id);
        if (!draft) throw new NotFoundException("Page draft not found");

        const site = await tx.site.findFirst({
            where: { id: siteId, organizationId: ctx.organizationId },
            select: { style: true, navigation: true },
        });
        await tx.section.create({
            data: {
                pageVersionId: draft.id,
                organizationId: ctx.organizationId,
                type: section.type,
                contractVersion: section.contractVersion,
                order: draft.sections.length,
                content: section.content as Prisma.InputJsonValue,
                hidden: section.hidden,
                key: newSectionKey(),
            },
            select: { id: true },
        });
        const bumped = await tx.pageVersion.update({
            where: { id: draft.id },
            data: { revision: { increment: 1 } },
            select: { revision: true },
        });
        const before: SnapshotBefore = {
            style: site?.style ?? null,
            navigation: site?.navigation ?? null,
            pages: [{ pageId: target.id, sections: kept(draft.sections) }],
            created: [],
        };
        const snapshot = await tx.siteDraftSnapshot.create({
            data: {
                siteId,
                organizationId: ctx.organizationId,
                reason: BRING_IN,
                templateId: "",
                look: lookIn(site?.style ?? null),
                before: before as unknown as Prisma.InputJsonValue,
                after: {
                    style: site?.style ?? null,
                    navigation: site?.navigation ?? null,
                    revisions: { [target.id]: bumped.revision },
                },
                createdByUserId: ctx.userId,
            },
            select: { id: true },
        });
        await tx.auditEvent.create({
            data: {
                action: AuditAction.SiteSectionBroughtIn,
                actorUserId: ctx.userId,
                organizationId: ctx.organizationId,
                targetType: "site",
                targetId: siteId,
                outcome: AuditOutcome.Success,
                metadata: auditMetadata(ctx.roleKey, {
                    siteId,
                    from: version.id,
                    snapshotId: snapshot.id,
                    pageId: target.id,
                    type: section.type,
                }),
            },
            select: { id: true },
        });
        return {
            snapshotId: snapshot.id,
            pageId: target.id,
            title: target.title,
        };
    }, STARTER_TRANSACTION);
}

/** A JSON column's value, its null as the database's NULL. */
function jsonOrNull(
    value: Prisma.JsonValue | null,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
    return value ?? Prisma.DbNull;
}

/** Refuse an Undo once anyone has saved over the copy. */
async function assertUntouched(
    tx: Tx,
    ctx: OrganizationContext,
    siteId: string,
    after: SnapshotAfter,
): Promise<void> {
    const ids = Object.keys(after.revisions);
    const drafts = await tx.pageVersion.findMany({
        where: {
            pageId: { in: ids },
            organizationId: ctx.organizationId,
            status: "DRAFT",
        },
        orderBy: { createdAt: "desc" },
        select: { pageId: true, revision: true },
    });
    const latest = new Map<string, number>();
    for (const d of drafts) {
        if (!latest.has(d.pageId)) latest.set(d.pageId, d.revision);
    }
    const site = await tx.site.findFirst({
        where: { id: siteId, organizationId: ctx.organizationId },
        select: { style: true, navigation: true },
    });
    const moved =
        ids.some((id) => latest.get(id) !== after.revisions[id]) ||
        !isDeepStrictEqual(site?.style ?? null, after.style) ||
        (after.navigation !== undefined &&
            !isDeepStrictEqual(site?.navigation ?? null, after.navigation));
    if (moved) {
        throw new ConflictException({
            message:
                "Your draft has changed since the starter content went in, so Undo would lose that work.",
            details: { code: "STARTER_CHANGED" },
        });
    }
}

/**
 * The copy reads the business and writes a handful of pages, and waits
 * for the site's lock behind a publish, so it is given room.
 */
const STARTER_TRANSACTION = { maxWait: 10_000, timeout: 30_000 } as const;
