import { TemplatesIndex } from "@saroh/marketing/templates/templates-index";
import { notFound } from "next/navigation";

import { JsonLd } from "@/components/shared/json-ld";
import {
    galleryTemplates,
    websiteTemplatesPage as page,
    WEBSITE_TEMPLATES_PATH,
} from "@/content/website-templates";
import { featuresOff } from "@/lib/feature-switches";
import { StartLink } from "@/lib/page-site";
import { pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { PAGES } from "@/lib/site-map";

const entry = PAGES.find((p) => p.path === WEBSITE_TEMPLATES_PATH);

export const metadata = entry ? pageMetadata(entry) : {};

/**
 * saroh.tech's website templates gallery (owner, 16 Nov 2026): saroh.in's
 * `/templates`, the same shared gallery, every page drawn from its data. A
 * 404 while `NEXT_PUBLIC_TEMPLATES` is off (DEC-135).
 */
export default function WebsiteTemplatesPage() {
    if (!entry || featuresOff().includes("templates")) notFound();
    const templates = galleryTemplates();
    return (
        <>
            <JsonLd data={pageSchema(entry)} />
            <TemplatesIndex
                crumbs={[{ name: "Home", href: "/" }, { name: page.name }]}
                title={page.title}
                lead={page.intro(templates)}
                templates={templates}
                allLabel={page.allChip}
                previewLabel={page.preview}
                sampleNote={page.sampleNote}
                bandTitle={page.band.title}
                bandNote={page.band.body}
                start={<StartLink src="website-templates-band" />}
            />
        </>
    );
}
