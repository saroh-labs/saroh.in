import { notFound, redirect } from "next/navigation";

import { SiteEditor } from "@/components/sites/site-editor";
import { env } from "@/env";
import { requireSession } from "@/lib/session";
import { parseSectionContent } from "@saroh/block-contract";

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

    /*
     * Someone who may read the site but not author it gets a different screen
     * (#275), in the shell, where they keep their navigation: this group is
     * deliberately chrome-less, which is right for a three-pane editor and
     * wrong for someone reading and commenting.
     *
     * A redirect rather than a render, so the link an owner shares — this one —
     * works for whoever opens it.
     */
    if (!site.can.edit) redirect(`/sites/${siteId}/review`);

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
    /*
     * Checked against the block contract, not cast into it (#275).
     *
     * This used to `as Section` whatever the API returned, so a row that had
     * drifted from its contract — written by an older build, or by a path that
     * did not validate — reached the field components as a shape they promise
     * they have. What the merchant then saw depended on which field was read
     * first: a blank input, or a crash inside the preview.
     *
     * A section that fails is kept and flagged rather than dropped: it is the
     * merchant's work, and silently removing it from the editor would delete it
     * on the next save.
     *
     * `order` is dropped because array position is the order. Everything else
     * travels — `hidden` in particular, because a field lost here would come
     * back visible after a reload and republish work taken off the site.
     */
    const parsed = (draft?.sections ?? []).map(
        ({ type, contractVersion, content, hidden, key }) => ({
            section: { type, contractVersion, content, hidden, key } as Section,
            valid: parseSectionContent(type, contractVersion, content).success,
        }),
    );
    const initialSections: Section[] = parsed.map((p) => p.section);
    const unreadableSections = parsed
        .filter((p) => !p.valid)
        .map((p) => p.section.key)
        .filter((key): key is string => key !== undefined);

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
            // Which edit of the draft these sections are (#285); the editor
            // sends it back on every save.
            initialRevision={draft?.revision ?? 0}
            // Sections whose stored content no longer matches their contract
            // (#275). Named so the editor can say which, rather than letting a
            // field component meet a shape it was promised it would not.
            unreadableSections={unreadableSections}
            /*
             * From the DRAFT read, not from `site`: both carry the same
             * server-side count, and the draft's is the one that was computed
             * after any write this request may have followed.
             */
            initialPendingChanges={draft?.pendingSectionChanges ?? null}
            initialPendingSiteChanges={draft?.pendingSiteChanges ?? null}
            initialSections={initialSections}
            siteName={site.name}
            initialStyle={site.style}
            styleOptions={site.styleOptions}
            address={site.subdomain ? `${site.subdomain}.${ROOT_DOMAIN}` : null}
        />
    );
}
