import { FeaturePoints as Points } from "@saroh/marketing/feature-points";
import { FeatureUsedBy as UsedBy } from "@saroh/marketing/feature-used-by";
import { FeatureWorksWith as WorksWith } from "@saroh/marketing/feature-works-with";

import { featureHref, features } from "@/content/features";
import { solutions } from "@/content/solutions";
import type { Feature } from "@/content/types";
import type { LaunchMode } from "@/lib/links";
import { solutionLink } from "@/lib/search-pages";

/**
 * "What it does". A point's `openNote` (what a plan has to do with it) is
 * added only once the launch switch is open (DEC-136).
 */
export function FeaturePoints({
    feature,
    mode,
}: {
    feature: Feature;
    mode: LaunchMode;
}) {
    return (
        <Points
            points={feature.points.map((point) => ({
                title: point.title,
                body:
                    mode === "open" && point.openNote
                        ? `${point.body} ${point.openNote}`
                        : point.body,
            }))}
        />
    );
}

/** "Works with": a card for each feature it works with. */
export function FeatureWorksWith({ feature }: { feature: Feature }) {
    return (
        <WorksWith
            lead={feature.worksLead}
            items={feature.worksWith.map((slug) => ({
                href: featureHref(slug),
                title: features[slug].name,
                body: features[slug].cardLine,
            }))}
        />
    );
}

/** "Used by": a chip for each solution page the feature serves. */
export function FeatureUsedBy({ feature }: { feature: Feature }) {
    return (
        <UsedBy
            items={feature.usedBy.map((slug) => ({
                href: solutionLink(slug),
                name: solutions[slug].longName,
            }))}
        />
    );
}
