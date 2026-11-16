import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CtaLink } from "@/components/shared/buttons/cta-link";
import { JsonLd } from "@/components/shared/layout/json-ld";
import type { GalleryTemplate } from "@/content/templates";
import {
    templateDetail as detail,
    earlyAccessOpen,
    galleryTemplate,
    galleryTemplates,
    relatedTemplates,
    TEMPLATES_PATH,
    templatesPage,
} from "@/content/templates";
import { resourcesContext } from "@/lib/resources-context";

import { pageMetadata, pageTitle } from "@/lib/seo";
import { breadcrumbLd } from "@/lib/structured-data";
import { templatesLive } from "@/lib/templates-live";
import { TemplateDetail } from "@saroh/marketing/templates/template-detail";

/**
 * One template (Resources plan U6, industry templates plan U13; design
 * "Saroh Resources - Templates - Gym"): the breadcrumb, "{Name}: {idea}.",
 * what it is and the button that starts from it; its pages in a
 * browser frame, desktop or phone; three notes and the facts, all from the
 * template's manifest; the templates built around the same kind; the band.
 *
 * No plan or price row: the repo is public and the design's "Plan" fact is
 * cut. Every template is built at build time; any other slug, or any while
 * the gallery isn't published (17 Oct, KTD-2) or is switched off
 * (DEC-135), is a 404.
 */
export const dynamicParams = false;

export function generateStaticParams() {
    return galleryTemplates().map((t) => ({ slug: t.slug }));
}

interface Props {
    params: Promise<{ slug: string }>;
}

function liveTemplate(slug: string): GalleryTemplate | null {
    if (!templatesLive(resourcesContext())) return null;
    return galleryTemplate(slug) ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const t = liveTemplate(slug);
    if (!t) return {};
    return pageMetadata({
        title: pageTitle(`${t.name} website template`),
        socialTitle: `${t.name}: ${t.idea}.`,
        description: t.description,
        path: t.href,
    });
}

export default async function TemplatePage({ params }: Props) {
    const { slug } = await params;
    const t = liveTemplate(slug);
    if (!t) notFound();
    const open = earlyAccessOpen(resourcesContext().now);
    const save = { slug: t.slug, name: t.name };
    const related = relatedTemplates(t);
    const cta = (where: "hero" | "band" | "sticky") => (
        <CtaLink
            src={
                where === "hero"
                    ? `templates-${t.slug}`
                    : `templates-${t.slug}-${where}`
            }
            template={save}
            size="kit"
        />
    );

    return (
        <>
            {/* The trail the page draws: Templates / {name}. */}
            <JsonLd
                data={breadcrumbLd([
                    { name: detail.crumb, path: TEMPLATES_PATH },
                    { name: t.name, path: t.href },
                ])}
            />
            <TemplateDetail
                template={t}
                related={related}
                words={detail}
                galleryHref={TEMPLATES_PATH}
                sampleNote={templatesPage.sampleNote}
                previewLabel={templatesPage.preview}
                bandTitle={
                    open
                        ? detail.band.after(t.name)
                        : detail.band.before(t.name)
                }
                bandNote={templatesPage.band.body}
                start={cta}
            />
        </>
    );
}
