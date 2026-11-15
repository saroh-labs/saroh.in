import { Button } from "@saroh/ui/button";
import { Notice } from "@saroh/ui/notice";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { PageContainer } from "@/components/shared/page/page-container";
import { PublishRequestScreen } from "@/components/sites/publish-request/publish-request-screen";
import { requireSession } from "@/lib/session";
import { readPublishRequest } from "@/lib/sites/publish-requests-api";

/**
 * Where an AI app's publish request is answered (DEC-215 as amended 12 Nov
 * 2026). The app's link opens the business (`/open/:id?to=`) and lands
 * here. Reading never publishes: only the signed-in person's press does.
 * A 403 (no `site:publish`) is the shell's no-access state; a request that
 * isn't this business's or this site's reads as not here.
 */
export const metadata = { title: "Publish request · Website" };

export default async function PublishRequestPage({
    params,
}: {
    params: Promise<{ siteId: string; requestId: string }>;
}) {
    const { siteId, requestId } = await params;
    await requireSession();
    const view = await readPublishRequest(siteId, requestId);

    return (
        <PageContainer>
            <PageHeader
                breadcrumb={[
                    <Link data-ph-unmask="" key="site" href="/sites">
                        Website
                    </Link>,
                    "Publish request",
                ]}
                holdsData
                title={view ? `Publish ${view.siteName}?` : "Publish request"}
                description={
                    view
                        ? "An AI app prepared this. Only you can publish it."
                        : undefined
                }
            />
            {view ? (
                <PublishRequestScreen view={view} requestId={requestId} />
            ) : (
                <div className="grid max-w-xl gap-4">
                    <Notice tone="warning" role="status">
                        This link doesn&apos;t open a publish request in this
                        business. It may be for another business, or it was
                        cleared after a week. Nothing was published.
                    </Notice>
                    <Button
                        asChild
                        variant="outline"
                        className="justify-self-start"
                    >
                        <Link href="/sites">Back to the website</Link>
                    </Button>
                </div>
            )}
        </PageContainer>
    );
}
