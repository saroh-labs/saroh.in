import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "@/lib/og-card";
import { searchPageRoute } from "@/lib/search-page-route";

/** Each page's share card, from the build's generated words (never a file: the Worker draws it). */
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const route = searchPageRoute("guides");

export async function generateImageMetadata({
    params,
}: {
    params: { slug: string } | Promise<{ slug: string }>;
}) {
    const card = route.shareCard((await params).slug);
    return [
        {
            id: "card",
            alt: card?.alt ?? "Saroh",
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
    const card = route.shareCard((await params).slug);
    return ogCard(
        card
            ? { eyebrow: card.eyebrow, title: card.title }
            : { title: "Saroh" },
    );
}
