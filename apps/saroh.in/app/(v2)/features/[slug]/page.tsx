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
import { featureHref, features, isFeatureSlug } from "@/content/features";
import { shots } from "@/content/shots";
import { FEATURE_SLUGS } from "@/content/types";

/**
 * The eight feature pages (plan U22): ONE template, the Features design,
 * and eight data sets in `content/features.ts`. Built at build time; any
 * other slug is a 404.
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
    const hero = shots[feature.hero.shot];
    const images = hero.src
        ? [
              {
                  url: hero.src,
                  width: hero.width,
                  height: hero.height,
                  alt: feature.hero.alt,
              },
          ]
        : undefined;
    return {
        title: `${title} · Saroh`,
        description: feature.sub,
        alternates: { canonical: featureHref(slug) },
        openGraph: {
            type: "website",
            siteName: "Saroh",
            url: featureHref(slug),
            title,
            description: feature.sub,
            images,
        },
        twitter: {
            card: "summary_large_image",
            title,
            description: feature.sub,
            images: images?.map((i) => i.url),
        },
    };
}

export default async function FeaturePage({ params }: Props) {
    const { slug } = await params;
    if (!isFeatureSlug(slug)) notFound();
    const feature = features[slug];
    return (
        <>
            <FeatureHero feature={feature} />
            <FeatureSteps feature={feature} />
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
