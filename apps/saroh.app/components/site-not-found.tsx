import Link from "next/link";

import { ctaClasses } from "@saroh/site-blocks";

import type { NotFoundWay } from "@/lib/not-found-ways";

/**
 * A page that isn't on the merchant's site (`app/[domain]/not-found.tsx`).
 *
 * Drawn inside the site's own header and footer, in its `--site-*` palette
 * and type, never Saroh's brand: a visitor who followed a broken link is
 * still on the business's website, and the menu above lets them keep
 * browsing. Said in the business's voice ("we"), naming the site.
 */
export function SiteNotFound({
    siteName,
    secondary,
}: {
    /** The published site's name; null if the read found nothing. */
    siteName: string | null;
    /** The shop or contact page, only when the site has one. */
    secondary: NotFoundWay | null;
}) {
    return (
        <main className="mx-auto flex min-h-[60vh] w-full max-w-screen-sm flex-col items-center justify-center px-4 py-16 text-center sm:px-5">
            <p className="font-site-mono text-xs uppercase tracking-[0.2em] text-site-muted">
                Page not found
            </p>
            <h1 className="mt-4 font-site-heading text-3xl font-bold tracking-tight text-site-fg sm:text-4xl">
                We can&rsquo;t find that page
            </h1>
            <p className="mt-3 max-w-md text-base text-site-body">
                {siteName
                    ? `There’s no page at this address on ${siteName}. It may have moved, or the link may have a typo.`
                    : "There’s no page at this address. It may have moved, or the link may have a typo."}
            </p>
            <div className="mt-8 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-center">
                <Link href="/" className={ctaClasses("primary")}>
                    Back to home
                </Link>
                {secondary ? (
                    <Link
                        href={secondary.href}
                        className={ctaClasses("secondary")}
                    >
                        {secondary.label}
                    </Link>
                ) : null}
            </div>
        </main>
    );
}

/**
 * No website at this address (`app/not-found.tsx`): an unknown host, or a
 * site that is unpublished or paused, so there is no merchant to speak for.
 *
 * Neutral and unbranded: the root boundary mounts `SiteTheme` on its stone
 * defaults (which follow the visitor's light or dark preference). No Saroh
 * mark, colour or face: whoever typed this address came for a business, not
 * for us. No button either: this host has no home page to go back to.
 */
export function NoSiteHere() {
    return (
        // The whole viewport takes the ground: the root layout's body has
        // none, and a dark preference would otherwise leave white margins.
        <div className="min-h-screen bg-site-bg text-site-body">
            <main className="mx-auto flex min-h-screen w-full max-w-screen-sm flex-col items-center justify-center px-4 py-16 text-center sm:px-5">
                <p className="font-site-mono text-xs uppercase tracking-[0.2em] text-site-muted">
                    Nothing here
                </p>
                <h1 className="mt-4 font-site-heading text-3xl font-bold tracking-tight text-site-fg sm:text-4xl">
                    There&rsquo;s no website at this address
                </h1>
                <p className="mt-3 max-w-md text-base text-site-body">
                    Check the address for a typo. If this is the right one, the
                    website may not be published yet, or may be offline for now.
                </p>
            </main>
        </div>
    );
}
