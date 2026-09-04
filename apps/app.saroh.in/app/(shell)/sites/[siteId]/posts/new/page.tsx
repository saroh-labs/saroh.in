import { PageHeader } from "@saroh/ui/page-header";
import { notFound } from "next/navigation";

import { PostForm } from "@/components/sites/post-form";
import { listPostCategories } from "@/lib/content/service";
import { requireSession } from "@/lib/session";
import { getSite } from "@/lib/sites/service";

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

    return (
        <div className="space-y-6">
            <PageHeader
                title="New post"
                description="Write a post for this site."
            />
            <PostForm siteId={siteId} categories={categories} />
        </div>
    );
}
