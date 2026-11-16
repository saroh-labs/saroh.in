import { DevelopersPage } from "@saroh/marketing/feature-pages/developers-page";
import { notFound } from "next/navigation";

import { JsonLd } from "@/components/shared/json-ld";
import { DEVELOPERS, docsHref } from "@/content/developers";
import { featuresOff } from "@/lib/feature-switches";
import { StartLink } from "@/lib/page-site";
import { pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";

const entry = pageOf("/developers");

export const metadata = pageMetadata(entry);

/**
 * /developers on saroh.tech (owner, 16 Nov 2026, #13): saroh.in's page, the
 * Global API address and demos. A 404 while `NEXT_PUBLIC_DEVELOPERS` is off,
 * and unlinked too (`lib/nav.ts`); its docs links follow `NEXT_PUBLIC_DOCS`.
 */
export default function DevelopersRoute() {
    const off = featuresOff();
    if (off.includes("developers")) notFound();
    return (
        <>
            <JsonLd data={pageSchema(entry)} />
            <DevelopersPage
                words={DEVELOPERS}
                docsHref={docsHref}
                docsHost=" docs.saroh.tech"
                start={(src, variant) => (
                    <StartLink src={src} variant={variant} />
                )}
                docsOn={!off.includes("docs")}
                aiAppsOn={!off.includes("ai-apps")}
            />
        </>
    );
}
