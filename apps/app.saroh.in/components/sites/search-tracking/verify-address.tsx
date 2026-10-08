"use client";

import { sitemapUrl } from "@/lib/sites/search-tracking";
import type { SiteAddress } from "@/lib/sites/share-links";

import { CopyValue, LineRow } from "./parts";

/**
 * The address a search console is told to check, and the sitemap it asks
 * for (DEC-108, U7): both the primary live address — the business's own
 * domain once it is live, else its address on Saroh. With both, a note
 * says which one to verify. Nothing without an address.
 */
export function VerifyAddress({ address }: { address: SiteAddress | null }) {
    if (!address) return null;
    const sitemap = sitemapUrl(address.url);
    const ownDomain = address.host !== address.platformHost;
    return (
        <>
            <LineRow
                label="Your live address"
                action={<CopyValue value={address.url} label="Address" />}
            >
                <span className="font-mono" data-live-address>
                    {address.url}
                </span>
            </LineRow>
            <LineRow
                label="Sitemap"
                action={<CopyValue value={sitemap} label="Sitemap address" />}
            >
                <span className="font-mono" data-sitemap>
                    {sitemap}
                </span>
                <span className="block text-muted-foreground">
                    Search consoles ask for it once your site is verified.
                </span>
            </LineRow>
            {ownDomain ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">
                    Your site also opens at {address.platformHost}. Verify{" "}
                    {address.host}, the address customers see.
                </p>
            ) : null}
        </>
    );
}
