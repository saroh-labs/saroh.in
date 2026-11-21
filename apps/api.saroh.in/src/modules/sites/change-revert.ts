import { BadRequestException, Injectable } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import {
    AuditAction,
    auditMetadata,
    AuditOutcome,
} from "../audit/audit.service";
import { authorize } from "../organizations/organization-policy";
import type { RevertableSection } from "./change-units";
import {
    LEAVE_OUT_GONE_MESSAGE,
    readPages,
    revertSection,
} from "./change-units";
import type { UpdateSiteSettingsDto } from "./dto";
import type { PageDraftView } from "./sites.service";
import { SitesService } from "./sites.service";

/**
 * Undo one change (website editor plan U47a): one waiting change unit put
 * back as it is live, from History. The inverse of leaving it out (U8), but
 * it changes the DRAFT, so it is a separate act from Leave out (RULES §2).
 *
 * Each kind goes through the write that change was made with, so its checks,
 * its stamps and the draft's revision all hold as they do for an edit:
 *
 * - a section (`section:<pageId>:<key>`): the page's draft saved with that
 *   section as it is live (`revertSection`); a stale `revision` is a 409;
 * - a page's settings (`page:<pageId>`): its title, Google text, share image
 *   and "Show on Google" as live, or a hidden page shown again;
 * - a site setting (`site:<kind>`): the live value through its own update.
 *
 * What can't be put back on its own is refused with `reason: "cantUndo"`:
 * a new or removed page, a moved page link and the old links that forward,
 * the menu (published resolved, it no longer names its pages) and the tab
 * icon. Changing it back where it was made still works.
 */

export const CANT_UNDO_MESSAGE =
    "This change can't be undone on its own. Change it back where you made it.";
export const NOTHING_LIVE_MESSAGE =
    "Nothing is live yet, so there is nothing to go back to";

export interface RevertResult {
    unitKey: string;
    /** A section's page draft after the undo, for the editor to carry on from. */
    draft: PageDraftView | null;
}

function refuse(message: string, reason: string): BadRequestException {
    return new BadRequestException({ message, details: { reason } });
}

function asObject(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
}

const text = (value: unknown): string | null =>
    typeof value === "string" && value !== "" ? value : null;

@Injectable()
export class ChangeRevertService {
    constructor(private readonly sites: SitesService) {}

    async revert(
        ctx: OrganizationContext,
        siteId: string,
        input: { unitKey: string; revision?: number },
    ): Promise<RevertResult> {
        const { unitKey } = input;
        // The write the change was made with: refused before anything is read.
        authorize(
            ctx,
            unitKey.startsWith("section:") ? "section:write" : "site:update",
        );
        // 404 for a site not this caller's; the unit as the sheet names it.
        const changes = await this.sites.getChanges(ctx, siteId);
        if (changes.count === null) {
            throw refuse(NOTHING_LIVE_MESSAGE, "firstPublish");
        }
        const unit = changes.units.find((u) => u.key === unitKey);
        if (!unit) throw refuse(LEAVE_OUT_GONE_MESSAGE, "changeGone");

        const site = await prisma.site.findFirst({
            where: { id: siteId, organizationId: ctx.organizationId },
            select: { currentPublication: { select: { snapshot: true } } },
        });
        const live = site?.currentPublication?.snapshot ?? null;
        const livePage = unit.pageId
            ? (readPages(live).find((p) => p.id === unit.pageId) ?? null)
            : null;

        let draft: PageDraftView | null = null;
        if (unit.kind === "section") {
            const prefix = `section:${unit.pageId}:`;
            const key = unitKey.slice(prefix.length);
            if (
                !unit.pageId ||
                !unitKey.startsWith(prefix) ||
                key.startsWith("@") ||
                (livePage !== null && livePage.keys === null) ||
                // A section of a removed or hidden page comes back with it.
                (unit.requires.length > 0 && unit.change !== "added")
            ) {
                throw refuse(CANT_UNDO_MESSAGE, "cantUndo");
            }
            const now = await this.sites.getPageDraft(ctx, siteId, unit.pageId);
            const sections = revertSection(
                now.sections.map((s): RevertableSection => ({
                    key: s.key,
                    type: s.type,
                    contractVersion: s.contractVersion,
                    content: s.content,
                    hidden: s.hidden,
                })),
                livePage,
                key,
            );
            draft = await this.sites.replaceDraftSections(
                ctx,
                siteId,
                unit.pageId,
                { revision: input.revision, sections },
            );
        } else if (unit.kind === "page") {
            await this.revertPage(ctx, siteId, unit, livePage);
        } else {
            await this.revertSite(
                ctx,
                siteId,
                unitKey.slice("site:".length),
                asObject(asObject(live).site),
            );
        }

        await prisma.auditEvent.create({
            data: {
                action: AuditAction.SiteChangeReverted,
                actorUserId: ctx.userId,
                organizationId: ctx.organizationId,
                targetType: "site",
                targetId: siteId,
                outcome: AuditOutcome.Success,
                metadata: auditMetadata(ctx.roleKey, {
                    siteId,
                    unitKey,
                    kind: unit.kind,
                    change: unit.change,
                }),
            },
            select: { id: true },
        });
        return { unitKey, draft };
    }

