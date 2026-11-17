import type { SlugPageProps as Props } from "@saroh/marketing/content-types";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { KeepPage } from "@/components/feature-pages/keep-page";
import { BESPOKE } from "@/components/feature-pages/registry";
import { JsonLd } from "@/components/shared/layout/json-ld";
import type { KeepSlug } from "@/content/feature-keep";
import { KEEP, KEEP_SLUGS } from "@/content/feature-keep";
import {
    featureHref,
    featureList,
    features,
    isFeatureSlug,
} from "@/content/features";
import { HOW_IT_WORKS } from "@/content/how-it-works";
import { pageMetadata, pageTitle } from "@/lib/seo";
import { breadcrumbLd } from "@/lib/structured-data";

/**
 * The feature pages, by kind (DEC-221): a record feature is a Keep page
 * (`KeepPage`, the Orders template); Website, Share, Ask AI and AI apps each
 * draw their own (`components/feature-pages/registry.ts`). Built at build
 * time, the shown features only; any other slug is a 404.
 */
export const dynamicParams = false;

export function generateStaticParams() {
    // Only the shown features: a switched-off one is never built (404).
    return featureList.map((f) => ({ slug: f.slug }));
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

const isKeep = (slug: string): slug is KeepSlug =>
    (KEEP_SLUGS as readonly string[]).includes(slug);

export default async function FeaturePage({ params }: Props) {
    const { slug } = await params;
    if (!isFeatureSlug(slug)) notFound();
    // Called, not rendered, so the page is one async component (and testable).
    const body = isKeep(slug)
        ? await KeepPage({ slug })
        : await BESPOKE[slug]();
    return (
        <>
            {/* The trail the hero draws: How it works / {name}. */}
            <JsonLd
                data={breadcrumbLd([
                    { name: KEEP.crumb, path: HOW_IT_WORKS.href },
                    { name: features[slug].name, path: featureHref(slug) },
                ])}
            />
            {body}
        </>
    );
}
