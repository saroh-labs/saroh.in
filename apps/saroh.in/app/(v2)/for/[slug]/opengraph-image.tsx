import { loadSearchPage } from "@saroh/search-pages";

import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "@/lib/og-card";

/** Each /for/ page's share card: "For salons" and its headline, as a solution page's. */
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export async function generateImageMetadata({
    params,
}: {
    params: { slug: string } | Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const p = loadSearchPage(slug);
    return [
        {
            id: "card",
            alt: p ? `Saroh for ${p.plural}: ${p.h1}` : "Saroh",
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
    const p = loadSearchPage(slug);
    if (!p) return ogCard({ title: "Saroh" });
    return ogCard({ eyebrow: `For ${p.plural}`, title: p.h1 });
}
