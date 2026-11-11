import { basename } from "node:path";

import type { OnModuleInit } from "@nestjs/common";
import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import {
    addPageTool,
    createSiteFromTemplateTool,
    deletePageTool,
    editPageTool,
    getPageTool,
    getSiteTool,
    listSectionTypesTool,
    listTemplatesTool,
    publishSiteTool,
    removeSectionTool,
    restoreSiteDraftTool,
    updatePageTool,
    updateSiteSettingsTool,
    uploadImageTool,
} from "@saroh/api-contract";
import type { SectionType } from "@saroh/block-contract";
import {
    BLOCK_META,
    blockExample,
    getSectionContract,
    latestContractVersion,
    liftToLatest,
    SECTION_TYPES,
} from "@saroh/block-contract";
import type { PageKind } from "@saroh/database";
import { Prisma, prisma } from "@saroh/database";
import type { ObjectStorage } from "@saroh/object-storage";
import { DEFAULT_MAX_UPLOAD_BYTES } from "@saroh/object-storage";
import { z } from "zod";

import { strictFetch } from "../../../common/net/ssrf";
import type { OrganizationContext } from "../../../common/types/organization-context";
import { JobHandlerRegistry } from "../../jobs/job-handler.registry";
import type { JobQueue } from "../../jobs/job-queue.port";
import { JOB_QUEUE } from "../../jobs/job-queue.port";
import { MediaService } from "../../media/media.service";
import { OBJECT_STORAGE } from "../../media/object-storage.provider";
import { IMAGE_TOO_BIG_MESSAGE } from "../../media/upload-checks";
import { authorize } from "../../organizations/organization-policy";
import { pageList } from "../../public-api/v1-support";
import { lockSite } from "../../sites/live-pointer";
import { approvalApplies } from "../../sites/publish-approval";
import { assertSiteInOrg } from "../../sites/site-access";
import { parseSiteFooter } from "../../sites/site-footer";
import { parseSiteNavigation } from "../../sites/site-navigation";
import { rendererBase, siteOriginOf } from "../../sites/site-origin";
import { SitePreviewLinksService } from "../../sites/site-preview-links.service";
import { SitesService } from "../../sites/sites.service";
import { restorePages } from "../../sites/starter-content";
import { templateCatalogue } from "../../sites/template-catalogue";
import { TestReleasesService } from "../../sites/test-releases.service";
import type { McpCall } from "../activity.service";
import { siteTarget } from "../activity.service";
import type { RestoreSnapshot } from "../restore-point.service";
import { RestorePointService } from "../restore-point.service";
import type { McpTool, ToolHints } from "../tool-registry";
import {
    defineTool,
    McpToolRegistry,
    READ_ONLY,
    ToolError,
} from "../tool-registry";
import { quoteUntrusted, untrusted } from "../untrusted";
import type { SiteFromTemplatePayload } from "./site-from-template.job";
import {
    describeSiteJob,
    editorUrl,
    SITE_FROM_TEMPLATE_JOB,
    siteFromTemplateHandler,
} from "./site-from-template.job";
export {
    describeSiteJob,
    SITE_FROM_TEMPLATE_JOB,
    siteFromTemplateHandler,
} from "./site-from-template.job";
export type { SiteFromTemplatePayload } from "./site-from-template.job";

/** How much section content `get_page` returns before cutting the rest. */
const PAGE_CONTENT_BUDGET = 16_000;
/** A query string longer than this isn't fetched (it can carry data out). */
const MAX_IMAGE_QUERY = 100;
/** Two restore points this close together were taken by simultaneous first writes. */
const SAME_SESSION_MS = 5_000;

const WRITE: ToolHints = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
};
const DESTRUCTIVE: ToolHints = { ...WRITE, destructiveHint: true };

const DRAFT_ONLY =
    "Visitors see nothing until the site is published with publish_site.";

/** What the site tools call; the class below wires them from Nest. */
export interface SiteToolDeps {
    sites: SitesService;
    previews: SitePreviewLinksService;
    releases: TestReleasesService;
    media: MediaService;
    storage: ObjectStorage;
    restorePoints: RestorePointService;
    queue: Pick<JobQueue, "enqueue">;
    /** The SSRF-guarded fetch; tests stand in a server. */
    fetchImage?: typeof strictFetch;
}

// ---------------------------------------------------------------------------
// Links and activity targets
// ---------------------------------------------------------------------------

/**
 * A site write's links: a fresh one-day preview of the draft (the token is
 * shown once, so each write mints its own) and the editor. No preview when
 * the connection may not share the draft (`site:update`).
 */
async function linksFor(
    d: SiteToolDeps,
    { ctx }: McpCall,
    siteId: string,
    pageId?: string,
) {
    let preview_url: string | null = null;
    try {
        const link = await d.previews.create(ctx, siteId, { expiresInDays: 1 });
        preview_url = `${rendererBase()}/preview/${encodeURIComponent(link.token)}`;
    } catch (error) {
        if (!(error instanceof ForbiddenException)) throw error;
    }
    return {
        preview_url,
        editor_url: await editorUrl(ctx.organizationId, siteId, pageId),
    };
}

function linksText(links: {
    preview_url: string | null;
    editor_url: string;
}): string {
    return [
        links.preview_url
            ? `Preview of the draft (works for 1 day): ${links.preview_url}`
            : null,
        `Open in the Saroh editor: ${links.editor_url}`,
    ]
        .filter(Boolean)
        .join("\n");
}

/**
 * A site write's activity target, naming each page it left at which draft
 * revision (`deleted` for a page it removed). `restore_site_draft` reads
 * these to tell this connection's edits from anyone else's.
 */
