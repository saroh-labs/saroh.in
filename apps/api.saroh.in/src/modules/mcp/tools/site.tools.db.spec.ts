/**
 * The MCP website tools against a real Postgres (plan 2026-11-10-001, U11):
 * draft-only edits with preview links, the publish request a person answers
 * in Saroh (DEC-215 as amended 12 Nov 2026) and its approval route, the
 * session restore point, role filtering, the image fetch's guard and the
 * template job. Each call goes through `McpToolRegistry.call`, so the
 * framework's authorize, write check and activity rows run as on `/mcp`.
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";
import { createMemoryStorage } from "@saroh/object-storage";
import { z } from "zod";

import { AuditService } from "../../audit/audit.service";
import type { EntitlementService } from "../../billing/entitlement.service";
import { FeatureFlagService } from "../../feature-flags/feature-flags.service";
import { MediaService } from "../../media/media.service";
import type { OrgAction } from "../../organizations/organization-actions";
import { OrganizationContextService } from "../../organizations/organization-context.service";
import { SitePreviewLinksService } from "../../sites/site-preview-links.service";
import { SitesService } from "../../sites/sites.service";
import { TestReleasesService } from "../../sites/test-releases.service";
import { McpActivityService } from "../activity.service";
import { actionsForScopes, NEVER_FOR_AI } from "../ai-apps";
import { AiConnectionsService } from "../ai-connections.service";
import { PublishRequestsService } from "../publish-requests.service";
import { RestorePointService } from "../restore-point.service";
import type { McpCall } from "../tool-registry";
import { McpToolRegistry } from "../tool-registry";
import { CoreTools } from "./core.tools";
import type { SiteToolDeps } from "./site.tools";
import {
    describeSiteJob,
    SITE_FROM_TEMPLATE_JOB,
    siteFromTemplateHandler,
    siteTools,
} from "./site.tools";

const tag = `${process.pid}x${Date.now() % 100000}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;

const sites = new SitesService({
    check: jest.fn().mockResolvedValue(true),
    can: jest.fn().mockResolvedValue(true),
    getEntitlements: jest.fn(),
} as unknown as EntitlementService);
const fetchImage = jest.fn();
const deps: SiteToolDeps = {
    sites,
    previews: new SitePreviewLinksService(sites),
    media: new MediaService(createMemoryStorage({})),
    storage: createMemoryStorage({}),
    restorePoints: new RestorePointService(),
    queue: {
        enqueue: (input) =>
            prisma.job.create({
                data: {
                    type: input.type,
                    organizationId: input.organizationId,
                    payload: input.payload as object,
                    maxAttempts: input.maxAttempts,
                },
            }),
    },
};
const requests = new PublishRequestsService(
    sites,
    new TestReleasesService(sites, new FeatureFlagService()),
    new AuditService(),
);
// The media service and the tool share one store, as in Nest.
deps.media = new MediaService(deps.storage);

const registry = new McpToolRegistry(
    new McpActivityService(new AuditService()),
);
registry.register(...siteTools({ ...deps, fetchImage }));
registry.registerJobKind(SITE_FROM_TEMPLATE_JOB, describeSiteJob);
new CoreTools(registry).onModuleInit();

type Result = Awaited<ReturnType<McpToolRegistry["call"]>> & {
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
};

/** A tool call as `/mcp` makes it: input parsed by the contract, then the framework. */
async function call(
    as: McpCall,
    name: string,
    args: Record<string, unknown> = {},
): Promise<Result> {
    const tool = registry.all().find((t) => t.name === name);
    if (!tool) throw new Error(`no tool ${name}`);
    const input = tool.contract.input.parse(args) as Record<string, unknown>;
    const result = (await registry.call(tool, input, as, null)) as Result;
    if (!result.isError && result.structuredContent) {
        tool.contract.output.parse(result.structuredContent);
    }
    return result;
}
const textOf = (r: Result) => r.content[0].text;
const data = <T = Record<string, unknown>>(r: Result) =>
    r.structuredContent as T;

/** A business with a site made from the starter, connected as `role`. */
async function connect(role: "OWNER" | "MEMBER" = "OWNER") {
    const org = await prisma.organization.create({
        data: { name: uniq("Rye Bakery"), slug: uniq("rye") },
    });
    const owner = await prisma.user.create({
        data: { email: `${uniq("o")}@example.com`, name: "Asha" },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: owner.id, role: "OWNER" },
    });
    const ownerCtx = await new OrganizationContextService().resolve(
        owner.id,
        org.id,
    );
    const { siteId } = await sites.createFromTemplate(ownerCtx, {
        name: "Rye",
    });
    let user = owner;
    if (role !== "OWNER") {
        user = await prisma.user.create({
            data: { email: `${uniq("m")}@example.com`, name: role },
        });
        await prisma.membership.create({
            data: { organizationId: org.id, userId: user.id, role },
        });
    }
    const person = await new OrganizationContextService().resolve(
        user.id,
        org.id,
    );
    const scopes = ["saroh:read", "saroh:write", "site:publish"];
    const granted = actionsForScopes(scopes);
    const actions = new Set<OrgAction>(
        [...(person.actions ?? [])].filter(
            (a) => granted.has(a) && !NEVER_FOR_AI.has(a),
        ),
    );
    const as: McpCall = {
        ctx: { ...person, actions },
        connection: {
            kind: "oauth",
            id: uniq("grant"),
            clientId: "https://claude.ai/oauth/mcp-oauth-client-metadata",
            clientName: "Claude",
            scopes,
            userId: user.id,
            businesses: [org.id],
        },
    };
    const home = await prisma.page.findFirstOrThrow({
        where: { siteId, isHome: true },
        select: { id: true },
    });
    return { org, siteId, homeId: home.id, as, ownerCtx };
}

