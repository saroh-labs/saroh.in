import type { OnModuleInit } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { draftBlogPostTool } from "@saroh/api-contract";
import { prisma } from "@saroh/database";

import { appBaseOf } from "../../../common/app-url";
import { IdempotencyService } from "../../../common/idempotency/idempotency.service";
import { PostsService } from "../../content/posts.service";
import { once } from "../../public-api/v1-support";
import { sanitizeRichHtml } from "../../sites/sanitize";
import { slugify } from "../../stores/slug";
import type { McpCall } from "../activity.service";
import type { McpTool } from "../tool-registry";
import { defineTool, McpToolRegistry, ToolError } from "../tool-registry";
import { quoteUntrusted } from "../untrusted";
import { CREATE } from "./catalogue.tools";
import { siteIdOf } from "./site.tools";
import { viaV1 } from "./v1-bridge";

/** The post editor in the app, where the person reads it and publishes it. */
export async function postEditorUrl(
    organizationId: string,
    siteId: string,
    postId: string,
): Promise<string> {
    return `${await appBaseOf(organizationId)}/sites/${encodeURIComponent(siteId)}/posts/${encodeURIComponent(postId)}`;
}

const escape = (text: string) =>
    text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

/** **bold** and *italic* / _italic_, on text already escaped. */
const inline = (text: string) =>
    escape(text)
        .replace(/\*\*(\S(?:.*?\S)?)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[^*\w])[*_](\S(?:.*?\S)?)[*_](?![*\w])/g, "$1<em>$2</em>");

/**
 * Simple Markdown as the post editor's HTML (the Tiptap editor stores HTML
 * in `Post.content`): blank-line paragraphs, `#`–`###` headings (h2/h3: the
 * title is the page's h1), `-`/`*`/`+` and `1.` lists, `>` quotes, bold and
 * italic. Every character of text is escaped first, so no markup gets in.
 */
export function markdownToHtml(markdown: string): string {
    const out: string[] = [];
    let para: string[] = [];
    // A holder, not a `let`: TS doesn't see `flush` empty it.
    const open: { list: { tag: "ul" | "ol"; items: string[] } | null } = {
        list: null,
    };
    const flush = () => {
        if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
        para = [];
        const list = open.list;
        if (list) {
            const items = list.items.map((i) => `<li><p>${inline(i)}</p></li>`);
            out.push(`<${list.tag}>${items.join("")}</${list.tag}>`);
        }
        open.list = null;
    };
    for (const raw of markdown.replace(/\r\n?/g, "\n").split("\n")) {
        const line = raw.trim();
        const heading = /^(#{1,6})\s+(.+)$/.exec(line);
        const item = /^(?:[-*+]|\d+[.)])\s+(.+)$/.exec(line);
        if (!line) {
            flush();
        } else if (heading) {
            flush();
            const level = heading[1].length <= 2 ? 2 : 3;
            const words = heading[2].replace(/\s+#+$/, "");
            out.push(`<h${level}>${inline(words)}</h${level}>`);
        } else if (item) {
            const tag = /^\d/.test(line) ? "ol" : "ul";
            if (para.length || open.list?.tag !== tag) flush();
            open.list ??= { tag, items: [] };
            open.list.items.push(item[1]);
        } else if (line.startsWith(">")) {
            flush();
            out.push(
                `<blockquote><p>${inline(line.replace(/^>\s?/, ""))}</p></blockquote>`,
            );
        } else if (open.list) {
            // A wrapped list line belongs to the item above it.
            open.list.items[open.list.items.length - 1] += ` ${line}`;
        } else {
            para.push(line);
        }
    }
    flush();
    return out.join("");
}

/** The title's address, or the first free `-2`, `-3`… on this site. */
async function freeSlug(siteId: string, title: string): Promise<string> {
    const base = slugify(title).slice(0, 180) || "post";
    const taken = new Set(
        (
            await prisma.post.findMany({
                where: { siteId, slug: { startsWith: base } },
                select: { slug: true },
            })
        ).map((p) => p.slug),
    );
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    return slug;
}

export function blogTools(d: {
    posts: PostsService;
    idempotency: IdempotencyService;
}): McpTool[] {
    return [
        defineTool({
            name: "draft_blog_post",
            title: "Write a blog post draft",
            description:
                'Use this when the person wants a blog post for their website: it saves a DRAFT post (title and body in simple Markdown) that they read and publish from the editor. It never publishes. Example: title "Our new eco packing range", a body of 200 to 400 words. Not for website pages or sections (edit_page), nor social posts.',
            contract: draftBlogPostTool,
            capability: "section:write",
            module: "WEBSITE",
            hints: CREATE,
            async run(input, call: McpCall) {
                const { ctx } = call;
                const siteId = await siteIdOf(ctx, input.site_id);
                const site = await prisma.site.findFirst({
                    where: {
                        id: siteId,
                        organizationId: ctx.organizationId,
                        deletedAt: null,
                    },
                    select: { name: true },
                });
                if (!site) {
                    throw new ToolError(
                        `There is no website ${siteId} in this business.`,
                        "Leave site_id out, or take it from get_site.",
                    );
                }
                const made = await once(
                    d.idempotency,
                    viaV1(call, "draft_blog_post", input.request_id),
                    ctx,
                    input,
                    async () =>
                        d.posts.create(ctx, siteId, {
                            title: input.title,
                            slug: await freeSlug(siteId, input.title),
                            excerpt: input.excerpt,
                            content: sanitizeRichHtml(
                                markdownToHtml(input.body),
                            ),
                            // Never PUBLISHED here: the person publishes from the editor.
                            status: "DRAFT",
                        }),
                );
                const editor_url = await postEditorUrl(
                    ctx.organizationId,
                    siteId,
                    made.id,
                );
                return {
                    text: [
                        `Saved a draft blog post (post_id ${made.id}) on the website ${quoteUntrusted("name", site.name)}. It is not published: the person reads it and publishes it from the editor.`,
                        `Open in the Saroh editor: ${editor_url}`,
                    ].join("\n"),
                    data: {
                        post_id: made.id,
                        site_id: siteId,
                        title: input.title,
                        status: "draft" as const,
                        editor_url,
                    },
                    activity: {
                        target: `post:${made.id}`,
                        summary: "Saved a draft blog post.",
                    },
                };
            },
        }),
    ] as McpTool[];
}

/** Registers the blog tool at boot. */
@Injectable()
export class BlogTools implements OnModuleInit {
    constructor(
        private readonly registry: McpToolRegistry,
        private readonly idempotency: IdempotencyService,
    ) {}

    onModuleInit(): void {
        this.registry.register(
            // Stateless (no constructor deps), as `site.tools.ts` keeps its flag reader.
            ...blogTools({
                posts: new PostsService(),
                idempotency: this.idempotency,
            }),
        );
    }
}
