import { notFound } from "next/navigation";

import { PostEditor } from "@/components/sites/posts/post-editor";
import { deniedFor } from "@/lib/access/require-can";
import { readAskAiDraftContent } from "@/lib/ask-ai/service";
import { listPostCategories } from "@/lib/content/service";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { getSite } from "@/lib/sites/service";

/** The tab's title (UX-081): without one it read the bare "Saroh". */
export const metadata = { title: "New post · Website" };

/*
 * The editor is document-shaped and owns the whole area (#232) — it carries
 * its own header with the state and the publish control, so a PageHeader above
 * it would be a second, quieter title saying the same thing.
 */
export default async function NewPostPage({
    params,
    searchParams,
}: {
    params: Promise<{ siteId: string }>;
    searchParams?: Promise<{ from?: string | string[] }>;
}) {
    const { siteId } = await params;
    const { from } = (await searchParams) ?? {};
    await requireSession();
    const site = await getSite(siteId);
    if (!site) notFound();
    /*
     * Writing a post is `section:write` (`posts.service.ts`), which the site
     * read answers as `can.edit`. A Reviewer or a Member reads posts, and
     * used to get this editor and a Save the API refused.
     */
    if (!site.can.edit) {
        return deniedFor(await resolveActiveOrganization(), {
            thing: "New post",
            back: { href: `/sites/${siteId}/posts`, label: "Back to Posts" },
        });
    }

    /*
     * Open in editor (owner, 14 Nov): `?from=<draftId>` starts the post from
     * an Ask AI blog draft, unsaved. A draft for another website, or one
     * that can't be read (run out, saved, not the person's), starts empty.
     */
    const draftId = typeof from === "string" && from ? from : null;
    const [categories, draft] = await Promise.all([
        listPostCategories(siteId),
        draftId ? readAskAiDraftContent(draftId) : null,
    ]);
    const fromAskAi = draftId
        ? draft?.siteId === siteId
            ? draft
            : null
        : undefined;

    return (
        <PostEditor
            siteId={siteId}
            categories={categories}
            fromAskAi={fromAskAi}
        />
    );
}
