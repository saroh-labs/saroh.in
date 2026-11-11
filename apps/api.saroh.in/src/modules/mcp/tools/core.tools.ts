import type { OnModuleInit } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import {
    getJobTool,
    listBusinessesTool,
    sarohStartTool,
} from "@saroh/api-contract";
import { outsideOrgContext, prisma, runInOrgContext } from "@saroh/database";

import type { OrganizationContext } from "../../../common/types/organization-context";

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

const editionOf = (e: string) => e.toLowerCase() as "india" | "global";
const yesNo = (b: boolean) => (b ? "yes" : "no");

/** What this connection may do in one business, after the person's role. */
function mayIn(ctx: OrganizationContext) {
    const actions = [...(ctx.actions ?? [])];
    return {
        read: actions.some(isRead),
        change: actions.some((a) => !isRead(a) && a !== "site:publish"),
        publish_website: actions.includes("site:publish"),
    };
}

/** One business's name, edition and modules on, read as that business. */
function aboutBusiness(ctx: OrganizationContext) {
    const id = ctx.organizationId;
    // Each business's rows under its own context, whichever the call is in.
    return outsideOrgContext(() =>
        runInOrgContext(id, async () => {
            const [org, modules] = await Promise.all([
                prisma.organization.findUniqueOrThrow({
                    where: { id },
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        edition: true,
                        currency: true,
                    },
                }),
                prisma.organizationModule.findMany({
                    where: { organizationId: id, status: "ENABLED" },
                    select: { moduleKey: true },
                }),
            ]);
            const modulesOn = modules.map(
                (m) =>
                    MODULE_BY_KEY.get(m.moduleKey as ModuleKey)?.label ??
                    m.moduleKey,
            );
            return {
                org,
                modulesOn,
                summary: {
                    business_id: org.id,
                    name: org.name,
                    slug: org.slug,
                    edition: editionOf(org.edition),
                    your_role: ctx.roleKey ?? ctx.role,
                },
            };
        }),
    );
}

const PASS_BUSINESS =
    "Pass the business argument (a business_id) to every other Saroh tool, and call saroh_start with it to see that business's websites and what this connection may do there.";

export const sarohStart = defineTool({
    name: "saroh_start",
    title: "Start with Saroh",
    description:
        "Use this when you begin working with the person's Saroh businesses, before any other Saroh tool: it says which businesses this connection covers and, for one business (the only one, or the one named in business), its edition and currency, which modules are on, its websites, what this connection may do there, and how drafts and publishing work. Don't call it again for the same business in a conversation; list_businesses compares what this connection may do in each.",
    contract: sarohStartTool,
    capability: null,
    hints: READ_ONLY,
    wide: true,
    async run(_input, { ctx, connection, named, reach }: McpCall) {
        const all = await Promise.all((reach ?? [ctx]).map(aboutBusiness));
        const businesses = all.map((b) => b.summary);
        const app = {
            kind:
                connection.kind === "oauth"
                    ? ("app_sign_in" as const)
                    : ("api_key" as const),
            app_name: connection.clientName,
        };
        if (named === false) {
            const data = {
                business: null,
                your_role: null,
                businesses,
                connection: app,
                may: null,
                modules_on: [],
                sites: [],
                drafts_and_publish: DRAFTS_AND_PUBLISH,
            };
            const text = [
                `This connection covers ${businesses.length} Saroh businesses: ${businesses.map((b) => `${JSON.stringify(b.name)} (business_id ${b.business_id}, ${b.edition} edition, as ${b.your_role})`).join("; ")}.`,
                PASS_BUSINESS,
                DRAFTS_AND_PUBLISH,
            ].join("\n");
            return { text, data };
        }
        const { org, modulesOn } =
            all.find((b) => b.org.id === ctx.organizationId) ??
            (await aboutBusiness(ctx));
        const sites = await prisma.site.findMany({
            where: { organizationId: ctx.organizationId, deletedAt: null },
            select: { id: true, name: true, currentPublicationId: true },
            orderBy: { name: "asc" },
            take: 20,
        });
        const may = mayIn(ctx);
        const data = {
            business: {
                business_id: org.id,
                name: org.name,
                edition: editionOf(org.edition),
                currency: org.currency,
            },
            your_role: ctx.roleKey ?? ctx.role,
            businesses,
            connection: app,
            may,
            modules_on: modulesOn,
            sites: sites.map((s) => ({
                site_id: s.id,
                name: s.name,
                published: s.currentPublicationId !== null,
            })),
            drafts_and_publish: DRAFTS_AND_PUBLISH,
        };
        const others = businesses.filter((b) => b.business_id !== org.id);
        const text = [
            `Connected to the Saroh business ${JSON.stringify(org.name)} (business_id ${org.id}, ${data.business.edition} edition${org.currency ? `, currency ${org.currency}` : ""}) as ${data.your_role}.`,
            ...(others.length
                ? [
                      `This connection also covers: ${others.map((b) => `${JSON.stringify(b.name)} (business_id ${b.business_id})`).join("; ")}. ${PASS_BUSINESS}`,
                  ]
                : []),
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

export const listBusinesses = defineTool({
    name: "list_businesses",
    title: "List the businesses",
    description:
        "Use this when you need the business_id to pass as the business argument, or to see which of the person's Saroh businesses this connection covers: each one's name, slug, edition, the person's role, what this connection may do there and which modules are on. Don't use it for one business's websites or currency; saroh_start with business gives those.",
    contract: listBusinessesTool,
    capability: null,
    hints: READ_ONLY,
    wide: true,
    async run(_input, { ctx, connection, reach }: McpCall) {
        const ctxs = reach ?? [ctx];
        const businesses = await Promise.all(
            ctxs.map(async (c) => {
                const { summary, modulesOn } = await aboutBusiness(c);
                return { ...summary, may: mayIn(c), modules_on: modulesOn };
            }),
        );
        const gone = connection.businesses.length - businesses.length;
        const text = [
            `This connection covers ${businesses.length === 1 ? "one Saroh business" : `${businesses.length} Saroh businesses`}:`,
            ...businesses.map(
                (b) =>
                    `- ${JSON.stringify(b.name)}: business_id ${b.business_id}, slug ${b.slug}, ${b.edition} edition, as ${b.your_role}; may read: ${yesNo(b.may.read)}, make changes: ${yesNo(b.may.change)}, publish the website: ${yesNo(b.may.publish_website)}; modules on: ${b.modules_on.length ? b.modules_on.join(", ") : "none"}.`,
            ),
            ...(gone > 0
                ? [
                      `${gone === 1 ? "One more business it was given isn't" : `${gone} more businesses it was given aren't`} reachable now (the person may have left, or AI apps are off there).`,
                  ]
                : []),
            "Pass a business_id as the business argument to the other tools.",
        ].join("\n");
        return { text, data: { businesses } };
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
        this.registry.register(
            sarohStart,
            listBusinesses,
            getJob(this.registry),
        );
    }
}
