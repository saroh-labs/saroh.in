import { AppList } from "@saroh/marketing/app-list";

import { FeatureHero } from "@/components/feature/feature-hero";
import {
    FeaturePoints,
    FeatureUsedBy,
    FeatureWorksWith,
} from "@/components/feature/feature-related";
import { FeatureSteps } from "@/components/feature/feature-steps";
import { FeatureTemplates } from "@/components/feature/feature-templates";
import { CtaBand } from "@/components/shared/sections/cta-band";
import { featureHelpLinks } from "@/content/feature-help";
import { features } from "@/content/features";
import { summarise } from "@/content/help";
import { shownIntegrations } from "@/content/integrations";
import type { FeatureSlug } from "@/content/types";
import { helpArticles } from "@/lib/help-docs";
import { LAUNCH_MODE } from "@/lib/links";
import { readLivePricing } from "@/lib/pricing";
import { resourcesContext } from "@/lib/resources-context";

/**
 * The feature page as it was before the redesign (plan U22), for the Reach
 * and Ask pages (Website, Share, Ask AI, AI apps) until their own designs
 * land: each one's stub in this folder draws it. Delete this file once none
 * of them does.
 */
export async function LegacyFeaturePage({ slug }: { slug: FeatureSlug }) {
    const feature = features[slug];
    const catalog = LAUNCH_MODE === "open" ? await readLivePricing() : null;
    const context = resourcesContext();
    const help = featureHelpLinks(slug, helpArticles().map(summarise), context);
    return (
        <>
            <FeatureHero feature={feature} catalog={catalog} />
            <FeatureSteps feature={feature} help={help} />
            {feature.templates && !context.off?.includes("templates") ? (
                <FeatureTemplates words={feature.templates} />
            ) : null}
            <FeaturePoints feature={feature} mode={LAUNCH_MODE} />
            {feature.apps ? (
                <AppList
                    words={feature.apps}
                    apps={shownIntegrations(context.off ?? []).filter(
                        (c) => c.category === "AI apps",
                    )}
                />
            ) : null}
            <FeatureWorksWith feature={feature} />
            <FeatureUsedBy feature={feature} />
            <CtaBand
                title={feature.closer}
                src={`feature-${slug}-band`}
                className="pt-[120px]"
            />
        </>
    );
}
