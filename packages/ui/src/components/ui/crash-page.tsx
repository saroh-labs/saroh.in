import type { CrashBrand } from "../../lib/crash-page";
import { CRASH_COPY, crashPageCss } from "../../lib/crash-page";
import { Wordmark } from "./wordmark";

/**
 * The error page for when no stylesheet can be trusted: every app's
 * `global-error.tsx` (the root layout threw, so Next renders this in place of
 * the whole document, without the layout's CSS or fonts), and the error
 * boundaries of the Nextra apps (help, docs), which have no Tailwind build
 * for `@saroh/ui`.
 *
 * The same eyebrow, heading, sentence and way on as `ErrorPage`, drawn from
 * one inline `<style>` (`crashPageCss`, shared with the Worker's static crash
 * page). `brand="neutral"` is for merchant sites: no wordmark, no Saffron,
 * SiteTheme's stone defaults.
 *
 * Plain `<a>` for the way home, not `next/link`: when the root layout has
 * failed, a full page load is the surest way on.
 */
export interface CrashPageProps {
    brand?: CrashBrand;
    onRetry?: () => void;
    homeHref?: string;
    homeLabel?: string;
    digest?: string;
    eyebrow?: string;
    title?: string;
    description?: string;
    /**
     * Drawn inside another app's page rather than as the whole screen: no
     * full-height ground of its own.
     */
    inline?: boolean;
}

export function CrashPage({
    brand = "saroh",
    onRetry,
    homeHref,
    homeLabel = "Back to home",
    digest,
    eyebrow,
    title,
    description,
    inline = false,
}: CrashPageProps) {
    const copy = CRASH_COPY[brand];
    // Inline, the host page has its own <main> and its own wordmark.
    const Root = inline ? "div" : "main";
    return (
        <Root
            className={inline ? "saroh-crash crash-inline" : "saroh-crash"}
            data-crash-page={brand}
        >
            <style>{crashPageCss(brand)}</style>
            <section aria-labelledby="crash-title">
                {brand === "saroh" && !inline ? (
                    <div className="crash-mark">
                        <Wordmark style={{ fontSize: "1.25rem" }} />
                    </div>
                ) : null}
                <p className="crash-eyebrow">{eyebrow ?? copy.eyebrow}</p>
                <h1 id="crash-title">{title ?? copy.title}</h1>
                <p className="crash-sentence">
                    {description ?? copy.description}
                </p>
                {onRetry || homeHref ? (
                    <div className="crash-actions">
                        {onRetry ? (
                            <button
                                type="button"
                                className="crash-action"
                                onClick={onRetry}
                            >
                                Try again
                            </button>
                        ) : null}
                        {homeHref ? (
                            <a
                                className={
                                    onRetry
                                        ? "crash-action secondary"
                                        : "crash-action"
                                }
                                href={homeHref}
                            >
                                {homeLabel}
                            </a>
                        ) : null}
                    </div>
                ) : null}
                {digest ? (
                    <p className="crash-ref">Reference: {digest}</p>
                ) : null}
            </section>
        </Root>
    );
}

/** `CrashPage` as a whole document, for `global-error.tsx`. */
export function CrashDocument({ title, ...props }: CrashPageProps) {
    const brand = props.brand ?? "saroh";
    const heading = title ?? CRASH_COPY[brand].title;
    return (
        <html lang="en">
            <head>
                <title>{heading}</title>
                <meta name="robots" content="noindex" />
            </head>
            <body style={{ margin: 0 }}>
                <CrashPage title={heading} {...props} />
            </body>
        </html>
    );
}
