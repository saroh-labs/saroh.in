import { summarise } from "@/content/help";
import { helpArticles } from "@/lib/help-docs";
import { llmsText } from "@/lib/llms";
import { resourcesContext } from "@/lib/resources-context";
import { SITE_URL } from "@/lib/seo";

/**
 * `/llms.txt` (Resources plan U7): the Resources pages shown now, for
 * language models (`lib/llms.ts`). Static: a page dated for a day joins it
 * with the first deploy made on or after that day, as it joins the sitemap
 * (`app/layout.tsx`). Nothing rebuilds the site on a schedule.
 */
export const dynamic = "force-static";

export function GET(): Response {
    const articles = helpArticles().map((fm) => ({
        ...summarise(fm),
        description: fm.description,
    }));
    return new Response(llmsText(SITE_URL, resourcesContext(), articles), {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
}
