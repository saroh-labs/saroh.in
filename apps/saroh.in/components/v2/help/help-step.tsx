import Image from "next/image";

import type { HelpStep as Step } from "@/content/help";
import { stepId, stepNumber } from "@/content/help";
import { CAPTURED } from "@/content/shots.captured";

/**
 * One step of a Help article (design 2a): its number and title, what to
 * do, the real screen in the designs' frame with its caption, and a tip
 * where one is needed. A step whose control is named (`marker`) rings it in
 * Saffron (#F0A92B), at the place the capture measured (`mark`), over the
 * clean image; the ring is decoration, the words say what to press.
 *
 * The shot is always captured: `lib/help-docs.ts` refuses an article whose
 * step has none, so a missing one here is a broken build, not a state.
 */
export function HelpStep({ step, index }: { step: Step; index: number }) {
    const shot = (CAPTURED as Partial<typeof CAPTURED>)[step.shot];
    if (!shot) throw new Error(`Help step shot ${step.shot} is not captured`);
    const mark = step.marker ? shot.mark : undefined;
    return (
        <section
            aria-labelledby={stepId(index)}
            className="grid scroll-mt-6 gap-3.5"
        >
            <h2
                id={stepId(index)}
                className="m-0 flex items-baseline gap-3.5 font-display text-[26px] font-bold leading-[1.15] tracking-[-0.02em] [text-wrap:balance]"
            >
                <span className="font-mono text-[15px] font-normal tracking-normal text-brand-700">
                    {stepNumber(index)}
                </span>
                {step.title}
            </h2>
            <p className="m-0 text-[17px] leading-[1.7] text-mk-prose [text-wrap:pretty]">
                {step.body}
            </p>
            <figure className="m-0 grid gap-2">
                <div
                    data-shot={step.shot}
                    className="relative overflow-hidden rounded-xl border border-border bg-card shadow-mk-lift"
                >
                    <Image
                        src={shot.src}
                        alt={shot.alt}
                        width={shot.width}
                        height={shot.height}
                        sizes="(min-width: 900px) 680px, 100vw"
                        // Captured as WebP at their size already (≤ ~110 KB);
                        // the optimizer only re-encodes them, and under `next
                        // start` in CI one request in it can hang (DEV_LEARNINGS).
                        unoptimized
                        className="block h-auto w-full"
                    />
                    {mark ? (
                        <span
                            aria-hidden
                            data-marker
                            className="pointer-events-none absolute rounded-[10px] border-[3px] border-mk-saffron shadow-[0_0_0_4px_rgba(240,169,43,0.22)]"
                            style={{
                                left: `${mark.x * 100}%`,
                                top: `${mark.y * 100}%`,
                                width: `${mark.w * 100}%`,
                                height: `${mark.h * 100}%`,
                            }}
                        />
                    ) : null}
                </div>
                <figcaption className="text-mk-note text-muted-foreground">
                    {step.caption}
                </figcaption>
            </figure>
            {step.tip ? (
                <p className="m-0 border-l-2 border-border-strong pl-[18px] text-mk-faq leading-[1.6] text-mk-copy [text-wrap:pretty]">
                    {step.tip}
                </p>
            ) : null}
        </section>
    );
}
