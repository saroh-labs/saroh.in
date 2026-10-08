import type { PublishContext } from "@/content/resources";
import { isShown, RESOURCE_PAGES } from "@/content/resources";

/** Whether the Templates gallery is shown at `ctx` (its `publishOn` in `content/resources.ts`). */
export function templatesLive(ctx: PublishContext): boolean {
    const page = RESOURCE_PAGES.find((p) => p.id === "templates");
    return !!page && isShown(page, ctx);
}
