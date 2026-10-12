import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";
import type {
    InstantiatedTemplate,
    TemplateContext,
    TemplateManifest,
} from "@saroh/templates";
import {
    getTemplate,
    PERSONAL_TEMPLATE_ID,
    PORTFOLIO_TEMPLATE_ID,
    STARTER_TEMPLATE_ID,
    templateStylePreset,
} from "@saroh/templates";
import { isDeepStrictEqual } from "node:util";

import { AuditAction, AuditOutcome } from "../audit/audit.service";
import { lockSite } from "./live-pointer";
import { planTemplateFooter, planTemplateStyle } from "./site-create";
import type { SiteFooter } from "./site-footer";
import { parseSiteFooter } from "./site-footer";
import type { SiteStyle } from "./site-style";
import { defaultSiteStyle, parseSiteStyle } from "./site-style";
import type { ContextDb } from "./site-template";
import { buildTemplateContext } from "./site-template";
import type { SitePagesPlan, SyncCounts, SyncSite } from "./template-sync";
import {
    applySitePages,
    countsOf,
    emptyCounts,
    instantiated,
    planSitePages,
} from "./template-sync";

/**
 * Moving existing sites to their template's newest version (DEC-141): the
 * owner's third decision, "every existing starter site gets the new look".
 *
 * A site's sections and style are COPIED into it when it is made, so a new
 * template version reaches no existing site by itself. This brings each
 * one up, under one rule: **never destroy something a merchant wrote or
 * chose.**
 *
 * - **Look** (colourway, font pair, type scale): applied when the site's
 *   style is still the one its template started it in (for the starter up
 *   to v3, no style at all). A site whose owner changed the style keeps it,
 *   and Website › Style then offers the new colourways, since they are its
 *   template's.
 * - **Footer**: applied when the site's footer is still its template's
 *   (for the starter up to v3, none).
 * - **Pages**: `planTemplateUpgrade` (`@saroh/templates`). An untouched
 *   page becomes the new version's; an edited page keeps every section and
 *   gains only the bound sections it lacks; a note to the owner is taken
 *   out of a hero line wherever it is.
 * - **Module pages** the new version asks for (Contact, and Shop, Book or
 *   Prices where the business has them) are added where missing.
 * - **The record** (`templateVersion`, and `templateStyleId` when the look
 *   was applied) moves to the new version in the same transaction, with an
 *   audit event. That is also what makes a second run skip the site.
 *
 * INTO THE DRAFT, NEVER LIVE. A published site is its Publication, an
 * immutable snapshot that holds its pages, its style and its footer; it
 * changes only when someone with `site:publish` puts a version live
 * (`live-pointer.ts`, which also holds "Publishing needs approval"). So
 * the upgrade writes the draft and stops. The owner opens the editor, sees
 * the new look and the changes waiting, and publishes. This holds even for
 * a site nobody ever edited: the brief allows a style-only change to go
 * live unseen, but a publish made by nobody would have no author, would
 * step round the approval setting, and would carry the new sections with
 * it (style and pages are one snapshot). Nothing live changes, so there is
 * no kept page to stop serving (`backend-jobs.md`, Site page cache).
 *
 * Each site is one transaction, holding the site's lock, so a run that
 * stops partway has upgraded whole sites and left the rest untouched, and
 * running it again carries on.
 */

/** Who the audit trail says did it. No person: Saroh's upgrade. */
export const TEMPLATE_UPGRADE_ACTOR = "system:template-upgrade";

/** The templates whose sites are moved to their newest version. */
export const UPGRADED_TEMPLATE_IDS: readonly string[] = [
    STARTER_TEMPLATE_ID,
    PERSONAL_TEMPLATE_ID,
    PORTFOLIO_TEMPLATE_ID,
];

/** Whether the look or the footer was applied, kept or had nothing to do. */
export type LookOutcome = "applied" | "kept" | "none";

/** What the upgrade decided for a site's look. */
export interface LookPlan {
    style: LookOutcome;
    footer: LookOutcome;
    /** The style to write, when applied. */
    nextStyle?: { id: string; value: SiteStyle };
    /** The footer to write, when applied. */
    nextFooter?: SiteFooter;
}

