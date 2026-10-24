import { LAUNCH_MODE } from "@/lib/links";
import { readLivePricing } from "@/lib/pricing";
import { pricingMarkdown } from "@/lib/pricing-md";
import { SITE_URL } from "@/lib/seo";

/**
 * `/pricing.md` (#1187): the pricing page as Markdown (`lib/pricing-md.ts`).
 * Static, read from the published catalogue when the site is built, as
 * `/pricing` is; a publish starts a build. Before the launch switch opens
 * (DEC-136) the catalogue isn't read, so the file lists no prices.
 */
export const dynamic = "force-static";

export async function GET(): Promise<Response> {
    const catalog = LAUNCH_MODE === "open" ? await readLivePricing() : null;
    return new Response(pricingMarkdown(SITE_URL, catalog), {
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
}
