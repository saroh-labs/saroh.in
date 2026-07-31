import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getPublicationForHost } from "@/lib/publication";

/**
 * Tenant site layout (S2-006).
 *
 * Middleware rewrites an incoming tenant hostname to `/[domain]/<path>`, so the
 * `domain` route param IS the full request hostname (e.g. `demo.saroh.in`). We
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

    const title = snapshot.site.name;
    return {
        title,
        openGraph: { title },
        twitter: { card: "summary_large_image", title },
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
            <SiteTheme />
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
 * Per-publication theme.
 *
 * These sections used to hardcode ~136 `stone-*` classes, so every merchant's
 * site rendered in the same greys with no way to express their own brand. The
 * `--site-*` layer makes the palette data rather than markup: the defaults below
 * reproduce the previous stone values exactly (this is a visual no-op today),
 * and when the publication snapshot starts carrying brand fields this component
 * interpolates them instead — no further component churn.
 *
 * Deliberately NOT Saroh's brand tokens: this subtree is the merchant's website,
 * not a Saroh surface.
 */
function SiteTheme() {
    return (
        <style>{`
            :root {
                --site-bg: 0 0% 100%;
                --site-surface: 0 0% 100%;
                --site-fg: 24 10% 10%;
                --site-body: 25 5% 45%;
                --site-muted: 24 6% 56%;
                --site-border: 20 6% 90%;
                --site-accent: 24 10% 10%;
                --site-accent-fg: 0 0% 100%;
            }
            @media (prefers-color-scheme: dark) {
                :root {
                    --site-bg: 0 0% 0%;
                    --site-surface: 24 6% 10%;
                    --site-fg: 0 0% 100%;
                    --site-body: 24 6% 83%;
                    --site-muted: 24 5% 64%;
                    --site-border: 25 6% 26%;
                    --site-accent: 0 0% 100%;
                    --site-accent-fg: 24 10% 10%;
                }
            }
        `}</style>
    );
}
