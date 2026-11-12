/**
 * The MCP website tools against a real Postgres (plan 2026-11-10-001, U11):
 * draft-only edits with preview links, publish and its approval route, the
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
    releases: new TestReleasesService(sites, new FeatureFlagService()),
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
// The media service and the tool share one store, as in Nest.
deps.media = new MediaService(deps.storage);

const registry = new McpToolRegistry(
    new McpActivityService(new AuditService()),
);
/** The clock publish codes expire by; null is the real one. */
let clock: Date | null = null;
registry.register(
    ...siteTools({ ...deps, fetchImage, now: () => clock ?? new Date() }),
);
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

/** preview_publish's confirm_code, as an app gets it before asking the person. */
async function codeFor(as: McpCall, siteId: string): Promise<string> {
    const r = await call(as, "preview_publish", { site_id: siteId });
    if (r.isError) throw new Error(textOf(r));
    return data<{ confirm_code: string }>(r).confirm_code;
}

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

    it("publishes, saying what changed", async () => {
        const { siteId, as } = await connect();
        const r = await call(as, "publish_site", {
            site_id: siteId,
            confirm_code: await codeFor(as, siteId),
        });
        expect(textOf(r)).toContain("Published the website");
        expect(data(r)).toMatchObject({ outcome: "published" });
        const site = await prisma.site.findUniqueOrThrow({
            where: { id: siteId },
            select: { currentPublicationId: true },
        });
        expect(site.currentPublicationId).not.toBeNull();
        expect(
            await prisma.mcpActivity.count({
                where: { tool: "publish_site", connectionId: as.connection.id },
            }),
        ).toBe(1);
    });

    it("summarises without publishing: what goes live, preview, where it goes, a code kept only as a digest", async () => {
        const { siteId, as } = await connect();
        const r = await call(as, "preview_publish", { site_id: siteId });
        expect(r.isError).toBeFalsy();
        const out = data<{
            will: string;
            changed: string[];
            preview_url: string;
            confirm_code: string;
        }>(r);
        expect(out).toMatchObject({
            will: "go_live",
            changed: ["first publish: the whole site"],
        });
        expect(out.preview_url).toMatch(/\/preview\/[\w-]+$/);
        expect(textOf(r)).toContain("Not published.");
        expect(textOf(r)).toContain(out.confirm_code);
        expect(textOf(r)).toContain("Only after they say yes");

        const site = await prisma.site.findUniqueOrThrow({
            where: { id: siteId },
            select: { currentPublicationId: true },
        });
        expect(site.currentPublicationId).toBeNull();
        expect(
            await prisma.mcpActivity.count({
                where: { connectionId: as.connection.id },
            }),
        ).toBe(0);
        const rows = await prisma.mcpPublishCode.findMany({
            where: { siteId },
        });
        expect(rows).toHaveLength(1);
        expect(JSON.stringify(rows)).not.toContain(out.confirm_code);
    });

    it("refuses a used code, an expired one, and one from another connection, business or site", async () => {
        const { org, siteId, as } = await connect();
        const publish = (who: McpCall, site_id: string, confirm_code: string) =>
            call(who, "publish_site", { site_id, confirm_code });
        const live = async () =>
            (
                await prisma.site.findUniqueOrThrow({
                    where: { id: siteId },
                    select: { currentPublicationId: true },
                })
            ).currentPublicationId;

        // Another connection to the same business.
        const other: McpCall = {
            ...as,
            connection: { ...as.connection, id: uniq("grant") },
        };
        const code = await codeFor(as, siteId);
        const theirs = await publish(other, siteId, code);
        expect(theirs.isError).toBe(true);
        expect(textOf(theirs)).toContain("isn't one Saroh gave");

        // The same connection in another business.
        const b = await connect();
        const elsewhere = await publish(
            { ...b.as, connection: as.connection },
            b.siteId,
            code,
        );
        expect(elsewhere.isError).toBe(true);
        expect(textOf(elsewhere)).toContain("isn't one Saroh gave");

        // Another website of the same business.
        // Made directly: a business normally has one website.
        const { id: second } = await prisma.site.create({
            data: {
                organizationId: org.id,
                name: "Rye two",
                slug: uniq("rye-two"),
            },
        });
        const wrongSite = await publish(as, second, code);
        expect(wrongSite.isError).toBe(true);
        expect(textOf(wrongSite)).toContain("isn't one Saroh gave");
        expect(await live()).toBeNull();

        // None of those spent it.
        expect((await publish(as, siteId, code)).isError).toBeFalsy();
        const published = await live();
        expect(published).not.toBeNull();
        const again = await publish(as, siteId, code);
        expect(again.isError).toBe(true);
        expect(textOf(again)).toContain("already used");

        clock = new Date();
        const old = await codeFor(as, siteId);
        clock = new Date(clock.getTime() + 10 * 60 * 1000 + 1);
        try {
            const late = await publish(as, siteId, old);
            expect(late.isError).toBe(true);
            expect(textOf(late)).toContain("expired");
        } finally {
            clock = null;
        }
        expect(await live()).toBe(published);
        expect(org.id).not.toBe(b.org.id);
    });

    it("refuses when the draft changed after the summary, and says to get a new one", async () => {
        const { siteId, homeId, as } = await connect();
        const code = await codeFor(as, siteId);
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
        const r = await call(as, "publish_site", {
            site_id: siteId,
            confirm_code: code,
        });
        expect(r.isError).toBe(true);
        expect(textOf(r)).toBe(
            "The draft changed since you showed the person what goes live. Next: Call preview_publish to get the new summary and code, show it to the person, and publish only once they say yes.",
        );
        const site = await prisma.site.findUniqueOrThrow({
            where: { id: siteId },
            select: { currentPublicationId: true },
        });
        expect(site.currentPublicationId).toBeNull();
    });

    it("refuses a save that lands after publish read the draft, under the site's lock", async () => {
        const { siteId, homeId, as } = await connect();
        const code = await codeFor(as, siteId);
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
            const r = await call(as, "publish_site", {
                site_id: siteId,
                confirm_code: code,
            });
            expect(spy).toHaveBeenCalled();
            expect(r.isError).toBe(true);
            expect(textOf(r)).toContain(
                "The draft changed since you showed the person what goes live.",
            );
        } finally {
            spy.mockRestore();
        }
        const site = await prisma.site.findUniqueOrThrow({
            where: { id: siteId },
            select: { currentPublicationId: true },
        });
        expect(site.currentPublicationId).toBeNull();
        expect(
            await prisma.mcpActivity.count({
                where: { tool: "publish_site", connectionId: as.connection.id },
            }),
        ).toBe(0);
    });

    it("with a reviewer required, says so in the summary and asks for approval only with a valid code", async () => {
        const { org, siteId, as } = await connect();
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
        const code = data<{ confirm_code: string }>(summary).confirm_code;

        const forged = await call(as, "publish_site", {
            site_id: siteId,
            confirm_code: `${code.slice(0, -2)}xx`,
        });
        expect(forged.isError).toBe(true);
        expect(await requested()).toBe(0);
        expect(await prisma.siteTestRelease.count({ where: { siteId } })).toBe(
            0,
        );

        const r = await call(as, "publish_site", {
            site_id: siteId,
            confirm_code: code,
        });
        expect(r.isError).toBeFalsy();
        expect(data(r)).toMatchObject({ outcome: "sent_for_approval" });
        const site = await prisma.site.findUniqueOrThrow({
            where: { id: siteId },
            select: { currentPublicationId: true },
        });
        expect(site.currentPublicationId).toBeNull();
        expect(await requested()).toBe(1);
        expect(await prisma.siteTestRelease.count({ where: { siteId } })).toBe(
            1,
        );
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

    it("while templates aren't chosen yet, says so and starts from the kind's default whatever is asked (DEC-216)", async () => {
        const { org, as } = await connect();
        await templateChoice(org.id, false);

        const listed = await call(as, "list_templates", {});
        expect(data<Listed>(listed).template_choice).toBe(false);
        expect(textOf(listed)).toContain("aren't chosen yet");

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
