import { PageHeader } from "@saroh/ui/page-header";
import { notFound } from "next/navigation";

import { PageContainer } from "@/components/shared/page-container";
import { PostCategoriesManager } from "@/components/sites/post-categories-manager";
import { listPostCategories } from "@/lib/content/service";
import { requireSession } from "@/lib/session";
import { getSite } from "@/lib/sites/service";
/** The tab's title (UX-081): without one it read the bare "Saroh". */
export const metadata = { title: "Categories · Website" };

export default async function PostCategoriesPage({
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
        <PageContainer width="form">
            <PageHeader
                title="Post categories"
                description="Group this site's posts."
            />
            <PostCategoriesManager siteId={siteId} categories={categories} />
        </PageContainer>
    );
}