    private async revertPage(
        ctx: OrganizationContext,
        siteId: string,
        unit: { pageId: string | null; change: string },
        live: ReturnType<typeof readPages>[number] | null,
    ): Promise<void> {
        if (!unit.pageId || !live) throw refuse(CANT_UNDO_MESSAGE, "cantUndo");
        if (unit.change === "hidden") {
            await this.sites.updatePage(ctx, siteId, unit.pageId, {
                hidden: false,
            });
            return;
        }
        const page = await prisma.page.findFirst({
            where: {
                id: unit.pageId,
                siteId,
                organizationId: ctx.organizationId,
            },
            select: {
                path: true,
                title: true,
                seoTitle: true,
                seoDescription: true,
                shareImageUrl: true,
                noindex: true,
            },
        });
        const was = live.entry;
        const fields = {
            title: live.title,
            seoTitle: text(was.seoTitle),
            seoDescription: text(was.seoDescription),
            shareImageUrl: text(was.shareImageUrl),
            noindex: was.noindex === true,
        };
        // A new link moves forwards with it; only its settings come back here.
        if (unit.change !== "changed" || page?.path !== live.path) {
            throw refuse(CANT_UNDO_MESSAGE, "cantUndo");
        }
        // Settings already as live: the waiting change is its old links.
        if (
            page.title === fields.title &&
            text(page.seoTitle) === fields.seoTitle &&
            text(page.seoDescription) === fields.seoDescription &&
            text(page.shareImageUrl) === fields.shareImageUrl &&
            page.noindex === fields.noindex
        ) {
            throw refuse(CANT_UNDO_MESSAGE, "cantUndo");
        }
        const { shareImageUrl, ...rest } = fields;
        await this.sites.updatePage(ctx, siteId, unit.pageId, {
            ...rest,
            // Sent only when it differs: sending it forgets a library photo.
            ...(text(page.shareImageUrl) !== shareImageUrl
                ? { shareImageUrl }
                : {}),
        });
    }

    private async revertSite(
        ctx: OrganizationContext,
        siteId: string,
        kind: string,
        live: Record<string, unknown>,
    ): Promise<void> {
        const settings = (dto: UpdateSiteSettingsDto) =>
            this.sites.updateSettings(ctx, siteId, dto);
        switch (kind) {
            case "style":
                await this.sites.updateStyle(ctx, siteId, live.style);
                return;
            case "footer":
                await this.sites.updateFooter(ctx, siteId, live.footer ?? null);
                return;
            case "name":
                await settings({ name: text(live.name) ?? "" });
                return;
            case "search":
                await settings({
                    seoTitle: text(live.seoTitle),
                    seoDescription: text(live.seoDescription),
                });
                return;
            case "posts":
                await settings({ postsPrefix: text(live.postsPrefix) });
                return;
            case "shareImage": {
                const image = asObject(live.socialImage);
                await settings({
                    socialImageUrl: text(live.socialImageUrl),
                    socialImageWidth:
                        typeof image.width === "number" ? image.width : null,
                    socialImageHeight:
                        typeof image.height === "number" ? image.height : null,
                });
                return;
            }
            default:
                throw refuse(CANT_UNDO_MESSAGE, "cantUndo");
        }
    }
}
