import { isIntegrationSlug } from "@/content/integrations";
import { integrationMeta } from "@/lib/integration-docs";
import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "@/lib/og-card";

/** Each integration page's share card: "Integrations · Razorpay" and its intro's lead. */
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/** The card's headline: the intro's first sentence. */
function headline(intro: string): string {
    return intro.split(/(?<=\.)\s/)[0] ?? intro;
}

/** One card per page, with the page's own alt text. */
export async function generateImageMetadata({
    params,
}: {
    params: { provider: string } | Promise<{ provider: string }>;
}) {
    const { provider } = await params;
    const fm = isIntegrationSlug(provider) ? integrationMeta(provider) : null;
    return [
        {
            id: "card",
            alt: fm ? `Saroh and ${fm.name}: ${headline(fm.intro)}` : "Saroh",
            size: OG_SIZE,
            contentType: OG_CONTENT_TYPE,
        },
    ];
}

export default async function Image({
    params,
}: {
    params: Promise<{ provider: string }>;
}) {
    const { provider } = await params;
    if (!isIntegrationSlug(provider)) return ogCard({ title: "Saroh" });
    const fm = integrationMeta(provider);
    return ogCard({
        eyebrow: `Integrations · ${fm.name}`,
        title: headline(fm.intro),
    });
}
