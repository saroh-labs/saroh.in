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
        <div>
            <header className="ease left-0 right-0 top-0 z-30 flex h-16 bg-white transition-all duration-150 dark:bg-black dark:text-white">
                <div className="mx-auto flex h-full max-w-screen-xl items-center justify-center space-x-5 px-10 sm:px-20">
                    <Link href="/" className="flex items-center justify-center">
                        <span className="font-title inline-block truncate font-medium">
                            {snapshot.site.name}
                        </span>
                    </Link>
                </div>
            </header>

            <div className="mt-20">{children}</div>
        </div>
    );
}
