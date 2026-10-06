import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Container } from "@/components/v2/container";
import { CtaBand } from "@/components/v2/cta-band";
import { Faq } from "@/components/v2/faq";
import { SectionHeading } from "@/components/v2/section-heading";
import { SolutionHero } from "@/components/v2/solution/solution-hero";
import { SolutionPricing } from "@/components/v2/solution/solution-pricing";
import { SolutionSegment } from "@/components/v2/solution/solution-segment";
import { faqItems, solutionFaq } from "@/content/faq";
import { features } from "@/content/features";
import {
    isSolutionSlug,
    segmentViews,
    solutionHref,
    solutions,
} from "@/content/solutions";
import { SOLUTION_SLUGS } from "@/content/types";
import { LAUNCH_MODE } from "@/lib/links";
import {
    freePlanLine,
    planTeaserFootnote,
    solutionPlanTeasers,
} from "@/lib/plan-teasers";
import { readLivePricing } from "@/lib/pricing";
import { pageMetadata } from "@/lib/seo";

/**
 * `/solutions/shops`, `/solutions/gyms`, `/solutions/clinics` (plan U23): ONE
 * template, the Solutions design, fed by `content/solutions.ts`. Any other
 * slug is a 404. Prices and the free-plan line come from the published
 * pricing catalogue, refreshed every five minutes and on publish (KTD-10).
 */
export const dynamicParams = false;

export function generateStaticParams() {
    return SOLUTION_SLUGS.map((slug) => ({ slug }));
}

interface Props {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    if (!isSolutionSlug(slug)) return {};
    const s = solutions[slug];
    const title = `Saroh for ${s.longName.toLowerCase()}`;
    return pageMetadata({
        title,
        description: s.sub,
        path: solutionHref(slug),
    });
}

export default async function SolutionPage({ params }: Props) {
    const { slug } = await params;
    if (!isSolutionSlug(slug)) notFound();
    const s = solutions[slug];
    const segments = segmentViews(s.segments, (f) => features[f].name);
    const catalog = await readLivePricing();

    return (
        <>
            <SolutionHero solution={s} freeLine={freePlanLine(catalog)} />

            <Container as="section" aria-labelledby="changes-title">
                <SectionHeading
                    id="changes-title"
                    eyebrow="What changes"
                    title={s.changeTitle}
                    className="pt-[120px]"
                />
                <div className="grid gap-24 pt-16">
                    {segments.map((seg, i) => (
                        <SolutionSegment
                            key={seg.shot}
                            segment={seg}
                            reverse={i % 2 === 1}
                        />
                    ))}
                </div>
            </Container>

            {/* Plans show once the launch switch opens (Gate W). */}
            {LAUNCH_MODE === "open" ? (
                <SolutionPricing
                    title={s.pricing.title}
                    plans={solutionPlanTeasers(catalog, s.pricing)}
                    footnote={planTeaserFootnote(catalog)}
                    src={`solutions-${slug}-pricing`}
                />
            ) : null}

            <Faq items={faqItems(solutionFaq(s.faq))} className="pt-[120px]" />

            <CtaBand
                title={s.closer}
                src={`solutions-${slug}-band`}
                className="pt-[120px]"
            />
        </>
    );
}