const sectionsOf = async (pageId: string) =>
    (
        await prisma.pageVersion.findFirstOrThrow({
            where: { pageId, status: "DRAFT" },
            orderBy: { createdAt: "desc" },
            select: {
                sections: {
                    orderBy: { order: "asc" },
                    select: { key: true, type: true, content: true },
                },
            },
        })
    ).sections;

/** preview_publish's request, as an app gets it before the person answers. */
async function requestFor(as: McpCall, siteId: string) {
    const r = await call(as, "preview_publish", { site_id: siteId });
    if (r.isError) throw new Error(textOf(r));
    return data<{ request_id: string; confirm_url: string }>(r);
}

/** What a refused answer said: its code, or the exception's name. */
const refusal = (p: Promise<unknown>) =>
    p.then(
        () => "answered",
        (e: { response?: { details?: { code?: string } }; name?: string }) =>
            e.response?.details?.code ?? e.name ?? String(e),
    );

const liveOf = async (siteId: string) =>
    (
        await prisma.site.findUniqueOrThrow({
            where: { id: siteId },
            select: { currentPublicationId: true },
        })
    ).currentPublicationId;

const PNG = Buffer.from(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
        "1f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082",
    "hex",
);

describe("MCP website tools (U11)", () => {
    beforeEach(() => fetchImage.mockReset());

    it("adds a section to the draft only, with preview and editor links, and takes one restore point", async () => {
        const { siteId, homeId, as, ownerCtx } = await connect();
        await sites.publishSite(ownerCtx, siteId).catch(() => undefined);
        const live = await prisma.site.findUniqueOrThrow({
            where: { id: siteId },
            select: { currentPublicationId: true },
        });
        const before = await sectionsOf(homeId);

        const r = await call(as, "edit_page", {
            site_id: siteId,
            page_id: homeId,
            ops: [
                {
                    op: "add",
                    type: "faq",
                    content: {
                        heading: "Questions",
                        items: [{ question: "Open Sundays?", answer: "Yes." }],
                    },
                    position: 0,
                },
            ],
        });
        expect(r.isError).toBeFalsy();
        const out = data<{
            links: { preview_url: string; editor_url: string };
        }>(r);
        expect(out.links.preview_url).toMatch(/\/preview\/[\w-]+$/);
        expect(out.links.editor_url).toContain(
            `/sites/${siteId}?page=${homeId}`,
        );
        expect(textOf(r)).toContain(out.links.preview_url);

        const after = await sectionsOf(homeId);
        expect(after).toHaveLength(before.length + 1);
        expect(after[0].type).toBe("faq");
        // The live site still points where it did.
        const now = await prisma.site.findUniqueOrThrow({
            where: { id: siteId },
            select: { currentPublicationId: true },
        });
        expect(now.currentPublicationId).toBe(live.currentPublicationId);

        expect(await prisma.siteRestorePoint.count({ where: { siteId } })).toBe(
            1,
        );
        const activity = await prisma.mcpActivity.findFirstOrThrow({
            where: { tool: "edit_page", connectionId: as.connection.id },
        });
        expect(activity.target).toMatch(
            new RegExp(`^site:${siteId}:revisions:${homeId}=\\d+$`),
        );
    });

    it("updates and moves sections by section_key, and refuses an unknown key with a next step", async () => {
        const { siteId, homeId, as } = await connect();
        const page = await call(as, "get_page", {
            site_id: siteId,
            page_id: homeId,
        });
        const sections = data<{
            sections: {
                section_key: string;
                content: { untrusted: boolean };
            }[];
        }>(page).sections;
        expect(sections.length).toBeGreaterThan(1);
        expect(sections[0].content.untrusted).toBe(true);
        const [first, second] = sections.map((s) => s.section_key);

        const r = await call(as, "edit_page", {
            site_id: siteId,
            page_id: homeId,
            ops: [{ op: "move", section_key: second, position: 0 }],
        });
        expect(r.isError).toBeFalsy();
        expect(
            (await sectionsOf(homeId)).map((s) => s.key).slice(0, 2),
        ).toEqual([second, first]);

        const bad = await call(as, "edit_page", {
            site_id: siteId,
            page_id: homeId,
            ops: [{ op: "update", section_key: "nope", content: {} }],
        });
        expect(bad.isError).toBe(true);
        expect(textOf(bad)).toContain("Next: Call get_page");
    });

    it("prepares a publish without publishing: what goes live, preview, a link into Saroh, the token kept only as a digest", async () => {
        const { org, siteId, as } = await connect();
        const r = await call(as, "preview_publish", { site_id: siteId });
        expect(r.isError).toBeFalsy();
        const out = data<{
            will: string;
            changed: string[];
            preview_url: string;
            request_id: string;
            confirm_url: string;
        }>(r);
        expect(out).toMatchObject({
            will: "go_live",
            changed: ["first publish: the whole site"],
        });
        expect(out.preview_url).toMatch(/\/preview\/[\w-]+$/);
        const link = new URL(out.confirm_url);
        expect(link.pathname).toBe(`/open/${org.id}`);
        expect(link.searchParams.get("to")).toBe(
            `/sites/${siteId}/publish-requests/${out.request_id}`,
        );
        expect(textOf(r)).toContain("Not published.");
        expect(textOf(r)).toContain(out.confirm_url);
        expect(textOf(r)).toContain("you can't publish");

        expect(await liveOf(siteId)).toBeNull();
        expect(
            await prisma.mcpActivity.count({
                where: { connectionId: as.connection.id },
            }),
        ).toBe(0);
        const rows = await prisma.mcpPublishCode.findMany({
            where: { siteId },
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            clientName: "Claude",
            requestedByUserId: as.ctx.userId,
            usedAt: null,
        });
        expect(JSON.stringify(rows)).not.toContain(out.request_id);
        expect(
            rows[0].expiresAt.getTime() - rows[0].createdAt.getTime(),
        ).toBeGreaterThan(23 * 60 * 60 * 1000);
    });

    it("gives an AI app no tool that publishes", () => {
        const tools = registry.all();
        const names = tools.map((t) => t.name);
        expect(names).not.toContain("publish_site");
        expect(names).toEqual(
            expect.arrayContaining(["preview_publish", "get_publish_request"]),
        );
        // Every tool that needs the publish right only reads.
        const publishing = tools.filter((t) => t.capability === "site:publish");
        expect(publishing.map((t) => t.name).sort()).toEqual([
            "get_publish_request",
            "preview_publish",
        ]);
        for (const t of publishing) expect(t.hints.readOnlyHint).toBe(true);
    });

    it("publishes when a person confirms in Saroh, as them, noting the app", async () => {
        const { org, siteId, as, ownerCtx } = await connect();
        const { request_id } = await requestFor(as, siteId);

        const read = await requests.read(ownerCtx, siteId, request_id);
        expect(read).toMatchObject({
            app: "Claude",
            connectedBy: "Asha",
            status: "open",
            will: "go_live",
            draftChanged: false,
            neverPublished: true,
        });
        // Reading never answers it.
        expect(await liveOf(siteId)).toBeNull();

        const answer = await requests.confirm(ownerCtx, siteId, request_id);
        expect(answer.outcome).toBe("published");
        expect(await liveOf(siteId)).not.toBeNull();

        const audit = await prisma.auditEvent.findFirstOrThrow({
            where: {
                organizationId: org.id,
                action: "ai_connection.publish_request_answered",
            },
        });
        expect(audit).toMatchObject({
            actorUserId: ownerCtx.userId,
            targetId: as.connection.id,
        });
        expect(audit.metadata).toMatchObject({
            outcome: "PUBLISHED",
            app: "Claude",
            siteId,
        });
        expect(
            await prisma.mcpActivity.count({
                where: {
                    tool: "publish_request_answered",
                    connectionId: as.connection.id,
                    userId: ownerCtx.userId,
                },
            }),
        ).toBe(1);

        const status = await call(as, "get_publish_request", {
            site_id: siteId,
            request_id,
        });
        expect(data(status)).toMatchObject({
            status: "published",
            confirm_url: null,
        });
        expect(
            (await requests.read(ownerCtx, siteId, request_id)).decidedBy,
        ).toBe("Asha");
    });

    it("doesn't publish when the person declines, and says so to the app", async () => {
        const { siteId, as, ownerCtx } = await connect();
        const { request_id } = await requestFor(as, siteId);
        expect(
            (await requests.decline(ownerCtx, siteId, request_id)).outcome,
        ).toBe("declined");
        expect(await liveOf(siteId)).toBeNull();
        const status = await call(as, "get_publish_request", {
            site_id: siteId,
            request_id,
        });
        expect(data(status)).toMatchObject({ status: "declined" });
        expect(
            await refusal(requests.confirm(ownerCtx, siteId, request_id)),
        ).toBe("PUBLISH_REQUEST_USED");
        expect(await liveOf(siteId)).toBeNull();
    });

    it("refuses a used, expired or replaced request, and one for another business or site", async () => {
        const { org, siteId, as, ownerCtx } = await connect();
        const { request_id } = await requestFor(as, siteId);

        // Another business, with its own owner, can't reach it.
        const b = await connect();
        expect(
            await refusal(requests.confirm(b.ownerCtx, siteId, request_id)),
        ).toBe("NotFoundException");
        expect(
            await refusal(requests.confirm(b.ownerCtx, b.siteId, request_id)),
        ).toBe("NotFoundException");
        // Another website of the same business.
        const { id: second } = await prisma.site.create({
            data: {
                organizationId: org.id,
                name: "Rye two",
                slug: uniq("rye-two"),
            },
        });
        expect(
            await refusal(requests.confirm(ownerCtx, second, request_id)),
        ).toBe("NotFoundException");
        expect(await liveOf(siteId)).toBeNull();

        // None of those spent it; it takes once.
        await requests.confirm(ownerCtx, siteId, request_id);
        const published = await liveOf(siteId);
        expect(published).not.toBeNull();
        expect(
            await refusal(requests.confirm(ownerCtx, siteId, request_id)),
        ).toBe("PUBLISH_REQUEST_USED");

        // After 24 hours.
        const late = await requestFor(as, siteId);
        const dayOn = new Date(Date.now() + 24 * 60 * 60 * 1000 + 1000);
        expect(
            await refusal(
                requests.confirm(ownerCtx, siteId, late.request_id, dayOn),
            ),
        ).toBe("PUBLISH_REQUEST_EXPIRED");

        // A newer preview of the site replaces it.
        const newer = await requestFor(as, siteId);
        expect(
            await refusal(requests.confirm(ownerCtx, siteId, late.request_id)),
        ).toBe("PUBLISH_REQUEST_EXPIRED");
        const replaced = await call(as, "get_publish_request", {
            site_id: siteId,
            request_id: late.request_id,
        });
        expect(data(replaced)).toMatchObject({ status: "expired" });
        expect(
            data(
                await call(as, "get_publish_request", {
                    site_id: siteId,
                    request_id: newer.request_id,
                }),
            ),
        ).toMatchObject({ status: "waiting" });
        expect(await liveOf(siteId)).toBe(published);
    });

    it("refuses someone without site:publish", async () => {
        const { org, siteId, as } = await connect();
        const { request_id } = await requestFor(as, siteId);
        const member = await prisma.user.create({
            data: { email: `${uniq("m")}@example.com`, name: "Ravi" },
        });
        await prisma.membership.create({
            data: { organizationId: org.id, userId: member.id, role: "MEMBER" },
        });
        const memberCtx = await new OrganizationContextService().resolve(
            member.id,
            org.id,
        );
        expect(
            await refusal(requests.read(memberCtx, siteId, request_id)),
        ).toBe("ROLE_DENIED");
        expect(
            await refusal(requests.confirm(memberCtx, siteId, request_id)),
        ).toBe("ROLE_DENIED");
        expect(
            await refusal(requests.decline(memberCtx, siteId, request_id)),
        ).toBe("ROLE_DENIED");
        expect(await liveOf(siteId)).toBeNull();
    });

    it("lets anyone with site:publish confirm another person's request", async () => {
        const { org, siteId, as } = await connect();
        const { request_id } = await requestFor(as, siteId);
        const admin = await prisma.user.create({
            data: { email: `${uniq("a")}@example.com`, name: "Meera" },
        });
        await prisma.membership.create({
            data: { organizationId: org.id, userId: admin.id, role: "ADMIN" },
        });
        const adminCtx = await new OrganizationContextService().resolve(
            admin.id,
            org.id,
        );
        await requests.confirm(adminCtx, siteId, request_id);
        expect(await liveOf(siteId)).not.toBeNull();
        expect(
            await prisma.mcpPublishCode.findFirstOrThrow({
                where: { siteId },
                select: { decidedByUserId: true, requestedByUserId: true },
            }),
        ).toEqual({
            decidedByUserId: admin.id,
            requestedByUserId: as.ctx.userId,
        });
    });

    it("refuses when the draft changed after the app prepared it, and keeps the request open", async () => {
        const { siteId, homeId, as, ownerCtx } = await connect();
        const { request_id } = await requestFor(as, siteId);
        const edit = await call(as, "edit_page", {
            site_id: siteId,
            page_id: homeId,
            ops: [
                {
                    op: "add",
                    type: "faq",
                    content: {
                        heading: "Questions",
                        items: [{ question: "Open Sundays?", answer: "Yes." }],
                    },
                    position: 0,
                },
            ],
        });
        expect(edit.isError).toBeFalsy();
        expect(
            (await requests.read(ownerCtx, siteId, request_id)).draftChanged,
        ).toBe(true);
        expect(
            await refusal(requests.confirm(ownerCtx, siteId, request_id)),
        ).toBe("DRAFT_CHANGED");
        expect(await liveOf(siteId)).toBeNull();
        expect((await requests.read(ownerCtx, siteId, request_id)).status).toBe(
            "open",
        );
    });

    it("refuses a save that lands after publish read the draft, under the site's lock", async () => {
        const { siteId, homeId, as, ownerCtx } = await connect();
        const { request_id } = await requestFor(as, siteId);
        const real = sites.loadDraftSite.bind(sites);
        // publish's own read of the draft, then a save before it writes.
        const spy = jest
            .spyOn(sites, "loadDraftSite")
            .mockImplementationOnce(async (where, db) => {
                const draft = await real(where, db);
                await prisma.page.update({
                    where: { id: homeId },
                    data: { title: "Saved mid-publish" },
                });
                return draft;
            });
        try {
            expect(
                await refusal(requests.confirm(ownerCtx, siteId, request_id)),
            ).toBe("DRAFT_CHANGED");
            expect(spy).toHaveBeenCalled();
        } finally {
            spy.mockRestore();
        }
        expect(await liveOf(siteId)).toBeNull();
        expect(
            await prisma.mcpPublishCode.count({
                where: { siteId, usedAt: { not: null } },
            }),
        ).toBe(0);
    });

    it("with a reviewer required, says so and makes the approval request when the person confirms", async () => {
        const { org, siteId, as, ownerCtx } = await connect();
        await prisma.featureFlag.upsert({
            where: { key: "SITE_TEST_RELEASES" },
            create: { key: "SITE_TEST_RELEASES", enabledByDefault: false },
            update: {},
        });
        await prisma.featureFlagOverride.create({
            data: {
                flagKey: "SITE_TEST_RELEASES",
                organizationId: org.id,
                enabled: true,
            },
        });
        await prisma.site.update({
            where: { id: siteId },
            data: { publishNeedsApproval: true },
        });
        const requested = () =>
            prisma.siteApproval.count({
                where: { siteId, outcome: "REQUESTED" },
            });

        const summary = await call(as, "preview_publish", { site_id: siteId });
        expect(data(summary)).toMatchObject({ will: "go_to_reviewers" });
        expect(textOf(summary)).toContain("reviewers");
        const { request_id } = data<{ request_id: string }>(summary);
        expect(await requested()).toBe(0);
        expect((await requests.read(ownerCtx, siteId, request_id)).will).toBe(
            "go_to_reviewers",
        );

        const answer = await requests.confirm(ownerCtx, siteId, request_id);
        expect(answer.outcome).toBe("sent_for_approval");
        expect(await liveOf(siteId)).toBeNull();
        expect(await requested()).toBe(1);
        expect(await prisma.siteTestRelease.count({ where: { siteId } })).toBe(
            1,
        );
        expect(
            data(
                await call(as, "get_publish_request", {
                    site_id: siteId,
                    request_id,
                }),
            ),
        ).toMatchObject({ status: "sent_for_approval" });
    });

    it("restores the draft to before the session after three edits", async () => {
        const { siteId, homeId, as } = await connect();
        const before = await sectionsOf(homeId);
        const pagesBefore = await prisma.page.findMany({
            where: { siteId },
            select: { id: true, path: true, title: true },
            orderBy: { id: "asc" },
        });

        const removed = await call(as, "remove_section", {
            site_id: siteId,
            page_id: homeId,
            section_key: before[0].key,
        });
        expect(removed.isError).toBeFalsy();
        const added = await call(as, "add_page", {
            site_id: siteId,
            title: "Offers",
            path: "/offers",
        });
        expect(added.isError).toBeFalsy();
        const other = pagesBefore.find((p) => p.id !== homeId);
        if (other) {
            const deleted = await call(as, "delete_page", {
                site_id: siteId,
                page_id: other.id,
            });
            expect(deleted.isError).toBeFalsy();
        }

        const r = await call(as, "restore_site_draft", { site_id: siteId });
        expect(r.isError).toBeFalsy();
        expect(await sectionsOf(homeId)).toEqual(before);
        expect(
            await prisma.page.findMany({
                where: { siteId },
                select: { id: true, path: true, title: true },
                orderBy: { id: "asc" },
            }),
        ).toEqual(pagesBefore);

        // A second restore in the same session finds nothing changed elsewhere.
        const again = await call(as, "restore_site_draft", { site_id: siteId });
        expect(again.isError).toBeFalsy();
    });

    it("warns, and needs confirming, when the draft changed outside this connection", async () => {
        const { siteId, homeId, as, ownerCtx } = await connect();
        await call(as, "update_page", {
            site_id: siteId,
            page_id: homeId,
            title: "Welcome",
        });
        // The person edits in the app meanwhile.
        const draft = await sites.getPageDraft(ownerCtx, siteId, homeId);
        await sites.replaceDraftSections(ownerCtx, siteId, homeId, {
            sections: draft.sections.slice(1),
            revision: draft.revision,
        });

        const refused = await call(as, "restore_site_draft", {
            site_id: siteId,
        });
        expect(refused.isError).toBe(true);
        expect(textOf(refused)).toContain("was edited");
        expect(textOf(refused)).toContain("confirm_outside_changes");

        const ok = await call(as, "restore_site_draft", {
            site_id: siteId,
            confirm_outside_changes: true,
        });
        expect(ok.isError).toBeFalsy();
        expect(await sectionsOf(homeId)).toHaveLength(draft.sections.length);
    });

    it("lists no write tools to a Member, and refuses a call anyway with a tool error", async () => {
        const { siteId, homeId, as } = await connect("MEMBER");
        const listed = registry
            .all()
            .filter((t) => registry.allows(t, as.ctx))
            .map((t) => t.name);
        expect(listed).toEqual(
            expect.arrayContaining(["get_site", "get_page"]),
        );
        for (const write of registry
            .all()
            .filter((t) => !t.hints.readOnlyHint)) {
            expect(listed).not.toContain(write.name);
        }
        const r = await call(as, "remove_section", {
            site_id: siteId,
            page_id: homeId,
            section_key: "x",
        });
        expect(r.isError).toBe(true);
    });

    it("refuses an image at a cloud metadata address, and one with a long query string", async () => {
        const { as } = await connect();
        const real = (await import("../../../common/net/ssrf")).strictFetch;
        fetchImage.mockImplementation(real);

        const meta = await call(as, "upload_image", {
            url: "https://169.254.169.254/latest/meta-data/iam",
        });
        expect(meta.isError).toBe(true);
        expect(textOf(meta)).toContain("doesn't fetch from that address");

        const long = await call(as, "upload_image", {
            url: `https://example.com/a.png?${"x".repeat(150)}`,
        });
        expect(long.isError).toBe(true);
        expect(textOf(long)).toContain("long query string");
        expect(
            await prisma.media.count({
                where: { organizationId: as.ctx.organizationId },
            }),
        ).toBe(0);
    });

    it("adds a fetched image to the media library and logs its full address", async () => {
        const { as } = await connect();
        fetchImage.mockResolvedValue({
            ok: true,
            status: 200,
            headers: { "content-type": "image/png" },
            body: PNG,
            truncated: false,
        });
        const url = "https://images.example.com/shopfront.png";
        const r = await call(as, "upload_image", { url });
        expect(r.isError).toBeFalsy();
        const media = await prisma.media.findUniqueOrThrow({
            where: { id: data<{ media_id: string }>(r).media_id },
        });
        expect(media.status).toBe("READY");
        const activity = await prisma.mcpActivity.findFirstOrThrow({
            where: { tool: "upload_image", connectionId: as.connection.id },
        });
        expect(activity.summary).toContain(url);
    });

    it("makes a site from a template as a job that get_job reports done with the site id", async () => {
        const { as, siteId: first } = await connect();
        // One website per business here: make room for the new one.
        await prisma.site.update({
            where: { id: first },
            data: { deletedAt: new Date() },
        });
        const started = await call(as, "create_site_from_template", {
            name: "Second site",
            subdomain: uniq("second"),
        });
        expect(started.isError).toBeFalsy();
        const jobId = data<{ job_id: string }>(started).job_id;

        const waiting = await call(as, "get_job", { job_id: jobId });
        expect(data(waiting)).toMatchObject({ status: "waiting" });

        const job = await prisma.job.findUniqueOrThrow({
            where: { id: jobId },
        });
        await siteFromTemplateHandler(deps)(job as Job);
        // A retry of a job that made its site makes no second one.
        const sitesMade = () =>
            prisma.site.count({
                where: { organizationId: as.ctx.organizationId },
            });
        const before = await sitesMade();
        await siteFromTemplateHandler(deps)(
            (await prisma.job.findUniqueOrThrow({
                where: { id: jobId },
            })) as Job,
        );
        expect(await sitesMade()).toBe(before);
        await prisma.job.update({
            where: { id: jobId },
            data: { status: "DONE" },
        });

        const done = await call(as, "get_job", { job_id: jobId });
        const result = data<{ status: string; result: { site_id: string } }>(
            done,
        );
        expect(result.status).toBe("done");
        const site = await prisma.site.findUniqueOrThrow({
            where: { id: result.result.site_id },
            select: { organizationId: true, name: true },
        });
        expect(site).toEqual({
            organizationId: as.ctx.organizationId,
            name: "Second site",
        });
        expect(textOf(done)).toContain(result.result.site_id);

        // A second one is refused by the same rule the app has, and get_job
        // says why.
        const again = await call(as, "create_site_from_template", {
            name: "Third site",
        });
        const jobTwo = data<{ job_id: string }>(again).job_id;
        const row = await prisma.job.findUniqueOrThrow({
            where: { id: jobTwo },
        });
        await expect(
            siteFromTemplateHandler(deps)(row as Job),
        ).rejects.toThrow();
        await prisma.job.update({
            where: { id: jobTwo },
            data: { status: "FAILED" },
        });
        const failed = await call(as, "get_job", { job_id: jobTwo });
        expect(data(failed)).toMatchObject({ status: "failed" });
        expect(textOf(failed)).toContain("already has its website");
    });

    /** Template choice for one business (DEC-216): on or off by its override. */
    async function templateChoice(organizationId: string, enabled: boolean) {
        await prisma.featureFlag.upsert({
            where: { key: "SITE_TEMPLATE_CHOICE" },
            create: { key: "SITE_TEMPLATE_CHOICE", enabledByDefault: false },
            update: {},
        });
        await prisma.featureFlagOverride.create({
            data: { flagKey: "SITE_TEMPLATE_CHOICE", organizationId, enabled },
        });
    }

    type Listed = {
        templates: {
            template_id: string;
            suggested: boolean;
            why: string | null;
            preview_url: string | null;
            picture_url: string | null;
        }[];
        trade: string | null;
        template_choice: boolean;
    };

    it("lists the business's trade's templates first, then the suggested, then the rest as also available (DEC-216)", async () => {
        const { org, as } = await connect();
        await prisma.organization.update({
            where: { id: org.id },
            data: { trade: "salon" },
        });
        await templateChoice(org.id, true);

        const listed = await call(as, "list_templates", {});
        expect(listed.isError).toBeFalsy();
        const body = data<Listed>(listed);
        expect(body).toMatchObject({ trade: "salon", template_choice: true });
        expect(body.templates[0]).toMatchObject({
            template_id: "salon",
            suggested: true,
        });
        expect(body.templates[0].why).toContain("salon");
        // Once the also-available start, nothing suggested follows.
        const firstAlso = body.templates.findIndex((t) => !t.suggested);
        expect(firstAlso).toBeGreaterThan(0);
        expect(body.templates.slice(firstAlso).every((t) => !t.suggested)).toBe(
            true,
        );
        expect(body.templates[firstAlso].why).toMatch(/^Also available/);
        expect(textOf(listed)).toContain("[also available]");
        expect(textOf(listed)).not.toContain("aren't chosen yet");
    });

    it("links each template's preview in Saroh, on this business, and its picture; the first pictures come as images", async () => {
        const fetched = jest.spyOn(globalThis, "fetch").mockImplementation(
            async () =>
                new Response(Buffer.from("webp"), {
                    headers: { "content-type": "image/webp" },
                }),
        );
        try {
            const { org, as } = await connect();
            await prisma.organization.update({
                where: { id: org.id },
                data: { trade: "salon" },
            });
            await templateChoice(org.id, true);
            const listed = await call(as, "list_templates", {});
            const salon = data<Listed>(listed).templates[0];
            const preview = new URL(salon.preview_url ?? "");
            expect(preview.pathname).toBe(`/open/${org.id}`);
            expect(preview.searchParams.get("to")).toBe(
                "/sites/new?template=salon",
            );
            expect(salon.picture_url).toMatch(/\/templates\/salon\.webp$/);
            expect(textOf(listed)).toContain(salon.preview_url);
            const images = (
                listed.content as { type: string; mimeType?: string }[]
            ).filter((c) => c.type === "image");
            expect(images.length).toBeGreaterThan(0);
            expect(images.length).toBeLessThanOrEqual(4);
            expect(images[0].mimeType).toBe("image/webp");
            expect(textOf(listed)).toMatch(
                /pictures that follow are the home pages of, in order: Salon/,
            );
            // A template without a sample business has no picture.
            const plain = data<Listed>(listed).templates.find(
                (t) => t.template_id === "starter",
            );
            if (plain) expect(plain.picture_url).toBeNull();
        } finally {
            fetched.mockRestore();
        }
    });

    it("while templates aren't chosen yet, says so and starts from the kind's default whatever is asked (DEC-216)", async () => {
        const { org, as } = await connect();
        await templateChoice(org.id, false);

        const listed = await call(as, "list_templates", {});
        expect(data<Listed>(listed).template_choice).toBe(false);
        expect(textOf(listed)).toContain("aren't chosen yet");
        // No preview or picture of a template the app can't choose yet.
        expect(
            data<Listed>(listed).templates.every(
                (t) => t.preview_url === null && t.picture_url === null,
            ),
        ).toBe(true);
        expect(listed.content.some((c) => c.type === "image")).toBe(false);

        const started = await call(as, "create_site_from_template", {
            name: "Asha's Salon",
            template_id: "salon",
            colourway_id: "anything",
        });
        expect(started.isError).toBeFalsy();
        expect(textOf(started)).toContain("aren't chosen yet");
        const job = await prisma.job.findUniqueOrThrow({
            where: { id: data<{ job_id: string }>(started).job_id },
        });
        expect(
            (job.payload as { request: Record<string, unknown> }).request,
        ).toMatchObject({ templateId: "starter" });
        expect(
            (job.payload as { request: Record<string, unknown> }).request
                .styleId,
        ).toBeUndefined();
    });

    it("with templates on, starts from the template asked for", async () => {
        const { org, as } = await connect();
        await templateChoice(org.id, true);
        const started = await call(as, "create_site_from_template", {
            name: "Asha's Salon",
            template_id: "salon",
        });
        expect(textOf(started)).not.toContain("aren't chosen yet");
        const job = await prisma.job.findUniqueOrThrow({
            where: { id: data<{ job_id: string }>(started).job_id },
        });
        expect(
            (job.payload as { request: Record<string, unknown> }).request,
        ).toMatchObject({ templateId: "salon" });
        const unknown = await call(as, "create_site_from_template", {
            name: "Nope",
            template_id: "no-such-template",
        });
        expect(unknown.isError).toBe(true);
    });

    it("keeps every tool's definition and its default reads within budget", async () => {
        const { siteId, homeId, as } = await connect();
        const defs = JSON.stringify(
            registry
                .all()
                .filter((t) => !["saroh_start", "get_job"].includes(t.name))
                .map((t) => ({
                    name: t.name,
                    title: t.title,
                    description: t.description,
                    input: z.toJSONSchema(t.contract.input),
                })),
        );
        // About four characters a token.
        expect(defs.length / 4).toBeLessThan(6_000);
        for (const [name, args] of [
            ["get_site", { site_id: siteId }],
            ["get_page", { site_id: siteId, page_id: homeId }],
            ["list_templates", {}],
            ["list_section_types", {}],
        ] as const) {
            const r = await call(as, name, args);
            expect(r.isError).toBeFalsy();
            expect(textOf(r).length / 4).toBeLessThan(5_000);
        }
    });
});