export function revisionsTarget(
    siteId: string,
    pages: Record<string, number | "deleted">,
): string {
    const list = Object.entries(pages).map(([id, rev]) => `${id}=${rev}`);
    return list.length
        ? `${siteTarget(siteId)}:revisions:${list.join(",")}`
        : siteTarget(siteId);
}

function revisionsIn(target: string | null): [string, string][] {
    const at = target?.indexOf(":revisions:") ?? -1;
    if (!target || at < 0) return [];
    return target
        .slice(at + ":revisions:".length)
        .split(",")
        .map((pair) => pair.split("=") as [string, string]);
}

/** A site id, or the business's only website when none is named. */
async function siteIdOf(ctx: OrganizationContext, siteId?: string) {
    if (siteId) return siteId;
    const sites = await prisma.site.findMany({
        where: { organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true },
        take: 2,
    });
    if (sites.length === 1) return sites[0].id;
    throw sites.length
        ? new ToolError(
              "This business has more than one website.",
              "Pass a site_id; saroh_start lists them.",
          )
        : new ToolError(
              "This business has no website yet.",
              "Make one with list_templates, then create_site_from_template.",
          );
}

const join = (items: string[]) => (items.length ? items.join("; ") : "none");

// ---------------------------------------------------------------------------
// The tools
// ---------------------------------------------------------------------------

