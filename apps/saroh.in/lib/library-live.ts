import type { PublishContext } from "@/content/resources";
import { isShown, RESOURCE_PAGES } from "@/content/resources";

/**
 * Whether the website library is shown at `ctx`: its switch is on
 * (`NEXT_PUBLIC_WEBSITE_LIBRARY`, DEC-228) and its `publishOn` day has come
 * (`content/resources.ts`).
 */
export function libraryLive(ctx: PublishContext): boolean {
    const page = RESOURCE_PAGES.find((p) => p.id === "website-library");
    return !!page && isShown(page, ctx);
}
