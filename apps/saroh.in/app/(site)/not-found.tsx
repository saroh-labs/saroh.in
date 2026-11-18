import { NotFound } from "@saroh/ui/not-found";
import type { Metadata } from "next";

import { helpLive } from "@/lib/help-live";
import { resourcesContext } from "@/lib/resources-context";

export const metadata: Metadata = {
    title: "Page not found · Saroh",
};

/**
 * saroh.in's 404. Here, for a page that answers not-found (`notFound()`), it
 * sits in `(site)`'s chrome; for an address with no page at all,
 * `app/global-not-found.tsx` draws it in Saroh's document and the same
 * chrome (the groups are each a root layout, KD11). The site is static, so
 * both are prerendered at build and served by the Worker. The visitor keeps
 * every way on the site offers.
 *
 * Help is the second way on once Help is shown (`helpLive`, 17 Oct); before
 * that `/help` isn't published, so the page offers home alone.
 */
export default function NotFoundPage() {
    const help = helpLive(resourcesContext());
    return (
        <NotFound
            title="Page not found"
            description="There's no page at this address. The link may be old or mistyped."
            primary={{ href: "/", label: "Go to the home page" }}
            secondary={help ? { href: "/help", label: "Help" } : undefined}
        />
    );
}
