import { DevelopersPage } from "@saroh/marketing/feature-pages/developers-page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JsonLd } from "@/components/shared/json-ld";
import { DEVELOPERS, docsHref } from "@/content/developers";
import { featuresOff } from "@/lib/feature-switches";
import { StartLink } from "@/lib/page-site";
import { pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";

const off = () => featuresOff().includes("developers");

/** Off, the page isn't in the site map: no entry to read, and the route is a 404. */
export function generateMetadata(): Metadata {
    return off() ? {} : pageMetadata(pageOf("/developers"));
}

/**
 * /developers on saroh.tech (owner, 16 Nov 2026, #13): saroh.in's page, the
 * Global API address and demos. A 404 while `NEXT_PUBLIC_DEVELOPERS` is off,
 * and unlinked too (`lib/nav.ts`); its docs links follow `NEXT_PUBLIC_DOCS`.
 */
export default function DevelopersRoute() {
    if (off()) notFound();
    const switches = featuresOff();
    return (
        <>
            <JsonLd data={pageSchema(pageOf("/developers"))} />
            <DevelopersPage
                words={DEVELOPERS}
                docsHref={docsHref}
                docsHost=" docs.saroh.tech"
                start={(src, variant) => (
                    <StartLink src={src} variant={variant} />
                )}
                docsOn={!switches.includes("docs")}
                aiAppsOn={!switches.includes("ai-apps")}
            />
        </>
    );
}
