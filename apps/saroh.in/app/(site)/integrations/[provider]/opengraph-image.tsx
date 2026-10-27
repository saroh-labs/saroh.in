import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "@/lib/og-card";
import { INTEGRATION_CARDS } from "@/lib/og-cards.gen";

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
    const fm = INTEGRATION_CARDS[provider];
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
    const fm = INTEGRATION_CARDS[provider];
    if (!fm) return ogCard({ title: "Saroh" });
    return ogCard({
        eyebrow: `Integrations · ${fm.name}`,
        title: headline(fm.intro),
    });
}
