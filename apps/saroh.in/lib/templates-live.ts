import type { PublishContext } from "@/content/resources";
import { isShown, RESOURCE_PAGES } from "@/content/resources";

/**
 * Whether the Templates gallery is shown at `ctx`: its switch is on
 * (`NEXT_PUBLIC_TEMPLATES`, DEC-135) and its `publishOn` day has come
 * (`content/resources.ts`).
 */
export function templatesLive(ctx: PublishContext): boolean {
    const page = RESOURCE_PAGES.find((p) => p.id === "templates");
    return !!page && isShown(page, ctx);
}