export function siteTools(d: SiteToolDeps): McpTool[] {
    const getSite = defineTool({
        name: "get_site",
        title: "Get a website",
        description:
            "Use this when you need a website's pages (with page_id), menu, footer, style, address and unpublished changes, before changing it. Don't use it for one page's sections: use get_page. Example: before adding a page, call get_site to see which paths are taken.",
        contract: getSiteTool,
        capability: "site:read",
        module: "WEBSITE",
        hints: READ_ONLY,
        async run(input, { ctx }: McpCall) {
            const id = await siteIdOf(ctx, input.site_id);
            const site = await d.sites.getSite(ctx, id);
            const [live, editor] = await Promise.all([
                site.currentPublicationId
                    ? siteOriginOf(ctx.organizationId, { siteId: id })
                    : null,
                editorUrl(ctx.organizationId, id),
            ]);
            const pages = site.pages.map((p) => ({
                page_id: p.id,
                title: untrusted(p.title),
                path: p.path,
                is_home: p.isHome,
                hidden: p.hidden,
                in_menu: p.inMenu,
                kind: p.kind,
            }));
            const navigation = (site.navigation?.items ?? []).map((i) => ({
                page_id: i.pageId,
                label: i.label ? untrusted(i.label) : null,
            }));
            const settings = site.pendingSiteChanges ?? [];
            const data = {
                site_id: site.id,
                name: untrusted(site.name),
                published: site.currentPublicationId !== null,
                live_url: live,
                editor_url: editor,
                publish_needs_approval: site.publishNeedsApproval,
                unpublished_changes: {
                    sections: site.pendingSectionChanges,
                    settings,
                },
                pages,
                style: site.style as unknown as Record<string, unknown>,
                navigation,
                footer: site.footer ? untrusted(site.footer.value) : null,
            };
            const text = [
                `Website ${quoteUntrusted("name", site.name)} (site_id ${site.id}): ${live ? `live at ${live}` : "not published yet"}.`,
                site.currentPublicationId
                    ? `Unpublished changes: ${site.pendingSectionChanges ?? 0} sections; settings: ${settings.join(", ") || "none"}.`
                    : "Everything is unpublished.",
                site.publishNeedsApproval
                    ? "Publishing may need a reviewer's approval."
                    : null,
                `Pages (${pages.length}):`,
                ...site.pages.map(
                    (p) =>
                        `- ${p.path} (page_id ${p.id}${p.isHome ? ", home" : ""}${p.hidden ? ", hidden" : ""}${p.inMenu ? "" : ", not in menu"}${p.kind === "FREE" ? "" : `, ${p.kind} page`}): ${quoteUntrusted("title", p.title)}`,
                ),
                `Menu: ${navigation.map((n) => n.page_id).join(", ") || "none"}.`,
                site.footer
                    ? quoteUntrusted("footer", site.footer.value)
                    : "No footer.",
                `Style: ${JSON.stringify(site.style)}`,
                `Open in the Saroh editor: ${editor}`,
            ]
                .filter(Boolean)
                .join("\n");
            return { text, data };
        },
    });

    const listTemplates = defineTool({
        name: "list_templates",
        title: "List website templates",
        description:
            "Use this when the person wants a new website and you need a template_id (and colourway) for create_site_from_template. Don't use it to change an existing site. Example: a salon asks for a site; pick the template whose kinds include salons.",
        contract: listTemplatesTool,
        capability: "site:read",
        module: "WEBSITE",
        hints: READ_ONLY,
        run({ cursor }) {
            const page = pageList(
                templateCatalogue(),
                { cursor, limit: 20 },
                (t) => t.id,
                (t) => ({
                    template_id: t.id,
                    name: t.name,
                    description: t.description ?? null,
                    for_kinds: [...t.kinds],
                    pages: t.pages,
                    colourway_ids: t.colourways.map((c) => c.id),
                }),
            );
            const text = [
                `${page.data.length} templates${page.nextCursor ? `; more with cursor ${page.nextCursor}` : ""}.`,
                ...page.data.map(
                    (t) =>
                        `- ${t.name} (template_id ${t.template_id})${t.description ? `: ${t.description}` : ""} For: ${t.for_kinds.join(", ") || "any business"}. Pages: ${t.pages.join(", ")}. Colourways: ${t.colourway_ids.join(", ") || "default"}.`,
                ),
            ].join("\n");
            return Promise.resolve({
                text,
                data: { templates: page.data, next_cursor: page.nextCursor },
            });
        },
    });

    const listSectionTypes = defineTool({
        name: "list_section_types",
        title: "List section types",
        description:
            "Use this when you are about to add or change a section with edit_page and need the section types, or one type's fields (pass type). Don't use it to read a page: use get_page. Example: list_section_types with type \"hero\" before adding a hero.",
        contract: listSectionTypesTool,
        capability: "site:read",
        module: "WEBSITE",
        hints: READ_ONLY,
        run({ type }) {
            const types = SECTION_TYPES.map((t) => ({
                type: t,
                label: BLOCK_META[t].label,
                description: BLOCK_META[t].description,
                variants: BLOCK_META[t].variants.map((v) => v.id),
            }));
            if (!type) {
                return Promise.resolve({
                    text: [
                        `${types.length} section types. Call again with type for one type's fields and an example.`,
                        ...types.map(
                            (t) =>
                                `- ${t.type} (${t.label}): ${t.description} Variants: ${t.variants.join(", ")}.`,
                        ),
                    ].join("\n"),
                    data: { types, schema: null, example: null },
                });
            }
            if (!(SECTION_TYPES as readonly string[]).includes(type)) {
                throw new ToolError(
                    `There is no section type "${type}".`,
                    "Call list_section_types without type to see them.",
                );
            }
            const contract = getSectionContract(
                type,
                latestContractVersion(type),
            );
            const schema = contract
                ? (z.toJSONSchema(contract.schema, {
                      io: "input",
                      unrepresentable: "any",
                  }) as Record<string, unknown>)
                : null;
            const example = blockExample(type as SectionType)?.content ?? null;
            const one = types.filter((t) => t.type === type);
            return Promise.resolve({
                text: [
                    `${one[0].type} (${one[0].label}): ${one[0].description}`,
                    `Fields (JSON schema): ${JSON.stringify(schema)}`,
                    example ? `Example: ${JSON.stringify(example)}` : null,
                    "An image field takes an image_url from upload_image.",
                ]
                    .filter(Boolean)
                    .join("\n"),
                data: { types: one, schema, example },
            });
        },
    });

    const getPage = defineTool({
        name: "get_page",
        title: "Get a page",
        description:
            "Use this when you need a page's sections (each with a section_key) and their content, before edit_page or remove_section. Don't use it for the page list: use get_site. Example: to change a hero's heading, get_page, then edit_page with an update op on its section_key.",
        contract: getPageTool,
        capability: "site:read",
        module: "WEBSITE",
        hints: READ_ONLY,
        async run({ site_id, page_id, section_key }, { ctx }: McpCall) {
            const read = await d.sites.getPageForReview(ctx, site_id, page_id);
            const page = await prisma.page.findFirstOrThrow({
                where: {
                    id: page_id,
                    siteId: site_id,
                    organizationId: ctx.organizationId,
                },
                select: { title: true, path: true },
            });
            let sections = read.sections;
            if (section_key) {
                sections = sections.filter((s) => s.key === section_key);
                if (!sections.length) {
                    throw new ToolError(
                        `There is no section ${section_key} on this page.`,
                        "Call get_page without section_key to see its sections.",
                    );
                }
            }
            let spent = 0;
            let cut = false;
            const views = sections.map((s) => {
                const json = JSON.stringify(s.content);
                spent += json.length;
                if (spent > PAGE_CONTENT_BUDGET && !section_key) cut = true;
                return {
                    section_key: s.key,
                    type: s.type,
                    hidden: s.hidden,
                    content: cut ? null : untrusted(json),
                };
            });
            const text = [
                `Page ${quoteUntrusted("title", page.title)} at ${page.path} (page_id ${page_id}): ${views.length} sections, top to bottom.`,
                ...views.map(
                    (v) =>
                        `- section_key ${v.section_key}: ${v.type}${v.hidden ? " (hidden)" : ""}. ${v.content ? quoteUntrusted("content", v.content.text) : "Content cut for size: call get_page with this section_key."}`,
                ),
            ].join("\n");
            return {
                text,
                data: {
                    page_id,
                    title: untrusted(page.title),
                    path: page.path,
                    sections: views,
                    cut_for_size: cut,
                },
            };
        },
    });

    const createSite = defineTool({
        name: "create_site_from_template",
        title: "Make a website from a template",
        description:
            "Use this when the person wants a new website: it makes a draft site from a template (list_templates) in the background and answers with a job_id; poll get_job until done for the site_id. Don't use it to change an existing site. Example: create_site_from_template with name \"Asha's Salon\" and a salon template_id.",
        contract: createSiteFromTemplateTool,
        capability: "site:create",
        module: "WEBSITE",
        hints: WRITE,
        async run(input, { ctx }: McpCall) {
            if (
                input.template_id &&
                !templateCatalogue().some((t) => t.id === input.template_id)
            ) {
                throw new ToolError(
                    `There is no template ${input.template_id}.`,
                    "Call list_templates and use one of its template_id values.",
                );
            }
            const payload: SiteFromTemplatePayload = {
                actor: {
                    userId: ctx.userId,
                    role: ctx.role,
                    roleKey: ctx.roleKey ?? null,
                    actions: ctx.actions ? [...ctx.actions] : null,
                },
                request: {
                    name: input.name,
                    templateId: input.template_id,
                    styleId: input.colourway_id,
                    subdomain: input.subdomain,
                },
            };
            // Not retried: a second run after a first that made the site
            // would make another. A failed job is the model's to retry.
            const job = await d.queue.enqueue({
                type: SITE_FROM_TEMPLATE_JOB,
                organizationId: ctx.organizationId,
                payload,
                maxAttempts: 1,
            });
            return {
                text: `Started making the website ${quoteUntrusted("name", input.name)} (job_id ${job.id}). Call get_job with this job_id in a few seconds; when it is done it gives the site_id.`,
                data: { job_id: job.id },
                activity: {
                    summary: "Started making a website from a template.",
                },
            };
        },
    });

    const addPage = defineTool({
        name: "add_page",
        title: "Add a page",
        description:
            'Use this when the person wants a new, empty page on their website draft; then fill it with edit_page. Don\'t use it to rename or move a page: use update_page. Example: add_page with title "About us" and path "/about".',
        contract: addPageTool,
        capability: "site:update",
        module: "WEBSITE",
        hints: WRITE,
        async run({ site_id, title, path, in_menu }, call: McpCall) {
            await d.restorePoints.beforeSiteWrite(call, site_id);
            const page = await d.sites.createPage(call.ctx, site_id, {
                title,
                path,
                ...(in_menu === undefined ? {} : { inMenu: in_menu }),
            });
            const links = await linksFor(d, call, site_id, page.id);
            return {
                text: [
                    `Added the page ${page.path} (page_id ${page.id}) to the website's draft, with no sections yet: add them with edit_page. ${DRAFT_ONLY}`,
                    linksText(links),
                ].join("\n"),
                data: {
                    site_id,
                    page_id: page.id,
                    changed: [`added page ${page.path}`],
                    links,
                },
                activity: {
                    target: revisionsTarget(site_id, { [page.id]: 0 }),
                    summary: "Added a page to the website draft.",
                },
            };
        },
    });

    const updatePage = defineTool({
        name: "update_page",
        title: "Change a page's details",
        description:
            'Use this when the person renames a page, changes its address (path), hides or shows it, or takes it in or out of the menu. Don\'t use it for what is on the page: use edit_page. Example: update_page with path "/our-story".',
        contract: updatePageTool,
        capability: "site:update",
        module: "WEBSITE",
        hints: { ...WRITE, idempotentHint: true },
        async run({ site_id, page_id, ...fields }, call: McpCall) {
            // The contract leaves out a field not sent.
            const changed = Object.keys(fields);
            if (!changed.length) {
                throw new ToolError(
                    "Nothing to change.",
                    "Pass title, path, hidden or in_menu.",
                );
            }
            await d.restorePoints.beforeSiteWrite(call, site_id);
            const page = await d.sites.updatePage(call.ctx, site_id, page_id, {
                title: fields.title,
                path: fields.path,
                hidden: fields.hidden,
                inMenu: fields.in_menu,
            });
            const links = await linksFor(d, call, site_id, page_id);
            return {
                text: [
                    `Changed the page ${page.path} (page_id ${page_id}) in the draft: ${changed.join(", ")}. ${DRAFT_ONLY}`,
                    linksText(links),
                ].join("\n"),
                data: { site_id, page_id, changed, links },
                activity: {
                    target: siteTarget(site_id),
                    summary: "Changed a page's details in the website draft.",
                },
            };
        },
    });

    /** Read a page's draft, change its list, save it against the revision read. */
    async function saveSections(
        call: McpCall,
        siteId: string,
        pageId: string,
        change: (list: DraftItem[]) => string[],
    ) {
        await d.restorePoints.beforeSiteWrite(call, siteId);
        const draft = await d.sites.getPageDraft(call.ctx, siteId, pageId);
        const list: DraftItem[] = draft.sections.map((s) => ({
            type: s.type,
            contractVersion: s.contractVersion,
            content: s.content,
            hidden: s.hidden,
            key: s.key,
        }));
        const changed = change(list);
        const before = new Set(draft.sections.map((s) => s.key));
        const saved = await d.sites.replaceDraftSections(
            call.ctx,
            siteId,
            pageId,
            { sections: list, revision: draft.revision },
        );
        const added = saved.sections
            .filter((s) => !before.has(s.key))
            .map((s) => s.key);
        const links = await linksFor(d, call, siteId, pageId);
        return { changed, added, links, revision: saved.revision };
    }

    const editPage = defineTool({
        name: "edit_page",
        title: "Edit a page's sections",
        description:
            'Use this when the person wants to add, change or reorder sections on a page of their website draft: one call takes up to 20 ops (add, update, move). Take section_key values from get_page and fields from list_section_types. Don\'t use it to remove a section: use remove_section. Example: ops [{"op":"update","section_key":"k1","content":{"heading":"Fresh bread daily"}},{"op":"add","type":"faq","content":{...}}].',
        contract: editPageTool,
        capability: "section:write",
        module: "WEBSITE",
        hints: WRITE,
        async run({ site_id, page_id, ops }, call: McpCall) {
            const out = await saveSections(call, site_id, page_id, (list) =>
                ops.map((op, i) => {
                    if (op.op === "add") {
                        if (
                            !(SECTION_TYPES as readonly string[]).includes(
                                op.type,
                            )
                        ) {
                            throw new ToolError(
                                `ops[${i}]: there is no section type "${op.type}".`,
                                "Call list_section_types to see them.",
                            );
                        }
                        const at = Math.min(
                            op.position ?? list.length,
                            list.length,
                        );
                        list.splice(at, 0, {
                            type: op.type,
                            contractVersion: latestContractVersion(op.type),
                            content: op.content,
                            hidden: false,
                        });
                        return `added a ${op.type} section at position ${at}`;
                    }
                    const at = list.findIndex((s) => s.key === op.section_key);
                    if (at < 0) {
                        throw new ToolError(
                            `ops[${i}]: there is no section ${op.section_key} on this page.`,
                            "Call get_page for the page's section_key values.",
                        );
                    }
                    if (op.op === "move") {
                        const [moved] = list.splice(at, 1);
                        const to = Math.min(op.position, list.length);
                        list.splice(to, 0, moved);
                        return `moved section ${op.section_key} to position ${to}`;
                    }
                    const s = list[at];
                    if (op.content) {
                        // An old contract's content moves to the newest first,
                        // as the editor does when it touches a section.
                        const lifted = liftToLatest(
                            s.type,
                            s.contractVersion,
                            (s.content ?? {}) as Record<string, unknown>,
                        );
                        s.contractVersion = lifted.version;
                        s.content = { ...lifted.content, ...op.content };
                    }
                    if (op.hidden !== undefined) s.hidden = op.hidden;
                    return `updated section ${op.section_key}`;
                }),
            );
            const changed = [
                ...out.changed,
                ...(out.added.length
                    ? [`new section_key: ${out.added.join(", ")}`]
                    : []),
            ];
            return {
                text: [
                    `Changed the draft of page ${page_id}: ${changed.join("; ")}. ${DRAFT_ONLY}`,
                    linksText(out.links),
                ].join("\n"),
                data: { site_id, page_id, changed, links: out.links },
                activity: {
                    target: revisionsTarget(site_id, {
                        [page_id]: out.revision,
                    }),
                    summary: "Edited sections of a page in the website draft.",
                },
            };
        },
    });

    const removeSection = defineTool({
        name: "remove_section",
        title: "Remove a section",
        description:
            "Use this when the person wants one section taken off a page of their website draft. Ask the person first. Don't use it to hide a section for now: use edit_page with hidden true. Example: remove_section with the section_key of an old offer.",
        contract: removeSectionTool,
        capability: "section:write",
        module: "WEBSITE",
        hints: { ...DESTRUCTIVE, idempotentHint: true },
        async run({ site_id, page_id, section_key }, call: McpCall) {
            const out = await saveSections(call, site_id, page_id, (list) => {
                const at = list.findIndex((s) => s.key === section_key);
                if (at < 0) {
                    throw new ToolError(
                        `There is no section ${section_key} on this page.`,
                        "Call get_page for the page's section_key values.",
                    );
                }
                const [gone] = list.splice(at, 1);
                return [`removed the ${gone.type} section ${section_key}`];
            });
            return {
                text: [
                    `Removed section ${section_key} from the draft of page ${page_id}. ${DRAFT_ONLY} restore_site_draft can put it back.`,
                    linksText(out.links),
                ].join("\n"),
                data: {
                    site_id,
                    page_id,
                    changed: out.changed,
                    links: out.links,
                },
                activity: {
                    target: revisionsTarget(site_id, {
                        [page_id]: out.revision,
                    }),
                    summary: "Removed a section from the website draft.",
                },
            };
        },
    });

    const deletePage = defineTool({
        name: "delete_page",
        title: "Delete a page",
        description:
            "Use this when the person wants a whole page gone from their website draft. Ask the person first. The home page can't be deleted. Don't use it to take a page out of the menu: use update_page. Example: delete_page for an old /offers page.",
        contract: deletePageTool,
        capability: "site:update",
        module: "WEBSITE",
        hints: { ...DESTRUCTIVE, idempotentHint: true },
        async run({ site_id, page_id }, call: McpCall) {
            await d.restorePoints.beforeSiteWrite(call, site_id);
            await d.sites.deletePage(call.ctx, site_id, page_id);
            const links = await linksFor(d, call, site_id);
            return {
                text: [
                    `Deleted page ${page_id} from the website's draft. ${DRAFT_ONLY} restore_site_draft can bring it back.`,
                    linksText(links),
                ].join("\n"),
                data: { site_id, changed: [`deleted page ${page_id}`], links },
                activity: {
                    target: revisionsTarget(site_id, { [page_id]: "deleted" }),
                    summary: "Deleted a page from the website draft.",
                },
            };
        },
    });

    const updateSettings = defineTool({
        name: "update_site_settings",
        title: "Change a website's style, menu or footer",
        description:
            'Use this when the person wants their website\'s look (style), menu (navigation) or footer changed. Pass only what changes; navigation is the whole menu. Don\'t use it for page content: use edit_page. Example: navigation [{"page_id":"p1"},{"page_id":"p2","label":"Book"}].',
        contract: updateSiteSettingsTool,
        capability: "site:update",
        module: "WEBSITE",
        hints: { ...WRITE, idempotentHint: true },
        async run({ site_id, style, navigation, footer }, call: McpCall) {
            const { ctx } = call;
            if (!style && !navigation && !footer) {
                throw new ToolError(
                    "Nothing to change.",
                    "Pass style, navigation or footer.",
                );
            }
            const nav = navigation && {
                items: navigation.map((i) => ({
                    pageId: i.page_id,
                    ...(i.label ? { label: i.label } : {}),
                })),
            };
            const foot = footer && {
                format: "markdown",
                value: footer.text,
                ...(footer.layout ? { layout: footer.layout } : {}),
            };
            // Checked before anything is written, so a bad menu or footer
            // never leaves the style changed alone.
            if (nav) parseSiteNavigation(nav);
            if (foot) parseSiteFooter(foot);
            await d.restorePoints.beforeSiteWrite(call, site_id);
            const changed: string[] = [];
            if (style) {
                const current = (await d.sites.getSite(ctx, site_id))
                    .style as unknown as Record<string, unknown>;
                await d.sites.updateStyle(
                    ctx,
                    site_id,
                    mergeStyle(current, style),
                );
                changed.push("style");
            }
            if (nav) {
                await d.sites.updateNavigation(ctx, site_id, nav);
                changed.push("menu");
            }
            if (foot) {
                await d.sites.updateFooter(ctx, site_id, foot);
                changed.push("footer");
            }
            const links = await linksFor(d, call, site_id);
            return {
                text: [
                    `Changed the website draft's ${changed.join(", ")}. ${DRAFT_ONLY}`,
                    linksText(links),
                ].join("\n"),
                data: { site_id, changed, links },
                activity: {
                    target: siteTarget(site_id),
                    summary: `Changed the website draft's ${changed.join(", ")}.`,
                },
            };
        },
    });

    const uploadImage = defineTool({
        name: "upload_image",
        title: "Add an image from a web address",
        description:
            "Use this when the person gives an image's public https address to use on their website: Saroh fetches it (JPG, PNG, WebP, GIF or AVIF, up to 10 MB) into their media library and gives an image_url for a section's image field. Confirm the address with the person first. Don't use it for addresses with a long query string or behind a sign-in. Example: upload_image with url \"https://example.com/shopfront.jpg\".",
        contract: uploadImageTool,
        capability: "media:write",
        hints: { ...WRITE, openWorldHint: true },
        async run({ url, name }, { ctx }: McpCall) {
            const address = url.trim();
            let parsed: URL;
            try {
                parsed = new URL(address);
            } catch {
                throw new ToolError(
                    "That isn't a web address.",
                    "Pass the image's full https address.",
                );
            }
            if (parsed.search.length > MAX_IMAGE_QUERY) {
                throw new ToolError(
                    "That address has a long query string (the part after ?), which Saroh doesn't fetch.",
                    "Use the image's plain address, or ask the person to upload the image in the Saroh app.",
                );
            }
            const got = await (d.fetchImage ?? strictFetch)(address, {
                timeoutMs: 10_000,
                maxBytes: DEFAULT_MAX_UPLOAD_BYTES + 1,
                headers: { accept: "image/*" },
            });
            if (!got.ok) {
                throw new ToolError(
                    got.failure === "blocked" || got.failure === "invalid"
                        ? "Saroh doesn't fetch from that address: it must be a public https address on the usual port, with no redirect."
                        : "Saroh couldn't reach that address.",
                    "Use the image file's own public https address, or ask the person to upload it in the Saroh app.",
                );
            }
            if (got.status !== 200) {
                throw new ToolError(
                    `That address answered ${got.status}, not an image.`,
                    "Check the address with the person.",
                );
            }
            if (
                got.truncated ||
                got.body.byteLength > DEFAULT_MAX_UPLOAD_BYTES
            ) {
                throw new ToolError(
                    IMAGE_TOO_BIG_MESSAGE,
                    "Use a smaller image.",
                );
            }
            const contentType = (got.headers["content-type"] ?? "")
                .split(";")[0]
                .trim()
                .toLowerCase();
            const filename =
                name ?? (basename(parsed.pathname) || "image from the web");
            const upload = await d.media.createUpload(ctx, {
                contentType,
                contentLength: got.body.byteLength,
                filename,
            });
            await d.storage.putObject(upload.key, got.body, {
                contentType,
                contentLength: got.body.byteLength,
            });
            // Sniffs the bytes, counts the storage, flips it READY.
            const done = await d.media.completeUpload(ctx, upload.mediaId);
            return {
                text: `Added the image to the business's media library (media_id ${done.id}, ${done.sizeBytes} bytes).${done.url ? ` Use this image_url in a section's image field: ${done.url}` : ""}`,
                data: {
                    media_id: done.id,
                    image_url: done.url,
                    bytes: done.sizeBytes,
                },
                activity: {
                    target: `media:${done.id}`,
                    // The full address, as asked: an image fetch is the one
                    // way out of Saroh a write tool has.
                    summary: `Added an image to the media library from ${address}`,
                },
            };
        },
    });

    const publishSite = defineTool({
        name: "publish_site",
        title: "Publish a website",
        description:
            "Use this when the person has seen the preview and clearly said to publish: it puts the website's draft live for everyone, or, when the site needs a reviewer's approval, sends it to the reviewers instead. Always ask the person first. Don't use it to save edits: every edit is already saved in the draft. Example: after \"looks good, put it live\", publish_site with the site_id.",
        contract: publishSiteTool,
        capability: "site:publish",
        module: "WEBSITE",
        hints: { ...DESTRUCTIVE, openWorldHint: true },
        async run({ site_id }, { ctx }: McpCall) {
            const site = await d.sites.getSite(ctx, site_id);
            const changed = site.currentPublicationId
                ? [
                      `${site.pendingSectionChanges ?? 0} section changes`,
                      ...(site.pendingSiteChanges ?? []).map(
                          (k) => `${k} changed`,
                      ),
                  ]
                : ["first publish: the whole site"];
            const editor = await editorUrl(ctx.organizationId, site_id);
            if (
                await approvalApplies(
                    ctx.organizationId,
                    site.publishNeedsApproval,
                )
            ) {
                const made = await d.releases.create(ctx, site_id, {});
                await d.sites.requestReview(ctx, site_id, made.release.id);
                return {
                    text: `Not published yet: this website needs a reviewer's approval first. Saroh saved the draft as ${made.release.name} and asked the site's reviewers to approve it; it goes live from the editor once approved. Changes in it: ${changes(changed)}. Editor: ${editor}`,
                    data: {
                        site_id,
                        outcome: "sent_for_approval" as const,
                        changed,
                        live_url: null,
                        editor_url: editor,
                    },
                    activity: {
                        target: siteTarget(site_id),
                        summary:
                            "Sent the website draft to its reviewers for approval.",
                    },
                };
            }
            // Never `override`: going live past approval is an owner's call
            // in the app.
            await d.sites.publishSite(ctx, site_id);
            const live = await siteOriginOf(ctx.organizationId, {
                siteId: site_id,
            });
            return {
                text: `Published the website: it is live${live ? ` at ${live}` : ""}. What changed: ${changes(changed)}. Editor: ${editor}`,
                data: {
                    site_id,
                    outcome: "published" as const,
                    changed,
                    live_url: live,
                    editor_url: editor,
                },
                activity: {
                    target: siteTarget(site_id),
                    summary: "Published the website.",
                },
            };
        },
    });

    const restoreDraft = defineTool({
        name: "restore_site_draft",
        title: "Undo this conversation's website changes",
        description:
            "Use this when the person wants the website's draft put back as it was before this conversation's changes (pages, sections, style, menu, footer). Ask the person first. It never changes the live site. If the draft was also changed elsewhere it refuses and says what; call again with confirm_outside_changes true only once the person agrees to lose those. Don't use it to undo a publish.",
        contract: restoreSiteDraftTool,
        capability: "site:update",
        module: "WEBSITE",
        hints: DESTRUCTIVE,
        async run({ site_id, confirm_outside_changes }, call: McpCall) {
            const { ctx } = call;
            authorize(ctx, "section:write");
            await assertSiteInOrg(ctx, site_id);
            const point = await sessionPoint(d, call, site_id);
            const outside = await changedOutside(call, site_id, point);
            if (outside.length && !confirm_outside_changes) {
                throw new ToolError(
                    `The draft was also changed outside this conversation since ${point.sessionStartedAt.toISOString()}: ${outside.join("; ")}. Restoring would undo those changes too.`,
                    "Ask the person; if they agree, call restore_site_draft again with confirm_outside_changes true.",
                );
            }
            // A new session's restore point is the draft as it is now, so
            // this restore can itself be undone.
            await d.restorePoints.beforeSiteWrite(call, site_id);
            const result = await restoreSnapshot(ctx, site_id, point.snapshot);
            const links = await linksFor(d, call, site_id);
            const changed = [
                `put back ${point.snapshot.pages.length} pages`,
                ...(result.removed
                    ? [`removed ${result.removed} added pages`]
                    : []),
                ...(result.recreated
                    ? [`brought back ${result.recreated} deleted pages`]
                    : []),
                "put back the style, menu and footer",
            ];
            return {
                text: [
                    `Restored the website's draft to how it was at ${point.sessionStartedAt.toISOString()}: ${changed.join("; ")}. The live site is unchanged.`,
                    linksText(links),
                ].join("\n"),
                data: {
                    site_id,
                    restored_to: point.sessionStartedAt.toISOString(),
                    changed,
                    links,
                },
                activity: {
                    target: revisionsTarget(site_id, result.revisions),
                    summary: "Restored the website draft to a restore point.",
                },
            };
        },
    });

    return [
        getSite,
        listTemplates,
        listSectionTypes,
        getPage,
        createSite,
        addPage,
        updatePage,
        editPage,
        removeSection,
        deletePage,
        updateSettings,
        uploadImage,
        publishSite,
        restoreDraft,
    ] as McpTool[];
}

