import type { PublishContext } from "@/content/resources";
import { isShown, RESOURCE_PAGES } from "@/content/resources";

/** Whether the QR code maker is shown at `ctx` (its `publishOn` in `content/resources.ts`). */
export function qrCodeMakerLive(ctx: PublishContext): boolean {
    const page = RESOURCE_PAGES.find((p) => p.id === "qr-code-maker");
    return !!page && isShown(page, ctx);
}
