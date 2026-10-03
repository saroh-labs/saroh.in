import { cn } from "@/lib/cn";

import type { Feature } from "@/content/types";

import { Container } from "../container";
import { ScreenshotFrame } from "../screenshot-frame";
import { SectionHeading } from "../section-heading";

/**
 * "How it works": the page's title, then each step beside its screenshot,
 * alternating sides (text left on the first, right on the second…). A step
 * is a numbered Saffron ring (40px inside its 2px line, as drawn), its title, body and the business it is shown
 * at. Below 788px the two halves wrap, text above the shot.
 */
export function FeatureSteps({ feature }: { feature: Feature }) {
    const titleId = "how-it-works";
    return (
        <section aria-labelledby={titleId}>
            <Container className="pt-[120px]">
                <SectionHeading
                    id={titleId}
                    eyebrow="How it works"
                    title={feature.howTitle}
                />
            </Container>
            <Container as="ol" className="grid list-none gap-[88px] pt-14">
                {feature.steps.map((step, i) => (
                    <li
                        key={step.title}
                        className={cn(
                            "flex flex-wrap items-center gap-12",
                            i % 2 === 1 && "flex-row-reverse",
                        )}
                    >
                        <div className="grid flex-[1_1_320px] content-center gap-3">
                            <span
                                aria-hidden
                                className="grid size-11 place-items-center rounded-full border-2 border-brand-500 font-display text-[17px] font-bold text-brand-700"
                            >
                                {i + 1}
                            </span>
                            <h3 className="m-0 font-display text-mk-h3 font-bold [text-wrap:balance]">
                                <span className="sr-only">Step {i + 1}: </span>
                                {step.title}
                            </h3>
                            <p className="m-0 text-mk-body text-mk-copy [text-wrap:pretty]">
                                {step.body}
                            </p>
                            <span className="text-mk-note text-muted-foreground">
                                {step.who}
                            </span>
                        </div>
                        <ScreenshotFrame
                            shot={step.shot}
                            alt={step.alt}
                            zoomable
                            sizes="(min-width: 1280px) 680px, 100vw"
                            className="flex-[1.4_1_420px]"
                        />
                    </li>
                ))}
            </Container>
        </section>
    );
}