type LookTemplate = Pick<
    TemplateManifest,
    "id" | "version" | "styles" | "footer"
>;

function parsedStyle(stored: unknown): SiteStyle | undefined {
    try {
        return parseSiteStyle(stored);
    } catch {
        return undefined;
    }
}

function parsedFooter(stored: unknown): SiteFooter | null | undefined {
    try {
        return parseSiteFooter(stored);
    } catch {
        return undefined;
    }
}

/**
 * The look a site made from `template` started in: its recorded colourway,
 * its first when none was recorded, or the default for a template without
 * any. Undefined when the recorded colourway is not one the template has:
 * what the site started in is then unknown, and unknown is never "untouched".
 */
function startedStyle(
    template: LookTemplate,
    styleId: string | null,
): SiteStyle | undefined {
    const preset = templateStylePreset(template, styleId ?? undefined);
    if (preset === null) return undefined;
    return preset ? parsedStyle(preset.style) : defaultSiteStyle();
}

/**
 * Decide the look. Pure.
 *
 * "Untouched" is decided from what is stored: the style is absent, or
 * equal to the one its template started it in; the footer likewise.
 * Anything else was chosen by somebody, and is kept.
 */
export function planLook(
    site: { style: unknown; footer: unknown; templateStyleId: string | null },
    from: LookTemplate,
    to: LookTemplate,
    context: TemplateContext,
): LookPlan {
    const plan: LookPlan = { style: "none", footer: "none" };

    if ((to.styles ?? []).length > 0) {
        const started = startedStyle(from, site.templateStyleId);
        const stored =
            site.style === null || site.style === undefined
                ? defaultSiteStyle()
                : parsedStyle(site.style);
        const untouched =
            started !== undefined &&
            stored !== undefined &&
            isDeepStrictEqual(stored, started);
        if (untouched) {
            const next = planTemplateStyle(to);
            if (next) {
                plan.style = "applied";
                plan.nextStyle = next;
            }
        } else {
            plan.style = "kept";
        }
    }

    if (to.footer) {
        const stored = parsedFooter(site.footer);
        // Its template's own fixed line; one worked out from the business
        // (`lineFrom`) cannot be told from the owner's words, so a site
        // that has one is left with it.
        const started = planTemplateFooter(from) ?? null;
        const untouched =
            stored !== undefined && isDeepStrictEqual(stored, started);
        if (untouched) {
            const next = planTemplateFooter(to, context);
            if (next && !isDeepStrictEqual(next, stored)) {
                plan.footer = "applied";
                plan.nextFooter = next;
            }
        } else {
            plan.footer = "kept";
        }
    }
    return plan;
}

/** Each value once, in order. */
function unique<T>(values: readonly T[]): T[] {
    return [...new Set(values)];
}

/**
 * What the older version could have made this site's pages as. It was
 * instantiated for the business as it was THEN, which nobody recorded, so
 * each plausible profile is tried: the business's name now and the name
 * the site was given (a site is named for its business when it is made),
 * with and without the contact email and the legal name it has now. Never
 * a line about what it does: until this version nothing passed one.
 *
 * A site whose business has changed in some other way matches none, and
 * its pages count as edited: they keep everything.
 */
export function madeCandidates(
    from: TemplateManifest,
    context: TemplateContext,
    siteName: string,
): InstantiatedTemplate[] {
    const {
        description: _line,
        tagline: _tagline,
        contactEmail,
        legalName,
        ...rest
    } = context;
    const out: InstantiatedTemplate[] = [];
    for (const organizationName of unique([
        context.organizationName,
        siteName,
    ])) {
        for (const email of unique([contactEmail, undefined])) {
            for (const legal of unique([legalName, undefined])) {
                const made = instantiated(from, {
                    ...rest,
                    organizationName,
                    ...(email ? { contactEmail: email } : {}),
                    ...(legal ? { legalName: legal } : {}),
                });
                if (made) out.push(made);
            }
        }
    }
    return out;
}

/** A site as the upgrade reads it. */
const upgradeSiteSelect = {
    id: true,
    name: true,
    organizationId: true,
    templateId: true,
    templateVersion: true,
    templateStyleId: true,
    style: true,
    footer: true,
} satisfies Prisma.SiteSelect;

