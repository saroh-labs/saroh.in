import type { FeatureSlug } from "@saroh/marketing/content-types";
import type { InTheAppData } from "@saroh/marketing/feature-pages/reach/in-the-app";

import { features } from "@/content/features";
import type { HelpArticle } from "@/content/help";
import { HELP } from "@/content/help";
import { solutionHref, solutions } from "@/content/solutions";

/** The level above every Reach and Ask page: "Features", at /features. */
export const REACH_CRUMB = { name: "Features", href: "/features" };

/** A feature's name, for a "Works with" chip. */
export const featureName = (slug: string) => features[slug as FeatureSlug].name;

/** Each page's Help articles: its group in Help, shown only while built. */
const HELP_GROUP: Partial<Record<FeatureSlug, HelpArticle["group"]>> = {
    website: "Your website",
    social: "Share and posts",
    "ai-apps": "AI apps",
};

/**
 * What the shared "In the app" draws for a feature on saroh.tech: its words
 * from `content/features.ts` (with what works today, for a Limited one),
 * its Help articles as "How to …" links and the solutions using it.
 */
export function inTheAppData(slug: FeatureSlug): InTheAppData {
    const feature = features[slug];
    const group = HELP_GROUP[slug];
    return {
        feature: {
            ...feature,
            worksToday:
                feature.state === "full" ? undefined : feature.worksToday,
        },
        help: HELP.filter((a) => a.group === group).map((a) => ({
            href: `/help/${a.slug}`,
            label: `How to ${a.task.charAt(0).toLowerCase()}${a.task.slice(1)}`,
        })),
        usedBy: feature.usedBy.map((s) => ({
            name: solutions[s].longName,
            href: solutionHref(s),
        })),
    };
}
