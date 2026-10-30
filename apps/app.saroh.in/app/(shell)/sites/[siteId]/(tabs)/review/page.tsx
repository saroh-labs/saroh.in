import { redirect } from "next/navigation";

/**
 * The old review screen's address (#275), kept so links in emails, Home and
 * the menu still work: a Reviewer now reads the site in the editor itself,
 * read-only (DEC-200), and so does everyone else who lands here. The page
 * being read travels with them.
 */
export default async function SiteReviewPage({
    params,
    searchParams,
}: {
    params: Promise<{ siteId: string }>;
    searchParams: Promise<{ page?: string }>;
}) {
    const { siteId } = await params;
    const { page } = await searchParams;
    redirect(
        page
            ? `/sites/${siteId}?page=${encodeURIComponent(page)}`
            : `/sites/${siteId}`,
    );
}
