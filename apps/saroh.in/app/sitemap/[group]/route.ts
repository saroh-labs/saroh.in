import { groupSitemapResponse } from "@saroh/marketing/sitemap-xml";

import { builtSitemapGroups } from "@/lib/sitemaps";

/**
 * `/sitemap/<group>.xml`: one group's pages (`lib/sitemaps.ts`), static at
 * build. Only groups with a page are built; any other address is a 404.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateStaticParams() {
    return [...(await builtSitemapGroups()).keys()].map((g) => ({
        group: `${g}.xml`,
    }));
}

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ group: string }> },
): Promise<Response> {
    const { group } = await params;
    return groupSitemapResponse(await builtSitemapGroups(), group);
}
