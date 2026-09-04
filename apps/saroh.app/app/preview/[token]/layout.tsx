import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SiteFooter, SiteHeader, SiteTheme } from "@/components/site-chrome";
import { getPreviewByToken } from "@/lib/publication";

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

export const metadata: Metadata = {
    title: "Draft preview",
    robots: { index: false, follow: false },
};

export default async function PreviewLayout({
    params,
    children,
}: {
    params: Promise<{ token: string }>;
    children: React.ReactNode;
}) {
    const { token } = await params;
    const preview = await getPreviewByToken(token);

    if (!preview.ok) {
        if (preview.reason === "missing") notFound();
        return <PreviewGone reason={preview.reason} />;
    }

    const base = `/preview/${encodeURIComponent(token)}`;
    const { snapshot, siteName, expiresAt } = preview;

    return (
        <div className="min-h-screen bg-site-bg text-site-body">
            <PreviewBar siteName={siteName} expiresAt={expiresAt} />
            <SiteTheme variables={snapshot.site.styleVariables} />
            <SiteHeader
                name={snapshot.site.name}
                navigation={snapshot.site.navigation ?? []}
                basePath={base}
            />

            <div>{children}</div>

            <SiteFooter footer={snapshot.site.footer} />
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

/** A dead link explains itself; it does not 404. */
function PreviewGone({ reason }: { reason: "expired" | "revoked" }) {
    return (
        <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6 text-neutral-900">
            <div className="max-w-md space-y-3 text-center">
                <p className="text-xs uppercase tracking-wide text-neutral-500">
                    Draft preview
                </p>
                <h1 className="text-xl font-semibold">
                    {reason === "revoked"
                        ? "This preview link was taken back."
                        : "This preview link has stopped working."}
                </h1>
                <p className="text-sm text-neutral-600">
                    {reason === "revoked"
                        ? "Whoever shared it with you turned it off. Ask them for a new one if you still need to look."
                        : "Preview links last a set number of days. Ask whoever shared it for a new one."}
                </p>
            </div>
        </main>
    );
}

/**
 * Rewrites a click on any root-relative link to stay under the preview. The
 * menu is already correct without this (the header takes a base path); this
 * covers buttons and links inside sections and rich text, whose targets are
 * the live site's paths. Without scripts those links leave the preview, and
 * the bar has already said the preview is not the live site.
 */
function KeepLinksInside({ base }: { base: string }) {
    const code = `document.addEventListener("click",function(e){var t=e.target;var a=t&&t.closest?t.closest("a[href]"):null;if(!a)return;var h=a.getAttribute("href");if(!h||h.charAt(0)!=="/"||h.indexOf("//")===0||h.indexOf(${JSON.stringify(base)})===0)return;a.setAttribute("href",${JSON.stringify(base)}+h);},true);`;
    return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
