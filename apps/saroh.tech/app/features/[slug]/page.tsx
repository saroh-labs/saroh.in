import type { SlugPageProps as Props } from "@saroh/marketing/content-types";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { KeepPage } from "@/components/feature-pages/keep-page";
import { BESPOKE } from "@/components/feature-pages/registry";
import { JsonLd } from "@/components/shared/json-ld";
import { isKeep } from "@/content/feature-keep";
import { featureList } from "@/content/features";
import { pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageAt } from "@/lib/site-map";

export const dynamicParams = false;

export function generateStaticParams() {
    // Only the shown features: a switched-off one is never built (404).
    return featureList.map((f) => ({ slug: f.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const page = pageAt(`/features/${slug}`);
    return page ? pageMetadata(page) : {};
}

/**
 * The feature pages, by kind (DEC-221), as saroh.in's: a record feature is
 * a Keep page (the Orders template, `components/feature-pages/keep-page.tsx`);
 * Website, Share, Ask AI and AI apps each draw their own
 * (`components/feature-pages/registry.ts`). All from `@saroh/marketing`,
 * with Global's words and world. Built at build time, the shown features
 * only; any other slug is a 404.
 */
export default async function FeaturePage({ params }: Props) {
    const { slug } = await params;
    const page = pageAt(`/features/${slug}`);
    if (!page) notFound();
    // Called, not rendered, so the page is one async component (and testable).
    const body = isKeep(slug)
        ? await KeepPage({ slug })
        : await BESPOKE[slug as keyof typeof BESPOKE]();
    return (
        <div data-page-type={page.type}>
            <JsonLd data={pageSchema(page)} />
            {body}
        </div>
    );
}
