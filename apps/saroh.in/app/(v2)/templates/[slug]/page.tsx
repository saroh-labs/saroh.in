import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Container } from "@/components/v2/container";
import { CtaLink } from "@/components/v2/cta-link";
import { Breadcrumbs } from "@/components/v2/resources/breadcrumbs";
import { TemplateCard } from "@/components/v2/templates/template-card";
import { TemplateViewer } from "@/components/v2/templates/template-viewer";
import { TemplatesBand } from "@/components/v2/templates/templates-band";
import type { GalleryTemplate } from "@/content/templates";
import {
    templateDetail as detail,
    earlyAccessOpen,
    galleryTemplate,
    galleryTemplates,
    listWords,
    relatedTemplates,
    TEMPLATES_PATH,
    templatesPage,
} from "@/content/templates";
import { resourcesContext } from "@/lib/resources-context";
import { pageMetadata } from "@/lib/seo";
import { templatesLive } from "@/lib/templates-live";

/**
 * One template (Resources plan U6, industry templates plan U13; design
 * "Saroh Resources - Templates - Gym"): the breadcrumb, "{Name}: {idea}.",
 * what it is and the button that saves it on the waitlist; its pages in a
 * browser frame, desktop or phone; three notes and the facts, all from the
 * template's manifest; the templates built around the same kind; the band.
 *
 * No plan or price row: the repo is public and the design's "Plan" fact is
 * cut. Every template is built at build time; any other slug, or any while
 * the gallery isn't published (17 Oct, KTD-2), is a 404.
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
        title: `${t.name} website template — Saroh`,
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
        [detail.facts.pages, listWords(t.pages.map((p) => p.title))],
        [detail.facts.uses, t.uses.length ? listWords(t.uses) : "Your website"],
        [detail.facts.type, t.type],
        [detail.facts.colours, listWords(t.colourways)],
    ];
    const related = relatedTemplates(t);

    return (
        <>
            <Container as="header" className="grid gap-6 pt-14">
                <Breadcrumbs
                    crumbs={[
                        { name: detail.crumb, href: TEMPLATES_PATH },
                        { name: t.name },
                    ]}
                />
                <h1 className="m-0 max-w-[22ch] font-display text-[clamp(36px,6vw,56px)] font-bold leading-[1.02] tracking-[-0.045em] [text-wrap:balance]">
                    {t.name}: {t.idea}.
                </h1>
                <p className="m-0 max-w-[60ch] text-mk-lead text-mk-copy [text-wrap:pretty]">
                    {t.description}
                </p>
                <div className="grid justify-items-start gap-3">
                    <CtaLink src={`templates-${t.slug}`} template={save} />
                    <span className="max-w-[60ch] text-mk-note text-muted-foreground">
                        {open
                            ? detail.saveNote.after(t.name)
                            : detail.saveNote.before(t.name)}
                    </span>
                </div>
            </Container>

            <Container className="pt-12">
                <TemplateViewer
                    template={t}
                    labels={{
                        pages: detail.switcher,
                        device: "Show it on",
                        desktop: detail.desktop,
                        phone: detail.phone,
                    }}
                />
                <p className="m-0 pt-4 text-mk-note text-muted-foreground">
                    {templatesPage.sampleNote}
                </p>
            </Container>

            <Container
                as="section"
                aria-label="About this template"
                className="pt-16"
            >
                <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-x-10 gap-y-8 p-0">
                    {notes.map((n) => (
                        <li
                            key={n.title}
                            className="grid content-start gap-2 border-t border-border pt-5"
                        >
                            <h2 className="m-0 text-[18px] font-semibold tracking-[-0.01em]">
                                {n.title}
                            </h2>
                            <p className="m-0 text-mk-card-body text-mk-copy [text-wrap:pretty]">
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
                    className="pt-20"
                >
                    <h2
                        id="related"
                        className="m-0 font-display text-[clamp(26px,3.5vw,34px)] font-bold tracking-[-0.03em]"
                    >
                        {detail.related}
                    </h2>
                    <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-6 p-0 pt-8">
                        {related.map((r) => (
                            <li key={r.slug} className="grid min-w-0">
                                <TemplateCard
                                    template={r}
                                    previewLabel={templatesPage.preview}
                                    headingLevel={3}
                                />
                            </li>
                        ))}
                    </ul>
                </Container>
            ) : null}

            <TemplatesBand
                title={
                    open
                        ? detail.band.after(t.name)
                        : detail.band.before(t.name)
                }
                body={templatesPage.band.body}
                src={`templates-${t.slug}-band`}
                template={save}
            />
        </>
    );
}
