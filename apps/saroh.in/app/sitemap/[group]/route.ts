import { builtSitemapGroups, urlsetXml, xmlResponse } from "@/lib/sitemaps";

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
    const entries = group.endsWith(".xml")
        ? (await builtSitemapGroups()).get(group.slice(0, -4))
        : undefined;
    if (!entries) return new Response("Not found", { status: 404 });
    return xmlResponse(urlsetXml(entries));
}
