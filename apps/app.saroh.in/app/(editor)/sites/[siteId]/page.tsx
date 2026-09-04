import { notFound } from "next/navigation";

import { SiteEditor } from "@/components/sites/site-editor";
import { env } from "@/env";
import { requireSession } from "@/lib/session";
import type { Section } from "@/lib/sites/service";
import {
    getPageDraft,
    getReviewState,
    getSite,
    getSiteFlags,
    listComments,
} from "@/lib/sites/service";

/**
 * Site editor host (S2-004). Resolves the site (notFound when missing / not
 * permitted), picks its home page (or the first page), loads that page's
 * editable draft, and hands the draft sections to the client SiteEditor. The
 * editing + live preview happen client-side; only Save/Publish hit the API.
 */
/** Matches the sites index; the renderer defaults the same way. */
const ROOT_DOMAIN = env.NEXT_PUBLIC_ROOT_DOMAIN ?? "saroh.app";

export default async function SiteEditorPage({
    params,
    searchParams,
}: {
    params: Promise<{ siteId: string }>;
    searchParams: Promise<{ page?: string }>;
}) {
    const { siteId } = await params;
    const { page: requestedPageId } = await searchParams;
    await requireSession();

    const site = await getSite(siteId);
    if (!site) notFound();

    if (site.pages.length === 0) notFound();
    /*
     * Which page is open is a URL question, not editor state: it survives a
     * reload, it can be linked to, and Back goes where the merchant expects.
     *
     * An unrecognised id falls back to home rather than 404ing — the usual way
     * to get one is a stale link to a page that has since been deleted, and
     * dumping someone on an error page for that is worse than opening the page
     * every site is guaranteed to have.
     */
    const homePage = site.pages.find((page) => page.isHome) ?? site.pages[0];
    const activePage =
        site.pages.find((page) => page.id === requestedPageId) ?? homePage;

    // Flags are whole-site, so they load alongside the page rather than per
    // page — the pre-publish check groups them by page and cannot be answered
    // from the one page that happens to be open.
    const [draft, flags, comments, review] = await Promise.all([
        getPageDraft(siteId, activePage.id),
        getSiteFlags(siteId),
        listComments(siteId),
        getReviewState(siteId),
    ]);
    // Drop the `order` carried by DraftSection — array position is the order.
    // Everything else travels: `hidden` in particular, because a field dropped
    // here would come back visible after a reload and republish work the
    // merchant had deliberately taken off the site.
    const initialSections: Section[] = (draft?.sections ?? []).map(
        ({ type, contractVersion, content, hidden, key }) =>
            ({ type, contractVersion, content, hidden, key }) as Section,
    );

    // Full-bleed: the editor is a three-pane workspace, not a document. A
    // centred measure would leave the preview narrower than the phone it is
    // meant to simulate.
    return (
        <SiteEditor
            // Keyed on the page so switching pages remounts the editor with
            // that page's sections. Without it the new sections would arrive as
            // props into state seeded from the old ones, and the merchant would
            // see the previous page's content under the new page's name.
            key={activePage.id}
            siteId={siteId}
            pageId={activePage.id}
            pages={site.pages}
            initialFlags={flags}
            initialComments={comments}
            initialReview={review}
            neverPublished={site.currentPublicationId === null}
            /*
             * From the DRAFT read, not from `site`: both carry the same
             * server-side count, and the draft's is the one that was computed
             * after any write this request may have followed.
             */
            initialPendingChanges={draft?.pendingSectionChanges ?? null}
            initialSections={initialSections}
            siteName={site.name}
            initialStyle={site.style}
            styleOptions={site.styleOptions}
            address={site.subdomain ? `${site.subdomain}.${ROOT_DOMAIN}` : null}
        />
    );
}
