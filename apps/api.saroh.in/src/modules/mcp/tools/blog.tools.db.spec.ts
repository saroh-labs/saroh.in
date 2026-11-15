/**
 * `draft_blog_post` against a real Postgres (owner, 14 Nov): it saves a
 * DRAFT post on the business's website, never a published one; another
 * business's website is out of reach; a role without `section:write` and a
 * business with the Website module off are refused; a retry with the same
 * request_id saves once. Through `McpToolRegistry.call`, as on `/mcp`.
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import { IdempotencyService } from "../../../common/idempotency/idempotency.service";
import { AuditService } from "../../audit/audit.service";
import { PostsService } from "../../content/posts.service";
import { OrganizationContextService } from "../../organizations/organization-context.service";
import { McpActivityService } from "../activity.service";
import type { McpCall } from "../tool-registry";
import { McpToolRegistry } from "../tool-registry";
import { blogTools } from "./blog.tools";

const tag = `${process.pid}x${Date.now() % 100000}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;

const registry = new McpToolRegistry(
    new McpActivityService(new AuditService()),
);
registry.register(
    ...blogTools({
        posts: new PostsService(),
        idempotency: new IdempotencyService(),
    }),
);

type Result = Awaited<ReturnType<McpToolRegistry["call"]>> & {
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
};

async function call(as: McpCall, args: Record<string, unknown>) {
    const tool = registry.get("draft_blog_post");
    if (!tool) throw new Error("no tool");
    const input = tool.contract.input.parse(args) as Record<string, unknown>;
    const r = (await registry.call(tool, input, as, null)) as Result;
    if (!r.isError) tool.contract.output.parse(r.structuredContent);
    return r;
}

/** A business with one website, connected as `role`. */
async function connect(role: "OWNER" | "MEMBER" = "OWNER") {
    const org = await prisma.organization.create({
        data: { name: uniq("Northwind"), slug: uniq("nw") },
    });
    const user = await prisma.user.create({
        data: { email: `${uniq("u")}@example.com`, name: "Asha" },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: user.id, role },
    });
    const site = await prisma.site.create({
        data: { organizationId: org.id, name: "Northwind", slug: uniq("s") },
    });
    const ctx = await new OrganizationContextService().resolve(user.id, org.id);
    const as: McpCall = {
        ctx,
        connection: {
            kind: "oauth",
            id: uniq("grant"),
            clientId: "spec",
            clientName: "Claude",
            scopes: ["saroh:read", "saroh:write"],
            userId: user.id,
            businesses: [org.id],
        },
    };
    return { org, siteId: site.id, as };
}

const BODY = "## Why\n\nWe pack in **recycled** paper.\n\n- Less plastic";

describe("draft_blog_post", () => {
    it("saves a DRAFT post with the Markdown as the editor's HTML, never published", async () => {
        const { siteId, as } = await connect();
        const r = await call(as, {
            request_id: uniq("r"),
            title: "Our new eco packing range",
            body: BODY,
            excerpt: "Paper, not plastic.",
        });
        expect(r.isError).toBeFalsy();
        const data = r.structuredContent as {
            post_id: string;
            editor_url: string;
        };
        expect(data.editor_url).toContain(
            `/sites/${siteId}/posts/${data.post_id}`,
        );
        const post = await prisma.post.findUniqueOrThrow({
            where: { id: data.post_id },
        });
        expect(post).toMatchObject({
            siteId,
            title: "Our new eco packing range",
            slug: "our-new-eco-packing-range",
            excerpt: "Paper, not plastic.",
            status: "DRAFT",
            publishedAt: null,
            currentPublicationId: null,
            authorId: as.ctx.userId,
        });
        expect(post.content).toBe(
            "<h2>Why</h2><p>We pack in <strong>recycled</strong> paper.</p><ul><li><p>Less plastic</p></li></ul>",
        );
        expect(
            await prisma.mcpActivity.count({
                where: {
                    organizationId: as.ctx.organizationId,
                    tool: "draft_blog_post",
                },
            }),
        ).toBe(1);
    });

    it("the same title again gets its own address; a retry with the same request_id saves once", async () => {
        const { siteId, as } = await connect();
        const request_id = uniq("r");
        const first = await call(as, { request_id, title: "News", body: "a" });
        const retry = await call(as, { request_id, title: "News", body: "a" });
        expect(retry.structuredContent?.post_id).toBe(
            first.structuredContent?.post_id,
        );
        await call(as, { request_id: uniq("r"), title: "News", body: "b" });
        const slugs = (
            await prisma.post.findMany({
                where: { siteId },
                select: { slug: true },
            })
        ).map((p) => p.slug);
        expect(slugs.sort()).toEqual(["news", "news-2"]);
    });

    it("another business's website is out of reach", async () => {
        const mine = await connect();
        const theirs = await connect();
        const r = await call(mine.as, {
            request_id: uniq("r"),
            site_id: theirs.siteId,
            title: "x",
            body: "y",
        });
        expect(r.isError).toBe(true);
        expect(
            await prisma.post.count({ where: { siteId: theirs.siteId } }),
        ).toBe(0);
    });

    it("with several websites, asks for site_id", async () => {
        const { org, as } = await connect();
        await prisma.site.create({
            data: { organizationId: org.id, name: "Second", slug: uniq("s") },
        });
        const r = await call(as, {
            request_id: uniq("r"),
            title: "x",
            body: "y",
        });
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toContain("more than one website");
    });

    it("a role without section:write is refused, and nothing is saved", async () => {
        const { siteId, as } = await connect("MEMBER");
        const tool = registry.get("draft_blog_post");
        expect(tool && registry.allows(tool, as.ctx)).toBe(false);
        const r = await call(as, {
            request_id: uniq("r"),
            title: "x",
            body: "y",
        });
        expect(r.isError).toBe(true);
        expect(await prisma.post.count({ where: { siteId } })).toBe(0);
    });

    it("the Website module off is refused, and nothing is saved", async () => {
        const { siteId, as } = await connect();
        const off = jest
            .spyOn(registry, "modulesOff")
            .mockResolvedValue(new Set(["WEBSITE"]));
        try {
            const r = await call(as, {
                request_id: uniq("r"),
                title: "x",
                body: "y",
            });
            expect(r.isError).toBe(true);
            expect(r.content[0].text).toContain("off for this business");
        } finally {
            off.mockRestore();
        }
        expect(await prisma.post.count({ where: { siteId } })).toBe(0);
    });
});
