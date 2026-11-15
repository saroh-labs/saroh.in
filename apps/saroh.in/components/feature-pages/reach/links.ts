import { featureHref, featureList, features } from "@/content/features";
import type { FeatureSlug } from "@/content/types";

/**
 * A "Works with" chip for each feature this build shows, in the order
 * given, so a switched-off page is never linked. A chip may carry the
 * board's own name for it ("Payments" for Billing).
 */
export function shownChips(
    items: readonly (FeatureSlug | [FeatureSlug, string])[],
): { name: string; href: string }[] {
    return items.flatMap((entry) => {
        const [slug, name] = Array.isArray(entry) ? entry : [entry];
        return featureList.some((f) => f.slug === slug)
            ? [{ name: name ?? features[slug].name, href: featureHref(slug) }]
            : [];
    });
}

/** A feature's page while this build shows it, else null (link nothing). */
export const shownHref = (slug: FeatureSlug): string | null =>
    featureList.some((f) => f.slug === slug) ? featureHref(slug) : null;
