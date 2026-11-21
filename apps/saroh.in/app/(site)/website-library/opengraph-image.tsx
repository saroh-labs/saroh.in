import { LIBRARY } from "@/content/website-library";
import { libraryLive } from "@/lib/library-live";
import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "@/lib/og-card";
import { resourcesContext } from "@/lib/resources-context";

/** The library's share card; a 404 while the page isn't shown, as the page is. */
export const alt = `Saroh: ${LIBRARY.title}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
    if (!libraryLive(resourcesContext())) {
        return new Response(null, { status: 404 });
    }
    return ogCard({
        eyebrow: `Resources · ${LIBRARY.name}`,
        title: LIBRARY.title,
    });
}