type UpgradeSite = Prisma.SiteGetPayload<{ select: typeof upgradeSiteSelect }>;

/** The version a site is on and the one it would move to, or why not. */
function versions(
    site: Pick<UpgradeSite, "templateId" | "templateVersion">,
): { from: TemplateManifest; to: TemplateManifest } | "current" | "unknown" {
    if (!site.templateId || typeof site.templateVersion !== "number") {
        return "unknown";
    }
    const to = getTemplate(site.templateId);
    const from = getTemplate(site.templateId, site.templateVersion);
    if (!to || !from) return "unknown";
    return from.version >= to.version ? "current" : { from, to };
}

/** What happened to one site. */
export type SiteUpgradeOutcome =
    | { outcome: "upgraded"; look: LookPlan; counts: SyncCounts }
    /** Already on the newest version (or moved there by another run). */
    | { outcome: "current" }
    /** A version this build does not have: left alone, never guessed. */
    | { outcome: "unknown" };

type ReadDb = ContextDb & Pick<Prisma.TransactionClient, "page">;

/** Read a site and work out its upgrade. Reads only. */
async function planSiteUpgrade(
    db: ReadDb,
    site: UpgradeSite,
): Promise<
    | "current"
    | "unknown"
    | {
          from: TemplateManifest;
          to: TemplateManifest;
          look: LookPlan;
          pages: SitePagesPlan;
      }
> {
    const move = versions(site);
    if (typeof move === "string") return move;
    const context = await buildTemplateContext(site.organizationId, {
        db,
        siteId: site.id,
    });
    const pages = await planSitePages(db, site, {
        to: move.to,
        made: madeCandidates(move.from, context, site.name),
        context,
    });
    // The newest version cannot be made for this business: a template bug.
    // The site is left exactly as it is.
    if (!pages) return "unknown";
    return {
        ...move,
        look: planLook(site, move.from, move.to, context),
        pages,
    };
}

/**
 * Upgrade one site, or say what a run would do (`dryRun`: reads only,
 * nothing locked, nothing written).
 */
export async function upgradeSite(
    siteId: string,
    options: { dryRun?: boolean } = {},
): Promise<SiteUpgradeOutcome> {
    if (options.dryRun) {
        const site = await prisma.site.findFirst({
            where: { id: siteId, deletedAt: null },
            select: upgradeSiteSelect,
        });
        if (!site) return { outcome: "current" };
        const plan = await planSiteUpgrade(prisma, site);
        if (typeof plan === "string") return { outcome: plan };
        return {
            outcome: "upgraded",
            look: plan.look,
            counts: countsOf(plan.pages),
        };
    }

    return prisma.$transaction(async (tx): Promise<SiteUpgradeOutcome> => {
        // One at a time with a publish or another run, and read after the
        // lock: a site another run has just moved is seen as current.
        await lockSite(tx, siteId);
        const site = await tx.site.findFirst({
            where: { id: siteId, deletedAt: null },
            select: upgradeSiteSelect,
        });
        if (!site) return { outcome: "current" };
        const plan = await planSiteUpgrade(tx, site);
        if (typeof plan === "string") return { outcome: plan };

        const target: SyncSite = {
            id: site.id,
            name: site.name,
            organizationId: site.organizationId,
        };
        const counts = await applySitePages(
            tx,
            { organizationId: site.organizationId, userId: null },
            target,
            plan.pages,
        );
        const { look } = plan;
        await tx.site.update({
            where: { id: site.id },
            data: {
                templateVersion: plan.to.version,
                ...(look.nextStyle
                    ? {
                          style: look.nextStyle
                              .value as unknown as Prisma.InputJsonValue,
                          templateStyleId: look.nextStyle.id,
                      }
                    : {}),
                ...(look.nextFooter
                    ? {
                          footer: look.nextFooter as unknown as Prisma.InputJsonValue,
                      }
                    : {}),
            },
        });
        await tx.auditEvent.create({
            data: {
                action: AuditAction.SiteTemplateUpgrade,
                actorUserId: TEMPLATE_UPGRADE_ACTOR,
                organizationId: site.organizationId,
                targetType: "site",
                targetId: site.id,
                outcome: AuditOutcome.Success,
                metadata: {
                    from: `${plan.from.id}@${plan.from.version}`,
                    to: `${plan.to.id}@${plan.to.version}`,
                    style: look.style,
                    footer: look.footer,
                    ...counts,
                },
            },
            select: { id: true },
        });
        return { outcome: "upgraded", look, counts };
    }, UPGRADE_TRANSACTION);
}

