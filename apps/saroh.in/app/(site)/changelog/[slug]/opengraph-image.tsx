import { entryDate, findEntry } from "@/content/changelog";
import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "@/lib/og-card";

/** Each changelog entry's share card: "Changelog · 17 Oct 2026" and its title. */
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export async function generateImageMetadata({
    params,
}: {
    params: { slug: string } | Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const entry = findEntry(slug);
    return [
        {
            id: "card",
            alt: entry ? `Saroh changelog: ${entry.title}` : "Saroh changelog",
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
    const entry = findEntry(slug);
    if (!entry) return ogCard({ eyebrow: "Changelog", title: "Saroh" });
    return ogCard({
        eyebrow: `Changelog · ${entryDate(entry.publishOn)}`,
        title: entry.title,
    });
}
