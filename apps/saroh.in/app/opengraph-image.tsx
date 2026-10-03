import { home } from "@/content/home";
import { HOME_OG_ALT, OG_CONTENT_TYPE, OG_SIZE, ogCard } from "@/lib/og-card";

/**
 * The site's share card (plan U26): Home's, and the one any page without its
 * own `opengraph-image` falls back to. Built once, at build time.
 */
export const alt = HOME_OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
    return ogCard({ eyebrow: home.eyebrow, title: home.headlineLabel });
}
