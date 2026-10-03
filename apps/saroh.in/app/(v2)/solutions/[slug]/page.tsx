import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Container } from "@/components/v2/container";
import { CtaBand } from "@/components/v2/cta-band";
import { Faq } from "@/components/v2/faq";
import { SectionHeading } from "@/components/v2/section-heading";
import { SolutionHero } from "@/components/v2/solution/solution-hero";
import { SolutionSegment } from "@/components/v2/solution/solution-segment";
import { faqItems, solutionFaq } from "@/content/faq";
import { features } from "@/content/features";
import { FREE_PLAN_LINE } from "@/content/home";
import {
    isSolutionSlug,
    segmentViews,
    solutionHref,
    solutions,
} from "@/content/solutions";
import { SOLUTION_SLUGS } from "@/content/types";
import { pageMetadata } from "@/lib/seo";

/**
 * `/solutions/shops`, `/solutions/gyms`, `/solutions/clinics` (plan U23): ONE
 * template, the Solutions design, fed by `content/solutions.ts`. Any other
 * slug is a 404. No plan section: no page names a plan's price, limits or
 * contents until Pricing is published.
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

    return (
        <>
            <SolutionHero solution={s} freeLine={FREE_PLAN_LINE} />

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

            <Faq items={faqItems(solutionFaq(s.faq))} className="pt-[120px]" />

            <CtaBand
                title={s.closer}
                src={`solutions-${slug}-band`}
                className="pt-[120px]"
            />
        </>
    );
}
