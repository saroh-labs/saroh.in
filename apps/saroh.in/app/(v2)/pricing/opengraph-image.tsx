import { PRICING_COPY } from "@/content/pricing";
import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "@/lib/og-card";

/** Pricing's share card. Words only: no price is ever drawn into an image. */
export const alt = `Saroh pricing: ${PRICING_COPY.title}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
    return ogCard({ eyebrow: PRICING_COPY.eyebrow, title: PRICING_COPY.title });
}
