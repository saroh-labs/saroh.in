import Link from "next/link";

import { cn } from "../cn";
import { Container } from "../layout/container";
import { Arrow } from "../links/arrow";
import { textLinkClasses } from "../links/text-link";
import { ScreenshotFrame } from "../media/screenshot-frame";
import type { ShotView } from "../media/shot";
import { SectionHeading } from "./section-heading";

/**
 * "How it works": the page's title, then each step beside its screenshot,
 * alternating sides (text left on the first, right on the second…). A step
 * is a numbered Saffron ring (40px inside its 2px line, as drawn), its title, body and the business it is shown
 * at. Below 788px the two halves wrap, text above the shot. A step with no
 * shot is its words at a width that reads, no empty frame; with no shot at all,
 * two columns of words, as a solution page's "What changes" does.
 *
 * Under the steps, a quiet "How to … →" link to each matching Help article
 * that is shown; none before Help opens.
 */
export function FeatureSteps({
    title,
    steps,
    help = [],
}: {
    title: string;
    steps: readonly {
        title: string;
        body: string;
        /** The demo business it is shown at, e.g. "Rye & Co. (demo bakery)". */
        who?: string;
        shot?: ShotView;
    }[];
    help?: readonly { href: string; label: string }[];
}) {
    const titleId = "how-it-works";
    return (
        <section aria-labelledby={titleId}>
            <Container className="pt-[120px]">
                <SectionHeading
                    id={titleId}
                    eyebrow="How it works"
                    title={title}
                />
            </Container>
            <Container
                as="ol"
                className={cn(
                    "grid list-none pt-14",
                    steps.some((step) => step.shot)
                        ? "gap-[88px]"
                        : cn(
                              "gap-x-14 gap-y-16 md:grid-cols-2",
                              steps.length === 3 && "lg:grid-cols-3",
                          ),
                )}
            >
                {steps.map((step, i) => (
                    <li
                        key={step.title}
                        className={cn(
                            "flex flex-wrap gap-12",
                            step.shot ? "items-center" : "items-start",
                            step.shot && i % 2 === 1 && "flex-row-reverse",
                        )}
                    >
                        <div
                            className={cn(
                                "grid content-center gap-3",
                                step.shot ? "flex-[1_1_320px]" : "max-w-[68ch]",
                            )}
                        >
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
                            {step.who ? (
                                <span className="text-mk-note text-muted-foreground">
                                    {step.who}
                                </span>
                            ) : null}
                        </div>
                        {step.shot ? (
                            <ScreenshotFrame
                                shot={step.shot}
                                zoomable
                                sizes="(min-width: 1280px) 680px, 100vw"
                                className="flex-[1.4_1_420px]"
                            />
                        ) : null}
                    </li>
                ))}
            </Container>
            {help.length > 0 ? (
                <Container className="flex flex-wrap gap-x-8 gap-y-3 pt-14">
                    {help.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={textLinkClasses({
                                className: "text-[15px] font-semibold",
                            })}
                        >
                            {link.label}
                            <Arrow />
                        </Link>
                    ))}
                </Container>
            ) : null}
        </section>
    );
}
