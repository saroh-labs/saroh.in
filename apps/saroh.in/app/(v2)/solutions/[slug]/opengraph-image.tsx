import { isSolutionSlug, solutions } from "@/content/solutions";
import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "@/lib/og-card";

/** Each solution page's share card: "For shops and bakeries" and its headline. */
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/** One card per page, with the page's own alt text. */
export async function generateImageMetadata({
    params,
}: {
    params: { slug: string } | Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const s = isSolutionSlug(slug) ? solutions[slug] : null;
    return [
        {
            id: "card",
            alt: s
                ? `Saroh for ${s.longName.toLowerCase()}: ${s.headline}`
                : "Saroh",
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
    if (!isSolutionSlug(slug)) return ogCard({ title: "Saroh" });
    const s = solutions[slug];
    return ogCard({
        eyebrow: `For ${s.longName.toLowerCase()}`,
        title: s.headline,
    });
}
