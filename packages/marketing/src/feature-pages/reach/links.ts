import type { PageSite } from "../site";

/**
 * A "Works with" chip for each feature this build shows, in the order
 * given, so a switched-off page is never linked. A chip may carry the
 * board's own name for it ("Payments" for Billing).
 */
export function shownChips(
    site: PageSite,
    featureName: (slug: string) => string,
    items: readonly (string | readonly [string, string])[],
): { name: string; href: string }[] {
    return items.flatMap((entry) => {
        const [slug, name] = typeof entry === "string" ? [entry] : entry;
        const href = site.featureHref(slug);
        return href ? [{ name: name ?? featureName(slug), href }] : [];
    });
}
