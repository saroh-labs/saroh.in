import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "@/lib/og-card";
import { HELP_CARDS } from "@/lib/og-cards.gen";

/** Each Help article's share card: "Help · Products" and its title. */
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export async function generateImageMetadata({
    params,
}: {
    params: { slug: string } | Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const article = HELP_CARDS[slug];
    return [
        {
            id: "card",
            alt: article ? `Saroh help: ${article.title}` : "Saroh help",
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
    const article = HELP_CARDS[slug];
    if (!article) return ogCard({ eyebrow: "Help", title: "Saroh" });
    return ogCard({ eyebrow: `Help · ${article.area}`, title: article.title });
}
