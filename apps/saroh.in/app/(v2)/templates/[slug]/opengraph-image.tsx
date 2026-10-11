import { galleryTemplate } from "@/content/templates";
import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "@/lib/og-card";
import { resourcesContext } from "@/lib/resources-context";
import { templatesLive } from "@/lib/templates-live";

/**
 * A template's share card: "Templates" and "{Name}: {idea}." Words only.
 * A 404 while the gallery isn't shown (DEC-135), as the page is.
 */
export const alt = "A Saroh website template";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    if (!templatesLive(resourcesContext())) {
        return new Response(null, { status: 404 });
    }
    const t = galleryTemplate(slug);
    return ogCard({
        eyebrow: "Resources · Templates",
        title: t ? `${t.name}: ${t.idea}.` : "Website templates",
    });
}
