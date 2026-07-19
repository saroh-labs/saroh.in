import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteEditor } from "@/components/sites/site-editor";
import { requireSession } from "@/lib/session";
import type { Section } from "@/lib/sites/service";
import { getPageDraft, getSite } from "@/lib/sites/service";

/**
 * Site editor host (S2-004). Resolves the site (notFound when missing / not
 * permitted), picks its home page (or the first page), loads that page's
 * editable draft, and hands the draft sections to the client SiteEditor. The
 * editing + live preview happen client-side; only Save/Publish hit the API.
 */
export default async function SiteEditorPage({
    params,
}: {
    params: Promise<{ siteId: string }>;
}) {
    const { siteId } = await params;
    await requireSession();

    const site = await getSite(siteId);
    if (!site) notFound();

    if (site.pages.length === 0) notFound();
    const homePage = site.pages.find((page) => page.isHome) ?? site.pages[0];

    const draft = await getPageDraft(siteId, homePage.id);
    // Drop the `order` carried by DraftSection — array position is the order.
    const initialSections: Section[] = (draft?.sections ?? []).map(
        ({ type, contractVersion, content }) =>
            ({ type, contractVersion, content }) as Section,
    );

    return (
        <main className="mx-auto max-w-6xl p-8">
            <Link
                href="/sites"
                className="text-sm text-muted-foreground hover:underline"
            >
                ← Back to sites
            </Link>
            <SiteEditor
                siteId={siteId}
                pageId={homePage.id}
                initialSections={initialSections}
                siteName={site.name}
            />
        </main>
    );
}
