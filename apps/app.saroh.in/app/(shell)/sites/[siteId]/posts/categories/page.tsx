import { redirect } from "next/navigation";

import { postCategoriesHref } from "@/lib/content/categories-href";

/**
 * Post categories used to be a page of their own, outside the Website tabs.
 * They are managed from the Posts tab now, in a sheet over the posts they
 * group, so this address sends an old link or bookmark there with the sheet
 * open. Someone who can't change categories lands on the Posts tab, which
 * doesn't offer them the sheet.
 */
export default async function PostCategoriesPage({
    params,
}: {
    params: Promise<{ siteId: string }>;
}) {
    const { siteId } = await params;
    redirect(postCategoriesHref(siteId));
}
