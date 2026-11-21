import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LibraryView } from "@/components/library/library-view";
import { CtaLink } from "@/components/shared/buttons/cta-link";
import { JsonLd } from "@/components/shared/layout/json-ld";
import { linkShown } from "@/content/resources";
import { LIBRARY, LIBRARY_PATH } from "@/content/website-library";
import { libraryGroups } from "@/lib/library";
import { libraryLive } from "@/lib/library-live";
import { resourcesContext } from "@/lib/resources-context";
import { pageMetadata, pageTitle } from "@/lib/seo";
import { breadcrumbLd } from "@/lib/structured-data";
import { LibraryIndex } from "@saroh/marketing/library/library-index";

export const metadata: Metadata = pageMetadata({
    title: pageTitle(LIBRARY.seoTitle),
    socialTitle: LIBRARY.name,
    description: LIBRARY.seoDescription,
    path: LIBRARY_PATH,
});

/**
 * The website library (DEC-228, plan 2026-11-18-001 U11; board LPHome): one
 * page, every block a merchant's site is made of, with its layouts and a
 * live preview in the toolbar's look, colours and component styles. Per-block
 * pages come later (owner, 18 Nov).
 *
 * A 404 while `NEXT_PUBLIC_WEBSITE_LIBRARY` is off, and then linked nowhere
 * (`content/resources.ts`).
 */
export default function WebsiteLibraryRoute() {
    const ctx = resourcesContext();
    if (!libraryLive(ctx)) notFound();
    return (
        <>
            <JsonLd
                data={breadcrumbLd([
                    { name: "Resources" },
                    { name: LIBRARY.name, path: LIBRARY_PATH },
                ])}
            />
            <LibraryIndex
                crumbs={[{ name: LIBRARY.name }]}
                words={LIBRARY}
                blocks={<LibraryView groups={libraryGroups()} />}
                templatesHref={
                    linkShown("/templates", ctx) ? "/templates" : undefined
                }
                start={<CtaLink src="library" size="kit" />}
            />
        </>
    );
}
