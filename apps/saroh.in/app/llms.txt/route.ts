import { summarise } from "@/content/help";
import { helpArticles } from "@/lib/help-docs";
import { llmsText } from "@/lib/llms";
import { resourcesContext } from "@/lib/resources-context";
import { SITE_URL } from "@/lib/seo";

/**
 * `/llms.txt` (Resources plan U7): the Resources pages shown now, for
 * language models (`lib/llms.ts`). Re-read every five minutes, so a page
 * dated today joins it on its day with no deploy (KTD-2), as the sitemap does.
 */
export const revalidate = 300;

export function GET(): Response {
    const articles = helpArticles().map((fm) => ({
        ...summarise(fm),
        description: fm.description,
    }));
    return new Response(llmsText(SITE_URL, resourcesContext(), articles), {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
}
