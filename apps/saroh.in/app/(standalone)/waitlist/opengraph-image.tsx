import { home } from "@/content/home";
import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "@/lib/og-card";

/** The waitlist's own share card (plan U26): the page people are sent to. */
export const alt = `Join the Saroh waitlist: ${home.headlineLabel}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
    return ogCard({
        eyebrow: "Join the waitlist",
        title: home.headlineLabel,
    });
}
