import { NotFound } from "@saroh/ui/not-found";
import type { Metadata } from "next";

import { SiteChrome } from "@/components/v2/site-chrome";
import { helpLive } from "@/lib/help-live";
import { resourcesContext } from "@/lib/resources-context";

export const metadata: Metadata = {
    title: "Page not found · Saroh",
};

/**
 * saroh.in's 404, for every address the site has no page for. The site is
 * static, so this is prerendered at build like any page and served by the
 * Worker for whatever it can't match. It renders under the root layout only,
 * so it draws the V2 nav and footer itself, and the visitor keeps every way
 * on the site offers.
 *
 * Help is the second way on once Help is shown (`helpLive`, 17 Oct); before
 * that `/help` isn't published, so the page offers home alone.
 */
export default function NotFoundPage() {
    const help = helpLive(resourcesContext());
    return (
        <SiteChrome>
            <NotFound
                title="Page not found"
                description="There's no page at this address. The link may be old or mistyped."
                primary={{ href: "/", label: "Go to the home page" }}
                secondary={help ? { href: "/help", label: "Help" } : undefined}
            />
        </SiteChrome>
    );
}
