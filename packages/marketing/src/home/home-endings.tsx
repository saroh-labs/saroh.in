import type { ReactNode } from "react";

import type { FaqItem } from "../content/types";
import { PlanLine } from "../kit/plan-line";
import { Container } from "../layout/container";
import { TextLink } from "../links/text-link";
import { FaqItems } from "../sections/faq";
import { Fold } from "./fold";
import type { HomeWords } from "./words";

/** How many questions a phone shows before "All questions". */
const PHONE_FIRST = 3;

/**
 * "Stays yours" in one line, with its story (/features' `#yours`) and every
 * feature (/features) a link away.
 */
export function YoursLine({
    words: home,
}: {
    words: Pick<HomeWords, "yours" | "featuresEyebrow"> & {
        /** "All features", the nav's word for /features. */
        allFeatures: string;
    };
}) {
    // The 12-feature list that was folded here is the Features menu and
    // /features already: a hidden copy on the landing (owner, 16 Nov 2026, #14).
    return (
        <Container as="section" aria-label={home.featuresEyebrow}>
            <div className="border-b border-border py-8 min-[760px]:py-12">
                <p className="m-0 flex flex-wrap items-center gap-x-6 gap-y-2 text-[17px] leading-normal text-foreground min-[760px]:text-[20px]">
                    {home.yours.line}
                    <span className="flex flex-wrap gap-x-6 gap-y-1">
                        <TextLink
                            href="/features#yours"
                            tone="ink"
                            arrow
                            className="text-[16px] min-[760px]:text-[18px]"
                        >
                            {home.yours.link}
                        </TextLink>
                        <TextLink
                            href="/features"
                            tone="ink"
                            arrow
                            className="text-[16px] min-[760px]:text-[18px]"
                        >
                            {home.allFeatures}
                        </TextLink>
                    </span>
                </p>
            </div>
        </Container>
    );
}

/**
 * The endings (`#pricing`, `#faq`), side by side on desk: plans in one
 * line, then every question in the markup. A phone shows the first three
 * and folds the rest under "All questions" (CSS only: the rest stay in the
 * HTML, and the FAQPage data sends them all).
 */
export function PlansAndQuestions({
    words: home,
    compareHref = "/pricing",
    planLede,
    planLine,
    start,
    faq,
}: {
    words: Pick<HomeWords, "plans" | "faqTitle" | "allQuestions" | "askUs">;
    /** Where "Compare plans" goes. */
    compareHref?: string;
    /** The free-plan line, from the catalogue where there is one. */
    planLede: string;
    /** The plan line; null before launch (Gate W: no plan, no Pricing link). */
    planLine: ReactNode | null;
    start: ReactNode;
    faq: readonly FaqItem[];
}) {
    return (
        <Container
            as="section"
            aria-label={`${home.plans.title} ${home.faqTitle}`}
            className="grid gap-8 pt-8 min-[760px]:gap-11 min-[760px]:pt-[72px] min-[960px]:grid-cols-[minmax(0,470px)_1fr] min-[960px]:gap-24"
        >
            {/* `#pricing` only once Pricing is open (Gate W): nothing links here before. */}
            <div id={planLine ? "pricing" : undefined} className="scroll-mt-24">
                <h2 className="m-0 font-display text-mk-kit-h2 font-bold max-[759px]:sr-only">
                    {home.plans.title}
                </h2>
                <p className="m-0 mt-4 text-mk-kit-lead text-mk-copy max-[759px]:hidden">
                    {planLede}
                </p>
                {planLine ? (
                    <PlanLine
                        compare={{
                            label: home.plans.compare,
                            href: compareHref,
                        }}
                        className="text-[17px] text-foreground max-[759px]:min-h-16 max-[759px]:rounded-mk-card max-[759px]:border max-[759px]:border-border max-[759px]:bg-card max-[759px]:px-4 min-[760px]:mt-7 min-[760px]:text-[18px]"
                    >
                        {planLine}
                    </PlanLine>
                ) : (
                    <p className="m-0 text-[17px] text-mk-copy min-[760px]:hidden">
                        {planLede}
                    </p>
                )}
                <div className="mt-6 max-[759px]:hidden">{start}</div>
            </div>
            <div id="faq" className="group/faq scroll-mt-24">
                <h2
                    id="faq-title"
                    className="m-0 mb-4 font-display text-mk-kit-h2 font-bold"
                >
                    {home.faqTitle}
                </h2>
                <FaqItems items={[...faq.slice(0, PHONE_FIRST)]} />
                {faq.length > PHONE_FIRST ? (
                    <>
                        <Fold
                            data-more
                            summary={home.allQuestions}
                            chevron
                            className="border-b border-border py-2 min-[760px]:hidden [&[open]]:hidden"
                        />
                        <div className="max-[759px]:hidden max-[759px]:group-has-[[data-more][open]]/faq:block [&>div]:border-t-0">
                            <FaqItems items={[...faq.slice(PHONE_FIRST)]} />
                        </div>
                    </>
                ) : null}
                <p className="m-0 mt-3.5 text-[16px] text-mk-copy">
                    {home.askUs.lead}{" "}
                    <TextLink href="/contact" tone="ink" arrow>
                        {home.askUs.link}
                    </TextLink>
                </p>
            </div>
        </Container>
    );
}
