import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CtaBand } from "@/components/v2/cta-band";
import { FeatureHero } from "@/components/v2/feature/feature-hero";
import {
    FeaturePoints,
    FeatureUsedBy,
    FeatureWorksWith,
} from "@/components/v2/feature/feature-related";
import { FeatureSteps } from "@/components/v2/feature/feature-steps";
import { JsonLd } from "@/components/v2/json-ld";
import { featureHelpLinks } from "@/content/feature-help";
import { featureHref, features, isFeatureSlug } from "@/content/features";
import { summarise } from "@/content/help";
import { FEATURE_SLUGS } from "@/content/types";
import { helpArticles } from "@/lib/help-docs";
import { LAUNCH_MODE } from "@/lib/links";
import { freePlanLine } from "@/lib/plan-teasers";
import { readLivePricing } from "@/lib/pricing";
import { resourcesContext } from "@/lib/resources-context";
import { pageMetadata, pageTitle } from "@/lib/seo";
import { breadcrumbLd } from "@/lib/structured-data";

/**
 * The feature pages (plan U22): ONE template, the Features design, and a
 * data set each in `content/features.ts`. Built at build time; any
 * other slug is a 404. The "How to …" links to Help (plan U7) follow the
 * publish date: they are drawn by the first deploy made on or after the day
 * Help opens (`app/layout.tsx`; nothing rebuilds the site on a schedule).
 * The hero's free-plan line reads the pricing catalogue once the launch
 * switch is open (KTD-10); before that it is the line with no plan details
 * (`freePlanLine(null)`, Gate W).
 */
export const dynamicParams = false;

export function generateStaticParams() {
    return FEATURE_SLUGS.map((slug) => ({ slug }));
}

interface Props {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    if (!isFeatureSlug(slug)) return {};
    const feature = features[slug];
    // The search title says what the page is in plain words; the share
    // card keeps the page's own headline.
    return pageMetadata({
        title: pageTitle(feature.seoTitle),
        socialTitle: `${feature.name}: ${feature.headline}`,
        description: feature.seoDescription,
        path: featureHref(slug),
    });
}

export default async function FeaturePage({ params }: Props) {
    const { slug } = await params;
    if (!isFeatureSlug(slug)) notFound();
    const feature = features[slug];
    const catalog = LAUNCH_MODE === "open" ? await readLivePricing() : null;
    const help = featureHelpLinks(
        slug,
        helpArticles().map(summarise),
        resourcesContext(),
    );
    return (
        <>
            {/* The trail the hero draws: Features / {name}. */}
            <JsonLd
                data={breadcrumbLd([
                    { name: "Features", path: "/#features" },
                    { name: feature.name, path: featureHref(slug) },
                ])}
            />
            <FeatureHero feature={feature} freeLine={freePlanLine(catalog)} />
            <FeatureSteps feature={feature} help={help} />
            <FeaturePoints feature={feature} mode={LAUNCH_MODE} />
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
