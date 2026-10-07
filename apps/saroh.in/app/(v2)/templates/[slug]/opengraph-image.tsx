import { galleryTemplate } from "@/content/templates";
import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "@/lib/og-card";

/** A template's share card: "Templates" and "{Name}: {idea}." Words only. */
export const alt = "A Saroh website template";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const t = galleryTemplate(slug);
    return ogCard({
        eyebrow: "Resources · Templates",
        title: t ? `${t.name}: ${t.idea}.` : "Website templates",
    });
}
