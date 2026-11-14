import { AppList } from "@saroh/marketing/app-list";
import { ChatExchange } from "@saroh/marketing/chat-exchange";
import { ComingList } from "@saroh/marketing/coming-list";
import { Container } from "@saroh/marketing/container";
import type { FeatureSlug } from "@saroh/marketing/content-types";
import { CtaBand } from "@saroh/marketing/cta-band";
import { FeaturePoints } from "@saroh/marketing/feature-points";
import { FeatureSteps } from "@saroh/marketing/feature-steps";
import { FeatureUsedBy } from "@saroh/marketing/feature-used-by";
import { FeatureWorksWith } from "@saroh/marketing/feature-works-with";
import { PointGrid } from "@saroh/marketing/point-grid";
import { ProductHero } from "@saroh/marketing/product-hero";
import { Section } from "@saroh/marketing/section";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { HeroActions } from "@/components/shared/hero-actions";
import { JsonLd } from "@/components/shared/json-ld";
import {
    featureHref,
    featureList,
    features,
    NOT_AVAILABLE_YET,
} from "@/content/features";
import { CTA_BAND } from "@/content/home";
import { AI_APP_CARDS } from "@/content/integrations";
import { shotView } from "@/content/shots";
import { solutionHref, solutions } from "@/content/solutions";
import { featuresOff } from "@/lib/feature-switches";
import { freePlanLine, readCatalog } from "@/lib/plans";
import { pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageAt } from "@/lib/site-map";

export const dynamicParams = false;

export function generateStaticParams() {
    // Only the shown features: a switched-off one is never built (404).
    return featureList.map((f) => ({ slug: f.slug }));
}

interface Props {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const page = pageAt(`/features/${slug}`);
    return page ? pageMetadata(page) : {};
}

/** A part that can't be used yet: saroh.in's planned row, never a promise. */
function NotYet({
    idPrefix,
    rows,
}: {
    idPrefix: string;
    rows: readonly { name: string; line: string }[];
}) {
    return (
        <ComingList
            idPrefix={idPrefix}
            mark={NOT_AVAILABLE_YET}
            groups={[{ key: "later", label: "Later", rows }]}
        />
    );
}

/**
 * saroh.in's feature template, section for section. A Limited page says what
 * works today, in place of the free-plan line, so a page carries one message. A Coming soon page says it in its headline and sub, and
 * its parts are planned rows, with no steps to follow. A hero or step in
 * another company's app is drawn (`ChatExchange`), as saroh.in draws it.
 * Website's templates section follows `NEXT_PUBLIC_TEMPLATES`, as words and
 * points: this site has no website template gallery to draw from.
 */
export default async function FeaturePage({ params }: Props) {
    const { slug } = await params;
    const page = pageAt(`/features/${slug}`);
    if (!page) notFound();
    const feature = features[slug as FeatureSlug];
    const coming = feature.state === "coming-soon";
    const limited = feature.state === "limited";
    const catalog = limited ? null : await readCatalog();
    const chat = feature.heroChat;

    return (
        <div data-page-type={page.type}>
            <JsonLd data={pageSchema(page)} />
            <ProductHero
                section={{ name: "Features", href: "/#features" }}
                name={feature.name}
                headline={feature.headline}
                sub={feature.sub}
                narrow
                actions={<HeroActions src={`feature-${slug}`} />}
                today={limited ? feature.worksToday : undefined}
                freeLine={limited ? undefined : freePlanLine(catalog)}
                shot={
                    chat
                        ? undefined
                        : shotView(feature.hero.shot, feature.hero.alt)
                }
            />
            {chat ? (
                <Container width="article" className="pt-14">
                    <ChatExchange words={chat} variant="hero" />
                </Container>
            ) : null}
            {coming ? (
                <>
                    <Section
                        titleId="how-it-works"
                        eyebrow="How it works"
                        title={feature.howTitle}
                        size="lg"
                        className="grid gap-14 pt-[120px]"
                    >
                        <NotYet
                            idPrefix="how"
                            rows={feature.steps.map((s) => ({
                                name: s.title,
                                line: s.body,
                            }))}
                        />
                    </Section>
                    <Section
                        titleId="what-it-does"
                        title="What else it will do"
                        className="grid gap-9 pt-[130px]"
                    >
                        <NotYet
                            idPrefix="what"
                            rows={feature.points.map((p) => ({
                                name: p.title,
                                line: p.body,
                            }))}
                        />
                    </Section>
                </>
            ) : (
                <>
                    <FeatureSteps
                        title={feature.howTitle}
                        steps={feature.steps.map((step) => {
                            // A step in another company's app is drawn, not captured.
                            if (step.chat) {
                                return {
                                    title: step.title,
                                    body: step.body,
                                    who: step.who,
                                    drawn: <ChatExchange words={step.chat} />,
                                };
                            }
                            const shot = shotView(step.shot, step.alt);
                            // `who` names the demo business in the picture.
                            return {
                                title: step.title,
                                body: step.body,
                                who: shot ? step.who : undefined,
                                shot,
                            };
                        })}
                    />
                    {feature.templates &&
                    !featuresOff().includes("templates") ? (
                        <Section
                            titleId="templates"
                            eyebrow="Templates"
                            title={feature.templates.title}
                            lead={feature.templates.lead}
                            className="grid gap-9 pt-[120px]"
                        >
                            <PointGrid points={feature.templates.points} />
                        </Section>
                    ) : null}
                    <FeaturePoints points={feature.points} />
                    {feature.apps ? (
                        <AppList words={feature.apps} apps={AI_APP_CARDS} />
                    ) : null}
                </>
            )}
            <FeatureWorksWith
                lead={feature.worksLead}
                items={feature.worksWith.map((f) => ({
                    href: featureHref(f),
                    title: features[f].name,
                    body: features[f].cardLine,
                }))}
            />
            {feature.usedBy.length > 0 ? (
                <FeatureUsedBy
                    items={feature.usedBy.map((s) => ({
                        href: solutionHref(s),
                        name: solutions[s].longName,
                    }))}
                />
            ) : null}
            <CtaBand
                title={feature.closer}
                body={CTA_BAND.body}
                note={CTA_BAND.note}
                actions={<HeroActions src={`feature-${slug}-band`} onInk />}
                className="pt-[120px]"
            />
        </div>
    );
}