/**
 * A site's upgrade reads the business, plans and writes a handful of pages:
 * well inside the default five seconds on a quiet database, but it waits
 * for the site's lock behind a publish, so it is given room.
 */
const UPGRADE_TRANSACTION = { maxWait: 10_000, timeout: 30_000 } as const;

/** What a run did, or would do. Counts only: never a name or a line. */
export interface TemplateUpgradeReport {
    dryRun: boolean;
    /** Sites on one of the upgraded templates. */
    sites: number;
    upgraded: number;
    alreadyCurrent: number;
    /** On a version this build does not have; left alone. */
    unknownVersion: number;
    /** Threw; left exactly as they were (the transaction rolled back). */
    failed: number;
    styleApplied: number;
    styleKept: number;
    footerApplied: number;
    footerKept: number;
    counts: SyncCounts;
    /** Upgraded sites by the move they made: `starter@3 → starter@4`. */
    moves: Record<string, number>;
}

const BATCH = 100;

/**
 * Upgrade every site on an upgraded template that is behind its newest
 * version. Idempotent (a site on the newest version is skipped) and
 * resumable (each site commits by itself). A site that fails is counted
 * and the run goes on; nothing of it was written.
 *
 * `organizationId` keeps the run to one business's sites: for a first
 * careful run on a business that has agreed to go first.
 */
export async function upgradeTemplateSites(
    options: {
        dryRun?: boolean;
        limit?: number;
        organizationId?: string;
    } = {},
): Promise<TemplateUpgradeReport> {
    const dryRun = options.dryRun === true;
    const report: TemplateUpgradeReport = {
        dryRun,
        sites: 0,
        upgraded: 0,
        alreadyCurrent: 0,
        unknownVersion: 0,
        failed: 0,
        styleApplied: 0,
        styleKept: 0,
        footerApplied: 0,
        footerKept: 0,
        counts: emptyCounts(),
        moves: {},
    };
    let cursor: string | undefined;
    for (;;) {
        const batch = await prisma.site.findMany({
            where: {
                deletedAt: null,
                templateId: { in: [...UPGRADED_TEMPLATE_IDS] },
                ...(options.organizationId
                    ? { organizationId: options.organizationId }
                    : {}),
            },
            orderBy: { id: "asc" },
            take: BATCH,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            select: { id: true, templateId: true, templateVersion: true },
        });
        if (batch.length === 0) break;
        cursor = batch[batch.length - 1]?.id;
        for (const site of batch) {
            report.sites++;
            const move = versions(site);
            if (move === "current") {
                report.alreadyCurrent++;
                continue;
            }
            if (move === "unknown") {
                report.unknownVersion++;
                continue;
            }
            if (
                options.limit !== undefined &&
                report.upgraded >= options.limit
            ) {
                return report;
            }
            let result: SiteUpgradeOutcome;
            try {
                result = await upgradeSite(site.id, { dryRun });
            } catch {
                // Counted, never printed: an error's message can carry a
                // business's own words.
                report.failed++;
                continue;
            }
            if (result.outcome === "current") {
                report.alreadyCurrent++;
                continue;
            }
            if (result.outcome === "unknown") {
                report.unknownVersion++;
                continue;
            }
            report.upgraded++;
            const key = `${move.from.id}@${move.from.version} → ${move.to.id}@${move.to.version}`;
            report.moves[key] = (report.moves[key] ?? 0) + 1;
            if (result.look.style === "applied") report.styleApplied++;
            if (result.look.style === "kept") report.styleKept++;
            if (result.look.footer === "applied") report.footerApplied++;
            if (result.look.footer === "kept") report.footerKept++;
            for (const name of Object.keys(
                report.counts,
            ) as (keyof SyncCounts)[]) {
                report.counts[name] += result.counts[name];
            }
        }
    }
    return report;
}
