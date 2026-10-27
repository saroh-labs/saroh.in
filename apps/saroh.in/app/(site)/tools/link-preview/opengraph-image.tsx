import { linkPreview } from "@/content/link-preview";
import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "@/lib/og-card";

/** The link preview checker's own share card: the tool would mark it right. */
export const alt = `Saroh's ${linkPreview.title}: ${linkPreview.socialTitle}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
    return ogCard({
        eyebrow: `Free tool · ${linkPreview.title}`,
        title: linkPreview.socialTitle,
    });
}
