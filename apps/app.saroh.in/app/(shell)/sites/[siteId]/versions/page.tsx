import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteVersions } from "@/components/sites/site-versions";
import { requireSession } from "@/lib/session";
import { getSite, listPublications } from "@/lib/sites/service";

/**
 * Version history (#194).
 *
 * Every publish has been kept since Stage 2 — `Publication` is immutable and
 * append-only, so republishing inserts a row rather than replacing one. The
 * history existed and had no surface; this is the surface.
 */
export const metadata = { title: "Version history" };

export default async function SiteVersionsPage({
    params,
}: {
    params: Promise<{ siteId: string }>;
}) {
    const { siteId } = await params;
    await requireSession();

    const [site, publications] = await Promise.all([
        getSite(siteId),
        listPublications(siteId),
    ]);
    if (!site) notFound();

    return (
        <div className="max-w-3xl space-y-6">
            <PageHeader
                title="Version history"
                description={site.name}
                actions={
                    <Button variant="outline" asChild>
                        <Link href={`/sites/${siteId}/settings`}>Settings</Link>
                    </Button>
                }
            />
            <SiteVersions siteId={siteId} publications={publications} />
        </div>
    );
}
