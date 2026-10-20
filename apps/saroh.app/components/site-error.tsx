import type { LookId } from "@saroh/block-contract";
import { ctaClasses, frontButton, SitePageMessage } from "@saroh/site-blocks";
import Link from "next/link";

/**
 * A page on a merchant's site that didn't load: the 5xx twin of
 * `SiteNotFound` (`site-not-found.tsx`), in the same frame
 * (`SitePageMessage`) with the same eyebrow, heading, sentence and way on,
 * so a visitor meets one family of pages.
 *
 * Drawn from the `--site-*` layer, never Saroh's brand. Inside `[domain]`
 * and `preview/[token]` the site's own palette, type, header and footer are
 * in scope (the layout's `SiteTheme` is above the boundary); at the root
 * (`app/error.tsx`), where the site's layout is what failed, `ground` gives
 * it SiteTheme's neutral ground for the whole screen.
 *
 * Names nothing about what failed — a visitor can't act on "the publication
 * read timed out" — and shows only Next's digest, as a reference.
 */
export function SiteError({
    onRetry,
    home = true,
    ground = false,
    digest,
    look,
}: {
    /** Next's `retry`. */
    onRetry: () => void;
    /** "Back to home": off where the site's home is what failed. */
    home?: boolean;
    /** Fill the screen with the site's ground (the root, outside the layout). */
    ground?: boolean;
    digest?: string;
    /**
     * Folio, Quiet or Live (DEC-172, U15; VA27 "Couldn't load"): the same
     * words and ways in the look's type, Try again the one filled button.
     * Absent is Classic, unchanged.
     */
    look?: LookId;
}) {
    const page = look ? (
        <SitePageMessage
            look={look}
            eyebrow="Something went wrong"
            title={<>This page didn&rsquo;t load</>}
            fill={ground}
            actions={
                <>
                    <button
                        type="button"
                        onClick={onRetry}
                        data-site-primary=""
                        className={frontButton(look, "fill")}
                    >
                        Try again
                    </button>
                    {home ? (
                        <Link href="/" className={frontButton(look, "link")}>
                            Back to home
                        </Link>
                    ) : null}
                </>
            }
            note={digest ? <>Reference: {digest}</> : null}
        >
            It&rsquo;s on our side, not yours. Try again in a moment.
        </SitePageMessage>
    ) : (
        <SitePageMessage
            eyebrow="Something went wrong"
            title={<>This page isn&rsquo;t loading</>}
            fill={ground}
            actions={
                <>
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
                </>
            }
            note={digest ? <>Reference: {digest}</> : null}
        >
            It&rsquo;s usually temporary, so try again in a moment.
        </SitePageMessage>
    );

    // The root layout's body has no ground; a dark preference would
    // otherwise leave white margins (as `NoSiteHere`).
    return ground ? (
        <div className="min-h-screen bg-site-bg text-site-body">{page}</div>
    ) : (
        page
    );
}
