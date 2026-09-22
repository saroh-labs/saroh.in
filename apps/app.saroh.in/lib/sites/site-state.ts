import { pendingChangeCount } from "@/lib/sites/pending";
import type { SiteSummary } from "@/lib/sites/service";

export type SiteStateTone = "live" | "draft" | "attention";

/**
 * The one most consequential true thing about a site (#191).
 *
 * Ranked, not concatenated: a name and an address look identical whether a site
 * is live, never published, or waiting on a DNS record, and those last two are
 * exactly the states that strand a site invisibly. So this says the thing that
 * matters most and stops.
 *
 * "Never published" outranks everything: that site does not exist to the
 * public, which no other state is as consequential as.
 */
export function siteState(site: SiteSummary): {
    label: string;
    tone: SiteStateTone;
} {
    if (!site.currentPublicationId) {
        return { label: "Never published", tone: "draft" };
    }
    if (site.pendingDomain) {
        // Published, but the domain they think they connected routes nowhere.
        return { label: "Live · domain pending", tone: "attention" };
    }
    /*
     * "Live · 3 things to look at" — the count is the same one the editor's top
     * bar and the settings screen show, computed once in the API (#190), plus
     * site-level settings (#282). Three surfaces quoting three numbers would be
     * worse than none of them quoting any.
     *
     * The fallback without a number covers the case where something is waiting
     * but no section differs: real, and not worth inventing a count for.
     */
    const pending = pendingChangeCount(
        site.pendingSectionChanges,
        site.pendingSiteChanges,
    );
    if (pending > 0) {
        return {
            label: `Live · ${pending} thing${pending === 1 ? "" : "s"} to look at`,
            tone: "attention",
        };
    }
    if (site.hasUnpublishedChanges) {
        return { label: "Live · unpublished changes", tone: "attention" };
    }
    return { label: "Live", tone: "live" };
}

export type PageState = "live" | "unpublished" | "hidden";

/**
 * What the public sees of one page.
 *
 * Publishing is whole-site, so a page has no publish state of its own: it is
 * live when the site has been published and it is not hidden. A hidden page is
 * left out of every snapshot (#197), whatever the site's state.
 */
export function pageState(
    page: { hidden: boolean },
    site: Pick<SiteSummary, "currentPublicationId">,
): { state: PageState; label: string } {
    if (page.hidden) return { state: "hidden", label: "Hidden" };
    if (!site.currentPublicationId) {
        return { state: "unpublished", label: "Not published yet" };
    }
    return { state: "live", label: "Live" };
}
