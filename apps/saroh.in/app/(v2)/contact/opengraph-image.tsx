import { CONTACT_PAGE } from "@/content/contact-page";
import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "@/lib/og-card";

/** Contact's share card. */
export const alt = `Contact Saroh: ${CONTACT_PAGE.title}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
    return ogCard({ eyebrow: CONTACT_PAGE.eyebrow, title: CONTACT_PAGE.title });
}
