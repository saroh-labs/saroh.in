import { PRIVACY } from "@/content/privacy";
import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "@/lib/og-card";

/** The Privacy Policy's share card. */
export const alt = `Saroh: ${PRIVACY.title}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
    return ogCard({ eyebrow: "Legal", title: PRIVACY.title });
}
