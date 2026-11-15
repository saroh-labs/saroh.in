import type { ReactNode } from "react";

import { home } from "@/content/home";
import type { FaqItem } from "@/content/types";

import { Container } from "@saroh/marketing/container";
import { FaqItems } from "@saroh/marketing/faq";
import { PlanLine } from "@saroh/marketing/kit/plan-line";
import { TextLink } from "@saroh/marketing/text-link";
import { Fold } from "./fold";
import { Tag } from "./tag";

/** How many questions a phone shows before "All questions". */
const PHONE_FIRST = 3;

/**
 * "Stays yours" in one line (its story is /features' `#yours`), and under
 * it every part of Saroh (`#features`, folded): the links the old grid had,
 * Dashboard first.
 */
export function YoursLine({
    features,
}: {
    features: readonly {
        href: string;
        name: string;
        body: string;
        isNew: boolean;
    }[];
}) {
    return (
        <Container as="section" aria-label={home.featuresEyebrow}>
            <div className="border-b border-border py-12">
                <p className="m-0 flex flex-wrap items-center gap-x-4 text-[17px] leading-normal text-foreground min-[760px]:text-[20px]">
                    {home.yours.line}
                    <TextLink
                        href="/features#yours"
                        tone="ink"
                        arrow
                        className="text-[16px] min-[760px]:text-[18px]"
                    >
                        {home.yours.link}
                    </TextLink>
                </p>
                <Fold
                    id="features"
                    summary={home.featuresEyebrow}
                    chevron
                    className="mt-4 scroll-mt-24"
                >
                    <p className="m-0 mt-2 font-display text-mk-kit-h3 font-bold">
                        {home.featuresTitle}
                    </p>
                    <ul className="m-0 mt-3 grid list-none gap-x-8 gap-y-1 p-0 min-[760px]:grid-cols-2 min-[1100px]:grid-cols-3">
                        {features.map((f) => (
                            <li key={f.href} className="py-1.5">
                                <TextLink href={f.href} tone="ink" arrow>
                                    {f.name}
                                </TextLink>
                                {f.isNew ? (
                                    <Tag tone="ok" className="ml-2">
                                        {home.newTag}
                                    </Tag>
                                ) : null}
                                <span className="block text-[15px] leading-snug text-mk-copy">
                                    {f.body}
                                </span>
                            </li>
                        ))}
                    </ul>
                </Fold>
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
    planLede,
    planLine,
    start,
    faq,
}: {
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
            className="grid gap-11 pt-12 min-[760px]:pt-[72px] min-[960px]:grid-cols-[minmax(0,470px)_1fr] min-[960px]:gap-24"
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
                            href: "/pricing",
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
