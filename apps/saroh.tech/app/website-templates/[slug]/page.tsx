import { Container } from "@saroh/marketing/container";
import { ClosingCTA } from "@saroh/marketing/kit/closing-cta";
import { StickyBar } from "@saroh/marketing/kit/sticky-bar";
import { SwipeRow } from "@saroh/marketing/kit/swipe-row";
import { PageHero } from "@saroh/marketing/page-hero";
import { SectionHeading } from "@saroh/marketing/section-heading";
import { sentenceList } from "@saroh/marketing/sentence-list";
import { TemplateCard } from "@saroh/marketing/templates/template-card";
import { TemplateViewer } from "@saroh/marketing/templates/template-viewer";
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
            <JsonLd data={pageSchema(entry)} />
            <PageHero
                crumbs={[
                    { name: detail.crumb, href: WEBSITE_TEMPLATES_PATH },
                    { name: t.name },
                ]}
                title={`${t.name}: ${t.idea}.`}
                mark={`${t.name}:`}
                lead={t.description}
                className="pb-8 min-[760px]:pb-12"
            >
                <div className="grid justify-items-start gap-3">
                    <span id="template-cta">
                        <StartLink src={`website-templates-${t.slug}`} />
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
                    {websiteTemplatesPage.sampleNote}
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
                                previewLabel={websiteTemplatesPage.preview}
                                headingLevel={3}
                            />
                        ))}
                    </SwipeRow>
                </Container>
            ) : null}

            <ClosingCTA
                visual={null}
                id="template-start"
                className="mt-[72px] min-[760px]:mt-[120px]"
                title={detail.band(t.name)}
                primary={<StartLink src={`website-templates-${t.slug}-band`} />}
                note={websiteTemplatesPage.band.body}
            />

            <StickyBar watch="template-cta">
                <StartLink src={`website-templates-${t.slug}-sticky`} />
            </StickyBar>
        </>
    );
}
