import type { InTheAppData } from "@saroh/marketing/feature-pages/reach/in-the-app";

import { featureHelpLinks } from "@/content/feature-help";
import { KEEP } from "@/content/feature-keep";
import { features } from "@/content/features";
import { summarise } from "@/content/help";
import { HOW_IT_WORKS } from "@/content/how-it-works";
import { solutions } from "@/content/solutions";
import type { FeatureSlug } from "@/content/types";
import { helpArticles } from "@/lib/help-docs";
import { resourcesContext } from "@/lib/resources-context";
import { solutionLink } from "@/lib/search-pages";

/** The level above every Reach and Ask page: "Features", at /features. */
export const REACH_CRUMB = { name: KEEP.crumb, href: HOW_IT_WORKS.href };

/** A feature's name, for a "Works with" chip. */
export const featureName = (slug: string) => features[slug as FeatureSlug].name;

/**
 * What the shared "In the app" draws for a feature on saroh.in: its words
 * from `content/features.ts`, its live Help links and the trades using it.
 */
export function inTheAppData(slug: FeatureSlug, hide?: RegExp): InTheAppData {
    const feature = features[slug];
    return {
        feature,
        help: featureHelpLinks(
            slug,
            helpArticles().map(summarise),
            resourcesContext(),
        ),
        usedBy: feature.usedBy.map((s) => ({
            name: solutions[s].longName,
            href: solutionLink(s),
        })),
        hide,
    };
}
