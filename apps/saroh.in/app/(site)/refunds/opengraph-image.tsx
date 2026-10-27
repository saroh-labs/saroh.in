import { REFUNDS } from "@/content/refunds";
import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "@/lib/og-card";

/** The Refund and Cancellation Policy's share card. */
export const alt = `Saroh: ${REFUNDS.title}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
    return ogCard({ eyebrow: "Legal", title: REFUNDS.title });
}
