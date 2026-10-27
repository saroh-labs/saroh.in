import { loadToolPage } from "@saroh/search-pages";

import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "@/lib/og-card";

/** Each free tool's share card: "Free tools" and its headline. */
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export async function generateImageMetadata({
    params,
}: {
    params: { slug: string } | Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const p = loadToolPage(slug);
    return [
        {
            id: "card",
            alt: p ? p.h1 : "Saroh",
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
    const p = loadToolPage(slug);
    if (!p) return ogCard({ title: "Saroh" });
    return ogCard({ eyebrow: "Free tools", title: p.h1 });
}