/**
 * Settings › API and AI apps › AI assistants: one connection's changes, and
 * rolling back its website draft from the connection's sheet, through the
 * same restore as `restore_site_draft`.
 */
describe("a connection's changes and roll back from Settings", () => {
    const connections = new AiConnectionsService(new AuditService());

    /** `connect()`, with the grant row Settings reads. */
    async function connected(role: "OWNER" | "MEMBER" = "OWNER") {
        const c = await connect(role);
        if (c.as.connection.kind !== "oauth") throw new Error("oauth");
        await prisma.oauthConsent.create({
            data: {
                id: c.as.connection.id,
                clientId: c.as.connection.clientId,
                userId: c.as.connection.userId,
                scopes: c.as.connection.scopes,
                organizationIds: [c.org.id],
                createdAt: new Date(),
            },
        });
        return c;
    }

    it("lists what the connection changed, newest first and paged, with the draft it can roll back", async () => {
        const { siteId, homeId, as, ownerCtx } = await connected();
        for (const title of ["One", "Two", "Three"]) {
            await call(as, "update_page", {
                site_id: siteId,
                page_id: homeId,
                title,
            });
        }
        const first = await connections.activity(ownerCtx, as.connection.id, {
            limit: 2,
        });
        expect(first.data).toHaveLength(2);
        expect(first.data.every((r) => r.tool === "update_page")).toBe(true);
        expect(first.nextCursor).toBe(first.data[1].id);
        expect(first.siteDrafts).toEqual([
            expect.objectContaining({ siteId, since: expect.any(String) }),
        ]);
        const rest = await connections.activity(ownerCtx, as.connection.id, {
            limit: 2,
            cursor: first.nextCursor ?? undefined,
        });
        expect(rest.data).toHaveLength(1);
        expect(rest.nextCursor).toBeNull();
        expect(rest.siteDrafts).toEqual([]);
    });

    it("rolls the draft back, leaves the live site alone, and audits it", async () => {
        const { org, siteId, homeId, as, ownerCtx } = await connected();
        const before = await sectionsOf(homeId);
        await call(as, "remove_section", {
            site_id: siteId,
            page_id: homeId,
            section_key: before[0].key,
        });
        const out = await connections.rollBack(
            ownerCtx,
            as.connection.id,
            siteId,
        );
        expect(out.siteId).toBe(siteId);
        expect(await sectionsOf(homeId)).toEqual(before);
        expect(
            await prisma.auditEvent.count({
                where: {
                    organizationId: org.id,
                    action: "ai_connection.site_rolled_back",
                    targetId: as.connection.id,
                },
            }),
        ).toBe(1);
        // On the connection's own list, so the assistant's own restore counts it as its own.
        const listed = await connections.activity(ownerCtx, as.connection.id);
        expect(listed.data[0].tool).toBe("rollback_from_settings");
    });

    it("refuses when the draft was changed outside the connection since", async () => {
        const { siteId, homeId, as, ownerCtx } = await connected();
        await call(as, "update_page", {
            site_id: siteId,
            page_id: homeId,
            title: "Welcome",
        });
        const draft = await sites.getPageDraft(ownerCtx, siteId, homeId);
        await sites.replaceDraftSections(ownerCtx, siteId, homeId, {
            sections: draft.sections.slice(1),
            revision: draft.revision,
        });
        await expect(
            connections.rollBack(ownerCtx, as.connection.id, siteId),
        ).rejects.toMatchObject({ status: 409 });
        expect(await sectionsOf(homeId)).toHaveLength(
            draft.sections.length - 1,
        );
    });

    it("still shows and rolls back a connection's changes after it is disconnected", async () => {
        const { org, siteId, homeId, as, ownerCtx } = await connected();
        const before = await sectionsOf(homeId);
        await call(as, "remove_section", {
            site_id: siteId,
            page_id: homeId,
            section_key: before[0].key,
        });
        await connections.disconnect(ownerCtx, as.connection.id);
        const other = await prisma.user.create({
            data: { email: `${uniq("a")}@example.com`, name: "Admin" },
        });
        await prisma.membership.create({
            data: { organizationId: org.id, userId: other.id, role: "ADMIN" },
        });
        const admin = await new OrganizationContextService().resolve(
            other.id,
            org.id,
        );
        await expect(
            connections.activity(admin, as.connection.id),
        ).rejects.toMatchObject({ status: 403 });
        const listed = await connections.activity(ownerCtx, as.connection.id);
        expect(listed.siteDrafts).toEqual([
            expect.objectContaining({ siteId }),
        ]);
        await connections.rollBack(ownerCtx, as.connection.id, siteId);
        expect(await sectionsOf(homeId)).toEqual(before);
        await expect(
            connections.activity(ownerCtx, uniq("never")),
        ).rejects.toMatchObject({ status: 404 });
    });

    it("re-checks outside changes under the site's lock, and keeps no restore point when refused", async () => {
        const { siteId, homeId, as, ownerCtx } = await connected();
        await call(as, "update_page", {
            site_id: siteId,
            page_id: homeId,
            title: "Welcome",
        });
        // A teammate's save lands after the first check, before the lock.
        const points = new RestorePointService();
        const take = points.beforeSiteWrite.bind(points);
        points.beforeSiteWrite = async (c, id, now) => {
            const draft = await sites.getPageDraft(ownerCtx, siteId, homeId);
            await sites.replaceDraftSections(ownerCtx, siteId, homeId, {
                sections: draft.sections.slice(1),
                revision: draft.revision,
            });
            return take(c, id, now);
        };
        const racing = new AiConnectionsService(new AuditService(), points);
        const pointsBefore = await prisma.siteRestorePoint.count({
            where: { siteId },
        });
        await expect(
            racing.rollBack(ownerCtx, as.connection.id, siteId),
        ).rejects.toMatchObject({ status: 409 });
        expect(await prisma.siteRestorePoint.count({ where: { siteId } })).toBe(
            pointsBefore,
        );
    });

    it("two businesses disconnecting one connection at once each take only themselves off", async () => {
        const { as, ownerCtx } = await connected();
        const b = await prisma.organization.create({
            data: { name: uniq("Pulse"), slug: uniq("pulse") },
        });
        const bOwner = await prisma.user.create({
            data: { email: `${uniq("b")}@example.com`, name: "Ravi" },
        });
        await prisma.membership.create({
            data: { organizationId: b.id, userId: bOwner.id, role: "OWNER" },
        });
        await prisma.oauthConsent.update({
            where: { id: as.connection.id },
            data: { organizationIds: { push: b.id } },
        });
        const bCtx = await new OrganizationContextService().resolve(
            bOwner.id,
            b.id,
        );
        await Promise.all([
            connections.disconnect(ownerCtx, as.connection.id),
            connections.disconnect(bCtx, as.connection.id),
        ]);
        expect(
            await prisma.oauthConsent.findUnique({
                where: { id: as.connection.id },
            }),
        ).toBeNull();
    });

    it("lets only the person or an Owner see and roll back a connection", async () => {
        const { org, siteId, as } = await connected();
        const other = await prisma.user.create({
            data: { email: `${uniq("a")}@example.com`, name: "Admin" },
        });
        await prisma.membership.create({
            data: { organizationId: org.id, userId: other.id, role: "ADMIN" },
        });
        const admin = await new OrganizationContextService().resolve(
            other.id,
            org.id,
        );
        await expect(
            connections.activity(admin, as.connection.id),
        ).rejects.toMatchObject({ status: 403 });
        await expect(
            connections.rollBack(admin, as.connection.id, siteId),
        ).rejects.toMatchObject({ status: 403 });
        // The person themselves may: nothing changed yet, so nothing to roll back.
        const self = { ...as.ctx, actions: new Set([...as.ctx.actions]) };
        expect(
            (await connections.activity(self, as.connection.id)).data,
        ).toEqual([]);
        await expect(
            connections.rollBack(self, as.connection.id, siteId),
        ).rejects.toMatchObject({ status: 404 });
    });
});
