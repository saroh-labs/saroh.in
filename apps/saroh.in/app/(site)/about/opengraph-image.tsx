import { ABOUT } from "@/content/about";
import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "@/lib/og-card";

/** About's share card. */
export const alt = `About Saroh: ${ABOUT.title}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
    return ogCard({ eyebrow: ABOUT.eyebrow, title: ABOUT.title });
}
