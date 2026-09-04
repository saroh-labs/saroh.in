import { notFound } from "next/navigation";

import { PostEditor } from "@/components/sites/post-editor";
import { listPostCategories } from "@/lib/content/service";
import { requireSession } from "@/lib/session";
import { getSite } from "@/lib/sites/service";

/*
 * The editor is document-shaped and owns the whole area (#232) — it carries
 * its own header with the state and the publish control, so a PageHeader above
 * it would be a second, quieter title saying the same thing.
 */
export default async function NewPostPage({
    params,
}: {
    params: Promise<{ siteId: string }>;
}) {
    const { siteId } = await params;
    await requireSession();
    const site = await getSite(siteId);
    if (!site) notFound();

    const categories = await listPostCategories(siteId);

    return <PostEditor siteId={siteId} categories={categories} />;
}
