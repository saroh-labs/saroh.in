import Link from "next/link";
import type { ReactNode } from "react";

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
        /** A drawing in place of the shot: another company's screen. */
        drawn?: ReactNode;
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
                    steps.some((step) => Boolean(step.shot ?? step.drawn))
                        ? "gap-[88px]"
                        : cn(
                              "gap-x-14 gap-y-16 md:grid-cols-2",
                              steps.length === 3 && "lg:grid-cols-3",
                          ),
                )}
            >
                {steps.map((step, i) => {
                    const pictured = Boolean(step.shot ?? step.drawn);
                    return (
                        <li
                            key={step.title}
                            className={cn(
                                "flex flex-wrap gap-12",
                                pictured ? "items-center" : "items-start",
                                pictured && i % 2 === 1 && "flex-row-reverse",
                            )}
                        >
                            <div
                                className={cn(
                                    "grid content-center gap-3",
                                    step.shot && !step.drawn
                                        ? HALF
                                        : pictured
                                          ? "flex-[1_1_320px]"
                                          : "max-w-[68ch]",
                                )}
                            >
                                <span
                                    aria-hidden
                                    className="grid size-11 place-items-center rounded-full border-2 border-brand-500 font-display text-[17px] font-bold text-brand-700"
                                >
                                    {i + 1}
                                </span>
                                <h3 className="m-0 font-display text-mk-h3 font-bold [text-wrap:balance]">
                                    <span className="sr-only">
                                        Step {i + 1}:{" "}
                                    </span>
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
                            {step.drawn ? (
                                <div className="min-w-0 flex-[1.4_1_420px]">
                                    {step.drawn}
                                </div>
                            ) : step.shot ? (
                                // Its half, the shot centred in it at its own width.
                                <div
                                    className={cn(HALF, "flex justify-center")}
                                >
                                    <ScreenshotFrame
                                        shot={step.shot}
                                        zoomable
                                        sizes={SHAPE[shapeOf(step.shot)].sizes}
                                        className={
                                            SHAPE[shapeOf(step.shot)].className
                                        }
                                    />
                                </div>
                            ) : null}
                        </li>
                    );
                })}
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

type ShotShape = "wide" | "upright" | "phone";

/**
 * How wide a step's shot is drawn in its half. A desk screen fills it; a
 * sheet taller than wide, or a phone screen, stood taller than the screen
 * that way, so each keeps its own width, centred (owner, 14 Nov 2026).
 */
const SHAPE: Record<ShotShape, { sizes: string; className: string }> = {
    wide: {
        sizes: "(min-width: 1280px) 560px, 100vw",
        className: "w-full",
    },
    // On a phone it is the screen's width less the gutters, not 480.
    upright: {
        sizes: "(max-width: 540px) calc(100vw - 32px), 480px",
        className: "w-full max-w-[480px]",
    },
    phone: { sizes: "300px", className: "w-full max-w-[300px]" },
};

/** A pictured step's two halves: equal, side by side until they wrap. */
const HALF = "min-w-0 flex-[1_1_380px]";

export function shapeOf(shot: ShotView): ShotShape {
    const { width, height } = shot.image;
    if (height > width * 1.6) return "phone";
    return height > width ? "upright" : "wide";
}
