import { notFound } from "next/navigation";

import { PostShell } from "@/components/sites/posts/editor/post-shell";
import { deniedFor } from "@/lib/access/require-can";
import { readAskAiDraftContent } from "@/lib/ask-ai/service";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { readPostEditorData } from "@/lib/sites/post-editor-read";
import { getSite } from "@/lib/sites/service";

/** The tab's title (UX-081). */
export const metadata = { title: "New post · Website" };

/**
 * A new post in the desk editor (U15, KTD-E7). Writing a post is
 * `section:write`, which the site read answers as `can.edit`: anyone else
 * is told who can give them access. `?from=<draftId>` starts it from an
 * Ask AI blog draft, unsaved (owner, 14 Nov); one for another website,
 * or one that can't be read, starts empty with one quiet line.
 */
export default async function WriteNewPostPage({
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
    if (!site.can.edit) {
        return deniedFor(await resolveActiveOrganization(), {
            thing: "New post",
            back: { href: `/sites/${siteId}/writing`, label: "Back to Blog" },
        });
    }
    const draftId = typeof from === "string" && from ? from : null;
    const draft = draftId ? await readAskAiDraftContent(draftId) : null;
    const fromAskAi = draftId
        ? draft?.siteId === siteId
            ? draft
            : null
        : undefined;
    const data = await readPostEditorData(site, null, fromAskAi);
    return <PostShell data={data} />;
}
