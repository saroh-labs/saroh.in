import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { parseSectionContent, prisma } from "@saroh/database";
import { isDeepStrictEqual } from "node:util";

import type { OrganizationContext } from "../../common/types/organization-context";
import {
    AuditAction,
    auditMetadata,
    AuditOutcome,
} from "../audit/audit.service";
import { authorize } from "../organizations/organization-policy";
import type { RevertableSection } from "./change-units";
import { readPages } from "./change-units";
import { assertSiteInOrg } from "./site-access";
import type { PageDraftView } from "./sites.service";
import { SitesService } from "./sites.service";

/**
 * Restore a version as the draft (DEC-232): a published
 * version's pages' sections copied into the current draft. Nothing goes
 * live until Publish; the old "make it live now" restore
 * (`SitesService.restorePublication`) stays in the API (DEC-232).
 *
 * Every page goes through `replaceDraftSections`, the editor's own save, so
 * its checks hold and every section it changes is stamped with the person
 * restoring (KTD-4): the Publish sheet shows each change as theirs.
 *
 * - The page the editor has open is checked against the `revision` it
 *   holds first; stale is the editor's usual 409, and nothing is written.
 * - Every section is checked before any page is written, so a version
 *   today's editor can't take back is refused whole, never half restored.
 * - A page removed since is skipped; a page added since stays as it is.
 *   Page settings, the menu and the look are not part of it.
 */

export const VERSION_UNREADABLE_MESSAGE =
    "This version has a section the editor can't take back any more, so it can't be restored as the draft.";

export interface RestoreAsDraftResult {
    publicationId: string;
    /** Pages whose draft changed. */
    restored: number;
    /** The open page's draft after the restore, when it changed. */
    draft: PageDraftView | null;
}

const asObject = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};

/** What a draft section is made of, without row ids or labels. */
const same = (
    a: readonly RevertableSection[],
    b: readonly RevertableSection[],
) =>
    isDeepStrictEqual(
        a.map(({ key, type, contractVersion, content, hidden }) => ({
            key,
            type,
            contractVersion,
            content,
            hidden,
        })),
        b.map(({ key, type, contractVersion, content, hidden }) => ({
            key,
            type,
            contractVersion,
            content,
            hidden,
        })),
    );

@Injectable()
export class VersionRestoreService {
    constructor(private readonly sites: SitesService) {}

    async restoreAsDraft(
        ctx: OrganizationContext,
        siteId: string,
        publicationId: string,
        input: { pageId?: string; revision?: number } = {},
    ): Promise<RestoreAsDraftResult> {
        // The editor's write: a reader is refused before anything is read.
        authorize(ctx, "section:write");
        await assertSiteInOrg(ctx, siteId);

        const source = await prisma.publication.findFirst({
            where: {
                id: publicationId,
                siteId,
                organizationId: ctx.organizationId,
                postId: null,
                kind: "LIVE",
            },
            select: { snapshot: true },
        });
        if (!source) {
            throw new NotFoundException(
                `Publication "${publicationId}" not found`,
            );
        }

        const inVersion = readPages(source.snapshot).filter(
            (p): p is typeof p & { id: string } => p.id !== null,
        );
        const existing = new Set(
            (
                await prisma.page.findMany({
                    where: {
                        id: { in: inVersion.map((p) => p.id) },
                        siteId,
                        organizationId: ctx.organizationId,
                    },
                    select: { id: true },
                })
            ).map((p) => p.id),
        );
        // The open page first, so a stale editor is told before any write.
        const pages = inVersion
            .filter((p) => existing.has(p.id))
            .sort(
                (a, b) =>
                    Number(b.id === input.pageId) -
                    Number(a.id === input.pageId),
            );

        const plans: {
            pageId: string;
            revision: number;
            sections: RevertableSection[];
        }[] = [];
        for (const page of pages) {
            const now = await this.sites.getPageDraft(ctx, siteId, page.id);
            if (
                page.id === input.pageId &&
                input.revision !== undefined &&
                input.revision !== now.revision
            ) {
                throw new ConflictException({
                    message:
                        "Someone else saved this page while you were editing. Reload to see their version.",
                    code: "DRAFT_REVISION_MISMATCH",
                    yours: input.revision,
                    current: now.revision,
                });
            }
            const current: RevertableSection[] = now.sections.map((s) => ({
                key: s.key,
                type: s.type,
                contractVersion: s.contractVersion,
                content: s.content,
                hidden: s.hidden,
            }));
            const sections = page.sections.map((raw, i): RevertableSection => {
                const s = asObject(raw);
                return {
                    key: page.keys?.[i] ?? "",
                    type: String(s.type),
                    contractVersion:
                        typeof s.contractVersion === "number"
                            ? s.contractVersion
                            : 1,
                    content: s.content,
                    hidden: false,
                };
            });
            // Checked as the save will check it: a section left as the
            // draft has it passes; anything else must parse today.
            for (const s of sections) {
                const kept = current.find((c) => c.key === s.key);
                if (
                    !parseSectionContent(s.type, s.contractVersion, s.content)
                        .success &&
                    !(
                        kept?.type === s.type &&
                        kept.contractVersion === s.contractVersion &&
                        isDeepStrictEqual(kept.content, s.content)
                    )
                ) {
                    throw new BadRequestException({
                        message: VERSION_UNREADABLE_MESSAGE,
                        details: { reason: "versionUnreadable" },
                    });
                }
            }
            if (!same(current, sections)) {
                plans.push({
                    pageId: page.id,
                    revision: now.revision,
                    sections,
                });
            }
        }

        let draft: PageDraftView | null = null;
        for (const plan of plans) {
            const saved = await this.sites.replaceDraftSections(
                ctx,
                siteId,
                plan.pageId,
                {
                    revision: plan.revision,
                    sections: plan.sections.map((s) => ({
                        ...s,
                        // An old version without keys: each one minted.
                        key: s.key || undefined,
                    })),
                },
            );
            if (plan.pageId === input.pageId) draft = saved;
        }

        await prisma.auditEvent.create({
            data: {
                action: AuditAction.SiteVersionRestoredAsDraft,
                actorUserId: ctx.userId,
                organizationId: ctx.organizationId,
                targetType: "site",
                targetId: siteId,
                outcome: AuditOutcome.Success,
                metadata: auditMetadata(ctx.roleKey, {
                    siteId,
                    publicationId,
                    pagesRestored: plans.length,
                }),
            },
            select: { id: true },
        });
        return { publicationId, restored: plans.length, draft };
    }
}
