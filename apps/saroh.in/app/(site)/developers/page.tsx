import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DevelopersPage } from "@/components/developers/developers-page";
import { JsonLd } from "@/components/shared/layout/json-ld";
import { DEVELOPERS, DEVELOPERS_PATH } from "@/content/developers";
import { featuresOff } from "@/lib/feature-switches";
import { pageMetadata } from "@/lib/seo";
import { breadcrumbLd } from "@/lib/structured-data";

export const metadata: Metadata = pageMetadata({
    title: DEVELOPERS.seo.title,
    socialTitle: DEVELOPERS.seo.socialTitle,
    description: DEVELOPERS.seo.description,
    path: DEVELOPERS_PATH,
});

/**
 * /developers (plan 2026-11-13-002, U6): a 404 while `NEXT_PUBLIC_DEVELOPERS`
 * is off, and then unlinked too (`content/resources.ts`). The docs' links
 * follow `NEXT_PUBLIC_DOCS`.
 */
export default function DevelopersRoute() {
    const off = featuresOff();
    if (off.includes("developers")) notFound();
    return (
        <>
            <JsonLd
                data={breadcrumbLd([
                    { name: "Resources" },
                    { name: DEVELOPERS.name, path: DEVELOPERS_PATH },
                ])}
            />
            <DevelopersPage
                docsOn={!off.includes("docs")}
                aiAppsOn={!off.includes("ai-apps")}
            />
        </>
    );
}
