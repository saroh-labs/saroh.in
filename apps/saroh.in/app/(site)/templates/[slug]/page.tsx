import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHero } from "@/components/resources/page-hero";
import { CtaLink } from "@/components/shared/buttons/cta-link";
import { JsonLd } from "@/components/shared/layout/json-ld";
import { TemplateCard } from "@/components/templates/template-card";
import { TemplateViewer } from "@/components/templates/template-viewer";
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
import { sentenceList } from "@/lib/format/list";
import { resourcesContext } from "@/lib/resources-context";
import { Container } from "@saroh/marketing/container";

import { pageMetadata, pageTitle } from "@/lib/seo";
import { breadcrumbLd } from "@/lib/structured-data";
import { templatesLive } from "@/lib/templates-live";
import { ClosingCTA } from "@saroh/marketing/kit/closing-cta";
import { StickyBar } from "@saroh/marketing/kit/sticky-bar";
import { SwipeRow } from "@saroh/marketing/kit/swipe-row";
import { SectionHeading } from "@saroh/marketing/section-heading";

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
    const notes = [
        detail.notes.pages(t),
        detail.notes.uses(t),
        detail.notes.look(t),
    ];
    const facts: [string, string][] = [
        [detail.facts.pages, sentenceList(t.pages.map((p) => p.title))],
        [
            detail.facts.uses,
            t.uses.length ? sentenceList(t.uses) : "Your website",
        ],
        [detail.facts.type, t.type],
        [detail.facts.colours, sentenceList(t.colourways)],
    ];
    const related = relatedTemplates(t);

    return (
        <>
            {/* The trail the page draws: Templates / {name}. */}
            <JsonLd
                data={breadcrumbLd([
                    { name: detail.crumb, path: TEMPLATES_PATH },
                    { name: t.name, path: t.href },
                ])}
            />
            <PageHero
                crumbs={[
                    { name: detail.crumb, href: TEMPLATES_PATH },
                    { name: t.name },
                ]}
                title={`${t.name}: ${t.idea}.`}
                mark={`${t.name}:`}
                lead={t.description}
                className="pb-8 min-[760px]:pb-12"
            >
                <div className="grid justify-items-start gap-3">
                    <span id="template-cta">
                        <CtaLink
                            src={`templates-${t.slug}`}
                            template={save}
                            size="kit"
                        />
                    </span>
                    <span className="max-w-[60ch] text-[13px] text-muted-foreground">
                        {detail.saveNote(t.name)}
                    </span>
                </div>
            </PageHero>

            <Container>
                <TemplateViewer
                    template={t}
                    labels={{
                        pages: detail.switcher,
                        device: "Show it on",
                        desktop: detail.desktop,
                        phone: detail.phone,
                    }}
                />
                <p className="m-0 pt-4 text-[13px] text-muted-foreground">
                    {templatesPage.sampleNote}
                </p>
            </Container>

            <Container
                as="section"
                aria-label="About this template"
                className="pt-[72px] min-[760px]:pt-[96px]"
            >
                <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-x-10 gap-y-8 p-0">
                    {notes.map((n) => (
                        <li
                            key={n.title}
                            className="grid content-start gap-2 border-t border-border pt-5"
                        >
                            <h2 className="m-0 font-display text-mk-kit-h3 font-bold">
                                {n.title}
                            </h2>
                            <p className="m-0 text-[16px] leading-[1.6] text-mk-copy [text-wrap:pretty]">
                                {n.body}
                            </p>
                        </li>
                    ))}
                </ul>
                <dl className="m-0 mt-12 grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-6 rounded-mk-card border border-border bg-card p-6">
                    {facts.map(([term, value]) => (
                        <div key={term} className="grid content-start gap-1">
                            <dt className="text-[13px] text-muted-foreground">
                                {term}
                            </dt>
                            <dd className="m-0 text-[15px] font-medium">
                                {value}
                            </dd>
                        </div>
                    ))}
                </dl>
            </Container>

            {related.length > 0 ? (
                <Container
                    as="section"
                    aria-labelledby="related"
                    className="grid grid-cols-[minmax(0,1fr)] gap-10 pt-[72px] min-[760px]:pt-[120px]"
                >
                    <SectionHeading
                        id="related"
                        title={detail.related}
                        size="kit-h2"
                    />
                    <SwipeRow label={detail.related}>
                        {related.map((r) => (
                            <TemplateCard
                                key={r.slug}
                                template={r}
                                previewLabel={templatesPage.preview}
                                headingLevel={3}
                            />
                        ))}
                    </SwipeRow>
                </Container>
            ) : null}

            <ClosingCTA
                id="template-start"
                className="mt-[72px] min-[760px]:mt-[120px]"
                title={
                    open
                        ? detail.band.after(t.name)
                        : detail.band.before(t.name)
                }
                primary={
                    <CtaLink
                        src={`templates-${t.slug}-band`}
                        template={save}
                        size="kit"
                    />
                }
                note={templatesPage.band.body}
            />

            <StickyBar watch="template-cta">
                <CtaLink
                    src={`templates-${t.slug}-sticky`}
                    template={save}
                    size="kit"
                />
            </StickyBar>
        </>
    );
}
