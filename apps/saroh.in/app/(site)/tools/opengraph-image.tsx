import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "@/lib/og-card";

/** The /tools hub's share card. */
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Free tools for small businesses in India";

export default function Image() {
    return ogCard({ eyebrow: "Free tools", title: alt });
}
