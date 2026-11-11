import type { OnModuleInit } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { getJobTool, sarohStartTool } from "@saroh/api-contract";
import { prisma } from "@saroh/database";

import type { ModuleKey } from "../../capabilities/module-keys";
import { MODULE_BY_KEY } from "../../capabilities/module-registry";
import type { OrgAction } from "../../organizations/organization-actions";
import type { McpCall } from "../tool-registry";
import {
    defineTool,
    McpToolRegistry,
    READ_ONLY,
    ToolError,
} from "../tool-registry";
import { quoteUntrusted } from "../untrusted";

const DRAFTS_AND_PUBLISH =
    "Website changes go to the site's draft; visitors see nothing until it is published. Publishing is a separate step that needs the person's go-ahead, and some sites need a reviewer's approval first. The first website change in a session saves the draft as it was, so it can be put back.";

const isRead = (a: OrgAction) => /:read(-own)?$/.test(a);

export const sarohStart = defineTool({
    name: "saroh_start",
    title: "Start with Saroh",
    description:
        "Use this when you begin working with the person's Saroh business, before any other Saroh tool: it says which business this connection is for, its edition and currency, which modules are on, its websites, what this connection may do, and how drafts and publishing work. Don't call it again in the same conversation.",
    contract: sarohStartTool,
    capability: null,
    hints: READ_ONLY,
    async run(_input, { ctx, connection }: McpCall) {
        const [org, modules, sites] = await Promise.all([
            prisma.organization.findUniqueOrThrow({
                where: { id: ctx.organizationId },
                select: { id: true, name: true, edition: true, currency: true },
            }),
            prisma.organizationModule.findMany({
                where: {
                    organizationId: ctx.organizationId,
                    status: "ENABLED",
                },
                select: { moduleKey: true },
            }),
            prisma.site.findMany({
                where: { organizationId: ctx.organizationId, deletedAt: null },
                select: { id: true, name: true, currentPublicationId: true },
                orderBy: { name: "asc" },
                take: 20,
            }),
        ]);
        const actions = [...(ctx.actions ?? [])];
        const may = {
            read: actions.some(isRead),
            change: actions.some((a) => !isRead(a) && a !== "site:publish"),
            publish_website: actions.includes("site:publish"),
        };
        const modulesOn = modules.map(
            (m) =>
                MODULE_BY_KEY.get(m.moduleKey as ModuleKey)?.label ??
                m.moduleKey,
        );
        const data = {
            business: {
                business_id: org.id,
                name: org.name,
                edition:
                    org.edition === "GLOBAL"
                        ? ("global" as const)
                        : ("india" as const),
                currency: org.currency,
            },
            your_role: ctx.roleKey ?? ctx.role,
            connection: {
                kind:
                    connection.kind === "oauth"
                        ? ("app_sign_in" as const)
                        : ("api_key" as const),
                app_name: connection.clientName,
            },
            may,
            modules_on: modulesOn,
            sites: sites.map((s) => ({
                site_id: s.id,
                name: s.name,
                published: s.currentPublicationId !== null,
            })),
            drafts_and_publish: DRAFTS_AND_PUBLISH,
        };
        const yesNo = (b: boolean) => (b ? "yes" : "no");
        const text = [
            `Connected to the Saroh business ${JSON.stringify(org.name)} (business_id ${org.id}, ${data.business.edition} edition${org.currency ? `, currency ${org.currency}` : ""}) as ${data.your_role}.`,
            `This connection may read: ${yesNo(may.read)}; make changes: ${yesNo(may.change)}; publish the website: ${yesNo(may.publish_website)}.`,
            `Modules on: ${modulesOn.length ? modulesOn.join(", ") : "none"}.`,
            sites.length
                ? `Websites: ${data.sites.map((s) => `${quoteUntrusted("name", s.name)} (site_id ${s.site_id}, ${s.published ? "published" : "not published yet"})`).join("; ")}.`
                : "No website yet.",
            DRAFTS_AND_PUBLISH,
        ].join("\n");
        return { text, data };
    },
});

const STATUS = {
    PENDING: "waiting",
    PROCESSING: "running",
    DONE: "done",
    FAILED: "failed",
    CANCELLED: "failed",
} as const;

/** `get_job`: polls a job a tool started, as that tool's kind describes it. */
export function getJob(registry: McpToolRegistry) {
    return defineTool({
        name: "get_job",
        title: "Check a job",
        description:
            "Use this when a Saroh tool answered with a job_id because its work takes a while (for example making a site from a template): it says whether the job is waiting, running, done or failed, and what it made. Call it again after a few seconds while it is waiting or running. Don't use it for ids that aren't job ids.",
        contract: getJobTool,
        capability: null,
        hints: READ_ONLY,
        async run({ job_id }, { ctx }: McpCall) {
            const kinds = [...registry.jobKinds.keys()];
            const job = kinds.length
                ? await prisma.job.findFirst({
                      where: {
                          id: job_id,
                          organizationId: ctx.organizationId,
                          type: { in: kinds },
                      },
                  })
                : null;
            const describe = job && registry.jobKinds.get(job.type);
            if (!job || !describe) {
                throw new ToolError(
                    `There is no job ${job_id} for this business.`,
                    "Use the job_id a tool returned when it started the job.",
                );
            }
            const status =
                job.status in STATUS
                    ? STATUS[job.status as keyof typeof STATUS]
                    : "running";
            const { summary, result } = describe(job);
            return {
                text: `Job ${job.id} is ${status}. ${summary}`,
                data: { job_id: job.id, status, summary, result },
            };
        },
    });
}

/** The tools every connection has: registered at boot. */
@Injectable()
export class CoreTools implements OnModuleInit {
    constructor(private readonly registry: McpToolRegistry) {}

    onModuleInit(): void {
        this.registry.register(sarohStart, getJob(this.registry));
    }
}
