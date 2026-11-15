import { DEVELOPERS } from "@/content/developers";
import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "@/lib/og-card";

/** /developers' share card. */
export const alt = `Saroh developers: ${DEVELOPERS.headline}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
    return ogCard({ eyebrow: DEVELOPERS.name, title: DEVELOPERS.headline });
}
