/**
 * The website tools' one job (U11): `create_site_from_template` queues it,
 * and `get_job` reads what it wrote. Kept apart from `site.tools.ts` so the
 * job files the legal-hold and job-consumer scans read stay small: this job
 * creates a site and deletes nothing.
 */
import type { Job } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import { appBaseOf } from "../../../common/app-url";
import type {
    OrganizationContext,
    OrgRole,
} from "../../../common/types/organization-context";
import type { OrgAction } from "../../organizations/organization-actions";
import type { SitesService } from "../../sites/sites.service";
import { toolError } from "../tool-registry";

/** The job `create_site_from_template` starts; `get_job` reports it. */
export const SITE_FROM_TEMPLATE_JOB = "mcp.site-from-template";

export async function editorUrl(
    organizationId: string,
    siteId: string,
    pageId?: string,
): Promise<string> {
    const page = pageId ? `?page=${encodeURIComponent(pageId)}` : "";
    return `${await appBaseOf(organizationId)}/sites/${encodeURIComponent(siteId)}${page}`;
}

// ---------------------------------------------------------------------------
// The template job
// ---------------------------------------------------------------------------

export interface SiteFromTemplatePayload {
    /** Who asked, as the connection's context had it then. */
    actor: {
        userId: string;
        role: OrgRole;
        roleKey: string | null;
        actions: OrgAction[] | null;
    };
    request: {
        name: string;
        templateId?: string;
        styleId?: string;
        subdomain?: string;
    };
    /** Written by the job: the site made, or why not. */
    outcome?: { site_id: string; editor_url: string } | { error: string };
}

/** Runs `SITE_FROM_TEMPLATE_JOB`: the site, as the person who asked. */
export function siteFromTemplateHandler(d: { sites: SitesService }) {
    return async (job: Job): Promise<void> => {
        const payload = job.payload as unknown as SiteFromTemplatePayload;
        const organizationId = job.organizationId;
        if (!organizationId) return;
        const { actor, request } = payload;
        const ctx: OrganizationContext = {
            organizationId,
            userId: actor.userId,
            role: actor.role,
            ...(actor.roleKey ? { roleKey: actor.roleKey } : {}),
            ...(actor.actions ? { actions: new Set(actor.actions) } : {}),
        };
        const record = (outcome: SiteFromTemplatePayload["outcome"]) =>
            runInOrgContext(organizationId, () =>
                prisma.job.update({
                    where: { id: job.id },
                    data: {
                        payload: {
                            ...payload,
                            outcome,
                        },
                    },
                    select: { id: true },
                }),
            );
        try {
            const created = await runInOrgContext(organizationId, () =>
                d.sites.createFromTemplate(ctx, request),
            );
            await record({
                site_id: created.siteId,
                editor_url: await editorUrl(organizationId, created.siteId),
            });
        } catch (error) {
            // A refusal the person can act on is kept for get_job; the job
            // still fails, so it reads "failed".
            const said = toolError(error, "create_site_from_template");
            await record({ error: said.content[0].text });
            throw error;
        }
    };
}

/** What `get_job` says about a template job. */
export function describeSiteJob(job: Job) {
    const outcome = (job.payload as unknown as SiteFromTemplatePayload).outcome;
    if (outcome && "site_id" in outcome) {
        return {
            summary: `Made the website: site_id ${outcome.site_id}. Call get_site to see its pages. Editor: ${outcome.editor_url}`,
            result: { ...outcome },
        };
    }
    if (outcome) {
        return {
            summary: `Couldn't make the website. ${outcome.error}`,
            result: null,
        };
    }
    return {
        summary:
            job.status === "FAILED" || job.status === "CANCELLED"
                ? "Couldn't make the website. Try again in a minute."
                : "Making the website from the template.",
        result: null,
    };
}