const changes = (changed: string[]) => join(changed);

/** One section of a draft as `replaceDraftSections` takes it. */
interface DraftItem {
    type: string;
    contractVersion: number;
    content: unknown;
    hidden: boolean;
    key?: string;
}

/** A style change on top of the current style: colours and scalars merge, null removes. */
function mergeStyle(
    current: Record<string, unknown>,
    change: Record<string, unknown>,
): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...current };
    for (const [key, value] of Object.entries(change)) {
        const was = current[key];
        if (value === null) delete merged[key];
        else if (
            (key === "colours" || key === "scalars") &&
            isRecord(value) &&
            isRecord(was)
        ) {
            merged[key] = { ...was, ...value };
        } else merged[key] = value;
    }
    return merged;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

/**
 * This connection's restore point for the site: the latest session's, and
 * of two taken by simultaneous first writes, the earlier.
 */
export async function sessionPoint(
    d: Pick<SiteToolDeps, "restorePoints">,
    call: McpCall,
    siteId: string,
) {
    const latest = await d.restorePoints.latest(call, siteId);
    if (!latest) {
        throw new ToolError(
            "This connection hasn't changed this website, so there is nothing to restore.",
            "Nothing to do; the person can see earlier versions in the Saroh editor.",
        );
    }
    const earliest = await prisma.siteRestorePoint.findFirst({
        where: {
            organizationId: call.ctx.organizationId,
            siteId,
            connectionId: call.connection.id,
            sessionStartedAt: {
                gte: new Date(
                    latest.sessionStartedAt.getTime() - SAME_SESSION_MS,
                ),
            },
        },
        orderBy: { sessionStartedAt: "asc" },
        select: { sessionStartedAt: true, snapshot: true },
    });
    return {
        sessionStartedAt: earliest?.sessionStartedAt ?? latest.sessionStartedAt,
        snapshot: (earliest?.snapshot ??
            latest.snapshot) as unknown as RestoreSnapshot,
    };
}

