import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getPublicationForHost } from "@/lib/publication";

/**
 * Tenant site layout (S2-006).
 *
 * Middleware rewrites an incoming tenant hostname to `/[domain]/<path>`, so the
 * `domain` route param IS the full request hostname (e.g. `demo.saroh.app`). We
 * resolve it to a publication via the public read API; a `null` snapshot means
 * nothing is published for this host (drafts are never reachable), so we render
 * a clean 404. There is no legacy DB / font mapping here — everything the
 * renderer draws from lives in the immutable publication snapshot.
 */

export async function generateMetadata({
    params,
}: {
    params: Promise<{ domain: string }>;
}): Promise<Metadata | null> {
    const { domain } = await params;
    const snapshot = await getPublicationForHost(domain);
    if (!snapshot) {
        return null;
    }

    /*
     * Search and social, from the snapshot (#188).
     *
     * These fields have travelled into every publication since #188 shipped and
     * nothing read them: a merchant could write a search title and a share
     * image, publish, and the page still went out titled with the bare site
     * name and no description at all.
     *
     * `seoTitle` FALLS BACK to the site name rather than replacing it
     * conditionally in the settings form — an empty search title means "I have
     * not written one", not "publish an empty <title>".
     */
    const { name, seoTitle, seoDescription, socialImageUrl } = snapshot.site;
    const title = seoTitle?.trim() ? seoTitle : name;
    const description = seoDescription?.trim() ? seoDescription : undefined;
    // `metadataBase` resolves a relative share image against the site's own
    // host, so a merchant may store either form.
    const images = socialImageUrl?.trim() ? [socialImageUrl] : undefined;

    return {
        title,
        description,
        openGraph: { title, description, images },
        twitter: {
            // Without an image this degrades to a plain summary card, so the
            // card type follows the picture rather than always claiming one.
            card: images ? "summary_large_image" : "summary",
            title,
            description,
            images,
        },
        metadataBase: new URL(`https://${domain}`),
    };
}

export function generateStaticParams() {
    // No DB here — domains are rendered on demand. Pre-rendering returns once
    // api exposes a list-domains endpoint for the renderer to enumerate.
    return [] as { params: { domain: string } }[];
}

export default async function SiteLayout({
    params,
    children,
}: {
    params: Promise<{ domain: string }>;
    children: React.ReactNode;
}) {
    const { domain } = await params;
    const snapshot = await getPublicationForHost(domain);

    if (!snapshot) {
        notFound();
    }

    return (
        <div className="min-h-screen bg-site-bg text-site-body">
            <SiteTheme variables={snapshot.site.styleVariables} />
            <header className="left-0 right-0 top-0 z-30 flex h-16 border-b border-site-border bg-site-surface">
                <div className="mx-auto flex h-full max-w-screen-xl items-center justify-center space-x-5 px-10 sm:px-20">
                    <Link href="/" className="flex items-center justify-center">
                        <span className="inline-block truncate text-lg font-medium tracking-tight text-site-fg">
                            {snapshot.site.name}
                        </span>
                    </Link>
                </div>
            </header>

            <div>{children}</div>
        </div>
    );
}

/**
 * Per-publication theme (#189).
 *
 * The merchant's six colour choices and five spacing scalars, already resolved
 * into `--site-*` custom properties by the publisher and carried in the
 * snapshot. Until now this component hardcoded the stone defaults with a note
 * saying it would interpolate brand fields "once the snapshot carries them" —
 * the snapshot has carried them since #189, and the live site went on showing
 * greys no merchant chose while the editor preview showed their actual palette.
 *
 * The defaults below are still the fallback, and they matter: publications are
 * immutable, so every site published before #189 has no `styleVariables` at all
 * and must keep rendering exactly as it always has.
 *
 * Deliberately NOT Saroh's brand tokens: this subtree is the merchant's
 * website, not a Saroh surface.
 */
function SiteTheme({
    variables,
}: {
    variables?: Record<string, string> | null;
}) {
    const custom = cssVariables(variables);

    return (
        <style>{`
            :root {
                --site-bg: 0 0% 100%;
                --site-surface: 0 0% 100%;
                --site-fg: 24 10% 10%;
                --site-accent: 24 10% 10%;
                --site-accent-fg: 0 0% 100%;
                --site-hero-bg: 0 0% 100%;
                --site-hero-fg: 24 10% 10%;
                --site-cta-bg: 24 10% 10%;
                --site-cta-fg: 0 0% 98%;
                --site-footer-bg: 24 10% 10%;
                --site-footer-fg: 0 0% 98%;
                --site-page-margin: 38px;
                --site-section-padding: 52px;
                --site-grid-gap: 14px;
                --site-radius: 2px;
                --site-heading-scale: 1;
            }
${
    custom === null
        ? /*
           * The OS dark preference applies ONLY to an unstyled site.
           *
           * A merchant who chose a paper ground chose it for everyone; flipping
           * their storefront to black because a visitor's laptop is in dark
           * mode overrides a decision they made deliberately, and it is not a
           * decision this app is entitled to make on their behalf. Sites with
           * no palette keep the old behaviour, which is what they have always
           * had.
           */
          `            @media (prefers-color-scheme: dark) {
                :root {
                    --site-bg: 0 0% 0%;
                    --site-surface: 24 6% 10%;
                    --site-fg: 0 0% 100%;
                    --site-accent: 0 0% 100%;
                    --site-accent-fg: 24 10% 10%;
                    --site-hero-bg: 24 6% 10%;
                    --site-hero-fg: 0 0% 100%;
                    --site-cta-bg: 0 0% 100%;
                    --site-cta-fg: 24 10% 10%;
                    --site-footer-bg: 24 6% 10%;
                    --site-footer-fg: 0 0% 100%;
                }
            }`
        : `            :root {\n${custom}\n            }`
}
        `}</style>
    );
}

/**
 * Render a snapshot's style variables as CSS declarations, or null when there
 * are none worth writing.
 *
 * Both the name and the value are checked against a tight allowlist before
 * being interpolated. The values come from our own publisher and are resolved
 * from a curated palette, so nothing hostile is expected here — but this is
 * string interpolation into a `<style>` element, and a rule that only holds as
 * long as every upstream writer stays well-behaved is not a rule. A property
 * that fails the check is dropped, so a bad value costs its own colour rather
 * than the whole stylesheet.
 */
function cssVariables(
    variables: Record<string, string> | null | undefined,
): string | null {
    if (!variables) return null;
    const safeName = /^--site-[a-z-]+$/;
    // HSL triples ("18 45% 45%"), lengths ("38px") and bare scales ("1.05").
    const safeValue = /^[a-zA-Z0-9 .%]{1,64}$/;

    const declarations = Object.entries(variables)
        .filter(
            ([name, value]) =>
                safeName.test(name) &&
                typeof value === "string" &&
                safeValue.test(value),
        )
        .map(([name, value]) => `                ${name}: ${value};`);

    return declarations.length > 0 ? declarations.join("\n") : null;
}
