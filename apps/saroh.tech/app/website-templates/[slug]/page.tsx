import { TemplateDetail } from "@saroh/marketing/templates/template-detail";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JsonLd } from "@/components/shared/json-ld";
import {
    websiteTemplateDetail as detail,
    galleryTemplate,
    galleryTemplates,
    relatedTemplates,
    WEBSITE_TEMPLATES_PATH,
    websiteTemplatesPage,
} from "@/content/website-templates";
import { featuresOff } from "@/lib/feature-switches";
import { StartLink } from "@/lib/page-site";
import { pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { PAGES } from "@/lib/site-map";

/**
 * One website template on saroh.tech, as saroh.in's `/templates/[slug]`:
 * "{Name}: {idea}.", its pages drawn desktop or phone, three notes and the
 * facts from its manifest, the related templates and the band. A 404 while
 * `NEXT_PUBLIC_TEMPLATES` is off (DEC-135). No plan or price: none is named.
 */
export const dynamicParams = false;

export function generateStaticParams() {
    return galleryTemplates().map((t) => ({ slug: t.slug }));
}

interface Props {
    params: Promise<{ slug: string }>;
}

const entryOf = (slug: string) =>
    PAGES.find((p) => p.path === `${WEBSITE_TEMPLATES_PATH}/${slug}`);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const entry = entryOf(slug);
    return entry ? pageMetadata(entry) : {};
}

export default async function WebsiteTemplatePage({ params }: Props) {
    const { slug } = await params;
    const t = galleryTemplate(slug);
    const entry = entryOf(slug);
    if (!t || !entry || featuresOff().includes("templates")) notFound();
    const related = relatedTemplates(t);

    return (
        <>
            <JsonLd data={pageSchema(entry)} />
            <TemplateDetail
                template={t}
                related={related}
                words={detail}
                galleryHref={WEBSITE_TEMPLATES_PATH}
                sampleNote={websiteTemplatesPage.sampleNote}
                previewLabel={websiteTemplatesPage.preview}
                bandTitle={detail.band(t.name)}
                bandNote={websiteTemplatesPage.band.body}
                start={(where) => (
                    <StartLink
                        src={
                            where === "hero"
                                ? `website-templates-${t.slug}`
                                : `website-templates-${t.slug}-${where}`
                        }
                    />
                )}
            />
        </>
    );
}
