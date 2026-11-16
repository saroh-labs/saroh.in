import { Container } from "@saroh/marketing/container";
import { ClosingCTA } from "@saroh/marketing/kit/closing-cta";
import { PageHero } from "@saroh/marketing/page-hero";
import { galleryChips } from "@saroh/marketing/templates/gallery";
import { TemplatesGallery } from "@saroh/marketing/templates/templates-gallery";
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
            <PageHero
                crumbs={[{ name: "Home", href: "/" }, { name: page.name }]}
                title={page.title}
                lead={page.intro(templates)}
                className="pb-8 min-[760px]:pb-10"
            />
            <Container>
                <TemplatesGallery
                    templates={templates}
                    chips={galleryChips(templates)}
                    allLabel={page.allChip}
                    previewLabel={page.preview}
                />
                <p className="m-0 pt-8 text-[13px] text-muted-foreground">
                    {page.sampleNote}
                </p>
            </Container>
            <ClosingCTA
                id="templates-start"
                className="mt-[72px] min-[760px]:mt-[120px]"
                title={page.band.title}
                primary={<StartLink src="website-templates-band" />}
                note={page.band.body}
            />
        </>
    );
}
