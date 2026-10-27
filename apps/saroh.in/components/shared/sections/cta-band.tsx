import { cn } from "@/lib/cn";

import { CTA_BAND } from "@/content/home";
import type { PlanId } from "@/lib/links";

import { HeroActions } from "../buttons/hero-actions";
import { Container } from "../layout/container";

/**
 * The dark band every page closes with: the page's own title, the shared
 * body, the Saffron start button and "No card needed to start." The "See it
 * in action · 2 min" button shows only once a tour video is configured
 * (KTD-12, deviation D-3). The Templates pages pass their `template` (the
 * start button saves it) and `note={null}` (DEC-195, V4).
 */
export function CtaBand({
    title,
    src,
    plan,
    template,
    body = CTA_BAND.body,
    note = CTA_BAND.note,
    className,
}: {
    title: string;
    /** Analytics source for the start button, e.g. `home-band`. */
    src: string;
    plan?: PlanId;
    /** A gallery template the start button saves (`cta`'s `template`). */
    template?: { slug: string; name: string };
    body?: string;
    /** The line under the buttons; null for none. */
    note?: string | null;
    /** The space above, where a design draws it other than 110px. */
    className?: string;
}) {
    return (
        <Container className={cn("pt-[110px]", className)}>
            <div className="flex flex-wrap items-end justify-between gap-10 rounded-mk-band bg-foreground p-mk-band text-background">
                <div className="grid flex-[1_1_420px] gap-4">
                    <h2 className="m-0 font-display text-mk-band font-bold [text-wrap:balance]">
                        {title}
                    </h2>
                    <p className="m-0 max-w-[46ch] text-mk-band-body text-mk-on-ink [text-wrap:pretty]">
                        {body}
                    </p>
                </div>
                <div className="grid justify-items-start gap-3">
                    <HeroActions
                        src={src}
                        plan={plan}
                        template={template}
                        onInk
                    />
                    {note === null ? null : (
                        <span className="text-mk-note text-mk-on-ink-muted">
                            {note}
                        </span>
                    )}
                </div>
            </div>
        </Container>
    );
}
