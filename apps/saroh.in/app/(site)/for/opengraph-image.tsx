import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "@/lib/og-card";

/** The /for hub's share card. */
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Saroh for your kind of business";

export default function Image() {
    return ogCard({ eyebrow: "Solutions", title: alt });
}
