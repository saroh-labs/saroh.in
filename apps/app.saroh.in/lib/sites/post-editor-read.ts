import "server-only";

import { askAiOn } from "@/lib/ask-ai/ask-ai-switch";
import { activeCut, postPaused } from "@/lib/billing/paused";
import type { PostDetail } from "@/lib/content/service";
import { listPostCategories, listPosts } from "@/lib/content/service";
import { pausedOrNull } from "@/lib/saroh-billing/service";
import { readShareSetup } from "@/lib/share-item/read";
import type { SiteDetail } from "@/lib/sites/service";
import { listComments } from "@/lib/sites/service";
import { siteAddressOf } from "@/lib/sites/share-links";
import {
    readWebAddressLinks,
    RENDERER_APEX,
} from "@/lib/sites/share-links-read";

import type { PostEditorData } from "@/components/sites/posts/editor/post-model";
import type { AskAiStart } from "@/components/sites/posts/editor/use-post-draft";

/**
 * Everything the desk post editor reads (KTD-E7), as today's post pages
 * read it: categories, notes (DEC-200 U8), the paused rule (#800), Share
 * as a post (#1375), plus the site's posts, look and address.
 */
export async function readPostEditorData(
    site: SiteDetail,
    post: PostDetail | null,
    fromAskAi?: AskAiStart | null,
): Promise<PostEditorData> {
    const siteId = site.id;
    const [categories, posts, paused, comments, web] = await Promise.all([
        listPostCategories(siteId),
        listPosts(siteId).catch(() => null),
        pausedOrNull(),
        // A reader is here for the notes, so a failure is the segment's
        // to explain; the writer can still write without them.
        post
            ? site.can.edit
                ? listComments(siteId).catch(() => null)
                : listComments(siteId)
            : null,
        readWebAddressLinks(),
    ]);
    const prefix = site.postsPrefix ?? "blog";
    const setup = post?.live && web ? await readShareSetup(web) : null;
    return {
        siteId,
        author: post?.author ?? null,
        siteName: site.name,
        address: siteAddressOf(site, web, RENDERER_APEX)?.host ?? null,
        postsPrefix: prefix,
        categories,
        posts,
        style: site.style,
        styleOptions: site.styleOptions,
        paused: post ? postPaused(post, activeCut(paused, "posts")) : false,
        readOnly: !site.can.edit,
        feedback:
            post && comments
                ? {
                      comments: comments.filter((c) => c.postId === post.id),
                      canComment: site.can.comment,
                      canSettle: site.can.edit,
                  }
                : undefined,
        share:
            post && web && setup
                ? {
                      setup,
                      url: `${web.origin.replace(/\/+$/, "")}/${prefix}/${post.slug}`,
                  }
                : null,
        fromAskAi,
        askAi: askAiOn() && site.can.edit,
        // Page results by path come with U47a; until then nothing is claimed.
        readBy: null,
    };
}
