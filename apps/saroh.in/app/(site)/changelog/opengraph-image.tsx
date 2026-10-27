import { CHANGELOG } from "@/content/changelog";
import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "@/lib/og-card";

/** The changelog's share card. */
export const alt = `Saroh changelog: ${CHANGELOG.sub}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
    return ogCard({ eyebrow: "Changelog", title: CHANGELOG.sub });
}
