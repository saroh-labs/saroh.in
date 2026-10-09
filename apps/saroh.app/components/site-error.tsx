import Link from "next/link";

import { ctaClasses } from "@saroh/site-blocks";

/**
 * A page on a merchant's site that didn't load: the 5xx twin of
 * `SiteNotFound` (`site-not-found.tsx`), with the same eyebrow, heading,
 * sentence and way on, so a visitor meets one family of pages.
 *
 * Drawn from the `--site-*` layer, never Saroh's brand. Inside `[domain]`
 * and `preview/[token]` the site's own palette, header and footer are in
 * scope; at the root (`app/error.tsx`), where the site's layout is what
 * failed, `ground` gives it SiteTheme's neutral ground for the whole screen.
 *
 * Names nothing about what failed — a visitor can't act on "the publication
 * read timed out" — and shows only Next's digest, as a reference.
 */
export function SiteError({
    onRetry,
    home = true,
    ground = false,
    digest,
}: {
    /** Next's `retry`. */
    onRetry: () => void;
    /** "Back to home": off where the site's home is what failed. */
    home?: boolean;
    /** Fill the screen with the site's ground (the root, outside the layout). */
    ground?: boolean;
    digest?: string;
}) {
    const page = (
        <main
            className={`mx-auto flex w-full max-w-screen-sm flex-col items-center justify-center px-4 py-16 text-center sm:px-5 ${ground ? "min-h-screen" : "min-h-[60vh]"}`}
        >
            <p className="font-site-mono text-xs uppercase tracking-[0.2em] text-site-muted">
                Something went wrong
            </p>
            <h1 className="mt-4 font-site-heading text-3xl font-bold tracking-tight text-site-fg sm:text-4xl">
                This page isn&rsquo;t loading
            </h1>
            <p className="mt-3 max-w-md text-base text-site-body">
                It&rsquo;s usually temporary, so try again in a moment.
            </p>
            <div className="mt-8 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-center">
                <button
                    type="button"
                    onClick={onRetry}
                    className={ctaClasses("primary")}
                >
                    Try again
                </button>
                {home ? (
                    <Link href="/" className={ctaClasses("secondary")}>
                        Back to home
                    </Link>
                ) : null}
            </div>
            {digest ? (
                <p className="mt-6 font-site-mono text-xs text-site-muted">
                    Reference: {digest}
                </p>
            ) : null}
        </main>
    );

    // The root layout's body has no ground; a dark preference would
    // otherwise leave white margins (as `NoSiteHere`).
    return ground ? (
        <div className="min-h-screen bg-site-bg text-site-body">{page}</div>
    ) : (
        page
    );
}
