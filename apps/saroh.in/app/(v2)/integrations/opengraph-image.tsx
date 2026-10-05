import { integrationsIndex } from "@/content/integrations";
import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "@/lib/og-card";

/** The Integrations page's share card: "Resources · Integrations" and its line. */
export const alt = `Saroh integrations: ${integrationsIndex.intro}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
    return ogCard({
        eyebrow: "Resources · Integrations",
        title: integrationsIndex.intro,
    });
}
