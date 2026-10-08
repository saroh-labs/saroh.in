import { templatesPage } from "@/content/templates";
import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "@/lib/og-card";

/** The gallery's share card: "Resources · Templates" and its title. */
export const alt = `Saroh templates: ${templatesPage.title}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
    return ogCard({
        eyebrow: "Resources · Templates",
        title: templatesPage.title,
    });
}
