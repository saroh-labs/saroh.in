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
import { featureHelpLinks } from "@/content/feature-help";
import { featureHref, features, isFeatureSlug } from "@/content/features";
import { summarise } from "@/content/help";
import { FREE_PLAN_LINE } from "@/content/home";
import { FEATURE_SLUGS } from "@/content/types";
import { helpArticles } from "@/lib/help-docs";
import { resourcesContext } from "@/lib/resources-context";
import { pageMetadata } from "@/lib/seo";

/**
 * The eight feature pages (plan U22): ONE template, the Features design,
 * and eight data sets in `content/features.ts`. Built at build time; any
 * other slug is a 404. The "How to …" links to Help (plan U7) follow the
 * publish date: the root layout's five-minute revalidate brings them in on
 * the day Help opens, with no deploy (KTD-2).
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
    const title = `${feature.name} — ${feature.headline}`;
    return pageMetadata({
        title: `${title} · Saroh`,
        socialTitle: title,
        description: feature.sub,
        path: featureHref(slug),
    });
}

export default async function FeaturePage({ params }: Props) {
    const { slug } = await params;
    if (!isFeatureSlug(slug)) notFound();
    const feature = features[slug];
    const help = featureHelpLinks(
        slug,
        helpArticles().map(summarise),
        resourcesContext(),
    );
    return (
        <>
            <FeatureHero feature={feature} freeLine={FREE_PLAN_LINE} />
            <FeatureSteps feature={feature} help={help} />
            <FeaturePoints feature={feature} />
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