/**
 * What changed in the draft since the restore point that this connection
 * didn't do: a page's draft at a later revision than this connection left
 * it, a page added or deleted by someone else, or the site's settings saved
 * after this connection's last write.
 */
export async function changedOutside(
    { ctx, connection }: McpCall,
    siteId: string,
    point: { sessionStartedAt: Date; snapshot: RestoreSnapshot },
): Promise<string[]> {
    const [ours, site, pages] = await Promise.all([
        prisma.mcpActivity.findMany({
            where: {
                organizationId: ctx.organizationId,
                connectionId: connection.id,
                target: { startsWith: siteTarget(siteId) },
                createdAt: { gte: point.sessionStartedAt },
            },
            select: { target: true, createdAt: true },
        }),
        prisma.site.findFirstOrThrow({
            where: { id: siteId, organizationId: ctx.organizationId },
            select: { updatedAt: true },
        }),
        prisma.page.findMany({
            where: { siteId, organizationId: ctx.organizationId },
            select: {
                id: true,
                path: true,
                versions: {
                    where: { status: "DRAFT" },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: { revision: true },
                },
            },
        }),
    ]);
    const left = new Map<string, number>();
    for (const row of ours) {
        for (const [pageId, rev] of revisionsIn(row.target)) {
            const n = Number(rev);
            left.set(
                pageId,
                Math.max(left.get(pageId) ?? 0, Number.isNaN(n) ? 0 : n),
            );
        }
    }
    const lastOurs = Math.max(
        point.sessionStartedAt.getTime(),
        ...ours.map((r) => r.createdAt.getTime()),
    );
    const out: string[] = [];
    // A second of slack: a write's activity row lands just after it.
    if (site.updatedAt.getTime() > lastOurs + 1000) {
        out.push("the website's settings were saved");
    }
    const was = new Map(point.snapshot.pages.map((p) => [p.pageId, p]));
    for (const page of pages) {
        const snap = was.get(page.id);
        const revision = page.versions[0]?.revision ?? 0;
        if (!snap && !left.has(page.id)) {
            out.push(`page ${page.path} was added`);
        } else if (
            revision > Math.max(snap?.revision ?? 0, left.get(page.id) ?? 0)
        ) {
            out.push(`page ${page.path} was edited`);
        }
    }
    const now = new Set(pages.map((p) => p.id));
    for (const snap of point.snapshot.pages) {
        if (!now.has(snap.pageId) && !left.has(snap.pageId)) {
            out.push(`page ${snap.path} was deleted`);
        }
    }
    return out;
}

