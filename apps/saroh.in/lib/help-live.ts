import type { PublishContext } from "@/content/resources";
import { isShown, RESOURCE_PAGES } from "@/content/resources";

/** Whether Help itself is shown at `ctx` (its `publishOn` in `content/resources.ts`). */
export function helpLive(ctx: PublishContext): boolean {
    const help = RESOURCE_PAGES.find((p) => p.id === "help");
    return !!help && isShown(help, ctx);
}
