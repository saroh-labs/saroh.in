import { TERMS } from "@/content/terms";
import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "@/lib/og-card";

/** The Terms of Service's share card. */
export const alt = `Saroh: ${TERMS.title}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
    return ogCard({ eyebrow: "Legal", title: TERMS.title });
}
