import { CUSTOMERS } from "@/content/customers";
import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "@/lib/og-card";

/** The customers page's share card. */
export const alt = `Saroh: ${CUSTOMERS.title}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
    return ogCard({ eyebrow: "For customers", title: CUSTOMERS.title });
}
