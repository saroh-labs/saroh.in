import { templatesPage } from "@/content/templates";
import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "@/lib/og-card";
import { resourcesContext } from "@/lib/resources-context";
import { templatesLive } from "@/lib/templates-live";

/**
 * The gallery's share card: "Resources · Templates" and its title. A 404
 * while the gallery isn't shown (DEC-135), as the page is.
 */
export const alt = `Saroh templates: ${templatesPage.title}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
    if (!templatesLive(resourcesContext())) {
        return new Response(null, { status: 404 });
    }
    return ogCard({
        eyebrow: "Resources · Templates",
        title: templatesPage.title,
    });
}
