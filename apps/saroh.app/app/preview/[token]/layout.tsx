import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { SiteTheme } from "@saroh/site-blocks";

import { PreviewGone } from "@/components/preview-gone";
import { previewMenu } from "@/lib/in-page-menu";
import { KEEP_LINKS_INSIDE } from "@/lib/preview-links";
import { getPreviewByToken } from "@/lib/publication";
import { SITE_FACES } from "@/lib/site-fonts";
import { previewIconMetadata } from "@/lib/site-icon";
import { SiteFooter, SiteHeader } from "@saroh/site-blocks";

/**
 * A draft, shown to whoever holds the link (#198).
 *
 * Lives on this service's own apex — https://saroh.app/preview/<token> — so
 * it needs no tenant hostname and works for a site that has never been
 * published. The draft is built by the same snapshot builder publish uses,
 * so what the reviewer sees is what publish would write, drawn by the same
 * chrome and sections as the live site.
 *
 * READS UNMISTAKABLY AS NOT LIVE. The bar at the top is persistent chrome,
 * not a dismissible banner; the page is `noindex`; there is no share card,
 * so a link pasted into a chat does not unfurl looking like the real site.
 * Every internal link is kept inside the preview — the menu by construction,
 * everything else by the small script at the bottom — because a reviewer who
 * clicks "About" and lands on the live site (or a 404) will review the wrong
 * thing.
 */

/** One read of the draft for the layout and its metadata. */
const readPreview = cache(getPreviewByToken);

/**
 * The tab shows the icon publishing would (DEC-121): the draft's own, else
 * the business logo, else the plain tile with the site's initial. A dead
 * link has none.
 */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ token: string }>;
}): Promise<Metadata> {
    const { token } = await params;
    const preview = await readPreview(token);
    return {
        title: "Draft preview",
        robots: { index: false, follow: false },
        ...(preview.ok
            ? {
                  icons: previewIconMetadata(preview.icon, {
                      name: preview.snapshot.site.name,
                      variables: preview.snapshot.site.styleVariables,
                  }),
              }
            : {}),
    };
}

export default async function PreviewLayout({
    params,
    children,
}: {
    params: Promise<{ token: string }>;
    children: React.ReactNode;
}) {
    const { token } = await params;
    const preview = await readPreview(token);

    if (!preview.ok) {
        if (preview.reason === "missing") notFound();
        return <PreviewGone reason={preview.reason} />;
    }

    const base = `/preview/${encodeURIComponent(token)}`;
    const { snapshot, siteName, expiresAt, modules } = preview;
    // Less entries to home sections with nothing to show now (G10, G9…).
    const navigation = await previewMenu(snapshot, preview.siteId, token);

    return (
        <div className="min-h-screen bg-site-bg text-site-body">
            <PreviewBar siteName={siteName} expiresAt={expiresAt} />
            <SiteTheme
                variables={snapshot.site.styleVariables}
                faces={SITE_FACES}
            />
            <SiteHeader
                name={snapshot.site.name}
                navigation={navigation}
                // The menu the live site would draw now (G19): a module
                // page whose module is off is out of it here too.
                modules={modules}
                basePath={base}
            />

            <div>{children}</div>

            <SiteFooter
                footer={snapshot.site.footer}
                name={snapshot.site.name}
            />
            <KeepLinksInside base={base} />
        </div>
    );
}

/** "Stops working on 11 September 2026", pinned to one locale and zone. */
function longDate(iso: string): string {
    return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    }).format(new Date(iso));
}

/**
 * The persistent bar. Deliberately NOT in the site's own palette: it is Saroh
 * speaking about the site, not part of the site, and it must stay legible on
 * any ground the merchant chose.
 */
function PreviewBar({
    siteName,
    expiresAt,
}: {
    siteName: string;
    expiresAt: string;
}) {
    return (
        <div
            role="status"
            className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-neutral-900 px-4 py-2 text-xs text-neutral-100"
        >
            <span>
                <strong className="font-semibold">Draft preview</strong> of{" "}
                {siteName} — not live. What you see is the current draft, and it
                changes when the draft does.
            </span>
            <span className="text-neutral-400">
                This link stops working on {longDate(expiresAt)}.
            </span>
        </div>
    );
}

/** The click handler in `lib/preview-links.ts` (UX-069), given the base. */
function KeepLinksInside({ base }: { base: string }) {
    return (
        <script
            data-preview-base={base}
            dangerouslySetInnerHTML={{ __html: KEEP_LINKS_INSIDE }}
        />
    );
}
