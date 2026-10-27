import { helpHome } from "@/content/help";
import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "@/lib/og-card";

/** Help's share card: "Resources · Help" and its title. */
export const alt = `Saroh help: ${helpHome.title}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
    return ogCard({ eyebrow: "Resources · Help", title: helpHome.title });
}
