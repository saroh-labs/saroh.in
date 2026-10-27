import { features, isFeatureSlug } from "@/content/features";
import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "@/lib/og-card";

/** Each feature page's share card: "Features · Orders" and its headline. */
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/** One card per page, with the page's own alt text. */
export async function generateImageMetadata({
    params,
}: {
    params: { slug: string } | Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const f = isFeatureSlug(slug) ? features[slug] : null;
    return [
        {
            id: "card",
            alt: f ? `Saroh ${f.name}: ${f.headline}` : "Saroh",
            size: OG_SIZE,
            contentType: OG_CONTENT_TYPE,
        },
    ];
}

export default async function Image({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    if (!isFeatureSlug(slug)) return ogCard({ title: "Saroh" });
    const f = features[slug];
    return ogCard({ eyebrow: `Features · ${f.name}`, title: f.headline });
}
