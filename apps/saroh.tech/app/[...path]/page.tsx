import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StubPage } from "@/components/shared/stub-page";
import { pageMetadata } from "@/lib/seo";
import { PAGES, pageAt } from "@/lib/site-map";

export const dynamicParams = false;

/** Every page without a route of its own yet; a built page gets its own folder. */
export function generateStaticParams() {
    return PAGES.filter((p) => p.path !== "/").map((p) => ({
        path: p.path.slice(1).split("/"),
    }));
}

const at = async (params: Promise<{ path: string[] }>) =>
    pageAt(`/${(await params).path.join("/")}`);

export async function generateMetadata({
    params,
}: {
    params: Promise<{ path: string[] }>;
}): Promise<Metadata> {
    const page = await at(params);
    return page ? pageMetadata(page) : {};
}

export default async function SitePageRoute({
    params,
}: {
    params: Promise<{ path: string[] }>;
}) {
    const page = await at(params);
    if (!page) notFound();
    return <StubPage page={page} />;
}