const jsonOrNull = (value: Prisma.JsonValue | null) =>
    value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);

/**
 * Put the site's draft back as the snapshot holds it, in one transaction
 * under the site's lock: pages added since are removed, pages deleted since
 * come back with their ids (the menu names pages by id), every page's
 * place and sections are put back, then the style, menu, footer and search
 * text. The live site is never touched.
 */
export async function restoreSnapshot(
    ctx: OrganizationContext,
    siteId: string,
    snap: RestoreSnapshot,
) {
    const organizationId = ctx.organizationId;
    return prisma.$transaction(
        async (tx) => {
            await lockSite(tx, siteId);
            const current = await tx.page.findMany({
                where: { siteId, organizationId },
                select: { id: true, path: true, isHome: true },
            });
            const keep = new Set(snap.pages.map((p) => p.pageId));
            const gone = current.filter((p) => !keep.has(p.id) && !p.isHome);
            await tx.page.deleteMany({
                where: { id: { in: gone.map((p) => p.id) }, organizationId },
            });
            const present = new Map(current.map((p) => [p.id, p]));
            // Paths are unique per site: move the pages whose path changes
            // out of the way first.
            for (const p of snap.pages) {
                const now = present.get(p.pageId);
                if (now && now.path !== p.path) {
                    await tx.page.update({
                        where: { id: p.pageId },
                        data: { path: `/restoring-${p.pageId}` },
                        select: { id: true },
                    });
                }
            }
            let recreated = 0;
            for (const p of snap.pages) {
                const place = {
                    path: p.path,
                    title: p.title,
                    hidden: p.hidden,
                    inMenu: p.inMenu,
                };
                if (present.has(p.pageId)) {
                    await tx.page.update({
                        where: { id: p.pageId },
                        data: place,
                        select: { id: true },
                    });
                    continue;
                }
                await tx.page.create({
                    data: {
                        id: p.pageId,
                        siteId,
                        organizationId,
                        isHome: p.isHome,
                        kind: p.kind as PageKind,
                        ...place,
                    },
                    select: { id: true },
                });
                await tx.pageVersion.create({
                    data: {
                        pageId: p.pageId,
                        organizationId,
                        status: "DRAFT",
                        createdByUserId: ctx.userId,
                    },
                    select: { id: true },
                });
                recreated += 1;
            }
            const revisions = await restorePages(
                tx,
                organizationId,
                snap.pages.map((p) => ({
                    pageId: p.pageId,
                    sections: p.sections,
                })),
            );
            await tx.site.update({
                where: { id: siteId },
                data: {
                    style: jsonOrNull(snap.style),
                    navigation: jsonOrNull(snap.navigation),
                    footer: jsonOrNull(snap.footer),
                    seoTitle: snap.seoTitle,
                    seoDescription: snap.seoDescription,
                },
                select: { id: true },
            });
            return { revisions, removed: gone.length, recreated };
        },
        { timeout: 20_000 },
    );
}

/** Registers the website tools and their template job at boot. */
@Injectable()
export class SiteTools implements OnModuleInit {
    constructor(
        private readonly registry: McpToolRegistry,
        private readonly jobs: JobHandlerRegistry,
        @Inject(JOB_QUEUE) private readonly queue: JobQueue,
        private readonly sites: SitesService,
        private readonly previews: SitePreviewLinksService,
        private readonly releases: TestReleasesService,
        private readonly media: MediaService,
        @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
        private readonly restorePoints: RestorePointService,
    ) {}

    onModuleInit(): void {
        const deps: SiteToolDeps = {
            sites: this.sites,
            previews: this.previews,
            releases: this.releases,
            media: this.media,
            storage: this.storage,
            restorePoints: this.restorePoints,
            queue: this.queue,
        };
        this.registry.register(...siteTools(deps));
        this.registry.registerJobKind(SITE_FROM_TEMPLATE_JOB, describeSiteJob);
        // Named `registry` so job-consumers.spec sees this handler.
        const registry = this.jobs;
        registry.register(
            SITE_FROM_TEMPLATE_JOB,
            siteFromTemplateHandler(deps),
        );
    }
}
